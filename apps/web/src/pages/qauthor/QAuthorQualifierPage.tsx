import { QualifierTab } from "@/components/qauthor/QualifierTab";

/** Trang vòng loại (tách khỏi hub ngân hàng). */
const QAuthorQualifierPage = () => {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-white">Vòng loại</h1>
      <QualifierTab />
    </div>
  );
};

export default QAuthorQualifierPage;
