import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  ids: string[];
  currentId: string;
  basePath: string;
};

export default function DetailNavigator({
  ids,
  currentId,
  basePath,
}: Props) {
  const navigate = useNavigate();

  const total = ids.length;
  const currentIndex = ids.findIndex((id) => id === currentId);

  if (currentIndex === -1 || total <= 1) return null;

  // 🔁 Circular logic
  const prevIndex = (currentIndex - 1 + total) % total;
  const nextIndex = (currentIndex + 1) % total;

  const goPrev = () => {
    navigate(`${basePath}/${ids[prevIndex]}`);
  };

  const goNext = () => {
    navigate(`${basePath}/${ids[nextIndex]}`);
  };

  return (
    <div className="flex items-center gap-3">
      {/* Counter */}
      <span className="text-xs text-slate-400">
        {currentIndex + 1} / {total}
      </span>

      {/* Previous */}
      <button
        onClick={goPrev}
        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
      >
        <ChevronLeft size={18} className="text-slate-300" />
      </button>

      {/* Next */}
      <button
        onClick={goNext}
        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
      >
        <ChevronRight size={18} className="text-slate-300" />
      </button>
    </div>
  );
}
