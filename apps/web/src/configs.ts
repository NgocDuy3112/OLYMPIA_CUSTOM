export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
export const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL ??
  (() => {
    if (typeof window === "undefined") return "ws://localhost:8000";
    return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
  })();

// ── WebRTC ICE (STUN + optional TURN for cross-NAT) ──
function parseIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    {
      urls:
        import.meta.env.VITE_STUN_URL ?? "stun:stun.l.google.com:19302",
    },
  ];
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUser = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnPass = import.meta.env.VITE_TURN_PASSWORD as string | undefined;
  if (turnUrl && turnUser && turnPass) {
    servers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnPass,
    });
  }
  return servers;
}

export const ICE_SERVERS: RTCConfiguration = {
  iceServers: parseIceServers(),
};
