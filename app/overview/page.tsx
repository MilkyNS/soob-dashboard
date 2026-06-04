"use client";

import { useEffect, useState } from "react";

const REFRESH_INTERVAL = 15000;
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
type SymbolId = (typeof SYMBOLS)[number];

interface LiveTick {
  price: number;
  action: string;
  thinking: string;
  in_killzone: boolean;
  ny_hour: number;
  last_tick: string;
  has_position: boolean;
  unrealized_pnl: number;
  current_rr: number;
}

interface BotStatus {
  symbol?: string;
  state: {
    equity: number;
    starting_capital: number;
    peak_equity: number;
    max_drawdown: number;
    total_pnl: number;
    total_closed: number;
    live?: LiveTick;
  };
  stats: {
    total_trades: number;
    wins: number;
    losses: number;
    win_rate: number;
    total_pnl: number;
    avg_rr: number;
    best_trade: number;
    worst_trade: number;
  };
  trades: Trade[];
  equity_curve: { time: string; equity: number }[];
  recent_events: { time: string; event: string }[];
  phase: number;
}

interface Trade {
  entry_time: string;
  exit_time: string;
  direction: string;
  entry_price: number;
  exit_price: number;
  pnl: number;
  rr: number;
  exit_reason: string;
  model: string;
  equity_after: number;
  position_size: number;
  confidence: number;
  symbol?: string;
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 });
}

function baseFromSymbol(sym: string): string {
  return sym.replace("USDT", "");
}

