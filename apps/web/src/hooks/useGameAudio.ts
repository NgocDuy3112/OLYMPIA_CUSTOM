import { useCallback, useEffect, useRef, useState } from "react";
import type { WebSocketMessage } from "@/types/websocket";
import { resolveS3Media } from "@/hooks/useS3Media";

type AudioMap = Record<string, string>;

const SFX: AudioMap = {
  buzzer_activated: "buzzer_activated.mp3",
  buzzer_winner: "buzzer_winner.mp3",
  player_answer: "player_answer.mp3",
  kdc_correct: "kdc_correct.mp3",
  round_end: "round_end.mp3",
  game_end: "game_end.mp3",
};

const BGM: AudioMap = {
  kdc: "kdc.mp3",
  kdr: "kdr.mp3",
  bp: "bp.mp3",
  vdc: "vdc.mp3",
  vdr: "vdr.mp3",
  gm: "gm.mp3",
};

export function useGameAudio(
  lastMessage: WebSocketMessage | null,
  matchCode: string,
) {
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  const unlock = useCallback(() => {
    setUnlocked(true);
    void bgmRef.current?.play().catch(() => undefined);
  }, []);

  const resolveAudio = useCallback(
    (path: string) => `${matchCode}/audios/${path}`,
    [matchCode],
  );
  const playSfx = useCallback(
    async (path: string) => {
      if (!unlocked) return;
      const src = await resolveS3Media(resolveAudio(path));
      if (!src) return;
      const audio = new Audio(src);
      audio.volume = 0.8;
      void audio.play().catch(() => undefined);
    },
    [resolveAudio, unlocked],
  );

  useEffect(() => {
    const handleMessage = async () => {
      const message = (lastMessage?.message ??
        lastMessage) as WebSocketMessage | null;
      if (!message?.type) return;

      const phase =
        typeof message.phase === "string" ? message.phase : undefined;
      if (message.type === "start_the_timer" && phase && BGM[phase]) {
        bgmRef.current?.pause();
        const src = await resolveS3Media(resolveAudio(`bgm/${BGM[phase]}`));
        if (!src) return;
        const audio = new Audio(src);
        audio.loop = true;
        audio.volume = 0.35;
        bgmRef.current = audio;
        if (unlocked) void audio.play().catch(() => undefined);
        return;
      }

      if (
        message.type === "round_end" ||
        message.type === "vdr_turn_end" ||
        message.type === "vdr_round_end"
      ) {
        bgmRef.current?.pause();
        bgmRef.current = null;
      }

      const sfx = SFX[message.type];
      if (sfx) void playSfx(`sfx/${sfx}`);
    };
    void handleMessage();
  }, [lastMessage, playSfx, resolveAudio, unlocked]);

  useEffect(() => () => bgmRef.current?.pause(), []);

  return { unlocked, unlock };
}
