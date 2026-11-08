import { useCallback, useEffect, useState } from "react";
import type { Mode } from "./screen.ts";

const STORAGE_KEY = "zhuzhu-guoyu-island-v1";

export type Progress = {
  sound: boolean;
  introSeen: boolean;
  stamps: string[];
  best: Partial<Record<Mode, number>>;
};

const listeners = new Set<() => void>();

export function defaultProgress(): Progress {
  return { sound: true, introSeen: false, stamps: [], best: {} };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultProgress();
    const record = parsed as Partial<Progress>;
    return {
      sound: record.sound !== false,
      introSeen: record.introSeen === true,
      stamps: Array.isArray(record.stamps) ? record.stamps.filter((item) => typeof item === "string") : [],
      best: record.best && typeof record.best === "object" ? record.best : {},
    };
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(progress: Progress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  listeners.forEach((listener) => listener());
}

export function useProgress(): {
  progress: Progress;
  update: (patch: (current: Progress) => Progress) => void;
} {
  const [progress, setProgress] = useState(loadProgress);
  useEffect(() => {
    const refresh = () => setProgress(loadProgress());
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, []);
  const update = useCallback((patch: (current: Progress) => Progress) => {
    saveProgress(patch(loadProgress()));
  }, []);
  return { progress, update };
}
