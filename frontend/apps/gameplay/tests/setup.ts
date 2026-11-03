// gameplay's test setup — the same contract as the portal's, so a jsdom test
// here needs no ceremony: jest-dom matchers (toBeDisabled, toHaveTextContent…)
// and a DOM cleaned between tests. Without this each file had to clean up after
// itself, and one that forgot left buttons from the previous test on the screen.
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(cleanup)
