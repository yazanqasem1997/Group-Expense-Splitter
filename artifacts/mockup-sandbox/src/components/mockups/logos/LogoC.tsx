export function LogoC() {
  return (
    <div className="min-h-screen bg-[#050C1B] flex flex-col items-center justify-center gap-10 p-8">
      <p className="text-[#3D5A78] text-xs font-mono uppercase tracking-widest mb-2">Concept C — S Monogram</p>

      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <div
            className="w-28 h-28 rounded-[28px] flex items-center justify-center"
            style={{ background: "#0D1E33", border: "1.5px solid rgba(75,159,224,0.2)" }}
          >
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
              <defs>
                <linearGradient id="top-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#4B9FE0" />
                  <stop offset="100%" stopColor="#68B5E8" />
                </linearGradient>
                <linearGradient id="bot-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1DB8A6" />
                  <stop offset="100%" stopColor="#2BBFA4" />
                </linearGradient>
                <clipPath id="top-clip">
                  <rect x="0" y="0" width="72" height="36" />
                </clipPath>
                <clipPath id="bot-clip">
                  <rect x="0" y="36" width="72" height="36" />
                </clipPath>
              </defs>

              <text x="36" y="58" textAnchor="middle" fontSize="68" fontWeight="900" fontFamily="system-ui" fill="url(#top-grad)" clipPath="url(#top-clip)">S</text>
              <text x="36" y="58" textAnchor="middle" fontSize="68" fontWeight="900" fontFamily="system-ui" fill="url(#bot-grad)" clipPath="url(#bot-clip)">S</text>

              <line x1="12" y1="36" x2="60" y2="36" stroke="#050C1B" strokeWidth="3" />

              <line x1="10" y1="32" x2="62" y2="40" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>

          <div
            className="absolute inset-0 rounded-[28px] scale-125 opacity-20 blur-xl"
            style={{ background: "linear-gradient(135deg, #4B9FE0, #1DB8A6)" }}
          />
        </div>

        <div className="flex flex-col items-center gap-1">
          <span
            className="text-[42px] font-bold tracking-tight"
            style={{ fontFamily: "system-ui" }}
          >
            <span style={{ color: "#4B9FE0" }}>Split</span>
            <span style={{ color: "#1DB8A6" }}>Easy</span>
          </span>
          <span className="text-[#5A7F9E] text-sm tracking-wide">Split expenses. No drama.</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        <div className="text-[#2A3F54] text-[10px] uppercase tracking-widest">Design Notes</div>
        <div className="bg-[#0D1E33] rounded-xl p-4 text-[#5A8AAE] text-xs leading-relaxed w-full border border-[#1A3045]">
          <p>✦ S monogram — premium, wordmark-ready, highly recognizable</p>
          <p className="mt-1">✦ Bi-colour split on letter body = "split" encoded in the icon itself</p>
          <p className="mt-1">✦ Dark container badge fits iOS Springboard naturally</p>
          <p className="mt-1">✦ Wordmark mirrors the dual-tone: Split (blue) + Easy (teal)</p>
        </div>
      </div>
    </div>
  );
}
