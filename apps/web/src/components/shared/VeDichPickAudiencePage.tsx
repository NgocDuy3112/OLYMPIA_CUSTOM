import type { AudienceLayoutProps } from "@/types/audience";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useAudiencePlayers } from "@/hooks/useAudiencePlayers";
import { VeDichRound, getVeDichRoundLabel } from "@/types/veDich";

const CATEGORIES = [
  "TOÁN - TIN - THỐNG KÊ",
  "TỰ NHIÊN - SỰ SỐNG",
  "KINH TẾ - XÃ HỘI",
  "VĂN HỌC - NGHỆ THUẬT",
  "VĂN HÓA - THỂ THAO",
  "KIẾN THỨC TỔNG HỢP",
];

interface VeDichPickAudiencePageProps {
  round: VeDichRound;
  matchCode?: string;
  Layout: ComponentType<AudienceLayoutProps>;
}

export function VeDichPickAudiencePage({
  round,
  matchCode = "",
  Layout,
}: VeDichPickAudiencePageProps) {
  const { lastMessage } = useGameWebSocket();
  const { players, applyPlayersInfo } = useAudiencePlayers();

  const [allQuestionCodes, setAllQuestionCodes] = useState<string[]>(() => {
    if (!matchCode) return [];
    try {
      const stored = localStorage.getItem(`vd_pick_all_codes_${matchCode}`);
      const codes = stored ? (JSON.parse(stored) as string[]) : [];
      return codes.length > 0 ? codes : [];
    } catch {
      return [];
    }
  });

  const [liveSelectedCodes, setLiveSelectedCodes] = useState<string[]>(() => {
    if (!matchCode) return [];
    try {
      const stored = localStorage.getItem(`vd_pick_selected_${matchCode}`);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [confirmedCodes, setConfirmedCodes] = useState<string[]>([]);

  const [usedQuestionCodes, setUsedQuestionCodes] = useState<string[]>(() => {
    if (!matchCode) return [];
    try {
      const stored = localStorage.getItem(`vd_used_codes_${matchCode}`);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage.message ?? lastMessage;

    queueMicrotask(() => {
      switch (msg.type) {
        case "send_players_info": {
          applyPlayersInfo(msg);
          break;
        }
        case "vd_selection_update": {
          const codes = msg.selected_question_codes ?? [];
          setLiveSelectedCodes(Array.isArray(codes) ? codes : []);
          const allCodes = msg.all_question_codes;
          if (Array.isArray(allCodes) && allCodes.length > 0) {
            setAllQuestionCodes(allCodes as string[]);
          }
          const usedCodes = msg.used_question_codes;
          if (Array.isArray(usedCodes)) {
            setUsedQuestionCodes(usedCodes as string[]);
          }
          break;
        }
        case "vd_questions_selected":
        case "vdc_questions_meta": {
          const codes = msg.selected_question_codes ?? [];
          const finalCodes = Array.isArray(codes) ? codes : [];
          setConfirmedCodes(finalCodes);
          setLiveSelectedCodes(finalCodes);
          const allCodes2 = msg.all_question_codes;
          if (Array.isArray(allCodes2) && allCodes2.length > 0) {
            setAllQuestionCodes(allCodes2 as string[]);
          }
          break;
        }
        default:
          break;
      }
    });
  }, [lastMessage, applyPlayersInfo]);

  const maxQuestions =
    round === VeDichRound.CHUNG ? Math.max(players.length, 1) : round;
  const title = getVeDichRoundLabel(round);

  const displayCodes =
    confirmedCodes.length > 0 ? confirmedCodes : liveSelectedCodes;

  return (
    <Layout players={players} currentPlayerCode="">
      <div className="p-5 rounded-xl flex flex-col bg-blue-900 border-2 border-blue-600 shadow-xl gap-4 w-full">
        <div className="flex items-center gap-4 pb-1">
          <p className="text-4xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase shrink-0">
            {title}
          </p>
          <div className="flex-1" />
          <div className="flex gap-1">
            {Array.from({ length: maxQuestions }).map((_, i) => {
              const code = displayCodes[i];
              if (!code) {
                return (
                  <div key={`slot-empty-${i}`} className="w-55 shrink-0 h-24">
                    <VeDichQuestionCard
                      placeholder
                      category=""
                      points={undefined}
                      disabled
                    />
                  </div>
                );
              }

              const qIndex = allQuestionCodes.indexOf(code);
              const rawCategory = CATEGORIES[Math.floor(qIndex / 4)] || "";
              const point = [20, 30, 40, 50][qIndex % 4] || 0;
              const [catPrimary, catSecondary] = rawCategory
                .split("|")
                .map((s: string) => s?.trim());

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

        <div className="border-t border-blue-700" />

        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: "repeat(4, 1fr)",
            gridAutoRows: "minmax(76px, 76px)",
          }}
        >
          {Array.from({ length: 6 * 4 }).map((_, idx) => {
            const questionCode = allQuestionCodes[idx];
            const fallbackCode = `OC3_Q_VD_${Math.floor(idx / 4) + 1}_${(idx % 4) + 1}`;
            const displayCode = questionCode || fallbackCode;
            const rawCategory = CATEGORIES[Math.floor(idx / 4)] || "";
            const point = [20, 30, 40, 50][idx % 4] || 0;
            const [catPrimary, catSecondary] = rawCategory
              .split("|")
              .map((s: string) => s?.trim());
            const isSelected = displayCodes.includes(displayCode);
            const isUsed = usedQuestionCodes.includes(displayCode);

            return (
              <VeDichQuestionCard
                key={displayCode}
                category={catPrimary || rawCategory}
                subcategory={catSecondary}
                points={point}
                isSelected={isSelected}
                disabled={isUsed || !questionCode}
              />
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
