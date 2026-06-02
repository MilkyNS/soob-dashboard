"use client";

import { useEffect, useState } from "react";

const REFRESH_INTERVAL = 30000;

interface SymbolResult {
  symbol: string;
  verdict: string;
  replay_signals: number;
  bot_trades: number;
  matched: number;
  missed: number;
  phantom: number;
  missed_details: MissedDetail[];
  phantom_details: PhantomDetail[];
}

interface MissedDetail {
  time: string;
  direction: string;
  entry_price: number;
  model?: string;
}

interface PhantomDetail {
  time: string;
  direction: string;
  entry_price: number;
  pnl?: number;
}

interface ReconRun {
  run_at: string;
  window_hours: number;
  overall: string;
  results: SymbolResult[];
}

interface ReconData {
  status: string;
  latest: {
    single?: ReconRun;
    v4?: ReconRun;
    v5?: ReconRun;
    v6?: ReconRun;
  };
  error?: string;
}

function verdictColor(verdict: string): string {
  switch (verdict) {
    case "CLEAN": return "text-emerald-400";
    case "MISMATCH": return "text-red-400";
    case "ERROR": return "text-amber-400";
    default: return "text-zinc-500";
  }
}

function verdictBg(verdict: string): string {
  switch (verdict) {
    case "CLEAN": return "bg-emerald-500/10 border-emerald-500/20";
    case "MISMATCH": return "bg-red-500/10 border-red-500/20";
    case "ERROR": return "bg-amber-500/10 border-amber-500/20";
    default: return "bg-zinc-800/60 border-zinc-700/30";
  }
}

