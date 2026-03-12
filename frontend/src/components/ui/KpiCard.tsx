import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

type KpiSize = "compact" | "default" | "large";

type KpiCardProps = {
  title: string;
  value: number;
  format?: (v: number) => string;
  positive?: boolean;
  variant?: "good" | "neutral" | "bad";
  size?: KpiSize;
  sparkline?: number[];
  tooltip?: string;
};

export default function KpiCard({
  title,
  value,
  format,
  positive,
  variant,
  size = "default",
  sparkline,
  tooltip,
}: KpiCardProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef(value);

  /* ========= Animated Counter ========= */

  useEffect(() => {
    const start = prev.current;
    const end = value;

    if (start === end) return;

    const duration = 300;
    const startTime = performance.now();

    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const current = start + (end - start) * progress;
      setDisplayValue(current);

      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);

    /* flash effect */
    if (end > start) setFlash("up");
    else setFlash("down");

    const t = setTimeout(() => setFlash(null), 500);

    prev.current = end;

    return () => clearTimeout(t);
  }, [value]);

  /* ========= Size Config ========= */

  const sizeStyles = {
    compact: {
      container: "px-3 py-2",
      title: "text-[10px]",
      value: "text-base",
    },
    default: {
      container: "px-4 py-3",
      title: "text-xs",
      value: "text-lg",
    },
    large: {
      container: "px-6 py-4",
      title: "text-sm",
      value: "text-2xl",
    },
  };

  const formatted = format ? format(displayValue) : displayValue.toFixed(2);
  const variantClass =
    variant === "good"
      ? "text-emerald-400"
      : variant === "neutral"
        ? "text-yellow-400"
        : variant === "bad"
          ? "text-red-400"
          : null;

  return (
    <div
      title={tooltip}
      className={clsx(
        "relative bg-slate-900/70 backdrop-blur-sm border border-slate-800 rounded-lg transition-all duration-300",
        sizeStyles[size].container,
        flash === "up" && "ring-1 ring-emerald-500/40",
        flash === "down" && "ring-1 ring-red-500/40"
      )}
    >
      {/* Title */}
      <p
        className={clsx(
          "uppercase tracking-wider text-slate-500",
          sizeStyles[size].title
        )}
      >
        {title}
      </p>

      {/* Value */}
      <p
        className={clsx(
          "mt-1 font-semibold transition-colors duration-200",
          sizeStyles[size].value,
          variantClass ??
            (positive === undefined
              ? "text-white"
              : positive
                ? "text-emerald-400"
                : "text-red-400")
        )}
      >
        {formatted}
      </p>

      {/* Sparkline */}
      {sparkline && sparkline.length > 1 && (
        <div className="absolute bottom-1 right-2 w-20 h-6 opacity-40">
          <svg viewBox="0 0 100 30" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              points={sparkline
                .map((v, i) => {
                  const max = Math.max(...sparkline);
                  const min = Math.min(...sparkline);
                  const y =
                    max === min
                      ? 15
                      : 30 - ((v - min) / (max - min)) * 30;
                  const x = (i / (sparkline.length - 1)) * 100;
                  return `${x},${y}`;
                })
                .join(" ")}
            />
          </svg>
        </div>
      )}
    </div>
  );
}
