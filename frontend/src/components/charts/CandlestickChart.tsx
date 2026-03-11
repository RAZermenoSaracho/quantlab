import { useEffect, useMemo, useRef, useState } from "react";
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
  volume?: number;
};

type Trade = {
  side: "BUY" | "SELL" | string;
  opened_at?: string | null;
  closed_at?: string | null;
};

type ChartTimeframe = "1s" | "5s" | "15s" | "1m" | "5m";
type MarkerApi = {
  setMarkers: (markers: SeriesMarker<UTCTimestamp>[]) => void;
};

type NormalizedCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const CHART_TIMEFRAMES: readonly ChartTimeframe[] = [
  "1s",
  "5s",
  "15s",
  "1m",
  "5m",
];

const TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
  "1s": 1,
  "5s": 5,
  "15s": 15,
  "1m": 60,
  "5m": 300,
};

function toUnixSeconds(ts: unknown): UTCTimestamp | null {
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

function aggregateCandles(
  candles: readonly NormalizedCandle[],
  timeframe: ChartTimeframe
): NormalizedCandle[] {
  if (!candles.length) {
    return [];
  }

  const bucketSize = TIMEFRAME_SECONDS[timeframe];
  const out: NormalizedCandle[] = [];
  let current: NormalizedCandle | null = null;

  for (const candle of candles) {
    const bucketTime = Math.floor(candle.time / bucketSize) * bucketSize;

    if (!current || current.time !== bucketTime) {
      if (current) {
        out.push(current);
      }

      current = {
        time: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      };
      continue;
    }

    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    current.close = candle.close;
    current.volume += candle.volume;
  }

  if (current) {
    out.push(current);
  }

  return out;
}

export default function CandlestickChart({
  candles,
  trades,
  height = 420,
  showTimeframeSelector = true,
}: {
  candles: Candle[];
  trades: Trade[];
  height?: number;
  showTimeframeSelector?: boolean;
}) {
  const resolvedHeight = Math.max(height, 320);
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>("1m");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<MarkerApi | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const previousDataRef = useRef<CandlestickData<UTCTimestamp>[]>([]);
  const hasFittedContentRef = useRef(false);

  const normalizedCandles = useMemo(() => {
    const out: NormalizedCandle[] = [];

    for (const c of candles ?? []) {
      const time = toUnixSeconds(c.timestamp);
      if (!time) continue;

      out.push({
        time,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume ?? 0),
      });
    }

    out.sort((a, b) => Number(a.time) - Number(b.time));
    return out;
  }, [candles]);

  const aggregatedCandles = useMemo(
    () => aggregateCandles(normalizedCandles, chartTimeframe),
    [normalizedCandles, chartTimeframe]
  );

  const candleData = useMemo(() => {
    return aggregatedCandles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
  }, [aggregatedCandles]);

  const markers = useMemo(() => {
    const out: SeriesMarker<UTCTimestamp>[] = [];
    const bucketSize = TIMEFRAME_SECONDS[chartTimeframe];

    for (const t of trades ?? []) {
      const opened = toUnixSeconds(t.opened_at);
      const closed = toUnixSeconds(t.closed_at);
      const side = String(t.side ?? "").toUpperCase();

      const openedBucket = opened
        ? (Math.floor(opened / bucketSize) * bucketSize) as UTCTimestamp
        : null;
      const closedBucket = closed
        ? (Math.floor(closed / bucketSize) * bucketSize) as UTCTimestamp
        : null;

      if (openedBucket) {
        if (side === "SHORT" || side === "SELL") {
          out.push({
            time: openedBucket,
            position: "aboveBar",
            shape: "arrowDown",
            color: "#f59e0b",
            text: "SHORT",
          });
        } else {
          out.push({
            time: openedBucket,
            position: "belowBar",
            shape: "arrowUp",
            color: "#22c55e",
            text: "LONG",
          });
        }
      }

      if (closedBucket) {
        out.push({
          time: closedBucket,
          position: "aboveBar",
          shape: "circle",
          color: "#ef4444",
          text: "✖ CLOSE",
        });
      }
    }

    out.sort((a, b) => Number(a.time) - Number(b.time));
    return out;
  }, [trades, chartTimeframe]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.innerHTML = "";
    const initialWidth = Math.max(el.clientWidth, 300);

    const chart = createChart(el, {
      height: resolvedHeight,
      width: initialWidth,
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
        secondsVisible: TIMEFRAME_SECONDS[chartTimeframe] < 60,
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
    markersRef.current = createSeriesMarkers(series, []);

    const ro = new ResizeObserver(() => {
      if (!chartRef.current || !containerRef.current) return;
      const w = containerRef.current.clientWidth;
      if (w > 0) {
        chartRef.current.applyOptions({ width: w });
      }
    });

    ro.observe(el);
    roRef.current = ro;

    return () => {
      try {
        ro.disconnect();
      } catch {
        // no-op
      }

      try {
        chart.remove();
      } catch {
        // no-op
      }

      roRef.current = null;
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
      previousDataRef.current = [];
      hasFittedContentRef.current = false;
    };
  }, [resolvedHeight]);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    chartRef.current.applyOptions({
      timeScale: {
        secondsVisible: TIMEFRAME_SECONDS[chartTimeframe] < 60,
      },
    });
  }, [chartTimeframe]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;

    if (!series) return;
    const previous = previousDataRef.current;
    const next = candleData;

    if (next.length === 0) {
      series.setData([]);
      previousDataRef.current = [];
    } else if (previous.length === 0) {
      series.setData(next);
      previousDataRef.current = next;

      if (chart && !hasFittedContentRef.current) {
        if (next.length > 800) {
          chart.timeScale().setVisibleLogicalRange({
            from: next.length - 800,
            to: next.length + 20,
          });
        } else {
          chart.timeScale().fitContent();
        }
        hasFittedContentRef.current = true;
      }
    } else {
      const prevLast = previous[previous.length - 1];
      const nextLast = next[next.length - 1];
      const canUpdateInPlace =
        (next.length === previous.length && nextLast.time === prevLast.time) ||
        (next.length === previous.length + 1 &&
          next[next.length - 2]?.time === prevLast.time);

      if (canUpdateInPlace) {
        series.update(nextLast);
      } else {
        series.setData(next);
      }

      previousDataRef.current = next;
    }

    if (markersRef.current) {
      markersRef.current.setMarkers(markers);
    }
  }, [candleData, markers]);

  return (
    <div className="relative w-full max-w-full min-w-0 overflow-hidden">
      {showTimeframeSelector && (
        <div className="mb-3 flex items-center justify-end gap-2">
          {CHART_TIMEFRAMES.map((timeframe) => (
            <button
              key={timeframe}
              type="button"
              onClick={() => setChartTimeframe(timeframe)}
              className={`rounded-md border px-2 py-1 text-xs ${
                chartTimeframe === timeframe
                  ? "border-sky-500 bg-sky-600/20 text-sky-300"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
              }`}
            >
              {timeframe}
            </button>
          ))}
        </div>
      )}

      <div
        className="relative w-full max-w-full min-w-0 overflow-hidden"
        style={{ height: resolvedHeight }}
      >
        {!candles?.length && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            Waiting for candles...
          </div>
        )}
        <div ref={containerRef} className="w-full max-w-full h-full" />
      </div>
      <div className="mt-2 text-xs text-slate-500">
        Times shown in UTC
      </div>
    </div>
  );
}
