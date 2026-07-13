export function LogoD() {
  return (
    <div className="min-h-screen bg-[#050C1B] flex flex-col items-center justify-center gap-10 p-8">
      <p className="text-[#3D5A78] text-xs font-mono uppercase tracking-widest mb-2">Concept D — Fork & Split</p>

      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <div
            className="w-28 h-28 rounded-[28px] flex items-center justify-center"
            style={{
              background: "linear-gradient(145deg, #0D2040 0%, #0A1830 100%)",
              border: "1.5px solid rgba(75,159,224,0.18)",
              boxShadow: "0 12px 40px rgba(10,20,40,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <defs>
                <linearGradient id="stem-grad" x1="32" y1="48" x2="32" y2="24" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#8BA3BE" />
                  <stop offset="1" stopColor="#4B9FE0" />
                </linearGradient>
                <linearGradient id="left-branch" x1="32" y1="24" x2="14" y2="8" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#4B9FE0" />
                  <stop offset="1" stopColor="#2E8CD6" />
                </linearGradient>
                <linearGradient id="right-branch" x1="32" y1="24" x2="50" y2="8" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#1DB8A6" />
                  <stop offset="1" stopColor="#16A896" />
                </linearGradient>
              </defs>

              <path d="M32 48 L32 26" stroke="url(#stem-grad)" strokeWidth="4.5" strokeLinecap="round" />

              <path d="M32 26 Q32 20 14 10" stroke="url(#left-branch)" strokeWidth="4.5" strokeLinecap="round" fill="none" />
              <path d="M32 26 Q32 20 50 10" stroke="url(#right-branch)" strokeWidth="4.5" strokeLinecap="round" fill="none" />

              <circle cx="14" cy="9" r="5.5" fill="#4B9FE0" />
              <circle cx="50" cy="9" r="5.5" fill="#1DB8A6" />

              <circle cx="32" cy="50" r="4" fill="#4B6A8A" />

              <circle cx="32" cy="26" r="3" fill="#6B8FAA" opacity="0.7" />
            </svg>
          </div>

          <div
            className="absolute inset-0 rounded-[28px] scale-110 opacity-15 blur-xl"
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
          <p>✦ Fork/branch = most intuitive "splitting" metaphor</p>
          <p className="mt-1">✦ Blue branch → you, Teal branch → them (two parties splitting)</p>
          <p className="mt-1">✦ Minimal lines — scales perfectly to notification icon size</p>
          <p className="mt-1">✦ Dark badge has depth via gradient + inner highlight</p>
        </div>
      </div>
    </div>
  );
}
