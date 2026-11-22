# Ion Pumpy Thing

A browser game in six steps, from a jar of glowing gas to an airliner that isn't there. Each step builds one piece of the wormhole account set out at [4orbs.com](https://4orbs.com) from the physics it cites, and explains that physics as you go.

1. **Ignite** – work a hand pump, the piston in full command of the plasma's pressure, to make a cold plasma and keep it in the pressure band for 3 seconds.
2. **Hold** – keep a plasma ball near beta one and centred between coils, as in a high-beta cusp trap.
3. **Fuel** – deuterium-tritium versus hydrogen-boron fusion, the aneutronic fuel for the orbs' power, with optional electron screening to burn it at lower temperatures.
4. **Orbit** – match the measured formation in two camera views.
5. **Open** – meet negative energy in Casimir plates, size a wormhole throat, and hold it open with negative energy from the orbs.
6. **Converge** – close the triangle and open the gate.

The closing ledger traces each link of the chain to its source: lab physics, theory, measurements from the videos, the 4orbs account, or a game rule.

The default **learning run** is untimed. **Timed practice** is a separate mode. Restarting, or switching mode, asks before it clears progress. In learning runs, step 2 offers a centring assist and, after three misses, Show me; the ledger notes an assisted hold. The final opening closes at half speed in learning runs and under reduced motion. Source cards pause the experiment and clock, and successful experiments pause to preserve their settings. The finale checks current readiness and uses your formation and throat settings. Retuning a completed lesson can make it unready without erasing its mastery badge.

The Casimir lesson includes an adjustable plate diagram, a separate throat view, and a plasma-cavity view where an orb's collapsing plasma bubble yields negative energy. Both finale cameras project one shared formation. Thermal colours are illustrative. A third finale view shows the aircraft passing an assumed entrance, with wing clearance and a length/speed calculation. It does not depict a destination or predict wormhole travel time. After completion, scrub the sequence or replay it without changing your result. Reduced-motion mode replaces the bright pulse with a static aperture and holds the plasma cavity still.

## Running it

The game is at [ion-pumpy-thing.app](https://ion-pumpy-thing.app/). A short [privacy notice](privacy.html) describes local progress and measurement on that host.

Serve the static files from this folder, then open http://localhost:8000:

    python3 -m http.server

Sound is off on every page load until you turn it on. The 29 effects use local ElevenLabs assets and follow the game events. Volume, background level, and the optional gentle pulse are adjustable. Those preferences stay on this device. See the [sound map and playback notes](docs/AUDIO.md).

The Converge step draws in 3D with three.js where the browser has WebGL; the 3D view switch beside the sound settings turns it off, and the setting stays on this device. The three.js files and the airliner prop ship from this site and are listed, with their sources, licences and hashes, in the [assets register](docs/ASSETS.md).

The pages load Google Fonts. Google Analytics loads only on the production host, as described in the privacy notice. Audio plays from this site with no ElevenLabs runtime connection.

Progress saves on this device and reloads paused. Restarting or switching mode replaces progress, after asking, but keeps your timed best. The 3 seconds in Ignite's pressure band changed timed-practice timing, so timed bests and the practice board started fresh with them; earlier scores stay stored but no longer show. A changed source revision starts a new run and shows an explanation rather than resuming outdated assumptions. If browser storage is blocked, the game shows that it cannot save. Private browsing or clearing browser data can remove local progress.

The optional shared practice board only works in a Claude artifact with database access to `scores-v3`. Elsewhere the board is unavailable and your timed best stays local. Learning runs do not post scores. These are client-reported practice results, not a verified competitive leaderboard.

## Checks

With Node 22 or later:

    npm test
    npm run test:browser

`npm test` (the same as `node --test tests/*.test.cjs`) checks the game logic, drawing commands, audio lifecycle, asset integrity, and SEO with a minimal DOM and mocked Web Audio. `npm run test:browser` opens every step and the ledger in the installed Chrome in a 390 × 844 and a 320 × 640 phone window, and fails if the page scrolls sideways, throws, or draws canvas text outside the canvas. It then opens each 3D view and fails if WebGL doesn't start or the 3D frame is blank. Without Chrome, or on an older Node, it skips locally and fails in CI. Neither replaces a real browser playthrough. See [the implementation and acceptance notes](docs/UPGRADE.md).

## Sources and framing

The narrative follows *The Vanishing, Part Three: The Science*, corrected November 2026 edition (25:24), and the current 4orbs measurement page. The [source register](docs/SOURCES.md) maps each lesson to those pages and to the papers they cite. Older, conflicting summaries are excluded.

The game takes the 4orbs account as its premise and builds its mechanics from the theory and papers that account cites. Every claim carries its source label: lab physics, theory, measured, or the 4orbs account. Simplifications made for play are labelled Game rule. The aircraft is referred to only by make and model, a Boeing 777-200ER.


