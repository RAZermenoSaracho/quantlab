import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllBacktests } from "../services/backtest.service";

interface Backtest {
  id: string;
  symbol: string;
  timeframe: string;
  status: string;
  total_return_percent: string;
  win_rate_percent: string;
  profit_factor: string;
  created_at: string;
}

export default function Dashboard() {
  const [data, setData] = useState<Backtest[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      const res = await getAllBacktests();
      setData(res.backtests);
    }
    fetchData();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Backtests</h1>

      <div className="overflow-x-auto">
        <table className="w-full border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">Symbol</th>
              <th className="p-3 text-left">TF</th>
              <th className="p-3 text-left">Return %</th>
              <th className="p-3 text-left">Win Rate</th>
              <th className="p-3 text-left">PF</th>
              <th className="p-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((run) => (
              <tr
                key={run.id}
                onClick={() => navigate(`/backtest/${run.id}`)}
                className="cursor-pointer hover:bg-gray-50 border-t"
              >
                <td className="p-3">{run.symbol}</td>
                <td className="p-3">{run.timeframe}</td>
                <td className="p-3">{run.total_return_percent}</td>
                <td className="p-3">{run.win_rate_percent}</td>
                <td className="p-3">{run.profit_factor}</td>
                <td className="p-3">{run.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
