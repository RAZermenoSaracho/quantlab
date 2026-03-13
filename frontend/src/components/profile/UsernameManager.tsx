import { useEffect, useMemo, useState } from "react";
import Button from "../ui/Button";
import { useAuth } from "../../context/AuthProvider";
import {
  checkUsernameAvailability,
  updateAuthProfile,
} from "../../services/auth.service";

type Props = {
  initialUsername?: string | null;
  mode?: "inline" | "modal";
  title?: string;
  description?: string;
  onSaved?: (username: string) => void;
};

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

export default function UsernameManager({
  initialUsername,
  mode = "inline",
  title = "Username",
  description = "Choose a public username for your profile and algorithms.",
  onSaved,
}: Props) {
  const { user, updateUser } = useAuth();
  const [username, setUsername] = useState(initialUsername ?? "");
  const [status, setStatus] = useState<{
    checking: boolean;
    valid: boolean;
    available: boolean;
    normalized: string;
  }>({
    checking: false,
    valid: Boolean(initialUsername),
    available: Boolean(initialUsername),
    normalized: initialUsername ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUsername(initialUsername ?? "");
  }, [initialUsername]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      const normalized = normalizeUsername(username);

      if (!normalized) {
        setStatus({
          checking: false,
          valid: false,
          available: false,
          normalized,
        });
        return;
      }

      setStatus((current) => ({ ...current, checking: true, normalized }));
      try {
        const result = await checkUsernameAvailability(username);
        setStatus({
          checking: false,
          valid: result.valid,
          available: result.available,
          normalized: result.username,
        });
      } catch (availabilityError: unknown) {
        setStatus({
          checking: false,
          valid: false,
          available: false,
          normalized,
        });
        setError(
          availabilityError instanceof Error
            ? availabilityError.message
            : "Failed to validate username."
        );
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [username]);

  const helperText = useMemo(() => {
    if (!username.trim()) {
      return "3-20 characters, lowercase letters, numbers, and underscores.";
    }
    if (status.checking) {
      return "Checking availability...";
    }
    if (!status.valid) {
      return "Username must be 3-20 characters and use only letters, numbers, or underscores.";
    }
    if (!status.available) {
      return "That username is already taken.";
    }
    return `Available as @${status.normalized}`;
  }, [status, username]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!status.valid || !status.available) {
      setError("Choose a valid available username.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateAuthProfile({ username });
      if (user) {
        updateUser({ ...user, username: updated.username });
      }
      onSaved?.(updated.username);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save username."
      );
    } finally {
      setSaving(false);
    }
  }

  const containerClass =
    mode === "modal"
      ? "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      : "";

  const cardClass =
    mode === "modal"
      ? "w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
      : "space-y-4";

  return (
    <div className={containerClass}>
      <form className={cardClass} onSubmit={handleSubmit}>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="text-sm text-slate-400">{description}</p>
        </div>

        <div className="mt-4 space-y-2">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="your_username"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-500"
          />
          <p
            className={`text-xs ${
              status.valid && status.available ? "text-emerald-400" : "text-slate-400"
            }`}
          >
            {helperText}
          </p>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="mt-4 flex justify-end gap-3">
          <Button
            type="submit"
            variant="PRIMARY"
            loading={saving}
            disabled={!status.valid || !status.available || status.checking}
          >
            Save Username
          </Button>
        </div>
      </form>
    </div>
  );
}
