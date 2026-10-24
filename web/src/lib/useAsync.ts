import { useCallback, useEffect, useState } from "react";

export type AsyncState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "failed" };

// Runs `load` on mount (and on retry). Errors are logged, never shown: callers render a fallback.
export function useAsync<T>(load: () => Promise<T>): AsyncState<T> & { retry: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    load().then(
      (data) => current && setState({ status: "ready", data }),
      (err) => {
        console.error(err);
        if (current) setState({ status: "failed" });
      },
    );
    return () => {
      current = false;
    };
    // `load` is expected to be a stable api call; re-run only on retry.
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
