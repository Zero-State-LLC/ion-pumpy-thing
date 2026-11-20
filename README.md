# Ion Pumpy Thing

A browser game in six steps, from a jar of glowing gas to an airliner that isn't there. Each step teaches one piece of the physics behind the wormhole account set out at [4orbs.com](https://4orbs.com), and labels how much of it anyone can actually do.

1. **Ignite** – work a hand pump to make a cold plasma.
2. **Hold** – keep a plasma ball at beta one and centred between coils.
3. **Fuel** – deuterium-tritium versus hydrogen-boron fusion.
4. **Orbit** – match the measured formation in two camera views.
5. **Open** – size a wormhole throat and find the negative energy for it.
6. **Converge** – close the triangle and open the gate.

The closing ledger sorts everything you used into lab physics, measurements from the videos, readings, and things nobody knows how to do.

## Running it

It is one self-contained file. Open `index.html` in a browser, or serve the folder:

    python3 -m http.server

The only external load is Google Fonts. Sound is off until you turn it on.

The shared leaderboard only works when the page is published as a Claude artifact, where it uses the artifact's database. Anywhere else the board shows as unavailable and your best run is kept in the browser's local storage.

## Sources and framing

The physics, numbers and quotations come from *The Vanishing, Part Three: The Science* (corrected edition, November 2026), *The MH370 Videos, Measured* and *Fusion Energy* on 4orbs.com. Lines marked "our sum" in the game are its own arithmetic. The simulations are simplified teaching models.

The two videos the site analyses are claimed to show Malaysia Airlines Flight 370, which disappeared on 8 March 2014 with 239 people on board. The satellite data points to the southern Indian Ocean, three pieces of debris trace to the aircraft, and the usual reading of the videos is that they are visual effects. The game does not settle that question. It shows what would have to be true.
