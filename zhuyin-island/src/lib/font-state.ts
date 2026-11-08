import { createContext, useContext } from "react";

export const FontContext = createContext(false);

export function useFontOk(): boolean {
  return useContext(FontContext);
}
