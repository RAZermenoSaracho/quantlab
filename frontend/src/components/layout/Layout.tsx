import { Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";

export default function Layout() {
    const { logout } = useAuth();

    return (
        <div>
            <nav className="p-4 bg-gray-900 text-white flex justify-between">
                <span className="font-bold">QuantLab</span>
                <button onClick={logout}>Logout</button>
            </nav>

            <div className="p-6">
                <Outlet />
            </div>
        </div>
    );
}
