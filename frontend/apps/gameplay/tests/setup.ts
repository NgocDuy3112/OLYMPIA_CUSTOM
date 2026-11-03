// gameplay's test setup — the same contract as the portal's, so a jsdom test here
// needs no ceremony: jest-dom matchers (toBeDisabled, toHaveTextContent…) and a
// DOM cleaned between tests. Without this each file cleaned up after itself, and
// one that forgot left buttons from the previous test on the screen.
//
// This config runs PURE unit tests under `node` and jsdom tests per-file, so
// everything touching `document` is guarded: registering a cleanup that calls
// into a DOM that does not exist would fail the whole node suite at import time.
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

const hasDom = typeof document !== "undefined"

if (hasDom) {
    afterEach(cleanup)

    // input-otp (the PIN slot field) measures by hit-testing the document; jsdom
    // has no layout, so it must answer something. Same polyfill as the portal's.
    if (typeof document.elementFromPoint !== "function") {
        document.elementFromPoint = () => null
    }
}
