# UI/UX & Creative Direction Overhaul (`#100`)

## 1. Current-State Audit & De-Slop Findings Register

Inspected live production (`https://ion-pumpy-thing.app`), Slice 7 (`http://127.0.0.1:8188/`), and `index.html` across `1280×800`, `390×844`, and `320×640`:

| Finding | Category | Before | Action |
| --- | --- | --- | --- |
| Seven stacked top chrome rows before `<main>` | Information architecture | `54px` uppercase hero + 2-line blurb + label key + step rail + HUD + empty status band + `border-radius: 10px` Sound settings box + 3D/Quality row pushed the game ~340 px down desktop and off the first screen on mobile | Collapse into one `~52px` **Console Bar** (nameplate, sequence rail, compact HUD) and dock `3D / Quality / Sound / Label key` directly beneath the simulation viewport in `.bench-bar` |
| Duplicate legacy `<style>` block (`lines 1–10`) | Legacy accumulation | Conflicting `color-scheme: light` and `border-radius: 10px` `.sound-settings` patched above main stylesheet | Delete legacy `<style>` block; consolidate into one canonical Hallmark-stamped `<style>` |
| Narrow blog-style `.wrap` (`1180px`, `1.25fr / 1fr`) | Spatial composition | Simulation shared ~55% of a narrow container, leaving wide dark gutters on 1440px/1920px screens while forcing vertical scroll at 1280×800 | Expand console frame to `1480px`, `1.55fr / minmax(360px, 440px)` (~62% simulation dominance), capped to `calc(100dvh - 118px)` so viewport + controls fit above the fold |
| Two-tone colored wordmark (`Ion Pumpy <span>Thing</span>`) | Generic AI pattern (Hallmark REFLEX 38iii) | Accent cyan split-word heading | Single authoritative phosphor-cream facility nameplate (`h1`, `line-height: 1`) |
| Monospace prose & UI labels | Generic sci-fi trope (Hallmark REFLEX 64) | `.tag`, `.eyebrow`, `.btn.small`, `.padlabels`, `.mlabels`, `.hud` set in monospace | Set all prose, buttons, tags, and axis labels in `IBM Plex Sans`; reserve `IBM Plex Mono` (`tabular-nums`) strictly for numerical measurements, timer, scores, and scale ticks |
| Decorative callout side stripe (`.brief`) | Generic AI card trope (Hallmark WARN 3) | `border-left: 3px solid var(--cold)` | Remove side stripe; let typography hierarchy and 1px machined hairlines carry structure |
| Flat unframed `.reads` grid & default browser sliders | Weak instrumentation | Default OS range inputs and floating definition-list cells | Custom machined range tracks/thumbs, crosshair-gridded coil balance pad, graduated meters, and recessed 1px-hairline instrument readout bay |
| Mobile scroll barrier | Mobile friction | 8 blocks of chrome above the glass jar on `390×844`, burying `PUMP (HOLD)` below the fold | Single-row mobile header + swipeable sequence rail + sticky pinned simulation (`36vh`) + docked bottom-sheet console directly below; defer secondary bench settings underneath |

## 2. Layout Directions Evaluated

- **Direction A — Experimental Mission Control (Selected core):** Single-row precision command strip, dominant viewport-first simulation on the left (~62% width) with docked optical bench toolbar underneath, and a hairline-structured control & telemetry console docked on the right. Best balance of immediate gameplay, scientific clarity, WCAG 2.2 AA legibility, and zero canvas-label occlusion.
- **Direction B — Full-Bleed Spatial Canvas with Floating Glass Overlays (Rejected for desktop overlays; spatial craft adopted):** Floating translucent overlays obscure edge-anchored scientific labels (`tests/browser-check.mjs`), conflict with the de-slop glassmorphism ban, and hurt mobile GPU frame budgets.
- **Direction C — Editorial Interactive Documentary (Rejected):** Vertical reading flow buries interactive controls beneath prose, reversing the game-first mandate.

## 3. Design System & Tokens

- **Ground & Surface Hierarchy:** `--deep: #070c20` (bench surround), `--sky: #0b1330` (optical aperture), `--panel: #0c132a` (docked console deck), `--panel-inset: #080e22` (recessed telemetry cells & wells), `--line: #23305a` (1px machined hairlines), `--line-strong: #374a85` (active bezel).
- **Semantic Colours (preserved unchanged from scientific spec):** `--cold: #62d2e8` (`Lab physics` / ready), `--warm: #ffae42` (`Measured` / active input / caution), `--hot: #ff5533` (heat / hazard), `--theory: #9fe28a` (`Theory`), `--read: #b9a2ff` (`4orbs account`), `--rule: #f49ac1` (`Game rule`).
- **Motion:** Only `transform`, `opacity`, and subtle `border-color`/`background-color` state transitions (`120ms ease-out`, never `transition: all`, never animating layout geometry), with full `@media (prefers-reduced-motion: reduce)` disablement.

## 4. Governance & Open Constraints

- **ADR 0004 Thermal Scale:** Hallmark static `FAIL 2a` on `.scale` remains documented as an intentional scientific conflict per `docs/HALLMARK-AUDIT.md` — never altered to silence lint.
- **ADR 0005 & ADR 0006:** Independent Meshy rights-receipt review (`docs/ASSETS.md`) and physical iOS/Android screen-reader testing remain open gates.
