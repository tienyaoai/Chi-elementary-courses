export type Mode = "quiz" | "order" | "memory" | "story";

export const modes = ["quiz", "order", "memory", "story"] as const satisfies readonly Mode[];

export type Screen =
  | { kind: "home" }
  | { kind: "cards" }
  | { kind: "play"; mode: Mode; nonce: number }
  | { kind: "result"; mode: Mode; stars: number; detail: string; nonce: number };
