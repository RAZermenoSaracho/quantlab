const API = "http://localhost:5000/api";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Not authenticated");

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/* ==============================
   GET ONE
============================== */
export async function getBacktest(id: string) {
  const res = await fetch(`${API}/backtest/${id}`, {
    headers: getAuthHeaders(),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "Failed to fetch backtest");
  }

  return data;
}

/* ==============================
   GET ALL
============================== */
export async function getAllBacktests() {
  const res = await fetch(`${API}/backtest`, {
    headers: getAuthHeaders(),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "Failed to fetch backtests");
  }

  return data;
}

/* ==============================
   CREATE
============================== */
export async function createBacktest(payload: {
  algorithm_id: string;
  symbol: string;
  timeframe: string;
  initial_balance: number;
  start_date: string;
  end_date: string;
}) {
  const res = await fetch(`${API}/backtest`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "Failed to create backtest");
  }

  return data;
}

/* ==============================
   DELETE
============================== */
export async function deleteBacktest(id: string) {
  const res = await fetch(`${API}/backtest/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "Failed to delete backtest");
  }

  return data;
}
