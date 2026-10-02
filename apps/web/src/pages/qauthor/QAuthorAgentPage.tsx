import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, SendHorizonal, Trash2, User } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { getMatchCode as readStoredMatchCode } from "@/utils/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const logger = createLogger("QAuthorAgentPage");

interface ChatMsg {
  id: number;
  role: "user" | "agent";
  text: string;
  tools?: string[];
  pending?: boolean;
}

let nextId = 1;

const QAuthorAgentPage = () => {
  const [matchCode, setMatchCode] = useState(readStoredMatchCode());
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 0,
      role: "agent",
      text: "Chào bạn, mình là OCee kiểm tra câu hỏi. Dán nội dung + đáp án bank vào đây, mình sẽ góp ý (2 đáp án, độ khó, gợi ý lộ đáp án…). Logic chấm chi tiết mình sẽ bàn kỹ sau.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || sending) return;
    const userMsg: ChatMsg = { id: nextId++, role: "user", text: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/agent/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          match_code: matchCode.trim() || undefined,
          question: q,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.status === "success") {
        const data = json.data as { answer?: string; tools_used?: string[] };
        setMessages((prev) => [
          ...prev,
          {
            id: nextId++,
            role: "agent",
            text: data.answer ?? "(trống)",
            tools: data.tools_used ?? [],
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId++,
            role: "agent",
            text: `Lỗi: ${json?.message ?? `HTTP ${res.status}`}`,
          },
        ]);
      }
    } catch (err) {
      logger.error("Error asking agent:", err);
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: "agent", text: "Lỗi kết nối OCee." },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, matchCode, sending]);

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-8rem)]">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="xs"
          onClick={() => setMessages((prev) => prev.slice(0, 1))}
          className="gap-1 bg-accent hover:bg-accent/80 text-xs text-foreground/80"
        >
          <Trash2 size={13} /> Xoá hội thoại
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          value={matchCode}
          onChange={(e) => setMatchCode(e.target.value)}
          placeholder="Mã trận (tuỳ chọn — để trống khi hỏi về bank)"
          className="flex-1 px-3 py-2 rounded-lg bg-accent/50 border border-border text-foreground font-mono text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto bg-accent/50 border border-border rounded-xl p-4 flex flex-col gap-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "agent" && (
              <div className="p-1.5 rounded-full bg-success/20 h-fit shrink-0">
                <Bot size={14} className="text-success" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-success/30 text-foreground"
                  : "bg-accent text-foreground"
              }`}
            >
              {m.text}
              {m.tools && m.tools.length > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground font-mono">
                  tools: {m.tools.join(", ")}
                </p>
              )}
            </div>
            {m.role === "user" && (
              <div className="p-1.5 rounded-full bg-accent h-fit shrink-0">
                <User size={14} className="text-foreground/80" />
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="flex gap-2 justify-start">
            <div className="p-1.5 rounded-full bg-success/20 h-fit">
              <Bot size={14} className="text-success" />
            </div>
            <div className="bg-accent rounded-xl px-3 py-2 text-sm text-muted-foreground animate-pulse">
              OCee đang nghĩ…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <Textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Dán câu hỏi + đáp án… (Enter để gửi, Shift+Enter xuống dòng)"
          className="flex-1 px-3 py-2 rounded-lg bg-accent/50 border border-border text-foreground text-sm resize-none"
        />
        <Button
          variant="default"
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          className="gap-1.5 self-end rounded-lg bg-success hover:bg-success/90 disabled:opacity-50 font-semibold text-sm text-success-foreground py-2"
        >
          <SendHorizonal size={15} /> Gửi
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Khung chat trước — logic kiểm tra (2 đáp án, độ khó, gợi ý lộ đáp án…) bàn kỹ sau.
      </p>
    </div>
  );
};

export default QAuthorAgentPage;
