import { storage } from "./storage";
import {
  getBtcPrice, getBtc15mMarkets, getBalance, getOpenPositions,
  getSettledPositions, placeOrder, KalshiMarket
} from "./kalshi";
import type { EventEmitter } from "events";

export interface AIEngineState {
  running: boolean;
  lastRun: Date | null;
  btcPrice: number;
  balance: number;
  openPositions: any[];
  currentMarket: KalshiMarket | null;
  error: string | null;
  priceHistory: Array<{ time: number; price: number }>;
  activeSwingTrade: AISwingTrade | null;
  lastExitReason: string | null;
  lastAIDecision: AIDecision | null;
  aiCallCount: number;
  aiCostEstimate: number; // dollars
}

interface AISwingTrade {
  tradeId: number;
  orderId: string;
  ticker: string;
  side: "yes" | "no";
  count: number;
  entryPriceInCents: number;
  btcPriceAtEntry: number;
  openedAt: number;
  aiReasoning: string;
}

export interface AIDecision {
  action: "buy_yes" | "buy_no" | "skip";
  confidence: number; // 0-100
  size_multiplier: 0.5 | 1.0 | 1.5; // position sizing: half / normal / double
  reasoning: string;
  sources?: string[];
  timestamp: Date;
}

interface AIExitDecision {
  action: "hold" | "exit";
  reasoning: string;
  confidence: number;
}

const state: AIEngineState = {
  running: false,
  lastRun: null,
  btcPrice: 0,
  balance: 0,
  openPositions: [],
  currentMarket: null,
  error: null,
  priceHistory: [],
  activeSwingTrade: null,
  lastExitReason: null,
  lastAIDecision: null,
  aiCallCount: 0,
  aiCostEstimate: 0,
};

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let emitter: EventEmitter | null = null;
let priceHistory: number[] = [];

export function setEmitter(e: EventEmitter) { emitter = e; }
function broadcast(event: string, data: any) {
  if (emitter) emitter.emit("sse", { event, data });
}
export function getState(): AIEngineState { return { ...state }; }

// ── SHARED SYSTEM PROMPT ───────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are COMP\'D — an autonomous, contrarian prediction market trader on Kalshi specializing in BTC 15-minute binary price markets. You operate with complete independence. Your identity is the patient hunter: you wait in the shadows for the market to misprice a side heavily, then strike with conviction.

YOUR EDGE — THE CONTRARIAN LOW-PRICE ENTRY:
Your defining trade is this: when the market has priced one side at 10¢–25¢ with meaningful time remaining, that is where the real edge lives. A YES at 11¢ means the market gives only 11% odds. But if BTC is still within $200 of the strike with 4+ minutes left, that 11¢ is deeply mispriced — the true probability is far higher. You bought that trade. You rode it to 56¢. That is who you are.

The best setups share these traits:
- One side is priced extremely cheap (10¢–30¢) — the market has overcorrected
- BTC has enough time (3+ minutes) to mean-revert or hold its position
- Momentum has just turned or stabilized — the crowd is wrong about the direction
- No catastrophic macro catalyst driving the move (in that case, respect the tape)

WHAT YOU LEARNED FROM THE ALGO BOT (use as wisdom, not rules):
A proven algorithm on this same market found its sweet spot at:
- Entry when the contract price is between 30¢–70¢ with clear momentum confirmation
- Swing threshold: 0.03% BTC move to confirm directional signal
- 5-tick trend filter: momentum must be consistent across multiple readings, not a one-tick flicker
- Minimum 65% confidence before entry
- Per-market cooldown after losses — do not re-enter the same market on the same side after a thesis-broken exit
These are not your rules. They are the starting wisdom of a profitable algo. You can go beyond them — but you should understand why they work.

