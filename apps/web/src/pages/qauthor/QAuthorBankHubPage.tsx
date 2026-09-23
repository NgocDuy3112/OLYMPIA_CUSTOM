import { useState } from "react";
import { Database, ImagePlus, ListOrdered, Swords } from "lucide-react";
import { BankTab } from "@/components/qauthor/BankTab";
import { MediaTab } from "@/components/qauthor/MediaTab";
import { MatchTab } from "@/components/qauthor/MatchTab";
import { QualifierTab } from "@/components/qauthor/QualifierTab";
import { OverviewStats } from "@/components/qauthor/OverviewStats";

type TabId = "bank" | "media" | "match" | "qualifier";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "bank", label: "Bank QB_*", icon: <Database size={15} /> },
  { id: "media", label: "Media", icon: <ImagePlus size={15} /> },
  { id: "match", label: "Câu hỏi trận", icon: <Swords size={15} /> },
  { id: "qualifier", label: "Vòng loại", icon: <ListOrdered size={15} /> },
];

const QAuthorBankHubPage = () => {
  const [tab, setTab] = useState<TabId>("bank");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-white">Ngân hàng trận</h1>
        <p className="text-xs text-gray-500">
          Excel chỉ nhập text · media chèn sau ở tab Media
        </p>
      </div>

      <OverviewStats />

      <div className="flex gap-1.5 flex-wrap bg-white/5 border border-white/10 rounded-xl p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-green-600/20 text-green-300"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "bank" && <BankTab />}
      {tab === "media" && <MediaTab />}
      {tab === "match" && <MatchTab />}
      {tab === "qualifier" && <QualifierTab />}
    </div>
  );
};

export default QAuthorBankHubPage;
