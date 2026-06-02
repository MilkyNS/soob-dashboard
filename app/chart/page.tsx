"use client";

import { Suspense, useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type {
  IChartApi,
  ISeriesApi,
  SeriesType,
  Time,
  SeriesMarker,
} from "lightweight-charts";

// ── Types ──────────────────────────────────────────────────────────────────

interface Candle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
}

interface OB {
  high: number;
  low: number;
  direction: string;
  status: string;
  start_ts: string;
  end_ts: string;
  fib_high: number;
  fib_low: number;
  entry_045: number;
  sl_110: number;
}

interface FVG {
  gap_high: number;
  gap_low: number;
  direction: string;
  status: string;
}

interface Swing {
  price: number;
  is_high: boolean;
  timestamp: string;
}

interface TimeframeData {
  candles: Candle[];
  obs: OB[];
  fvgs: FVG[];
  swings: Swing[];
  ms_state: string;
}

interface StructuresResponse {
  exported_at: string;
  [key: string]: TimeframeData | string;
}

type Timeframe = "5M" | "1H" | "4H" | "1D";

const TIMEFRAMES: Timeframe[] = ["1D", "4H", "1H", "5M"];
const REFRESH_INTERVAL = 30000;

// ── Helpers ────────────────────────────────────────────────────────────────

function isoToUnix(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function msLabel(state: string): string {
  if (state === "BULLISH") return "BULL";
  if (state === "BEARISH") return "BEAR";
  return "—";
}

function msColor(state: string): string {
  if (state === "BULLISH") return "#34d399";
  if (state === "BEARISH") return "#f87171";
  return "#71717a";
}

function fmtPrice(p: number): string {
  if (p >= 10000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 100) return p.toFixed(1);
  return p.toFixed(4);
}

// ── OB/FVG Zone Overlay ───────────────────────────────────────────────────

interface ZoneRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  bgColor: string;
  borderColor: string;
  label: string;
  labelColor: string;
  entryY?: number;
  slY?: number;
  entryPrice?: number;
  slPrice?: number;
  opacity: number;
}

