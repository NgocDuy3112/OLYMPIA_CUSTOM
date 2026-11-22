const GLOW_WASH_CSS = `
.stage-glow-wash {
  inset: -5%;
  animation:
    stage-glow-wash-breathe 7s ease-in-out infinite,
    stage-glow-wash-drift 16s ease-in-out infinite;
}
@keyframes stage-glow-wash-breathe {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.85; }
}
@keyframes stage-glow-wash-drift {
  0%, 100% { transform: translate(0, 0); }
  33% { transform: translate(1.5%, 1%); }
  66% { transform: translate(-1.5%, -1%); }
}
@media (prefers-reduced-motion: reduce) {
  .stage-glow-wash { animation: none; }
}
`

export function GlowWash() {
    return (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            <style>{GLOW_WASH_CSS}</style>
            <div
                className="stage-glow-wash absolute"
                style={{
                    backgroundImage:
                        "radial-gradient(60rem 44rem at 0% 0%, var(--glow-1), transparent 65%), radial-gradient(56rem 42rem at 100% 100%, var(--glow-2), transparent 65%), radial-gradient(48rem 36rem at 100% 0%, var(--glow-1), transparent 70%)",
                }}
            />
        </div>
    )
}
