import { useEffect } from "react";
import { API_BASE_URL } from "@/configs";

export function useBankEvents(onChange: () => void): void {
  useEffect(() => {
    const src = new EventSource(`${API_BASE_URL}/bank/events`, {
      withCredentials: true,
    });
    src.onmessage = () => onChange();
    src.onerror = () => {
      if (src.readyState === EventSource.CLOSED) src.close();
    };
    return () => src.close();
  }, [onChange]);
}

export default useBankEvents;
