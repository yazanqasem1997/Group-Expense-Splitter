export function VividLight() {
  const groups = [
    { id: 1, emoji: "✈️", name: "Barcelona Trip", members: 3, amount: 170, owed: true, currency: "€", color: "#1763A6", initials: ["A","C","S","R"] },
    { id: 2, emoji: "🏠", name: "The Apartment", members: 3, amount: 842.5, owed: true, currency: "$", color: "#129B82", initials: ["S","R","J","L"] },
  ];

  const avatarBgs = ["#1763A6","#129B82","#EE7B30","#D64545"];

  return (
    <div style={{ width: 390, height: 844, background: "#EEF3F9", fontFamily: "'Inter', sans-serif", overflow: "hidden", position: "relative", borderRadius: 40, boxShadow: "0 32px 80px rgba(22,32,44,0.22)" }}>

      {/* Status bar */}
      <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", background: "#EEF3F9" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#16202C" }}>9:41</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 2 }}>
            {[3,5,7,9].map(h => <div key={h} style={{ width: 3, height: h, background: "#16202C", borderRadius: 1 }} />)}
          </div>
          <div style={{ width: 15, height: 10, border: "1.5px solid #16202C", borderRadius: 2, position: "relative" }}>
            <div style={{ position: "absolute", left: 1, top: 1, right: 1, bottom: 1, background: "#16202C", borderRadius: 1 }} />
          </div>
        </div>
      </div>

      {/* Header */}
      <div style={{ padding: "8px 22px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#16202C", letterSpacing: -0.5 }}>Groups</span>
          <div style={{ background: "#1763A6", borderRadius: 20, padding: "2px 9px", display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "white" }}>2</span>
          </div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 13, background: "#1763A6", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(23,99,166,0.35)" }}>
          <span style={{ color: "white", fontSize: 22, lineHeight: 1, marginTop: -1 }}>+</span>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ margin: "14px 22px 0", background: "white", borderRadius: 14, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 2px 8px rgba(22,32,44,0.06)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A0AEBB" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <span style={{ fontSize: 14.5, color: "#A0AEBB" }}>Search groups or members...</span>
      </div>

      {/* Balance hero — gradient card */}
      <div style={{ margin: "16px 22px 0", borderRadius: 20, overflow: "hidden", background: "linear-gradient(135deg, #1763A6 0%, #0EA5E9 60%, #129B82 100%)", padding: "22px 22px 18px", position: "relative" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 110, height: 110, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
        <div style={{ position: "absolute", bottom: -20, left: 60, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.7)" }} />
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>You are owed in total</span>
          </div>
          <div style={{ fontSize: 38, fontWeight: 800, color: "white", letterSpacing: -1, lineHeight: 1.1 }}>$1,837.50</div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <div style={{ background: "rgba(255,255,255,0.18)", borderRadius: 8, padding: "4px 10px", border: "1px solid rgba(255,255,255,0.2)" }}>
              <span style={{ fontSize: 12, color: "white", fontWeight: 600 }}>↑ $842.50 USD</span>
            </div>
            <div style={{ background: "rgba(255,255,255,0.18)", borderRadius: 8, padding: "4px 10px", border: "1px solid rgba(255,255,255,0.2)" }}>
              <span style={{ fontSize: 12, color: "white", fontWeight: 600 }}>↑ €170.00 EUR</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pending invite */}
      <div style={{ margin: "14px 22px 0", background: "#EAF3FF", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 9, border: "1px solid #BFDAF6" }}>
        <span style={{ fontSize: 15 }}>✉️</span>
        <span style={{ fontSize: 13, color: "#1763A6", fontWeight: 600 }}>1 pending invite</span>
        <span style={{ fontSize: 12, color: "#5590CC", marginLeft: "auto" }}>View →</span>
      </div>

      {/* Groups label */}
      <div style={{ margin: "18px 22px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#A0AEBB", letterSpacing: 0.8, textTransform: "uppercase" }}>2 Groups</span>
        <span style={{ fontSize: 12, color: "#1763A6", fontWeight: 600 }}>Sort</span>
      </div>

      {/* Group cards */}
      {groups.map((g, i) => (
        <div key={g.id} style={{ margin: "0 22px 12px", background: "white", borderRadius: 18, padding: "14px 16px", display: "flex", alignItems: "center", gap: 13, boxShadow: "0 2px 12px rgba(22,32,44,0.07)", borderLeft: `4px solid ${g.color}` }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: `${g.color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
            {g.emoji}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "#16202C", marginBottom: 4 }}>{g.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {g.initials.slice(0,3).map((init, idx) => (
                <div key={idx} style={{ width: 18, height: 18, borderRadius: "50%", background: avatarBgs[idx], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "white" }}>{init}</div>
              ))}
              <span style={{ fontSize: 12, color: "#A0AEBB", marginLeft: 2 }}>{g.members} people</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "#1B9E77", fontWeight: 600, marginBottom: 2 }}>owed to you</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#16202C", letterSpacing: -0.3 }}>{g.currency}{g.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>
      ))}

      {/* Bottom tab bar */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 82, background: "white", borderTop: "1px solid #E8EEF4", display: "flex", alignItems: "flex-start", paddingTop: 10, boxShadow: "0 -4px 20px rgba(22,32,44,0.06)" }}>
        {[
          { icon: "⊞", label: "Groups", active: true },
          { icon: "≋", label: "Activity", active: false },
          { icon: "⊙", label: "Stats", active: false },
          { icon: "⊕", label: "Friends", active: false },
          { icon: "◎", label: "Account", active: false },
        ].map(tab => (
          <div key={tab.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 20, color: tab.active ? "#1763A6" : "#A0AEBB" }}>{tab.icon}</span>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: tab.active ? 700 : 500, color: tab.active ? "#1763A6" : "#A0AEBB" }}>{tab.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
