import React, { useMemo } from "react";
import { InlineMath, BlockMath } from "react-katex";
import "katex/dist/katex.min.css";

interface MathTextProps {
  text: string;
  className?: string;
}

// Render $...$ inline và $$...$$ block. Lỗi LaTeX fallback text thuần.
export const MathText: React.FC<MathTextProps> = ({ text, className }) => {
  const parts = useMemo(() => {
    const out: Array<{ kind: "text" | "inline" | "block"; value: string; key: number }> = [];
    const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        out.push({ kind: "text", value: text.slice(last, m.index), key: key++ });
      }
      if (m[1] !== undefined) {
        out.push({ kind: "block", value: m[1], key: key++ });
      } else {
        out.push({ kind: "inline", value: m[2], key: key++ });
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      out.push({ kind: "text", value: text.slice(last), key: key++ });
    }
    if (out.length === 0) out.push({ kind: "text", value: text, key: 0 });
    return out;
  }, [text]);

  return (
    <span className={className}>
      {parts.map((p) => {
        if (p.kind === "inline") {
          try {
            return <InlineMath key={p.key} math={p.value} />;
          } catch {
            return <span key={p.key}>${p.value}$</span>;
          }
        }
        if (p.kind === "block") {
          try {
            return <BlockMath key={p.key} math={p.value} />;
          } catch {
            return <span key={p.key}>$${p.value}$$</span>;
          }
        }
        return <span key={p.key}>{p.value}</span>;
      })}
    </span>
  );
};
