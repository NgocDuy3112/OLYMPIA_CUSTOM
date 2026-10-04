import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useRoleSession } from "@/hooks/useRoleSession";
import { useSpectator } from "@/hooks/useSpectator";
import {
  matchStoragePrefixes,
  readMatchJson,
  writeMatchJson,
} from "@/utils/storage";
import { VeDichRound, getVeDichRoundLabel } from "@/types/veDich";

import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";

const CATEGORIES = [
  "TOÁN - TIN - THỐNG KÊ",
  "TỰ NHIÊN - SỰ SỐNG",
  "KINH TẾ - XÃ HỘI",
  "VĂN HỌC - NGHỆ THUẬT",
  "VĂN HÓA - THỂ THAO",
  "KIẾN THỨC TỔNG HỢP",
];

export const PlayerVeDichPickView = ({ round }: { round: VeDichRound }) => {
  const { playerCode: paramPlayerCode, matchCode: paramMatchCode } = useParams<{
    matchCode: string;
    playerCode: string;
  }>();
  const { playerCode: sessionPlayerCode } = useRoleSession("player");
  const playerCode = paramPlayerCode || sessionPlayerCode;
  const { lastMessage } = useGameWebSocket();
  const { players, applyPlayersInfo } = useSpectator();

  const [allQuestionCodes, setAllQuestionCodes] = useState<string[]>(() => {
    if (!paramMatchCode) return [];
    const codes = readMatchJson<string[]>(
      matchStoragePrefixes.pickAllCodes,
      paramMatchCode,
      [],
    );
    return codes.length > 0 ? codes : [];
  });
  const [liveSelectedCodes, setLiveSelectedCodes] = useState<string[]>(() => {
    if (!paramMatchCode) return [];
    return readMatchJson<string[]>(
      matchStoragePrefixes.pickSelected,
      paramMatchCode,
      [],
    );
  });
  const [confirmedCodes, setConfirmedCodes] = useState<string[]>([]);
  const [usedQuestionCodes, setUsedQuestionCodes] = useState<string[]>(() => {
    if (!paramMatchCode) return [];
    return readMatchJson<string[]>(
      matchStoragePrefixes.usedCodes,
      paramMatchCode,
      [],
    );
  });

  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage.message ?? lastMessage;
    queueMicrotask(() => {
      switch (msg?.type) {
        case "send_players_info":
          applyPlayersInfo(msg);
          break;
        case "vd_selection_update": {
          const codes = msg.selected_question_codes ?? [];
          setLiveSelectedCodes(Array.isArray(codes) ? codes : []);
          const allCodes = msg.all_question_codes;
          if (Array.isArray(allCodes) && allCodes.length > 0)
            setAllQuestionCodes(allCodes);
          const usedCodes = msg.used_question_codes;
          if (Array.isArray(usedCodes)) setUsedQuestionCodes(usedCodes);
          break;
        }
        case "vd_questions_selected": {
          const codes = msg.selected_question_codes ?? [];
          const finalCodes = Array.isArray(codes) ? codes : [];
          setConfirmedCodes(finalCodes);
          setLiveSelectedCodes(finalCodes);
          const allCodes2 = msg.all_question_codes;
          if (Array.isArray(allCodes2) && allCodes2.length > 0)
            setAllQuestionCodes(allCodes2);
          setUsedQuestionCodes((prev) => {
            const updated = [...new Set([...prev, ...finalCodes])];
            writeMatchJson(
              matchStoragePrefixes.usedCodes,
              paramMatchCode,
              updated,
            );
            return updated;
          });
          break;
        }
      }
    });
  }, [applyPlayersInfo, lastMessage, paramMatchCode]);

  const activePlayers = players.filter((player) => !player.playerAfk);
  const maxQuestions =
    round === VeDichRound.CHUNG ? Math.max(activePlayers.length, 1) : round;
  const title = getVeDichRoundLabel(round);
  const displayCodes =
    confirmedCodes.length > 0 ? confirmedCodes : liveSelectedCodes;

  return (
    <PBasePageLayout players={players} currentPlayerCode={playerCode}>
      <div className="p-5 rounded-xl flex flex-col bg-primary/40 border-2 border-primary shadow-xl gap-4 w-full">
        <div className="flex items-center gap-4 pb-1">
          {(() => {
            const parts = title.split(" - ");
            if (parts.length >= 2)
              return (
                <div className="flex flex-col leading-tight shrink-0">
                  <span className="text-4xl font-display font-extrabold text-brand uppercase">
                    {parts[0]}
                  </span>
                  <span className="text-2xl font-display font-extrabold text-brand uppercase">
                    {parts.slice(1).join(" - ")}
                  </span>
                </div>
              );
            return (
              <span className="text-4xl font-display font-extrabold text-brand uppercase shrink-0">
                {title}
              </span>
            );
          })()}
          <div className="flex-1" />
          <div className="flex gap-1">
            {Array.from({ length: maxQuestions }).map((_, i) => {
              const code = displayCodes[i];
              if (!code)
                return (
                  <div key={`slot-empty-${i}`} className="w-55 shrink-0 h-20">
                    <VeDichQuestionCard
                      placeholder
                      category=""
                      points={undefined}
                      disabled
                    />
                  </div>
                );
              const qIndex = allQuestionCodes.indexOf(code);
              const rawCategory = CATEGORIES[Math.floor(qIndex / 4)] || "";
              const point = [20, 30, 40, 50][qIndex % 4] || 0;
              const [catPrimary, catSecondary] = rawCategory
                .split("|")
                .map((s) => s?.trim());
              return (
                <div key={`slot-${code}`} className="w-55 shrink-0 h-20">
                  <VeDichQuestionCard
                    category={catPrimary || rawCategory}
                    subcategory={catSecondary}
                    points={point}
                    isSelected
                    disabled={false}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="border-t border-primary/70" />
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(4, 1fr)",
            gridAutoRows: "minmax(76px, 76px)",
          }}
        >
          {Array.from({ length: 6 * 4 }).map((_, idx) => {
            const questionCode = allQuestionCodes[idx];
            const oc = (paramMatchCode || "").toUpperCase().match(/^OC(\d+)/)?.[0] ?? "OC3";
            const fallbackCode = `${oc}_Q_VD_${Math.floor(idx / 4) + 1}_${(idx % 4) + 1}`;
            const displayCode = questionCode || fallbackCode;
            const rawCategory = CATEGORIES[Math.floor(idx / 4)] || "";
            const point = [20, 30, 40, 50][idx % 4] || 0;
            const [catPrimary, catSecondary] = rawCategory
              .split("|")
              .map((s) => s?.trim());
            const isSelected = displayCodes.includes(displayCode);
            const isUsed = usedQuestionCodes.includes(displayCode);
            return (
              <VeDichQuestionCard
                key={displayCode}
                category={catPrimary || rawCategory}
                subcategory={catSecondary}
                points={point}
                isSelected={isSelected}
                disabled={isUsed}
              />
            );
          })}
        </div>
      </div>
    </PBasePageLayout>
  );
};
