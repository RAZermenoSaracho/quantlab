import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";

type NavbarProps = {
  onOpenSidebar?: () => void;
};

export default function Navbar({ onOpenSidebar }: NavbarProps) {
  const { user, logout, isAuthenticated } = useAuth();

  return (
    <header
      className="h-16 flex items-center justify-between px-4 md:px-6"
      style={{
        backgroundColor: "var(--color-bg-panel)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-primary)",
            backgroundColor: "var(--color-bg-elevated)",
          }}
          aria-label="Open navigation menu"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <div
          className="hidden md:block text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Algorithm Testing Suite
        </div>
      </div>

      <Link
        to="/"
        className="md:hidden text-base font-semibold"
        style={{ color: "var(--color-text-primary)" }}
      >
        QuantLab
      </Link>

      <div className="hidden md:flex items-center gap-3 md:gap-4 min-w-0">

        {isAuthenticated && (
          <>
            <span
              className="text-sm truncate max-w-[180px] sm:max-w-none"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {user?.username ? `@${user.username}` : user?.email}
            </span>

            {/* <Link
              to="/ranking"
              className="px-3 py-1 rounded-md text-sm"
              style={{
                color: "var(--color-text-primary)",
                backgroundColor: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
            >
              Ranking
            </Link> */}

            <Link
              to="/profile"
              className="px-3 py-1 rounded-md text-sm"
              style={{
                color: "var(--color-text-primary)",
                backgroundColor: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
            >
              Profile
            </Link>

            <button
              onClick={logout}
              className="px-3 py-1 text-sm rounded-md"
              style={{
                color: "var(--color-text-primary)",
                backgroundColor: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
            >
              Logout
            </button>
          </>
        )}

      </div>
    </header>
  );
}
