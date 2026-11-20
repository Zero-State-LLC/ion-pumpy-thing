# Connected learning run and inspectable finale

## Purpose and scope

Demonstrate the corrected 4orbs concepts through direct control and feedback. Keep the six experiments and the lightweight single-file browser entry point. This change delivers the first teaching-model repairs and a limited visual upgrade. It does not claim a verified engineering path from fusion to teleportation.

## Journey and state

The default journey is an untimed learning run. A separate button starts a new timed practice run. Both actions explicitly say that they restart progress. A learner performs one experiment, reaches its target, and gets a paused capture of that successful state. The next experiment uses the captured configuration for mission readiness.

Mastery and readiness are separate. Mastery records that an experiment was completed. Readiness is evaluated from the current configuration. A completed throat experiment can therefore become unready when its assumption is revoked or its width is too small. Players can revisit unlocked experiments to retune them.

The final sequence checks all five preparations. It reads the player's radius, period, camera angle and throat width. If readiness is lost while closing or opening, it returns to orbit without recording completion. Both camera views project the same formation. A completed result freezes its time, attempts and throat-width margin, so later exploration does not rewrite the score.

A third, explicitly schematic view shows the aircraft passing a fixed entrance. It shows clearance and assumed passage time, without drawing a destination. A scrubber unlocks only after completion. Scrubbing pauses playback and retraces one formation; replay can resume from that point or restart at the end. Views use current settings and never rewrite the saved result. In reduced-motion mode a static aperture replaces the bright pulse.

## Contracts

- Source cards pause the simulation and challenge clock. Hiding the page also pauses both. A manual pause is available.
- Six uninterrupted active seconds inside the confinement band and centre region are required. Leaving either condition resets progress.
- Neutron exposure is cumulative for the run. Short impact flashes can fade. Changing fuel does not remove exposure.
- Learning results have no numeric score or time penalty and do not submit to the timed board.
- Timed practice counts active wall time independently of the capped physics step. The board is client-reported practice, not a trusted competition.
- Local saves contain a version, source revision, mode, elapsed time, attempts, bounded stage settings, mastery, and any frozen completion record. They contain no identity or secrets.
- Invalid versions, invalid numeric ranges, invalid enumerations and inconsistent stage progress are rejected without partially restoring state.
- Reloads resume paused. An unfinished final opening resumes from orbit. No physical continuity is claimed across a suspended tab.
- The ideal plate illustration responds to separation and area. Its geometry is schematic and its controls logarithmic.
- Replay controls cannot grant mastery. Scrubbing and replay leave elapsed score time unchanged, and replay completion pauses again.
- A mid-replay reload restores the completed endpoint with the same replay origin. An interrupted first attempt still resumes from orbit.
- The transit calculation uses 63.7 m / 250 m/s. The 1.6-second animation is slowed display time, not a scientific prediction.

## Storage and compatibility

The new run and personal-best keys are `ipt-run-v2` and `ipt-best-v2`. Legacy best scores are left untouched. Claude artifact hot reload uses the same validated snapshot contract as ordinary local progress. Old host snapshots are rejected. The transit source revision adds replay origins and the third view to the save contract. Earlier in-progress source revisions start a fresh learning run with a visible explanation; personal bests remain untouched.

The optional Claude artifact board uses `scores-v2` so the new timing policy does not mix with legacy scores. Its availability depends on the host's database rules. An unavailable or rejected board leaves the standalone game and local best usable.

## Verification

Run `node --test tests/game.test.cjs` with Node 20 or later. The 25 tests execute the shipped inline JavaScript in a minimal DOM and canvas boundary. They cover lesson state, score isolation, pause behaviour, continuous confinement, persistent exposure, readiness, final-sequence aborts, frozen results, local reload, malformed saves, blocked storage, projection geometry, transit units, clipping, replay gating, event bubbling, deterministic scrubbing, reduced-motion drawing and source-revision migration.

These are model and integration checks, not screenshot or full-browser tests. Browser launch and local-file preview were unavailable in the review environment. Before release, perform an actual desktop and phone playthrough, keyboard and touch checks, audio checks, reduced-motion checks, and a visual inspection of both camera views and the plate diagram. Suggested phone baseline: 390 px width, no horizontal overflow, all controls reachable without a sticky scene covering them.

## Remaining work

The specific Polywell/FRC visualizations, a more detailed reactor energy model, measured-track imports, full PDF equation verification and playtesting remain later phases. The aircraft transit is now a geometric teaching diagram, not a physical wormhole simulation. The current mission freezes earlier experiment settings rather than simulating a coupled reactor. No invented energy-conversion law has been introduced to connect fusion output to negative energy.