PATIENCE IS YOUR SUPERPOWER:
Most cycles, the right move is SKIP. A bad trade is worse than no trade. You are not paid to be busy — you are paid to be right.
- If the market is fairly priced (both sides 40¢–60¢) with no clear momentum signal: SKIP
- If BTC has been in a clean directional trend for multiple candles: respect it, don\'t fight it
- If you just exited a trade because the thesis was broken: do NOT re-enter the same market on the same side. The market told you something. Listen.
- Late-candle (under 2 minutes) is NOT a no-fly zone — it is where the most extreme mispricing lives. When one side is 10¢–25¢ with 60–120 seconds left and BTC is still near the strike, the market is panicking and WRONG. This is your hunting ground. Enter with conviction.
- If the favorable side is already priced above 80¢: no edge. The crowd already knows. Skip.

THE HIGH-VALUE ENTRY WINDOW:
The ideal entry looks like one of these:
1. CONTRARIAN CHEAP SIDE: One side at 10¢–30¢, BTC near strike, 3–8 minutes left, momentum stabilizing → buy the cheap side at 1.5x size
2. EARLY CANDLE MOMENTUM: Fresh candle (10+ min left), BTC has clear directional move of $150+, market has not yet priced it fully → ride the momentum at 1.0x
3. COMPRESSION PLAY: BTC is dead flat for 5+ minutes, strike is within $100, one side at 35¢–65¢ → the flat tape is about to break; position for the inevitable move at 0.5x

AVOID THESE TRAPS:
- Buying expensive YES (50¢–80¢) into a downtrend. The market knows BTC is dropping. You are not smarter than the price.
- Chasing after 3+ consecutive losses on the same side. The market is telling you something. Switch sides or skip entirely.
- Entering with 2 minutes or less left unless you have an exceptional thesis. Time is your risk buffer — don\'t trade without it.
- Synthetic bot spikes: a surge immediately after your entry is often other bots running the same signal. These revert in 60 seconds. Factor this into exit decisions.

POSITION SIZING PHILOSOPHY:
- size_multiplier 0.5 = cautious edge. You see something but it\'s not screaming at you.
- size_multiplier 1.0 = clear edge. The base case — you have a real signal.
- size_multiplier 1.5 = high conviction. Contrarian cheap side with strong thesis. This is the 11¢ trade. Load up.
- Never force 1.5x out of aggression. Reserve it for the setups that genuinely match the contrarian entry profile.

SELF-IMPROVEMENT:
Your recent trade history is always provided. Study your losses. If you keep entering YES and losing in a downtrend, that is a pattern. If your thesis-broken exits keep happening on the same side, the market is correcting you. Adapt. The best traders on this market are the ones who know when they are wrong fast and stop digging.

You have real-time web search. Use it — current BTC price action, breaking crypto news, whale moves, X/Twitter sentiment, exchange inflows/outflows, macro catalysts. A 10-minute-old catalyst can completely reprice a 15-minute candle.

