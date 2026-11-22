# Ion Pumpy Thing

A browser game in six steps that takes the 4orbs account as its premise and turns each piece of it into an experiment. Use these words in issues, PRs, test names and comments. Where the code uses a different name, `docs/agents/domain.md` maps it.

## Structure of a run

**Teleport**:
The airliner's passage through the opened throat, out of the sky. The goal of a run.
_Avoid_: vanish, disappearance

**Step**:
One of the six playable parts of a run, in order: Ignite, Hold, Fuel, Orbit, Open, Converge. The Ledger comes after them and is not a step.
_Avoid_: stage, in player-facing text and docs

**Lesson**:
The physics explanation attached to a step, together with its source card.

**Source card**:
The panel that shows a lesson's source section, notes and cited papers. Opening one in timed practice pauses the clock.

**Ledger**:
The closing screen that traces each link of the chain to its source label.

**Saved run**:
A run's progress, kept on the player's device and resumed on reload. A changed source revision discards it.
_Avoid_: save file, checkpoint

**Readiness**:
The per-system checks (Plasma, Confinement, Fuel, Formation, Throat) that must hold before the player can advance. A step can be done without its readiness check being ok.

## Modes

**Learning run**:
The default, untimed mode. Offers assists and does not post scores.

**Timed practice**:
The timed mode. Keeps a local timed best and may post to the practice board.
_Avoid_: challenge, in player-facing text

**Assist**:
Learning-run help in the Hold step: the centring assist, and Show me, offered after three misses, which runs the whole hold.

**Assisted hold**:
A Hold completed with an assist or Show me. The ledger records it.

**Practice board**:
The optional shared list of timed-practice results. Client-reported, not a verified leaderboard.

## Source labels

**Claim**:
Anything the game tells the player about how the world works, in words or on screen. A view that only shows a state its lesson already teaches is not a new claim; it carries that lesson's label.
_Avoid_: fact, statement

Every claim carries exactly one of these, written with this exact capitalisation.

**Lab physics**:
Established, laboratory-tested physics.

**Theory**:
Published theory not demonstrated in the lab.

**Measured**:
A measurement taken from the videos, via the 4orbs measurement page.

**4orbs account**:
The 4orbs narrative, taken as the game's premise.

**Game rule**:
A simplification made for play.

**Source revision**:
The version of the sources a saved run was made against. A changed source revision starts a new run instead of resuming the saved run.

## Physics in play

**Pressure band**:
The Ignite step's target pressure, 0.3 to 2.5 torr, marked on its meter. A cold plasma kept inside it for 3 seconds passes Plasma readiness; leaving it before then starts the count over.

**Piston**:
The part of the ion pumpy schematic that Forbes reads as having "full command of adiabatic pressure". It compresses the plasma in full command of its pressure, so the orbs can run continuously rather than fire once as a laboratory dense plasma focus does. In the Ignite step the hand pump plays it, and holds the plasma pressed toward the middle of the jar while the pressure is in its band.
_Avoid_: magnetic piston (a different device, which compresses an ion beam)

**Beta**:
Plasma pressure divided by magnetic pressure. The Hold step targets beta near one (0.75 to 1).

**Cusp**:
The simplified cusp trap of coils, after Bussard's Polywell, used in the Hold step.

**Cusp leak**:
A gap at a cusp through which plasma escapes. The leaks close as beta nears one.
_Avoid_: hole, wiffle-ball hole

**Ion pumpy schematic**:
The anonymous labelled drawing of a compact fusion reactor that Forbes was sent and analysed in May 2026. The Fuel step's source card gives his reading of it as a dense plasma focus.

**Dense plasma focus**:
A pulsed fusion machine: a capacitor bank drives a current sheet between two nested electrodes, and the sheet's own field pinches the gas into a small, hot, dense knot of plasma.
_Avoid_: DPF, dense plasma fusion device

**Coulomb barrier**:
The electric push that keeps two positively charged nuclei apart. They fuse only if they get through it, which takes high temperatures unless the barrier is screened.

**Electron screening**:
Flooding a fusion fuel with electrons whose charge screens the Coulomb barrier, so the fuel burns at lower temperatures. The Fuel step offers it as an optional control; how much it helps is a Game rule.

**Formation**:
The rigid triangle of orbs matched in the Orbit step and projected in both finale cameras.
_Avoid_: lock-in

**Throat**:
The wormhole opening sized in the Open step and held open by negative energy from the orbs.

**Casimir plates**:
The adjustable plate diagram that introduces negative energy in the Open step.

**Dynamic Casimir effect**:
Real photons made from vacuum fluctuations by a boundary, such as a mirror, that moves very fast. Plates held still give the static Casimir effect instead.

**Plasma bubble**:
The bubble of plasma an orb collapses fast, turning vacuum fluctuations into real photons and negative energy by the dynamic Casimir effect.

**Plasma cavity**:
The game's name for the inside of an orb's plasma bubble, whose plasma wall acts like a moving Casimir surface in place of a pair of fixed metal plates. The Open step's plasma-cavity view shows the bubble collapsing.
