"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
  "1D": TimeframeData;
  "4H": TimeframeData;
  "1H": TimeframeData;
  "5M": TimeframeData;
}

type Timeframe = "5M" | "1H" | "4H" | "1D";

const TIMEFRAMES: Timeframe[] = ["5M", "1H", "4H", "1D"];
const REFRESH_INTERVAL = 30000;

// ── Helpers ────────────────────────────────────────────────────────────────

function isoToUnix(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function msStateColor(state: string): string {
  if (state === "BULLISH") return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (state === "BEARISH") return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
}

// ── OB Overlay component ───────────────────────────────────────────────────

interface OverlayRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  borderColor: string;
  label?: string;
  entryY?: number;
  slY?: number;
}

function ChartOverlay({
  rects,
  containerWidth,
  containerHeight,
}: {
  rects: OverlayRect[];
  containerWidth: number;
  containerHeight: number;
}) {
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
      }}
    >
      {rects.map((r) => (
        <div key={r.id}>
          {/* Zone rectangle */}
          <div
            style={{
              position: "absolute",
              left: r.x,
              top: r.y,
              width: Math.max(r.width, 0),
              height: Math.max(r.height, 0),
              backgroundColor: r.color,
              borderTop: `1px solid ${r.borderColor}`,
              borderBottom: `1px solid ${r.borderColor}`,
            }}
          />
          {/* Entry line (dashed) */}
          {r.entryY != null && r.entryY >= 0 && (
            <div
              style={{
                position: "absolute",
                left: r.x,
                top: r.entryY,
                width: Math.max(r.width, 0),
                height: 0,
                borderTop: `1px dashed ${r.borderColor}`,
                opacity: 0.8,
              }}
            />
          )}
          {/* SL line (dotted) */}
          {r.slY != null && r.slY >= 0 && (
            <div
              style={{
                position: "absolute",
                left: r.x,
                top: r.slY,
                width: Math.max(r.width, 0),
                height: 0,
                borderTop: `1px dotted ${r.borderColor}`,
                opacity: 0.5,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Structure Panel ────────────────────────────────────────────────────────

function StructurePanel({ data }: { data: TimeframeData }) {
  const [open, setOpen] = useState(false);

  const activeOBs = data.obs.filter(
    (ob) => ob.status === "FRESH" || ob.status === "TESTED"
  );
  const activeFVGs = data.fvgs.filter((f) => f.status === "ACTIVE");

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors"
      >
        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
          Market Structure
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {activeOBs.length} OB &middot; {activeFVGs.length} FVG
          </span>
          <svg
            className={`w-4 h-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* OBs */}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
              Order Blocks ({activeOBs.length})
            </p>
            {activeOBs.length === 0 ? (
              <p className="text-xs text-zinc-600">No active OBs</p>
            ) : (
              <div className="space-y-2">
                {activeOBs.map((ob, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-800/50"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold ${
                          ob.direction === "BEARISH"
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {ob.direction === "BEARISH" ? "↑ LONG" : "↓ SHORT"}
                      </span>
                      <span className="text-xs text-zinc-400">
                        ${ob.low.toLocaleString()} - ${ob.high.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-500">
                        Entry: ${ob.entry_045.toLocaleString()}
                      </span>
                      <span className="text-xs text-zinc-500">
                        SL: ${ob.sl_110.toLocaleString()}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          ob.status === "FRESH"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {ob.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FVGs */}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
              Fair Value Gaps ({activeFVGs.length})
            </p>
            {activeFVGs.length === 0 ? (
              <p className="text-xs text-zinc-600">No active FVGs</p>
            ) : (
              <div className="space-y-2">
                {activeFVGs.map((fvg, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-800/50"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold ${
                          fvg.direction === "BULLISH"
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {fvg.direction === "BULLISH" ? "↑" : "↓"} {fvg.direction}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-400">
                      ${fvg.gap_low.toLocaleString()} - ${fvg.gap_high.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Chart Page ────────────────────────────────────────────────────────

export default function ChartPage() {
  const [data, setData] = useState<StructuresResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tf, setTf] = useState<Timeframe>("5M");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const markersPluginRef = useRef<{ setMarkers: (m: SeriesMarker<Time>[]) => void } | null>(null);

  const [overlayRects, setOverlayRects] = useState<OverlayRect[]>([]);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // ── Fetch data ───────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/structures", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    }
  }, []);

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
    const tfData = data[tf];
    const timeScale = chart.timeScale();

    const rects: OverlayRect[] = [];

    // Get chart right edge coordinate for extending zones to the right
    const chartWidth = chartContainerRef.current?.clientWidth ?? 800;

    // OB zones
    tfData.obs
      .filter((ob) => ob.status === "FRESH" || ob.status === "TESTED")
      .forEach((ob, i) => {
        const startTime = isoToUnix(ob.start_ts) as Time;
        const endTime = isoToUnix(ob.end_ts) as Time;

        const x1 = timeScale.timeToCoordinate(startTime);
        const x2 = timeScale.timeToCoordinate(endTime);
        const yHigh = series.priceToCoordinate(ob.high);
        const yLow = series.priceToCoordinate(ob.low);

        if (x1 == null || yHigh == null || yLow == null) return;

        // Extend to chart right edge if visible
        const xEnd = x2 != null ? Math.max(x2, chartWidth) : chartWidth;

        const isBearish = ob.direction === "BEARISH";
        const color = isBearish
          ? "rgba(52, 211, 153, 0.08)"
          : "rgba(248, 113, 113, 0.08)";
        const borderColor = isBearish
          ? "rgba(52, 211, 153, 0.3)"
          : "rgba(248, 113, 113, 0.3)";

        const entryYCoord = series.priceToCoordinate(ob.entry_045);
        const slYCoord = series.priceToCoordinate(ob.sl_110);

        rects.push({
          id: `ob-${i}`,
          x: x1,
          y: Math.min(yHigh, yLow),
          width: xEnd - x1,
          height: Math.abs(yLow - yHigh),
          color,
          borderColor,
          entryY: entryYCoord ?? undefined,
          slY: slYCoord ?? undefined,
        });
      });

    // FVG zones
    tfData.fvgs
      .filter((f) => f.status === "ACTIVE")
      .forEach((fvg, i) => {
        // FVGs don't have start/end timestamps, so we draw them across the visible range
        const visibleRange = timeScale.getVisibleRange();
        if (!visibleRange) return;

        const x1 = timeScale.timeToCoordinate(visibleRange.from);
        const yHigh = series.priceToCoordinate(fvg.gap_high);
        const yLow = series.priceToCoordinate(fvg.gap_low);

        if (x1 == null || yHigh == null || yLow == null) return;

        rects.push({
          id: `fvg-${i}`,
          x: 0,
          y: Math.min(yHigh, yLow),
          width: chartWidth,
          height: Math.abs(yLow - yHigh),
          color: "rgba(96, 165, 250, 0.06)",
          borderColor: "rgba(96, 165, 250, 0.2)",
        });
      });

    setOverlayRects(rects);
  }, [data, tf]);

  // ── Chart setup and data update ──────────────────────────────────────────

  useEffect(() => {
    if (!data || !chartContainerRef.current) return;

    let chart = chartRef.current;
    let isNewChart = false;

    // Dynamically import lightweight-charts
    const setup = async () => {
      const lc = await import("lightweight-charts");

      const container = chartContainerRef.current!;

      // Create chart if needed
      if (!chart) {
        chart = lc.createChart(container, {
          layout: {
            background: { color: "#0a0a0a" },
            textColor: "#71717a",
            fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
            fontSize: 11,
          },
          grid: {
            vertLines: { color: "rgba(63, 63, 70, 0.3)" },
            horzLines: { color: "rgba(63, 63, 70, 0.3)" },
          },
          crosshair: {
            vertLine: { color: "rgba(161, 161, 170, 0.3)", labelBackgroundColor: "#27272a" },
            horzLine: { color: "rgba(161, 161, 170, 0.3)", labelBackgroundColor: "#27272a" },
          },
          rightPriceScale: {
            borderColor: "rgba(63, 63, 70, 0.5)",
          },
          timeScale: {
            borderColor: "rgba(63, 63, 70, 0.5)",
            timeVisible: true,
            secondsVisible: false,
          },
          handleScale: { axisPressedMouseMove: true },
          handleScroll: { vertTouchDrag: false },
        });

        chartRef.current = chart;
        isNewChart = true;

        // Resize observer
        const ro = new ResizeObserver(() => {
          if (chartContainerRef.current && chartRef.current) {
            const { clientWidth, clientHeight } = chartContainerRef.current;
            chartRef.current.resize(clientWidth, clientHeight);
            setContainerSize({ w: clientWidth, h: clientHeight });
            computeOverlays();
          }
        });
        ro.observe(container);

        // Subscribe to visible range changes for overlay updates
        chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
          computeOverlays();
        });
        chart.timeScale().subscribeVisibleTimeRangeChange(() => {
          computeOverlays();
        });
      }

      // Remove old series if switching timeframes
      if (seriesRef.current && !isNewChart) {
        chart!.removeSeries(seriesRef.current);
        seriesRef.current = null;
        markersPluginRef.current = null;
      }

      // Add candlestick series
      const series = chart!.addSeries(lc.CandlestickSeries, {
        upColor: "#34d399",
        downColor: "#f87171",
        wickUpColor: "#34d399",
        wickDownColor: "#f87171",
        borderVisible: false,
      });
      seriesRef.current = series;

      // Set candle data
      const tfData = data[tf];
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

      // Swing markers
      const markers: SeriesMarker<Time>[] = tfData.swings
        .map((sw) => ({
          time: isoToUnix(sw.timestamp) as Time,
          position: (sw.is_high ? "aboveBar" : "belowBar") as "aboveBar" | "belowBar",
          shape: (sw.is_high ? "arrowDown" : "arrowUp") as "arrowDown" | "arrowUp",
          color: sw.is_high ? "#f87171" : "#34d399",
          text: sw.is_high ? "SH" : "SL",
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      // Use createSeriesMarkers for v5
      const markersPlugin = lc.createSeriesMarkers(series, markers);
      markersPluginRef.current = markersPlugin;

      // Fit content
      chart!.timeScale().fitContent();

      // Initial overlay compute (delayed to let chart render)
      requestAnimationFrame(() => {
        computeOverlays();
      });
    };

    setup();
  }, [data, tf, computeOverlays]);

  // Update container size on mount
  useEffect(() => {
    if (chartContainerRef.current) {
      setContainerSize({
        w: chartContainerRef.current.clientWidth,
        h: chartContainerRef.current.clientHeight,
      });
    }
  }, []);

  // ── HTF Bias badges ──────────────────────────────────────────────────────

  const htfBiases = data
    ? (["1D", "4H", "1H"] as const).map((key) => ({
        tf: key,
        state: data[key]?.ms_state ?? "UNKNOWN",
      }))
    : [];

  // ── Render ───────────────────────────────────────────────────────────────

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
        <div className="animate-pulse text-zinc-500">Loading chart data...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-4">
          {/* Back link */}
          <a
            href="/"
            className="text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">Dashboard</span>
          </a>

          {/* Timeframe selector */}
          <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg p-0.5">
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                onClick={() => setTf(t)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  tf === t
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* HTF Bias */}
          <div className="hidden sm:flex items-center gap-1.5">
            {htfBiases.map((b) => (
              <span
                key={b.tf}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${msStateColor(b.state)}`}
              >
                {b.tf} {b.state === "BULLISH" ? "▲" : b.state === "BEARISH" ? "▼" : "●"}
              </span>
            ))}
          </div>

          {/* Refresh indicator */}
          <div className="flex items-center gap-1.5">
            {error && <span className="text-[10px] text-red-400">{error}</span>}
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-zinc-500">
              {lastUpdate
                ? `${Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s`
                : "..."}
            </span>
          </div>
        </div>
      </div>

      {/* ── HTF Bias mobile row ─────────────────────────────────────── */}
      <div className="flex sm:hidden items-center gap-1.5 px-4 py-1.5 border-b border-zinc-800 bg-zinc-900/50">
        <span className="text-[10px] text-zinc-500 mr-1">HTF:</span>
        {htfBiases.map((b) => (
          <span
            key={b.tf}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${msStateColor(b.state)}`}
          >
            {b.tf} {b.state === "BULLISH" ? "▲" : b.state === "BEARISH" ? "▼" : "●"}
          </span>
        ))}
      </div>

      {/* ── Chart Area ──────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0">
        <div ref={chartContainerRef} className="absolute inset-0" />
        <ChartOverlay
          rects={overlayRects}
          containerWidth={containerSize.w}
          containerHeight={containerSize.h}
        />
      </div>

      {/* ── Structure Panel ─────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2 border-t border-zinc-800">
        <StructurePanel data={data[tf]} />
      </div>
    </div>
  );
}
