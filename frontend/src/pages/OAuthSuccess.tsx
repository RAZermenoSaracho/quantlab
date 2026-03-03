import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";

export default function OAuthSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const payload = params.get("payload");

    if (!payload) {
      navigate("/login");
      return;
    }

    try {
      const parsed = JSON.parse(decodeURIComponent(payload));

      login(parsed.token, parsed.user);
      navigate("/dashboard");
    } catch {
      navigate("/login");
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      Signing you in...
    </div>
  );
}
