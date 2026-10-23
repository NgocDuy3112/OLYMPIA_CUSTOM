import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { createQueryClient } from "@shared/lib/query"
import "./index.css"
import App from "./App"

// The gameplay app is a public surface: no session query to watch, so the
// client is the shared defaults only (retry on 5xx, 30s stale).
const queryClient = createQueryClient()

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
    </StrictMode>,
)
