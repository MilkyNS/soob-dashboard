"use client";

import { useEffect, useState, type ReactNode } from "react";

const REFRESH = 15000;

// ---- forward strategy types (A/B/C/D/E) ----
interface FwdPos { symbol: string; side: string; weight: number; notional: number; entry: number; current: number; upnl_pct: number; opened: string; }
interface FwdTrade { symbol: string; side: string; entry: number; exit: number; pnl_pct: number; opened: string; closed: string; }
interface Leg { name: string; label: string; equity: number; ret_pct: number; }
interface FwdStrat {
  name: string; label: string; desc: string; group: string;
  equity: number; settled: number; ret_pct: number; live_ret: number;
  fwd_sharpe: number; runs: number; n_pos: number; longs: number; shorts: number; gross: number;
  leverage?: number; mkt_up?: boolean; updated: string;
  equity_curve: { time: string; equity: number }[];
  open_positions: FwdPos[]; closed_trades: FwdTrade[]; legs?: Leg[];
}
interface FwdData { strategies: FwdStrat[]; error?: string; }

// ---- legacy 3-sleeve types ----
interface Sleeve { name: string; equity: number; pnl: number; pnl_pct: number; positions: number; desc: string; }
interface LegacyPos { sleeve: string; symbol: string; side: string; notional: number; entry: number; current: number; upnl: number; upnl_pct: number; opened: string; }
interface LegacyTrade { sleeve: string; symbol: string; side: string; entry: number; exit: number; pnl: number; opened: string; closed: string; }
interface Legacy {
  stats: { equity: number; ret_pct: number; dd_pct: number; n_positions: number; longs: number; shorts: number; open_upnl: number; realized_pnl: number; fees: number; closed_trades: number; leverage: number; since: string; updated: string; };
  sleeves: Sleeve[]; equity_curve: { time: string; equity: number }[]; open_positions: LegacyPos[]; closed_trades: LegacyTrade[]; error?: string;
}

const usd0 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const sign = (n: number) => (n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-neutral-300");
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n}%`;
const pnlStr = (n: number) => `${n >= 0 ? "+" : ""}${usd(n)}`;

function EquityChart({ points }: { points: { time: string; equity: number }[] }) {
  if (points.length < 2) return <div className="py-8 text-center text-sm text-neutral-500">Equity curve builds as the bot runs — check back tomorrow.</div>;
  const eqs = points.map((p) => p.equity);
  const lo = Math.min(...eqs, 10000), hi = Math.max(...eqs, 10000);
  const pad = Math.max((hi - lo) * 0.25, 25);
  const min = lo - pad, max = hi + pad, span = max - min;
  const W = 760, H = 200, m = 4;
  const x = (i: number) => m + (i / (points.length - 1)) * (W - 2 * m);
  const y = (e: number) => m + (1 - (e - min) / span) * (H - 2 * m);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(" ");
  const up = eqs[eqs.length - 1] >= 10000;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none">
        <line x1={m} y1={y(10000)} x2={W - m} y2={y(10000)} stroke="#3f3f46" strokeWidth="1" strokeDasharray="4 4" />
        <path d={path} fill="none" stroke={up ? "#34d399" : "#f87171"} strokeWidth="2" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-neutral-500">
        <span>low {usd0(Math.min(...eqs))}</span><span className="text-neutral-600">— $10,000 start</span><span>high {usd0(Math.max(...eqs))}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${tone === undefined ? "text-neutral-100" : sign(tone)}`}>{value}</div>
    </div>
  );
}

function Th({ children, r }: { children: ReactNode; r?: boolean }) {
  return <th className={`px-3 py-2 ${r ? "text-right" : "text-left"}`}>{children}</th>;
}

