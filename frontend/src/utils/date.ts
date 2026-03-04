export function formatDateTime(value: unknown): string {
  if (value == null) {
    return "-";
  }

  const date =
    value instanceof Date
      ? value
      : typeof value === "number" || typeof value === "string"
      ? new Date(value)
      : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "-";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
