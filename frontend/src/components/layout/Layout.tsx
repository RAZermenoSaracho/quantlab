import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-slate-900 text-white overflow-x-hidden">
      <Sidebar />

      <div className="flex flex-1 min-w-0 flex-col">
        <Navbar />

        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
