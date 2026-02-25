import { useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

interface Props {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}

/* ===========================
   Helpers
=========================== */

function toISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseISO(value?: string) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function isSameDay(a?: Date, b?: Date) {
  return !!a && !!b && a.toDateString() === b.toDateString();
}

export default function DateRangeSelector({
  start,
  end,
  onChange,
}: Props) {
  const [showCalendar, setShowCalendar] = useState(false);

  const from = parseISO(start);
  const to = parseISO(end);

  /* ===========================
     Range Logic (Controlled)
  =========================== */

  function applyRange(nextFrom?: Date, nextTo?: Date) {
    const s = nextFrom ? toISO(nextFrom) : "";
    const e = nextTo ? toISO(nextTo) : "";
    onChange(s, e);
  }

  function handleDayClick(day: Date) {
    // No selection yet
    if (!from && !to) {
      applyRange(day, undefined);
      return;
    }

    // Only start selected
    if (from && !to) {
      if (day < from) {
        applyRange(day, from);
      } else if (isSameDay(day, from)) {
        applyRange(from, from);
      } else {
        applyRange(from, day);
      }
      return;
    }

    // Full range selected
    if (from && to) {
      // Click before range → move start
      if (day < from) {
        applyRange(day, to);
        return;
      }

      // Click after range → move end
      if (day > to) {
        applyRange(from, day);
        return;
      }

      // Click inside range → move closest edge
      const distToStart = Math.abs(day.getTime() - from.getTime());
      const distToEnd = Math.abs(to.getTime() - day.getTime());

      if (distToStart <= distToEnd) {
        applyRange(day, to);
      } else {
        applyRange(from, day);
      }
    }
  }

  /* ===========================
     Presets
  =========================== */

  const presets = [
    { label: "1M", days: 30 },
    { label: "3M", days: 90 },
    { label: "6M", days: 180 },
    { label: "1Y", days: 365 },
    { label: "2Y", days: 730 },
  ];

  return (
    <div className="space-y-6">

      {/* =======================
         Manual Inputs
      ======================== */}
      <div className="grid md:grid-cols-2 gap-6">

        <input
          type="text"
          value={start}
          placeholder="YYYY-MM-DD"
          onChange={(e) => onChange(e.target.value, end)}
          className="form-input"
        />

        <input
          type="text"
          value={end}
          placeholder="YYYY-MM-DD"
          onChange={(e) => onChange(start, e.target.value)}
          className="form-input"
        />

      </div>

      {/* =======================
         Presets
      ======================== */}
      <div className="flex flex-wrap gap-3">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              const endDate = new Date();
              const startDate = new Date();
              startDate.setDate(endDate.getDate() - preset.days);

              applyRange(startDate, endDate);
            }}
            className="px-4 py-2 text-sm bg-slate-900 border border-slate-700 rounded-xl text-slate-300 hover:bg-slate-800 transition"
          >
            {preset.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => applyRange(undefined, undefined)}
          className="px-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:bg-slate-700 transition"
        >
          Clear
        </button>
      </div>

      {/* =======================
         Calendar Toggle
      ======================== */}
      <button
        type="button"
        onClick={() => setShowCalendar(!showCalendar)}
        className="text-sm text-sky-400 hover:text-sky-300"
      >
        {showCalendar ? "Hide calendar" : "Open calendar"}
      </button>

      {/* =======================
         Calendar
      ======================== */}
      {showCalendar && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 shadow-xl w-full">

          <DayPicker
            mode="range"
            selected={{ from, to }}
            onDayClick={handleDayClick}
            numberOfMonths={2}
            captionLayout="dropdown"
            fromYear={2015}
            toYear={new Date().getFullYear()}
            classNames={{
              months: "grid grid-cols-1 md:grid-cols-2 gap-16 w-full",
              month: "w-full",
              table: "w-full border-collapse",
              head_row: "grid grid-cols-7 text-xs text-slate-500",
              row: "grid grid-cols-7 mt-3",
              cell: "flex justify-center",
              day_button:
                "w-10 h-10 flex items-center justify-center rounded-full text-slate-200 hover:bg-slate-800 transition",
              selected:
                "bg-blue-600 text-white rounded-full",
              range_start:
                "bg-blue-600 text-white rounded-full",
              range_end:
                "bg-blue-600 text-white rounded-full",
              range_middle:
                "bg-blue-500/20 text-slate-200",
            }}
          />

        </div>
      )}

    </div>
  );
}