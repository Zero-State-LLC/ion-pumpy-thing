# Coding standards

Read during review (the Standards axis of `/code-review`), not while implementing. These are judgement calls. A rule a machine can check belongs in a test or the type check instead.

## Content

- **Take the premise as given.** The game presents the 4orbs account as correct and explains the theory and papers it cites as the source of its mechanics. Flag player-facing text or docs that debunk, hedge or editorialise about the premise.
- **Every claim carries one accurate source label.** Use one of the five labels in `GLOSSARY.md`, with exact capitalisation, and judge the fit: a mechanic simplified for play is Game rule, not Lab physics; a figure read off the videos is Measured.
- **The aircraft stays unnamed.** Call it a Boeing 777-200ER or the airliner. No flight number, airline, date or passenger count. A test in `tests/game.test.cjs` rejects the common forms; flag anything that slips past it.
- **Use the glossary's words.** Step, not stage, in player-facing text; Timed practice, not challenge. A new player-facing term gets a `GLOSSARY.md` entry in the same change.

## Code

- **New standalone scripts get type-checked.** Add each one to `include` in `jsconfig.json`.
