import { useState } from "react"

export interface ConsoleNav {
    entered: boolean
    atWaiting: boolean
    enterRound: () => void
    backToWaiting: () => void
}

export function useConsoleNav(): ConsoleNav {
    const [entered, setEntered] = useState(false)
    const [atWaiting, setAtWaiting] = useState(false)

    return {
        entered,
        atWaiting,
        enterRound: () => {
            setAtWaiting(false)
            setEntered(true)
        },
        backToWaiting: () => {
            setAtWaiting(true)
            setEntered(false)
        },
    }
}
