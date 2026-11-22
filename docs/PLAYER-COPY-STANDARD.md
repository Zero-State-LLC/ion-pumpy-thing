# Player-facing copy standard

Use plain English without removing scientific accuracy. The game teaches the specific 4orbs account; it does **not** prove that the reported events occurred or that a working wormhole can be built.

## Writing rules

1. Start each step with a player action, the exact control name, and a visible success condition.
2. Use short, direct sentences. Keep one action per sentence where possible. Avoid vague references such as "it" and "the band" when the player may not know what they mean.
3. Explain specialist words on first use: plasma, beta, neutron exposure, electron screening, negative energy, wormhole throat and orbit.
4. Distinguish **Lab physics**, **Theory**, **Measured** (within the source account), **4orbs account**, and **Game rule**. Do not change a hypothesis into a proven fact.
5. Keep all units, values, citations, uncertainty and safety qualifications. Do not invent evidence.
6. Use button labels exactly as shown on screen. Provide keyboard and touch alternatives where needed.
7. Explain errors in this order: what happened, how to recover, and whether saved progress was affected.
8. Keep detailed scientific discussion in the expandable Explanation and sources section, but make the visible step instruction usable without opening it.
9. Read text aloud and check at 320px and 390px. Verify screen-reader labels and live status messages after copy changes.

## Reviewed in PR #82

- Six lesson briefs
- Magnetic field/beta control note
- Plasma pressure note
- Assist and Show me note
- Electron screening note
- Neutron exposure disclaimer
- Orb placement and wormhole throat notes
- Replay and camera reconstruction notes
- Timed score provenance
- Summary label for scientific sources

## Remaining review

Audit dynamic goal text, status and recovery messages, leaderboard failures, accessibility announcements, and full scientific lesson paragraphs for terminology and readability. Have a science reviewer check every substantive simplification. Keep this work tracked in issue #81.

## Science explanation readability pass, 22 November 2026

The game retains the distinctions between established laboratory findings, published theoretical models, measurements attributed to 4orbs, the 4orbs interpretation, and game rules.

A focused readability pass simplified six explanatory paragraphs in the Hold, Fuel, Orbit, and Open lessons. It defines beta and magnetic cusps, explains circular acceleration and the wormhole throat, divides long source descriptions into shorter sentences, and attributes the measured orbital geometry to 4orbs. The source labels, published names, dates, formulas, units, and numerical ranges remain in the lessons. A game-harness test checks the visible explanations and their classifications.

**Scope limit:** This is a prose and provenance review, not independent validation of the scientific claims or the underlying videos. A qualified science reviewer should check whether every simplification accurately represents its cited source. The rest of the scientific lesson text and real-device screen-reader experience remain open in issue #81.
