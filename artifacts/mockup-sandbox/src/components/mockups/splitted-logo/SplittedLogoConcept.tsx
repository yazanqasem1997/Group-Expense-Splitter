import { useId, useState } from "react";

import "./_group.css";

type Surface = "light" | "ink";

function CurrentMark({
  size = 72,
  detail = "#FFFFFF",
  label = "Current Splitted connected-orbit mark",
}: {
  size?: number;
  detail?: string;
  label?: string;
}) {
  const gradientId = useId().replace(/:/g, "");

  return (
    <svg
      aria-label={label}
      role="img"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
    >
      <defs>
        <linearGradient id={`${gradientId}-left`} x1="8" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#A9D9F8" />
          <stop offset="1" stopColor="#4B9FE0" />
        </linearGradient>
        <linearGradient id={`${gradientId}-right`} x1="56" y1="8" x2="10" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4B9FE0" />
          <stop offset="1" stopColor="#A9D9F8" />
        </linearGradient>
      </defs>
      <path
        d="M12 18 C20 10 29 12 32 24 C35 12 44 10 52 18 C59 25 55 36 46 38 C40 39 36 35 32 30 C28 35 24 39 18 38 C9 36 5 25 12 18Z"
        fill={`url(#${gradientId}-left)`}
      />
      <path
        d="M12 46 C20 54 29 52 32 40 C35 52 44 54 52 46 C59 39 55 28 46 26 C40 25 36 29 32 34 C28 29 24 25 18 26 C9 28 5 39 12 46Z"
        fill={`url(#${gradientId}-right)`}
        opacity="0.92"
      />
      <circle cx="32" cy="32" r="5" fill={detail} />
      <circle cx="32" cy="32" r="2.2" fill="#4B9FE0" />
    </svg>
  );
}

function SplitMark({
  size = 96,
  surface = "ink",
  label = "Splitted split-form mark",
}: {
  size?: number;
  surface?: Surface;
  label?: string;
}) {
  const isLight = surface === "light";
  const background = isLight ? "#D9F0FF" : "#081B33";
  const center = isLight ? "#FFFDF9" : "#081B33";

  return (
    <svg
      aria-label={label}
      role="img"
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
    >
      <rect x="2" y="2" width="92" height="92" rx="27" fill={background} />
      <path
        d="M25.5 65.2C18.2 61.6 14.8 53.2 17.7 45.6C20 39.6 25.8 35.9 32.2 35.9H47.9V48.1H34.8C31.5 48.1 29.4 51.6 31 54.5C32.1 56.4 34.1 57.5 36.3 57.5H45.1C50.9 57.5 55.1 62.1 54.1 67.6C53.4 71.4 50 74.1 46.1 74.1H35.6C32.1 74.1 28.5 71.9 25.5 65.2Z"
        fill="#A9D9F8"
      />
      <path
        d="M70.5 30.8C77.8 34.4 81.2 42.8 78.3 50.4C76 56.4 70.2 60.1 63.8 60.1H48.1V47.9H61.2C64.5 47.9 66.6 44.4 65 41.5C63.9 39.6 61.9 38.5 59.7 38.5H50.9C45.1 38.5 40.9 33.9 41.9 28.4C42.6 24.6 46 21.9 49.9 21.9H60.4C63.9 21.9 67.5 24.1 70.5 30.8Z"
        fill="#F3A08B"
      />
      <path
        d="M46.1 21.9H50.9C46.1 26.9 44.3 34.2 48.1 47.9H47.9C44.1 34.2 45.9 26.9 46.1 21.9Z"
        fill={center}
      />
      <path
        d="M49.9 74.1H45.1C49.9 69.1 51.7 61.8 47.9 48.1H48.1C51.9 61.8 50.1 69.1 49.9 74.1Z"
        fill={center}
      />
    </svg>
  );
}

function MarkOnTile({
  size,
  surface = "ink",
}: {
  size: number;
  surface?: Surface;
}) {
  return <SplitMark size={size} surface={surface} />;
}

function Wordmark({
  surface,
  compact = false,
}: {
  surface: Surface;
  compact?: boolean;
}) {
  const isLight = surface === "light";
  return (
    <div className="splitted-logo-preview__wordmark">
      <SplitMark size={compact ? 40 : 48} surface={surface} label="Splitted split-form wordmark icon" />
      <strong style={{ color: isLight ? "#081B33" : undefined }}>Splitted</strong>
    </div>
  );
}

