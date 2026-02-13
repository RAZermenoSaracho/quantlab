import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import BacktestDetail from "../pages/BacktestDetail";
import NotFound from "../pages/NotFound";

export const nav = [
    { path: "/login", element: <Login />, isPrivate: false },
    { path: "/", element: <Dashboard />, isPrivate: true },
    { path: "/backtest/:id", element: <BacktestDetail />, isPrivate: true },
    { path: "*", element: <NotFound />, isPrivate: false },
];
