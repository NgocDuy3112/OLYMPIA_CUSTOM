import { createContext, useContext } from "react"
import type { ConsoleControl } from "./use-console-model"

export const ConsoleControlContext = createContext<ConsoleControl | null>(null)

export function useConsoleControl(): ConsoleControl | null {
    return useContext(ConsoleControlContext)
}
