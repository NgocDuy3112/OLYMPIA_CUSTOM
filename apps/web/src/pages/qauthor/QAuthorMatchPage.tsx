import { MatchTab } from "@/components/qauthor/MatchTab";

/** Trang gán câu vào trận theo slot (tách khỏi hub ngân hàng). */
const QAuthorMatchPage = () => {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-white">Câu hỏi trận</h1>
      <MatchTab />
    </div>
  );
};

export default QAuthorMatchPage;
