import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, TrendingUp, TrendingDown, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

const VERSION_COLORS = [
  "rgba(139,92,246,0.8)","rgba(59,130,246,0.8)","rgba(16,185,129,0.8)",
  "rgba(245,158,11,0.8)","rgba(236,72,153,0.8)","rgba(14,165,233,0.8)",
  "rgba(239,68,68,0.8)","rgba(251,146,60,0.8)",
];
const vColor = (v: number) => VERSION_COLORS[(v - 1) % VERSION_COLORS.length];
const vBorderClass = (v: number) => `v-color-${((v - 1) % 8) + 1}`;

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "won" ? "badge-won" :
    status === "lost" ? "badge-lost" :
    status === "filled" ? "badge-filled" : "badge-settled";
  return <span className={cls}>{status.toUpperCase()}</span>;
}

function formatTime(d: any) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TradeHistory() {
  const { data: tradesData } = useQuery<any>({ queryKey: ["/api/trades"], refetchInterval: 5000 });
  const { data: logData } = useQuery<any>({ queryKey: ["/api/settings/log"] });
  const [filterVersion, setFilterVersion] = useState<number | null>(null);

  const allTrades = tradesData?.trades ?? [];
  const trades = filterVersion ? allTrades.filter((t: any) => t.settingsVersion === filterVersion) : allTrades;

  const totalPnL = trades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
  const wins = trades.filter((t: any) => t.status === "won").length;
  const losses = trades.filter((t: any) => t.status === "lost").length;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  const totalSpent = trades.reduce((s: number, t: any) => s + (t.totalCost ?? 0), 0);
  const avgWin = wins > 0 ? trades.filter((t: any) => t.status === "won").reduce((s: number, t: any) => s + (t.pnl ?? 0), 0) / wins : 0;
  const avgLoss = losses > 0 ? trades.filter((t: any) => t.status === "lost").reduce((s: number, t: any) => s + (t.pnl ?? 0), 0) / losses : 0;

  // All known versions
  const versions = Array.from(new Set(allTrades.map((t: any) => t.settingsVersion ?? 1))) as number[];

  return (
    <div className="min-h-screen">
      <nav className="glass-nav sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center gap-3">
          <Link href="/">
            <button className="glass-btn p-2 text-white/50 hover:text-white/90"><ArrowLeft size={15} /></button>
          </Link>
          <span className="text-sm font-semibold text-white/70">Trade History</span>
          <div className="ml-auto text-xs text-white/30">{allTrades.length} trades</div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-5 py-6 space-y-4">

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass p-4">
            <div className="text-[10px] text-white/35 uppercase tracking-widest mb-1">Total P&L</div>
            <div className={cn("text-xl font-bold", totalPnL >= 0 ? "text-green-400" : "text-red-400")}>
              {totalPnL >= 0 ? "+" : ""}${Math.abs(totalPnL).toFixed(2)}
            </div>
          </div>
          <div className="glass p-4">
            <div className="text-[10px] text-white/35 uppercase tracking-widest mb-1">Win Rate</div>
            <div className="text-xl font-bold text-white/80">{winRate.toFixed(0)}%</div>
            <div className="text-xs text-white/30 mt-0.5">{wins}W / {losses}L</div>
          </div>
          <div className="glass p-4">
            <div className="text-[10px] text-white/35 uppercase tracking-widest mb-1">Avg Win / Loss</div>
            <div className="text-sm font-semibold text-green-400">+${avgWin.toFixed(2)}</div>
            <div className="text-sm font-semibold text-red-400">${avgLoss.toFixed(2)}</div>
          </div>
          <div className="glass p-4">
            <div className="text-[10px] text-white/35 uppercase tracking-widest mb-1">Total Spent</div>
            <div className="text-xl font-bold text-white/60">${totalSpent.toFixed(2)}</div>
          </div>
        </div>

        {/* Version filter pills */}
        {versions.length > 1 && (
          <div className="glass p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={12} className="text-white/30" />
              <span className="text-[10px] text-white/35 uppercase tracking-widest mr-1">Filter by settings version:</span>
              <button
                onClick={() => setFilterVersion(null)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-all glass-btn",
                  filterVersion === null ? "glass-btn-green" : "text-white/40"
                )}
              >All</button>
              {versions.map(v => {
                const color = vColor(v);
                const snap = logData?.log?.find((e: any) => e.version === v);
                const snapData = snap ? JSON.parse(snap.snapshot ?? "{}") : null;
                return (
                  <button key={v}
                    onClick={() => setFilterVersion(filterVersion === v ? null : v)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-all glass-btn flex items-center gap-1.5",
                      filterVersion === v ? "opacity-100" : "opacity-60 hover:opacity-90"
                    )}
                    style={filterVersion === v ? { borderColor: color, color } : {}}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    v{v}
                    {snapData && <span className="text-[9px] opacity-60 ml-0.5">+{snapData.profitTarget}%/-{snapData.stopLoss}%</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Settings version legend */}
        {logData?.log?.length > 0 && (
          <div className="glass p-4 space-y-2">
            <div className="text-[10px] text-white/35 uppercase tracking-widest">Settings Versions</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {logData.log.map((entry: any) => {
                const snap = JSON.parse(entry.snapshot ?? "{}");
                const color = vColor(entry.version);
                const vTrades = allTrades.filter((t: any) => (t.settingsVersion ?? 1) === entry.version);
                const vWins = vTrades.filter((t: any) => t.status === "won").length;
                const vLosses = vTrades.filter((t: any) => t.status === "lost").length;
                const vPnl = vTrades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
                return (
                  <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/2 border border-white/5">
                    <span className="w-2.5 h-2.5 rounded-full mt-0.5 flex-shrink-0" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color }}>v{entry.version}</span>
                        <span className="text-[10px] text-white/30">{new Date(entry.changedAt).toLocaleString()}</span>
                      </div>
                      <div className="text-[10px] text-white/40 mt-0.5 flex gap-3 flex-wrap">
                        <span>Risk {snap.riskPercent}% · Target +{snap.profitTarget}% · Stop -{snap.stopLoss}%</span>
                        <span>Threshold {snap.swingThreshold}% · Poll {snap.pollInterval}s</span>
                      </div>
                      <div className="text-[10px] mt-1 flex gap-3">
                        <span className="text-white/40">{vTrades.length} trades</span>
                        <span className={vWins > vLosses ? "text-green-400" : "text-white/40"}>{vWins}W/{vLosses}L</span>
                        <span className={vPnl >= 0 ? "text-green-400" : "text-red-400"}>{vPnl >= 0 ? "+" : ""}${vPnl.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Full trade table */}
        <div className="glass p-4">
          <div className="text-[10px] text-white/35 uppercase tracking-widest mb-3">
            {filterVersion ? `v${filterVersion} trades` : "All Trades"} ({trades.length})
          </div>
          {trades.length === 0 ? (
            <div className="text-sm text-white/20 text-center py-8">No trades</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-white/25 uppercase tracking-widest">
                    <th className="text-left pb-2 pr-3 font-medium">v</th>
                    <th className="text-left pb-2 pr-3 font-medium">Market</th>
                    <th className="text-left pb-2 pr-3 font-medium">Side</th>
                    <th className="text-right pb-2 pr-3 font-medium">Cost</th>
                    <th className="text-left pb-2 pr-3 font-medium">Status</th>
                    <th className="text-right pb-2 pr-3 font-medium">P&L</th>
                    <th className="text-right pb-2 pr-3 font-medium">BTC @</th>
                    <th className="text-left pb-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t: any) => {
                    const v = t.settingsVersion ?? 1;
                    const color = vColor(v);
                    return (
                      <tr key={t.id} className={cn("glass-table-row border-l-2 pl-3", vBorderClass(v))}>
                        <td className="py-2 pr-3">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                        </td>
                        <td className="py-2 pr-3 font-mono text-white/40 text-[11px] truncate max-w-[110px]">{t.ticker?.split("-").slice(-2).join("-")}</td>
                        <td className="py-2 pr-3">
                          <span className={cn("font-bold text-[11px]", t.side === "yes" ? "text-green-400" : "text-red-400")}>{t.side?.toUpperCase()}</span>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-white/55">${t.totalCost?.toFixed(2)}</td>
                        <td className="py-2 pr-3"><StatusBadge status={t.status} /></td>
                        <td className={cn("py-2 pr-3 text-right font-mono font-semibold",
                          t.pnl == null ? "text-white/20" : t.pnl >= 0 ? "text-green-400" : "text-red-400"
                        )}>
                          {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}` : <span className="text-[10px] font-normal text-white/20">pending</span>}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-white/30 text-[10px]">
                          {t.btcPriceAtTrade ? `$${Math.round(t.btcPriceAtTrade).toLocaleString()}` : "—"}
                        </td>
                        <td className="py-2 text-white/30 text-[10px] whitespace-nowrap">{formatTime(t.createdAt)}</td>
                      </tr>
                    );
                  })}
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
