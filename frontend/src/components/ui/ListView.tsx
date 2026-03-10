import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ListData } from "../../types/ui";

export type ListColumn<T> = {
  id?: string;
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
  defaultVisible?: boolean;
};

type ListViewProps<T> = {
  title?: string;
  description?: string;
  columns: ListColumn<T>[];
  data: ListData<T>;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  actions?: React.ReactNode;
  tableId?: string;
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
  tableId,
}: ListViewProps<T>) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[] | null>(null);
  const columnsMenuRef = useRef<HTMLDivElement | null>(null);

  const normalizedColumns = useMemo(
    () =>
      columns.map((column) => ({
        ...column,
        _id: column.id ?? column.key,
      })),
    [columns]
  );

  const storageKey = tableId ? `quantlab:listview:${tableId}:columns` : null;

  useEffect(() => {
    if (!storageKey) {
      setVisibleColumnIds(null);
      return;
    }

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        const defaults = normalizedColumns
          .filter((column) => column.defaultVisible !== false)
          .map((column) => column._id);
        setVisibleColumnIds(defaults);
        return;
      }

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const allowed = new Set(normalizedColumns.map((column) => column._id));
        const filtered = parsed.filter(
          (columnId): columnId is string =>
            typeof columnId === "string" && allowed.has(columnId)
        );
        setVisibleColumnIds(filtered);
      } else {
        const defaults = normalizedColumns
          .filter((column) => column.defaultVisible !== false)
          .map((column) => column._id);
        setVisibleColumnIds(defaults);
      }
    } catch {
      const defaults = normalizedColumns
        .filter((column) => column.defaultVisible !== false)
        .map((column) => column._id);
      setVisibleColumnIds(defaults);
    }
  }, [storageKey, normalizedColumns]);

  useEffect(() => {
    if (!storageKey || !visibleColumnIds) {
      return;
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(visibleColumnIds));
    } catch {
      // Ignore localStorage errors.
    }
  }, [storageKey, visibleColumnIds]);

  useEffect(() => {
    if (!columnsOpen) {
      return;
    }

    function onDocumentClick(event: MouseEvent) {
      const target = event.target as Node;
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(target)) {
        setColumnsOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [columnsOpen]);

  const activeColumns = useMemo(() => {
    if (!tableId || !visibleColumnIds) {
      return normalizedColumns;
    }

    const visibleSet = new Set(visibleColumnIds);
    const filtered = normalizedColumns.filter((column) => visibleSet.has(column._id));
    return filtered.length ? filtered : normalizedColumns;
  }, [tableId, visibleColumnIds, normalizedColumns]);

  const canToggleColumns = Boolean(tableId);

  function toggleColumn(columnId: string) {
    if (!tableId) {
      return;
    }

    setVisibleColumnIds((current) => {
      const base =
        current ??
        normalizedColumns
          .filter((column) => column.defaultVisible !== false)
          .map((column) => column._id);

      const set = new Set(base);
      if (set.has(columnId)) {
        if (set.size === 1) {
          return base;
        }
        set.delete(columnId);
      } else {
        set.add(columnId);
      }
      return normalizedColumns
        .map((column) => column._id)
        .filter((id) => set.has(id));
    });
  }

  function isNumericColumn(columnId: string, header: string): boolean {
    const idProbe = String(columnId).toLowerCase();
    const headerProbe = String(header).toLowerCase();

    const tokenPattern =
      /(^|_|\b)(pnl|fee|qty|quantity|price|value|notional|balance|equity|return|drawdown|trades|rate|exposure|sharpe|volatility)(_|\b|$)/;

    return tokenPattern.test(idProbe) || tokenPattern.test(headerProbe);
  }

  return (
    <div className="min-w-0 w-full max-w-full space-y-6">

      {/* Header */}
      {(title || actions || canToggleColumns) && (
        <div className="flex w-full min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

          <div className="min-w-0 space-y-1">
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

          <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap sm:gap-3">
            {actions && (
              <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto sm:flex-nowrap sm:gap-3">
                {actions}
              </div>
            )}

            {canToggleColumns && (
              <div className="relative" ref={columnsMenuRef}>
                <button
                  type="button"
                  onClick={() => setColumnsOpen((prev) => !prev)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
                >
                  Columns
                </button>

                {columnsOpen && (
                  <div className="absolute right-0 z-20 mt-2 max-h-80 w-64 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-2 shadow-xl">
                    {normalizedColumns.map((column) => {
                      const checked = (visibleColumnIds ?? normalizedColumns
                        .filter((c) => c.defaultVisible !== false)
                        .map((c) => c._id)).includes(column._id);

                      return (
                        <label
                          key={column._id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-slate-200 hover:bg-slate-900"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleColumn(column._id)}
                            className="h-3.5 w-3.5"
                          />
                          <span>{column.header}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Table */}
      <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-800 bg-slate-900 shadow-sm">

        <table className="w-max min-w-full text-sm">

          <thead className="bg-slate-950 text-slate-400 uppercase text-xs">
            <tr>
              {activeColumns.map((col) => {
                const numeric = isNumericColumn(col._id, col.header);
                return (
                <th
                  key={col._id}
                  className={`whitespace-nowrap px-4 py-2 font-medium tracking-wide ${numeric ? "text-right" : "text-left"}`}
                >
                  {col.header}
                </th>
                );
              })}
            </tr>
          </thead>

          <tbody>

            {loading && (
              <tr>
                <td
                  colSpan={activeColumns.length}
                  className="py-8 text-center text-slate-500"
                >
                  Loading...
                </td>
              </tr>
            )}

            {!loading && data.length === 0 && (
              <tr>
                <td
                  colSpan={activeColumns.length}
                  className="py-8 text-center text-slate-500"
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
                  {activeColumns.map((col) => {
                    const numeric = isNumericColumn(col._id, col.header);
                    return (
                      <td
                        key={col._id}
                        className={`whitespace-nowrap px-4 py-2 text-slate-300 ${numeric ? "text-right" : ""} ${col.className || ""}`}
                      >
                        {col.render(item)}
                      </td>
                    );
                  })}
                </tr>
              ))}

          </tbody>
        </table>

      </div>
    </div>
  );
}
