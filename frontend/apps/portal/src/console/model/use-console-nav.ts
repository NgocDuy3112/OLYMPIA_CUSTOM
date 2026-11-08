import { useState } from "react"

export interface ConsoleNav {
    roundsView: boolean
    entered: boolean
    atWaiting: boolean
    openRounds: () => void
    enterRound: () => void
    backToWaiting: () => void
}

export function useConsoleNav(): ConsoleNav {
    const [roundsView, setRoundsView] = useState(false)
    const [entered, setEntered] = useState(false)
    const [atWaiting, setAtWaiting] = useState(false)

    return {
        roundsView,
        entered,
        atWaiting,
        openRounds: () => setRoundsView(true),
        enterRound: () => {
            setRoundsView(false)
            setAtWaiting(false) 
            setEntered(true)    
        },
        backToWaiting: () => {
            setAtWaiting(true)
            setEntered(false)
        },
    }
}
