
export default function FormCard({ title, description, children }: any) {

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-8 space-y-6 shadow-sm">

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-slate-400 text-sm">{description}</p>
      </div>

      {children}

    </div>
  );
}