export function SplittedLogoConcept() {
  const [surface, setSurface] = useState<Surface>("light");
  const activeSurface = surface === "light" ? "light surface" : "deep ink surface";

  return (
    <main className="splitted-logo-preview">
      <div className="splitted-logo-preview__shell">
        <header className="splitted-logo-preview__topbar">
          <div className="splitted-logo-preview__microbrand">
            <SplitMark size={22} surface="ink" label="Splitted" />
            <span>Splitted / identity study 01</span>
          </div>
          <div className="splitted-logo-preview__surface-toggle" aria-label="Preview surface">
            <button
              type="button"
              aria-pressed={surface === "light"}
              onClick={() => setSurface("light")}
            >
              Light
            </button>
            <button
              type="button"
              aria-pressed={surface === "ink"}
              onClick={() => setSurface("ink")}
            >
              Ink
            </button>
          </div>
        </header>

        <section className="splitted-logo-preview__hero" aria-labelledby="concept-title">
          <div>
            <div className="splitted-logo-preview__eyebrow">A mark for the shared part</div>
            <h1 id="concept-title">
              Two sides.
              <br />
              One <em>fair</em> finish.
            </h1>
            <p className="splitted-logo-preview__hero-copy">
              A warmer, clearer direction for a utility that keeps the social part of settling up intact.
            </p>
          </div>
          <div className="splitted-logo-preview__hero-note">
            <div className="splitted-logo-preview__mono">Direction / split-form</div>
            <p>
              Two distinct contributions curve toward the same center — a small visual promise that nobody is
              carrying the whole thing alone.
            </p>
          </div>
        </section>

        <section className="splitted-logo-preview__compare" aria-labelledby="comparison-title">
          <article className="splitted-logo-preview__panel">
            <div className="splitted-logo-preview__panel-head">
              <div>
                <div className="splitted-logo-preview__eyebrow">01 / baseline</div>
                <h2 id="comparison-title">Current mark</h2>
              </div>
              <span className="splitted-logo-preview__status">Connected orbit</span>
            </div>
            <div className="splitted-logo-preview__logo-stage">
              <CurrentMark size={170} />
            </div>
            <div className="splitted-logo-preview__panel-footer">
              <div className="splitted-logo-preview__mono">What it says</div>
              <p>Friendly, connected, and already recognizably Splitted. The orbit language is soft but slightly abstract at small sizes.</p>
            </div>
          </article>

          <article className="splitted-logo-preview__panel splitted-logo-preview__panel--new">
            <div className="splitted-logo-preview__panel-head">
              <div>
                <div className="splitted-logo-preview__eyebrow">02 / proposed direction</div>
                <h2>Split-form mark</h2>
              </div>
              <span className="splitted-logo-preview__status splitted-logo-preview__status--new">Recommended</span>
            </div>
            <div className="splitted-logo-preview__logo-stage splitted-logo-preview__logo-stage--new">
              <SplitMark size={170} surface="ink" />
            </div>
            <div className="splitted-logo-preview__panel-footer">
              <div className="splitted-logo-preview__new-meaning">
                <span>↗</span>
                Two people, one shared outcome
              </div>
              <p>Two counterbalanced forms make the split legible, while the quiet center creates a memorable shared point.</p>
            </div>
          </article>
        </section>

        <section className="splitted-logo-preview__lockup" aria-label="Wordmark applications">
          <article className="splitted-logo-preview__lockup-card">
            <div className="splitted-logo-preview__mono">Light lockup / primary</div>
            <Wordmark surface="light" />
            <p className="splitted-logo-preview__tagline">Keep the friendship, split the bill</p>
          </article>
          <article className="splitted-logo-preview__lockup-card splitted-logo-preview__lockup-card--ink">
            <div>
              <div className="splitted-logo-preview__mono">Ink lockup / reverse</div>
              <Wordmark surface="ink" />
              <p className="splitted-logo-preview__tagline">Keep the friendship, split the bill</p>
            </div>
            <div className="splitted-logo-preview__alignment">
              <div className="splitted-logo-preview__mono">Tone of voice</div>
              <p>Direct about money. Gentle about people. The mark carries that same balance.</p>
            </div>
          </article>
        </section>

        <section className="splitted-logo-preview__section" aria-labelledby="applications-title">
          <div className="splitted-logo-preview__section-header">
            <div>
              <div className="splitted-logo-preview__eyebrow">Field test / 03</div>
              <h2 id="applications-title">Made to travel.</h2>
            </div>
            <p>Real touchpoints, not product screens — enough range to check the mark’s behavior in the world.</p>
          </div>
          <div className="splitted-logo-preview__applications">
            <article className="splitted-logo-preview__application">
              <div>
                <div className="splitted-logo-preview__mono">App icon / scale test</div>
                <h3>Clear at a glance.</h3>
              </div>
              <div className="splitted-logo-preview__icon-row" aria-label="Icon scale samples">
                <div>
                  <MarkOnTile size={64} />
                  <span className="splitted-logo-preview__size-label">64 px</span>
                </div>
                <div>
                  <MarkOnTile size={40} />
                  <span className="splitted-logo-preview__size-label">40 px</span>
                </div>
                <div>
                  <MarkOnTile size={24} />
                  <span className="splitted-logo-preview__size-label">24 px</span>
                </div>
              </div>
              <p className="splitted-logo-preview__application-copy">The two color fields stay distinct without relying on a fine detail.</p>
            </article>

            <article className="splitted-logo-preview__application splitted-logo-preview__application--blue">
              <div>
                <div className="splitted-logo-preview__mono">Shared link / sender</div>
                <h3>Friendly, not fluffy.</h3>
              </div>
              <div className="splitted-logo-preview__share-tile">
                <span className="splitted-logo-preview__avatar">AM</span>
                <SplitMark size={29} surface="ink" />
                <div className="splitted-logo-preview__share-copy">
                  <strong>Alex added an expense</strong>
                  <span>Friday dinner · shared with 4</span>
                </div>
              </div>
              <p className="splitted-logo-preview__application-copy">The mark behaves like a social signature beside a real person.</p>
            </article>

            <article className="splitted-logo-preview__application splitted-logo-preview__application--ink">
              <div>
                <div className="splitted-logo-preview__mono">Export footer / trust</div>
                <h3>Quietly credible.</h3>
              </div>
              <div className="splitted-logo-preview__receipt">
                <div className="splitted-logo-preview__receipt-row">
                  <strong>Splitted</strong>
                  <span>Shared expenses</span>
                </div>
              </div>
              <p className="splitted-logo-preview__application-copy">Deep ink carries the practical money context; the peach half keeps it human.</p>
            </article>
          </div>
        </section>

        <section className="splitted-logo-preview__section" aria-labelledby="principles-title">
          <div className="splitted-logo-preview__section-header">
            <div>
              <div className="splitted-logo-preview__eyebrow">Why this holds together</div>
              <h2 id="principles-title">A little more human.</h2>
            </div>
            <p>Built from the existing blue identity, with one deliberate note of warmth to signal the social layer.</p>
          </div>
          <div className="splitted-logo-preview__principles">
            <div className="splitted-logo-preview__principle">
              <span className="splitted-logo-preview__principle-number">01</span>
              <div>
                <h3>Split, not severed</h3>
                <p>Two forms separate clearly, but the shared center keeps the relationship intact.</p>
              </div>
            </div>
            <div className="splitted-logo-preview__principle">
              <span className="splitted-logo-preview__principle-number">02</span>
              <div>
                <h3>Money with a pulse</h3>
                <p>Midnight gives the mark the trust it needs; peach makes it feel less transactional.</p>
              </div>
            </div>
            <div className="splitted-logo-preview__principle">
              <span className="splitted-logo-preview__principle-number">03</span>
              <div>
                <h3>One strong silhouette</h3>
                <p>At 24 px, the paired blocks still read as one recognizable, ownable shape.</p>
              </div>
            </div>
          </div>
        </section>

        <footer className="splitted-logo-preview__footer">
          <p>Splitted identity study · proposal for review</p>
          <span className="splitted-logo-preview__mono">Previewing on {activeSurface}</span>
        </footer>
      </div>
    </main>
  );
}

export default SplittedLogoConcept;