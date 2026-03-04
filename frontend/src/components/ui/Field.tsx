import type { ReactNode } from "react";

export default function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {

  return (
    <div className="space-y-3">

      <label className="text-sm font-medium text-slate-300">
        {label}
      </label>

      {children}

    </div>
  );
}
