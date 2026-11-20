# Ion Pumpy Thing

A browser game in six steps, from a jar of glowing gas to an airliner that isn't there. Each step teaches one piece of the physics behind the wormhole account set out at [4orbs.com](https://4orbs.com), and labels how much of it anyone can actually do.

1. **Ignite** – work a hand pump to make a cold plasma.
2. **Hold** – keep a plasma ball at beta one and centred between coils.
3. **Fuel** – deuterium-tritium versus hydrogen-boron fusion.
4. **Orbit** – match the measured formation in two camera views.
5. **Open** – size a wormhole throat and find the negative energy for it.
6. **Converge** – close the triangle and open the gate.

The closing ledger sorts everything you used into lab physics, measurements from the videos, readings, and things nobody knows how to do.

The default **learning run** is untimed. **Timed practice** is a separate mode. Source cards pause the experiment and clock, and successful experiments pause to preserve their settings. The finale checks current readiness and uses your formation and throat settings. Retuning a completed lesson can make it unready without erasing its mastery badge.

The Casimir lesson includes an adjustable plate diagram and a separate throat view. Both finale cameras project one shared formation. Thermal colours are illustrative. A third view shows the aircraft passing an assumed entrance, with wing clearance and a length/speed calculation. It does not depict a destination or predict wormhole travel time. After completion, scrub the sequence or replay it without changing your result. Reduced-motion mode replaces the bright pulse with a static aperture.

## Running it

It is one self-contained file. Open `index.html` in a browser, or serve the folder:

    python3 -m http.server

The only external load is Google Fonts. Sound is off until you turn it on.

Progress saves on this device and reloads paused. Starting either new-run mode replaces progress but keeps your timed best. A changed source revision starts a new run and shows an explanation rather than resuming outdated assumptions. If browser storage is blocked, the game shows that it cannot save. Private browsing or clearing browser data can remove local progress.

The optional shared practice board only works in a Claude artifact with database access to `scores-v2`. Elsewhere the board is unavailable and your timed best stays local. Learning runs do not post scores. These are client-reported practice results, not a verified competitive leaderboard.

## Checks

With Node 20 or later:

    node --test tests/game.test.cjs

The suite checks the actual game logic and drawing commands with a minimal DOM. It does not replace a real browser playthrough. See [the implementation and acceptance notes](docs/UPGRADE.md).

## Sources and framing

The narrative follows *The Vanishing, Part Three: The Science*, corrected November 2026 edition (25:24), and the current *The MH370 Videos, Measured*. The [source register](docs/SOURCES.md) maps each lesson to those pages and records limitations. Older, conflicting summaries are excluded. Numerical teaching rules are labelled separately from measurements and theoretical models. The transfer mechanism remains an explicit scenario assumption.

The two videos the site analyses are claimed to show Malaysia Airlines Flight 370, which disappeared on 8 March 2014 with 239 people on board. The satellite data points to the southern Indian Ocean, three pieces of debris trace to the aircraft, and the usual reading of the videos is that they are visual effects. The game does not settle that question. It shows what would have to be true.

