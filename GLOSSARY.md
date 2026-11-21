# Glossary

Domain terms for Ion Pumpy Thing. Use these words in issues, PRs, test names and code comments. Code identifiers are given where they differ from the word.

## Structure of a run

- **Step**: one of the six playable parts, in order: Ignite, Hold, Fuel, Orbit, Open, Converge. In code each is a *stage* (`STAGES`, built with `stage()`); the seventh entry in `STAGES` is the Ledger, which is not a step. Say "step" to players and in docs; `stage` is fine in code.
- **Lesson**: the physics explanation attached to a step, with its source card.
- **Source card**: the panel that shows a lesson's source section, notes and cited papers (`SOURCES`, `PAPERS`). Opening one in timed practice pauses the clock.
- **Ledger**: the closing screen that traces each link of the chain to its source label.
- **Readiness**: the per-system checks (Plasma, Confinement, Fuel, Formation, Throat) that must hold before the player can advance (`missionReadiness()`, `readyToAdvance()`). A step can be *done* without its readiness check being *ok*.

## Modes

- **Learning run** (`mode === 'learn'`): the default, untimed mode. Offers assists. Does not post scores.
- **Timed practice** (`mode === 'challenge'`): the timed mode. Keeps a local timed best and may post to the practice board. Avoid "challenge" in player-facing text.
- **Assist**: learning-run help in the Hold step: the centring assist, and **Show me**, offered after three misses, which runs the whole hold.
- **Assisted hold**: a Hold completed with an assist or Show me. The ledger records it.
- **Practice board**: the optional shared score list (`scores-v2`), available only inside a Claude artifact with database access. Client-reported, not a verified leaderboard.

## Source labels

Every claim carries exactly one of these. Use the exact capitalisation.

- **Lab physics**: established, laboratory-tested physics.
- **Theory**: published theory not demonstrated in the lab.
- **Measured**: a measurement taken from the videos (the 4orbs measurement page).
- **4orbs account**: the 4orbs narrative, taken as the game's premise.
- **Game rule**: a simplification made for play.

- **Source revision** (`SOURCE_REVISION`): the version of the sources a save was made against. A changed source revision starts a new run instead of resuming a save.

## Physics in play

- **Beta**: plasma pressure divided by magnetic pressure. The Hold step targets beta near one (0.75 to 1).
- **Cusp**: the simplified cusp trap of coils, after Bussard's Polywell, used in the Hold step.
- **Formation**: the rigid triangle of orbs matched in the Orbit step and projected in both finale cameras.
- **Throat**: the wormhole opening sized in the Open step and held open by negative energy from the orbs.
- **Casimir plates**: the adjustable plate diagram that introduces negative energy in the Open step.
