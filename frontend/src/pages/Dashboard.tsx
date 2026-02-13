import { Link } from "react-router-dom";

export default function Dashboard() {
    return (
        <div className="p-10">
            <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

            <Link
                to="/backtest/0445449f-86ce-451c-8999-2200ba99c9d3"
                className="text-blue-500 underline"
            >
                View Sample Backtest
            </Link>
        </div>
    );
}
