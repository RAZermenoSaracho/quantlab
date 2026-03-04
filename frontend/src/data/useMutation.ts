import { useCallback, useState } from "react";
import { invalidateQuery, type QueryKey } from "./queryClient";

type UseMutationOptions<TInput, TOutput> = {
  mutationFn: (input: TInput) => Promise<TOutput>;
  onSuccess?: (output: TOutput, input: TInput) => void | Promise<void>;
  invalidate?: QueryKey[] | ((output: TOutput, input: TInput) => QueryKey[]);
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

export function useMutation<TInput, TOutput>({
  mutationFn,
  onSuccess,
  invalidate,
}: UseMutationOptions<TInput, TOutput>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (input: TInput) => {
      setLoading(true);
      setError(null);

      try {
        const output = await mutationFn(input);
        await onSuccess?.(output, input);

        const keys =
          typeof invalidate === "function" ? invalidate(output, input) : invalidate;
        keys?.forEach((key) => invalidateQuery(key));

        return output;
      } catch (mutationError: unknown) {
        const message = getErrorMessage(mutationError);
        setError(message);
        throw new Error(message);
      } finally {
        setLoading(false);
      }
    },
    [invalidate, mutationFn, onSuccess]
  );

  return {
    mutate,
    loading,
    error,
  };
}
