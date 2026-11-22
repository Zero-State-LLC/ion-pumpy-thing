# Game sound map

The 29 effects use ElevenLabs textures with local editing and selected tuning layers. Mechanical effects keep their physical character. Electrical sounds indicate energy or stability, short signals mark state changes, and warnings indicate a specific loss or threshold. These are designed feedback sounds, not measurements of particles, fields, or a transfer mechanism.

## Event mapping

| Cue | Trigger and purpose |
| --- | --- |
| `ui-confirm` | Confirm successful sound enable or start Show me in Hold. |
| `ui-toggle` | Change gas, fuel, electron screening, camera, plate, throat or plasma-cavity view, pause, source-card state, Hold assist, or restart-dialog state. |
| `control-tick` | Changed experiment slider value, limited to one tick per 160 ms. |
| `stage-enter` | Player navigates to a lesson; initial load and restore remain quiet. |
| `lesson-complete` | First completion of lessons 1–5; can finish through the automatic pause. |
| `reset` | Start a new learning or timed run. |
| `ledger` | Enter the closing ledger. |
| `lab-air` | Low background texture while experiments 1–3 run. |
| `pump-stroke` | Each actual hand-pump compression, with a 160 ms minimum interval. |
| `plasma-ignite` | Plasma crosses its visible ignition threshold, or fuel first lights. |
| `plasma-bed` | Running discharge; level and brightness follow glow and applied power. |
| `plasma-fade` | Discharge falls below ignition, or the assumed throat is disabled. |
| `caution` | Enter an unstable discharge state, lose a held target, cross fuel dose thresholds, or lose mission readiness. Limited to once per two seconds. |
| `field-bed` | Running confinement field; level and brightness follow field strength. |
| `stability-lock` | Ignite or Hold remains on target for 0.25 simulated seconds. |
| `particle-leak` | A running Hold experiment leaks; limited to once per 250 ms. |
| `wall-loss` | The confined plasma reaches the wall and resets. |
| `fusion-bed` | Running fuel experiment; level follows reaction activity. |
| `neutron-impact` | A simulated neutron reaches the wall, limited to once per 250 ms. |
| `charged-product` | Charged fusion products are emitted, limited to once per 330 ms. |
| `formation-bed` | Formation is moving in Orbit or waiting to converge. |
| `alignment` | Orbit remains within its target for 0.25 simulated seconds. |
| `plate-adjust` | Plate controls are being moved in plate view; ends when input stops. |
| `assumption` | Player explicitly enables the assumed transfer mechanism. |
| `throat-bed` | The assumed throat is enabled and visible in throat view. |
| `system-ready` | Throat width crosses the fit requirement while assumed, or finale readiness changes to ready. |
| `convergence` | Approach follows current progress and mode: five seconds timed, ten seconds in learning or reduced motion. |
| `timing-window` | The running approach enters the valid opening interval. |
| `timing-miss` | Player opens too early/late, or the running approach times out. |

The flash, aircraft crossing, completed finale, and replay are silent. Scrubbing and zero-time redraws do not emit achievement or particle sounds. Completion has priority over routine feedback; a completion can suppress an incidental cue that happens in the same frame.

## Playback and controls

- `audio-cues.js` maps cue IDs to same-origin assets. `audio.js` owns loading, mixing, fallback sounds, and cancellation. `index.html` supplies event hooks and current experiment state.
- The page creates no AudioContext or MP3 request before the player enables sound. Stage assets load lazily after enable. Late downloads fill the cache only, so a missed click or warning never plays later.
- Missing assets use brief local noise or tonal feedback where appropriate. A missing audio script leaves the game playable without sound. The site needs no ElevenLabs key, API call, or paid service during play.
- Mute, source reading, tab hiding, stage changes, and resets cancel stale voices. A normal pause stops beds and event sounds; a just-earned completion may finish. Hidden tabs and the finale block all cues.
- At most six one-shots and two beds play at once. Timing and completion cues have priority over decorative events. Gain ramps and a compressor control transitions and the mix.
- Defaults: master volume 55%, background 35%, gentle pulse on. The background control includes sustained machinery and the convergence bed. Volume, background, and pulse preferences are stored in `ion-pumpy-audio-v1`. Sound enable is never restored automatically.
- Turn off **Gentle pulse** to select the four unmodulated electrical beds. All visual game feedback remains available with sound off.

## Tuning and assets

The design uses 7.83 Hz as a composition reference. Selected audible layers use multiples such as 125.28, 250.56, 313.2, 375.84, and 501.12 Hz. Four electrical beds include shallow 5% amplitude modulation at 7.83 Hz, with separate pulse-off versions. This is a sound-design choice, with no claim of a health benefit or guaranteed pleasantness. The complete mixed textures are not pure, precisely pitched tones. The convergence clip plays at half speed in learning and reduced-motion modes, lowering its tonal layer by one octave while matching the ten-second approach.

There are 33 MP3 files: 29 cues and four pulse-off alternatives, totaling about 2.2 MB. The source pack retains WAV masters and audition materials separately. [AUDIO-PROVENANCE.json](AUDIO-PROVENANCE.json) records provider generation IDs, master hashes, all shipped MP3 hashes, and tuning layers. It contains no credentials or signed download URLs.

## Verification

Run `node --test tests/*.test.cjs`. Tests cover the existing game and SEO checks, opt-in playback, failed enable, late downloads, fallback behavior, voice priority, source/pause/visibility cancellation, pulse selection, convergence offsets, node cleanup, asset paths and hashes, saved preferences, missing scripts, timing-window edges, silent finale/replay, and deliberate navigation.

All 33 shipped assets were decoded with ffmpeg. The source-pack checks covered WAV peak headroom, tuning stems, and loop joins. These checks do not establish subjective sound quality or browser-specific MP3 loop behavior.

Manual browser playback and listening remain pending. Before release, play all six lessons on desktop and iOS Safari, test pause and tab return, disable the pulse, lower the background, and repeat the finale and replay. Listen for audible loop seams, harsh transients, and warnings masked by beds. Confirm no audio requests occur before enable and that all media requests return successfully after enable. The automated tests use a mock audio graph and do not replace this review.
