"use client";

import { useEffect, useState } from "react";

const REFRESH_INTERVAL = 15000;

// ── Types ──────────────────────────────────────────────────────────────────

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
}

interface LiveTick {
  price: number;
  action: string;
  in_killzone: boolean;
  ny_hour: number;
  last_tick: string;
  has_position: boolean;
  unrealized_pnl: number;
  current_rr: number;
}

interface BotStatus {
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

// ── Session Clocks ─────────────────────────────────────────────────────────

interface Session {
  name: string;
  tz: string;
  openHour: number;
  closeHour: number;
  flag: string;
}

const SESSIONS: Session[] = [
  { name: "New York", tz: "America/New_York", openHour: 8, closeHour: 17, flag: "US" },
  { name: "London", tz: "Europe/London", openHour: 8, closeHour: 17, flag: "GB" },
  { name: "Tokyo", tz: "Asia/Tokyo", openHour: 9, closeHour: 18, flag: "JP" },
  { name: "Sydney", tz: "Australia/Sydney", openHour: 8, closeHour: 17, flag: "AU" },
];

function useSessionClocks() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return SESSIONS.map((s) => {
    const timeStr = now.toLocaleTimeString("en-US", {
      timeZone: s.tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const hour = parseInt(
      now.toLocaleString("en-US", { timeZone: s.tz, hour: "numeric", hour12: false })
    );
    const isOpen = hour >= s.openHour && hour < s.closeHour;
    return { ...s, timeStr, isOpen, hour };
  });
}

function SessionBar() {
  const clocks = useSessionClocks();

  return (
    <div className="flex items-center gap-1 sm:gap-3">
      {clocks.map((c) => (
        <div
          key={c.name}
          className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-lg border transition-colors ${
            c.isOpen
              ? "bg-emerald-500/5 border-emerald-500/20"
              : "bg-zinc-900/50 border-zinc-800/50"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              c.isOpen ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
            }`}
          />
          <span className="text-[10px] text-zinc-500 hidden sm:inline">{c.name}</span>
          <span className="text-[10px] text-zinc-500 sm:hidden">{c.flag}</span>
          <span
            className={`text-xs font-mono font-medium tabular-nums ${
              c.isOpen ? "text-emerald-400" : "text-zinc-500"
            }`}
          >
            {c.timeStr}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Components ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
  large,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "yellow" | "default";
  large?: boolean;
}) {
  const colors = {
    green: "text-emerald-400",
    red: "text-red-400",
    yellow: "text-amber-400",
    default: "text-white",
  };
  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-xl p-4">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{label}</p>
      <p className={`${large ? "text-3xl" : "text-xl"} font-bold mt-1 tabular-nums ${colors[accent || "default"]}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

function LiveBanner({ live }: { live?: LiveTick }) {
  if (!live || !live.last_tick) {
    return (
      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-zinc-600" />
          <span className="text-sm text-zinc-500">Waiting for bot data...</span>
        </div>
      </div>
    );
  }

  const tickAge = Math.round(
    (Date.now() - new Date(live.last_tick + "Z").getTime()) / 1000
  );
  const isAlive = tickAge < 600;

  const actionLabels: Record<string, string> = {
    scanning: "Scanning for setups",
    outside_killzone: "Outside killzone",
    position_open: "Position open",
    position_closed: "Position just closed",
    trade_opened: "Trade opened!",
    signal_pending_fill: "Signal found - waiting for fill",
    daily_limit_reached: "Daily trade limit reached",
    daily_sl_limit: "Daily SL limit reached",
    idle: "Idle",
  };

  const actionText = live.action.startsWith("cooldown")
    ? `Cooldown ${live.action.match(/\(.*\)/)?.[0] || ""}`
    : actionLabels[live.action] || live.action;

  const actionColor =
    live.action === "scanning"
      ? "text-blue-400"
      : live.action === "position_open"
        ? "text-amber-400"
        : live.action === "trade_opened"
          ? "text-emerald-400"
          : live.action === "outside_killzone"
            ? "text-zinc-500"
            : "text-zinc-400";

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold tabular-nums tracking-tight">
            ${live.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">BTC / USDT</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end">
            <span
              className={`w-2 h-2 rounded-full ${
                isAlive
                  ? live.in_killzone
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-emerald-400"
                  : "bg-red-400"
              }`}
            />
            <span className={`text-sm font-medium ${actionColor}`}>
              {actionText}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            NY {live.ny_hour}:00 {live.in_killzone ? "(KZ)" : ""} · {isAlive ? `${tickAge}s ago` : "stale"}
          </p>
        </div>
      </div>
      {live.has_position && (
        <div className="mt-4 pt-3 border-t border-zinc-800/50 flex justify-between items-center">
          <span className="text-xs text-zinc-500">Unrealized P&L</span>
          <span
            className={`text-lg font-bold tabular-nums ${
              live.unrealized_pnl >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {live.unrealized_pnl >= 0 ? "+" : ""}${live.unrealized_pnl.toFixed(2)} ({live.current_rr >= 0 ? "+" : ""}{live.current_rr.toFixed(1)}R)
          </span>
        </div>
      )}
    </div>
  );
}

function PhaseIndicator({ phase, equity }: { phase: number; equity: number }) {
  const progress = phase === 1 ? Math.min((equity / 5000) * 100, 100) : 100;
  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Phase</p>
          <p className="text-xl font-bold mt-1">
            {phase === 1 ? (
              <span className="text-amber-400">1 - Building</span>
            ) : (
              <span className="text-emerald-400">2 - Harvesting</span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-zinc-500">
            {phase === 1 ? "Compound 13%" : "Flat $1,000/trade"}
          </p>
          <p className="text-[11px] text-zinc-500">
            {phase === 1
              ? `$${equity.toLocaleString()} / $5,000`
              : "20% of $5k"}
          </p>
        </div>
      </div>
      {phase === 1 && (
        <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const isWin = trade.pnl > 0;
  const time = trade.exit_time
    ? new Date(trade.exit_time).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="flex items-center justify-between py-3 border-b border-zinc-800/30 last:border-0">
      <div className="flex items-center gap-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
            trade.direction === "LONG"
              ? "bg-emerald-400/10 text-emerald-400"
              : "bg-red-400/10 text-red-400"
          }`}
        >
          {trade.direction === "LONG" ? "L" : "S"}
        </div>
        <div>
          <p className="text-sm font-medium tabular-nums">
            ${trade.entry_price.toLocaleString()}
          </p>
          <p className="text-[11px] text-zinc-500">{time}</p>
        </div>
      </div>
      <div className="text-right">
        <p
          className={`text-sm font-bold tabular-nums ${isWin ? "text-emerald-400" : "text-red-400"}`}
        >
          {isWin ? "+" : ""}${trade.pnl.toFixed(2)}
        </p>
        <p className="text-[11px] text-zinc-500">
          {trade.rr.toFixed(1)}R &middot; {trade.exit_reason}
        </p>
      </div>
    </div>
  );
}

function EquityChart({
  data,
  startingCapital,
}: {
  data: { time: string; equity: number }[];
  startingCapital: number;
}) {
  if (data.length === 0) {
    return (
      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-xl p-4 h-full flex flex-col">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
          Equity Curve
        </p>
        <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm min-h-[160px]">
          No trades yet
        </div>
      </div>
    );
  }

  const values = [startingCapital, ...data.map((d) => d.equity)];
  const min = Math.min(...values) * 0.95;
  const max = Math.max(...values) * 1.05;
  const range = max - min || 1;
  const h = 160;
  const w = 100;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  const lastEquity = values[values.length - 1];
  const isUp = lastEquity >= startingCapital;

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-xl p-4 h-full flex flex-col">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
        Equity Curve
      </p>
      <div className="flex-1 min-h-[160px]">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={isUp ? "#34d399" : "#f87171"}
                stopOpacity="0.25"
              />
              <stop
                offset="100%"
                stopColor={isUp ? "#34d399" : "#f87171"}
                stopOpacity="0"
              />
            </linearGradient>
          </defs>
          <polygon points={`0,${h} ${points} ${w},${h}`} fill="url(#eqGrad)" />
          <polyline
            points={points}
            fill="none"
            stroke={isUp ? "#34d399" : "#f87171"}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-zinc-600 tabular-nums">
        <span>${min.toFixed(0)}</span>
        <span>${max.toFixed(0)}</span>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<BotStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  async function fetchData() {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-6 max-w-sm w-full text-center">
          <p className="text-red-400 font-bold">Connection Error</p>
          <p className="text-sm text-zinc-400 mt-2">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading...</div>
      </div>
    );
  }

  const { state, stats, trades, equity_curve } = data;
  const drawdownPct =
    state.peak_equity > 0
      ? ((state.peak_equity - state.equity) / state.peak_equity) * 100
      : 0;

  return (
    <main className="min-h-screen">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="border-b border-zinc-800/60 bg-zinc-900/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-base font-bold tracking-tight flex items-center gap-2">
                  <span className="text-violet-400">SOOB</span>
                  <span className="text-zinc-400 font-normal text-sm hidden sm:inline">Terminal</span>
                </h1>
              </div>
              <div className="h-5 w-px bg-zinc-800 hidden sm:block" />
              <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest hidden sm:inline">
                Paper Trading
              </span>
            </div>

            <div className="flex items-center gap-3">
              <SessionBar />
              <div className="h-5 w-px bg-zinc-800" />
              <a
                href="/chart"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40 hover:bg-zinc-700/60 transition-colors text-zinc-400 hover:text-white"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                <span className="text-xs font-medium">Chart</span>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ── Dashboard Body ──────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Live Banner — full width */}
        <LiveBanner live={state.live} />

        {/* Main grid: 3 columns on desktop */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* ── Left Column: Stats ──────────────────────────────────── */}
          <div className="lg:col-span-4 space-y-4">
            <PhaseIndicator phase={data.phase} equity={state.equity} />

            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Equity"
                value={`$${state.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                sub={`Peak: $${state.peak_equity.toLocaleString()}`}
                accent={state.equity >= state.starting_capital ? "green" : "red"}
              />
              <StatCard
                label="Total P&L"
                value={`${stats.total_pnl >= 0 ? "+" : ""}$${stats.total_pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                sub={`${stats.total_trades} trades`}
                accent={stats.total_pnl >= 0 ? "green" : "red"}
              />
              <StatCard
                label="Win Rate"
                value={stats.total_trades > 0 ? `${stats.win_rate}%` : "--"}
                sub={`${stats.wins}W / ${stats.losses}L`}
                accent={
                  stats.win_rate >= 70
                    ? "green"
                    : stats.win_rate >= 50
                      ? "yellow"
                      : "red"
                }
              />
              <StatCard
                label="Drawdown"
                value={`${drawdownPct.toFixed(1)}%`}
                sub={`Max: $${state.max_drawdown.toFixed(0)}`}
                accent={
                  drawdownPct > 20 ? "red" : drawdownPct > 10 ? "yellow" : "green"
                }
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Avg RR"
                value={stats.avg_rr > 0 ? `${stats.avg_rr}R` : "--"}
              />
              <StatCard
                label="Best"
                value={
                  stats.best_trade > 0 ? `+$${stats.best_trade.toFixed(0)}` : "--"
                }
                accent="green"
              />
              <StatCard
                label="Worst"
                value={
                  stats.worst_trade < 0
                    ? `-$${Math.abs(stats.worst_trade).toFixed(0)}`
                    : "--"
                }
                accent="red"
              />
            </div>
          </div>

          {/* ── Center Column: Equity + Activity ────────────────────── */}
          <div className="lg:col-span-4 space-y-4">
            <EquityChart
              data={equity_curve}
              startingCapital={state.starting_capital}
            />

            {/* Activity Log */}
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-xl p-4">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
                Activity Log
              </p>
              {data.recent_events.length === 0 ? (
                <p className="text-center text-zinc-600 text-sm py-4">No events</p>
              ) : (
                <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                  {[...data.recent_events]
                    .reverse()
                    .slice(0, 15)
                    .map((evt, i) => (
                      <div key={i} className="flex justify-between text-[11px] gap-4">
                        <span className="text-zinc-600 font-mono tabular-nums whitespace-nowrap">
                          {new Date(evt.time).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          })}
                        </span>
                        <span className="text-zinc-400 truncate">{evt.event}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right Column: Trades ────────────────────────────────── */}
          <div className="lg:col-span-4">
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-xl p-4 h-full">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
                Recent Trades
              </p>
              {trades.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-zinc-800/50 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  </div>
                  <p className="text-zinc-600 text-sm">No trades yet</p>
                  <p className="text-zinc-700 text-xs mt-1">Bot is scanning for setups</p>
                </div>
              ) : (
                <div className="max-h-[480px] overflow-y-auto">
                  {[...trades]
                    .reverse()
                    .map((trade, i) => <TradeRow key={i} trade={trade} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-800/30 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <p className="text-[10px] text-zinc-700 font-mono">
            PAPER MODE — No real money at risk
          </p>
          {lastUpdate && (
            <p className="text-[10px] text-zinc-700 font-mono">
              Updated {Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s ago
            </p>
          )}
        </div>
      </footer>
    </main>
  );
}
