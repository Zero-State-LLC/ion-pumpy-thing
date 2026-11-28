# Hallmark source audit evidence

Audit scope: Ion Pumpy Thing `index.html`, Hallmark v2.0 `--scope app --genre playful`.

A temporary GitHub Actions job executed the **static** Hallmark linter at [run 45063606366](https://github.com/Zero-State-LLC/ion-pumpy-thing/actions/runs/45063606366) against the branch's initial CSS polish. The workflow itself passed because it intentionally captured the linter exit code without failing the job. **The linter exited 1** and reported **5 FAIL, 13 REFLEX, 4 WARN**. Do not mistake the workflow success for Hallmark compliance. The temporary workflow was removed.

## Triage

- Floor 55a: headline uppercase at line-height .92. Raised to 1.0 in follow-up.
- Floor 67: tracked labels `.scale b`, `.padlabels`, `.mlabels`. Removed tracking in follow-up.
- Floor 2a: `.scale` uses a purple/pink gradient. This is the **scientific thermal scale**, not a decorative marketing gradient. Hallmark's general-purpose ban conflicts with the game's evidence representation. **Preserve the scale pending explicit design/science review**, rather than falsifying the temperature legend to get a green lint report.
- Reflex 24b: several 10px/14px gaps and offsets off Hallmark's 4px spacing scale. Evaluate on rendered screenshots before changing instrument positioning.
- Reflex 38iii: accent word in the heading. This is part of the existing visual identity; assess whether it remains legible and useful.
- Reflex 64: monospace labels. Keep monospace where values and instrument readouts benefit from it; assess other labels for body-font use.
- Warn 41: dark panel surface has no local text color declaration. Inherited body ink may be sufficient; verify computed contrast.
- Warn F21: heading-level sequence jumps from h1 to h3 in a dynamic view. Inspect actual DOM and screen reader heading navigation.

## Required completion evidence

Run `node .agents/skills/hallmark/scripts/sloplint.mjs index.html --scope app --genre playful --json` on the latest branch. Run `--render` on a machine with browser support. Attach rendered 1280x800, 390x844 and 320x640 captures, review all game stages, and confirm no canvas labels or touch targets regress. Record the rationale for any intentional departure from Hallmark rules without presenting it as a passing floor gate.

No changes to game physics, 4orbs source labels, saved-run schema, or WebGL scene-list contracts are authorized by this audit.

## Browser recheck after control sizing (22 November 2026)

Hallmark v2.0 ran in **real Google Chrome** through [workflow #45067345892](https://github.com/Zero-State-LLC/ion-pumpy-thing/actions/runs/45067345892). [Full rendered findings and screenshots](https://github.com/Zero-State-LLC/ion-pumpy-thing/actions/runs/45067345892/artifacts/14772225423).

Result: **0 rendered Floor FAIL, 6 Reflex, 1 Finish WARN**. Previous 24px controls are corrected. The only control-size reflex now concerns an intentionally prominent 61px primary game action on desktop. This is a purposeful large button in a hands-on experiment and should not be reduced to a compact admin-action size.

The four link-wrap findings concern long science source links at 320px, 414px and 1024px. They wrap within the page without forcing document-level horizontal overflow. Keep exact attribution and meaningful link names instead of truncating or hiding words just to clear a generic visual linter heuristic.

The edge-crowding reflex includes a four-pixel margin on a locked step button and an implausible negative measurement for the collapsed Sound settings details control. The recorded screenshots show no overlapping details box, but this needs real-device visual confirmation. Font-weight diversity (400, 500, 600 and 700) is a Finish warning, not a compliance failure.

**Manual screenshot note:** At 375px the first interactive Pump button is well below the initial viewport because the learning text and visual scene precede controls. Keep the physics visual connected to the controls, but evaluate a safe first-action shortcut or a mobile onboarding/layout improvement separately before changing document order.

**Unresolved static conflict:** Hallmark still marks the deliberately multi-colour thermal-camera scale as a Floor-2a purple/pink gradient. It represents a science-oriented intensity legend, not decoration. Keep the scale pending a reviewed palette decision. Do not misreport the static score as clean or change the colour semantics merely to silence Hallmark.

Real iOS Safari, Android Chrome, VoiceOver and TalkBack sessions have not been completed by this automation. Mark those gates pending until real-device evidence exists.

## Owner-approved thermal-scale decision (22 November 2026 PT)

Under the accepted [ADR 0004 amendment](adr/0004-3d-views-keep-each-views-camera.md), retain the multicolour thermal scale because it communicates scientific heat-camera meaning, even though Hallmark static Floor 2a rejects the purple/pink gradient. **The static Hallmark result remains FAIL; this is an explicit design-rule conflict, not a waiver or a passing lint check.** Continue independent rendered contrast and scene-legibility checks. A palette change requires separately reviewed scientific and accessibility evidence. Device testing remains mandatory under [ADR 0006](adr/0006-physical-device-qualification-before-audit-closure.md) before audit closure.

## Post-Overhaul & Polish Static Recheck (28 November 2026 PT, `#100` / `#104`)

Re-ran `node .agents/skills/hallmark/scripts/sloplint.mjs index.html --scope app --genre playful` after the viewport-first Experimental Physics Console overhaul (`#100`) and layout polish pass (`#104`):

- **Static result:** **`1 FAIL, 0 REFLEX, 0 unanswered WARN`** (`2 ANSWERED`: `F4` segmented mode toggle / cyan laboratory pump actuator; `F21` dynamically rendered `<h2 id="stage-title">` preceding Ledger's `<h3>`).
- **Remaining `FAIL 2a`:** Unchanged intentional ADR 0004 thermal-camera `.scale` conflict.
- **Rendered `--render` note:** Local headless `sloplint.mjs --render` awaits a Chrome-equipped CI runner; multi-viewport browser verification (`1280×800`, `1024×768`, `390×844`) was completed directly against the built `dist/` bundle. Physical iOS Safari/VoiceOver and Android Chrome/TalkBack sessions remain **Pending** under ADR 0006.
