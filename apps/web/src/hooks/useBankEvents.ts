import { useEffect } from "react";
import { API_BASE_URL } from "@/configs";

/** Subscribe SSE bank events — bank đổi là gọi onChange ngay, khỏi poll. */
export function useBankEvents(onChange: () => void): void {
  useEffect(() => {
    const src = new EventSource(`${API_BASE_URL}/bank/events`, {
      withCredentials: true,
    });
    src.onmessage = () => onChange();
    src.onerror = () => {
      // EventSource tự reconnect — đóng khi lỗi kéo dài để khỏi spam.
      if (src.readyState === EventSource.CLOSED) src.close();
    };
    return () => src.close();
  }, [onChange]);
}

export default useBankEvents;