function verdictIcon(verdict: string) {
  switch (verdict) {
    case "CLEAN":
      return (
        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "MISMATCH":
      return (
        <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      );
    case "ERROR":
      return (
        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      );
    default:
      return (
        <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
      );
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ${min % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTime(iso: string): string {
  return new Date(iso + (iso.endsWith("Z") ? "" : "Z")).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 });
}

function StatusHero({ run, label }: { run?: ReconRun; label: string }) {
  if (!run) {
    return (
      <div className="card-static p-6 animate-fade-in">
        <div className="flex items-center gap-3">
          {verdictIcon("NOT_RUN")}
          <div>
            <p className="text-sm font-medium text-zinc-400">{label}</p>
            <p className="text-xs text-zinc-600">No reconciliation data available</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`card-static p-6 animate-fade-in border ${verdictBg(run.overall)}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {verdictIcon(run.overall)}
          <div>
            <p className="text-sm font-medium text-zinc-300">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${verdictColor(run.overall)}`}>
              {run.overall}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">{timeAgo(run.run_at)}</p>
          <p className="text-[11px] text-zinc-600 font-mono mt-0.5">{formatTime(run.run_at)}</p>
          <p className="text-[11px] text-zinc-700 mt-0.5">Window: {run.window_hours}h</p>
        </div>
      </div>
    </div>
  );
}

function SymbolCard({ result, delay }: { result: SymbolResult; delay: number }) {
  const [expanded, setExpanded] = useState(false);
  const base = result.symbol.replace("USDT", "");
  const hasMismatches = result.missed > 0 || result.phantom > 0;

  return (
    <div
      className={`card p-5 animate-fade-in ${hasMismatches ? "border-red-500/20" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
            result.verdict === "CLEAN"
              ? "bg-emerald-500/10 text-emerald-400"
              : result.verdict === "MISMATCH"
                ? "bg-red-500/10 text-red-400"
                : "bg-amber-500/10 text-amber-400"
          }`}>
            {base}
          </div>
          <div>
            <p className="font-bold text-sm">{result.symbol}</p>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${verdictBg(result.verdict)} ${verdictColor(result.verdict)}`}>
              {result.verdict}
            </span>
          </div>
        </div>
        {verdictIcon(result.verdict)}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/40 p-3 text-center">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Replay</p>
          <p className="text-lg font-bold font-mono tabular-nums text-zinc-200 mt-0.5">{result.replay_signals}</p>
        </div>
        <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/40 p-3 text-center">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Bot</p>
          <p className="text-lg font-bold font-mono tabular-nums text-zinc-200 mt-0.5">{result.bot_trades}</p>
        </div>
        <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/40 p-3 text-center">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Matched</p>
          <p className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
            result.matched === result.replay_signals && result.matched === result.bot_trades
              ? "text-emerald-400"
              : "text-amber-400"
          }`}>
            {result.matched}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-lg p-3 border ${result.missed > 0 ? "bg-red-500/5 border-red-500/15" : "bg-zinc-900/50 border-zinc-800/40"}`}>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Missed</p>
          <p className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${result.missed > 0 ? "text-red-400" : "text-zinc-500"}`}>
            {result.missed}
          </p>
          <p className="text-[10px] text-zinc-700 mt-0.5">Signals bot didn&apos;t take</p>
        </div>
        <div className={`rounded-lg p-3 border ${result.phantom > 0 ? "bg-amber-500/5 border-amber-500/15" : "bg-zinc-900/50 border-zinc-800/40"}`}>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Phantom</p>
          <p className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${result.phantom > 0 ? "text-amber-400" : "text-zinc-500"}`}>
            {result.phantom}
          </p>
          <p className="text-[10px] text-zinc-700 mt-0.5">Trades replay didn&apos;t see</p>
        </div>
      </div>

      {hasMismatches && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800/40 border border-zinc-700/30 hover:bg-zinc-700/40 transition-all text-xs text-zinc-400 hover:text-zinc-300"
        >
          {expanded ? "Hide" : "Show"} Details
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {expanded && (
        <div className="mt-3 space-y-3">
          {result.missed_details.length > 0 && (
            <div>
              <p className="text-[10px] text-red-400 uppercase tracking-wider font-medium mb-1.5">Missed Signals</p>
              <div className="space-y-1">
                {result.missed_details.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] py-1.5 px-2 rounded-md bg-red-500/5 border border-red-500/10">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-bold ${d.direction === "BULLISH" ? "text-emerald-500" : "text-red-500"}`}>
                        {d.direction === "BULLISH" ? "L" : "S"}
                      </span>
                      <span className="text-zinc-400 font-mono tabular-nums">${formatPrice(d.entry_price)}</span>
                    </div>
                    <span className="text-zinc-600 font-mono tabular-nums">{formatTime(d.time)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.phantom_details.length > 0 && (
            <div>
              <p className="text-[10px] text-amber-400 uppercase tracking-wider font-medium mb-1.5">Phantom Trades</p>
              <div className="space-y-1">
                {result.phantom_details.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] py-1.5 px-2 rounded-md bg-amber-500/5 border border-amber-500/10">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-bold ${d.direction === "BULLISH" ? "text-emerald-500" : "text-red-500"}`}>
                        {d.direction === "BULLISH" ? "L" : "S"}
                      </span>
                      <span className="text-zinc-400 font-mono tabular-nums">${formatPrice(d.entry_price)}</span>
                      {d.pnl !== undefined && (
                        <span className={`font-mono tabular-nums ${(d.pnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {(d.pnl ?? 0) >= 0 ? "+" : ""}${d.pnl?.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <span className="text-zinc-600 font-mono tabular-nums">{formatTime(d.time)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Checker() {
  const [data, setData] = useState<ReconData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  async function fetchData() {
    try {
      const res = await fetch("/api/reconciliation", { cache: "no-store" });
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
        <div className="card-static p-6 max-w-sm w-full text-center border-red-900/30">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-red-400 font-bold">Connection Error</p>
          <p className="text-sm text-zinc-500 mt-2">{error}</p>
          <button
            onClick={fetchData}
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

  const singleRun = data.latest?.v4 ?? data.latest?.single;
  const v5Run = data.latest?.v5;
  const v6Run = data.latest?.v6;

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800/40 bg-zinc-950/60 glass sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <h1 className="text-base font-bold tracking-tight flex items-center gap-2">
                <span className="text-violet-400" style={{ textShadow: "0 0 20px rgba(139, 92, 246, 0.3)" }}>SOOB</span>
                <span className="text-zinc-500 font-normal text-sm">Checker</span>
              </h1>
              <div className="h-5 w-px bg-zinc-800/60" />
              <a href="/" className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">Single View</a>
              <a href="/overview" className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">Overview</a>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-600">
              {lastUpdate && (
                <span className="font-mono tabular-nums">
                  Updated {lastUpdate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${verdictBg(data.status)} ${verdictColor(data.status)}`}>
                {data.status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1">
        {/* Explainer */}
        <div className="card-static p-4 mb-6 animate-fade-in">
          <div className="flex items-start gap-3">
            <svg className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Signal replay runs independently on the server, replaying market data through the same signal engine.
              It compares what the bot <em>actually traded</em> vs what it <em>should have traded</em>.
              <strong className="text-zinc-400"> CLEAN</strong> = perfect match.
              <strong className="text-red-400"> MISMATCH</strong> = divergence detected.
            </p>
          </div>
        </div>

        {/* v4 Bot Section */}
        <StatusHero run={singleRun} label="v4 Bots — Structural" />
        {singleRun && singleRun.results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {singleRun.results.map((r, i) => (
              <SymbolCard key={r.symbol} result={r} delay={i * 80} />
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="mt-10 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
            <span className="text-sm font-bold text-violet-400 tracking-wider uppercase" style={{ textShadow: "0 0 20px rgba(139, 92, 246, 0.3)" }}>
              v5 Bots — Adaptive + Trailing
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
          </div>
        </div>

        {/* v5 Bot Section */}
        <StatusHero run={v5Run} label="v5 Bots — Adaptive + Trailing" />
        {v5Run && v5Run.results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {v5Run.results.map((r, i) => (
              <SymbolCard key={r.symbol} result={r} delay={i * 80} />
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="mt-10 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
            <span className="text-sm font-bold text-amber-400 tracking-wider uppercase" style={{ textShadow: "0 0 20px rgba(245, 158, 11, 0.3)" }}>
              v6.1 Bots — FRESH-gated Let-run
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
          </div>
        </div>

        {/* v6 Bot Section */}
        <StatusHero run={v6Run} label="v6.1 Bots — FRESH-gated Let-run" />
        {v6Run && v6Run.results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {v6Run.results.map((r, i) => (
              <SymbolCard key={r.symbol} result={r} delay={i * 80} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-800/20 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <p className="text-[10px] text-zinc-700 font-mono tracking-wide">
            RECONCILIATION — Signal Replay vs Live Bot
          </p>
          <p className="text-[10px] text-zinc-700 font-mono">
            Refresh: {REFRESH_INTERVAL / 1000}s
          </p>
        </div>
      </footer>
    </main>
  );
}
