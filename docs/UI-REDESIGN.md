# UI/UX & Creative Direction Overhaul (`#100`)

## 1. Current-State Audit & De-Slop Findings Register

Inspected live production (`https://ion-pumpy-thing.app`), Slice 7 (`http://127.0.0.1:8188/`), and `index.html` across `1280×800`, `390×844`, and `320×640`:

| Finding | Category | Before | Action |
| --- | --- | --- | --- |
| Seven stacked top chrome rows before `<main>` | Information architecture | `54px` uppercase hero + 2-line blurb + label key + step rail + HUD + empty status band + `border-radius: 10px` Sound settings box + 3D/Quality row pushed the game ~340 px down desktop and off the first screen on mobile | Collapse into one `~52px` **Console Bar** (nameplate, sequence rail, compact HUD) and dock `3D / Quality / Sound / Label key` directly beneath the simulation viewport in `.bench-bar` |
| Duplicate legacy `<style>` block (`lines 1–10`) | Legacy accumulation | Conflicting `color-scheme: light` and `border-radius: 10px` `.sound-settings` patched above main stylesheet | Delete legacy `<style>` block; consolidate into one canonical Hallmark-stamped `<style>` |
| Narrow blog-style `.wrap` (`1180px`, `1.25fr / 1fr`) | Spatial composition | Simulation shared ~55% of a narrow container, leaving wide dark gutters on 1440px/1920px screens while forcing vertical scroll at 1280×800 | Expand console frame to `1480px`, `1.55fr / minmax(350px, 440px)` (~62% simulation dominance), capped to `calc(100dvh - 148px)` so viewport + controls + bench bar fit above the fold |
| Two-tone colored wordmark (`Ion Pumpy <span>Thing</span>`) | Generic AI pattern (Hallmark REFLEX 38iii) | Accent cyan split-word heading | Single authoritative phosphor-cream facility nameplate (`h1`, `line-height: 1`) |
| Monospace prose & UI labels | Generic sci-fi trope (Hallmark REFLEX 64) | `.tag`, `.eyebrow`, `.btn.small`, `.padlabels`, `.mlabels`, `.hud` set in monospace | Set all prose, buttons, tags, and axis labels in `IBM Plex Sans`; reserve `IBM Plex Mono` (`tabular-nums`) strictly for numerical measurements, timer, scores, and scale ticks |
| Decorative callout side stripe (`.brief`) | Generic AI card trope (Hallmark WARN 3) | `border-left: 3px solid var(--cold)` | Remove side stripe; let typography hierarchy and 1px machined hairlines carry structure |
| Flat unframed `.reads` grid & default browser sliders | Weak instrumentation | Default OS range inputs and floating definition-list cells | Custom machined range tracks/thumbs, crosshair-gridded coil balance pad, graduated meters, and recessed 1px-hairline instrument readout bay |
| Mobile scroll barrier | Mobile friction | 8 blocks of chrome above the glass jar on `390×844`, burying `PUMP (HOLD)` below the fold | Single-row mobile header + swipeable sequence rail + sticky pinned simulation (`min(75vw, 38vh)`) + docked bottom-sheet console directly below; defer secondary bench settings underneath; gate side-by-side landscape split to `>= 680px` |

## 2. Layout Directions Evaluated

- **Direction A — Experimental Mission Control (Selected core):** Single-row precision command strip, dominant viewport-first simulation on the left (~62% width) with docked optical bench toolbar underneath, and a hairline-structured control & telemetry console docked on the right. Best balance of immediate gameplay, scientific clarity, WCAG 2.2 AA legibility, and zero canvas-label occlusion.
- **Direction B — Full-Bleed Spatial Canvas with Floating Glass Overlays (Rejected for desktop overlays; spatial craft adopted):** Floating translucent overlays obscure edge-anchored scientific labels (`tests/browser-check.mjs`), conflict with the de-slop glassmorphism ban, and hurt mobile GPU frame budgets.
- **Direction C — Editorial Interactive Documentary (Rejected):** Vertical reading flow buries interactive controls beneath prose, reversing the game-first mandate.

## 3. Design System & Tokens

