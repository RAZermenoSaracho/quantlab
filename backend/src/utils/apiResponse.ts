export function success(data: any) {
  return {
    success: true,
    data,
  };
}

export function failure(message: string, details?: any) {
  return {
    success: false,
    error: {
      message,
      details: details || null,
    },
  };
}
