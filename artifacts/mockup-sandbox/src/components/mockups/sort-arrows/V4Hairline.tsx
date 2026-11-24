// V4 — Hairline: ultra-thin stroke lines with small arrowheads, elegant/minimal
function ArrowIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
      {/* Up arrow — hairline */}
      <line x1="4.5" y1="18" x2="4.5" y2="3" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <polyline points="1.5,7 4.5,2 7.5,7" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Down arrow — hairline */}
      <line x1="11.5" y1="2" x2="11.5" y2="17" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <polyline points="8.5,13 11.5,18 14.5,13" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
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

export function V4Hairline() {
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
        <span style={{ color: "#8BA3BE", fontSize: 12, fontFamily: "system-ui", fontWeight: 600, letterSpacing: 0.5 }}>V4 — Hairline</span>
      </div>
    </div>
  );
}
