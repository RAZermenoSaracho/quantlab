const API = "http://localhost:5000/api";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function getAlgorithms() {
  const res = await fetch(`${API}/algorithms`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) throw new Error("Failed to fetch algorithms");

  return res.json();
}

export async function getAlgorithmById(id: string) {
  const res = await fetch(`${API}/algorithms/${id}`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) throw new Error("Algorithm not found");

  return res.json();
}

export async function createAlgorithm(payload: {
  name: string;
  description?: string;
  code?: string;
  githubUrl?: string;
}) {
  const res = await fetch(`${API}/algorithms`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Failed to create algorithm");
  }

  return data;
}

export async function deleteAlgorithm(id: string) {
  const res = await fetch(`${API}/algorithms/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  if (!res.ok) throw new Error("Failed to delete algorithm");

  return res.json();
}
