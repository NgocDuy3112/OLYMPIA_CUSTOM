import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

const hasDom = typeof document !== "undefined"

if (hasDom) {
    afterEach(cleanup)

    if (typeof document.elementFromPoint !== "function") {
        document.elementFromPoint = () => null
    }
}
