import { useEffect } from "react";

export function useOverlayMode(): void {
  useEffect(() => {
    document.body.classList.add("overlay-mode");
    return () => {
      document.body.classList.remove("overlay-mode");
    };
  }, []);
}
