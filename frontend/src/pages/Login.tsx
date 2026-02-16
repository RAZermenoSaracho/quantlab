import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";
import OAuthButton from "../components/ui/OAuthButton";

const BACKEND_URL = "http://localhost:5000";

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      login(data.token, data.user);
      navigate("/dashboard");

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleLogin() {
    window.location.href = `${BACKEND_URL}/api/auth/google`;
  }

  function handleGithubLogin() {
    window.location.href = `${BACKEND_URL}/api/auth/github`;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 w-full max-w-md shadow-xl">

        <h1 className="text-2xl font-bold text-white mb-6 text-center">
          QuantLab Login
        </h1>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-900/30 p-3 rounded">
            {error}
          </div>
        )}

        {/* ================= Email Login ================= */}
        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="text-slate-400 text-sm">Email</label>
            <input
              type="email"
              required
              className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500 transition"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="text-slate-400 text-sm">Password</label>
            <input
              type="password"
              required
              className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500 transition"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sky-600 hover:bg-sky-700 transition rounded-lg py-2 text-white font-medium disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center m-6">
          <div className="flex-1 h-px bg-slate-700"></div>
          <span className="px-3 text-slate-500 text-sm">or</span>
          <div className="flex-1 h-px bg-slate-700"></div>
        </div>

        {/* ================= OAuth ================= */}
        <div className="space-y-3 mb-6">
          <OAuthButton
            provider="google"
            onClick={handleGoogleLogin}
          />

          <OAuthButton
            provider="github"
            onClick={handleGithubLogin}
          />
        </div>

        <p className="mt-6 text-sm text-slate-400 text-center">
          Don’t have an account?{" "}
          <Link
            to="/register"
            className="text-sky-400 hover:text-sky-300"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
