import { useCallback, useEffect, useRef, useState } from "react";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type CameraMessage = {
  type?: string;
  user_code?: string | number;
  target_user_code?: string | number;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

export function useWebRTCCameraPublisher(userCode: string) {
  const { isConnected, lastMessage, sendMessage } = useGameWebSocket();
  const peer = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then(async (media) => {
        if (cancelled)
          return media.getTracks().forEach((track) => track.stop());
        streamRef.current = media;
        setStream(media);
        await sendMessage({ type: "camera_ready", user_code: userCode });
      })
      .catch(() => setStream(null));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      peer.current?.close();
    };
  }, [isConnected, sendMessage, userCode]);

  useEffect(() => {
    const msg = (lastMessage?.message ?? lastMessage) as CameraMessage | null;
    if (
      !msg ||
      msg.type !== "camera_offer" ||
      String(msg.target_user_code) !== String(userCode) ||
      !msg.sdp ||
      !streamRef.current
    )
      return;
    const connection = new RTCPeerConnection(ICE_SERVERS);
    peer.current?.close();
    peer.current = connection;
    streamRef.current
      .getTracks()
      .forEach((track) => connection.addTrack(track, streamRef.current!));
    connection.onicecandidate = (event) => {
      if (event.candidate)
        void sendMessage({
          type: "camera_ice_candidate",
          user_code: userCode,
          target_user_code: msg.user_code,
          candidate: event.candidate.toJSON(),
        });
    };
    void connection.setRemoteDescription(msg.sdp).then(async () => {
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await sendMessage({
        type: "camera_answer",
        user_code: userCode,
        target_user_code: msg.user_code,
        sdp: answer,
      });
    });
  }, [lastMessage, sendMessage, userCode]);

  return { stream, cameraEnabled: !!stream };
}

export function useWebRTCVoicePublisher(userCode: string) {
  const { isConnected, lastMessage, sendMessage } = useGameWebSocket();
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      .then(async (stream) => {
        if (cancelled)
          return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        await sendMessage({ type: "voice_ready", user_code: userCode });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [isConnected, sendMessage, userCode]);
  useEffect(() => {
    const msg = (lastMessage?.message ?? lastMessage) as CameraMessage | null;
    if (
      !msg ||
      msg.type !== "voice_offer" ||
      String(msg.target_user_code) !== String(userCode) ||
      !msg.sdp ||
      !streamRef.current
    )
      return;
    const connection = new RTCPeerConnection(ICE_SERVERS);
    streamRef.current
      .getTracks()
      .forEach((track) => connection.addTrack(track, streamRef.current!));
    connection.onicecandidate = (event) => {
      if (event.candidate)
        void sendMessage({
          type: "voice_ice_candidate",
          user_code: userCode,
          target_user_code: msg.user_code,
          candidate: event.candidate.toJSON(),
        });
    };
    void connection.setRemoteDescription(msg.sdp).then(async () => {
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await sendMessage({
        type: "voice_answer",
        user_code: userCode,
        target_user_code: msg.user_code,
        sdp: answer,
      });
    });
    return () => connection.close();
  }, [lastMessage, sendMessage, userCode]);
}

export function useWebRTCVoiceViewer(publisherCode: string) {
  const { isConnected, lastMessage, sendMessage } = useGameWebSocket();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    if (!isConnected) return;
    const connection = new RTCPeerConnection(ICE_SERVERS);
    peer.current = connection;
    connection.ontrack = (event) => {
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.autoplay = true;
      audio.srcObject = event.streams[0] ?? null;
      audio.muted = muted;
      void audio.play().catch(() => undefined);
    };
    connection.onicecandidate = (event) => {
      if (event.candidate)
        void sendMessage({
          type: "voice_ice_candidate",
          target_user_code: publisherCode,
          candidate: event.candidate.toJSON(),
        });
    };
    void sendMessage({
      type: "voice_request",
      target_user_code: publisherCode,
    });
    return () => connection.close();
  }, [isConnected, publisherCode, sendMessage]);
  useEffect(() => {
    const msg = (lastMessage?.message ?? lastMessage) as CameraMessage | null;
    if (!msg || msg.user_code !== publisherCode || !peer.current) return;
    if (msg.type === "voice_answer" && msg.sdp)
      void peer.current.setRemoteDescription(msg.sdp);
    if (msg.type === "voice_ice_candidate" && msg.candidate)
      void peer.current.addIceCandidate(msg.candidate);
  }, [lastMessage, publisherCode]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);
  return { muted, setMuted };
}

export function useWebRTCCameraViewer(playerCode: string) {
  const { isConnected, lastMessage, sendMessage } = useGameWebSocket();
  const peer = useRef<RTCPeerConnection | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const request = useCallback(() => {
    if (isConnected)
      void sendMessage({
        type: "camera_request",
        target_user_code: playerCode,
      });
  }, [isConnected, playerCode, sendMessage]);
  useEffect(() => {
    request();
    return () => peer.current?.close();
  }, [request]);
  useEffect(() => {
    const msg = (lastMessage?.message ?? lastMessage) as CameraMessage | null;
    if (!msg || msg.user_code !== playerCode) return;
    if (msg.type === "camera_ready") {
      request();
      return;
    }
    if (msg.type === "camera_answer" && msg.sdp && peer.current)
      void peer.current.setRemoteDescription(msg.sdp);
    if (msg.type === "camera_ice_candidate" && msg.candidate && peer.current)
      void peer.current.addIceCandidate(msg.candidate);
    if (msg.type !== "camera_ready") return;
  }, [lastMessage, playerCode, request]);
  useEffect(() => {
    if (!isConnected) return;
    const connection = new RTCPeerConnection(ICE_SERVERS);
    peer.current = connection;
    connection.ontrack = (event) => setStream(event.streams[0] ?? null);
    connection.onicecandidate = (event) => {
      if (event.candidate)
        void sendMessage({
          type: "camera_ice_candidate",
          target_user_code: playerCode,
          candidate: event.candidate.toJSON(),
        });
    };
    void connection.createOffer().then(async (offer) => {
      await connection.setLocalDescription(offer);
      await sendMessage({
        type: "camera_offer",
        target_user_code: playerCode,
        sdp: offer,
      });
    });
    return () => connection.close();
  }, [isConnected, playerCode, sendMessage]);
  return { stream };
}
