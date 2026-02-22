import api from "./api";

/* ==============================
   GET ALL
============================== */
export function getAlgorithms() {
  return api.get("/algorithms");
}

/* ==============================
   GET ONE
============================== */
export function getAlgorithmById(id: string) {
  return api.get(`/algorithms/${id}`);
}

/* ==============================
   CREATE
============================== */
export function createAlgorithm(payload: {
  name: string;
  description?: string;
  code?: string;
  githubUrl?: string;
}) {
  return api.post("/algorithms", payload);
}

/* ==============================
   UPDATE
============================== */
export function updateAlgorithm(
  id: string,
  payload: { name: string; description?: string; code: string }
) {
  return api.post(`/algorithms/${id}`, payload);
}

/* ==============================
   REFRESH FROM GITHUB
============================== */
export function refreshAlgorithmFromGithub(id: string) {
  return api.post(`/algorithms/${id}/refresh`, {});
}

/* ==============================
   DELETE
============================== */
export function deleteAlgorithm(id: string) {
  return api.del(`/algorithms/${id}`);
}