You must respond with ONLY valid JSON and nothing else.`;

// ── PERPLEXITY ENTRY CALL ──────────────────────────────────────────────────
async function askPerplexityEntry(prompt: string, apiKey: string): Promise<AIDecision> {
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      max_tokens: 400,
      temperature: 0.2,
      search_recency_filter: "hour",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Perplexity API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const sources = data.citations ?? [];

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in AI response: " + content);

  const parsed = JSON.parse(jsonMatch[0]);

  // Track cost — sonar-pro ~$3/M input, $15/M output tokens
  const inputTokens = data.usage?.prompt_tokens ?? 500;
  const outputTokens = data.usage?.completion_tokens ?? 100;
  const cost = (inputTokens * 3 / 1_000_000) + (outputTokens * 15 / 1_000_000);
  state.aiCostEstimate += cost;
  state.aiCallCount++;

  // Validate size_multiplier — default 1.0 if missing or invalid
  const raw = parsed.size_multiplier;
  const sizeMultiplier: 0.5 | 1.0 | 1.5 =
    raw === 0.5 ? 0.5 : raw === 1.5 ? 1.5 : 1.0;

  return {
    action: parsed.action ?? "skip",
    confidence: Math.min(100, Math.max(0, parsed.confidence ?? 0)),
    size_multiplier: sizeMultiplier,
    reasoning: parsed.reasoning ?? "No reasoning provided",
    sources,
    timestamp: new Date(),
  };
}

// ── PERPLEXITY EXIT CALL ───────────────────────────────────────────────────
async function askPerplexityExit(
  swing: AISwingTrade,
  market: KalshiMarket,
  btcPrice: number,
  prices: number[],
  apiKey: string
): Promise<AIExitDecision> {
  const msToClose = new Date(market.close_time).getTime() - Date.now();
  const secsToClose = Math.round(msToClose / 1000);
  const minsToClose = Math.round(msToClose / 60000);

  const currentBid = swing.side === "yes" ? market.yes_bid : market.no_bid;
  const pnlPct = currentBid > 0
    ? (((currentBid - swing.entryPriceInCents) / swing.entryPriceInCents) * 100).toFixed(1)
    : "unknown";
  const pnlDollars = currentBid > 0
    ? (((currentBid - swing.entryPriceInCents) / 100) * swing.count).toFixed(2)
    : "unknown";

  const btcMoveFromEntry = swing.btcPriceAtEntry > 0
    ? `${btcPrice > swing.btcPriceAtEntry ? "+" : ""}$${(btcPrice - swing.btcPriceAtEntry).toLocaleString("en-US", { maximumFractionDigits: 0 })} since entry`
    : "unknown";

  const holdSeconds = Math.round((Date.now() - swing.openedAt) / 1000);

  // Parse strike from market title
  let strikePrice: number | null = null;
  if (market.title) {
    const dollarMatch = market.title.match(/\$([\d,]+)/);
    if (dollarMatch) strikePrice = parseInt(dollarMatch[1].replace(/,/g, ""));
  }
  const btcVsStrike = strikePrice
    ? (btcPrice > strikePrice
      ? `ABOVE strike by $${(btcPrice - strikePrice).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : `BELOW strike by $${(strikePrice - btcPrice).toLocaleString("en-US", { maximumFractionDigits: 0 })}`)
    : "strike unknown";

  const timeContext = minsToClose > 3
    ? `${minsToClose} minutes`
    : `${secsToClose} seconds`;

  // Recent price momentum
  const calcMove = (n: number) => {
    const s = prices.slice(-n);
    return s.length >= 2 ? (((s[s.length-1] - s[0]) / s[0]) * 100).toFixed(4) + "%" : "N/A";
  };

  const exitPrompt = `ACTIVE TRADE — HOLD OR EXIT?

You currently hold: ${swing.side.toUpperCase()} on ${market.title ?? swing.ticker}
Entry: ${swing.entryPriceInCents}¢ × ${swing.count} contracts | Held for ${holdSeconds}s
Current ${swing.side.toUpperCase()} bid: ${currentBid > 0 ? currentBid + "¢" : "no bid"}
P&L so far: ${pnlPct}% ($${pnlDollars})
BTC move since entry: ${btcMoveFromEntry}
BTC is currently ${btcVsStrike}

MARKET STATUS:
Market closes in: ${timeContext} — this is a 15-MINUTE binary market
Order book: YES ${market.yes_bid}¢ bid / ${market.yes_ask}¢ ask | NO ${market.no_bid}¢ bid / ${market.no_ask}¢ ask

RECENT PRICE MOMENTUM:
  Last 15s (3 ticks): ${calcMove(3)}
  Last 25s (5 ticks): ${calcMove(5)}
  Last 75s (15 ticks): ${calcMove(15)}

Entry reasoning was: "${swing.aiReasoning}"

DECISION: Should we EXIT now (sell the position) or HOLD to let it ride?

Consider:
- Is the original thesis still intact given where BTC is vs the strike?
- Is momentum working for us or against us?
- How much time is left — enough for price to move back in our favor if we're losing?
- Is there a clear edge in holding vs locking in this P&L now?
- Remember: bot markets often have a synthetic spike at entry. A small initial loss that reverses is common. But a big loss moving further away usually means the trade was wrong.

Respond with ONLY valid JSON:
{
  "action": "hold" | "exit",
  "reasoning": "<1-2 sentences — why hold or exit right now>",
  "confidence": <number 0-100>
}`;

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: exitPrompt }
      ],
      max_tokens: 200,
      temperature: 0.1, // very consistent on exit decisions
      search_recency_filter: "hour",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Perplexity exit API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";

  // Track cost
  const inputTokens = data.usage?.prompt_tokens ?? 300;
  const outputTokens = data.usage?.completion_tokens ?? 80;
  const cost = (inputTokens * 3 / 1_000_000) + (outputTokens * 15 / 1_000_000);
  state.aiCostEstimate += cost;
  state.aiCallCount++;

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Default to hold if AI response is unparseable — don't panic-exit
    return { action: "hold", reasoning: "Could not parse AI response — holding", confidence: 50 };
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    action: parsed.action === "exit" ? "exit" : "hold",
    reasoning: parsed.reasoning ?? "No reasoning",
    confidence: Math.min(100, Math.max(0, parsed.confidence ?? 50)),
  };
}

