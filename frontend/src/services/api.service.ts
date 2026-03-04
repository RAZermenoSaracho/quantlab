// frontend/src/services/api.service.ts
import type { ApiResponse } from "@quantlab/contracts";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

type QueryParams = Record<string, string | number | undefined>;
type ErrorLike = {
  error?: {
    message?: string;
  };
  detail?: string;
};

function readErrorMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as ErrorLike;

  return candidate.error?.message || candidate.detail || null;
}

function buildQuery(params?: QueryParams) {
  if (!params) return "";

  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      query.append(key, String(value));
    }
  });

  return `?${query.toString()}`;
}

function isApiResponse<T>(x: unknown): x is ApiResponse<T> {
  return (
    typeof x === "object" &&
    x !== null &&
    "success" in x &&
    typeof (x as { success: unknown }).success === "boolean"
  );
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  params?: QueryParams
): Promise<T> {
  const token = localStorage.getItem("token");
  const url = `${API_BASE}${endpoint}${buildQuery(params)}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(options.headers || {}),
    },
  });

  const raw = await res.json().catch(() => null);

  /*
    Preferred contract: ApiResponse<T> = { success: true, data: T } | { success: false, error: ... }.
    Temporary compatibility: if backend still returns raw JSON (not wrapped), return it when res.ok.
  */
  if (!isApiResponse<T>(raw)) {
    if (!res.ok) {
      const msg = readErrorMessage(raw) || "Request failed";
      throw new Error(msg);
    }
    return raw as T;
  }

  const json = raw;

  if (!res.ok || !json.success) {
    const msg = readErrorMessage(json) || "Request failed";
    throw new Error(msg);
  }

  return json.data;
}

export default {
  get: <T>(endpoint: string, params?: QueryParams) =>
    request<T>(endpoint, {}, params),

  post: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  del: <T>(endpoint: string) =>
    request<T>(endpoint, { method: "DELETE" }),
};
