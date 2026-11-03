// The console's NAVIGATION flags — where the operator is standing, in one place.
//
// Three booleans decide whether the deck draws a round or the waiting room:
//  · `entered`  — the operator NAVIGATED into the round (the lobby's round
//    buttons). A waiting stage (a saved ENDED state re-opened for review) must
//    still show the deck. Automatic ends (Về sảnh) clear it.
//  · `atWaiting` — Về sảnh ALWAYS returns this console to the waiting room,
//    whatever the round's own end plan does (a giải mã plan only closes its hint
//    window, a race only ends the round, an unknown round plans nothing). The
//    flag overrides the stage so the deck cannot keep drawing a live round.
//  · `roundsView` — the round badge opened the rounds navigator.
//
// Players never set any of these: they follow the pushed view.
import { useState } from "react"

export interface ConsoleNav {
    roundsView: boolean
    entered: boolean
    atWaiting: boolean
    /** the round badge → the rounds navigator */
    openRounds: () => void
    /** a round was started from the navigator: leave the waiting room, show the deck */
    enterRound: () => void
    /** Về sảnh: land on the waiting room, and stop drawing the round */
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
            setAtWaiting(false) // leaving the waiting room for the round's deck
            setEntered(true)    // navigating IN — waiting stages (saved ended) still show the deck
        },
        backToWaiting: () => {
            setAtWaiting(true)
            setEntered(false)
        },
    }
}
