import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "../ui/Button";

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
      <Button
        variant="GHOST"
        size="icon"
        onClick={goPrev}
      >
        <ChevronLeft size={18} />
      </Button>

      {/* Next */}
      <Button
        variant="GHOST"
        size="icon"
        onClick={goNext}
      >
        <ChevronRight size={18} className="text-slate-300" />
      </Button>
    </div>
  );
}
