# Ion Pumpy Thing

A browser game in six steps, from a jar of glowing gas to an airliner that isn't there. Each step builds one piece of the wormhole account set out at [4orbs.com](https://4orbs.com) from the physics it cites, and explains that physics as you go.

1. **Ignite** – work a hand pump to make a cold plasma.
2. **Hold** – keep a plasma ball near beta one and centred between coils, as in a high-beta cusp trap.
3. **Fuel** – deuterium-tritium versus hydrogen-boron fusion, the aneutronic fuel for the orbs' power.
4. **Orbit** – match the measured formation in two camera views.
5. **Open** – meet negative energy in Casimir plates, size a wormhole throat, and hold it open with negative energy from the orbs.
6. **Converge** – close the triangle and open the gate.

The closing ledger traces each link of the chain to its source: lab physics, theory, measurements from the videos, the 4orbs account, or a game rule.

The default **learning run** is untimed. **Timed practice** is a separate mode. Restarting, or switching mode, asks before it clears progress. In learning runs, step 2 offers a centring assist and, after three misses, Show me; the ledger notes an assisted hold. The final opening closes at half speed in learning runs and under reduced motion. Source cards pause the experiment and clock, and successful experiments pause to preserve their settings. The finale checks current readiness and uses your formation and throat settings. Retuning a completed lesson can make it unready without erasing its mastery badge.

The Casimir lesson includes an adjustable plate diagram and a separate throat view. Both finale cameras project one shared formation. Thermal colours are illustrative. A third view shows the aircraft passing an assumed entrance, with wing clearance and a length/speed calculation. It does not depict a destination or predict wormhole travel time. After completion, scrub the sequence or replay it without changing your result. Reduced-motion mode replaces the bright pulse with a static aperture.

## Running it

The game is at [ion-pumpy-thing.app](https://ion-pumpy-thing.app/). A short [privacy notice](privacy.html) describes local progress and measurement on that host.

It is one self-contained file. Open `index.html` in a browser, or serve the folder:

    python3 -m http.server

The only external load is Google Fonts. Sound is off until you turn it on.

Progress saves on this device and reloads paused. Restarting or switching mode replaces progress, after asking, but keeps your timed best. A changed source revision starts a new run and shows an explanation rather than resuming outdated assumptions. If browser storage is blocked, the game shows that it cannot save. Private browsing or clearing browser data can remove local progress.

The optional shared practice board only works in a Claude artifact with database access to `scores-v2`. Elsewhere the board is unavailable and your timed best stays local. Learning runs do not post scores. These are client-reported practice results, not a verified competitive leaderboard.

## Checks

With Node 20 or later:

    node --test tests/game.test.cjs tests/seo.test.cjs

The suite checks the actual game logic and drawing commands with a minimal DOM. It does not replace a real browser playthrough. See [the implementation and acceptance notes](docs/UPGRADE.md).

## Sources and framing

The narrative follows *The Vanishing, Part Three: The Science*, corrected November 2026 edition (25:24), and the current 4orbs measurement page. The [source register](docs/SOURCES.md) maps each lesson to those pages and to the papers they cite. Older, conflicting summaries are excluded.

The game takes the 4orbs account as its premise and builds its mechanics from the theory and papers that account cites. Every claim carries its source label: lab physics, theory, measured, or the 4orbs account. Simplifications made for play are labelled Game rule. The aircraft is referred to only by make and model, a Boeing 777-200ER.

