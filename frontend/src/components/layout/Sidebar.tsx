import { NavLink } from "react-router-dom";

const linkClasses =
  "block px-4 py-2 rounded-md text-sm font-medium transition-colors";

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 min-h-screen p-4">
      <div className="text-xl font-bold text-blue-500 mb-8">
        QuantLab
      </div>

      <nav className="space-y-2">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `${linkClasses} ${
              isActive
                ? "bg-slate-800 text-blue-400"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`
          }
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/algorithms"
          className={({ isActive }) =>
            `${linkClasses} ${
              isActive
                ? "bg-slate-800 text-blue-400"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`
          }
        >
          Algorithms
        </NavLink>

        <NavLink
          to="/backtests"
          className={({ isActive }) =>
            `${linkClasses} ${
              isActive
                ? "bg-slate-800 text-blue-400"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`
          }
        >
          Backtests
        </NavLink>

        <NavLink
          to="/paper"
          className={({ isActive }) =>
            `${linkClasses} ${
              isActive
                ? "bg-slate-800 text-blue-400"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`
          }
        >
          Paper Trading
        </NavLink>
      </nav>
    </aside>
  );
}
