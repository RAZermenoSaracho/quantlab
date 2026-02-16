import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  ids: string[];
  currentId: string;
  basePath: string; // e.g. "/backtest" or "/algorithms"
};

export default function DetailNavigator({
  ids,
  currentId,
  basePath,
}: Props) {
  const navigate = useNavigate();

  const currentIndex = ids.findIndex((id) => id === currentId);

  if (currentIndex === -1 || ids.length <= 1) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < ids.length - 1;

  const goPrev = () => {
    if (!hasPrev) return;
    navigate(`${basePath}/${ids[currentIndex - 1]}`);
  };

  const goNext = () => {
    if (!hasNext) return;
    navigate(`${basePath}/${ids[currentIndex + 1]}`);
  };

  return (
    <div className="flex items-center gap-3">

      {/* Counter */}
      <span className="text-xs text-slate-400">
        {currentIndex + 1} / {ids.length}
      </span>

      {/* Previous */}
      <button
        onClick={goPrev}
        disabled={!hasPrev}
        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 transition"
      >
        <ChevronLeft size={18} className="text-slate-300" />
      </button>

      {/* Next */}
      <button
        onClick={goNext}
        disabled={!hasNext}
        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 transition"
      >
        <ChevronRight size={18} className="text-slate-300" />
      </button>
    </div>
  );
}
