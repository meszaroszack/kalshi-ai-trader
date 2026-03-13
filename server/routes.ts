import type { Express } from "express";
import { Server } from "http";
import { EventEmitter } from "events";
import { storage } from "./storage";
import { getBalance, getBtcPrice } from "./kalshi";
import { startEngine, stopEngine, restartEngine, getState, setEmitter } from "./aiEngine";

const sseEmitter = new EventEmitter();
sseEmitter.setMaxListeners(100);
setEmitter(sseEmitter);

export async function registerRoutes(httpServer: Server, app: Express) {
  startEngine();

  app.get("/api/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = ({ event, data }: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    sseEmitter.on("sse", send);
    const state = getState();
    send({ event: "state", data: {
      btcPrice: state.btcPrice, balance: state.balance, openPositions: state.openPositions,
      currentMarket: state.currentMarket, error: state.error, lastRun: state.lastRun,
      priceHistory: state.priceHistory, activeSwingTrade: state.activeSwingTrade,
      lastExitReason: state.lastExitReason, lastAIDecision: state.lastAIDecision,
      aiCallCount: state.aiCallCount, aiCostEstimate: state.aiCostEstimate,
    }});
    req.on("close", () => sseEmitter.off("sse", send));
  });

  app.get("/api/credentials", async (req, res) => {
    const creds = await storage.getCredentials();
    if (!creds) return res.json({ connected: false });
    res.json({ connected: true, environment: creds.environment, apiKeyId: creds.apiKeyId.substring(0, 8) + "..." });
  });

  app.post("/api/credentials", async (req, res) => {
    const { apiKeyId, privateKeyPem, environment } = req.body;
    if (!apiKeyId || !privateKeyPem) return res.status(400).json({ error: "apiKeyId and privateKeyPem required" });
    try {
      const bal = await getBalance(apiKeyId, privateKeyPem.trim(), environment ?? "production");
      await storage.setCredentials({ apiKeyId, privateKeyPem: privateKeyPem.trim(), environment: environment ?? "production" });
      res.json({ success: true, balance: bal });
    } catch (e: any) { res.status(401).json({ error: "Invalid credentials: " + e.message }); }
  });

  app.delete("/api/credentials", async (req, res) => {
    await storage.deleteCredentials();
    res.json({ success: true });
  });

  app.get("/api/settings", async (req, res) => {
    const s = await storage.getBotSettings();
    // Never send the API key to frontend
    res.json({ ...s, perplexityApiKey: s.perplexityApiKey ? "••••••••" : null });
  });

  app.patch("/api/settings", async (req, res) => {
    const updated = await storage.updateBotSettings(req.body);
    if (req.body.pollInterval !== undefined) await restartEngine();
    res.json({ ...updated, perplexityApiKey: updated.perplexityApiKey ? "••••••••" : null });
  });

  app.post("/api/settings/perplexity-key", async (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    await storage.updateBotSettings({ perplexityApiKey: key });
    res.json({ success: true });
  });

  app.post("/api/bot/toggle", async (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled required" });
    const s = await storage.updateBotSettings({ enabled });
    res.json({ enabled: s.enabled });
  });

  app.get("/api/trades", async (req, res) => {
    const limit = parseInt((req.query.limit as string) ?? "200");
    res.json({ trades: await storage.getTrades(limit) });
  });

  app.get("/api/settings/log", async (req, res) => {
    res.json({ log: await storage.getSettingsLog() });
  });

  app.get("/api/engine/state", (req, res) => res.json(getState()));
}