function StrategyDetail({ st }: { st: FwdStrat }) {
  const [tab, setTab] = useState<"open" | "closed">("open");
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">{st.label}</div>
          <div className="mt-0.5 max-w-xl text-xs leading-snug text-neutral-500">{st.desc}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">{usd0(st.equity)} <span className={`text-base ${sign(st.ret_pct)}`}>{pct(st.ret_pct)}</span></div>
          <div className="text-[11px] text-neutral-500">today <span className={sign(st.live_ret)}>{pct(st.live_ret)}</span> · settled {usd0(st.settled)} · {st.updated || "—"} UTC</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Fwd Sharpe" value={st.runs > 5 ? st.fwd_sharpe.toFixed(2) : "—"} tone={st.runs > 5 ? st.fwd_sharpe : undefined} />
        <Stat label="Days Live" value={`${st.runs}`} />
        <Stat label={st.leverage !== undefined ? "Gross · Gate" : "Gross Exp"} value={st.leverage !== undefined ? `${st.gross}× · ${st.leverage}${st.mkt_up ? "↑" : "↓"}` : `${st.gross}×`} />
        <Stat label="Long / Short" value={`${st.longs} / ${st.shorts}`} />
      </div>

      <div className="mt-4"><EquityChart points={st.equity_curve} /></div>

      {st.group === "barbell" && st.legs && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          <span className="text-neutral-500">Sleeves:</span>
          {st.legs.map((l) => <span key={l.name} className="rounded border border-neutral-800 px-2 py-0.5" title={l.label}>{l.name} <span className={sign(l.ret_pct)}>{pct(l.ret_pct)}</span></span>)}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {(["open", "closed"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md border px-3 py-1.5 text-sm ${tab === t ? "border-sky-500 bg-sky-950/40 text-neutral-100" : "border-neutral-800 bg-neutral-900/40 text-neutral-400"}`}>
            {t === "open" ? `Open positions (${st.open_positions.length})` : `Closed trades (${st.closed_trades.length})`}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-800">
        {tab === "open" ? (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-neutral-500"><tr className="border-b border-neutral-800/70">
              <Th>Coin</Th><Th>Side</Th><Th r>Weight</Th><Th r>Notional</Th><Th r>Entry</Th><Th r>Current</Th><Th r>uPnL</Th><Th r>Opened</Th></tr></thead>
            <tbody className="tabular-nums">
              {st.open_positions.map((p, i) => (
                <tr key={i} className="border-b border-neutral-900/60">
                  <td className="px-3 py-1.5 font-medium">{p.symbol}</td>
                  <td className={`px-3 py-1.5 ${p.side === "long" ? "text-emerald-400" : "text-red-400"}`}>{p.side}</td>
                  <td className="px-3 py-1.5 text-right text-neutral-400">{p.weight}</td>
                  <td className="px-3 py-1.5 text-right text-neutral-300">{usd0(p.notional)}</td>
                  <td className="px-3 py-1.5 text-right text-neutral-500">{p.entry}</td>
                  <td className="px-3 py-1.5 text-right text-neutral-300">{p.current}</td>
                  <td className={`px-3 py-1.5 text-right ${sign(p.upnl_pct)}`}>{pct(p.upnl_pct)}</td>
                  <td className="px-3 py-1.5 text-right text-neutral-600">{p.opened}</td>
                </tr>
              ))}
              {!st.open_positions.length && <tr><td colSpan={8} className="px-3 py-4 text-center text-neutral-500">Flat / in cash.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-neutral-500"><tr className="border-b border-neutral-800/70">
              <Th>Coin</Th><Th>Side</Th><Th r>Entry</Th><Th r>Exit</Th><Th r>Realized</Th><Th r>Held</Th></tr></thead>
            <tbody className="tabular-nums">
              {st.closed_trades.map((t, i) => (
                <tr key={i} className="border-b border-neutral-900/60">
                  <td className="px-3 py-1.5 font-medium">{t.symbol}</td>
                  <td className={`px-3 py-1.5 ${t.side === "long" ? "text-emerald-400" : "text-red-400"}`}>{t.side}</td>
                  <td className="px-3 py-1.5 text-right text-neutral-500">{t.entry}</td>
                  <td className="px-3 py-1.5 text-right text-neutral-300">{t.exit}</td>
                  <td className={`px-3 py-1.5 text-right ${sign(t.pnl_pct)}`}>{pct(t.pnl_pct)}</td>
                  <td className="px-3 py-1.5 text-right text-neutral-600">{t.opened?.slice(5)} → {t.closed?.slice(5)}</td>
                </tr>
              ))}
              {!st.closed_trades.length && <tr><td colSpan={6} className="px-3 py-4 text-center text-neutral-500">No closed trades yet — positions close when the daily ranking changes.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function LegacyDetail({ d }: { d: Legacy }) {
  const s = d.stats;
  const [tab, setTab] = useState<"open" | "closed">("open");
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
      <div className="text-lg font-semibold">Legacy · 3-Sleeve <span className="text-xs font-normal text-neutral-500">(AsterDEX paper bot — being retired)</span></div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Equity" value={usd0(s.equity)} />
        <Stat label="Return" value={pct(s.ret_pct)} tone={s.ret_pct} />
        <Stat label="Open uPnL" value={pnlStr(s.open_upnl)} tone={s.open_upnl} />
        <Stat label="Realized" value={pnlStr(s.realized_pnl)} tone={s.realized_pnl} />
        <Stat label="Leverage" value={`${s.leverage}×`} />
        <Stat label="Max DD" value={`${s.dd_pct}%`} tone={-1} />
      </div>
      <div className="mt-4"><EquityChart points={d.equity_curve} /></div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {d.sleeves.map((sl) => (
          <div key={sl.name} className="rounded-lg border border-neutral-800 px-3 py-2">
            <div className="flex justify-between"><span className="font-medium capitalize">{sl.name}</span><span className={`tabular-nums ${sign(sl.pnl)}`}>{pnlStr(sl.pnl)}</span></div>
            <div className="mt-0.5 text-xs text-neutral-500">{usd0(sl.equity)} · {sl.positions} positions</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        {(["open", "closed"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md border px-3 py-1.5 text-sm ${tab === t ? "border-sky-500 bg-sky-950/40 text-neutral-100" : "border-neutral-800 bg-neutral-900/40 text-neutral-400"}`}>
            {t === "open" ? `Open positions (${d.open_positions.length})` : `Closed trades (${s.closed_trades})`}
          </button>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-800">
        {tab === "open" ? (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-neutral-500"><tr className="border-b border-neutral-800/70">
              <Th>Sleeve</Th><Th>Coin</Th><Th>Side</Th><Th r>Notional</Th><Th r>Entry</Th><Th r>Current</Th><Th r>uPnL</Th></tr></thead>
            <tbody className="tabular-nums">
              {d.open_positions.map((p, i) => (
                <tr key={i} className="border-b border-neutral-900/60">
                  <td className="px-3 py-1.5 capitalize text-neutral-400">{p.sleeve}</td><td className="px-3 py-1.5 font-medium">{p.symbol}</td>
                  <td className={`px-3 py-1.5 ${p.side === "long" ? "text-emerald-400" : "text-red-400"}`}>{p.side}</td>
                  <td className="px-3 py-1.5 text-right text-neutral-300">{usd0(p.notional)}</td>
                  <td className="px-3 py-1.5 text-right text-neutral-500">{p.entry}</td><td className="px-3 py-1.5 text-right text-neutral-300">{p.current}</td>
                  <td className={`px-3 py-1.5 text-right ${sign(p.upnl)}`}>{pnlStr(p.upnl)} <span className="text-neutral-600">({p.upnl_pct}%)</span></td>
                </tr>
              ))}
              {!d.open_positions.length && <tr><td colSpan={7} className="px-3 py-4 text-center text-neutral-500">No open positions.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-neutral-500"><tr className="border-b border-neutral-800/70">
              <Th>Sleeve</Th><Th>Coin</Th><Th>Side</Th><Th r>Entry</Th><Th r>Exit</Th><Th r>Realized</Th><Th r>Closed</Th></tr></thead>
            <tbody className="tabular-nums">
              {d.closed_trades.map((t, i) => (
                <tr key={i} className="border-b border-neutral-900/60">
                  <td className="px-3 py-1.5 capitalize text-neutral-400">{t.sleeve}</td><td className="px-3 py-1.5 font-medium">{t.symbol}</td>
                  <td className={`px-3 py-1.5 ${t.side === "long" ? "text-emerald-400" : "text-red-400"}`}>{t.side}</td>
                  <td className="px-3 py-1.5 text-right text-neutral-500">{t.entry}</td><td className="px-3 py-1.5 text-right text-neutral-300">{t.exit}</td>
                  <td className={`px-3 py-1.5 text-right ${sign(t.pnl)}`}>{pnlStr(t.pnl)}</td><td className="px-3 py-1.5 text-right text-neutral-600">{t.closed?.slice(5, 10)}</td>
                </tr>
              ))}
              {!d.closed_trades.length && <tr><td colSpan={7} className="px-3 py-4 text-center text-neutral-500">No closed trades yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  const [fwd, setFwd] = useState<FwdData | null>(null);
  const [legacy, setLegacy] = useState<Legacy | null>(null);
  const [cur, setCur] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [rf, rc] = await Promise.all([fetch("/api/forward", { cache: "no-store" }), fetch("/api/cport", { cache: "no-store" })]);
        const jf = await rf.json().catch(() => null);
        const jc = await rc.json().catch(() => null);
        if (!alive) return;
        if (jf && !jf.error) setFwd(jf);
        if (jc && !jc.error) setLegacy(jc);
        setErr(jf?.error || jc?.error || "");
      } catch { if (alive) setErr("Dashboard API unreachable"); }
    };
    load();
    const t = setInterval(load, REFRESH);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const strats = fwd?.strategies ?? [];
  const active = cur || strats[0]?.name || "";
  const sel = strats.find((x) => x.name === active);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">SOOB Terminal · Live Forward-Test</h1>
        <p className="text-sm text-neutral-400">Positions rebalance daily · equity marks every 5 min · <span className="text-amber-400">paper, no real money</span></p>
      </header>

      {err && <div className="mb-4 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">{err}. Data shows once the server has run.</div>}

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {strats.map((x) => (
          <button key={x.name} onClick={() => setCur(x.name)} className={`flex-none rounded-lg border px-3 py-2 text-left ${active === x.name ? "border-sky-500 bg-sky-950/30" : "border-neutral-800 bg-neutral-900/40"}`}>
            <div className="text-[13px] font-semibold">{x.label}</div>
            <div className="mt-0.5 text-xs tabular-nums"><span className="text-neutral-400">{usd0(x.equity)}</span> <span className={sign(x.ret_pct)}>{pct(x.ret_pct)}</span></div>
          </button>
        ))}
        {legacy && (
          <button onClick={() => setCur("legacy")} className={`flex-none rounded-lg border px-3 py-2 text-left ${active === "legacy" ? "border-sky-500 bg-sky-950/30" : "border-neutral-800 bg-neutral-900/40"}`}>
            <div className="text-[13px] font-semibold text-neutral-400">Legacy · 3-Sleeve</div>
            <div className="mt-0.5 text-xs tabular-nums"><span className="text-neutral-500">{usd0(legacy.stats.equity)}</span> <span className={sign(legacy.stats.ret_pct)}>{pct(legacy.stats.ret_pct)}</span></div>
          </button>
        )}
        {!strats.length && !legacy && <div className="text-sm text-neutral-500">Loading…</div>}
      </div>

      {active === "legacy" ? (legacy && <LegacyDetail d={legacy} />) : sel ? <StrategyDetail key={sel.name} st={sel} /> : (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-center text-sm text-neutral-500">Waiting for the server first run…</div>
      )}

      <footer className="mt-6 text-xs leading-relaxed text-neutral-600">
        <b className="text-neutral-400">A/B</b> = market-neutral baselines; <b className="text-neutral-400">C/D/E</b> = LLM-tournament barbells (C survivable, D aggressive, E adds trend-timed leverage).
        Gross exp = position notional ÷ equity (under 1× = partly cash, no leverage). E&rsquo;s gate is its trend-leverage ×. Trades are a position-ledger view; the equity curve is the source of truth. The live curve is the arbiter, not the backtest. Paper only.
      </footer>
    </main>
  );
}
