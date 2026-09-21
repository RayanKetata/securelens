import { createContext, useContext } from "react";

export const SystemsContext = createContext();

export function useSystems() {
  return useContext(SystemsContext);
}
