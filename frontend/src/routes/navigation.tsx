import Login from "../pages/Login";
import Register from "../pages/Register";
import OAuthSuccess from "../pages/OAuthSuccess";
import Dashboard from "../pages/Dashboard";
import NotFound from "../pages/NotFound";

// Algorithms
import AlgorithmsList from "../pages/algorithms/AlgorithmsList";
import CreateAlgorithm from "../pages/algorithms/CreateAlgorithm";
import AlgorithmDetail from "../pages/algorithms/AlgorithmDetail";

// Backtests
import BacktestsList from "../pages/backtests/BacktestsList";
import CreateBacktest from "../pages/backtests/CreateBacktest";
import BacktestDetail from "../pages/backtests/BacktestDetail";

// Paper Trading
import PaperRunsList from "../pages/paper/PaperRunsList";
import StartPaperRun from "../pages/paper/StartPaperRun";
import PaperRunDetail from "../pages/paper/PaperRunDetail";

export const nav = [
  // PUBLIC
  { path: "/login", element: <Login />, isPrivate: false },
  { path: "/register", element: <Register />, isPrivate: false },
  { path: "/oauth-success", element: <OAuthSuccess />, isPrivate: false },

  // DASHBOARD
  { path: "/dashboard", element: <Dashboard />, isPrivate: true },

  // ALGORITHMS
  { path: "/algorithms", element: <AlgorithmsList />, isPrivate: true },
  { path: "/algorithms/new", element: <CreateAlgorithm />, isPrivate: true },
  { path: "/algorithms/:id", element: <AlgorithmDetail />, isPrivate: true },

  // BACKTESTS
  { path: "/backtests", element: <BacktestsList />, isPrivate: true },
  { path: "/backtests/new", element: <CreateBacktest />, isPrivate: true },
  { path: "/backtests/:id", element: <BacktestDetail />, isPrivate: true },

  // PAPER
  { path: "/paper", element: <PaperRunsList />, isPrivate: true },
  { path: "/paper/new", element: <StartPaperRun />, isPrivate: true },
  { path: "/paper/:id", element: <PaperRunDetail />, isPrivate: true },

  // 404
  { path: "*", element: <NotFound />, isPrivate: false },
];
