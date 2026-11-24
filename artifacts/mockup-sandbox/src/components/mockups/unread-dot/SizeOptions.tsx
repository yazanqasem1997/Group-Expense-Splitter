const BLUE = "#1D5FA8";
const DOT_COLOR = "#E5353F";

type Option = {
  label: string;
  size: number;
  border: number;
};

const OPTIONS: Option[] = [
  { label: "3px", size: 3, border: 0 },
  { label: "4px", size: 4, border: 0.75 },
  { label: "5px", size: 5, border: 1 },
  { label: "6px (current)", size: 6, border: 1 },
  { label: "8px (old)", size: 8, border: 1.5 },
];

function ActivityIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M2 12h4l2.5-7 5 14L16.5 9 18 12h4"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TabPreview({ label, size, border }: Option) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="flex flex-col items-center justify-center rounded-2xl"
        style={{ backgroundColor: BLUE, width: 92, height: 92 }}
      >
        <div className="relative">
          <ActivityIcon />
          <div
            className="absolute rounded-full"
            style={{
              width: size,
              height: size,
              top: -size * 0.25,
              right: -size * 0.4,
              backgroundColor: DOT_COLOR,
              border: border ? `${border}px solid #fff` : undefined,
            }}
          />
        </div>
        <span className="mt-1.5 text-[10px] font-medium text-white/90">
          Activity
        </span>
      </div>
      <span className="text-xs font-semibold text-slate-600">{label}</span>
    </div>
  );
}

export function SizeOptions() {
  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center gap-8 p-10">
      <div className="text-center">
        <h1 className="text-lg font-bold text-slate-900">
          Unread dot — size options
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Same red, placed the same way — only the diameter changes.
        </p>
      </div>
      <div className="flex flex-wrap items-start justify-center gap-10">
        {OPTIONS.map((opt) => (
          <TabPreview key={opt.label} {...opt} />
        ))}
      </div>
    </div>
  );
}