- **Ground & Surface Hierarchy:** `--deep: #070c20` (bench surround), `--sky: #0b1330` (optical aperture), `--panel: #0c132a` (docked console deck), `--panel-inset: #080e22` (recessed telemetry cells & wells), `--line: #23305a` (1px decorative hairlines), `--line-strong: #374a85` (structural bezels), `--line-control: #5c70ad` (WCAG 1.4.11 >= 3.7:1 interactive control tracks & borders).
- **Semantic Colours (preserved unchanged from scientific spec):** `--cold: #62d2e8` (`Lab physics` / ready), `--warm: #ffae42` (`Measured` / active input / caution), `--hot: #ff5533` (heat / hazard), `--theory: #9fe28a` (`Theory`), `--read: #b9a2ff` (`4orbs account`), `--rule: #f49ac1` (`Game rule`).
- **Motion:** Only `transform`, `opacity`, and subtle `border-color`/`background-color` state transitions (`120ms ease-out`, never `transition: all`, never animating layout geometry), with full `@media (prefers-reduced-motion: reduce)` disablement.

## 4. Independent Design, Accessibility & Multi-Viewport Verification

- **Multi-Viewport Browser QA (`http://127.0.0.1:8189/`):** Verified at `1440×900`, `1280×800`, `768×1024`, `390×844`, and `844×390` across fresh entry, active experiments (Ignite, Hold, Fuel, Orbit, Open, Converge), Ledger, expanded `Explanation and sources`, and docked `Sound settings` / `What the labels mean` drawers. Zero console errors, zero failed requests, zero horizontal overflow; `1280×800` auto chose `high` at `~1.3 ms/frame`; `#jump-to-controls` focused `#controls` cleanly below the sticky mobile scene (`+12 px` clearance).
- **Independent Adversarial & WCAG 2.2 AA Review:** Caught and resolved 5 blocking accessibility issues before PR:
  1. Kept all `role="status"` live regions permanently mounted in the accessibility tree (removed `display: none` on `.statusline:empty` and `.status`) with reserved `min-height: 1.45em` to eliminate CLS jumps.
  2. Padded `.steps` (`padding: 4px; margin: -4px`) so `:focus-visible` rings are never clipped by `overflow-x: auto`.
  3. Added `--line-control: #5c70ad` (>= 3.7:1 on `--panel` and `--panel-inset`) for WCAG 1.4.11 non-text contrast on slider tracks, `.pad` borders/crosshairs, `.meter` borders, `.goal .bar`, `select`, and buttons.
  4. Preserved `44px` coarse-pointer touch targets across mobile landscape and `.bench-bar` controls (`select`, checkboxes, labels).
  5. Added explicit `:disabled` dimming (`opacity: .35; cursor: not-allowed`) and disabled hover suppression on custom range sliders (`#cv-scrub`), plus `<nav>` and `aria-labelledby="stage-title"` landmarks.

## 5. Governance & Open Constraints

- **ADR 0004 Thermal Scale:** Hallmark static `FAIL 2a` on `.scale` remains documented as an intentional scientific conflict per `docs/HALLMARK-AUDIT.md` — never altered to silence lint.
- **ADR 0005 & ADR 0006:** Independent Meshy rights-receipt review (`docs/ASSETS.md`) and physical iOS/Android screen-reader testing remain open gates.

## 6. Hallmark Layout Polish Pass (`#104`)

Following a post-ship Hallmark layout audit of `main` (`a2d688c`), closed six concrete layout & Finish gaps without altering game rules, provenance labels, or DOM contracts:

1. **Single-row `.bench-bar` & `1280×800` fold fit (`Gate 44b`):** Stopped forcing `#key` (`What the labels mean`) open on desktop boot, right-anchored `.bench-drawers` (`margin-left: auto`, expanding cleanly only when opened), and tightened `.wrap`/`.status`/`.panel`/`.view` (`calc(100dvh - 136px)`) vertical rhythm so Ignite fits inside `1280×800` without fold clipping.
2. **Surface ladder refinement (`Gates 4 / 9`):** Flattened `.goal` from a nested `--panel-inset` bordered box to a clean hairline objective strip (`background: transparent; border-bottom: 1px solid var(--line)`).
3. **Browser surface theming (`Finish F16`):** Added `::selection`, `caret-color`, and `scrollbar-color` tokens matching the dark thermal-optical instrument palette (including themed mobile `.steps` scrollbars).
4. **Ledger grid balance (`Finish F20`):** Switched Ledger's 5-cell `.reads` bay to `.reads.two` with `.wide` on the lead summary cell (`1 wide + 2×2`), eliminating orphan grid cells on desktop and mobile.
5. **Mid-width split-screen polish (`861px–1120px`):** Tuned `.deck` to `minmax(0, 1.35fr) minmax(320px, 370px)` and tightened `.bench-bar` gaps for landscape tablet and narrow desktop viewports.
6. **Hallmark stamp answers (`F4`, `F21`):** Answered both static `WARN`s in the CSS Hallmark stamp while preserving honest ADR 0004 static `FAIL 2a` reporting on `.scale`.
