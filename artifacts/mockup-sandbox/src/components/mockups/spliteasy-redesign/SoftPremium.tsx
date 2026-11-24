export function SoftPremium() {
  const avatarBgs = ["#7C6AF6","#4DB8A4","#F2884B","#E15B5B"];

  return (
    <div style={{ width: 390, height: 844, background: "#F7F5F2", fontFamily: "'Inter', sans-serif", overflow: "hidden", position: "relative", borderRadius: 40, boxShadow: "0 32px 80px rgba(40,30,20,0.18)" }}>

      {/* Status bar */}
      <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#2C2016" }}>9:41</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 2 }}>
            {[3,5,7,9].map(h => <div key={h} style={{ width: 3, height: h, background: "#2C2016", borderRadius: 1 }} />)}
          </div>
          <div style={{ width: 15, height: 10, border: "1.5px solid #2C2016", borderRadius: 2, position: "relative" }}>
            <div style={{ position: "absolute", left: 1, top: 1, right: 1, bottom: 1, background: "#2C2016", borderRadius: 1 }} />
          </div>
        </div>
      </div>

      {/* Header */}
      <div style={{ padding: "10px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: 13, color: "#9E9080", fontWeight: 500, letterSpacing: 0.3 }}>Wednesday, July 9</span>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#1E1610", letterSpacing: -0.8, marginTop: 2 }}>Groups</div>
        </div>
        <div style={{ width: 42, height: 42, borderRadius: 14, background: "#1E1610", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(30,22,16,0.22)" }}>
          <span style={{ color: "white", fontSize: 22, lineHeight: 1, marginTop: -1 }}>+</span>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ margin: "16px 24px 0", background: "#EFECE7", borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B0A898" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <span style={{ fontSize: 14, color: "#B0A898" }}>Search groups or members...</span>
      </div>

      {/* Balance hero — warm soft card */}
      <div style={{ margin: "18px 24px 0", borderRadius: 22, overflow: "hidden", position: "relative" }}>
        <div style={{ background: "linear-gradient(145deg, #2C2016 0%, #4A3828 100%)", padding: "22px 22px 20px" }}>
          <div style={{ position: "absolute", top: -10, right: -15, width: 100, height: 100, borderRadius: "50%", background: "rgba(245,195,100,0.08)" }} />
          <div style={{ position: "absolute", bottom: -25, left: 20, width: 70, height: 70, borderRadius: "50%", background: "rgba(245,195,100,0.06)" }} />
          <div style={{ position: "relative" }}>
            <span style={{ fontSize: 12.5, color: "rgba(245,215,170,0.7)", fontWeight: 500, letterSpacing: 0.5, textTransform: "uppercase" }}>Total owed to you</span>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#FAF0DC", letterSpacing: -1, lineHeight: 1.1, marginTop: 4 }}>$1,837.50</div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "5px 12px", border: "1px solid rgba(255,255,255,0.12)" }}>
                <span style={{ fontSize: 12, color: "#F0D8A8", fontWeight: 600 }}>$842.50 USD</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "5px 12px", border: "1px solid rgba(255,255,255,0.12)" }}>
                <span style={{ fontSize: 12, color: "#F0D8A8", fontWeight: 600 }}>€170.00 EUR</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending invite */}
      <div style={{ margin: "14px 24px 0", background: "white", borderRadius: 14, padding: "11px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 2px 10px rgba(40,30,20,0.07)" }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: "#FEF3E2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✉️</div>
        <div>
          <span style={{ fontSize: 13.5, color: "#1E1610", fontWeight: 600 }}>1 pending invite</span>
          <div style={{ fontSize: 11.5, color: "#9E9080" }}>Weekend in Paris</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <div style={{ background: "#F0EDE8", borderRadius: 8, padding: "5px 12px" }}><span style={{ fontSize: 12, color: "#9E9080", fontWeight: 600 }}>Decline</span></div>
          <div style={{ background: "#1E1610", borderRadius: 8, padding: "5px 12px" }}><span style={{ fontSize: 12, color: "white", fontWeight: 600 }}>Join</span></div>
        </div>
      </div>

      {/* Section header */}
      <div style={{ margin: "20px 24px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: "#1E1610" }}>Your Groups</span>
        <span style={{ fontSize: 12.5, color: "#9E9080", fontWeight: 500 }}>2 active</span>
      </div>

      {/* Group cards */}
      {[
        { emoji: "✈️", name: "Barcelona Trip", members: 3, amount: "€170.00", color: "#7C6AF6", bgColor: "#F1EFFE", initials: ["A","C","S","R"] },
        { emoji: "🏠", name: "The Apartment", members: 3, amount: "$842.50", color: "#4DB8A4", bgColor: "#E8F8F5", initials: ["S","R","J","L"] },
      ].map((g, i) => (
        <div key={i} style={{ margin: "0 24px 12px", background: "white", borderRadius: 18, padding: "16px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 20px rgba(40,30,20,0.08)", border: "1px solid rgba(40,30,20,0.04)" }}>
          <div style={{ width: 50, height: 50, borderRadius: 16, background: g.bgColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
            {g.emoji}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "#1E1610", marginBottom: 6 }}>{g.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: -2 }}>
              {g.initials.slice(0,3).map((init, idx) => (
                <div key={idx} style={{ width: 22, height: 22, borderRadius: "50%", background: avatarBgs[idx], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "white", border: "2px solid white", marginLeft: idx > 0 ? -6 : 0 }}>{init}</div>
              ))}
              <span style={{ fontSize: 12, color: "#9E9080", marginLeft: 6 }}>{g.members} members</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11.5, color: "#4DB8A4", fontWeight: 600, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.3 }}>owed to you</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1E1610", letterSpacing: -0.4 }}>{g.amount}</div>
          </div>
        </div>
      ))}

      {/* Bottom tab bar */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 82, background: "#F7F5F2", borderTop: "1px solid #E8E2DA", display: "flex", alignItems: "flex-start", paddingTop: 10 }}>
        {[
          { icon: "⊞", label: "Groups", active: true },
          { icon: "≋", label: "Activity", active: false },
          { icon: "⊙", label: "Stats", active: false },
          { icon: "⊕", label: "Friends", active: false },
          { icon: "◎", label: "Account", active: false },
        ].map(tab => (
          <div key={tab.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 20, color: tab.active ? "#1E1610" : "#B0A898" }}>{tab.icon}</span>
            <span style={{ fontSize: 10.5, fontWeight: tab.active ? 700 : 500, color: tab.active ? "#1E1610" : "#B0A898" }}>{tab.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
