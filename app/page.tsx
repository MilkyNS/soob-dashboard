"use client";

import { useEffect, useState } from "react";

const REFRESH_INTERVAL = 15000;

const SYMBOLS = [
  { id: "BTCUSDT", base: "BTC", quote: "USDT" },
  { id: "ETHUSDT", base: "ETH", quote: "USDT" },
  { id: "SOLUSDT", base: "SOL", quote: "USDT" },
] as const;

type SymbolId = (typeof SYMBOLS)[number]["id"];

// ── Types ──────────────────────────────────────────────────────────────────

interface Trade {
  entry_time: string;
  exit_time: string;
  direction: string;
  entry_price: number;
  exit_price: number;
  sl_price: number;
  original_sl: number;
  pnl: number;
  rr: number;
  exit_reason: string;
  model: string;
  equity_after: number;
  position_size: number;
  confidence: number;
  partial_closed: boolean;
  symbol?: string;
}

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

// ── Symbol helpers ────────────────────────────────────────────────────────

function parseSymbol(raw?: string): { base: string; quote: string } {
  const s = (raw || "BTCUSDT").toUpperCase();
  const stableCoins = ["USDT", "USDC", "BUSD", "TUSD", "USD"];
  for (const q of stableCoins) {
    if (s.endsWith(q)) {
      return { base: s.slice(0, -q.length), quote: q };
    }
  }
  return { base: s.slice(0, 3), quote: s.slice(3) };
}

