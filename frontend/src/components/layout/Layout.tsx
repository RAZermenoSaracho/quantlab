import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useAuth } from "../../context/AuthProvider";
import UsernameManager from "../profile/UsernameManager";

export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen max-w-full bg-slate-900 text-white overflow-x-hidden">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {isSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 md:hidden"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.45)" }}
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close navigation menu"
        />
      )}

      <div className="flex flex-1 min-w-0 max-w-full flex-col">
        <Navbar onOpenSidebar={() => setIsSidebarOpen(true)} />

        <main className="flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {!user?.username && (
        <UsernameManager
          mode="modal"
          initialUsername={user?.username ?? ""}
          title="Choose your username"
          description="This will be used for your public profile and algorithm attribution."
        />
      )}
    </div>
  );
}
