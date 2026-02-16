import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getAlgorithmById,
  deleteAlgorithm,
} from "../../services/algorithm.service";

type Algorithm = {
  id: string;
  name: string;
  description: string;
  code: string;
  created_at: string;
};

export default function AlgorithmDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [algorithm, setAlgorithm] = useState<Algorithm | null>(null);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const data = await getAlgorithmById(id);
      setAlgorithm(data);
    }

    load();
  }, [id]);

  if (!algorithm) {
    return <div className="text-slate-400 p-6">Loading...</div>;
  }

  async function handleDelete() {
    if (!id) return;
    await deleteAlgorithm(id);
    navigate("/algorithms");
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">
          {algorithm.name}
        </h1>

        <button
          onClick={handleDelete}
          className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-white"
        >
          Delete
        </button>
      </div>

      <div className="text-slate-400">
        {algorithm.description}
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 overflow-auto">
        <pre className="text-sm text-slate-300 font-mono">
          {algorithm.code}
        </pre>
      </div>
    </div>
  );
}
