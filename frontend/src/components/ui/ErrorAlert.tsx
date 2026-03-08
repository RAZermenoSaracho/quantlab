type ErrorAlertProps = {
  message: string;
  mode?: "inline" | "toast";
  onClose?: () => void;
};

export default function ErrorAlert({
  message,
  mode = "inline",
  onClose,
}: ErrorAlertProps) {
  const isToast = mode === "toast";

  return (
    <div
      className={[
        "border text-red-300",
        "bg-red-900/50 border-red-800",
        "rounded-xl px-4 py-3",
        isToast ? "fixed right-6 top-6 z-50 max-w-md shadow-xl" : "",
      ].join(" ")}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm">{message}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-red-200 hover:text-white"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

