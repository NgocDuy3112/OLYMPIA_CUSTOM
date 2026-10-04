import { Bot } from "lucide-react";

export const OceeOpinion = ({ text }: { text: string }) => {
  if (!text) return null;
  return (
    <div className="rounded-lg bg-background/60 border border-primary/70 p-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs text-brand">
        <Bot size={13} /> Ý kiến OCee:
      </p>
      <p className="text-xs text-foreground/90 whitespace-pre-wrap">{text}</p>
    </div>
  );
};

export default OceeOpinion;
