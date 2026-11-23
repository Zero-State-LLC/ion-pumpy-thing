# Orbit Camera 2 thermal reconstruction: visual QA

Status: **candidate implementation reviewed in headless Chrome, not merged**  
Decision: Grill Round 2 Q4, recorded in [draft PR #88](https://github.com/Zero-State-LLC/ion-pumpy-thing/pull/88) and the proposed ADR 0004 amendment.  
Implementation: [draft PR #89](https://github.com/Zero-State-LLC/ion-pumpy-thing/pull/89).

## Rendering contract

- **Camera 1:** Visible overhead reconstruction.
- **Camera 2:** Side-on thermal reconstruction using the existing app thermal palette.
- **Shared geometry:** Same aircraft/orb positions, formation, scale, camera-angle control, timing and science models in both cameras. Only the presentation differs.
- **Thermal meaning:** Illustrative false colours, **not calibrated temperature measurements**. Camera 2 does not establish that the footage is genuine or prove any physical claim.
- **Two rendering paths:** Flat 2D canvas and 3D three.js scene use equivalent camera-specific looks, keeping ADR 0003's scene list and ADR 0004's orthographic camera.
- **Fallback:** The flat camera rendering remains available when WebGL is unavailable. No saved-run keys, score logic, sound or game physics were changed.

## Evidence collected

[Headless Chrome visual QA run #45075992077](https://github.com/Zero-State-LLC/ion-pumpy-thing/actions/runs/45075992077) succeeded. [Screenshots artifact #14775535706](https://github.com/Zero-State-LLC/ion-pumpy-thing/actions/runs/45075992077/artifacts/14775535706) includes full-page and simulation-only screenshots for **320x640, 390x844 and 1280x800**, in both flat and 3D views (twelve images). The automated script explicitly verified that Orbit, not Ignite, was selected before capturing images. The earlier run #45075584290 is **invalid visual evidence** because its fixture was overwritten by the game's unload save, causing Ignite screenshots. A subsequent attempt #45075829267 captured a valid 320px pair but failed before completing the other viewport screenshots. Do not cite either failed/incomplete run as full visual verification.

Inspection of the corrected images confirms distinct visible and thermal palettes, readable titles, nonblank 3D views, retained scale bar and unchanged object arrangement. Game-harness tests additionally check per-view look, thermal values, shared object locations, angles, visible explanatory note and flat camera background. Browser checks verify the application at 320px and 390px in Chrome/SwiftShader.

## Still unverified

- Physical iOS Safari/VoiceOver and Android Chrome/TalkBack, including device GPU WebGL recovery, as required by the approved device-qualification decision.
- Scientific calibration of any heat value. None is claimed.
- Rights in the five Meshy GLBs. The rights-evidence gate is separate.
- Final independent PR review and authorized merge/deployment. The screenshot job is not a release approval.
