import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
      <div className="flex bg-slate-900 text-white min-h-screen">
        <Sidebar />

        <div className="flex-1 flex flex-col">
          <Navbar />

          <main className="flex-1 p-6 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
  );
}
