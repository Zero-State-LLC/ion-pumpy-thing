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
