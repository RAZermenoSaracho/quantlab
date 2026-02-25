import React from "react";

export type ListColumn<T> = {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
};

type ListViewProps<T> = {
  title?: string;
  description?: string;
  columns: ListColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  actions?: React.ReactNode;
};

export default function ListView<T>({
  title,
  description,
  columns,
  data,
  loading = false,
  emptyMessage = "No data available.",
  onRowClick,
  actions,
}: ListViewProps<T>) {
  return (
    <div className="space-y-6">

      {/* Header */}
      {(title || actions) && (
        <div className="flex justify-between items-start">

          <div className="space-y-1">
            {title && (
              <h1 className="text-2xl font-bold text-white">
                {title}
              </h1>
            )}
            {description && (
              <p className="text-slate-400 text-sm">
                {description}
              </p>
            )}
          </div>

          {actions && (
            <div className="flex gap-3">
              {actions}
            </div>
          )}

        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">

        <table className="w-full text-sm">

          <thead className="bg-slate-950 text-slate-400 uppercase text-xs">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-6 py-4 text-left font-medium tracking-wide"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>

            {loading && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center py-10 text-slate-500"
                >
                  Loading...
                </td>
              </tr>
            )}

            {!loading && data.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center py-10 text-slate-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}

            {!loading &&
              data.map((item, idx) => (
                <tr
                  key={idx}
                  onClick={() => onRowClick?.(item)}
                  className={`
                    border-t border-slate-800
                    hover:bg-slate-950
                    transition-colors
                    ${onRowClick ? "cursor-pointer" : ""}
                  `}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-6 py-4 text-slate-300 ${col.className || ""}`}
                    >
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))}

          </tbody>
        </table>

      </div>
    </div>
  );
}