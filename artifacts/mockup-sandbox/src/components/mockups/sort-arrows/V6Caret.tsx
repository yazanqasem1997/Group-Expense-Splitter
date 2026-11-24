// V6 — Triangle Caret: pure solid triangles, no stem — maximally minimal
function ArrowIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" fill="none">
      {/* Up triangle */}
      <polygon points="3.5,9 7,1 10.5,9" fill={color} />
      {/* Stem up */}
      <rect x="5.8" y="9" width="2.4" height="9" rx="1.2" fill={color} />
      {/* Down triangle */}
      <polygon points="3.5,21 7,29 10.5,21" fill={color} transform="translate(0,-10)" />
      {/* Stem down */}
      <rect x="5.8" y="2" width="2.4" height="9" rx="1.2" fill={color} transform="translate(0,0)" />
    </svg>
  );
}

// Simpler direct path approach
function ArrowIcon2({ color }: { color: string }) {
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" fill={color}>
      {/* Up: triangle head + thin stem */}
      <polygon points="0.5,7 3.5,1 6.5,7" />
      <rect x="2.1" y="7" width="2.8" height="10" rx="1.4" />
      {/* Down: thin stem + triangle head */}
      <rect x="7.1" y="1" width="2.8" height="10" rx="1.4" />
      <polygon points="7.5,11 10.5,17 13.5,11" />
    </svg>
  );
}

function SortBtn({ active }: { active: boolean }) {
  const color = active ? "#4B9FE0" : "#ffffff";
  const bg = active ? "rgba(75,159,224,0.15)" : "rgba(255,255,255,0.08)";
  const border = active ? "1px solid rgba(75,159,224,0.4)" : "1px solid rgba(255,255,255,0.12)";
  return (
    <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, border, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <ArrowIcon2 color={color} />
    </div>
  );
}

export function V6Caret() {
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
        <span style={{ color: "#8BA3BE", fontSize: 12, fontFamily: "system-ui", fontWeight: 600, letterSpacing: 0.5 }}>V6 — Triangle Caret</span>
      </div>
    </div>
  );
}
