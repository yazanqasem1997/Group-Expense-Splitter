const S_PATH =
  "M133 50c-12-12-27-18-46-18-26 0-46 12-46 31 0 17 12 27 36 34l17 5c10 3 15 7 15 12 0 7-8 11-22 11-17 0-29-6-40-18l-17 17c15 18 34 26 58 26 29 0 49-13 49-35 0-18-12-29-37-36l-17-5c-10-3-14-6-14-11 0-5 7-8 18-8 13 0 24 4 34 14L133 50Z";
const DETAIL_WITH_CENTER_BREAK =
  "M91 40c-7 11-9 21-9 30M82 73c1 8 4 14 8 20M91 112c0 11 2 19 8 28";

function Mark() {
  return (
    <svg width="108" height="108" viewBox="15 20 145 150" aria-label="Split Mate mark with center break">
      <defs>
        <clipPath id="center-break-split-mark-clip">
          <path d={S_PATH} />
        </clipPath>
      </defs>
      <rect x="31" y="25" width="60" height="135" fill="#3D4148" clipPath="url(#center-break-split-mark-clip)" />
      <rect x="90" y="25" width="64" height="135" fill="#D2D5D9" clipPath="url(#center-break-split-mark-clip)" />
      <path
        d={DETAIL_WITH_CENTER_BREAK}
        stroke="#F7F7F8"
        strokeWidth="6"
        strokeLinecap="round"
        clipPath="url(#center-break-split-mark-clip)"
      />
      <path d={S_PATH} fill="none" stroke="#101113" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

export function CenterBreakSplitMateMark() {
  return (
    <main
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "#1B1D21",
        color: "#F7F7F8",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>Center break</div>
      <div
        style={{
          width: 144,
          height: 144,
          borderRadius: 36,
          background: "#F1F2F3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Mark />
      </div>
    </main>
  );
}