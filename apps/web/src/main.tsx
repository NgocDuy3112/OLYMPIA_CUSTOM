import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { migrateVdStorage } from "./utils/vdStorage";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthProvider.tsx";

migrateVdStorage();

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </AuthProvider>
  
);
