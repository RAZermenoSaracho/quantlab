import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "PRIMARY"
  | "CREATE"
  | "DELETE"
  | "STOP"
  | "WARNING"
  | "SUCCESS"
  | "GHOST"
  | "OUTLINE";

type ButtonSize = "sm" | "md" | "lg" | "icon";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  children: ReactNode;
}

export default function Button({
  variant = "PRIMARY",
  size = "md",
  loading = false,
  loadingText,
  fullWidth = false,
  children,
  disabled,
  className,
  type = "button",
  ...props
}: Props) {
  const isDisabled = disabled || loading;

  const base =
    "inline-flex max-w-full shrink-0 items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900";

  const sizes: Record<ButtonSize, string> = {
    sm: "px-2.5 py-1 text-[11px] sm:px-3 sm:py-1 sm:text-xs",
    md: "px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm",
    lg: "px-4 py-2 text-sm sm:px-6 sm:py-3 sm:text-base",
    icon: "p-1.5 rounded-lg sm:p-2",
  };

  const variants: Record<ButtonVariant, string> = {
    PRIMARY:
      "bg-sky-600 hover:bg-sky-700 text-white focus:ring-sky-500",
    CREATE:
      "bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500",
    DELETE:
      "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500",
    STOP:
      "bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500",
    WARNING:
      "bg-yellow-600 hover:bg-yellow-700 text-white focus:ring-yellow-500",
    SUCCESS:
      "bg-emerald-500 hover:bg-emerald-600 text-white focus:ring-emerald-400",
    GHOST:
      "bg-transparent hover:bg-slate-800 text-slate-300 focus:ring-slate-600",
    OUTLINE:
      "border border-slate-600 text-slate-300 hover:bg-slate-800 focus:ring-slate-600",
  };

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={clsx(
        base,
        sizes[size],
        variants[variant],
        fullWidth && "w-full",
        isDisabled && "opacity-50 cursor-not-allowed pointer-events-none",
        className
      )}
      {...props}
    >
      {loading && (
        <span className="h-3 w-3 sm:h-4 sm:w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
      )}

      <span className="block max-w-full truncate">
        {loading ? loadingText ?? "Processing..." : children}
      </span>
    </button>
  );
}
