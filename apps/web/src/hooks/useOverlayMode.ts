import { useEffect } from "react";

/**
 * Đưa trang overlay (OBS Browser Source) về nền trong suốt.
 * Tắt cả layer ảnh nền `body::before` — trước đây chỉ set `body background`
 * nên ảnh brand vẫn lòe ra sau overlay OBS.
 */
export function useOverlayMode(): void {
  useEffect(() => {
    document.body.classList.add("overlay-mode");
    return () => {
      document.body.classList.remove("overlay-mode");
    };
  }, []);
}
