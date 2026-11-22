# Open decisions and review: Grill with Docs

Status: **Round 1 decisions accepted by owner on 22 November 2026 (PT); downstream review and evidence are still open**  
Reviewed: 22 November 2026 (PT)  
Baseline: `main` at `037e1ce371d9287646beb726bf2251c5788c7441`  
Scope: [3D qualification #75](https://github.com/Zero-State-LLC/ion-pumpy-thing/issues/75), [Hallmark #79](https://github.com/Zero-State-LLC/ion-pumpy-thing/issues/79), and [plain-English copy #81](https://github.com/Zero-State-LLC/ion-pumpy-thing/issues/81).

This review uses Matt Pocock's `grill-with-docs` method: inspect facts in code and documentation first, ask the owner only for genuine choices, update the glossary when a term is settled, and write an ADR only for an accepted, consequential, non-obvious trade-off. **Owner acceptance record:** In the 22 November 2026 (PT) ChatGPT review, the owner replied **“Yes to all”** to Q1, Q2 and Q3. This records those three decisions, **not** completion of their evidence gates, permission to skip tests, or authorization to merge or deploy this draft.

## Evidence and decisions already settled

- [ADR 0001](adr/0001-tests-see-what-the-player-sees.md): game tests check the player's controls, rendered content, canvas/scene, audio and saved data, rather than arbitrary internals.
- [ADR 0002](adr/0002-4orbs-theory-pages-count-as-sources.md): the game takes the 4orbs account as its *narrative premise*, and records reviewed/unreviewed sources and conflicts in [SOURCES.md](SOURCES.md). It does not establish that reported teleportation occurred.
- [ADR 0003](adr/0003-3d-views-draw-from-a-scene-list.md): 3D draws model-driven scene lists; fallback remains the flat view.
- [ADR 0004](adr/0004-3d-views-keep-each-views-camera.md): 3D uses the corresponding flat view's orthographic camera; thermal-camera views are shaded on the game's heat scale. Preserve that representation until an explicit new decision supersedes it.
- [GLOSSARY.md](../GLOSSARY.md) already distinguishes **Measured** (video measurements attributed to 4orbs), **4orbs account** (the narrative), **Theory**, **Lab physics**, and **Game rule**. No new domain term needs to be introduced by this review.
- As of this review, there are **no open GitHub pull requests**. The latest `main` CI and production smoke checks succeeded on the baseline SHA; those automated results do **not** satisfy physical-device QA or rights verification.

## Round 1: accepted owner decisions

### Q1. Thermal science scale versus Hallmark's generic gradient rule

**Context:** [Hallmark evidence](HALLMARK-AUDIT.md) records a static Floor-2a finding against the scientific multicolour thermal legend. A real-Chrome audit after contrast fixes reports **zero rendered floor failures**, six Reflex findings and one Finish warning, but **static Hallmark does not pass**. ADR 0004 already commits to thermal shading and orthographic camera consistency. Changing the palette to satisfy an aesthetic rule could alter the conveyed meaning of heat.

**Accepted 22 Nov 2026 (PT):** **Keep the scientific thermal scale and record its explicit nonconformance to Hallmark's static Floor-2a rule.** Require scientific legibility, ordered heat mapping and a clean rendered accessibility audit as independent release checks. Never label the Hallmark static result as passing. If a new single-hue palette is desired later, require side-by-side scientific and accessibility validation before changing it.

**Alternate:** Replace the current gradient with a tested single-hue thermal mapping after design and domain review. This is a product/science change, not a lint-only fix.

**Decision record:** The owner accepted this exception. It is documented in [amended ADR 0004](adr/0004-3d-views-keep-each-views-camera.md). The generic static Hallmark finding remains a recorded FAIL, not a waived or passed finding.

### Q2. Meshy-generated GLB usage rights evidence

**Context:** [ASSETS.md](ASSETS.md) lists five GLBs, generating tasks, prompts and SHA-256 hashes. It *asserts* paid-plan generation and ownership, but the repository alone does not demonstrate the actual account entitlement at the time of each generation. Meshy's published [Terms of Use, section 3.2](https://www.meshy.ai/terms-of-use) and [ownership guidance](https://help.meshy.ai/en/articles/10137554-what-is-the-ownership-of-the-generated-models) distinguish paid output ownership from free-plan CC BY 4.0 licensing, subject to source-material rights and publication conditions. The current contract is not proof of this specific account's historical rights.

**Accepted 22 Nov 2026 (PT):** **Keep the licensing qualification gate open until there is dated, private evidence matching all five task IDs to the generating account and applicable plan/terms, plus confirmation that the original input rights and Community-sharing status do not impair the intended use.** Store a non-secret receipt reference or attestation in the asset register, never credentials or private billing information. Do not change or publicly redistribute GLBs merely to make the checklist appear complete.

**Decision record:** [ADR 0005](adr/0005-meshy-rights-evidence-before-qualification.md). Evidence is **pending** for all five asset task IDs. **Alternate only if evidence proves insufficient:** Seek owner approval for attribution, replacement or regeneration under separately verified rights. No such remedial path is authorized in this round.

### Q3. Real-device and assistive-technology exit gate

**Context:** CI verifies Node tests, type checks, and Chrome/SwiftShader browser checks at phone widths. It cannot demonstrate VoiceOver on iOS, TalkBack on Android, actual phone GPU/WebGL recovery, or touch and keyboard focus under Safari/Android Chrome. [3D-QUALIFICATION.md](3D-QUALIFICATION.md) lists those as separate acceptance gates.

**Accepted 22 Nov 2026 (PT):** **Require documented iPhone Safari and Android Chrome tests, including VoiceOver/TalkBack, before closing #75, #79 or #81 or declaring full cross-platform qualification.** Test mobile shortcut focus and sticky-canvas clearance, step actions, 2D fallback, deliberate WebGL loss/recovery, reduced motion, source cards, saved-run roundtrip, completion/replay, and portrait/landscape. Record device, OS/browser versions, observed result, screenshots or recording and tester. This does not retroactively erase the verified CI/production release, and is not an instruction to roll back the live site.

**Decision record:** [ADR 0006](adr/0006-physical-device-qualification-before-audit-closure.md). The physical-device and assistive-technology checks have **not** been performed here. A future change to qualification scope requires a separate owner decision, not a silent exception.

## Round 2 frontier and evidence-dependent work

- **F1, now actionable:** Establish who will perform the physical-device session and record the results. Recommended: one iOS Safari/VoiceOver tester and one Android Chrome/TalkBack tester, with independent signoff using [3D-QUALIFICATION.md](3D-QUALIFICATION.md). No person's identity or available device is assumed.
- **F2, evidence collection rather than a policy vote:** Request the generation-time Meshy plan/rights records from the account operator for each of the five IDs. Recommended: keep billing and identity details in private storage; link only a sanitized receipt reference. If rights cannot be verified, the next owner decision is whether to replace, credit or regenerate the affected models.
- **F3, camera-source discrepancy verified:** The corrected [4orbs measurements page](https://4orbs.com/research/satellite-videos/measurements/) describes the overhead satellite view and a second, side-on thermal-camera view. The current `index.html` Orbit `scene()` returns `look: 'visible'` for both camera views; the flat-view drawing also uses the same neutral visible palette. That is a sensor-look mismatch with the source description, even though both camera angles and positions are tested. **Round 2 Q4** asks whether to change **both** flat and 3D Orbit Camera 2 to a source-grounded thermal presentation while retaining visible Camera 1. Any change requires scene, accessibility, and visual regression checks; a representation change may need a source-revision review. No rendering change is approved by Q1-Q3.
- **F3b, Ignite handle:** #75 reports a possible 2px 3D grip compared with 5px in the flat view. Reproduce visually at 320px and 390px with known device/build evidence before proposing a repair; keep the camera and scene-list contracts.
- **F4, independently review claims:** Ask a qualified science reviewer to check the remaining lesson explanations against the corrected 4orbs source register and cited papers. Maintain the already approved game premise and do not silently convert speculative interpretations to lab observations.

### Round 2 questions for owner, awaiting answers

**Q4. Orbit Camera 2 sensor look.** The corrected source distinguishes an overhead satellite view from a side-on thermal camera, while Orbit currently paints both in the same visible-light style. **Recommended:** Update Camera 2 to a clearly labelled thermal reconstruction in both the flat and 3D views; keep Camera 1 visible. Preserve the measured camera angles and game progression. Before implementation, require matching scene-list, colour-contrast, 320px/390px and source-label regression tests. **Alternative:** Keep both as visible schematic diagrams and label the sensor difference explicitly, if visual continuity is valued over sensor fidelity. **Not approved yet.**

**Q5. Device QA ownership.** The approved device gate currently has no named tester or evidence signer. **Recommended:** Assign one person with an actual iPhone/Safari/VoiceOver setup and another with Android/Chrome/TalkBack, plus one independent reviewer who signs off the recorded results. Do not assume the owner personally has either device. **Not approved yet.**

**Q6. Meshy receipt collection.** Public Meshy terms cannot establish entitlement to the five actual task generations. **Recommended:** The authorized operator of the original Meshy account provides private task/plan/rights receipts; a separate reviewer matches those to the five IDs and hashes, recording only sanitized proof pointers in Git. Escalate missing rights evidence to a new owner choice rather than silently replacing assets. **Not approved yet.**

## Follow-on questions, conditional on evidence

- **Orbit camera 2 thermal presentation:** #75 says PR #63 left this open. Inspect the corrected source portrayal and verify both current camera renderings against ADR 0004 before deciding whether a scene change is necessary. Do not change one camera merely to make it prettier.
- **Ignite pump handle thickness:** #75 reports a possible approximately 2px 3D grip versus 5px flat grip. Reproduce on 320px and 390px first. If text or hardware affordance is lost, repair presentation while preserving the scene-list contract.
- **Science review scope:** Apply [SOURCES.md](SOURCES.md) and [PLAYER-COPY-STANDARD.md](PLAYER-COPY-STANDARD.md): check source labels, numerical consistency, published citations, and plain-language fidelity. Keep the distinction between the 4orbs premise and independent scientific verification. Never rewrite the accepted premise silently.
- **Long links and oversized game action:** Hallmark's rendered Reflex findings can be reviewed as deliberate app-screen exceptions where wrapping retains the full scientific citation and a large action aids gameplay. A Reflex finding is not a Floor pass or an implicit waiver.
- **Current acceptance evidence:** Re-run complete CI on the relevant latest commit, preserve the full 12-variant 3D screenshots when obtainable, and cross-check the five GLB hashes and three.js licence. A passed automated smoke test is not a device test.

## Review dispositions

| Area | Disposition | Remaining proof |
| --- | --- | --- |
| PR/merge review | **No open PRs** as of the baseline review | New PRs must receive independent review, green checks and explicit merge approval |
| Production deployment | **Previously verified** for the baseline SHA | Do not trigger deployment solely from this document |
| Science thermal legend | **Preserved by accepted ADR 0004 amendment**; Hallmark static Floor-2a still FAIL | Rendered legibility/contrast check remains the independent quality gate |
| 3D scene-list/fallback | **Automated tests present**; issue #75 still open | Physical-device loss/recovery, manual scene comparison |
| Asset hashes/three.js | **Tracked and test-covered** in repo | Fresh SHA/license receipt on the target commit |
| Meshy rights | **ADR 0005 accepted; generation-time rights unverified** | Matching rights evidence for five task IDs and reviewer signoff |
| Plain-English science | **Targeted revisions merged**; issue #81 remains open | Independent science reviewer and screen-reader wording checks |
| Cross-platform accessibility | **ADR 0006 accepted; automated Chrome checks passed, physical devices unverified** | iOS/Android and assistive-tech matrix |

## Change-control rules

The owner approved **Q1-Q3 only** in Round 1. This draft does not authorize a merge, deployment, asset replacement, or answers to the Round 2 questions. Keep #75, #79 and #81 open until their specific proof is recorded. The settled project-specific term **Thermal scale** is captured in `GLOSSARY.md`; ADRs 0004-0006 record the three accepted trade-offs.
