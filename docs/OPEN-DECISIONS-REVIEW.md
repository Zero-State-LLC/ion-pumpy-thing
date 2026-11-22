# Open decisions and review: Grill with Docs

Status: **review draft, no new decisions accepted**  
Reviewed: 22 November 2026 (PT)  
Baseline: `main` at `037e1ce371d9287646beb726bf2251c5788c7441`  
Scope: [3D qualification #75](https://github.com/Zero-State-LLC/ion-pumpy-thing/issues/75), [Hallmark #79](https://github.com/Zero-State-LLC/ion-pumpy-thing/issues/79), and [plain-English copy #81](https://github.com/Zero-State-LLC/ion-pumpy-thing/issues/81).

This review uses Matt Pocock's `grill-with-docs` method: inspect facts in code and documentation first, ask the owner only for genuine choices, update the glossary when a term is settled, and write an ADR only for an accepted, consequential, non-obvious trade-off. **Recommendations below are not approvals.**

## Evidence and decisions already settled

- [ADR 0001](adr/0001-tests-see-what-the-player-sees.md): game tests check the player's controls, rendered content, canvas/scene, audio and saved data, rather than arbitrary internals.
- [ADR 0002](adr/0002-4orbs-theory-pages-count-as-sources.md): the game takes the 4orbs account as its *narrative premise*, and records reviewed/unreviewed sources and conflicts in [SOURCES.md](SOURCES.md). It does not establish that reported teleportation occurred.
- [ADR 0003](adr/0003-3d-views-draw-from-a-scene-list.md): 3D draws model-driven scene lists; fallback remains the flat view.
- [ADR 0004](adr/0004-3d-views-keep-each-views-camera.md): 3D uses the corresponding flat view's orthographic camera; thermal-camera views are shaded on the game's heat scale. Preserve that representation until an explicit new decision supersedes it.
- [GLOSSARY.md](../GLOSSARY.md) already distinguishes **Measured** (video measurements attributed to 4orbs), **4orbs account** (the narrative), **Theory**, **Lab physics**, and **Game rule**. No new domain term needs to be introduced by this review.
- As of this review, there are **no open GitHub pull requests**. The latest `main` CI and production smoke checks succeeded on the baseline SHA; those automated results do **not** satisfy physical-device QA or rights verification.

## Independent decision frontier (owner answers required)

### Q1. Thermal science scale versus Hallmark's generic gradient rule

**Context:** [Hallmark evidence](HALLMARK-AUDIT.md) records a static Floor-2a finding against the scientific multicolour thermal legend. A real-Chrome audit after contrast fixes reports **zero rendered floor failures**, six Reflex findings and one Finish warning, but **static Hallmark does not pass**. ADR 0004 already commits to thermal shading and orthographic camera consistency. Changing the palette to satisfy an aesthetic rule could alter the conveyed meaning of heat.

**Recommended choice:** **Keep the scientific thermal scale and record its explicit nonconformance to Hallmark's static Floor-2a rule.** Require scientific legibility, ordered heat mapping and a clean rendered accessibility audit as independent release checks. Never label the Hallmark static result as passing. If a new single-hue palette is desired later, require side-by-side scientific and accessibility validation before changing it.

**Alternate:** Replace the current gradient with a tested single-hue thermal mapping after design and domain review. This is a product/science change, not a lint-only fix.

**Decision documentation:** An accepted choice could be added as a short amendment to ADR 0004 or a separate ADR if the cross-cutting quality-gate priority is deliberately changed. Do not create an *accepted* ADR before the owner answers.

### Q2. Meshy-generated GLB usage rights evidence

**Context:** [ASSETS.md](ASSETS.md) lists five GLBs, generating tasks, prompts and SHA-256 hashes. It *asserts* paid-plan generation and ownership, but the repository alone does not demonstrate the actual account entitlement at the time of each generation. Meshy's published [Terms of Use, section 3.2](https://www.meshy.ai/terms-of-use) and [ownership guidance](https://help.meshy.ai/en/articles/10137554-what-is-the-ownership-of-the-generated-models) distinguish paid output ownership from free-plan CC BY 4.0 licensing, subject to source-material rights and publication conditions. The current contract is not proof of this specific account's historical rights.

**Recommended choice:** **Keep the licensing qualification gate open until there is dated, private evidence matching all five task IDs to the generating account and applicable plan/terms, plus confirmation that the original input rights and Community-sharing status do not impair the intended use.** Store a non-secret receipt reference or attestation in the asset register, never credentials or private billing information. Do not change or publicly redistribute GLBs merely to make the checklist appear complete.

**Alternate:** Replace or attribute assets under a separately verified permissible licence, after review. Either course requires provenance, not assumption.

### Q3. Real-device and assistive-technology exit gate

**Context:** CI verifies Node tests, type checks, and Chrome/SwiftShader browser checks at phone widths. It cannot demonstrate VoiceOver on iOS, TalkBack on Android, actual phone GPU/WebGL recovery, or touch and keyboard focus under Safari/Android Chrome. [3D-QUALIFICATION.md](3D-QUALIFICATION.md) lists those as separate acceptance gates.

**Recommended choice:** **Require documented iPhone Safari and Android Chrome tests, including VoiceOver/TalkBack, before closing #75, #79 or #81 or declaring full cross-platform qualification.** Test mobile shortcut focus and sticky-canvas clearance, step actions, 2D fallback, deliberate WebGL loss/recovery, reduced motion, source cards, saved-run roundtrip, completion/replay, and portrait/landscape. Record device, OS/browser versions, observed result, screenshots or recording and tester. This does not retroactively erase the verified CI/production release, and is not an instruction to roll back the live site.

**Alternate:** Narrow the qualification claim explicitly (for example, desktop/automated Chrome only) and keep the untested device matrix as an open release limitation. Do not report untested devices as passed.

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
| Science thermal legend | **Existing ADR 0004 preserved**; Hallmark static conflict unresolved | Owner's quality-rule decision, recorded as an accepted ADR amendment if approved |
| 3D scene-list/fallback | **Automated tests present**; issue #75 still open | Physical-device loss/recovery, manual scene comparison |
| Asset hashes/three.js | **Tracked and test-covered** in repo | Fresh SHA/license receipt on the target commit |
| Meshy rights | **Claimed in register, not independently proven here** | Generation-time account rights evidence |
| Plain-English science | **Targeted revisions merged**; issue #81 remains open | Independent science reviewer and screen-reader wording checks |
| Cross-platform accessibility | **Automated Chrome checks passed, physical devices unverified** | iOS/Android and assistive-tech matrix |

## Change-control rules

This draft does not authorize further merges, deployments, asset replacements, or acceptance of open decisions. Owner answers become the design-tree inputs for the next round. Keep #75, #79 and #81 open until their specific proof is recorded. Update settled terms in `GLOSSARY.md` only if terminology changes, and create an ADR only when the owner accepts a consequential trade-off.
