// V5 — Rounded: rounded stem + rounded arrowhead, softer feel
function ArrowIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
      {/* Up arrow — rounded stroke */}
      <line x1="4.5" y1="18" x2="4.5" y2="5" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 1.5 8 L 4.5 2 L 7.5 8" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Down arrow — rounded stroke */}
      <line x1="11.5" y1="2" x2="11.5" y2="15" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 8.5 12 L 11.5 18 L 14.5 12" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function SortBtn({ active }: { active: boolean }) {
  const color = active ? "#4B9FE0" : "#ffffff";
  const bg = active ? "rgba(75,159,224,0.15)" : "rgba(255,255,255,0.08)";
  const border = active ? "1px solid rgba(75,159,224,0.4)" : "1px solid rgba(255,255,255,0.12)";
  return (
    <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, border, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <ArrowIcon color={color} />
    </div>
  );
}

export function V5Rounded() {
  return (
    <div style={{ minHeight: "100vh", background: "#0C1523", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <SortBtn active={false} />
            <span style={{ color: "#5A7A9A", fontSize: 11, fontFamily: "system-ui" }}>Inactive</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <SortBtn active={true} />
            <span style={{ color: "#5A7A9A", fontSize: 11, fontFamily: "system-ui" }}>Active</span>
          </div>
        </div>
        <span style={{ color: "#8BA3BE", fontSize: 12, fontFamily: "system-ui", fontWeight: 600, letterSpacing: 0.5 }}>V5 — Rounded</span>
      </div>
    </div>
  );
}
