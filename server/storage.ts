import {
  credentials, botSettings, trades, signals, settingsLog,
  type Credentials, type InsertCredentials,
  type BotSettings, type InsertBotSettings,
  type Trade, type InsertTrade,
  type Signal, type InsertSignal,
  type SettingsLog, type InsertSettingsLog,
} from "@shared/schema";

export interface IStorage {
  getCredentials(): Promise<Credentials | null>;
  setCredentials(creds: InsertCredentials): Promise<Credentials>;
  deleteCredentials(): Promise<void>;
  getBotSettings(): Promise<BotSettings>;
  updateBotSettings(settings: Partial<InsertBotSettings>): Promise<BotSettings>;
  getTrades(limit?: number): Promise<Trade[]>;
  createTrade(trade: InsertTrade): Promise<Trade>;
  updateTrade(id: number, update: Partial<InsertTrade>): Promise<Trade>;
  getSignals(limit?: number): Promise<Signal[]>;
  createSignal(signal: InsertSignal): Promise<Signal>;
  getSettingsLog(): Promise<SettingsLog[]>;
}

class InMemoryStorage implements IStorage {
  private creds: Credentials | null = null;
  private settings: BotSettings = {
    id: 1,
    enabled: false,
    riskPercent: 10,
    targetBalance: 100,
    pollInterval: 15,
    perplexityApiKey: null,
    settingsVersion: 1,
    // AI-only bot: these are unused, AI decides everything
    minConfidence: null,
    profitTarget: null,
    stopLoss: null,
  };
  private tradeList: Trade[] = [];
  private signalList: Signal[] = [];
  private settingsLogList: SettingsLog[] = [];
  private tradeIdCounter = 1;
  private signalIdCounter = 1;
  private settingsLogIdCounter = 1;
  private credIdCounter = 1;

  async getCredentials() { return this.creds; }
  async setCredentials(c: InsertCredentials): Promise<Credentials> {
    this.creds = { ...c, id: this.credIdCounter++ };
    return this.creds;
  }
  async deleteCredentials() { this.creds = null; }

  async getBotSettings() { return { ...this.settings }; }
  async updateBotSettings(update: Partial<InsertBotSettings>): Promise<BotSettings> {
    const hadMeaningfulChange = Object.keys(update).some(
      k => k !== "enabled" && k !== "perplexityApiKey" && (update as any)[k] !== (this.settings as any)[k]
    );
    if (hadMeaningfulChange) {
      const newVersion = this.settings.settingsVersion + 1;
      this.settingsLogList.push({
        id: this.settingsLogIdCounter++,
        version: newVersion,
        snapshot: JSON.stringify({ ...this.settings, ...update, settingsVersion: newVersion }),
        changedAt: new Date(),
        label: null,
      });
      update.settingsVersion = newVersion;
    }
    this.settings = { ...this.settings, ...update };
    return { ...this.settings };
  }

  async getTrades(limit = 200) { return [...this.tradeList].reverse().slice(0, limit); }
  async createTrade(t: InsertTrade): Promise<Trade> {
    const trade: Trade = {
      ...t, id: this.tradeIdCounter++, createdAt: new Date(),
      orderId: t.orderId ?? null, pnl: t.pnl ?? null,
      signalReason: t.signalReason ?? null, btcPriceAtTrade: t.btcPriceAtTrade ?? null,
      marketTitle: t.marketTitle ?? null, resolvedAt: t.resolvedAt ?? null,
      settingsVersion: t.settingsVersion ?? this.settings.settingsVersion,
    };
    this.tradeList.push(trade);
    return trade;
  }
  async updateTrade(id: number, update: Partial<InsertTrade>): Promise<Trade> {
    const idx = this.tradeList.findIndex(t => t.id === id);
    if (idx === -1) throw new Error(`Trade ${id} not found`);
    this.tradeList[idx] = { ...this.tradeList[idx], ...update };
    return this.tradeList[idx];
  }

  async getSignals(limit = 50) { return [...this.signalList].reverse().slice(0, limit); }
  async createSignal(s: InsertSignal): Promise<Signal> {
    const signal: Signal = {
      ...s, id: this.signalIdCounter++, createdAt: new Date(),
      marketTicker: s.marketTicker ?? null, marketYesPrice: s.marketYesPrice ?? null,
      reasoning: s.reasoning ?? null,
    };
    this.signalList.push(signal);
    return signal;
  }

  async getSettingsLog() { return [...this.settingsLogList].reverse(); }
}

export const storage = new InMemoryStorage();
