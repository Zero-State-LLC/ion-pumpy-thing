# 3D post-merge qualification (2026-11-22)

Tracking: #75. Scope: merged PRs #54, #62, #63, #66, #67, #68, #69.

## Baseline and evidence

The PRs were merged before this audit started. PR #69 reported 170 Node tests, 50 browser views (24 in 3D) and a clean typecheck. Those are **historical PR claims**, not a fresh execution of the current main branch. A GitHub combined-status lookup on merge commit `fdb7d68be2a17c708d2c07bc42b0d852420b9252` returned no legacy commit statuses; this does not establish the outcome of GitHub Actions check runs.

Before making a release claim, capture `git rev-parse HEAD`, `node --version`, `npm --version`, browser versions, OS, device model and all CI check-run conclusions. Run on the same SHA:

```sh
npm ci
npm test
npm run typecheck
npm run test:browser
```

If Chrome or Node is missing, a local browser-test skip is **not a pass**. Run in CI or on a qualified host. Save full logs and screenshots.

## Acceptance matrix

| Gate | Steps | Pass criterion | Evidence |
| --- | --- | --- | --- |
| WebGL unavailable | Disable WebGL before load; select 3D | Flat view remains readable and interactive; no uncaught errors | Browser log and screenshot |
| Context loss | Enable 3D, force `WEBGL_lose_context.loseContext()` on the active canvas, then restore | No crash, no loss of run data; fallback works; restore/re-enable is safe | Video, log, saved snapshot |
| Initialization failure | Block one vendored module or GLB request | Player receives an understandable fallback; flat mode works | Network log and screenshot |
| Save roundtrip | Advance a learning and timed run, toggle 3D, reload | Mode, mastery, settings and frozen result retained; 3D preference stored separately; resume paused | Before/after snapshots |
| Invalid/blocked storage | Change source revision or block localStorage | Clear explanation, no partial restore; play remains possible | UI capture and console |
| Scene parity | Inspect all `VIEWS_3D` variants at 390x844 and 320x640 | Scene-list values follow game state; no blank half or clipped text; correct thermal/visible/diagram looks | Scene snapshots and screenshots |
| Ignite | Test both gases, pressure band edges, mid-stroke, reduced motion | Piston, jar, front, arrows and particles agree with scene list | Screenshots and test logs |
| Orbit/Converge | Compare two cameras and entrance cut at replay 30% | Both halves visible; scale/camera correct; no aircraft past entrance | Screenshots |
| Accessibility | Keyboard-only navigation, VoiceOver on iOS, TalkBack on Android, reduced-motion | Controls operable and named, live description meaningful, focus visible, no motion-only information | Manual checklist and recordings |
| Real devices | iOS Safari and Android Chrome, portrait/landscape, background/resume | Touch targets reachable, no sideways overflow, WebGL fallback and saves work | Device/build/version evidence |
| Science | Trace all player-facing claims to `docs/SOURCES.md` | Lab physics/theory/measured/4orbs account/game rule distinguished; no implication of experimentally verified teleportation | Claim-to-source table |
| Licensing | Compare shipped hashes with `docs/ASSETS.md`, inspect `vendor/three/LICENSE` and Meshy entitlements | Hashes and MIT notice match; five Meshy assets have documented rights for this use | Hash output and rights evidence |

## Scientific boundaries to preserve

- The corrected November 2026 4orbs episode and measurement page are the narrative baseline; earlier conflicting editions are excluded.
- The 63.7 m aircraft and assumed 250 m/s produce a 0.2548 s **geometric** crossing calculation, not wormhole travel time.
- The electron-screening boost below peak temperature is an illustrative **Game rule**, not a measured fusion-yield result.
- Plasma bubble collapse producing usable negative energy, and a traversable throat transporting the aircraft, are claims of the **4orbs account**, not established laboratory results.
- Props are presentation only; model-driven size, position and motion must originate in the game scene list (ADR 0003). Views retain orthographic camera and correct thermal/visible/diagram look (ADR 0004).

## Known follow-ups

1. PR #63 explicitly left open whether Orbit camera 2 should use a thermal look; resolve against the current source and ADR before changing rendering.
2. PR #69 notes the 3D pump handle appears approximately 2 px thick at the 18 px grip span, compared with 5 px in the flat view. Verify at 320 px and fix only presentation if it impairs readability.
3. The existing browser harness uses Chromium/SwiftShader, not physical mobile GPU drivers. Do not claim cross-browser qualification from that harness.
4. Meshy ownership is asserted in the register under paid-plan terms; independently confirm the applicable generation-time entitlement.

## Change control

Keep fixes in a separate PR, require fresh CI and independent review, and report exact head SHA, base SHA, merge method, and target before asking for merge approval. Deployment is a separate approval, with target host, artifact/commit, rollback and smoke-test plan. **Do not merge or deploy from this qualification document alone.**
