import { Navigate, Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { useAuth } from "../context/AuthProvider";
import { useAlgorithmRanking } from "../data/algorithms";
import KpiCard from "../components/ui/KpiCard";
import PerformanceScore from "../components/algorithms/PerformanceScore";

const features = [
  {
    title: "Backtesting",
    description:
      "Run historical simulations of your trading algorithms using real market data.",
  },
  {
    title: "Paper Trading",
    description:
      "Test your strategies in real-time without risking capital.",
  },
  {
    title: "Strategy Development",
    description:
      "Write Python strategies or integrate directly from GitHub.",
  },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const { data } = useAlgorithmRanking();
  const topAlgorithms = (data ?? []).slice(0, 5);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-bg-main)" }}
    >
      <div className="max-w-6xl mx-auto px-6 py-16 space-y-16">
        <section className="text-center space-y-6">
          <h1
            className="text-5xl font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            QuantLab
          </h1>
          <p
            className="max-w-3xl mx-auto text-lg"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Design, backtest and paper trade algorithmic strategies in a single
            platform.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="px-5 py-2.5 rounded-md text-sm font-medium border"
              style={{
                backgroundColor: "var(--color-accent)",
                borderColor: "var(--color-accent)",
                color: "var(--color-text-primary)",
              }}
            >
              Get Started
            </Link>
            <Link
              to="/login"
              className="px-5 py-2.5 rounded-md text-sm font-medium border"
              style={{
                backgroundColor: "var(--color-bg-elevated)",
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              Login
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <Card key={feature.title} className="h-full">
              <div className="space-y-3">
                <h2
                  className="text-xl font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {feature.title}
                </h2>
                <p style={{ color: "var(--color-text-secondary)" }}>
                  {feature.description}
                </p>
              </div>
            </Card>
          ))}
        </section>

        <section className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">Top Algorithms</h2>
              <p className="text-slate-400">
                Highest-ranked strategies across QuantLab.
              </p>
            </div>
            <Link to="/ranking" className="text-sky-400 hover:text-sky-300 text-sm">
              View Ranking
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {topAlgorithms.map((algorithm, index) => (
              <Card key={algorithm.id} className="h-full">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-wide text-slate-500">
                      #{index + 1}
                    </span>
                    <PerformanceScore score={algorithm.performance_score} compact />
                  </div>
                  <div className="space-y-1">
                    <Link
                      to={`/algorithms/${algorithm.id}`}
                      className="text-lg font-semibold text-white hover:text-sky-300"
                    >
                      {algorithm.name}
                    </Link>
                    <p className="text-sm text-slate-400">
                      {algorithm.username ? `@${algorithm.username}` : "Unknown creator"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <KpiCard
                      title="Return"
                      value={algorithm.avg_return_percent}
                      size="compact"
                      format={(value) => `${value.toFixed(1)}%`}
                    />
                    <KpiCard
                      title="Sharpe"
                      value={algorithm.avg_sharpe}
                      size="compact"
                      format={(value) => value.toFixed(2)}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <footer
          className="pt-4 border-t text-sm text-center"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          <p>QuantLab © {new Date().getFullYear()}</p>
          <p>Algorithmic trading research platform</p>
        </footer>
      </div>
    </main>
  );
}
