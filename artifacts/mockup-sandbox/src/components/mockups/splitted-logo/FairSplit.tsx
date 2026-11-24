import { useId, useState } from "react";

import "./_exploration.css";

type Surface = "light" | "ink";

function FairMark({
  size = 160,
  monochrome = false,
  tile = false,
  className = "",
}: {
  size?: number;
  monochrome?: boolean;
  tile?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const left = monochrome ? "#10283c" : "#4b9fe0";
  const right = monochrome ? "#10283c" : "#ec866f";
  const seam = monochrome ? "#fffdfa" : "#fffdfa";
  return (
    <svg
      className={className}
      aria-label="Fair Split circle mark"
      role="img"
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
    >
      {tile && <rect width="160" height="160" rx="43" fill={monochrome ? "#10283c" : "#d9f0ff"} />}
      <defs>
        <clipPath id={`${id}-circle`}>
          <circle cx="80" cy="80" r="55" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-circle)`}>
        <rect x="25" y="25" width="55" height="110" fill={left} />
        <rect x="80" y="25" width="55" height="110" fill={right} />
      </g>
      <circle cx="80" cy="80" r="55" stroke={monochrome ? "#fffdfa" : "#10283c"} strokeWidth="3" />
      <path d="M80 25V135" stroke={seam} strokeWidth="5" />
      <path d="M80 19V25M80 135V141" stroke={monochrome ? "#fffdfa" : "#10283c"} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function FairLockup({ surface }: { surface: Surface }) {
  const ink = surface === "light" ? "#10283c" : "#fffdfa";
  return (
    <div className="le-wordmark">
      <FairMark size={52} tile={false} />
      <span className="le-fair-lockup-line" aria-hidden="true" />
      <strong style={{ color: ink }}>Splitted</strong>
    </div>
  );
}

export function FairSplit() {
  const [surface, setSurface] = useState<Surface>("light");
  return (
    <main className="logo-exploration le-fair">
      <div className="le-shell">
        <header className="le-topbar">
          <div className="le-microbrand">
            <FairMark size={24} tile />
            <span>Splitted / identity study 02</span>
          </div>
          <div className="le-toggle" aria-label="Application surface">
            <button type="button" aria-pressed={surface === "light"} onClick={() => setSurface("light")}>Light</button>
            <button type="button" aria-pressed={surface === "ink"} onClick={() => setSurface("ink")}>Ink</button>
          </div>
        </header>

        <section className="le-hero" aria-labelledby="fair-title">
          <div>
            <div className="le-label">Concept 1 / The Fair Split</div>
            <h1 id="fair-title">Make the <em>balance</em> visible.</h1>
            <p className="le-hero-copy">A precise, two-part mark that turns equal contribution into an immediate visual signal — clear enough for an app icon, warm enough for a group chat.</p>
          </div>
          <div className="le-note">
            <div className="le-mono">Hypothesis / immediate clarity</div>
            <p>When the bill is divided cleanly, the friendship gets to stay whole.</p>
          </div>
        </section>

        <section className="le-board" aria-label="Primary Fair Split mark">
          <article className="le-card">
            <div className="le-card-head le-row">
              <div>
                <div className="le-label">Primary mark</div>
                <h2>Equal halves, one circle</h2>
              </div>
              <span className="le-status">32px ready</span>
            </div>
            <div className="le-stage le-stage--gradient">
              <FairMark size={250} tile />
            </div>
            <div className="le-card-foot">
              <div className="le-mono">Visual behavior</div>
              <p>The vertical seam is a literal split, while the enclosing circle keeps the outcome shared rather than severed.</p>
            </div>
          </article>
          <article className="le-card le-card--blue">
            <div className="le-card-head">
              <div className="le-label">Wordmark connection</div>
              <h2>Carry the seam forward</h2>
            </div>
            <div className="le-stage le-stage--paper">
              <FairLockup surface="light" />
            </div>
            <div className="le-card-foot">
              <div className="le-mono">Lockup gesture</div>
              <p>A short split line bridges mark and name without turning the wordmark into a diagram.</p>
            </div>
          </article>
        </section>

        <section className="le-lockups" aria-label="Light and dark logo lockups">
          <article className="le-card le-lockup">
            <div className="le-mono">Light surface / primary</div>
            <FairLockup surface="light" />
            <p className="le-tagline">Keep the friendship, split the bill</p>
          </article>
          <article className="le-card le-card--ink le-lockup">
            <div className="le-mono">Deep ink / reverse</div>
            <FairLockup surface="ink" />
            <p className="le-tagline">Keep the friendship, split the bill</p>
          </article>
        </section>

        <section className="le-section" aria-labelledby="fair-test-title">
          <div className="le-section-head">
            <div>
              <div className="le-label">Field test / mark discipline</div>
              <h2 id="fair-test-title">The split survives the shrink.</h2>
            </div>
            <p>Tested as a mark first, then as a system: the same geometry can move from app tile to receipt footer.</p>
          </div>
          <div className="le-test-grid">
            <article className="le-card le-test">
              <div className="le-mono">App icon / size test</div>
              <div className="le-size-row">
                {[64, 40, 32, 24].map((size) => (
                  <div className="le-size-cell" key={size}>
                    <FairMark size={size} tile />
                    <span>{size}px</span>
                  </div>
                ))}
              </div>
              <p className="le-copy">The boundary and two color fields remain obvious before any detail is needed.</p>
            </article>
            <article className="le-card le-card--ink le-test">
              <div className="le-mono">One-color / production check</div>
              <div className="le-monochrome"><FairMark size={92} monochrome tile /></div>
              <p className="le-copy">No color dependency: the seam and outer circle carry the recognition in a single ink.</p>
            </article>
          </div>
        </section>

        <section className="le-rationale" aria-label="Design rationale">
          <article>
            <div className="le-label">Design hypothesis</div>
            <h3>Lead with fairness people can read in one glance.</h3>
            <p>Equal geometry makes Splitted feel clear and trustworthy around money. Teal-blue and coral-orange distinguish two contributors without implying winners and losers.</p>
          </article>
          <article>
            <div className="le-label">Trade-off</div>
            <h3>Clarity wins; emotional nuance is quieter.</h3>
            <p>The circle is exceptionally legible and ownable at small size, but it says “balanced” more quickly than it says “friendship.” The next direction should test whether a human gesture earns more warmth.</p>
          </article>
        </section>

        <footer className="le-footer">
          <p>Splitted identity exploration / fair split</p>
          <span className="le-mono">One-color first · color second</span>
        </footer>
      </div>
    </main>
  );
}

export default FairSplit;