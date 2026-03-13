import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";

const linkClasses =
  "block px-4 py-2 rounded-md text-sm font-medium transition-colors";

type SidebarProps = {
  isOpen?: boolean;
  onClose?: () => void;
};

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { logout } = useAuth();
  const sidebarClasses = [
    "fixed inset-y-0 left-0 z-40 w-64 min-h-screen p-4 transform transition-transform duration-200",
    "md:static md:translate-x-0 md:block",
    isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
  ].join(" ");

  return (
    <aside
      className={sidebarClasses}
      style={{
        backgroundColor: "var(--color-bg-panel)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      <Link
        to="/"
        onClick={onClose}
        className="block text-xl font-bold mb-8"
        style={{ color: "var(--color-accent)" }}
      >
        QuantLab
      </Link>

      <nav className="space-y-2">
        <NavLink
          to="/dashboard"
          onClick={onClose}
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
          onClick={onClose}
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
          to="/ranking"
          onClick={onClose}
          className={({ isActive }) =>
            `${linkClasses} ${
              isActive
                ? "bg-slate-800 text-blue-400"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`
          }
        >
          Ranking
        </NavLink>

        <NavLink
          to="/backtests"
          onClick={onClose}
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
          onClick={onClose}
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

        <NavLink
          to="/profile"
          onClick={onClose}
          className={({ isActive }) =>
            `md:hidden ${linkClasses} ${
              isActive
                ? "bg-slate-800 text-blue-400"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`
          }
        >
          Profile
        </NavLink>

        <button
          type="button"
          onClick={() => {
            logout();
            onClose?.();
          }}
          className={`md:hidden w-full text-left ${linkClasses} text-slate-400 hover:bg-slate-800 hover:text-white`}
        >
          Logout
        </button>

      </nav>
    </aside>
  );
}
