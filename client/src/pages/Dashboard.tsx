import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Settings, Brain, Target, AlertCircle, ChevronUp, ChevronDown, Clock, TrendingUp, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

function formatPrice(n: number) {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toFixed(2);
}
function formatTime(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function StatusBadge({ status }: { status: string }) {
  const cls = status === "won" ? "badge-won" : status === "lost" ? "badge-lost" : status === "filled" ? "badge-filled" : "badge-settled";
  return <span className={cls}>{status.toUpperCase()}</span>;
}

export default function Dashboard() {
  const [state, setState] = useState<any>({});
  const prevBtc = useRef(0);
  const [flash, setFlash] = useState("");

  const { data: tradesData, refetch: refetchTrades } = useQuery<any>({ queryKey: ["/api/trades"], refetchInterval: 8000 });
  const { data: creds } = useQuery<any>({ queryKey: ["/api/credentials"] });
  const { data: settings } = useQuery<any>({ queryKey: ["/api/settings"] });

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.addEventListener("state", e => {
      const d = JSON.parse(e.data);
      setState(d);
      if (d.btcPrice && prevBtc.current) {
        setFlash(d.btcPrice > prevBtc.current ? "flash-green" : d.btcPrice < prevBtc.current ? "flash-red" : "");
        setTimeout(() => setFlash(""), 900);
      }
      prevBtc.current = d.btcPrice ?? prevBtc.current;
    });
    es.addEventListener("trade", () => refetchTrades());
    return () => es.close();
  }, []);

  const trades = tradesData?.trades ?? [];
  const totalPnL = trades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
  const totalSpent = trades.reduce((s: number, t: any) => s + (t.totalCost ?? 0), 0);
  const wins = trades.filter((t: any) => t.status === "won").length;
  const losses = trades.filter((t: any) => t.status === "lost").length;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;

  const market = state.currentMarket;
  const swing = state.activeSwingTrade;
  const ai = state.lastAIDecision;
  const botOn = settings?.enabled ?? false;

  const chartData = (state.priceHistory ?? []).map((p: any) => ({
    t: new Date(p.time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    price: p.price,
  }));

  let swingBid = 0, swingPnlPct = 0, swingPnlDollar: number | null = null;
  if (swing && market) {
    swingBid = swing.side === "yes" ? (market.yes_bid ?? 0) : (market.no_bid ?? 0);
    if (swingBid > 0) {
      swingPnlPct = ((swingBid - swing.entryPriceInCents) / swing.entryPriceInCents) * 100;
      swingPnlDollar = ((swingBid - swing.entryPriceInCents) / 100) * swing.count;
    }
  }

  const hasPerplexityKey = settings?.perplexityApiKey && settings.perplexityApiKey !== "null";

  return (
    <div className="min-h-screen">
      <nav className="glass-nav sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-2 h-2 rounded-full", botOn ? "bg-green-400 pulse-dot" : "bg-white/20")} />
            <Brain size={15} className="text-purple-400" />
            <span className="text-sm font-semibold text-white/80">Kalshi AI Trader <span className="text-[10px] text-purple-400 ml-1">BETA</span></span>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/history">
              <button className="glass-btn px-3 py-1.5 text-xs text-white/60 hover:text-white/90">History</button>
            </Link>
            <Link href="/settings">
              <button className="glass-btn px-3 py-1.5 text-xs text-white/60 hover:text-white/90 flex items-center gap-1.5">
                <Settings size={12} /> Settings
              </button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-5 py-6 space-y-4">

        {/* No API key warning */}
        {!hasPerplexityKey && (
          <div className="glass p-4 border-yellow-400/20 flex items-center gap-3">
            <AlertCircle size={14} className="text-yellow-400 flex-shrink-0" />
            <span className="text-sm text-yellow-400">Add your Perplexity API key in Settings to start trading.</span>
            <Link href="/settings" className="ml-auto">
              <button className="glass-btn px-3 py-1.5 text-xs text-yellow-400">Go to Settings →</button>
            </Link>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass p-4">
            <div className="text-[10px] text-white/35 uppercase tracking-widest mb-1">BTC Price</div>
            <div className={cn("text-2xl font-bold text-orange-400", flash)}>${formatPrice(state.btcPrice ?? 0)}</div>
          </div>
          <div className="glass p-4">
            <div className="text-[10px] text-white/35 uppercase tracking-widest mb-1">Balance</div>
            <div className="text-2xl font-bold text-green-400">{creds?.connected ? `$${formatPrice(state.balance ?? 0)}` : "—"}</div>
            <div className="text-xs text-white/30 mt-0.5">Target ${settings?.targetBalance ?? 100}</div>
          </div>
          <div className="glass p-4">
            <div className="text-[10px] text-white/35 uppercase tracking-widest mb-1">Total P&L</div>
            <div className={cn("text-2xl font-bold", totalPnL >= 0 ? "text-green-400" : "text-red-400")}>
              {totalPnL >= 0 ? "+" : ""}${Math.abs(totalPnL).toFixed(2)}
            </div>
            <div className="text-xs text-white/30 mt-0.5">{wins}W / {losses}L · {winRate.toFixed(0)}%</div>
          </div>
          <div className="glass p-4">
            <div className="text-[10px] text-white/35 uppercase tracking-widest mb-1">AI Cost</div>
            <div className="text-2xl font-bold text-purple-400">${(state.aiCostEstimate ?? 0).toFixed(4)}</div>
            <div className="text-xs text-white/30 mt-0.5">{state.aiCallCount ?? 0} calls</div>
          </div>
        </div>

        {/* AI Decision + Active Trade */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* Last AI decision */}
          <div className={cn("glass p-4", ai?.action === "buy_yes" ? "glass-active" : ai?.action === "buy_no" ? "glass-danger" : "")}>
            <div className="flex items-center gap-2 mb-3">
              <Brain size={14} className="text-purple-400" />
              <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Last AI Decision</span>
              {ai && <span className="ml-auto text-[10px] text-white/25">{formatTime(ai.timestamp)}</span>}
            </div>
            {ai ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={cn("text-xl font-bold",
                    ai.action === "buy_yes" ? "text-green-400" :
                    ai.action === "buy_no" ? "text-red-400" : "text-white/40"
                  )}>
                    {ai.action === "buy_yes" ? "BUY YES" : ai.action === "buy_no" ? "BUY NO" : "SKIP"}
                  </div>
                  <div className={cn("px-2 py-0.5 rounded-lg text-xs font-bold",
                    ai.confidence >= 70 ? "bg-green-400/10 text-green-400" :
                    ai.confidence >= 50 ? "bg-yellow-400/10 text-yellow-400" :
                    "bg-white/5 text-white/30"
                  )}>{ai.confidence}% confident</div>
                </div>
                <div className="text-sm text-white/60 leading-relaxed">{ai.reasoning}</div>
                {ai.sources?.length > 0 && (
                  <div className="text-[10px] text-white/25">
                    Sources: {ai.sources.slice(0, 2).map((s: string, i: number) => (
                      <a key={i} href={s} target="_blank" rel="noreferrer" className="text-purple-400/60 hover:text-purple-400 underline mr-2 truncate inline-block max-w-[120px] align-bottom">{new URL(s).hostname}</a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-white/25 flex items-center gap-2">
                <Zap size={13} />
                {botOn ? "Waiting for first AI decision…" : "Start the bot to see AI decisions"}
              </div>
            )}
          </div>

          {/* Active trade or last exit */}
          {swing ? (
            <div className={cn("glass p-4", swingPnlPct >= 0 ? "glass-active" : "glass-danger")}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Target size={14} className="text-green-400 animate-pulse" />
                  <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Active Trade</span>
                </div>
                <span className="badge-filled">LIVE</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-white/35 mb-0.5">Side</div>
                  <div className={cn("text-lg font-bold", swing.side === "yes" ? "text-green-400" : "text-red-400")}>
                    {swing.side.toUpperCase()} <span className="text-white/40 text-sm font-normal">×{swing.count}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-white/35 mb-0.5">Entry</div>
                  <div className="text-lg font-mono">{swing.entryPriceInCents}¢</div>
                </div>
                <div>
                  <div className="text-[10px] text-white/35 mb-0.5">Current Bid</div>
                  <div className={cn("text-lg font-mono", swingBid > 0 ? (swingPnlPct >= 0 ? "text-green-400" : "text-red-400") : "text-white/30")}>
                    {swingBid > 0 ? `${swingBid}¢` : "waiting…"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-white/35 mb-0.5">Unrealized P&L</div>
                  <div className={cn("text-lg font-bold", swingBid > 0 ? (swingPnlPct >= 0 ? "text-green-400" : "text-red-400") : "text-white/30")}>
                    {swingBid > 0 ? <>{swingPnlPct >= 0 ? "+" : ""}{swingPnlPct.toFixed(1)}% <span className="text-xs font-normal">({swingPnlPct >= 0 ? "+$" : "-$"}{Math.abs(swingPnlDollar ?? 0).toFixed(2)})</span></> : "no bid"}
                  </div>
                </div>
              </div>
              {swing.aiReasoning && (
                <div className="mt-3 pt-3 border-t border-white/5 text-[11px] text-white/35 italic">
                  "{swing.aiReasoning}"
                </div>
              )}
              <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-500", swingPnlPct >= 0 ? "bg-green-400" : "bg-red-400")}
                  style={{ width: `${Math.min(100, settings ? (Math.abs(swingPnlPct) / Math.max(settings.profitTarget ?? 35, settings.stopLoss ?? 5)) * 100 : Math.abs(swingPnlPct))}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-white/25 mt-1">
                <span>Stop -{settings?.stopLoss ?? 5}%</span>
                <span>Target +{settings?.profitTarget ?? 35}%</span>
              </div>
            </div>
          ) : (
            <div className="glass p-4 flex flex-col justify-center items-center gap-2 text-white/25 min-h-[160px]">
              {state.lastExitReason ? (
                <>
                  <Clock size={14} />
                  <span className="text-xs text-white/40">Last exit:</span>
                  <span className="text-xs text-center text-white/55 max-w-[220px]">{state.lastExitReason}</span>
                  <span className="text-[10px] text-white/25 mt-1">Awaiting next AI decision…</span>
                </>
              ) : (
                <><Target size={14} /><span className="text-xs">No active trade</span></>
              )}
            </div>
          )}
        </div>

        {/* Market info */}
        {market && (
          <div className="glass px-4 py-3 flex items-center gap-6 text-xs">
            <div className="text-white/35 font-mono truncate">{market.ticker}</div>
            <div className="flex gap-4 ml-auto">
              <span className="text-white/40">YES <span className="text-green-400 font-mono">{market.yes_bid}¢</span></span>
              <span className="text-white/40">NO <span className="text-red-400 font-mono">{market.no_bid}¢</span></span>
              <span className="text-white/30">Closes {new Date(market.close_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          </div>
        )}

        {/* BTC chart */}
        <div className="glass p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">BTC Live Price</span>
            <span className="text-[10px] text-white/25">Updated {formatTime(state.lastRun)}</span>
          </div>
          {chartData.length < 3 ? (
            <div className="h-36 flex items-center justify-center text-white/20 text-sm">Collecting price data…</div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="btcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="rgb(251,146,60)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="rgb(251,146,60)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={["auto","auto"]} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "rgba(10,12,20,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "0.75rem", fontSize: 11 }} formatter={(v: any) => [`$${v.toLocaleString()}`, "BTC"]} />
                <Area type="monotone" dataKey="price" stroke="rgb(251,146,60)" strokeWidth={1.5} fill="url(#btcGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Error */}
        {state.error && (
          <div className="glass p-3 flex items-center gap-2 text-red-400 text-xs">
            <AlertCircle size={13} /> {state.error}
          </div>
        )}

        {/* Recent trades */}
        <div className="glass p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Recent Trades</span>
            <Link href="/history"><button className="text-[10px] text-white/30 hover:text-white/60">View all →</button></Link>
          </div>
          {trades.length === 0 ? (
            <div className="text-sm text-white/20 text-center py-6">No trades yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-white/25 uppercase tracking-widest">
                    <th className="text-left pb-2 pr-4">Market</th>
                    <th className="text-left pb-2 pr-4">Side</th>
                    <th className="text-right pb-2 pr-4">Cost</th>
                    <th className="text-left pb-2 pr-4">Status</th>
                    <th className="text-right pb-2 pr-4">P&L</th>
                    <th className="text-left pb-2 hidden md:table-cell">AI Reasoning</th>
                    <th className="text-right pb-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(0, 8).map((t: any) => (
                    <tr key={t.id} className="glass-table-row">
                      <td className="py-2 pr-4 font-mono text-white/40 text-[11px] truncate max-w-[110px]">{t.ticker?.split("-").slice(-2).join("-")}</td>
                      <td className="py-2 pr-4"><span className={cn("font-bold text-[11px]", t.side === "yes" ? "text-green-400" : "text-red-400")}>{t.side?.toUpperCase()}</span></td>
                      <td className="py-2 pr-4 text-right font-mono text-white/55">${t.totalCost?.toFixed(2)}</td>
                      <td className="py-2 pr-4"><StatusBadge status={t.status} /></td>
                      <td className={cn("py-2 pr-4 text-right font-mono font-semibold", t.pnl == null ? "text-white/20" : t.pnl >= 0 ? "text-green-400" : "text-red-400")}>
                        {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}` : <span className="text-[10px] font-normal">pending</span>}
                      </td>
                      <td className="py-2 pr-4 text-white/30 hidden md:table-cell">
                        <span className="truncate block max-w-[180px] text-[10px]">{t.signalReason?.replace(/^\[.*?\]\s*/, "").slice(0, 50) ?? "—"}</span>
                      </td>
                      <td className="py-2 text-right text-white/25 text-[10px]">{formatTime(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="text-center text-[10px] text-white/15 pb-4">Powered by Perplexity Computer</div>
      </main>
    </div>
  );
}
