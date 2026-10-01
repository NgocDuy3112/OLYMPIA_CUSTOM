import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { migrateVdStorage } from "./utils/vdStorage";
import { TooltipProvider } from "@/components/ui/tooltip";

migrateVdStorage();

createRoot(document.getElementById("root")!).render(
  <TooltipProvider>
    <App />
  </TooltipProvider>
);
