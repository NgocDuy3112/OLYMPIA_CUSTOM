import React from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Zap,
  Brain,
  Rocket,
  Target,
  Lock,
  Timer,
  Star,
} from "lucide-react";

const SECTIONS = [
  {
    id: "tong-quan",
    title: "Tổng Quan",
    icon: Star,
    content: (
      <>
        <p>
          <strong>Olympia Custom</strong> là nền tảng thi đấu trực tuyến dựa trên
          format Olympia, nơi các thí sinh tham gia tranh tài qua các vòng thi
          với luật chơi gần gũi nhưng được hiện đại hoá.
        </p>
        <p>
          Mỗi trận đấu gồm <strong>4 thí sinh</strong>, thi đấu qua 5 vòng
          theo thứ tự: Khởi Động → Giải Mã → Bứt Phá → Về Đích.
        </p>
      </>
    ),
  },
  {
    id: "khoi-dong",
    title: "Khởi Động",
    icon: Zap,
    content: (
      <>
        <p>
          Vòng thi mở màn, kiểm tra kiến thức nhanh. Gồm hai phần:
        </p>

        <h4 className="text-blue-300 mt-4 mb-2">
          1. Khởi Động Chung (KĐC)
        </h4>
        <ul>
          <li>
            Tất cả thí sinh cùng trả lời <strong>1 câu hỏi</strong>.
          </li>
          <li>Thời gian: <strong>60 giây</strong>.</li>
          <li>
            Trả lời đúng: <strong>+10 điểm</strong>. Sai: 0 điểm.
          </li>
          <li>Mọi thí sinh đều độc lập trả lời.</li>
        </ul>

        <h4 className="text-blue-300 mt-4 mb-2">
          2. Khởi Động Cá Nhân (KĐC riêng)
        </h4>
        <ul>
          <li>
            Mỗi thí sinh trả lời <strong>1 câu hỏi riêng</strong>.
          </li>
          <li>Thời gian: <strong>30 giây</strong>.</li>
          <li>
            Lần 1 đúng: <strong>+10 điểm</strong>.
          </li>
          <li>
            Lần 2 đúng: <strong>+5 điểm</strong>.
          </li>
          <li>Lần 3 trở đi: 0 điểm.</li>
        </ul>
      </>
    ),
  },
  {
    id: "giai-ma",
    title: "Giải Mã",
    icon: Brain,
    content: (
      <>
        <p>
          Thử thách tư duy logic. MC hiển thị <strong>8 gợi ý</strong> liên
          tiếp, thí sinh phải tìm ra <strong>từ khoá</strong> bí mật.
        </p>
        <ul>
          <li>
            Mỗi gợi ý đúng: <strong>+10 điểm</strong>.
          </li>
          <li>
            Tìm được từ khoá: <strong>+100 điểm</strong>, trừ đi{" "}
            <strong>10 điểm</strong> cho mỗi gợi ý đã mở.
          </li>
          <li>Ví dụ: mở 3 gợi ý rồi tìm đúng → 100 - 30 = 70 điểm.</li>
          <li>Thời gian mỗi gợi ý: <strong>15 giây</strong>.</li>
          <li>Tất cả thí sinh cùng chơi, ai nhanh hơn được nhiều hơn.</li>
        </ul>
      </>
    ),
  },
  {
    id: "but-pha",
    title: "Bứt Phá",
    icon: Rocket,
    content: (
      <>
        <p>
          Vòng thi <strong>đua tốc</strong>. MC đặt câu hỏi, thí sinh bấm
          chuông trả lời.
        </p>
        <ul>
          <li>Thời gian: <strong>30 giây</strong> mỗi câu.</li>
          <li>
            Điểm dựa vào <strong>thứ tự bấm chuông</strong> và{" "}
            <strong>thời gian trả lời</strong>:
          </li>
        </ul>

        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left py-2 px-3 text-blue-300">
                  Thứ tự bấm
                </th>
                <th className="text-left py-2 px-3 text-blue-300">
                  ≤ 10 giây
                </th>
                <th className="text-left py-2 px-3 text-blue-300">
                  ≤ 20 giây
                </th>
                <th className="text-left py-2 px-3 text-blue-300">
                  &gt; 20 giây
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/10">
                <td className="py-2 px-3">🥇 Thứ 1</td>
                <td className="py-2 px-3 font-bold text-green-400">
                  30 × 2 = 60
                </td>
                <td className="py-2 px-3 font-bold text-green-400">
                  20 × 2 = 40
                </td>
                <td className="py-2 px-3 font-bold text-green-400">
                  10 × 2 = 20
                </td>
              </tr>
              <tr className="border-b border-white/10">
                <td className="py-2 px-3">🥈 Thứ 2</td>
                <td className="py-2 px-3 font-bold text-yellow-400">
                  30 × 1.5 = 45
                </td>
                <td className="py-2 px-3 font-bold text-yellow-400">
                  20 × 1.5 = 30
                </td>
                <td className="py-2 px-3 font-bold text-yellow-400">
                  10 × 1.5 = 15
                </td>
              </tr>
              <tr className="border-b border-white/10">
                <td className="py-2 px-3">🥉 Thứ 3</td>
                <td className="py-2 px-3 font-bold text-orange-400">
                  30 × 1 = 30
                </td>
                <td className="py-2 px-3 font-bold text-orange-400">
                  20 × 1 = 20
                </td>
                <td className="py-2 px-3 font-bold text-orange-400">
                  10 × 1 = 10
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3">4️⃣ Thứ 4</td>
                <td className="py-2 px-3 font-bold text-gray-400">
                  30 × 0.5 = 15
                </td>
                <td className="py-2 px-3 font-bold text-gray-400">
                  20 × 0.5 = 10
                </td>
                <td className="py-2 px-3 font-bold text-gray-400">
                  10 × 0.5 = 5
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "ve-dich",
    title: "Về Đích",
    icon: Target,
    content: (
      <>
        <p>
          Vòng thi cuối cùng, quyết định thứ hạng. Gồm hai phần:
        </p>

        <h4 className="text-blue-300 mt-4 mb-2">1. Về Đích Chung (VĐC)</h4>
        <ul>
          <li>
            <strong>4 câu hỏi</strong>, tất cả thí sinh cùng trả lời.
          </li>
          <li>Thời gian: <strong>45 giây</strong> mỗi câu.</li>
          <li>
            Đúng: <strong>+10 điểm</strong>. Sai: <strong>-10 điểm</strong>.
          </li>
        </ul>

        <h4 className="text-blue-300 mt-4 mb-2">
          2. Về Đích Cá Nhân (VĐR)
        </h4>
        <ul>
          <li>
            Mỗi thí sinh <strong>chọn chủ đề</strong> và trả lời{" "}
            <strong>3 câu hỏi</strong>.
          </li>
          <li>Thời gian: <strong>45 giây</strong> mỗi câu.</li>
          <li>
            Điểm tuỳ chủ đề: <strong>20, 30, 40 hoặc 50 điểm</strong>.
          </li>
          <li>
            Đúng: cộng điểm. Sai: <strong>trừ điểm tương đương</strong>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "thoi-gian",
    title: "Thời Gian",
    icon: Timer,
    content: (
      <>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left py-2 px-3 text-blue-300">Vòng</th>
                <th className="text-left py-2 px-3 text-blue-300">Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Khởi Động Chung", "60 giây"],
                ["Khởi Động Cá Nhân", "30 giây"],
                ["Giải Mã", "15 giây / gợi ý"],
                ["Bứt Phá", "30 giây"],
                ["Về Đích Chung", "45 giây"],
                ["Về Đích Cá Nhân", "45 giây"],
              ].map(([phase, time]) => (
                <tr key={phase} className="border-b border-white/10">
                  <td className="py-2 px-3">{phase}</td>
                  <td className="py-2 px-3 font-mono text-blue-200">{time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "luat-choi",
    title: "Luật Chung",
    icon: Lock,
    content: (
      <>
        <ul>
          <li>
            Mỗi trận đấu có <strong>4 thí sinh</strong>.
          </li>
          <li>
            Thứ tự ngồi: được xác định trước khi trận đấu bắt đầu.
          </li>
          <li>
            Thí sinh không được phép sử dụng tài nguyên bên ngoài.
          </li>
          <li>
            Trong vòng Bứt Phá, nếu trả lời sai, câu hỏi được chuyển cho
            thí sinh tiếp theo (nếu còn thời gian).
          </li>
          <li>
            Điểm âm có thể xảy ra ở vòng Về Đích.
          </li>
          <li>
            Trong trường hợp bằng điểm, hệ thống sẽ so sánh thời gian phản
            hồi để xếp hạng.
          </li>
          <li>
            Quyết định của MC là quyết định cuối cùng.
          </li>
        </ul>
      </>
    ),
  },
];

const RulesPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors mb-4"
          >
            <ArrowLeft size={16} />
            <span>Quay lại</span>
          </button>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            Luật Chơi
          </h1>
          <p className="text-blue-300 text-sm sm:text-base">
            Olympia Custom — Format OC3
          </p>
        </div>

        {/* Table of contents */}
        <nav className="card !p-4 mb-6 sm:mb-8">
          <h2 className="text-sm font-semibold text-blue-300 uppercase tracking-wider mb-3">
            Mục lục
          </h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors py-1"
                >
                  <section.icon size={14} className="text-blue-400 shrink-0" />
                  <span>{section.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Sections */}
        <div className="space-y-6">
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="card !p-5 sm:!p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-600/20 rounded-lg">
                  <section.icon size={20} className="text-blue-400" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  {section.title}
                </h2>
              </div>
              <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed space-y-3 [&_strong]:text-white [&_h4]:mb-2 [&_ul]:space-y-1.5 [&_li]:ml-4">
                {section.content}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 mb-4">
          <p className="text-xs text-gray-500">
            Luật chơi có thể được cập nhật. Phiên bản hiện tại áp dụng cho
            giải đấu Olympia Custom.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RulesPage;
