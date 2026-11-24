// V2 — Chevron: angular V-shaped chevrons side by side (⌃⌄ style)
function ArrowIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
      {/* Up chevron (left) */}
      <polyline points="1.5,11 4.5,4 7.5,11" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="4.5" y1="4" x2="4.5" y2="18" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      {/* Down chevron (right) */}
      <polyline points="10.5,9 13.5,16 16.5,9" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="13.5" y1="2" x2="13.5" y2="16" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
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

export function V2Chevron() {
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
        <span style={{ color: "#8BA3BE", fontSize: 12, fontFamily: "system-ui", fontWeight: 600, letterSpacing: 0.5 }}>V2 — Chevron</span>
      </div>
    </div>
  );
}
