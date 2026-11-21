# Proposal: ideas from *Ion Pumpy Thing SOLVED — UFO Files 8*

Status: **proposal only**. This document does not change the [source register](../SOURCES.md), `SOURCE_REVISION`, lesson text, physics models, or the saved-run format. Nothing here is accepted into play until a later change lists the work, and any new scientific claim still needs a 4orbs.com page and a source-revision bump, as `docs/SOURCES.md` already requires.

## The recording

| | |
| --- | --- |
| Title | *Ion Pumpy Thing SOLVED — UFO Files 8* |
| Channel | Ashton Forbes ([@JustXAshton](https://www.youtube.com/@JustXAshton)) |
| Published | 21 November 2026, as a livestream, later posted as a VOD |
| Length | 2 hours 15 minutes 24 seconds |
| URL | https://www.youtube.com/watch?v=SSfSAC9TUVk |
| Captions | English auto-captions, pulled with yt-dlp on 21 November 2026 PT. Timestamps below refer to this VOD. They are not a professional transcript. |

The stream is already in the same voice the source register attributes to the **4orbs account** label ("how 4orbs and Ashton Forbes connect the pieces"). That does not, by itself, put its claims on 4orbs.com. At 2:08:31 the host says the 4orbs site has been archiving general topics from the streams; this proposal still waits for a live page before any lesson change.

Player-facing terms stay those in `GLOSSARY.md`. New words that would appear to the player (dense plasma focus, magnetic piston, undulator, electron screening, dynamic Casimir) are listed only as candidates at the end. They do not enter the glossary until a change actually uses them in the game.

## How to read the items

Each idea is marked **OBSERVED** (said in the recording, paraphrased, with a timestamp) or **INFERRED** (an adaptation for this game). A change that would alter a labelled claim must name the label it would carry (**Lab physics**, **Theory**, **Measured**, **4orbs account**, or **Game rule**).

Skipped on purpose, because they do not fit this six-step teaching game: the political and culture-war stretches, including the long *Grand Theft Auto* commentary except for one retention rule below; weapons, cloaking, and "plasmoid weapon" talk; speculation about who drew the schematic; and any naming of the airliner beyond make and model.

## What the game already covers

Do not rebuild these; later work should reuse them.

- **Hold** already teaches beta near one, the cusp, Bussard's wiffle ball, and Park et al. (2015). The stream returns to the same force-free, beta-one picture at 49:28–50:14.
- **Fuel** already contrasts deuterium-tritium with hydrogen-boron and cites Miley's IEC report. The stream's proton-boron 11 emphasis at 10:25–10:38 is the same fuel choice.
- **Open** already introduces negative energy with Casimir plates. The stream repeats that the opening cannot be done without negative energy (1:20:19).
- **Ignite** already draws the pump as a pipe, cylinder and piston, and already attributes the "cold plasma" reading to Ashton Forbes.
- **Converge** already treats the transit as a kinematic diagram of an airliner passing an entrance, with no destination and no claimed travel time.
- `docs/UPGRADE.md` already defers a coupled reactor and any invented law from fusion output to negative energy. This proposal does not reopen that.

## Proposed work

### 1. Record the dense-plasma-focus reading as candidate source material

- **Kind:** science / source register (no play change in this step)
- **Effort:** S to keep this proposal; M later, if a 4orbs page carries the claim and the register is updated
- **OBSERVED** (5:06–7:32, recap at 2:06:04–2:06:11): the host identifies the "ion pumpy" schematic, posted in 2024, as the dense plasma focus he associates with an Air Force design, and says the central piston is the feature that pins it down.
- **INFERRED:** do not add that identification to a lesson, source card, or the ledger until a 4orbs.com page states it. When that happens, the Fuel and Ignite cards would be the natural homes, labelled **4orbs account** for the identification itself and **Lab physics** or **Theory** only for published DPF facts those pages cite.
- **System:** `docs/SOURCES.md` and, later, the Ignite and Fuel source cards.
- **Change now:** this proposal and the pointer in the source register. No model or copy change.
- **Acceptance criteria:**
  - This PR does not change `SOURCE_REVISION` or invalidate a saved run.
  - A later science change that uses the identification cites a live 4orbs page, updates the register, and bumps the source revision.
  - Player-facing text still does not name the airliner beyond Boeing 777-200ER.

### 2. Teach the Ignite pump as the control that holds plasma pressure

- **Kind:** mechanic, juice, pedagogy
- **Effort:** M
- **OBSERVED** (7:32–8:08, 14:40–16:28): the piston is described as giving command of the plasma's pressure and density. In the orbs it would be a magnetic piston, not a metal one. A typical dense plasma focus, he says, is a one-time pinch; the piston is what would turn that into continuous operation, with the pump holding the mid-device pressure where it needs to be. Density is then what sets the plasma's frequency (16:17–16:35).
- **INFERRED:** keep the hand pump (a **Game rule** for play) but make its job match that reading: each stroke drives density and pressure, and the goal is a steady band rather than only "a glow appears." A brief pinch or compression visual can sell the one-shot versus continuous contrast without claiming self-sustaining ignition. The magnetic-versus-physical piston belongs in the lesson as **Theory** or **4orbs account** only after the register allows it; until then it can be a clearly labelled **Game rule** metaphor, or it stays out of the lesson.
- **System:** Ignite, including the existing pump-stroke cue and the Plasma readiness check.
- **Change:** pumping still ignites a cold plasma, but readiness depends on holding a target pressure/density band for a short window, in the same spirit as Hold's six-second lock. The canvas should show compression toward the mid-volume, not only a jar glow. Do not claim that this band proves self-sustaining fusion; that claim is already barred by the correction policy in `docs/SOURCES.md`.
- **Acceptance criteria:**
  - A learning run can still reach a cold plasma and a met Ignite goal from the keyboard or the on-screen pump, including a held Space or Enter, as today.
  - Leaving the pressure band before the hold is complete resets that short progress, and the lesson copy says so.
  - The source card keeps an accurate label for every new sentence. No new scientific claim appears without a register update.
  - Assist behaviour is unchanged (Ignite has no assist today). Timed practice still counts only active time.
  - The content-rule test and the existing Ignite tests still pass; new tests follow `docs/adr/0001-tests-see-what-the-player-sees.md`.

### 3. Show Hold's wiffle-ball holes shrinking as beta approaches one

- **Kind:** juice, pedagogy
- **Effort:** S–M
- **OBSERVED** (49:28–50:14): a force-free, beta-one condition is described as an electrostatic bubble whose escape holes, like a wiffle ball in an IEC machine after Bussard, shrink so that much less escapes.
- **INFERRED:** the lesson text already says this. Give the Hold canvas a readable version of those holes opening when beta drops or overshoots, and tightening in the 0.75–1 band, so the six-second lock is visible rather than only numeric.
- **System:** Hold (cusp, beta, centring assist, Show me).
- **Change:** a visual layer on the existing ball-and-coils scene. No change to the beta formula, the 0.75–1 band, the six-second rule, or the assisted-hold ledger note.
- **Acceptance criteria:**
  - In a learning run, a player can see the leak paths quiet down inside the band and open when the ball leaves it or beta leaves 0.75–1.
  - Show me and the centring assist still complete an assisted hold, and the ledger still records it.
  - Reduced-motion mode does not rely on a rapid flicker to carry the same information.
  - Tests still check the lock through the page and the canvas, not through internal flags.

### 4. Make electron screening a Fuel control, from a paper already on the card

- **Kind:** mechanic, pedagogy
- **Effort:** M
- **OBSERVED** (19:19–21:07): a high-voltage ionizer (he reads 20 kV and 300 kHz off the schematic) floods the mid-volume with electrons. The "egg" is fat in the middle and cusps at the ends, so the electrons gather there. He ties that flood to electron screening that lowers the Coulomb barrier, citing Edmund Storms and George Miley, whom he calls an author on the dense plasma focus.
- **INFERRED:** Miley is already cited on the Fuel source card. A optional Fuel control that raises an electron flood and shows a lower barrier for the hydrogen-boron path can teach that idea as **Theory**, scoped to what the cited paper actually supports. Do not add schematic-only details (for example mixed working gases the stream mentions) unless a 4orbs page and the register take them up. Do not pretend the flood is measured lab ignition.
- **System:** Fuel, the charged-versus-neutral product feedback, and neutron exposure.
- **Change:** one clearly named control and a short lesson paragraph, with the source card pointing at the existing Miley citation (and Storms only if a 4orbs page or the current register warrants it). Hydrogen-boron remains the orbs' aneutronic fuel. Exposure rules stay as they are: cumulative, not wiped by a fuel change.
- **Acceptance criteria:**
  - Switching fuel still changes charged versus neutron feedback as it does today.
  - The screening control is labelled **Theory**, and turning it does not invent a new yield number presented as **Lab physics**.
  - Neutron exposure remains cumulative for the run.
  - A changed Fuel setting can still make readiness fail without erasing mastery.

### 5. Add a plasma-cavity companion to the Casimir plate view

- **Kind:** mechanic, pedagogy
- **Effort:** M
- **OBSERVED** (17:55–19:10, 24:49–25:41): the mid-device "egg" is described as an undulator, an alternating magnetic structure that lines particles up along a path. He also says one use of that undulator is to form cavities at the plasma frequency and vibrate them, producing a dynamic Casimir effect: a Casimir effect made with plasma, pulling energy from the vacuum.
- **INFERRED:** keep the existing adjustable plate diagram and the Lamoreaux **Lab physics** measurement. Offer a second Open view that shows a plasma cavity / undulator as a teaching picture of the same negative-energy idea. Until a 4orbs page carries the dynamic-Casimir reading, that view is **Game rule** or stays out of the lesson body and lives only in this proposal. It must not replace the plates or change the throat-sizing rule.
- **System:** Open (Casimir plates, throat, assumed negative energy from the orbs).
- **Change:** a second view beside plates and throat, following the same pause-and-inspect pattern. Throat width and the "orbs supply the energy" **Game rule** stay as they are.
- **Acceptance criteria:**
  - The plate diagram, its logarithmic controls, and the ideal `π² ħ c A / (720 d³)` illustration remain.
  - Switching views does not rewrite a completed Open result or the throat width used by readiness.
  - Source cards pause the experiment and the timed-practice clock, as they do today.
  - No sentence calls a plasma Casimir a demonstrated macroscopic wormhole.

### 6. Give Orbit and Converge a lock-in, then a field snap

- **Kind:** juice, game-feel
- **Effort:** S–M
- **OBSERVED** (51:38–52:15, 54:18–54:30, 1:11:35–1:11:59): when the orbs "lock in," their field structure is said to grow and then dissipate along the path they want, a magnetic snap the airliner rides. In the early video the orbs look yellow and green, with a yellow structure moving aside, which he reads as energy going to the outer edge of a stable bubble. He also describes the orbs drifting the way a blimp does, with motion in every direction, as distinct from a later teleport or wormhole path.
- **INFERRED:** use this as presentation, not a new physical law. In Orbit, a successful formation match can show the three orbs settling and their colour or edge-brightening going quiet. In Converge, the close of the triangle can show the field growing during lock-in and then snapping as the opening appears. Label any new causal language **Game rule** or the existing **4orbs account** convergence reading. Do not add a predicted destination or travel time.
- **System:** Orbit formation matching, Converge's shared formation, the half-speed learning-run / reduced-motion close, and the existing convergence bed cue.
- **Change:** timing and colour on the existing finale cameras. Learning runs and reduced motion still close at half speed (1.6 s opening band). Timed practice stays at the present close speed. The transit diagram stays schematic.
- **Acceptance criteria:**
  - Both finale cameras still project one shared formation.
  - A lost readiness during the close still returns the player to Orbit without recording completion, as today.
  - Reduced-motion mode still replaces the bright pulse with a static aperture; the snap cannot be the only cue.
  - Frozen completion records (time, attempts, throat-width margin) are unchanged by the new animation.
  - Replay and scrub still cannot grant mastery or rewrite the saved result.

### 7. Say plainly that the airliner keeps flying forward; the path is what changes

- **Kind:** pedagogy
- **Effort:** S
- **OBSERVED** (1:09:08–1:09:35): the host rejects dematerialising the airliner and rebuilding it somewhere else. From the airliner's point of view it is still flying forward; what changes is the geometry of the path, so that it goes through a wormhole.
- **INFERRED:** this is already close to the transit diagram's limits (entrance, clearance, assumed passage time, no destination). A short Converge or transit sentence that uses those words would make the existing diagram easier to read. If the exact wording is not yet on a 4orbs page, keep it on this proposal or label it **4orbs account** only after the register is updated; do not present it as a new **Measured** result.
- **System:** Converge, the third transit view, and its source card.
- **Change:** one or two sentences of lesson or diagram copy, no change to the 63.7 m / 250 m/s calculation or the 1.6 s display time.
- **Acceptance criteria:**
  - The diagram still clips at the entrance and still names no destination.
  - The airliner is still only a Boeing 777-200ER.
  - The content-rule test still passes.
  - Playback time is still described as display time, not a predicted crossing time.

### 8. Keep the run on the experiment; do not add chore loops

- **Kind:** retention, design constraint
- **Effort:** S (documentation only unless a later feature tries to violate it)
- **OBSERVED** (1:38:27–1:38:56): in a critique of another game, the host says maintenance chores and "homework" were the point he quit, that a later patch had to tone down spammy relationship upkeep, and that he wanted the core activity, not a second job inside the game. The surrounding culture-war argument is out of scope; this is the design point only.
- **INFERRED:** Ion Pumpy Thing's core is the six steps and the ledger. Future work should not add daily chores, relationship meters, inventory upkeep, or other homework that pulls the player off pumping, holding, fuelling, matching the formation, sizing the throat, and converging. Timed practice and the optional practice board already give a reason to replay without that kind of loop. Assists in the learning run stay optional help, not chores.
- **System:** product scope; learning run and timed practice.
- **Change:** this constraint. No code in this PR.
- **Acceptance criteria:**
  - A later feature that adds a recurring out-of-experiment task must justify why it is not a chore loop, or it is rejected.
  - Learning-run assists remain opt-in and are still noted on the ledger when used.

## Later, not in this round

A single pressure or piston state shared across Ignite, Hold, Fuel and Open would make the machine feel continuous, which is the stream's main mechanical image. That would be an **L** coupled-reactor change. It is already listed as later work in `docs/UPGRADE.md` and is not proposed here.

Monetization talk in the stream (game sales, fusion-company investing) does not suggest a change to this free, locally saved browser game. No shop or paid assist is proposed.

## Candidate glossary terms

Only if a later change actually uses them in player-facing text, in the same PR as the `GLOSSARY.md` entries:

- **Dense plasma focus:** a coaxial Z-pinch device that collapses into a short-lived plasmoid. Candidate reading of the ion-pumpy schematic, not yet on the source register.
- **Magnetic piston:** the stream's name for the pressure command in the orbs, as opposed to a metal piston.
- **Undulator:** the alternating magnetic "egg" in the schematic, used in the stream both to line up particles and to drive a dynamic Casimir picture.
- **Electron screening:** a flood of electrons that, in the cited theory, lowers the Coulomb barrier.
- **Dynamic Casimir:** a Casimir-like effect from vibrating cavities, here imagined in plasma rather than in parallel plates.
