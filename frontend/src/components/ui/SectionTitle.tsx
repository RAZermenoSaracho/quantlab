type SectionTitleProps = {
  title: string;
  subtitle?: string;
};

export function SectionTitle({ title, subtitle }: SectionTitleProps) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-white">
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm text-slate-400 mt-1">
          {subtitle}
        </p>
      )}
    </div>
  );
}
