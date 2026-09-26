import { useState } from "react";
import { Database, Layers, Lightbulb, Zap, Flag } from "lucide-react";
import { BankTab, type BankRoundGroup } from "@/components/qauthor/BankTab";
import QAuthorSetsPage from "@/pages/qauthor/QAuthorSetsPage";

type TabId = BankRoundGroup | "sets";

const TABS: { id: TabId; label: string; sub: string; icon: React.ReactNode }[] = [
  { id: "kd", label: "Khởi động", sub: "KĐ chung + riêng", icon: <Zap size={20} /> },
  { id: "gm", label: "Giải mã", sub: "Set KEY + 8 hint", icon: <Lightbulb size={20} /> },
  { id: "bp", label: "Bứt phá", sub: "4 câu/trận", icon: <Flag size={20} /> },
  { id: "vd", label: "Về đích", sub: "6 lĩnh vực × 4 mức", icon: <Database size={20} /> },
  { id: "sets", label: "Bộ đề", sub: "Preset theo trận", icon: <Layers size={20} /> },
];

const QAuthorBankHubPage = () => {
  const [tab, setTab] = useState<TabId>("kd");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-white">Ngân hàng câu hỏi</h1>
        <p className="text-xs text-gray-500">
          Soạn câu theo vòng thi
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-colors ${
              tab === t.id
                ? "bg-green-600/20 border-green-600/50 text-green-300"
                : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
            }`}
          >
            {t.icon}
            <span>
              <span className="block text-base font-semibold">{t.label}</span>
              <span className="block text-xs opacity-70">{t.sub}</span>
            </span>
          </button>
        ))}
      </div>

      {tab === "sets" ? (
        <QAuthorSetsPage />
      ) : (
        <BankTab key={tab} initialGroup={tab} />
      )}
    </div>
  );
};

export default QAuthorBankHubPage;
