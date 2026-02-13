import { useEffect, useState } from "react";
import { getBacktest } from "../services/backtest.service";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function BacktestDetail() {
    const [data, setData] = useState<any>(null);

    const runId = "6a61e724-a6e6-4035-9afb-4e801b8decf0"; // temporal hardcode

    useEffect(() => {
        const fetchData = async () => {
            const token = localStorage.getItem("token");
            if (!token) return;

            const res = await getBacktest(runId, token);
            setData(res);
        };

        fetchData();
    }, []);

    if (!data) return <div>Loading...</div>;

    const equityData = data.trades.map((t: any, index: number) => ({
        index,
        pnl: t.pnl
    }));

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Backtest Result</h1>

            <div className="grid grid-cols-3 gap-4 mb-6">
                <div>Total Return %: {data.metrics?.total_return_percent}</div>
                <div>Win Rate %: {data.metrics?.win_rate_percent}</div>
                <div>Profit Factor: {data.metrics?.profit_factor}</div>
            </div>

            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={equityData}>
                        <XAxis dataKey="index" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="pnl" stroke="#8884d8" />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <h2 className="mt-6 text-xl font-semibold">Trades</h2>

            <table className="mt-2 w-full border">
                <thead>
                    <tr>
                        <th>Entry</th>
                        <th>Exit</th>
                        <th>PnL</th>
                    </tr>
                </thead>
                <tbody>
                    {data.trades.map((trade: any) => (
                        <tr key={trade.id}>
                            <td>{trade.entry_price}</td>
                            <td>{trade.exit_price}</td>
                            <td>{trade.pnl}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
