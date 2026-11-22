# Physical-device qualification before closing audits

Status: accepted 22 November 2026 (PT)

The owner decided that issues [#75](https://github.com/Zero-State-LLC/ion-pumpy-thing/issues/75), [#79](https://github.com/Zero-State-LLC/ion-pumpy-thing/issues/79), and [#81](https://github.com/Zero-State-LLC/ion-pumpy-thing/issues/81) must remain open until documented iOS Safari and Android Chrome tests, including VoiceOver and TalkBack, verify the relevant gameplay, accessibility and 3D/fallback paths. The required evidence includes device and OS/browser versions, procedure, expected/observed results, screenshots or recording, tester, and review date. Check portrait and landscape, touch and keyboard access, focus and live descriptions, 44px targets, reduced motion, saved-run resume, the mobile shortcut and WebGL loss/restoration. See [3D qualification](../3D-QUALIFICATION.md) for the matrix.

Automated Chrome/SwiftShader, unit and production smoke tests remain valuable evidence but cannot substitute for physical mobile GPUs, Safari, VoiceOver or TalkBack. The trade-off is deliberate: keep audit claims narrow until they are verified, rather than treating green CI as proof of full device accessibility. This decision does not revoke previously verified production releases or require automatic rollback, nor does it authorize future merges or deployments.

## Test ownership and signoff (accepted 22 November 2026 PT)

Evidence must be collected by an **iOS tester with physical iPhone/Safari and VoiceOver access** and an **Android tester with physical Android/Chrome and TalkBack access**. An **independent reviewer** signs off their test records against the same release SHA, required steps and expected outcomes before any of #75, #79 or #81 is closed. The reviewer must not substitute automated Chrome/SwiftShader results for physical-device observations. These are **roles only**: no tester, reviewer, device or session has yet been assigned or verified. Keep the gate pending until every required result and signoff exists.
