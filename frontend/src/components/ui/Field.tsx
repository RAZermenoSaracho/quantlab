export default function Field({ label, children }: any) {

  return (
    <div className="space-y-3">

      <label className="text-sm font-medium text-slate-300">
        {label}
      </label>

      {children}

    </div>
  );
}