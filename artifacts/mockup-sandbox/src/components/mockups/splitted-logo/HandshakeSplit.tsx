import { useId, useState } from "react";

import "./_exploration.css";

type Surface = "light" | "ink";

function HandshakeMark({
  size = 170,
  monochrome = false,
  tile = false,
}: {
  size?: number;
  monochrome?: boolean;
  tile?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const blue = monochrome ? "#fffdfa" : "#77b8e9";
  const coral = monochrome ? "#fffdfa" : "#ec866f";
  const center = monochrome ? "#10283c" : "#fffdfa";
  return (
    <svg aria-label="Handshake Split mark" role="img" width={size} height={size} viewBox="0 0 180 180" fill="none">
      {tile && <rect width="180" height="180" rx="49" fill={monochrome ? "#10283c" : "#d9f0ff"} />}
      <defs>
        <linearGradient id={`${id}-left`} x1="34" y1="40" x2="95" y2="142" gradientUnits="userSpaceOnUse">
          <stop stopColor={blue} />
          <stop offset="1" stopColor={monochrome ? "#fffdfa" : "#4b9fe0"} />
        </linearGradient>
        <linearGradient id={`${id}-right`} x1="147" y1="39" x2="85" y2="142" gradientUnits="userSpaceOnUse">
          <stop stopColor={coral} />
          <stop offset="1" stopColor={monochrome ? "#fffdfa" : "#d96f62"} />
        </linearGradient>
      </defs>
      <path d="M28 75.5 45 55c7.3-8.7 20.2-10.1 29.7-2.2l19.8 16.4-11.8 13.1-9.5-7.9-9.5 11.2 25.6 23.7c5.8 5.4 5.9 14.5.2 19.9-5.4 5.1-13.8 5.2-19.4.2L39 99.1c-7.3-6.2-11.6-14.5-11-23.6Z" fill={`url(#${id}-left)`} />
      <path d="m152 75.5-17-20.5c-7.3-8.7-20.2-10.1-29.7-2.2L85.5 69.2l11.8 13.1 9.5-7.9 9.5 11.2-25.6 23.7c-5.8 5.4-5.9 14.5-.2 19.9 5.4 5.1 13.8 5.2 19.4.2L141 99.1c7.3-6.2 11.6-14.5 11-23.6Z" fill={`url(#${id}-right)`} />
      <path d="M82.8 80.1 96.5 68l13.6 12.1-13.6 12.1-13.7-12.1Z" fill={center} />
      <path d="M89.4 93.1 77.8 103.5M96.5 98.8l-11.2 10.1M103.6 93.1l11.6 10.4M96.5 98.8 107.7 109" stroke={monochrome ? "#fffdfa" : "#10283c"} strokeWidth="4.2" strokeLinecap="round" />
      <path d="M90 79.9h13" stroke={monochrome ? "#10283c" : "#10283c"} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function HandshakeLockup({ surface }: { surface: Surface }) {
  return (
    <div className="le-wordmark">
      <HandshakeMark size={52} tile />
      <strong style={{ color: surface === "light" ? "#10283c" : "#fffdfa" }}>Splitted</strong>
    </div>
  );
}

export function HandshakeSplit() {
  const [surface, setSurface] = useState<Surface>("light");
  return (
    <main className="logo-exploration le-handshake">
      <div className="le-shell">
        <header className="le-topbar">
          <div className="le-microbrand">
            <HandshakeMark size={24} tile />
            <span>Splitted / identity study 03</span>
          </div>
          <div className="le-toggle" aria-label="Application surface">
            <button type="button" aria-pressed={surface === "light"} onClick={() => setSurface("light")}>Light</button>
            <button type="button" aria-pressed={surface === "ink"} onClick={() => setSurface("ink")}>Ink</button>
          </div>
        </header>

        <section className="le-hero" aria-labelledby="handshake-title">
          <div>
            <div className="le-label">Concept 3 / The Handshake Split</div>
            <h1 id="handshake-title">Settle up.<br /><em>Stay close.</em></h1>
            <p className="le-hero-copy">A quiet, modern handshake gives the brand its social signal first. The seam at the center says the bill is shared, not the relationship.</p>
          </div>
          <div className="le-note">
            <div className="le-mono">Hypothesis / trust before math</div>
            <p>The best settlement is the one that feels like a small act of looking out for each other.</p>
          </div>
        </section>

        <section className="le-board" aria-label="Primary Handshake Split mark">
          <article className="le-card le-card--ink">
            <div className="le-card-head le-row">
              <div>
                <div className="le-label">Primary mark</div>
                <h2>Two hands, one seam</h2>
              </div>
              <span className="le-status le-status--accent">Social signal</span>
            </div>
            <div className="le-stage le-stage--gradient">
              <HandshakeMark size={266} tile />
            </div>
            <div className="le-card-foot">
              <div className="le-mono">Visual behavior</div>
              <p>Reduced hands meet around a single center fold. The forms overlap enough to feel connected, not like two icons placed side by side.</p>
            </div>
          </article>
          <article className="le-card le-card--blue">
            <div className="le-card-head">
              <div className="le-label">Wordmark connection</div>
              <h2>Warmth, without clip art</h2>
            </div>
            <div className="le-stage le-stage--paper">
              <HandshakeLockup surface="light" />
            </div>
            <div className="le-card-foot">
              <div className="le-mono">Lockup gesture</div>
              <p>The mark stays compact beside the name; the gradient does the emotional work while the silhouette remains simple.</p>
            </div>
          </article>
        </section>

        <section className="le-lockups" aria-label="Light and dark logo lockups">
          <article className="le-card le-lockup">
            <div className="le-mono">Light surface / primary</div>
            <HandshakeLockup surface="light" />
            <p className="le-tagline">Keep the friendship, split the bill</p>
          </article>
          <article className="le-card le-card--ink le-lockup">
            <div className="le-mono">Deep ink / reverse</div>
            <HandshakeLockup surface="ink" />
            <p className="le-tagline">Keep the friendship, split the bill</p>
          </article>
        </section>

        <section className="le-section" aria-labelledby="handshake-test-title">
          <div className="le-section-head">
            <div>
              <div className="le-label">Field test / silhouette discipline</div>
              <h2 id="handshake-test-title">Human at every distance.</h2>
            </div>
            <p>The center seam becomes quieter as the mark shrinks, leaving the meeting gesture as the recognition cue.</p>
          </div>
          <div className="le-test-grid">
            <article className="le-card le-test le-card--blue">
              <div className="le-mono">App icon / size test</div>
              <div className="le-size-row">
                {[64, 40, 32, 24].map((size) => (
                  <div className="le-size-cell" key={size}>
                    <HandshakeMark size={size} tile />
                    <span>{size}px</span>
                  </div>
                ))}
              </div>
              <p className="le-copy">At 32px, the joined center reads before the finger-like notches do — a good guard against illustration detail.</p>
            </article>
            <article className="le-card le-card--ink le-test">
              <div className="le-mono">One-color / production check</div>
              <div className="le-monochrome"><HandshakeMark size={92} monochrome tile /></div>
              <p className="le-copy">The mark holds as a single silhouette, but the overlap must remain generous in production.</p>
            </article>
          </div>
        </section>

        <section className="le-rationale" aria-label="Design rationale">
          <article>
            <div className="le-label">Design hypothesis</div>
            <h3>Lead with the social promise behind the product.</h3>
            <p>A simplified handshake says “we are in this together” before the viewer parses any accounting meaning. The controlled blue-to-coral transition makes two parties feel like one exchange.</p>
          </article>
          <article>
            <div className="le-label">Trade-off</div>
            <h3>Trust grows; icon distinctiveness needs discipline.</h3>
            <p>Human warmth is stronger here than in a geometric split, but handshake references are familiar territory. The unusual center seam and compact silhouette need to stay consistent to become ownable.</p>
          </article>
        </section>

        <footer className="le-footer">
          <p>Splitted identity exploration / handshake split</p>
          <span className="le-mono">Gesture first · gradient restrained</span>
        </footer>
      </div>
    </main>
  );
}

export default HandshakeSplit;