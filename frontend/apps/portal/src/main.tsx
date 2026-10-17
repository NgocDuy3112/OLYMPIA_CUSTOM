import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { createQueryClient } from "@shared/lib/query"
import { ME_QUERY_KEY } from "@/lib/session"
import "./index.css"
import App from "./App"

const queryClient = createQueryClient({ sessionQueryKey: ME_QUERY_KEY })

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)