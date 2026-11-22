# Tests see what the player sees

Status: accepted

Game tests act only through the page's controls and the test clock (`advance`), set up a mid-run state by loading a saved run from `tests/fixtures/`, and check only what a player could notice: page content and attributes, canvas drawing, which sound cues play, and what is saved. The physics models behind the source-labelled claims (`plasmaPressure`, `formation`, `camB`, `transitModel`, `fuelActivity`) are a second seam that tests may call directly, because their numbers are the claims. We chose this so that a change a player can't notice can't break a test, and because agents write new tests by copying the ones they find.

## Considered options

- **Read anything on `window.__lab`, including the game's internal state** (the earlier approach): quick to write, but every test is tied to the game's internals.
- **Set up runs by writing step fields directly** (the old `prepare()` helper): fast, but skips the checks a real reload applies.
- **Play to a mid-run state through the controls**: closest to a player, but slow; Hold alone needs six seconds of steady confinement.

## Consequences

- `window.__lab` shrinks to `advance`, the five physics models and `SOURCE_REVISION`. With nothing else exposed, the rule enforces itself.
- Tests hear what the player would by recording what the game asks of the sound engine (cues, beds and the sound mode). The test harness wraps the engine before the game starts, so the hook doesn't expose it and requests made during startup are recorded too.
- Saved-run fixtures depend on the save format, which already has to keep loading for players. The fixture helper stamps the current `SOURCE_REVISION`, so a source update doesn't invalidate every fixture. Booting from a saved run fails unless the game opened it, and clicking a step tab fails unless that step opened, so a test can't pass on a fresh run or the wrong step.
- The readouts tests use (`text`, `currentStep`, `cues`, `scene` and the rest) live under "What the player sees" in `tests/game.test.cjs`. New ones go beside them.
- Layout, which the node harness can't see, is checked in real Chrome by `npm run test:browser`.
- `tests/audio.test.cjs` tests the sound engine through its own module interface with a stand-in for Web Audio, and is outside this decision.
