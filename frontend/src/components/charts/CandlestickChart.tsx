import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";

type Candle = {
  timestamp: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Trade = {
  side: "BUY" | "SELL" | string;
  opened_at?: string | null;
  closed_at?: string | null;
};

function toUnixSeconds(ts: any): UTCTimestamp | null {
  if (ts == null) return null;

  if (typeof ts === "number") {
    const ms = ts > 10_000_000_000 ? ts : ts * 1000;
    return Math.floor(ms / 1000) as UTCTimestamp;
  }

  const n = Number(ts);
  if (Number.isFinite(n)) {
    const ms = n > 10_000_000_000 ? n : n * 1000;
    return Math.floor(ms / 1000) as UTCTimestamp;
  }

  const d = new Date(String(ts));
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000) as UTCTimestamp;
}

export default function CandlestickChart({
  candles,
  trades,
  height = 420,
}: {
  candles: Candle[];
  trades: Trade[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<any>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  /* ================= TRANSFORM DATA ================= */

  const candleData = useMemo(() => {
    const out: CandlestickData<UTCTimestamp>[] = [];

    for (const c of candles ?? []) {
      const time = toUnixSeconds(c.timestamp);
      if (!time) continue;

      out.push({
        time,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      });
    }

    out.sort((a, b) => Number(a.time) - Number(b.time));
    return out;
  }, [candles]);

  const markers = useMemo(() => {
    const out: SeriesMarker<UTCTimestamp>[] = [];

    for (const t of trades ?? []) {
      const opened = toUnixSeconds(t.opened_at);
      const closed = toUnixSeconds(t.closed_at);

      if (opened) {
        out.push({
          time: opened,
          position: "belowBar",
          shape: "arrowUp",
          color: "#22c55e",
          text: "BUY",
        });
      }

      if (closed) {
        out.push({
          time: closed,
          position: "aboveBar",
          shape: "arrowDown",
          color: "#ef4444",
          text: "SELL",
        });
      }
    }

    out.sort((a, b) => Number(a.time) - Number(b.time));
    return out;
  }, [trades]);

  /* ================= CREATE CHART ONCE ================= */

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.innerHTML = ""; // StrictMode safety

    const chart = createChart(el, {
      height,
      width: el.clientWidth || 600,
      layout: {
        background: { type: ColorType.Solid, color: "#0b1220" },
        textColor: "#cbd5e1",
      },
      grid: {
        vertLines: { color: "#1f2a44" },
        horzLines: { color: "#1f2a44" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#1f2a44",
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // ✅ Create markers layer ONCE
    markersRef.current = createSeriesMarkers(series, []);

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (!chartRef.current || !containerRef.current) return;
      const w = containerRef.current.clientWidth;
      if (w > 0) chartRef.current.applyOptions({ width: w });
    });

    ro.observe(el);
    roRef.current = ro;

    return () => {
      try {
        ro.disconnect();
      } catch {}

      try {
        chart.remove();
      } catch {}

      roRef.current = null;
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
    };
  }, [height]);

  /* ================= UPDATE DATA (REPLACE, NOT APPEND) ================= */

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;

    if (!series) return;

    // Replace candles
    series.setData(candleData);

    // Replace markers safely
    if (markersRef.current) {
      markersRef.current.setMarkers(markers);
    }

    if (chart && candleData.length) {
      chart.timeScale().fitContent();
    }
  }, [candleData, markers]);

  if (!candles?.length) {
    return (
      <div className="text-slate-400 text-sm">
        No candle data available.
      </div>
    );
  }

  return <div ref={containerRef} className="w-full" style={{ minWidth: 0 }} />;
}