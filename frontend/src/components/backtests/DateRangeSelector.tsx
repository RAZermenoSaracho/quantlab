import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

interface Props {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}

function toISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseISO(value?: string) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default function DateRangeSelector({
  start,
  end,
  onChange,
}: Props) {
  const [activeInput, setActiveInput] =
    useState<"start" | "end" | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const startDate = parseISO(start);
  const endDate = parseISO(end);

  /* Close on outside click */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setActiveInput(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(date?: Date) {
    if (!date || !activeInput) return;

    const iso = toISO(date);

    if (activeInput === "start") {
      onChange(iso, end);
    } else {
      onChange(start, iso);
    }

    setActiveInput(null);
  }

  return (
    <div ref={containerRef} className="grid md:grid-cols-2 gap-6">

      {/* START INPUT */}
      <div className="relative">
        <input
          type="text"
          value={start}
          placeholder="YYYY-MM-DD"
          readOnly
          onClick={() => setActiveInput("start")}
          className="form-input cursor-pointer"
        />

        {activeInput === "start" && (
          <div className="absolute z-50 mt-2 left-0">
            <CalendarDropdown
              selected={startDate}
              onSelect={handleSelect}
              today={today}
            />
          </div>
        )}
      </div>

      {/* END INPUT */}
      <div className="relative">
        <input
          type="text"
          value={end}
          placeholder="YYYY-MM-DD"
          readOnly
          onClick={() => setActiveInput("end")}
          className="form-input cursor-pointer"
        />

        {activeInput === "end" && (
          <div className="absolute z-50 mt-2 left-0">
            <CalendarDropdown
              selected={endDate}
              onSelect={handleSelect}
              today={today}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ===========================
   Calendar Dropdown Component
=========================== */

function CalendarDropdown({
  selected,
  onSelect,
  today,
}: {
  selected?: Date;
  onSelect: (date?: Date) => void;
  today: Date;
}) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl">

      <DayPicker
        mode="single"
        selected={selected}
        onSelect={onSelect}
        disabled={{ after: today }}
        captionLayout="dropdown"
        fromYear={2015}
        toYear={today.getFullYear()}
        classNames={{
          month: "w-full",
          table: "w-full border-collapse",
          head_row: "grid grid-cols-7 text-xs text-slate-500",
          row: "grid grid-cols-7 mt-3",
          cell: "flex justify-center",
          day_button:
            "w-10 h-10 flex items-center justify-center rounded-full text-slate-200 hover:bg-slate-800 transition",
          selected:
            "bg-blue-600 text-white rounded-full",
        }}
      />
    </div>
  );
}
