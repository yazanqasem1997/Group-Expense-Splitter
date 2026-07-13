export function LogoB() {
  return (
    <div className="min-h-screen bg-[#050C1B] flex flex-col items-center justify-center gap-10 p-8">
      <p className="text-[#3D5A78] text-xs font-mono uppercase tracking-widest mb-2">Concept B — Split Coin</p>

      <div className="flex flex-col items-center gap-5">
        <div className="relative w-28 h-28">
          <svg width="112" height="112" viewBox="0 0 112 112" fill="none">
            <defs>
              <clipPath id="left-half">
                <rect x="0" y="0" width="56" height="112" />
              </clipPath>
              <clipPath id="right-half">
                <rect x="56" y="0" width="56" height="112" />
              </clipPath>
              <filter id="glow">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <circle cx="56" cy="56" r="52" fill="#4B9FE0" clipPath="url(#left-half)" />
            <circle cx="56" cy="56" r="52" fill="#1DB8A6" clipPath="url(#right-half)" />

            <line x1="56" y1="4" x2="56" y2="108" stroke="white" strokeWidth="2.5" strokeDasharray="4 3" strokeLinecap="round" opacity="0.6" />

            <text x="56" y="70" textAnchor="middle" fontSize="44" fontWeight="700" fontFamily="system-ui" fill="white" opacity="0.92">$</text>

            <circle cx="56" cy="56" r="52" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.15" />
          </svg>

          <div
            className="absolute inset-0 rounded-full scale-110 opacity-25 blur-2xl"
            style={{ background: "radial-gradient(circle, #4B9FE0 0%, #1DB8A6 100%)" }}
          />
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-[42px] font-bold tracking-tight" style={{ fontFamily: "system-ui", color: "#EEF4FB" }}>
            Split<span style={{ color: "#2BBFA4" }}>Easy</span>
          </span>
          <span className="text-[#5A7F9E] text-sm tracking-wide">Split expenses. No drama.</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        <div className="text-[#2A3F54] text-[10px] uppercase tracking-widest">Design Notes</div>
        <div className="bg-[#0D1E33] rounded-xl p-4 text-[#5A8AAE] text-xs leading-relaxed w-full border border-[#1A3045]">
          <p>✦ Split coin = literal visual metaphor for bill splitting</p>
          <p className="mt-1">✦ Dual-tone hemisphere — blue / teal mirrors the brand palette</p>
          <p className="mt-1">✦ Dashed centre line reinforces the "divide" action</p>
          <p className="mt-1">✦ Circular — feels premium, fintech-native (Revolut, Wise)</p>
        </div>
      </div>
    </div>
  );
}
