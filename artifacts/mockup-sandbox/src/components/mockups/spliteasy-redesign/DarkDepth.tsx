export function DarkDepth() {
  const avatarBgs = ["#4B9FE0","#37BFA0","#EE7B30","#E06060"];

  return (
    <div style={{ width: 390, height: 844, background: "#0B0F1A", fontFamily: "'Inter', sans-serif", overflow: "hidden", position: "relative", borderRadius: 40, boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>

      {/* Status bar */}
      <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#E8F1FA" }}>9:41</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
            {[3,5,7,9].map(h => <div key={h} style={{ width: 3, height: h, background: "#8BA3BE", borderRadius: 1 }} />)}
          </div>
          <div style={{ width: 15, height: 10, border: "1.5px solid #8BA3BE", borderRadius: 2, position: "relative" }}>
            <div style={{ position: "absolute", left: 1, top: 1, right: 1, bottom: 1, background: "#8BA3BE", borderRadius: 1 }} />
          </div>
        </div>
      </div>

      {/* Header */}
      <div style={{ padding: "8px 22px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#E8F1FA", letterSpacing: -0.5 }}>Groups</span>
          <div style={{ background: "rgba(75,159,224,0.2)", border: "1px solid rgba(75,159,224,0.3)", borderRadius: 20, padding: "2px 9px" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#4B9FE0" }}>2</span>
          </div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 13, background: "linear-gradient(135deg, #1763A6, #4B9FE0)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(75,159,224,0.35)" }}>
          <span style={{ color: "white", fontSize: 22, lineHeight: 1, marginTop: -1 }}>+</span>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ margin: "14px 22px 0", background: "#151C2E", borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, border: "1px solid #1E2D45" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4E6580" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <span style={{ fontSize: 14.5, color: "#4E6580" }}>Search groups or members...</span>
      </div>

      {/* Balance hero — dark gradient card */}
      <div style={{ margin: "16px 22px 0", borderRadius: 22, overflow: "hidden", position: "relative" }}>
        {/* glow effect */}
        <div style={{ position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)", width: 200, height: 100, background: "rgba(75,159,224,0.15)", borderRadius: "50%", filter: "blur(30px)" }} />
        <div style={{ background: "linear-gradient(145deg, #12213A 0%, #1A2F50 100%)", padding: "22px 22px 20px", border: "1px solid #1E3358", borderRadius: 22, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4B9FE0", boxShadow: "0 0 8px rgba(75,159,224,0.6)" }} />
            <span style={{ fontSize: 12.5, color: "#8BA3BE", fontWeight: 500, letterSpacing: 0.3 }}>YOU ARE OWED</span>
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, color: "#E8F1FA", letterSpacing: -1, lineHeight: 1.1 }}>$1,837.50</div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <div style={{ background: "rgba(75,159,224,0.12)", borderRadius: 8, padding: "5px 12px", border: "1px solid rgba(75,159,224,0.2)" }}>
              <span style={{ fontSize: 12, color: "#4B9FE0", fontWeight: 600 }}>+ $842.50</span>
            </div>
            <div style={{ background: "rgba(55,191,160,0.12)", borderRadius: 8, padding: "5px 12px", border: "1px solid rgba(55,191,160,0.2)" }}>
              <span style={{ fontSize: 12, color: "#37BFA0", fontWeight: 600 }}>+ €170.00</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pending invite */}
      <div style={{ margin: "14px 22px 0", background: "#151C2E", borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, border: "1px solid #1E2D45" }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(75,159,224,0.12)", border: "1px solid rgba(75,159,224,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✉️</div>
        <span style={{ fontSize: 13.5, color: "#8BA3BE", fontWeight: 600 }}>1 pending invite</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
          <div style={{ background: "#1E2D45", borderRadius: 8, padding: "5px 11px", border: "1px solid #253650" }}><span style={{ fontSize: 12, color: "#4E6580", fontWeight: 600 }}>Skip</span></div>
          <div style={{ background: "linear-gradient(135deg, #1763A6, #4B9FE0)", borderRadius: 8, padding: "5px 11px" }}><span style={{ fontSize: 12, color: "white", fontWeight: 600 }}>Join</span></div>
        </div>
      </div>

      {/* Groups label */}
      <div style={{ margin: "20px 22px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#4E6580", letterSpacing: 1, textTransform: "uppercase" }}>2 Groups</span>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#4B9FE0", fontWeight: 600 }}>Sort</span>
        </div>
      </div>

      {/* Group cards */}
      {[
        { emoji: "✈️", name: "Barcelona Trip", members: 3, amount: "€170.00", color: "#37BFA0", glowColor: "rgba(55,191,160,0.15)", border: "rgba(55,191,160,0.2)", initials: ["A","C","S","R"] },
        { emoji: "🏠", name: "The Apartment", members: 3, amount: "$842.50", color: "#4B9FE0", glowColor: "rgba(75,159,224,0.15)", border: "rgba(75,159,224,0.2)", initials: ["S","R","J","L"] },
      ].map((g, i) => (
        <div key={i} style={{ margin: "0 22px 12px", background: "#151C2E", borderRadius: 18, padding: "14px 16px", display: "flex", alignItems: "center", gap: 13, border: "1px solid #1E2D45", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -20, right: -20, width: 70, height: 70, borderRadius: "50%", background: g.glowColor, filter: "blur(20px)" }} />
          <div style={{ width: 46, height: 46, borderRadius: 14, background: `${g.glowColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, border: `1px solid ${g.border}`, position: "relative" }}>
            {g.emoji}
          </div>
          <div style={{ flex: 1, position: "relative" }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "#E8F1FA", marginBottom: 5 }}>{g.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: -2 }}>
              {g.initials.slice(0,3).map((init, idx) => (
                <div key={idx} style={{ width: 20, height: 20, borderRadius: "50%", background: avatarBgs[idx], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "white", border: "2px solid #151C2E", marginLeft: idx > 0 ? -5 : 0 }}>{init}</div>
              ))}
              <span style={{ fontSize: 12, color: "#4E6580", marginLeft: 6 }}>{g.members} people</span>
            </div>
          </div>
          <div style={{ textAlign: "right", position: "relative" }}>
            <div style={{ fontSize: 11, color: g.color, fontWeight: 600, marginBottom: 3, letterSpacing: 0.3, textTransform: "uppercase" }}>owed to you</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#E8F1FA", letterSpacing: -0.3 }}>{g.amount}</div>
          </div>
        </div>
      ))}

      {/* Bottom tab bar */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 82, background: "#0E1420", borderTop: "1px solid #1A2540", display: "flex", alignItems: "flex-start", paddingTop: 10 }}>
        {[
          { icon: "⊞", label: "Groups", active: true },
          { icon: "≋", label: "Activity", active: false },
          { icon: "⊙", label: "Stats", active: false },
          { icon: "⊕", label: "Friends", active: false },
          { icon: "◎", label: "Account", active: false },
        ].map(tab => (
          <div key={tab.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 20, color: tab.active ? "#4B9FE0" : "#2D4060" }}>{tab.icon}</span>
            <span style={{ fontSize: 10.5, fontWeight: tab.active ? 700 : 500, color: tab.active ? "#4B9FE0" : "#2D4060" }}>{tab.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
