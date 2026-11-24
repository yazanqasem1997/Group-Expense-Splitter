// V3 — Bold Block: wider solid block arrows, chunky and clear
function ArrowIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" fill="none">
      {/* Up arrow — bold block */}
      <path d="M 0.5 7.5 L 4 1 L 7.5 7.5 L 5.5 7.5 L 5.5 17 L 2.5 17 L 2.5 7.5 Z" fill={color} />
      {/* Down arrow — bold block */}
      <path d="M 8.5 10.5 L 12 17 L 15.5 10.5 L 13.5 10.5 L 13.5 1 L 10.5 1 L 10.5 10.5 Z" fill={color} />
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

export function V3Block() {
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
        <span style={{ color: "#8BA3BE", fontSize: 12, fontFamily: "system-ui", fontWeight: 600, letterSpacing: 0.5 }}>V3 — Bold Block</span>
      </div>
    </div>
  );
}
