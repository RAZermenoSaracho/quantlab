import { useAuth } from "../../context/AuthProvider";

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6">
      <div className="text-slate-400 text-sm">
        Algorithm Testing Suite
      </div>

      <div className="flex items-center gap-4">

        {isAuthenticated && (
          <>
            <span className="text-slate-400 text-sm">
              {user?.email}
            </span>

            <button
              onClick={logout}
              className="px-3 py-1 text-sm bg-slate-800 hover:bg-slate-700 rounded-md text-white"
            >
              Logout
            </button>
          </>
        )}

      </div>
    </header>
  );
}
