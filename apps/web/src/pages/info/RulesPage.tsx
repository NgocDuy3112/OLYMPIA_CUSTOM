import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Zap,
  Brain,
  Rocket,
  Target,
  Lock,
  Timer,
  Star,
  ChevronRight,
} from "lucide-react";
import { PublicLayout } from "@/components/layout";

/* ───────────────── Score visuals (card điểm + timeline) ───────────────── */

type Tone = "great" | "good" | "mid" | "low" | "neutral";

interface ScoreCell {
  text: string;
  tone?: Tone;
}

interface ScoreRow {
  label: string;
  cells: ScoreCell[];
}

const TONE_TEXT: Record<Tone, string> = {
  great: "text-success",
  good: "text-warning",
  mid: "text-brand",
  low: "text-muted-foreground",
  neutral: "text-foreground",
};

const TONE_BG: Record<Tone, string> = {
  great: "bg-success/10 border-success/30",
  good: "bg-warning/10 border-warning/30",
  mid: "bg-brand/10 border-brand/30",
  low: "bg-accent border-border",
  neutral: "bg-accent border-border",
};

/** Ma trận điểm chuông: 1 card/ứng hạng, số điểm theo khung giờ. */
const PointMatrix: React.FC<{ headers: string[]; rows: ScoreRow[] }> = ({
  headers,
  rows,
}) => (
  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
    {rows.map((row) => {
      const tone = row.cells[0]?.tone ?? "neutral";
      return (
        <div key={row.label} className={`rounded-xl border p-4 ${TONE_BG[tone]}`}>
          <p className="font-display text-lg font-bold text-foreground">
            {row.label}
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {row.cells.map((cell, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-xs text-muted-foreground">
                  {headers[i + 1]}
                </span>
                <span
                  className={`font-mono font-bold ${TONE_TEXT[cell.tone ?? "neutral"]}`}
                >
                  {cell.text}
                  <span className="text-xs font-normal">đ</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    })}
  </div>
);

/** Thời gian vòng: timeline 1 dòng/vòng, thanh tỉ lệ so với 60s. */
const DurationList: React.FC<{ rows: ScoreRow[] }> = ({ rows }) => (
  <div className="mt-4 flex flex-col gap-2">
    {rows.map((row) => {
      const sec = parseInt(row.cells[0]?.text ?? "", 10) || 0;
      const pct = Math.min(100, Math.round((sec / 60) * 100));
      return (
        <div
          key={row.label}
          className="flex items-center gap-3 rounded-xl border border-border bg-[#171243]/60 px-4 py-2.5"
        >
          <span className="flex-1 text-sm font-medium text-foreground">
            {row.label}
          </span>
          <span className="hidden h-2 w-28 overflow-hidden rounded-full bg-accent sm:block">
            <span
              className="block h-full rounded-full bg-brand"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="min-w-28 text-right font-mono text-sm font-bold text-brand">
            {row.cells[0]?.text}
          </span>
        </div>
      );
    })}
  </div>
);

/* ────────────────────────────── Rule primitives ──────────────────────────── */

const Rule: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex gap-2.5">
    <ChevronRight size={14} className="mt-1 shrink-0 text-brand" aria-hidden />
    <span>{children}</span>
  </li>
);

const SubHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="mt-5 mb-2.5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand">
    <span className="h-px w-4 bg-brand/60" aria-hidden />
    {children}
  </h4>
);

/* ────────────────────────────────── Sections ─────────────────────────────── */

const SECTIONS = [
  {
    id: "tong-quan",
    title: "Tổng Quan",
    icon: Star,
    content: (
      <>
        <p>
          <strong>Olympia Custom</strong> là nền tảng thi đấu trực tuyến dựa
          trên format Olympia, nơi các thí sinh tham gia tranh tài qua các vòng
          thi với luật chơi gần gũi nhưng được hiện đại hoá.
        </p>
        <p>
          Mỗi trận đấu gồm <strong>4 thí sinh</strong>, thi đấu qua 5 vòng theo
          thứ tự: Khởi Động → Giải Mã → Bứt Phá → Về Đích.
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
        <p>Vòng thi mở màn, kiểm tra kiến thức nhanh. Gồm hai phần:</p>

        <SubHeading>1. Khởi Động Chung (KĐC)</SubHeading>
        <ul className="space-y-1.5">
          <Rule>
            Tất cả thí sinh cùng trả lời <strong>1 câu hỏi</strong>.
          </Rule>
          <Rule>
            Thời gian: <strong>60 giây</strong>.
          </Rule>
          <Rule>
            Trả lời đúng: <strong>+10 điểm</strong>. Sai: 0 điểm.
          </Rule>
          <Rule>Mọi thí sinh đều độc lập trả lời.</Rule>
        </ul>

        <SubHeading>2. Khởi Động Cá Nhân (KĐC riêng)</SubHeading>
        <ul className="space-y-1.5">
          <Rule>
            Mỗi thí sinh trả lời <strong>1 câu hỏi riêng</strong>.
          </Rule>
          <Rule>
            Thời gian: <strong>30 giây</strong>.
          </Rule>
          <Rule>
            Lần 1 đúng: <strong>+10 điểm</strong>. Lần 2 đúng:{" "}
            <strong>+5 điểm</strong>. Lần 3 trở đi: 0 điểm.
          </Rule>
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
        <ul className="mt-3 space-y-1.5">
          <Rule>
            Mỗi gợi ý đúng: <strong>+10 điểm</strong>.
          </Rule>
          <Rule>
            Tìm được từ khoá: <strong>+100 điểm</strong>, trừ đi{" "}
            <strong>10 điểm</strong> cho mỗi gợi ý đã mở.
          </Rule>
          <Rule>Ví dụ: mở 3 gợi ý rồi tìm đúng → 100 − 30 = 70 điểm.</Rule>
          <Rule>
            Thời gian mỗi gợi ý: <strong>15 giây</strong>.
          </Rule>
          <Rule>Tất cả thí sinh cùng chơi, ai nhanh hơn được nhiều hơn.</Rule>
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
          Vòng thi <strong>đua tốc</strong>. MC đặt câu hỏi, thí sinh bấm chuông
          trả lời.
        </p>
        <ul className="mt-3 space-y-1.5">
          <Rule>
            Thời gian: <strong>30 giây</strong> mỗi câu.
          </Rule>
          <Rule>
            Điểm dựa vào <strong>thứ tự bấm chuông</strong> và{" "}
            <strong>thời gian trả lời</strong>:
          </Rule>
        </ul>
        <PointMatrix
          headers={["Thứ tự bấm", "≤ 10 giây", "≤ 20 giây", "> 20 giây"]}
          rows={[
            {
              label: "Thứ 1",
              cells: [
                { text: "60", tone: "great" },
                { text: "40", tone: "great" },
                { text: "20", tone: "great" },
              ],
            },
            {
              label: "Thứ 2",
              cells: [
                { text: "45", tone: "good" },
                { text: "30", tone: "good" },
                { text: "15", tone: "good" },
              ],
            },
            {
              label: "Thứ 3",
              cells: [
                { text: "30", tone: "mid" },
                { text: "20", tone: "mid" },
                { text: "10", tone: "mid" },
              ],
            },
            {
              label: "Thứ 4",
              cells: [
                { text: "15", tone: "low" },
                { text: "10", tone: "low" },
                { text: "5", tone: "low" },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: "ve-dich",
    title: "Về Đích",
    icon: Target,
    content: (
      <>
        <p>Vòng thi cuối cùng, quyết định thứ hạng. Gồm hai phần:</p>

        <SubHeading>1. Về Đích Chung (VĐC)</SubHeading>
        <ul className="space-y-1.5">
          <Rule>
            <strong>4 câu hỏi</strong>, tất cả thí sinh cùng trả lời.
          </Rule>
          <Rule>
            Thời gian: <strong>45 giây</strong> mỗi câu.
          </Rule>
          <Rule>
            Đúng: <strong>+10 điểm</strong>. Sai: <strong>-10 điểm</strong>.
          </Rule>
        </ul>

        <SubHeading>2. Về Đích Cá Nhân (VĐR)</SubHeading>
        <ul className="space-y-1.5">
          <Rule>
            Mỗi thí sinh <strong>chọn chủ đề</strong> và trả lời{" "}
            <strong>3 câu hỏi</strong>.
          </Rule>
          <Rule>
            Thời gian: <strong>45 giây</strong> mỗi câu.
          </Rule>
          <Rule>
            Điểm tuỳ chủ đề: <strong>20, 30, 40 hoặc 50 điểm</strong>.
          </Rule>
          <Rule>
            Đúng: cộng điểm. Sai: <strong>trừ điểm tương đương</strong>.
          </Rule>
        </ul>
      </>
    ),
  },
  {
    id: "thoi-gian",
    title: "Thời Gian",
    icon: Timer,
    content: (
      <DurationList
        rows={[
          { label: "Khởi Động Chung", cells: [{ text: "60 giây" }] },
          { label: "Khởi Động Cá Nhân", cells: [{ text: "30 giây" }] },
          { label: "Giải Mã", cells: [{ text: "15 giây / gợi ý" }] },
          { label: "Bứt Phá", cells: [{ text: "30 giây" }] },
          { label: "Về Đích Chung", cells: [{ text: "45 giây" }] },
          { label: "Về Đích Cá Nhân", cells: [{ text: "45 giây" }] },
        ]}
      />
    ),
  },
  {
    id: "luat-chung",
    title: "Luật Chung",
    icon: Lock,
    content: (
      <ul className="space-y-1.5">
        <Rule>
          Mỗi trận đấu có <strong>4 thí sinh</strong>.
        </Rule>
        <Rule>Thứ tự ngồi: được xác định trước khi trận đấu bắt đầu.</Rule>
        <Rule>Thí sinh không được phép sử dụng tài nguyên bên ngoài.</Rule>
        <Rule>
          Trong vòng Bứt Phá, nếu trả lời sai, câu hỏi được chuyển cho thí sinh
          tiếp theo (nếu còn thời gian).
        </Rule>
        <Rule>Điểm âm có thể xảy ra ở vòng Về Đích.</Rule>
        <Rule>
          Trong trường hợp bằng điểm, hệ thống sẽ so sánh thời gian phản hồi để
          xếp hạng.
        </Rule>
        <Rule>Quyết định của MC là quyết định cuối cùng.</Rule>
      </ul>
    ),
  },
];

/* ─────────────────────────────────── Page ────────────────────────────────── */

const RulesPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <PublicLayout>
      <div className="max-w-5xl mx-auto">
        {/* Hero */}
        <div className="mb-8 sm:mb-10">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-5 cursor-pointer gap-2 px-0 text-sm text-brand hover:text-brand"
          >
            <ArrowLeft size={16} aria-hidden />
            <span>Quay lại</span>
          </Button>

          <div className="card card-wide relative overflow-hidden p-6! sm:p-8!">
            <div
              className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl"
              aria-hidden
            />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-brand">
              <Star size={11} aria-hidden /> Format OC3
            </span>
            <h1 className="font-display mt-3 text-4xl font-bold text-foreground sm:text-5xl">
              Luật Chơi
            </h1>
            <p className="mt-2 max-w-xl text-sm text-foreground/80 sm:text-base">
              Toàn bộ thể lệ các vòng thi của{" "}
              <span className="text-brand">Olympia Custom</span> — điểm số,
              thời gian và luật chung.
            </p>

            {/* Quick stats */}
            <div className="mt-5 grid max-w-md grid-cols-3 gap-3">
              {[
                ["4", "Thí sinh"],
                ["5", "Vòng thi"],
                ["7", "Mục luật"],
              ].map(([n, label]) => (
                <div
                  key={label}
                  className="rounded-xl border border-border bg-accent/50 px-3 py-2.5 text-center"
                >
                  <div className="font-display text-2xl font-bold text-brand">
                    {n}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Body: sticky TOC + sections */}
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
          {/* Desktop TOC */}
          <aside className="hidden lg:block">
            <nav className="card card-wide sticky top-8 p-4!" aria-label="Mục lục">
              <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-brand">
                Mục lục
              </h2>
              <ul className="space-y-1">
                {SECTIONS.map((section) => {
                  const active = activeId === section.id;
                  return (
                    <li key={section.id}>
                      <Button
                        variant="ghost"
                        onClick={() => scrollTo(section.id)}
                        className={`w-full cursor-pointer justify-start gap-2.5 rounded-lg px-3 py-2 text-sm ${
                          active
                            ? "bg-primary/25 font-medium text-foreground"
                            : "text-foreground/80 hover:bg-accent/50 hover:text-foreground"
                        }`}
                      >
                        <section.icon
                          size={15}
                          className={active ? "text-brand" : "text-brand"}
                          aria-hidden
                        />
                        <span>{section.title}</span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          {/* Mobile TOC chips */}
          <div className="mb-6 overflow-x-auto lg:hidden">
            <div className="flex w-max gap-2 pb-1">
              {SECTIONS.map((section) => {
                const active = activeId === section.id;
                return (
                  <Button
                    key={section.id}
                    variant="ghost"
                    onClick={() => scrollTo(section.id)}
                    className={`cursor-pointer gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs ${
                      active
                        ? "border-brand/50 bg-primary/25 text-foreground"
                        : "border-border bg-accent/50 text-foreground/80 hover:text-foreground"
                    }`}
                  >
                    <section.icon size={13} className="text-brand" aria-hidden />
                    {section.title}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Sections */}
          <div className="min-w-0">
            <div className="space-y-6">
              {SECTIONS.map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="card card-wide scroll-mt-6 p-5! sm:p-7!"
                >
                  <div className="mb-4 flex items-center gap-3.5">
                    <div className="relative rounded-xl bg-primary/20 p-2.5">
                      <section.icon size={20} className="text-brand" aria-hidden />
                      <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-foreground">
                        {index + 1}
                      </span>
                    </div>
                    <h2 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
                      {section.title}
                    </h2>
                  </div>
                  <div className="space-y-3 leading-relaxed text-foreground/80 [&_strong]:text-foreground [&_p]:leading-relaxed">
                    {section.content}
                  </div>
                </section>
              ))}
            </div>

            {/* Footer */}
            <p className="mb-4 mt-10 text-center text-xs text-muted-foreground">
              Luật chơi có thể được cập nhật. Phiên bản hiện tại áp dụng cho giải
              đấu Olympia Custom.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

export default RulesPage;
