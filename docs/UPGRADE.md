# Premise edition and design-audit fixes (November 2026)

## Framing

The game now takes the 4orbs account as its premise and builds each step's mechanic from the theory and papers that account cites (see the [source register](SOURCES.md)). Lessons explain those theories. Labels are Lab physics, Theory, Measured, 4orbs account and Game rule; the earlier "Nobody knows" and "Reading" labels are gone. The aircraft is referred to only as a Boeing 777-200ER.

## Behaviour changes

- **Run controls.** The mode is a Learning / Timed switch in the status row, with a separate Restart run button. Restarting or switching mode asks first whenever there is progress to lose, and says how much. Escape or Keep playing cancels.
- **Hold assist.** Learning runs offer a centring assist and, after three misses, Show me, which flies the hold. The ledger notes an assisted hold. A fresh Hold waits for the first touch or key instead of opening with the plasma already lost.
- **Final opening.** In learning runs and under reduced motion the triangle closes at half speed, so the opening band lasts 1.6 s instead of 0.8 s. Timed practice is unchanged.
- **Navigation.** Next, step tabs and Retune scroll the new step into view and focus its title. Focus no longer lands on the title at load. Locked steps stay focusable with `aria-disabled`, show a lock, and explain what unlocks them.
- **Success.** When a goal is met the way forward becomes a full-width button and the step's main control steps back. The goal sits beside the instruction.
- **Phones.** On tall screens up to 860 px wide the experiment stays pinned at the top while the controls scroll beneath. Steps sit in one scrolling row and the label key starts folded.
- **Accessibility.** Every slider sets `aria-valuetext` with spelled-out units and is named by its label alone. Retune buttons name their step. Pause and Sound state what they do, without a pressed state. Space and Enter both pump while held. The canvas label describes the current scene and updates about once a second. Touch screens get 44 px targets.
- **Design system.** Type sizes, letter spacing, spacing and radius are tokens; every button has a hover state; the five labels have distinct colours.

## Verification

All 46 Node tests pass (39 game, 7 SEO). The build was also played through in headless Chrome at 1200, 860, 500 and 390 px: keyboard pumping, the Show me hold, the finale and the restart confirmation, with no horizontal overflow and no script errors. Google Fonts could not load in that environment, so the screenshots used fallback faces. Screen readers and real phones were not tested.

## Save compatibility

`assist` and `assisted` were added to the Hold stage as optional booleans. Older saves without them still restore. The source revision is unchanged because no model or number changed.

`screening` (#42) and `completedScreened` (#43) were added to the Fuel step the same way: whether electron screening is on, and whether the Fuel step was completed with it on. A saved run without them restores with both off, so its Ledger leaves out the electron-screening row. #42 changed the source revision, so a run saved before it starts fresh; #43 keeps the revision, so a run saved between the two restores with `completedScreened` off.

# Earlier edition: connected learning run and inspectable finale

## Purpose and scope

Demonstrate the corrected 4orbs concepts through direct control and feedback. Keep the six experiments and the lightweight single-file browser entry point. This change delivers the first teaching-model repairs and a limited visual upgrade. It does not claim a verified engineering path from fusion to teleportation.

## Journey and state

The default journey is an untimed learning run. Timed practice is a separate mode. Restarting or switching mode asks before clearing progress. A learner performs one experiment, reaches its target, and gets a paused capture of that successful state. The next experiment uses the captured configuration for mission readiness.

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

Later, the Ignite step's 3 seconds in the pressure band (#32) changed timed-practice timing again, so by the same policy the personal best and the board moved on to `ipt-best-v3` and `scores-v3`. Scores under the `-v2` keys stay stored but no longer show. The saved run keeps `ipt-run-v2`, since a changed source revision already starts it fresh.

## Verification

Run `node --test tests/game.test.cjs tests/seo.test.cjs` with Node 22 or later. The game tests execute the shipped inline JavaScript in a minimal DOM and canvas boundary. They cover lesson state, score isolation, pause behaviour, continuous confinement, persistent exposure, readiness, final-sequence aborts, frozen results, local reload, malformed saves, blocked storage, projection geometry, transit units, clipping, replay gating, event bubbling, deterministic scrubbing, reduced-motion drawing and source-revision migration.

These are model and integration checks, not screenshot tests. `npm run test:browser` checks two phone windows automatically, 390 × 844 and 320 × 640: in each, every step and the Ledger in real Chrome, with no sideways scrolling, no canvas text outside its canvas and no page errors. Before release, perform an actual desktop and phone playthrough, keyboard and touch checks, audio checks, reduced-motion checks, and a visual inspection of both camera views and the plate diagram. Suggested phone baselines: 390 px and 320 px widths, no horizontal overflow, no canvas text cut off at the canvas edge, all controls reachable without a sticky scene covering them.


## Deploy

The production host is the Cloudflare Pages project `ion-pumpy-thing`, served at [ion-pumpy-thing.app](https://ion-pumpy-thing.app/). `scripts/build-dist.sh` copies the 11 public site files into `dist/`. After the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets are set, merges to `main` (and manual `workflow_dispatch` runs) deploy that folder through GitHub Actions and smoke-check the live host. The workflow does not run a production deploy from pull requests.

## Remaining work

The specific Polywell/FRC visualizations, a more detailed reactor energy model, measured-track imports, full PDF equation verification and playtesting remain later phases. The aircraft transit is now a geometric teaching diagram, not a physical wormhole simulation. The current mission freezes earlier experiment settings rather than simulating a coupled reactor. No invented energy-conversion law has been introduced to connect fusion output to negative energy.
