import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAlgorithms } from "../../services/algorithm.service";

type Algorithm = {
  id: string;
  name: string;
  description: string;
  created_at: string;
};

export default function AlgorithmsList() {
  const [algorithms, setAlgorithms] = useState<Algorithm[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const data = await getAlgorithms();
        setAlgorithms(data);
      } catch (err) {
        console.error(err);
      }
    }

    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">
          Algorithms
        </h1>

        <button
          onClick={() => navigate("/algorithms/new")}
          className="bg-sky-600 hover:bg-sky-700 px-4 py-2 rounded-lg text-white"
        >
          New Algorithm
        </button>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-left">Created</th>
            </tr>
          </thead>

          <tbody>
            {algorithms.map((algo) => (
              <tr
                key={algo.id}
                onClick={() => navigate(`/algorithms/${algo.id}`)}
                className="border-t border-slate-700 hover:bg-slate-900 cursor-pointer"
              >
                <td className="px-4 py-3 text-white font-medium">
                  {algo.name}
                </td>

                <td className="px-4 py-3 text-slate-400">
                  {algo.description || "-"}
                </td>

                <td className="px-4 py-3 text-slate-500">
                  {new Date(algo.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}

            {algorithms.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center py-6 text-slate-500">
                  No algorithms yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
