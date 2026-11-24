import { useId, useState } from "react";

import "./_exploration.css";

type Surface = "light" | "ink";

function SMark({
  size = 170,
  monochrome = false,
  tile = false,
}: {
  size?: number;
  monochrome?: boolean;
  tile?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const left = monochrome ? "#fffdfa" : "#52664c";
  const right = monochrome ? "#fffdfa" : "#b8acd8";
  const center = monochrome ? "#232b31" : "#f5f4ef";
  return (
    <svg aria-label="S Split mark" role="img" width={size} height={size} viewBox="0 0 180 180" fill="none">
      {tile && <rect width="180" height="180" rx="49" fill={monochrome ? "#232b31" : "#e8e4f2"} />}
      <defs>
        <clipPath id={`${id}-top`}>
          <path d="M133 50c-12-12-27-18-46-18-26 0-46 12-46 31 0 17 12 27 36 34l17 5c10 3 15 7 15 12 0 7-8 11-22 11-17 0-29-6-40-18l-17 17c15 18 34 26 58 26 29 0 49-13 49-35 0-18-12-29-37-36l-17-5c-10-3-14-6-14-11 0-5 7-8 18-8 13 0 24 4 34 14L133 50Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-top)`}>
        <rect x="31" y="25" width="60" height="135" fill={left} />
        <rect x="90" y="25" width="64" height="135" fill={right} />
      </g>
      <path d="M133 50c-12-12-27-18-46-18-26 0-46 12-46 31 0 17 12 27 36 34l17 5c10 3 15 7 15 12 0 7-8 11-22 11-17 0-29-6-40-18l-17 17c15 18 34 26 58 26 29 0 49-13 49-35 0-18-12-29-37-36l-17-5c-10-3-14-6-14-11 0-5 7-8 18-8 13 0 24 4 34 14L133 50Z" stroke={monochrome ? "#fffdfa" : "#232b31"} strokeWidth="3" strokeLinejoin="round" />
      <path d="M91 34c-8 13-10 27-10 39M91 108c0 16 3 27 10 38" stroke={center} strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

function SLockup({ surface }: { surface: Surface }) {
  return (
    <div className="le-wordmark">
      <SMark size={52} tile />
      <strong style={{ color: surface === "light" ? "#232b31" : "#fffdfa" }}>Splitted</strong>
    </div>
  );
}

export function SSplit() {
  const [surface, setSurface] = useState<Surface>("light");
  return (
    <main className="logo-exploration le-s-split">
      <div className="le-shell">
        <header className="le-topbar">
          <div className="le-microbrand">
            <SMark size={24} tile />
            <span>Splitted / identity study 04</span>
          </div>
          <div className="le-toggle" aria-label="Application surface">
            <button type="button" aria-pressed={surface === "light"} onClick={() => setSurface("light")}>Light</button>
            <button type="button" aria-pressed={surface === "ink"} onClick={() => setSurface("ink")}>Ink</button>
          </div>
        </header>

        <section className="le-hero" aria-labelledby="s-title">
          <div>
            <div className="le-label">Concept 6 / The S Split</div>
            <h1 id="s-title">Own the <em>name.</em></h1>
            <p className="le-hero-copy">A custom S makes Splitted memorable before the viewer reads a word. Two interlocking ribbons turn the first letter into a compact signature for the app icon and the wordmark.</p>
          </div>
          <div className="le-note">
            <div className="le-mono">Hypothesis / name-led memory</div>
            <p>The strongest mark may already be hiding in the first letter people say out loud.</p>
          </div>
        </section>

        <section className="le-board" aria-label="Primary S Split mark">
          <article className="le-card le-card--ink">
            <div className="le-card-head le-row">
              <div>
                <div className="le-label">Primary mark</div>
                <h2>One S, two contributors</h2>
              </div>
              <span className="le-status le-status--accent">Name-led</span>
            </div>
            <div className="le-stage le-stage--gradient">
              <SMark size={268} tile />
            </div>
            <div className="le-card-foot">
              <div className="le-mono">Visual behavior</div>
              <p>The two colored ribbons share one typographic skeleton. Their seam is a split, but the letterform keeps pulling the eye through.</p>
            </div>
          </article>
          <article className="le-card le-card--blue">
            <div className="le-card-head">
              <div className="le-label">Wordmark connection</div>
              <h2>Letterform as signature</h2>
            </div>
            <div className="le-stage le-stage--paper">
              <SLockup surface="light" />
            </div>
            <div className="le-card-foot">
              <div className="le-mono">Lockup gesture</div>
              <p>The S repeats at both ends of the identity: a compact mark outside the name, a remembered shape inside it.</p>
            </div>
          </article>
        </section>

        <section className="le-lockups" aria-label="Light and dark logo lockups">
          <article className="le-card le-lockup">
            <div className="le-mono">Light surface / primary</div>
            <SLockup surface="light" />
            <p className="le-tagline">Keep the friendship, split the bill</p>
          </article>
          <article className="le-card le-card--ink le-lockup">
            <div className="le-mono">Deep ink / reverse</div>
            <SLockup surface="ink" />
            <p className="le-tagline">Keep the friendship, split the bill</p>
          </article>
        </section>

        <section className="le-section" aria-labelledby="s-test-title">
          <div className="le-section-head">
            <div>
              <div className="le-label">Field test / complexity watch</div>
              <h2 id="s-test-title">Memorable, if the seam stays calm.</h2>
            </div>
            <p>The S is the most ownable direction, so this test deliberately asks where its split becomes visual noise.</p>
          </div>
          <div className="le-test-grid">
            <article className="le-card le-test le-card--blue">
              <div className="le-mono">App icon / size test</div>
              <div className="le-size-row">
                {[64, 40, 32, 24].map((size) => (
                  <div className="le-size-cell" key={size}>
                    <SMark size={size} tile />
                    <span>{size}px</span>
                  </div>
                ))}
              </div>
              <p className="le-copy">At 32px, the outer S reads reliably. Below that, the interior seam should be simplified rather than preserved at all costs.</p>
            </article>
            <article className="le-card le-card--ink le-test">
              <div className="le-mono">One-color / production check</div>
              <div className="le-monochrome"><SMark size={92} monochrome tile /></div>
              <p className="le-copy">The strongest fallback is a single solid S with the center cut kept open; color is an enhancer, not the recognition mechanism.</p>
            </article>
          </div>
        </section>

        <section className="le-rationale" aria-label="Design rationale">
          <article>
            <div className="le-label">Design hypothesis</div>
            <h3>Make the product name do more of the remembering.</h3>
            <p>A custom split-S can become the shorthand people recognize in an app switcher or group invite. It is less literal about splitting and more distinctive as a brand asset.</p>
          </article>
          <article>
            <div className="le-label">Trade-off</div>
            <h3>Distinctiveness rises with small-size risk.</h3>
            <p>This direction has the clearest path to a unique wordmark, but it asks for stricter construction rules. If the interior seam gets busy at 24px, simplify it rather than sacrificing the outer letter silhouette.</p>
          </article>
        </section>

        <footer className="le-footer">
          <p>Splitted identity exploration / S split</p>
          <span className="le-mono">Single-color first · gradient optional</span>
        </footer>
      </div>
    </main>
  );
}

export default SSplit;