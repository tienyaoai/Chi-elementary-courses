import { useCallback, useEffect, useRef } from "react";

export function useLater(): (task: () => void, delay: number) => void {
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const bucket = timers.current;
    return () => {
      bucket.forEach((id) => window.clearTimeout(id));
      bucket.length = 0;
    };
  }, []);
  return useCallback((task: () => void, delay: number) => {
    const id = window.setTimeout(task, delay);
    timers.current.push(id);
  }, []);
}