function ZoneOverlay({
  zones,
  containerWidth,
  containerHeight,
}: {
  zones: ZoneRect[];
  containerWidth: number;
  containerHeight: number;
}) {
  if (!zones.length) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: containerWidth,
        height: containerHeight,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 5,
      }}
    >
      {zones.map((z) => {
        const h = Math.max(z.height, 2);
        const w = Math.max(z.width, 0);
        return (
          <div key={z.id}>
            {/* Zone rectangle */}
            <div
              style={{
                position: "absolute",
                left: z.x,
                top: z.y,
                width: w,
                height: h,
                backgroundColor: z.bgColor,
                borderTop: `2px solid ${z.borderColor}`,
                borderBottom: `2px solid ${z.borderColor}`,
                opacity: z.opacity,
              }}
            />
            {/* Label */}
            <div
              style={{
                position: "absolute",
                left: z.x + 6,
                top: z.y + 2,
                color: z.labelColor,
                fontSize: "10px",
                fontWeight: 700,
                fontFamily: "monospace",
                letterSpacing: "0.5px",
                textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                whiteSpace: "nowrap",
                opacity: z.opacity,
              }}
            >
              {z.label}
            </div>
            {/* Entry line (dashed) */}
            {z.entryY != null && z.entryY >= 0 && z.entryY <= containerHeight && (
              <div
                style={{
                  position: "absolute",
                  left: z.x,
                  top: z.entryY,
                  width: w,
                  height: 0,
                  borderTop: `1px dashed ${z.borderColor}`,
                  opacity: z.opacity * 0.9,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    right: 4,
                    top: -12,
                    color: z.labelColor,
                    fontSize: "9px",
                    fontFamily: "monospace",
                    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                    opacity: 0.8,
                  }}
                >
                  ENTRY {z.entryPrice != null ? fmtPrice(z.entryPrice) : ""}
                </span>
              </div>
            )}
            {/* SL line (dotted red) */}
            {z.slY != null && z.slY >= 0 && z.slY <= containerHeight && (
              <div
                style={{
                  position: "absolute",
                  left: z.x,
                  top: z.slY,
                  width: w,
                  height: 0,
                  borderTop: "1px dotted #ef4444",
                  opacity: z.opacity * 0.7,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    right: 4,
                    top: 2,
                    color: "#ef4444",
                    fontSize: "9px",
                    fontFamily: "monospace",
                    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                    opacity: 0.8,
                  }}
                >
                  SL {z.slPrice != null ? fmtPrice(z.slPrice) : ""}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── OB/FVG Info Panel ─────────────────────────────────────────────────────

function InfoPanel({ data, tf }: { data: TimeframeData; tf: string }) {
  const activeOBs = data.obs.filter(
    (ob) => ob.status === "FRESH" || ob.status === "TESTED"
  );
  const activeFVGs = data.fvgs.filter((f) => f.status === "ACTIVE");

  if (activeOBs.length === 0 && activeFVGs.length === 0) {
    return (
      <div className="text-xs text-zinc-600 px-4 py-2">
        No active OBs or FVGs on {tf}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2">
      {activeOBs.map((ob, i) => {
        const isLong = ob.direction === "BEARISH";
        return (
          <div
            key={`ob-${i}`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/50"
          >
            <span
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: isLong ? "#a78bfa" : "#f87171" }}
            />
            <span className="text-[10px] font-bold" style={{ color: isLong ? "#a78bfa" : "#f87171" }}>
              {isLong ? "LONG" : "SHORT"} OB
            </span>
            <span className="text-[10px] text-zinc-400">
              {fmtPrice(ob.low)}–{fmtPrice(ob.high)}
            </span>
            <span className="text-[10px] text-zinc-500">
              E:{fmtPrice(ob.entry_045)}
            </span>
            <span
              className={`text-[9px] px-1 rounded ${
                ob.status === "FRESH"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-amber-500/20 text-amber-400"
              }`}
            >
              {ob.status}
            </span>
          </div>
        );
      })}
      {activeFVGs.map((fvg, i) => {
        const isBull = fvg.direction === "BULLISH";
        return (
          <div
            key={`fvg-${i}`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/50"
          >
            <span
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: "#38bdf8" }}
            />
            <span className="text-[10px] font-bold" style={{ color: "#38bdf8" }}>
              {isBull ? "BULL" : "BEAR"} FVG
            </span>
            <span className="text-[10px] text-zinc-400">
              {fmtPrice(fvg.gap_low)}–{fmtPrice(fvg.gap_high)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Chart Page ────────────────────────────────────────────────────────

export default function ChartPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-[#060608]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
          <span className="text-zinc-600 text-sm">Loading chart...</span>
        </div>
      </div>
    }>
      <ChartPage />
    </Suspense>
  );
}

function ChartPage() {
  const searchParams = useSearchParams();
  const [symbol, setSymbol] = useState(searchParams.get("symbol") || "BTCUSDT");
  const symbolLabel = useMemo(() => {
    const s = symbol.toUpperCase();
    for (const q of ["USDT", "USDC", "BUSD", "USD"]) {
      if (s.endsWith(q)) return `${s.slice(0, -q.length)}/${q}`;
    }
    return s;
  }, [symbol]);

  const [engine, setEngine] = useState<"v4" | "v5" | "v6">(
    (["v4", "v5", "v6"].includes(searchParams.get("engine") || "") ? searchParams.get("engine") : "v6") as "v4" | "v5" | "v6"
  );
  const [data, setData] = useState<StructuresResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tf, setTf] = useState<Timeframe>("1H");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Toggle overlays
  const [showOBs, setShowOBs] = useState(true);
  const [showFVGs, setShowFVGs] = useState(true);
  const [showSwings, setShowSwings] = useState(true);
  const [showInvalidated, setShowInvalidated] = useState(true);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  const [overlayZones, setOverlayZones] = useState<ZoneRect[]>([]);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // ── Fetch data ───────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/structures?symbol=${symbol}&prefix=MULTI_${engine.toUpperCase()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    }
  }, [symbol, engine]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Compute overlay positions ────────────────────────────────────────────

  const computeOverlays = useCallback(() => {
    if (!chartRef.current || !seriesRef.current || !data) return;

    const chart = chartRef.current;
    const series = seriesRef.current;
    const tfData = data[tf] as TimeframeData;
    if (!tfData) return;
    const timeScale = chart.timeScale();
    const chartWidth = chartContainerRef.current?.clientWidth ?? 800;

    const zones: ZoneRect[] = [];

    // ── OB zones (all statuses) ────────────────────────────────────────
    if (showOBs) {
      const obsToShow = showInvalidated
        ? tfData.obs
        : tfData.obs.filter((ob) => ob.status === "FRESH" || ob.status === "TESTED");

      obsToShow.forEach((ob, i) => {
        const startTime = isoToUnix(ob.start_ts) as Time;

        const x1 = timeScale.timeToCoordinate(startTime);
        const yHigh = series.priceToCoordinate(ob.high);
        const yLow = series.priceToCoordinate(ob.low);

        if (x1 == null || yHigh == null || yLow == null) return;

        const isLong = ob.direction === "BEARISH";
        const isFresh = ob.status === "FRESH";
        const isTested = ob.status === "TESTED";
        const isActive = isFresh || isTested;

        let bgColor: string;
        let borderColor: string;
        let labelColor: string;
        let opacity: number;

        if (isLong) {
          // Long entry (bearish OB) — purple/violet like the study
          bgColor = isActive ? "rgba(139, 92, 246, 0.20)" : "rgba(139, 92, 246, 0.06)";
          borderColor = isActive ? "rgba(139, 92, 246, 0.7)" : "rgba(139, 92, 246, 0.2)";
          labelColor = isActive ? "#a78bfa" : "#6d5bb5";
          opacity = isActive ? 1 : 0.5;
        } else {
          // Short entry (bullish OB) — red/pink
          bgColor = isActive ? "rgba(248, 113, 113, 0.20)" : "rgba(248, 113, 113, 0.06)";
          borderColor = isActive ? "rgba(248, 113, 113, 0.7)" : "rgba(248, 113, 113, 0.2)";
          labelColor = isActive ? "#f87171" : "#b55b5b";
          opacity = isActive ? 1 : 0.5;
        }

        const statusTag = isFresh ? "FRESH" : isTested ? "TESTED" : "INVALIDATED";
        const dirTag = isLong ? "LONG" : "SHORT";
        const label = `${tf} ${dirTag} OB · ${statusTag}`;

        let entryYCoord: number | undefined;
        let slYCoord: number | undefined;

        if (isActive) {
          const ey = series.priceToCoordinate(ob.entry_045);
          const sy = series.priceToCoordinate(ob.sl_110);
          entryYCoord = ey ?? undefined;
          slYCoord = sy ?? undefined;
        }

        zones.push({
          id: `ob-${i}`,
          x: x1,
          y: Math.min(yHigh, yLow),
          width: chartWidth - x1 + 50,
          height: Math.abs(yLow - yHigh),
          bgColor,
          borderColor,
          label,
          labelColor,
          entryY: entryYCoord,
          slY: slYCoord,
          entryPrice: isActive ? ob.entry_045 : undefined,
          slPrice: isActive ? ob.sl_110 : undefined,
          opacity,
        });
      });
    }

    // ── FVG zones ──────────────────────────────────────────────────────
    if (showFVGs) {
      const activeFVGs = tfData.fvgs.filter((f) => f.status === "ACTIVE");

      activeFVGs.forEach((fvg, i) => {
        const yHigh = series.priceToCoordinate(fvg.gap_high);
        const yLow = series.priceToCoordinate(fvg.gap_low);

        if (yHigh == null || yLow == null) return;

        const isBull = fvg.direction === "BULLISH";

        zones.push({
          id: `fvg-${i}`,
          x: 0,
          y: Math.min(yHigh, yLow),
          width: chartWidth,
          height: Math.abs(yLow - yHigh),
          bgColor: isBull
            ? "rgba(56, 189, 248, 0.10)"
            : "rgba(251, 191, 36, 0.10)",
          borderColor: isBull
            ? "rgba(56, 189, 248, 0.4)"
            : "rgba(251, 191, 36, 0.4)",
          label: `${isBull ? "BULL" : "BEAR"} FVG`,
          labelColor: isBull ? "#38bdf8" : "#fbbf24",
          opacity: 1,
        });
      });
    }

    setOverlayZones(zones);
  }, [data, tf, showOBs, showFVGs, showInvalidated]);

  // ── Chart setup and data update ──────────────────────────────────────────

  useEffect(() => {
    if (!data || !chartContainerRef.current) return;

    let chart = chartRef.current;
    let isNewChart = false;

    const setup = async () => {
      const lc = await import("lightweight-charts");
      const container = chartContainerRef.current!;

      if (!chart) {
        chart = lc.createChart(container, {
          layout: {
            background: { color: "#060608" },
            textColor: "#52525b",
            fontFamily: "system-ui, sans-serif",
            fontSize: 11,
          },
          grid: {
            vertLines: { color: "rgba(63, 63, 70, 0.1)" },
            horzLines: { color: "rgba(63, 63, 70, 0.1)" },
          },
          crosshair: {
            vertLine: { color: "rgba(139, 92, 246, 0.2)", labelBackgroundColor: "#1c1c22" },
            horzLine: { color: "rgba(139, 92, 246, 0.2)", labelBackgroundColor: "#1c1c22" },
          },
          rightPriceScale: {
            borderColor: "rgba(63, 63, 70, 0.2)",
          },
          timeScale: {
            borderColor: "rgba(63, 63, 70, 0.2)",
            timeVisible: true,
            secondsVisible: false,
          },
          handleScale: { axisPressedMouseMove: true },
          handleScroll: { vertTouchDrag: false },
        });

        chartRef.current = chart;
        isNewChart = true;

        const ro = new ResizeObserver(() => {
          if (chartContainerRef.current && chartRef.current) {
            const { clientWidth, clientHeight } = chartContainerRef.current;
            chartRef.current.resize(clientWidth, clientHeight);
            setContainerSize({ w: clientWidth, h: clientHeight });
            computeOverlays();
          }
        });
        ro.observe(container);

        chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
          computeOverlays();
        });
      }

      if (seriesRef.current && !isNewChart) {
        chart!.removeSeries(seriesRef.current);
        seriesRef.current = null;
      }

      const series = chart!.addSeries(lc.CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
        borderVisible: false,
      });
      seriesRef.current = series;

      const tfData = data[tf] as TimeframeData;
      if (!tfData) return;

      const candles = tfData.candles
        .map((c) => ({
          time: isoToUnix(c.t) as Time,
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      series.setData(candles);

      // Swing markers — only last N swings, subtle style
      if (showSwings) {
        const recentHighs = tfData.swings
          .filter((s) => s.is_high)
          .slice(-4);
        const recentLows = tfData.swings
          .filter((s) => !s.is_high)
          .slice(-4);
        const recentSwings = [...recentHighs, ...recentLows];

        const markers: SeriesMarker<Time>[] = recentSwings
          .map((sw) => ({
            time: isoToUnix(sw.timestamp) as Time,
            position: (sw.is_high ? "aboveBar" : "belowBar") as "aboveBar" | "belowBar",
            shape: "circle" as const,
            color: sw.is_high ? "#fbbf24" : "#fbbf24",
            text: sw.is_high ? `SH ${fmtPrice(sw.price)}` : `SL ${fmtPrice(sw.price)}`,
            size: 0.5,
          }))
          .sort((a, b) => (a.time as number) - (b.time as number));

        lc.createSeriesMarkers(series, markers);
      }

      chart!.timeScale().fitContent();

      requestAnimationFrame(() => {
        computeOverlays();
      });
    };

    setup();
  }, [data, tf, showSwings, computeOverlays]);

  useEffect(() => {
    if (chartContainerRef.current) {
      setContainerSize({
        w: chartContainerRef.current.clientWidth,
        h: chartContainerRef.current.clientHeight,
      });
    }
  }, []);

  // ── HTF Bias data ────────────────────────────────────────────────────────

  const allTFs: Timeframe[] = ["1D", "4H", "1H", "5M"];
  const biases = data
    ? allTFs.map((key) => ({
        tf: key,
        state: (data[key] as TimeframeData)?.ms_state ?? "UNKNOWN",
        obCount: (data[key] as TimeframeData)?.obs?.filter(
          (o) => o.status === "FRESH" || o.status === "TESTED"
        ).length ?? 0,
        fvgCount: (data[key] as TimeframeData)?.fvgs?.filter(
          (f) => f.status === "ACTIVE"
        ).length ?? 0,
      }))
    : [];

  // ── Render ───────────────────────────────────────────────────────────────

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#060608]">
        <div className="card-static p-6 max-w-sm w-full text-center border-red-900/30">
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
      <div className="min-h-screen flex items-center justify-center bg-[#060608]">
        <div className="animate-pulse text-zinc-500">Loading chart data...</div>
      </div>
    );
  }

  const tfData = data[tf] as TimeframeData;

  return (
    <div className="flex flex-col h-screen bg-[#060608] text-white">
      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/40 bg-zinc-950/60 glass shrink-0">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="text-zinc-500 hover:text-violet-400 transition-colors duration-200 text-sm"
          >
            ← Dashboard
          </a>

          <div className="h-4 w-px bg-zinc-800/60" />

          {/* Symbol selector (the chart is one symbol at a time) */}
          <div className="flex items-center gap-0.5 bg-zinc-900/50 rounded-lg p-0.5 ring-1 ring-zinc-800/60" title="Symbol">
            {(["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const).map((sid) => (
              <button
                key={sid}
                onClick={() => setSymbol(sid)}
                className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md transition-all duration-200 ${
                  symbol === sid
                    ? "bg-violet-500/15 text-violet-300 shadow-[0_0_10px_-3px_rgba(139,92,246,0.3)]"
                    : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                {sid.replace("USDT", "")}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-zinc-800/60" />

          {/* Engine toggle */}
          <div className="flex items-center gap-0.5 bg-zinc-900/50 rounded-lg p-0.5 ring-1 ring-zinc-800/60" title="Engine: v4 (structural) · v5 (adaptive+trailing) · v6.1 (FRESH-gated let-run, weekends)">
            {(["v4", "v5", "v6"] as const).map((e) => (
              <button
                key={e}
                onClick={() => setEngine(e)}
                className={`px-2 py-1 text-xs font-mono font-bold rounded-md transition-all duration-200 ${
                  engine === e
                    ? e === "v6"
                      ? "bg-amber-500/15 text-amber-300 shadow-[0_0_10px_-3px_rgba(245,158,11,0.3)]"
                      : e === "v5"
                      ? "bg-violet-500/15 text-violet-300 shadow-[0_0_10px_-3px_rgba(139,92,246,0.3)]"
                      : "bg-emerald-500/15 text-emerald-300 shadow-[0_0_10px_-3px_rgba(16,185,129,0.3)]"
                    : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                {e}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-zinc-800/60" />

          {/* Timeframe selector */}
          <div className="flex items-center gap-0.5 bg-zinc-900/50 rounded-lg p-0.5">
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                onClick={() => setTf(t)}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-all duration-200 ${
                  tf === t
                    ? "bg-violet-500/15 text-violet-300 shadow-[0_0_10px_-3px_rgba(139,92,246,0.2)]"
                    : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Toggle buttons */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => setShowOBs(!showOBs)}
              className={`px-2 py-0.5 text-[10px] font-mono rounded-md transition-all duration-200 ${
                showOBs
                  ? "bg-violet-500/15 text-violet-400 border border-violet-500/25 shadow-[0_0_8px_-3px_rgba(139,92,246,0.2)]"
                  : "text-zinc-700 border border-zinc-800/50 hover:border-zinc-700/50 hover:text-zinc-500"
              }`}
            >
              OB
            </button>
            <button
              onClick={() => setShowFVGs(!showFVGs)}
              className={`px-2 py-0.5 text-[10px] font-mono rounded-md transition-all duration-200 ${
                showFVGs
                  ? "bg-sky-500/15 text-sky-400 border border-sky-500/25 shadow-[0_0_8px_-3px_rgba(56,189,248,0.2)]"
                  : "text-zinc-700 border border-zinc-800/50 hover:border-zinc-700/50 hover:text-zinc-500"
              }`}
            >
              FVG
            </button>
            <button
              onClick={() => setShowSwings(!showSwings)}
              className={`px-2 py-0.5 text-[10px] font-mono rounded-md transition-all duration-200 ${
                showSwings
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/25 shadow-[0_0_8px_-3px_rgba(251,191,36,0.2)]"
                  : "text-zinc-700 border border-zinc-800/50 hover:border-zinc-700/50 hover:text-zinc-500"
              }`}
            >
              SW
            </button>
            <button
              onClick={() => setShowInvalidated(!showInvalidated)}
              className={`px-2 py-0.5 text-[10px] font-mono rounded-md transition-all duration-200 ${
                showInvalidated
                  ? "bg-zinc-500/15 text-zinc-400 border border-zinc-500/25"
                  : "text-zinc-700 border border-zinc-800/50 hover:border-zinc-700/50 hover:text-zinc-500"
              }`}
              title="Show invalidated OBs"
            >
              INV
            </button>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
            <span className="text-[10px] text-zinc-600 font-mono">
              {lastUpdate
                ? `${Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s`
                : "..."}
            </span>
          </div>
        </div>
      </div>

      {/* ── HTF Bias Row ────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-3 py-1.5 border-b border-zinc-800/30 bg-zinc-950/40 shrink-0">
        <span className="text-[10px] text-zinc-700 font-mono uppercase tracking-wider">HTF Bias</span>
        <div className="flex items-center gap-2">
          {biases.map((b) => (
            <div key={b.tf} className="flex items-center gap-1.5">
              <span
                className="text-[11px] font-mono font-bold px-2 py-0.5 rounded"
                style={{
                  color: msColor(b.state),
                  backgroundColor:
                    b.state === "BULLISH"
                      ? "rgba(34, 197, 94, 0.1)"
                      : b.state === "BEARISH"
                      ? "rgba(239, 68, 68, 0.1)"
                      : "rgba(113, 113, 122, 0.1)",
                  border: `1px solid ${
                    b.state === "BULLISH"
                      ? "rgba(34, 197, 94, 0.2)"
                      : b.state === "BEARISH"
                      ? "rgba(239, 68, 68, 0.2)"
                      : "rgba(113, 113, 122, 0.2)"
                  }`,
                }}
              >
                {b.tf} {msLabel(b.state)}
              </span>
              <span className="text-[9px] text-zinc-600 font-mono">
                {b.obCount}ob {b.fvgCount}fvg
              </span>
            </div>
          ))}
        </div>
        {error && <span className="text-[10px] text-red-400 ml-auto">{error}</span>}
      </div>

      {/* ── Chart Area ──────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0">
        <div ref={chartContainerRef} className="absolute inset-0" />
        <ZoneOverlay
          zones={overlayZones}
          containerWidth={containerSize.w}
          containerHeight={containerSize.h}
        />
      </div>

      {/* ── Bottom Info Panel ───────────────────────────────────────── */}
      <div className="shrink-0 border-t border-zinc-800/30 bg-zinc-950/40">
        {tfData && <InfoPanel data={tfData} tf={tf} />}
      </div>
    </div>
  );
}