function ActionBadge({ action, hasPosition, isOffline }: { action?: string; hasPosition?: boolean; isOffline?: boolean }) {
  if (isOffline) {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">OFFLINE</span>;
  }
  if (hasPosition) {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/15 text-violet-300 border border-violet-500/20">IN TRADE</span>;
  }
  const map: Record<string, { label: string; cls: string }> = {
    scanning: { label: "SCANNING", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    blocked_hour: { label: "BLOCKED HR", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    outside_killzone: { label: "OUTSIDE KZ", cls: "bg-zinc-800/60 text-zinc-500 border-zinc-700/30" },
    daily_limit_reached: { label: "DAILY LIMIT", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    daily_sl_limit: { label: "SL LIMIT", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
    cooldown: { label: "COOLDOWN", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  };
  const m = map[action || ""] || { label: action || "IDLE", cls: "bg-zinc-800/60 text-zinc-500 border-zinc-700/30" };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.cls}`}>{m.label}</span>;
}

function SymbolCard({ symbol, data }: { symbol: SymbolId; data: BotStatus | null }) {
  const base = baseFromSymbol(symbol);
  const live = data?.state.live;
  const price = live?.price || 0;
  const equity = data?.state.equity || 0;
  const startCap = data?.state.starting_capital || 1000;
  const pnl = data?.stats.total_pnl || 0;
  const trades = data?.stats.total_trades || 0;
  const wr = data?.stats.win_rate || 0;
  const wins = data?.stats.wins || 0;
  const losses = data?.stats.losses || 0;
  const avgRR = data?.stats.avg_rr || 0;
  const pf = data ? (data.stats.worst_trade !== 0 ? "—" : "—") : "—";
  const peak = data?.state.peak_equity || startCap;
  const dd = peak > 0 ? ((peak - equity) / peak * 100) : 0;
  const hasPosition = live?.has_position || false;
  const uPnl = live?.unrealized_pnl || 0;
  const rr = live?.current_rr || 0;
  const returnPct = startCap > 0 ? ((equity - startCap) / startCap * 100) : 0;
  const lastTick = live?.last_tick;
  const tickAge = lastTick ? Math.round((Date.now() - new Date(lastTick + (lastTick.endsWith("Z") ? "" : "Z")).getTime()) / 1000) : Infinity;
  const isOffline = !lastTick || tickAge > 600;

  const borderColor = hasPosition
    ? "border-violet-500/30 shadow-[0_0_20px_-6px_rgba(139,92,246,0.2)]"
    : equity > startCap
      ? "border-emerald-500/15"
      : equity < startCap
        ? "border-red-500/15"
        : "border-zinc-800/50";

  return (
    <a href={`/?symbol=${symbol}`} className={`card p-5 flex flex-col gap-4 animate-fade-in ${borderColor}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
            hasPosition ? "bg-violet-500/15 text-violet-300" : "bg-zinc-800/80 text-zinc-300"
          }`}>
            {base}
          </div>
          <div>
            <p className="font-bold text-sm">{symbol}</p>
            <p className="text-xs text-zinc-500 font-mono tabular-nums">${formatPrice(price)}</p>
          </div>
        </div>
        <ActionBadge action={live?.action} hasPosition={hasPosition} isOffline={isOffline} />
      </div>

      {/* Position info */}
      {hasPosition && (
        <div className={`rounded-lg p-3 border ${uPnl >= 0 ? "bg-emerald-500/5 border-emerald-500/15" : "bg-red-500/5 border-red-500/15"}`}>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-zinc-500">Unrealized P&L</span>
            <span className={`text-sm font-bold font-mono tabular-nums ${uPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {uPnl >= 0 ? "+" : ""}${uPnl.toFixed(2)} ({rr >= 0 ? "+" : ""}{rr.toFixed(1)}R)
            </span>
          </div>
        </div>
      )}

      {/* Thinking */}
      {!isOffline && live?.thinking && (
        <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/40 px-3 py-2">
          <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">
            <span className="text-violet-400/70">&#x25B6;</span>{" "}
            {live.thinking}
          </p>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Equity</p>
          <p className={`text-sm font-bold font-mono tabular-nums ${equity >= startCap ? "text-emerald-400" : "text-red-400"}`}>
            ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Return</p>
          <p className={`text-sm font-bold font-mono tabular-nums ${returnPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Win Rate</p>
          <p className="text-sm font-medium font-mono tabular-nums text-zinc-200">
            {trades > 0 ? `${wr.toFixed(1)}%` : "—"}
            {trades > 0 && <span className="text-[10px] text-zinc-600 ml-1">{wins}W/{losses}L</span>}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Avg RR</p>
          <p className="text-sm font-medium font-mono tabular-nums text-zinc-200">
            {trades > 0 ? `${avgRR.toFixed(1)}R` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">P&L</p>
          <p className={`text-sm font-medium font-mono tabular-nums ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Drawdown</p>
          <p className={`text-sm font-medium font-mono tabular-nums ${dd > 10 ? "text-red-400" : dd > 5 ? "text-amber-400" : "text-zinc-400"}`}>
            {dd.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Recent trades mini-list */}
      {data && data.trades.length > 0 && (
        <div className="border-t border-zinc-800/40 pt-3">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Last Trades</p>
          <div className="space-y-1">
            {data.trades.slice(-3).reverse().map((t, i) => (
              <div key={i} className="flex justify-between items-center text-[11px]">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${t.pnl >= 0 ? "bg-emerald-400" : "bg-red-400"}`} />
                  <span className="text-zinc-500 font-mono tabular-nums">
                    {new Date(t.exit_time + (t.exit_time.endsWith("Z") ? "" : "Z")).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className={`font-mono ${t.direction === "BULLISH" ? "text-emerald-500" : "text-red-500"}`}>
                    {t.direction === "BULLISH" ? "L" : "S"}
                  </span>
                </div>
                <span className={`font-mono font-medium tabular-nums ${t.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)} ({t.rr.toFixed(1)}R)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </a>
  );
}

export default function Overview() {
  const [allData, setAllData] = useState<Record<SymbolId, BotStatus | null>>({
    BTCUSDT: null,
    ETHUSDT: null,
    SOLUSDT: null,
  });
  const [multiData, setMultiData] = useState<Record<SymbolId, BotStatus | null>>({
    BTCUSDT: null,
    ETHUSDT: null,
    SOLUSDT: null,
  });
  const [v6Data, setV6Data] = useState<Record<SymbolId, BotStatus | null>>({
    BTCUSDT: null,
    ETHUSDT: null,
    SOLUSDT: null,
  });
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  async function fetchGroup(prefix: string) {
    const res = await Promise.allSettled(
      SYMBOLS.map(async (sym) => {
        const r = await fetch(`/api/status?symbol=${sym}&prefix=${prefix}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return { sym, data: await r.json() as BotStatus };
      })
    );
    const out: Record<SymbolId, BotStatus | null> = { BTCUSDT: null, ETHUSDT: null, SOLUSDT: null };
    for (const x of res) if (x.status === "fulfilled") out[x.value.sym] = x.value.data;
    return out;
  }

  async function fetchAll() {
    // 3 multibots, each a shared $2k pool across BTC+ETH+SOL.
    setAllData(await fetchGroup("MULTI_V4"));
    setMultiData(await fetchGroup("MULTI_V5"));
    setV6Data(await fetchGroup("MULTI_V6"));
    setLastUpdate(new Date());
  }

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Shared-equity pool: all symbols of a multibot report the SAME pool equity, so equity is
  // the representative value (max), NOT a sum of silos. PnL/trades sum across symbols.
  function agg(data: Record<SymbolId, BotStatus | null>) {
    const ld = SYMBOLS.filter((s) => data[s] !== null);
    const equity = Math.max(0, ...ld.map((s) => data[s]?.state.equity || 0));
    const starting = Math.max(2000, ...ld.map((s) => data[s]?.state.starting_capital || 0));
    const pnl = ld.reduce((a, s) => a + (data[s]?.stats.total_pnl || 0), 0);
    const trades = ld.reduce((a, s) => a + (data[s]?.stats.total_trades || 0), 0);
    const wins = ld.reduce((a, s) => a + (data[s]?.stats.wins || 0), 0);
    const losses = ld.reduce((a, s) => a + (data[s]?.stats.losses || 0), 0);
    return {
      equity, starting, pnl, trades, wins, losses,
      wr: trades > 0 ? (wins / trades * 100) : 0,
      ret: starting > 0 ? ((equity - starting) / starting * 100) : 0,
      active: ld.filter((s) => data[s]?.state.live?.has_position).length,
    };
  }
  const v4 = agg(allData);
  const v5 = agg(multiData);
  const v6 = agg(v6Data);
  // Back-compat aliases for the existing v4-section markup below.
  const totalEquity = v4.equity, totalStarting = v4.starting, totalPnl = v4.pnl,
        totalTrades = v4.trades, totalWins = v4.wins, totalLosses = v4.losses,
        totalWR = v4.wr, totalReturn = v4.ret, activePositions = v4.active;
  const multiEquity = v5.equity, multiStarting = v5.starting, multiPnl = v5.pnl,
        multiTrades = v5.trades, multiWins = v5.wins, multiLosses = v5.losses,
        multiWR = v5.wr, multiReturn = v5.ret, multiActivePositions = v5.active;

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800/40 bg-zinc-950/60 glass sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between gap-x-3 gap-y-2 py-2 sm:h-14 sm:py-0 flex-wrap">
            <div className="flex items-center gap-2 sm:gap-4">
              <h1 className="text-base font-bold tracking-tight flex items-center gap-2">
                <span className="text-violet-400" style={{ textShadow: "0 0 20px rgba(139, 92, 246, 0.3)" }}>SOOB</span>
                <span className="text-zinc-500 font-normal text-sm">Overview</span>
              </h1>
              <div className="h-5 w-px bg-zinc-800/60" />
              <a href="/" className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">Single View</a>
              <a href="/checker" className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">Checker</a>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-600 ml-auto">
              {lastUpdate && (
                <span className="font-mono tabular-nums">
                  Updated {lastUpdate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                </span>
              )}
              {activePositions > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20 font-bold">
                  {activePositions} ACTIVE
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1">
        {/* Portfolio summary */}
        <div className="card-static p-5 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">v4 — Structural · shared $2k @3%</p>
            <span className="text-[10px] text-zinc-600 font-mono">{SYMBOLS.length} symbols</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Total Equity</p>
              <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${totalEquity >= totalStarting ? "text-emerald-400" : "text-red-400"}`}>
                ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-zinc-600 font-mono mt-0.5">
                of ${totalStarting.toLocaleString()} starting
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Total P&L</p>
              <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className={`text-[11px] font-mono mt-0.5 ${totalReturn >= 0 ? "text-emerald-500/60" : "text-red-500/60"}`}>
                {totalReturn >= 0 ? "+" : ""}{totalReturn.toFixed(1)}% return
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Win Rate</p>
              <p className="text-xl font-bold font-mono tabular-nums mt-1 text-zinc-200">
                {totalTrades > 0 ? `${totalWR.toFixed(1)}%` : "—"}
              </p>
              <p className="text-[11px] text-zinc-600 font-mono mt-0.5">
                {totalTrades} trades ({totalWins}W / {totalLosses}L)
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Active Positions</p>
              <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${activePositions > 0 ? "text-violet-400" : "text-zinc-500"}`}>
                {activePositions}
              </p>
              <p className="text-[11px] text-zinc-600 font-mono mt-0.5">
                of {SYMBOLS.length} symbols
              </p>
            </div>
          </div>
        </div>

        {/* ═══ v4 Bot Section (live, structural) ═══ */}
        <div className="mt-2 mb-4">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-600/30 to-transparent" />
            <h2 className="text-sm font-bold text-zinc-300 tracking-wider uppercase">
              v4 Bots — Structural
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-600/30 to-transparent" />
          </div>
        </div>

        {/* v4 symbol cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SYMBOLS.map((sym, i) => (
            <SymbolCard key={sym} symbol={sym} data={allData[sym]} />
          ))}
        </div>

        {/* Combined recent trades */}
        {(() => {
          const allTrades: (Trade & { sym: string })[] = [];
          for (const sym of SYMBOLS) {
            const d = allData[sym];
            if (d) {
              for (const t of d.trades) {
                allTrades.push({ ...t, sym });
              }
            }
          }
          allTrades.sort((a, b) => new Date(b.exit_time).getTime() - new Date(a.exit_time).getTime());
          const recentTrades = allTrades.slice(0, 20);

          if (recentTrades.length === 0) return null;

          return (
            <div className="card-static p-5 mt-6 animate-fade-in" style={{ animationDelay: "200ms" }}>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-3">All Recent Trades</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-zinc-600 border-b border-zinc-800/40">
                      <th className="text-left py-2 font-medium">Symbol</th>
                      <th className="text-left py-2 font-medium">Time</th>
                      <th className="text-left py-2 font-medium">Dir</th>
                      <th className="text-right py-2 font-medium">Entry</th>
                      <th className="text-right py-2 font-medium">P&L</th>
                      <th className="text-right py-2 font-medium">RR</th>
                      <th className="text-right py-2 font-medium">Exit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTrades.map((t, i) => (
                      <tr key={i} className="border-b border-zinc-800/20 hover:bg-zinc-800/20 transition-colors">
                        <td className="py-2 font-mono font-medium text-zinc-300">{baseFromSymbol(t.sym)}</td>
                        <td className="py-2 text-zinc-500 font-mono tabular-nums">
                          {new Date(t.exit_time + (t.exit_time.endsWith("Z") ? "" : "Z")).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                          {new Date(t.exit_time + (t.exit_time.endsWith("Z") ? "" : "Z")).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                        </td>
                        <td className={`py-2 font-mono font-bold ${t.direction === "BULLISH" ? "text-emerald-500" : "text-red-500"}`}>
                          {t.direction === "BULLISH" ? "LONG" : "SHORT"}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-zinc-400">${formatPrice(t.entry_price)}</td>
                        <td className={`py-2 text-right font-mono font-medium tabular-nums ${t.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                        </td>
                        <td className={`py-2 text-right font-mono tabular-nums ${t.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {t.rr.toFixed(1)}R
                        </td>
                        <td className="py-2 text-right text-zinc-500">{t.exit_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* ═══ v5 Bot Section ═══ */}
        <div className="mt-10 mb-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
            <h2 className="text-sm font-bold text-violet-400 tracking-wider uppercase" style={{ textShadow: "0 0 20px rgba(139, 92, 246, 0.3)" }}>
              v5 Bots — Adaptive + Trailing
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
          </div>
          <p className="text-[11px] text-zinc-600 text-center mb-4">
            shared $2,000 pool · adaptive TPs · trailing-after-partial · 3% risk
          </p>
        </div>

        {/* v5-bot portfolio summary */}
        <div className="card-static p-5 mb-6 animate-fade-in border-violet-500/10">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">v5 — shared $2k pool</p>
            {multiActivePositions > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20 text-[10px] font-bold">
                {multiActivePositions} ACTIVE
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Total Equity</p>
              <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${multiEquity >= multiStarting ? "text-emerald-400" : "text-red-400"}`}>
                ${multiEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-zinc-600 font-mono mt-0.5">
                of ${multiStarting.toLocaleString()} starting
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Total P&L</p>
              <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${multiPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {multiPnl >= 0 ? "+" : ""}${multiPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className={`text-[11px] font-mono mt-0.5 ${multiReturn >= 0 ? "text-emerald-500/60" : "text-red-500/60"}`}>
                {multiReturn >= 0 ? "+" : ""}{multiReturn.toFixed(1)}% return
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Win Rate</p>
              <p className="text-xl font-bold font-mono tabular-nums mt-1 text-zinc-200">
                {multiTrades > 0 ? `${multiWR.toFixed(1)}%` : "—"}
              </p>
              <p className="text-[11px] text-zinc-600 font-mono mt-0.5">
                {multiTrades} trades ({multiWins}W / {multiLosses}L)
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Active Positions</p>
              <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${multiActivePositions > 0 ? "text-violet-400" : "text-zinc-500"}`}>
                {multiActivePositions}
              </p>
              <p className="text-[11px] text-zinc-600 font-mono mt-0.5">
                of {SYMBOLS.length} symbols
              </p>
            </div>
          </div>
        </div>

        {/* Multi-bot per-symbol cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {SYMBOLS.map((sym) => (
            <SymbolCard key={`multi-${sym}`} symbol={sym} data={multiData[sym]} />
          ))}
        </div>

        {/* ═══ v6.1 Bot Section ═══ */}
        <div className="mt-10 mb-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
            <h2 className="text-sm font-bold text-amber-400 tracking-wider uppercase" style={{ textShadow: "0 0 20px rgba(245, 158, 11, 0.3)" }}>
              v6.1 Bots — FRESH-gated Let-run
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
          </div>
          <p className="text-[11px] text-zinc-600 text-center mb-4">
            shared $2,000 pool · FRESH→let-run · trailing runner · weekends ON · 3% risk
          </p>
        </div>

        <div className="card-static p-5 mb-6 animate-fade-in border-amber-500/10">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">v6.1 — shared $2k pool</p>
            {v6.active > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-bold">
                {v6.active} ACTIVE
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Total Equity</p>
              <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${v6.equity >= v6.starting ? "text-emerald-400" : "text-red-400"}`}>
                ${v6.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-zinc-600 font-mono mt-0.5">of ${v6.starting.toLocaleString()} starting</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Total P&L</p>
              <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${v6.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {v6.pnl >= 0 ? "+" : ""}${v6.pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className={`text-[11px] font-mono mt-0.5 ${v6.ret >= 0 ? "text-emerald-500/60" : "text-red-500/60"}`}>
                {v6.ret >= 0 ? "+" : ""}{v6.ret.toFixed(1)}% return
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Win Rate</p>
              <p className="text-xl font-bold font-mono tabular-nums mt-1 text-zinc-200">
                {v6.trades > 0 ? `${v6.wr.toFixed(1)}%` : "—"}
              </p>
              <p className="text-[11px] text-zinc-600 font-mono mt-0.5">{v6.trades} trades ({v6.wins}W / {v6.losses}L)</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Active Positions</p>
              <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${v6.active > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                {v6.active}
              </p>
              <p className="text-[11px] text-zinc-600 font-mono mt-0.5">of {SYMBOLS.length} symbols</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {SYMBOLS.map((sym) => (
            <SymbolCard key={`v6-${sym}`} symbol={sym} data={v6Data[sym]} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-800/40 py-3 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-zinc-700">
          <span>SOOB Paper Trading — v4 + v5 + v6.1 multibots (shared $2k each)</span>
          <span className="font-mono tabular-nums">Refresh: {REFRESH_INTERVAL / 1000}s</span>
        </div>
      </footer>
    </main>
  );
}
