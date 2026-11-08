import type { ReactNode } from "react";
import { FontContext } from "./font-state.ts";

export function FontProvider({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <FontContext.Provider value={ok}>{children}</FontContext.Provider>;
}
