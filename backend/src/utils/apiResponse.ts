export function success<T>(data: T) {
  return { success: true, data };
}

export function failure(message: string, details?: any) {
  return {
    success: false,
    error: {
      message,
      details: details ?? null,
    },
  };
}