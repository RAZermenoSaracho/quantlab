import type { ReactNode } from "react";

function Hint({ children }: { children: ReactNode }) {

  return (
    <p className="text-xs text-slate-500 mt-1">
      {children}
    </p>
  );
}

export default Hint;
