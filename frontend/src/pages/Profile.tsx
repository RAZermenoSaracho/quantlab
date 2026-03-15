import { useEffect, useMemo, useState } from "react";
import type { AuthProfile } from "@quantlab/contracts";
import Button from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { SectionTitle } from "../components/ui/SectionTitle";
import { useAuth } from "../context/AuthProvider";
import {
  changePassword,
  getAuthProfile,
} from "../services/auth.service";
import ErrorAlert from "../components/ui/ErrorAlert";
import UsernameManager from "../components/profile/UsernameManager";

function fmtMaybeDate(value: unknown): string {
  if (typeof value !== "string" || !value) {
    return "";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString();
}

function providerLabel(provider: AuthProfile["provider"]): string {
  if (provider === "google") {
    return "OAuth Google";
  }
  if (provider === "github") {
    return "OAuth GitHub";
  }
  return "Password Authentication";
}

export default function Profile() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getAuthProfile();
        if (!cancelled) {
          setProfile(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load profile."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const provider = profile?.provider ?? "password";
  const createdAt = useMemo(() => fmtMaybeDate(profile?.created_at), [profile?.created_at]);

  async function handleChangePassword() {
    const currentPassword = window.prompt("Current password");
    if (!currentPassword) return;
    const newPassword = window.prompt("New password (min 8 characters)");
    if (!newPassword) return;

    setUpdatingPassword(true);
    setError(null);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      alert("Password updated successfully.");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update password."
      );
    } finally {
      setUpdatingPassword(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      <SectionTitle title="Profile" subtitle="Account settings" />

      {error && <ErrorAlert message={error} />}

      <Card>
        <div className="space-y-6">
          {loading ? (
            <p style={{ color: "var(--color-text-secondary)" }}>Loading profile...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <p
                className="text-xs uppercase tracking-wide"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Username
              </p>
              <p
                className="font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                {profile?.username ? `@${profile.username}` : "Not set"}
              </p>
            </div>
            <div className="space-y-1">
              <p
                className="text-xs uppercase tracking-wide"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Email
              </p>
              <p
                className="font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                {user?.email ?? "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p
                className="text-xs uppercase tracking-wide"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Auth Provider
              </p>
              <p
                className="font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                {providerLabel(provider)}
              </p>
            </div>
            {createdAt && (
              <div className="space-y-1">
                <p
                  className="text-xs uppercase tracking-wide"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Account Created
                </p>
                <p
                  className="font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {createdAt}
                </p>
              </div>
            )}
          </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <UsernameManager
              initialUsername={profile?.username ?? ""}
              title="Public Username"
              description="Edit the username used on your public profile and ranking attribution."
              onSaved={(username) =>
                setProfile((current) =>
                  current ? { ...current, username } : current
                )
              }
            />
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            {provider === "password" && (
              <Button
                variant="PRIMARY"
                size="md"
                loading={updatingPassword}
                loadingText="Updating..."
                onClick={handleChangePassword}
              >
                Change Password
              </Button>
            )}
            <Button variant="DELETE" size="md" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
