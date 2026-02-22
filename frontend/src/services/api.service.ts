const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

type QueryParams = Record<string, string | number | undefined>;

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

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data?.error?.message ||
      data?.detail ||
      "Request failed"
    );
  }

  return data;
}

export default {
  get: <T>(endpoint: string, params?: QueryParams) =>
    request<T>(endpoint, {}, params),

  post: <T>(endpoint: string, body: any) =>
    request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  put: <T>(endpoint: string, body: any) =>
    request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  del: <T>(endpoint: string) =>
    request<T>(endpoint, { method: "DELETE" }),
};
