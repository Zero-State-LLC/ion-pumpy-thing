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

## Accepted qualification policy, 22 November 2026 (PT)

The owner accepted [ADR 0005](adr/0005-meshy-rights-evidence-before-qualification.md) and [ADR 0006](adr/0006-physical-device-qualification-before-audit-closure.md). **The policy decision has passed; the underlying evidence gates have not.** Do not close #75, #79 or #81 on the strength of CI, screenshots from headless Chrome or a deployed Pages commit alone. Do not infer a device test or license proof from this document.

### Physical-device test record, unperformed

| Matrix item | Expected pass evidence | Current status |
| --- | --- | --- |
| iOS Safari, portrait and landscape | Physical iPhone model, iOS/Safari versions, screenshot/video, no broken touch/scroll | **Not tested** |
| iOS VoiceOver with keyboard and touch | All six steps, labels, sliders, source cards, live descriptions, shortcut focus and Ledger navigation | **Not tested** |
| Android Chrome, portrait and landscape | Physical Android model, version and browser build, 2D/3D operation, no clipping or overflow | **Not tested** |
| Android TalkBack and keyboard | Sequential focus, 44px targets, actions, source labels, restart/resume and error narration | **Not tested** |
| WebGL unsupported or initialization failure | Flat view remains operable; user sees readable failure text and no lost progress | **Not tested on devices** |
| Deliberate WebGL loss and restoration | 3D falls back to flat, saved run unchanged, 3D can safely return | **Not tested on devices** |
| Reduced motion and background/resume | No motion-only instructions; frozen replay and saved progress behave as documented | **Not tested on devices** |
| Mobile Go to step controls | Link visible on each active step, focuses and reveals controls below sticky scene, absent on Ledger | **Not tested on devices** |

A complete test report records: **tester, date/time PT, device, OS version, browser and assistive-technology version, build SHA, procedure, expected result, observed result, evidence link, and pass/fail/blocker**. The tester signs each row. An independent reviewer reconciles failed rows and explicitly accepts closure only when the required scope passes. Do not include private account identifiers, login credentials or unrelated user data in screenshots.

## Source-versus-Orbit-camera look, reviewed 22 November 2026 (PT)

[4orbs' corrected measurement page](https://4orbs.com/research/satellite-videos/measurements/) describes the first view as looking down from above and the second as a side view through a **thermal camera**. This attribution is the 4orbs account of the footage, not independent proof the footage is authentic. In the current `index.html`, Orbit `scene()` explicitly returns `look: 'visible'` for **both** 3D camera views. Its flat `draw()` also uses shared visible-light object colours for both halves. The 3D angles and object placement have automated coverage, but this source-derived **sensor-look distinction is not represented**. ADR 0004 requires matching flat and 3D appearances and thermal treatment where a view represents a heat camera.

**Status: genuine follow-up, not approved.** Ask the owner in the next Grill round whether Orbit camera 2 should use the thermal palette in both the flat and 3D views, with camera 1 staying visible. Do not repair one renderer in isolation or imply a speculative heat value is measured. Separately verify the reported thin Ignite handle on phone screens before making that presentation-only change.

## Round 2 accepted execution roles (22 November 2026 PT)

| Role | Responsibility | Assigned person | Evidence status |
| --- | --- | --- | --- |
| iOS device tester | Physical iPhone Safari, VoiceOver, portrait/landscape, touch, keyboard, saved-run and WebGL checks | **Unassigned** | **Pending** |
| Android device tester | Physical Android Chrome, TalkBack, portrait/landscape, touch, keyboard, saved-run and WebGL checks | **Unassigned** | **Pending** |
| Independent acceptance reviewer | Compare both device records against this matrix and sign the same tested SHA | **Unassigned** | **Pending** |
| Original Meshy account operator | Supply private generation-time task/plan/right receipts for five GLBs | **Unassigned** | **Pending** |
| Independent asset-rights reviewer | Validate task IDs, rights restrictions and output hashes; publish sanitized verdict | **Unassigned** | **Pending** |

**Accepted design direction, not yet implemented:** Orbit Camera 2 becomes a labelled thermal reconstruction in both flat and 3D views, while Camera 1 remains the visible overhead view, under the ADR 0004 amendment. Implement and qualify separately. The thermal palette is an illustrative representation, not a calibrated temperature reading extracted from the source video.
