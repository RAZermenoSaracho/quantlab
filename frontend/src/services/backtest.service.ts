import axios from "axios";

const API = "http://localhost:5000/api";

export async function getBacktest(id: string, token: string) {
    const res = await axios.get(`${API}/backtest/${id}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    return res.data;
}

export async function getAllBacktests() {
  const token = localStorage.getItem("token");

  const res = await fetch("http://localhost:5000/api/backtest", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch backtests");
  }

  return res.json();
}