function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (price >= 1) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 });
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
    <div className="flex items-center gap-1 sm:gap-2">
      {clocks.map((c) => (
        <div
          key={c.name}
          className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg border transition-all duration-300 ${
            c.isOpen
              ? "bg-emerald-500/8 border-emerald-500/20 shadow-[0_0_12px_-4px_rgba(52,211,153,0.15)]"
              : "bg-zinc-900/40 border-zinc-800/40"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              c.isOpen ? "bg-emerald-400 animate-pulse" : "bg-zinc-700"
            }`}
          />
          <span className="text-[10px] text-zinc-500 hidden sm:inline">{c.name}</span>
          <span className="text-[10px] text-zinc-500 sm:hidden">{c.flag}</span>
          <span
            className={`text-xs font-mono font-medium tabular-nums transition-colors ${
              c.isOpen ? "text-emerald-400" : "text-zinc-600"
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
  delay = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "yellow" | "default";
  large?: boolean;
  delay?: number;
}) {
  const colors = {
    green: "text-emerald-400",
    red: "text-red-400",
    yellow: "text-amber-400",
    default: "text-zinc-100",
  };
  const glows = {
    green: "hover:shadow-[0_0_20px_-6px_rgba(52,211,153,0.15)]",
    red: "hover:shadow-[0_0_20px_-6px_rgba(248,113,113,0.15)]",
    yellow: "hover:shadow-[0_0_20px_-6px_rgba(251,191,36,0.12)]",
    default: "",
  };
  return (
    <div
      className={`card p-4 animate-fade-in ${glows[accent || "default"]}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{label}</p>
      <p className={`${large ? "text-4xl" : "text-2xl"} font-bold mt-1.5 tabular-nums ${colors[accent || "default"]}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-zinc-600 mt-1">{sub}</p>}
    </div>
  );
}

function LiveBanner({ live, symbol }: { live?: LiveTick; symbol: { base: string; quote: string } }) {
  if (!live || !live.last_tick) {
    return (
      <div className="card-static p-5 animate-fade-in">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-zinc-700" />
          <span className="text-sm text-zinc-600">Waiting for bot data...</span>
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
    blocked_hour: "Blocked hour (NY 15:00)",
    idle: "Idle",
  };

  const actionText = !isAlive
    ? "Bot offline"
    : live.action.startsWith("cooldown")
      ? `Cooldown ${live.action.match(/\(.*\)/)?.[0] || ""}`
      : actionLabels[live.action] || live.action;

  const actionColor = !isAlive
    ? "text-red-400"
    : live.action === "scanning"
      ? "text-blue-400"
      : live.action === "position_open"
        ? "text-amber-400"
        : live.action === "trade_opened"
          ? "text-emerald-400"
          : live.action === "outside_killzone"
            ? "text-zinc-500"
            : "text-zinc-400";

  return (
    <div className="card-static p-5 animate-fade-in relative overflow-hidden">
      {isAlive && (
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/[0.03] via-transparent to-emerald-500/[0.03] pointer-events-none" />
      )}
      <div className="flex items-center justify-between relative">
        <div>
          <p className="text-3xl font-bold tabular-nums tracking-tight text-zinc-50">
            ${formatPrice(live.price)}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1 tracking-wide">
            {symbol.base} / {symbol.quote}
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end">
            <span
              className={`w-2 h-2 rounded-full ${
                isAlive
                  ? live.in_killzone
                    ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                    : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.3)]"
                  : "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.3)]"
              }`}
            />
            <span className={`text-sm font-medium ${actionColor}`}>
              {actionText}
            </span>
          </div>
          <p className="text-[11px] text-zinc-600 mt-1">
            NY {live.ny_hour}:00 · {isAlive ? `${tickAge}s ago` : "stale"}
          </p>
        </div>
      </div>
      {live.has_position && (
        <div className="mt-4 pt-3 border-t border-zinc-800/40 flex justify-between items-center relative">
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
      {isAlive && live.thinking && (
        <div className="mt-3 pt-3 border-t border-zinc-800/40 relative">
          <p className="text-xs text-zinc-500 font-mono leading-relaxed">
            <span className="text-violet-400/70">&#x25B6;</span>{" "}
            {live.thinking}
          </p>
        </div>
      )}
    </div>
  );
}

function PhaseIndicator({ phase, equity }: { phase: number; equity: number }) {
  const progress = phase === 1 ? Math.min((equity / 5000) * 100, 100) : 100;
  return (
    <div className="card p-4 animate-fade-in" style={{ animationDelay: "50ms" }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Phase</p>
          <p className="text-2xl font-bold mt-1.5">
            {phase === 1 ? (
              <span className="text-amber-400">1 - Building</span>
            ) : (
              <span className="text-emerald-400">2 - Harvesting</span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-600">
            {phase === 1 ? "Compound 13%" : "Flat $1,000/trade"}
          </p>
          <p className="text-xs text-zinc-600">
            {phase === 1
              ? `$${equity.toLocaleString()} / $5,000`
              : "20% of $5k"}
          </p>
        </div>
      </div>
      {phase === 1 && (
        <div className="mt-3 h-1.5 bg-zinc-800/80 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #f59e0b, #fbbf24, #fde68a)",
              boxShadow: "0 0 12px rgba(251, 191, 36, 0.3)",
            }}
          />
        </div>
      )}
    </div>
  );
}

function TradeRow({ trade, index, expanded, onToggle }: { trade: Trade; index: number; expanded: boolean; onToggle: () => void }) {
  const isWin = trade.pnl > 0;
  const dir = trade.direction === "BULLISH" ? "LONG" : "SHORT";
  const exitTime = trade.exit_time
    ? new Date(trade.exit_time + (trade.exit_time.endsWith("Z") ? "" : "Z")).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const entryTime = trade.entry_time
    ? new Date(trade.entry_time + (trade.entry_time.endsWith("Z") ? "" : "Z")).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const slDist = Math.abs(trade.entry_price - (trade.sl_price || trade.original_sl || 0));
  const slPct = trade.entry_price > 0 ? (slDist / trade.entry_price) * 100 : 0;
  const notional = (trade.position_size || 0) * trade.entry_price;

  const durationMs = trade.entry_time && trade.exit_time
    ? new Date(trade.exit_time + "Z").getTime() - new Date(trade.entry_time + "Z").getTime()
    : 0;
  const durationMin = Math.round(durationMs / 60000);
  const durationStr = durationMin >= 60
    ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
    : `${durationMin}m`;

  return (
    <div
      className="border-b border-zinc-800/20 last:border-0 animate-fade-in"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div
        onClick={onToggle}
        className="flex items-center justify-between py-3 group transition-colors hover:bg-zinc-800/20 -mx-2 px-2 rounded-lg cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-shadow ${
              dir === "LONG"
                ? "bg-emerald-400/10 text-emerald-400 group-hover:shadow-[0_0_10px_-2px_rgba(52,211,153,0.2)]"
                : "bg-red-400/10 text-red-400 group-hover:shadow-[0_0_10px_-2px_rgba(248,113,113,0.2)]"
            }`}
          >
            {dir === "LONG" ? "L" : "S"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium tabular-nums text-zinc-200">
              ${formatPrice(trade.entry_price)}
            </p>
            <p className="text-[11px] text-zinc-600">{exitTime}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right shrink-0">
            <p
              className={`text-sm font-bold tabular-nums ${isWin ? "text-emerald-400" : "text-red-400"}`}
            >
              {isWin ? "+" : ""}${trade.pnl.toFixed(2)}
            </p>
            <p className="text-[11px] text-zinc-600">
              {trade.rr.toFixed(1)}R &middot; {trade.exit_reason}
            </p>
          </div>
          <svg
            className={`w-3.5 h-3.5 text-zinc-600 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {expanded && (
        <div className="px-2 pb-3 -mx-2">
          <div className="bg-zinc-900/60 rounded-lg p-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-mono">
            <div>
              <span className="text-zinc-600">Entry</span>
              <p className="text-zinc-300 tabular-nums">${formatPrice(trade.entry_price)}</p>
              <p className="text-zinc-600">{entryTime}</p>
            </div>
            <div>
              <span className="text-zinc-600">Exit</span>
              <p className="text-zinc-300 tabular-nums">${formatPrice(trade.exit_price)}</p>
              <p className="text-zinc-600">{exitTime}</p>
            </div>
            <div>
              <span className="text-zinc-600">SL</span>
              <p className="text-zinc-300 tabular-nums">${formatPrice(trade.sl_price || trade.original_sl || 0)} ({slPct.toFixed(2)}%)</p>
            </div>
            <div>
              <span className="text-zinc-600">Duration</span>
              <p className="text-zinc-300">{durationStr}</p>
            </div>
            <div>
              <span className="text-zinc-600">Size</span>
              <p className="text-zinc-300 tabular-nums">{trade.position_size?.toFixed(2)} units</p>
            </div>
            <div>
              <span className="text-zinc-600">Notional</span>
              <p className="text-zinc-300 tabular-nums">${notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <span className="text-zinc-600">Model</span>
              <p className="text-zinc-300">{trade.model}</p>
            </div>
            <div>
              <span className="text-zinc-600">Confidence</span>
              <p className="text-zinc-300">{((trade.confidence || 1) * 100).toFixed(0)}%</p>
            </div>
            <div>
              <span className="text-zinc-600">Equity After</span>
              <p className={`tabular-nums ${isWin ? "text-emerald-400/80" : "text-red-400/80"}`}>
                ${trade.equity_after?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <span className="text-zinc-600">Partial Close</span>
              <p className="text-zinc-300">{trade.partial_closed ? "Yes" : "No"}</p>
            </div>
          </div>
        </div>
      )}
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
      <div className="card-static p-4 flex flex-col animate-fade-in" style={{ animationDelay: "100ms" }}>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
          Equity Curve
        </p>
        <div className="flex items-center justify-center text-zinc-700 text-sm h-[160px]">
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
  const lineColor = isUp ? "#34d399" : "#f87171";

  return (
    <div className="card-static p-4 flex flex-col animate-fade-in" style={{ animationDelay: "100ms" }}>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
        Equity Curve
      </p>
      <div className="h-[160px]">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
              <stop offset="60%" stopColor={lineColor} stopOpacity="0.05" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <polygon points={`0,${h} ${points} ${w},${h}`} fill="url(#eqGrad)" />
          <polyline
            points={points}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            filter="url(#glow)"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-zinc-700 tabular-nums">
        <span>${min.toFixed(0)}</span>
        <span>${max.toFixed(0)}</span>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

const EVENTS_PER_PAGE = 10;

export default function Dashboard() {
  const [activeSymbol, setActiveSymbol] = useState<SymbolId>("BTCUSDT");
  const [data, setData] = useState<BotStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [eventPage, setEventPage] = useState(0);
  const [expandedTrade, setExpandedTrade] = useState<number | null>(null);

  async function fetchData(sym: SymbolId) {
    try {
      const res = await fetch(`/api/status?symbol=${sym}`, { cache: "no-store" });
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
    setData(null);
    setEventPage(0);
    setExpandedTrade(null);
    fetchData(activeSymbol);
    const interval = setInterval(() => fetchData(activeSymbol), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [activeSymbol]);

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card-static p-6 max-w-sm w-full text-center border-red-900/30">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-red-400 font-bold">Connection Error</p>
          <p className="text-sm text-zinc-500 mt-2">{error}</p>
          <button
            onClick={() => fetchData(activeSymbol)}
            className="mt-4 px-5 py-2 bg-zinc-800/80 border border-zinc-700/50 rounded-lg text-sm hover:bg-zinc-700/80 transition-all hover:border-zinc-600/50"
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
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
          <span className="text-zinc-600 text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  const { state, stats, trades, equity_curve } = data;
  const symbol = parseSymbol(data.symbol || activeSymbol);
  const drawdownPct =
    state.peak_equity > 0
      ? ((state.peak_equity - state.equity) / state.peak_equity) * 100
      : 0;

  return (
    <main className="min-h-screen flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="border-b border-zinc-800/40 bg-zinc-950/60 glass sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-base font-bold tracking-tight flex items-center gap-2">
                  <span className="text-violet-400" style={{ textShadow: "0 0 20px rgba(139, 92, 246, 0.3)" }}>SOOB</span>
                  <span className="text-zinc-500 font-normal text-sm hidden sm:inline">Terminal</span>
                </h1>
              </div>
              <div className="h-5 w-px bg-zinc-800/60" />
              <div className="flex items-center gap-0.5 bg-zinc-900/50 rounded-lg p-0.5">
                {SYMBOLS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSymbol(s.id)}
                    className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-all duration-200 ${
                      activeSymbol === s.id
                        ? "bg-violet-500/15 text-violet-300 shadow-[0_0_10px_-3px_rgba(139,92,246,0.2)]"
                        : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50"
                    }`}
                  >
                    {s.base}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden md:block">
                <SessionBar />
              </div>
              <div className="h-5 w-px bg-zinc-800/60 hidden md:block" />
              <a
                href="/overview"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/40 border border-zinc-700/30 hover:bg-violet-500/10 hover:border-violet-500/20 transition-all duration-200 text-zinc-400 hover:text-violet-300"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                <span className="text-xs font-medium">Overview</span>
              </a>
              <a
                href={`/chart?symbol=${activeSymbol}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/40 border border-zinc-700/30 hover:bg-violet-500/10 hover:border-violet-500/20 transition-all duration-200 text-zinc-400 hover:text-violet-300"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                <span className="text-xs font-medium">Chart</span>
              </a>
              <a
                href="/checker"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/40 border border-zinc-700/30 hover:bg-violet-500/10 hover:border-violet-500/20 transition-all duration-200 text-zinc-400 hover:text-violet-300"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <span className="text-xs font-medium">Checker</span>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ── Dashboard Body ──────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1">

        {/* Live Banner — full width */}
        <LiveBanner live={state.live} symbol={symbol} />

        {/* Main grid */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* ── Left Column: Stats ──────────────────────────────────── */}
          <div className="lg:col-span-4 flex flex-col gap-4 order-1">
            <PhaseIndicator phase={data.phase} equity={state.equity} />

            <div className="grid grid-cols-2 gap-3 lg:flex-1 lg:grid-rows-2">
              <StatCard
                label="Equity"
                value={`$${state.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                sub={`Peak: $${state.peak_equity.toLocaleString()}`}
                accent={state.equity >= state.starting_capital ? "green" : "red"}
                delay={100}
              />
              <StatCard
                label="Total P&L"
                value={`${stats.total_pnl >= 0 ? "+" : ""}$${stats.total_pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                sub={`${stats.total_trades} trades`}
                accent={stats.total_pnl >= 0 ? "green" : "red"}
                delay={150}
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
                delay={200}
              />
              <StatCard
                label="Drawdown"
                value={`${drawdownPct.toFixed(1)}%`}
                sub={`Max: $${state.max_drawdown.toFixed(0)}`}
                accent={
                  drawdownPct > 20 ? "red" : drawdownPct > 10 ? "yellow" : "green"
                }
                delay={250}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Avg RR"
                value={stats.avg_rr > 0 ? `${stats.avg_rr}R` : "--"}
                delay={300}
              />
              <StatCard
                label="Best"
                value={
                  stats.best_trade > 0 ? `+$${stats.best_trade.toFixed(0)}` : "--"
                }
                accent="green"
                delay={350}
              />
              <StatCard
                label="Worst"
                value={
                  stats.worst_trade < 0
                    ? `-$${Math.abs(stats.worst_trade).toFixed(0)}`
                    : "--"
                }
                accent="red"
                delay={400}
              />
            </div>
          </div>

          {/* ── Center Column: Equity + Activity ────────────────────── */}
          <div className="lg:col-span-4 flex flex-col gap-4 order-2">
            <EquityChart
              data={equity_curve}
              startingCapital={state.starting_capital}
            />

            {/* Activity Log — paginated, fills remaining height */}
            <div className="card-static p-4 animate-fade-in lg:flex-1 flex flex-col" style={{ animationDelay: "150ms" }}>
              {(() => {
                const allEvents = [...data.recent_events].reverse();
                const totalPages = Math.max(1, Math.ceil(allEvents.length / EVENTS_PER_PAGE));
                const safePage = Math.min(eventPage, totalPages - 1);
                const pageEvents = allEvents.slice(
                  safePage * EVENTS_PER_PAGE,
                  (safePage + 1) * EVENTS_PER_PAGE
                );

                return (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
                        Activity Log
                      </p>
                      {allEvents.length > EVENTS_PER_PAGE && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setEventPage(Math.max(0, safePage - 1))}
                            disabled={safePage === 0}
                            className="px-1.5 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-300 disabled:text-zinc-800 disabled:cursor-default transition-colors"
                          >
                            ←
                          </button>
                          <span className="text-[11px] text-zinc-600 tabular-nums">
                            {safePage + 1}/{totalPages}
                          </span>
                          <button
                            onClick={() => setEventPage(Math.min(totalPages - 1, safePage + 1))}
                            disabled={safePage >= totalPages - 1}
                            className="px-1.5 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-300 disabled:text-zinc-800 disabled:cursor-default transition-colors"
                          >
                            →
                          </button>
                        </div>
                      )}
                    </div>
                    {allEvents.length === 0 ? (
                      <p className="text-center text-zinc-700 text-sm py-4 flex-1 flex items-center justify-center">No events</p>
                    ) : (
                      <div className="space-y-0.5 flex-1">
                        {pageEvents.map((evt, i) => (
                          <div
                            key={`${safePage}-${i}`}
                            className="flex justify-between text-[11px] gap-3 py-1 px-2 -mx-2 rounded-md hover:bg-zinc-800/30 transition-colors"
                          >
                            <span className="text-zinc-700 font-mono tabular-nums whitespace-nowrap">
                              {new Date(evt.time + (evt.time.endsWith("Z") ? "" : "Z")).toLocaleTimeString("en-US", {
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
                  </>
                );
              })()}
            </div>
          </div>

          {/* ── Right Column: Recent Trades ─────────────────────────── */}
          <div className="lg:col-span-4 order-3">
            <div className="card-static p-4 lg:h-full flex flex-col animate-fade-in" style={{ animationDelay: "200ms" }}>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
                Recent Trades
              </p>
              {trades.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-zinc-800/40 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  </div>
                  <p className="text-zinc-600 text-sm">No trades yet</p>
                  <p className="text-zinc-700 text-xs mt-1">Bot is scanning for setups</p>
                </div>
              ) : (
                <div className="overflow-y-auto flex-1 pr-1">
                  {[...trades]
                    .reverse()
                    .map((trade, i) => (
                      <TradeRow
                        key={i}
                        trade={trade}
                        index={i}
                        expanded={expandedTrade === i}
                        onToggle={() => setExpandedTrade(expandedTrade === i ? null : i)}
                      />
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-800/20 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <p className="text-[10px] text-zinc-700 font-mono tracking-wide">
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