// ── BUILD ENTRY PROMPT ─────────────────────────────────────────────────────
function buildEntryPrompt(market: KalshiMarket, btcPrice: number, prices: number[], balance: number, recentTrades: any[]): string {
  const msToClose = new Date(market.close_time).getTime() - Date.now();
  const minsToClose = Math.round(msToClose / 60000);
  const secsToClose = Math.round(msToClose / 1000);

  // Parse strike from market title
  let strikePrice: number | null = null;
  let strikeDisplay = market.title ?? market.ticker;
  if (market.title) {
    const dollarMatch = market.title.match(/\$([\d,]+)/);
    if (dollarMatch) {
      strikePrice = parseInt(dollarMatch[1].replace(/,/g, ""));
    }
  }
  if (!strikePrice) {
    strikePrice = Math.round(btcPrice / 1000) * 1000;
    strikeDisplay = `${market.title ?? market.ticker} (strike ~$${strikePrice.toLocaleString()} estimated)`;
  } else {
    strikeDisplay = `${market.title} (strike = $${strikePrice.toLocaleString()})`;
  }
  const btcVsStrike = strikePrice
    ? (btcPrice > strikePrice
      ? `ABOVE strike by $${(btcPrice - strikePrice).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : `BELOW strike by $${(strikePrice - btcPrice).toLocaleString("en-US", { maximumFractionDigits: 0 })}`)
    : "strike unknown";

  const calcMove = (n: number) => {
    const s = prices.slice(-n);
    return s.length >= 2 ? (((s[s.length-1] - s[0]) / s[0]) * 100).toFixed(4) + "%" : "N/A";
  };
  const move3 = calcMove(3);
  const move5 = calcMove(5);
  const move15 = calcMove(15);
  const move30 = calcMove(30);

  const impliedYesPct = market.yes_bid;
  const impliedNoPct = market.no_bid;
  const marketEdge = impliedYesPct > 50
    ? `Market heavily implies YES (${impliedYesPct}% chance)`
    : impliedNoPct > 50
    ? `Market heavily implies NO (${impliedNoPct}% chance)`
    : `Market is near 50/50 (YES ${impliedYesPct}% / NO ${impliedNoPct}%)`;

  const timeContext = minsToClose > 10
    ? `${minsToClose} minutes left — plenty of time for price to move`
    : minsToClose > 3
    ? `${minsToClose} minutes left — getting close, momentum matters more than news`
    : `${secsToClose} seconds left — almost at close, only extreme moves change outcome`;

  // Recent trade history for self-learning
  const resolvedTrades = recentTrades.filter((t: any) => t.status === "won" || t.status === "lost").slice(0, 10);
  const tradeHistoryStr = resolvedTrades.length === 0
    ? "No completed trades yet this session."
    : resolvedTrades.map((t: any) =>
        `  ${t.status.toUpperCase()} | ${t.side.toUpperCase()} on ${t.ticker?.split("-").slice(-2).join("-")} | P&L: ${t.pnl != null ? (t.pnl >= 0 ? "+" : "") + "$" + t.pnl.toFixed(2) : "pending"} | Reasoning: ${t.signalReason?.replace(/^\[AI.*?\]\s*/, "").slice(0, 80) ?? "—"}`
      ).join("\n");

  const wins = resolvedTrades.filter((t: any) => t.status === "won").length;
  const losses = resolvedTrades.filter((t: any) => t.status === "lost").length;
  const sessionSummary = resolvedTrades.length > 0
    ? `Session so far: ${wins}W / ${losses}L (${Math.round(wins/(wins+losses)*100)}% win rate)`
    : "";

  return `KALSHI BTC 15-MINUTE PREDICTION MARKET — ENTRY DECISION

CURRENT MARKET:
${strikeDisplay}
BTC is currently ${btcVsStrike}
Close time: ${new Date(market.close_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} — ${timeContext}

ORDER BOOK:
  YES: bid ${market.yes_bid}¢ / ask ${market.yes_ask}¢  → market prices ${market.yes_bid}% chance YES wins
  NO:  bid ${market.no_bid}¢ / ask ${market.no_ask}¢   → market prices ${market.no_bid}% chance NO wins
${marketEdge}

LIVE BTC: $${btcPrice.toLocaleString()}
Price history (last 30 ticks, ~5s each, OLDEST → NEWEST):
${prices.slice(-30).map(p => `$${Math.round(p).toLocaleString()}`).join(" → ")}

MOMENTUM:
  Last 15s (3 ticks):   ${move3}
  Last 25s (5 ticks):   ${move5}
  Last 75s (15 ticks):  ${move15}
  Last 2.5m (30 ticks): ${move30}

YOUR RECENT TRADES THIS SESSION:
${tradeHistoryStr}
${sessionSummary}

ACCOUNT: $${balance.toFixed(2)} balance

NOW: Search the web for BTC price action in the last 10-30 minutes, breaking crypto news, X/Twitter sentiment, whale moves or large exchange flows. Factor that into your probability estimate.

DECISION: Is YES at ${market.yes_bid}¢ or NO at ${market.no_bid}¢ mispriced? If yes, take the edge. If the market is fairly priced, skip.

Respond with ONLY valid JSON:
{
  "action": "buy_yes" | "buy_no" | "skip",
  "confidence": <number 0-100>,
  "size_multiplier": 0.5 | 1.0 | 1.5,
  "reasoning": "<2-3 sentences — what you found and why it drives your decision>"
}

size_multiplier guide:
- 0.5 = low conviction / cautious edge
- 1.0 = normal conviction / clear edge
- 1.5 = high conviction / strong evidence of mispricing`;
}

// ── EXIT CHECK ────────────────────────────────────────────────────────────
async function checkExit(settings: any, creds: any, swing: AISwingTrade, market: KalshiMarket) {
  const msToClose = new Date(market.close_time).getTime() - Date.now();

  // HARD EXIT 1: Market rolled to new ticker — settle and move on
  if (swing.ticker !== market.ticker) {
    let resolvedPnl: number | null = null;
    let resolvedStatus = "settled";
    if (creds) {
      try {
        const settled = await getSettledPositions(creds.apiKeyId, creds.privateKeyPem, creds.environment);
        const pos = settled.find((p: any) => p.ticker === swing.ticker);
        if (pos) {
          const realized = pos.realized_pnl ?? pos.pnl ?? null;
          if (realized !== null) { resolvedPnl = realized / 100; resolvedStatus = resolvedPnl >= 0 ? "won" : "lost"; }
          else if (pos.settlement_value !== undefined) {
            resolvedPnl = (pos.settlement_value / 100) - (swing.entryPriceInCents / 100 * swing.count);
            resolvedStatus = resolvedPnl >= 0 ? "won" : "lost";
          }
        }
      } catch {}
    }
    await storage.updateTrade(swing.tradeId, {
      status: resolvedStatus, pnl: resolvedPnl,
      signalReason: `SETTLED: market closed${resolvedPnl !== null ? ` | P&L: $${resolvedPnl.toFixed(2)}` : ""}`,
      resolvedAt: new Date(),
    });
    state.activeSwingTrade = null;
    state.lastExitReason = `Market closed — settled${resolvedPnl !== null ? ` (${resolvedPnl >= 0 ? "+" : ""}$${resolvedPnl.toFixed(2)})` : ""}`;
    broadcast("info", { message: state.lastExitReason });
    return;
  }

  // HARD EXIT 2: Market already closed
  if (msToClose <= 0) {
    await storage.updateTrade(swing.tradeId, { status: "settled", resolvedAt: new Date() });
    state.activeSwingTrade = null;
    state.lastExitReason = "Market closed — settled";
    return;
  }

  // HARD EXIT 3: Final 15 seconds — pure safety, no AI call
  if (msToClose < 15_000) {
    const currentBid = swing.side === "yes" ? market.yes_bid : market.no_bid;
    const currentAsk = swing.side === "yes" ? market.yes_ask : market.no_ask;
    const hasBid = currentBid > 0;

    if (hasBid) {
      try {
        const exitPrice = Math.max(1, Math.min(99, currentAsk > 0 ? currentAsk : currentBid));
        await placeOrder(creds.apiKeyId, creds.privateKeyPem, swing.ticker, swing.side, "sell", swing.count, exitPrice, creds.environment);
        const pnlDollars = ((currentBid - swing.entryPriceInCents) / 100) * swing.count;
        await storage.updateTrade(swing.tradeId, {
          status: pnlDollars >= 0 ? "won" : "lost",
          pnl: pnlDollars,
          resolvedAt: new Date(),
          signalReason: `EXIT: Final 15s safety exit (P&L: ${pnlDollars >= 0 ? "+" : ""}$${pnlDollars.toFixed(2)})`,
        });
        state.lastExitReason = `Safety exit at close | P&L: ${pnlDollars >= 0 ? "+" : ""}$${pnlDollars.toFixed(2)}`;
        state.activeSwingTrade = null;
        broadcast("trade", { message: `Safety exit: ${swing.side.toUpperCase()} sold @ ${exitPrice}¢ | final 15s`, pnl: pnlDollars });
      } catch (e: any) {
        // No bid? Let it settle naturally
        await storage.updateTrade(swing.tradeId, { status: "settled", resolvedAt: new Date() });
        state.activeSwingTrade = null;
        state.lastExitReason = "Settled at close (no liquidity for safety exit)";
      }
    } else {
      await storage.updateTrade(swing.tradeId, { status: "settled", resolvedAt: new Date() });
      state.activeSwingTrade = null;
      state.lastExitReason = "Settled at close (no liquidity)";
    }
    return;
  }

  // HARD EXIT 4: No liquidity near close
  const currentBid = swing.side === "yes" ? market.yes_bid : market.no_bid;
  if (msToClose < 30_000 && currentBid <= 0) {
    await storage.updateTrade(swing.tradeId, { status: "settled", resolvedAt: new Date() });
    state.activeSwingTrade = null;
    state.lastExitReason = "Settled at close (no liquidity)";
    return;
  }

  // ── AI EXIT DECISION ──────────────────────────────────────────────────
  const perplexityKey = settings.perplexityApiKey;
  if (!perplexityKey) {
    // No key = hold until hard exits trigger
    return;
  }

  try {
    const exitDecision = await askPerplexityExit(swing, market, state.btcPrice, priceHistory, perplexityKey);
    console.log(`[AI Exit] ${exitDecision.action} (${exitDecision.confidence}%) — ${exitDecision.reasoning}`);
    broadcast("ai_exit", { ...exitDecision, ticker: swing.ticker, side: swing.side });

    if (exitDecision.action === "exit") {
      const bidNow = swing.side === "yes" ? market.yes_bid : market.no_bid;
      const askNow = swing.side === "yes" ? market.yes_ask : market.no_ask;
      const hasBid = bidNow > 0;

      if (!hasBid) {
        // AI wants out but no liquidity — note it and wait for hard exit
        state.lastExitReason = `AI wants to exit but no liquidity — waiting for close`;
        broadcast("info", { message: state.lastExitReason });
        return;
      }

      const exitPrice = Math.max(1, Math.min(99, askNow > 0 ? askNow : bidNow));
      await placeOrder(creds.apiKeyId, creds.privateKeyPem, swing.ticker, swing.side, "sell", swing.count, exitPrice, creds.environment);
      const pnlDollars = ((bidNow - swing.entryPriceInCents) / 100) * swing.count;
      await storage.updateTrade(swing.tradeId, {
        status: pnlDollars >= 0 ? "won" : "lost",
        pnl: pnlDollars,
        resolvedAt: new Date(),
        signalReason: `EXIT [AI ${exitDecision.confidence}%]: ${exitDecision.reasoning}`,
      });
      state.lastExitReason = `AI exit: ${exitDecision.reasoning} | P&L: ${pnlDollars >= 0 ? "+" : ""}$${pnlDollars.toFixed(2)}`;
      state.activeSwingTrade = null;
      broadcast("trade", {
        message: `AI exit: ${swing.side.toUpperCase()} sold @ ${exitPrice}¢ | ${exitDecision.reasoning}`,
        pnl: pnlDollars,
      });
    }
    // hold = do nothing, revisit next poll
  } catch (e: any) {
    // AI exit call failed — log it, hold the trade (don't panic)
    const errMsg = "AI exit call failed: " + e.message + " — holding";
    state.error = errMsg;
    console.error("[AI Exit Error]", e.message);
  }
}

// ── MAIN CYCLE ────────────────────────────────────────────────────────────
async function runCycle() {
  const settings = await storage.getBotSettings();
  const creds    = await storage.getCredentials();

  // BTC price
  try {
    const price = await getBtcPrice();
    if (price > 0) {
      state.btcPrice = price;
      priceHistory.push(price);
      if (priceHistory.length > 200) priceHistory.shift();
      state.priceHistory.push({ time: Date.now(), price });
      if (state.priceHistory.length > 120) state.priceHistory.shift();
    }
  } catch (e: any) { state.error = "BTC fetch failed: " + e.message; }

  // Markets
  try {
    const markets = await getBtc15mMarkets(creds?.environment ?? "production");
    if (markets.length > 0) {
      const valid = [...markets]
        .filter(m => m.ticker.startsWith("KXBTC15M") && m.status === "open" && new Date(m.close_time).getTime() > Date.now())
        .sort((a, b) => new Date(a.close_time).getTime() - new Date(b.close_time).getTime());
      state.currentMarket = valid[0] ?? markets[0];
    }
  } catch (e: any) { state.error = "Market fetch failed: " + e.message; }

  // Balance
  if (creds) {
    try {
      state.balance = await getBalance(creds.apiKeyId, creds.privateKeyPem, creds.environment);
      state.openPositions = await getOpenPositions(creds.apiKeyId, creds.privateKeyPem, creds.environment);
      state.error = null;
    } catch (e: any) { state.error = "Auth failed: " + e.message; }
  }

  state.lastRun = new Date();

  if (settings.enabled && creds && state.currentMarket) {
    // Exit check first (AI decides each poll)
    if (state.activeSwingTrade) {
      await checkExit(settings, creds, state.activeSwingTrade, state.currentMarket);
    }

    // Entry — only if no active trade
    if (!state.activeSwingTrade && priceHistory.length >= 5) {
      const msToClose = new Date(state.currentMarket.close_time).getTime() - Date.now();
      if (msToClose >= 90_000) {
        // Check balance cap
        if (state.balance >= settings.targetBalance) {
          await storage.updateBotSettings({ enabled: false });
          broadcast("info", { message: `Target $${settings.targetBalance} reached — bot paused` });
        } else {
          await tryAIEntry(settings, creds, state.currentMarket);
        }
      }
    }
  }

  broadcast("state", {
    btcPrice: state.btcPrice,
    balance: state.balance,
    openPositions: state.openPositions,
    currentMarket: state.currentMarket,
    error: state.error,
    lastRun: state.lastRun,
    priceHistory: state.priceHistory,
    activeSwingTrade: state.activeSwingTrade,
    lastExitReason: state.lastExitReason,
    lastAIDecision: state.lastAIDecision,
    aiCallCount: state.aiCallCount,
    aiCostEstimate: state.aiCostEstimate,
  });
}

// ── AI ENTRY ──────────────────────────────────────────────────────────────
async function tryAIEntry(settings: any, creds: any, market: KalshiMarket) {
  const perplexityKey = settings.perplexityApiKey;
  if (!perplexityKey) {
    state.error = "No Perplexity API key set — add it in Settings";
    return;
  }

  const baseAmount = state.balance * (settings.riskPercent / 100);
  if (baseAmount < 0.01) return;

  let decision: AIDecision;
  try {
    const recentTrades = await storage.getTrades(10);
    const prompt = buildEntryPrompt(market, state.btcPrice, priceHistory, state.balance, recentTrades);
    decision = await askPerplexityEntry(prompt, perplexityKey);
    state.lastAIDecision = decision;
    broadcast("ai_decision", decision);
    console.log(`[AI Entry] ${decision.action} (${decision.confidence}%, size=${decision.size_multiplier}x) — ${decision.reasoning}`);
  } catch (e: any) {
    state.error = "AI call failed: " + e.message;
    return;
  }

  // AI decides — no gates. skip = skip.
  if (decision.action === "skip") {
    console.log(`[AI] Skipping — no edge found`);
    return;
  }

  const side: "yes" | "no" = decision.action === "buy_yes" ? "yes" : "no";
  const priceInCents = Math.max(1, Math.min(99,
    side === "yes"
      ? (market.yes_ask > 0 ? market.yes_ask : (market.yes_bid > 0 ? market.yes_bid + 1 : 50))
      : (market.no_ask > 0 ? market.no_ask : (market.no_bid > 0 ? market.no_bid + 1 : 50))
  ));

  // Position size scaled by AI conviction
  const scaledAmount = baseAmount * decision.size_multiplier;
  const count = Math.max(1, Math.floor(scaledAmount / (priceInCents / 100)));
  const actualCost = count * (priceInCents / 100);

  try {
    const order = await placeOrder(creds.apiKeyId, creds.privateKeyPem, market.ticker, side, "buy", count, priceInCents, creds.environment);
    const trade = await storage.createTrade({
      orderId: order.order_id,
      ticker: market.ticker,
      side,
      action: "buy",
      count,
      pricePerContract: priceInCents,
      totalCost: actualCost,
      status: "filled",
      signalReason: `[AI ${decision.confidence}% size=${decision.size_multiplier}x] ${decision.reasoning}`,
      btcPriceAtTrade: state.btcPrice,
      marketTitle: market.title,
      settingsVersion: settings.settingsVersion,
    });

    state.activeSwingTrade = {
      tradeId: trade.id,
      orderId: order.order_id,
      ticker: market.ticker,
      side, count,
      entryPriceInCents: priceInCents,
      btcPriceAtEntry: state.btcPrice,
      openedAt: Date.now(),
      aiReasoning: decision.reasoning,
    };

    broadcast("trade", {
      message: `AI entry: ${side.toUpperCase()} ${count}x @ ${priceInCents}¢ (${decision.size_multiplier}x size) | ${decision.reasoning}`,
      trade,
    });
    console.log(`[AI] Entered ${side} ${count}x @ ${priceInCents}¢ (${decision.size_multiplier}x size, cost $${actualCost.toFixed(2)})`);
  } catch (e: any) {
    state.error = "Order failed: " + e.message;
  }
}

export async function startEngine() {
  if (intervalHandle) return;
  state.running = true;
  state.activeSwingTrade = null;
  await runCycle();
  const settings = await storage.getBotSettings();
  const pollMs = (settings.pollInterval ?? 15) * 1000;
  intervalHandle = setInterval(runCycle, pollMs);
  console.log(`[AI Engine] Started — polling every ${settings.pollInterval ?? 15}s`);
}

export function stopEngine() {
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
  state.running = false;
  state.activeSwingTrade = null;
}

export async function restartEngine() { stopEngine(); await startEngine(); }
