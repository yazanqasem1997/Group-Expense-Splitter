export function LogoA() {
  return (
    <div className="min-h-screen bg-[#050C1B] flex flex-col items-center justify-center gap-10 p-8">
      <p className="text-[#3D5A78] text-xs font-mono uppercase tracking-widest mb-2">Concept A — Scissors Gradient</p>

      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <div
            className="w-28 h-28 rounded-[28px] flex items-center justify-center shadow-2xl"
            style={{
              background: "linear-gradient(135deg, #4B9FE0 0%, #1DB8A6 100%)",
              boxShadow: "0 12px 48px rgba(75,159,224,0.45), 0 4px 16px rgba(29,184,166,0.3)",
            }}
          >
            <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
              <g transform="translate(30,30)">
                <line x1="-16" y1="-16" x2="16" y2="16" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
                <circle cx="-19" cy="-19" r="7" fill="white" fillOpacity="0.95" />
                <circle cx="19" cy="19" r="7" fill="white" fillOpacity="0.95" />
                <line x1="-16" y1="16" x2="4" y2="-4" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
                <circle cx="-19" cy="19" r="7" fill="white" fillOpacity="0.95" />
              </g>
            </svg>
          </div>
          <div
            className="absolute inset-0 rounded-[28px] scale-125 opacity-20 blur-xl"
            style={{ background: "linear-gradient(135deg, #4B9FE0, #1DB8A6)" }}
          />
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-[42px] font-bold text-white tracking-tight" style={{ fontFamily: "system-ui" }}>
            Split<span style={{ color: "#2BBFA4" }}>Easy</span>
          </span>
          <span className="text-[#5A7F9E] text-sm tracking-wide">Split expenses. No drama.</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        <div className="text-[#2A3F54] text-[10px] uppercase tracking-widest">Design Notes</div>
        <div className="bg-[#0D1E33] rounded-xl p-4 text-[#5A8AAE] text-xs leading-relaxed w-full border border-[#1A3045]">
          <p>✦ Gradient from brand blue → teal signals money flow</p>
          <p className="mt-1">✦ Rounded rectangle icon (iOS-native feel)</p>
          <p className="mt-1">✦ Scissors = "cutting" the bill — universally understood</p>
          <p className="mt-1">✦ Works at 16px favicon size</p>
        </div>
      </div>
    </div>
  );
}
