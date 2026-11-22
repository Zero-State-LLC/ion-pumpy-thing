# Corrected source register

Reviewed on 21 November 2026 PT. Source revision: `4orbs-part3-corrected-2026-11-21-fuel-screening`.

The narrative baseline is the live [corrected November 2026 Part Three](https://4orbs.com/the-vanishing/part-3-the-science/), duration 25:24, video identifier `_gzWIv7uABs`. The 19:38 April edition returned by an earlier search cache is excluded. The live page was retrieved twice during review. The [homepage correction notices](https://4orbs.com/) document replacement of the older episode.

The second source is the live [measurement page](https://4orbs.com/research/satellite-videos/measurements/). Its observations are attributed to 4orbs and labelled Measured in the game. The page scales the aircraft as a Boeing 777-200ER (63.7 m fuselage) and assumes a 250 m/s cruise speed.

## Premise and labels

The game takes the 4orbs account as its premise and makes no attempt to disprove it. Each lesson builds its mechanic from the theory or paper the account cites, and explains it. Every claim keeps an accurate source label:

| Label | Meaning |
| --- | --- |
| Lab physics | Done or measured in a laboratory |
| Theory | A mathematical model or theoretical result |
| Measured | Taken from the videos by 4orbs |
| 4orbs account | How 4orbs and Ashton Forbes connect the pieces |
| Game rule | A simplification made to keep it playable |

The aircraft is referred to only by make and model.

## Stage mapping

| Stage | Source section | What the game demonstrates | Model limits |
| --- | --- | --- | --- |
| Ignite | Corrected Part Three, 6:07; the dense plasma focus theory pages; Dense Plasma Focus 101 | Separate electron and ion behaviour, glow colour; the pump as the ion pumpy schematic's piston, compressing the plasma in full command of its pressure so the orbs run continuously, not firing once as a laboratory dense plasma focus does (4orbs account), drawn as a front holding the plasma pressed toward the middle of the jar while the pressure is in its band | Pressure, temperatures and glow thresholds are illustrative. They are not a calibrated discharge model. The hand pump as the control, the 0.3 to 2.5 torr pressure band and the 3 seconds in it are game rules. The front is a schematic; the pump empties the jar, so its strokes never move the front. |
| Hold | Corrected Part Three, 7:40 and 10:15; Polywell page | Beta, the Polywell cusp trap, Grad's high-beta boundary as tested by Park et al. (2015) | Beta is computed as plasma pressure divided by magnetic pressure. Drift, the target band and the loss above beta one are game rules. The coils are a simplified cusp. |
| Fuel | Corrected Part Three, 10:15; Polywell and AAWSAP pages; Miley 2016 page and the dense plasma focus theory pages; electron-screening theory page | Charged versus neutral reaction products; the Polywell's virtual cathode; Miley's IEC report; Forbes's dense plasma focus reading of the ion pumpy schematic; the 2006 dense plasma focus study; an optional electron-screening control, off by default: flooding the fuel with electrons screens the Coulomb barrier so fusion goes at lower temperatures (4orbs account), with the 2003 core-electron screening calculation by Miley's group (Theory) | The reaction curves, thresholds and exposure rate are simplified. p-B11 side reactions are stated but not simulated. How much screening helps is labelled Game rule: below a fuel's peak temperature, a screened fuel burns as it would at three times the temperature, capped at the peak temperature. At or above its peak, screening changes nothing. It applies to both fuels. No screening yield is claimed. |
| Orbit | Measurement page, rigid formation and camera fit | One equilateral formation in two projections | Reported radius, period and camera ranges guide a synthetic reconstruction. The fixed 24° tilt and 11-second tumble are illustrative, not imported tracks. |
| Open | Corrected Part Three, 16:51; Sonny White page; AAWSAP page; dynamic Casimir theory page | Morris–Thorne negative energy; the Casimir effect; Gao–Jafferis–Wall; the DIA report's throat table; the orbs as the source, generating negative energy by the dynamic Casimir effect as each collapses its plasma bubble (4orbs account), drawn in the plasma-cavity view | Ideal parallel-plate energy uses `π² ħ c A / (720 d³)`. The throat scales the report's 70 Jupiter masses per 100 m linearly. The orbs supplying exactly the energy the throat needs is labelled Game rule. The plasma-cavity view is a schematic with no undulator; it changes neither the throat width nor the energy the throat needs. |
| Converge | Corrected Part Three, 16:51; measurement page, final frames and scale; teleportation-mechanism theory page | Forbes's convergence account; the DIA report's bright spot and cooling; both cameras share one scene; a transit diagram shows clearance, with the airliner crossing the throat at constant speed relative to the field (4orbs account) | Convergence opens the throat, as in the 4orbs account. False colour and the flash are drawn for viewing. The transit is a kinematic diagram; no destination is drawn because no page names one. |

## Transit diagram assumptions

Fresh live reads on 20 November reconfirmed the corrected episode's 25:24 duration and the measurement page's qualifications. The measurement page uses a 63.7 m fuselage to set its conditional 777 scale. For the cold-patch analysis it assumes 250 m/s cruise speed, explicitly noting that the video cannot supply the aircraft's forward speed. The diagram uses that assumption instead of the old game's unsupported 905 km/h value.

The aircraft drawing retains its assumed 60.9 m span. For a centred aircraft and a transverse entrance of width `w`, per-wing clearance is `(w - 60.9) / 2`. Passage of a 63.7 m fuselage past a fixed entrance at 250 m/s takes `63.7 / 250 = 0.2548 s`. Together they make a kinematic diagram of the crossing and its clearance, not a travel time or a destination. The diagram clips the aircraft at the entrance and leaves the other side unspecified. Its playback lasts 1.6 seconds for inspection; that is display time only.

The teleportation-mechanism theory page, read on 21 November 2026, has only the aircraft and its contents go through, since they hold a constant speed relative to the field. The game's transit view, its canvas label and its description say the airliner crosses the throat at constant speed relative to the field, labelled 4orbs account, and the diagram's steady 250 m/s passage draws it so. That page names no destination, so none is drawn.

This source revision invalidates prior in-progress saves with an on-screen explanation. The Ignite step's 3 seconds in the pressure band change timed-practice timing, so the local timed best and the practice board start fresh under new keys (`ipt-best-v3`, `scores-v3`), as an earlier timing change did ([UPGRADE.md](UPGRADE.md)). Scores under the older keys stay stored but no longer show.

## 4orbs pages cited

4orbs pages the game cites beyond the corrected Part Three and the measurement page. Each is linked from the source card of every step it is used in. A step it is weighed for under **Source choices** is marked "weighed under Source choices", and the page is linked there.

| Page | Reviewed by 4orbs | Used in |
| --- | --- | --- |
| [Miley 2016 page](https://4orbs.com/research/miley-2016-fusion/) | Yes | Fuel; Ignite (weighed under Source choices) |
| [Dense Plasma Focus 101](https://4orbs.com/science/101/dense-plasma-focus/) | Yes | Ignite |
| [Ion Pumpy Thing as DPF Fusion Device](https://4orbs.com/library/theories/ion-pumpy-thing-as-dpf-fusion-device/) | No | Ignite, Fuel |
| [Ion Pumpy Thing as Compact Fusion Reactor](https://4orbs.com/library/theories/ion-pumpy-thing-as-compact-fusion-reactor/) | No | Ignite, Fuel |
| [Four Orbs Teleportation Mechanism](https://4orbs.com/library/theories/four-orbs-teleportation-mechanism/) | No | Converge |
| [Plasma orbs as dynamic Casimir effect generators](https://4orbs.com/library/theories/plasma-orbs-as-dynamic-casimir-effect-generators/) | No | Open |
| [Electron Screening for Low-Temperature Fusion](https://4orbs.com/library/theories/electron-screening-for-low-temperature-fusion/) | No | Fuel |

The bodies of the Miley 2016 page, the Dense Plasma Focus 101 page, both ion pumpy pages, the teleportation-mechanism page, the dynamic Casimir page and the electron-screening page name the flight. Their addresses and titles don't, so the correction policy allows them.

## Papers used in the lessons

Each is cited by a 4orbs page and linked from the lesson's source card.

| Paper | Cited on | Used in | Link |
| --- | --- | --- | --- |
| Park et al., *High Energy Electron Confinement in a Magnetic Cusp Configuration*, Physical Review X (2015) | [Polywell page](https://4orbs.com/research/polywell-bussard/) | Hold | [arXiv:1406.0133](https://arxiv.org/abs/1406.0133) |
| Miley, *Inertial Electrostatic Confinement Fusion*, DIA report (March 2010) | [AAWSAP registry](https://4orbs.com/research/aatip/) | Fuel | [PDF](https://www.war.gov/medialink/ufo/sept-18/release-06/assets/DOW-UAP-D125_AAWSA-DIRD-Inertial-Electrostatic-Confinement-Fusion-March-10-2010.pdf) |
| Knecht, Thomas, Mead, Miley and Froning, *Propulsion and Power Generation Capabilities of a Dense Plasma Focus (DPF) Fusion System for Future Military Aerospace Vehicles*, AIP Conference Proceedings 813 (2006) | [Miley 2016 page](https://4orbs.com/research/miley-2016-fusion/) | Fuel | [doi:10.1063/1.2169306](https://doi.org/10.1063/1.2169306) |
| Luo, Shrestha, Miley and Violante, *Enhancement of Nuclear Reactions Due to Screening Effects of Core Electrons*, in Hagelstein and Chubb (eds), *Condensed Matter Nuclear Science*, proceedings of the 10th International Conference on Cold Fusion, Cambridge, Massachusetts, August 2003 (World Scientific, 2005) | [Electron-screening theory page](https://4orbs.com/library/theories/electron-screening-for-low-temperature-fusion/), as Miley's core-electron screening paper | Fuel | [doi:10.1142/9789812701510_0061](https://doi.org/10.1142/9789812701510_0061) |
| Morris and Thorne, *Wormholes in spacetime and their use for interstellar travel*, American Journal of Physics (1988) | Corrected Part Three | Open, ledger | [doi:10.1119/1.15620](https://doi.org/10.1119/1.15620) |
| Lamoreaux, *Demonstration of the Casimir Force in the 0.6 to 6 μm Range*, Physical Review Letters (1997) | [Sonny White page](https://4orbs.com/research/sonny-white-casimir/) | Open | [doi:10.1103/PhysRevLett.78.5](https://doi.org/10.1103/PhysRevLett.78.5) |
| Gao, Jafferis and Wall, *Traversable Wormholes via a Double Trace Deformation*, JHEP (2017) | Corrected Part Three (unnamed there) | Open | [arXiv:1608.05687](https://arxiv.org/abs/1608.05687) |
| Jafferis et al., *Traversable wormhole dynamics on a quantum processor*, Nature (2022) | Corrected Part Three (unnamed there) | Open | [Nature](https://www.nature.com/articles/s41586-022-05424-3) |
| Davis, *Traversable Wormholes, Stargates, and Negative Energy*, DIA report (April 2010) | Corrected Part Three; AAWSAP registry | Open, Converge | [PDF](https://www.war.gov/medialink/ufo/sept-18/release-06/assets/DOW-UAP-D139_AAWSAP-DIRD-Traversable-Wormholes-Stargates-and-Negative-Energy-April-6-2010.pdf) |

## Verification status

- Park et al.: the arXiv abstract was read on 20 November 2026. The lesson uses its stated result, that confinement is enhanced in a magnetic cusp when beta is of order one. No paper-specific loss curve is implemented.
- Eric Davis, *Traversable Wormholes, Stargates, and Negative Energy* (April 2010), is linked in the site's [AAWSAP registry](https://4orbs.com/research/aatip/). The PDF could not be fully retrieved: one reader returned HTTP 403 and another rejected the file above its 50 MiB limit. Exact table headings, units and geometry were not independently checked.
- George Miley, *Inertial Electrostatic Confinement Fusion* (March 2010), is linked in the same registry. Its PDF returned HTTP 403. No numerical curve from it is claimed.
- Knecht et al. (2006): the publisher's abstract was read on 21 November 2026; the full text is paywalled. The lesson uses only its stated scope, a parametric study of a p-11B dense plasma focus as the power and propulsion of an air-breathing aerospace plane, and labels it Theory. No figure from it is claimed.
- The pages under **4orbs pages cited** were read on 21 November 2026.
- For the Ignite lesson, both ion pumpy theory pages, the Miley 2016 page and the Dense Plasma Focus 101 page were read in full on 21 November 2026. Both theory pages carry the same glossary entry for the schematic, which lists among the labels Forbes reads off the image a piston with "full command of adiabatic pressure". The compact-reactor page has the schematic's reactor power the orbs, and credits its air-breathing design with letting them operate indefinitely. Neither page says in so many words that the piston is what lets the reactor run continuously: the lesson joins the two readings, as spec #25 decided, under the 4orbs account label. The contrast it draws, that a laboratory dense plasma focus fires once, is the Dense Plasma Focus 101 page's, and the lesson links that page where it says so; the page's further point, that the machine then recharges, stays under **Source choices**. The front that holds the plasma pressed toward the middle of the jar while the pressure is in its band draws the piston's command of the pressure; it is the lesson's claim, not a new one.
- The dynamic Casimir theory page was read in full on 21 November 2026. The Open lesson takes its main claim: the orbs generate negative energy by the dynamic Casimir effect, collapsing a plasma bubble fast to convert vacuum fluctuations into real photons and negative energy. It also takes a supporting claim that high-beta plasmoids act like moving Casimir surfaces, which the lesson gives as the bubble's plasma wall. "Plasma cavity" is the game's name for the view, not the page's term. The page names no paper for the dynamic Casimir experiments, so the game makes no Lab physics claim for them.
- The electron-screening theory page was read in full on 21 November 2026. The Fuel lesson takes its main claim, that flooding the fuel with electrons screens the Coulomb barrier so fusion goes at lower temperatures, and its supporting point that this lets compact orbs keep fusion going without massive heat; both are labelled 4orbs account. The lesson gives that point as fusion with far less heat than the orb would otherwise need, so it stays true beside the Game rule, under which a screened hydrogen + boron-11 burn still takes hundreds of millions of kelvin. The page speaks of fusion in general, naming no one fuel, so screening applies to both of the Fuel step's fuels. The page puts the gain at orders of magnitude, and one of its claims says five; the game takes neither figure, and how much screening helps is the Game rule. It also credits unnamed Chinese research on high-density electrons, and its reference list pairs Salvatore Pais with that research; neither is cited. Its claim that undulators synchronise electron bunches is left out (see **Fuel: the undulator**).
- The page names Miley's paper as "Enhancements of nuclear reactions due to screening effects of core electrons" and marks it speculative there; that mark stays in this register. Its 4orbs reference entry, read on 21 November 2026, names only George Miley and gives no co-authors, year, venue or identifier, so the paper was matched by author and topic: a paper with Miley among its authors on the screening of nuclear reactions by core electrons, whose title differs from the page's by one letter. That record is Luo, Shrestha, Miley and Violante (2003 conference, 2005 proceedings, doi:10.1142/9789812701510_0061), whose abstract on the publisher's page was read on 21 November 2026; the full text is paywalled. The abstract covers screening by the core electrons of metal atoms in two reactions, deuteron fusion and proton capture by lattice nuclei, and reports a significant enhancement in both. The lesson uses only that scope, labelled Theory, and claims no figure from it.

The throat display uses the corrected episode's figure from the DIA report, about 70 Jupiter masses for a 100 m wormhole, scaled linearly as `0.7 × width`. The source card says so.

## Correction policy

Use only concepts and papers present on 4orbs.com ([ADR 0002](adr/0002-4orbs-theory-pages-count-as-sources.md)). That covers:
- the reviewed pages: the corrected Part Three, the measurement page, and `/research/` and `/science/101/`
- the auto-generated `/library/theories/` pages
- a stream, once it has a `/library/videos/` page

Do not cite a page whose address or title names the flight.

Attribute each claim to its source and label it as above. A theory page's reading is 4orbs account; published physics it relies on keeps its own label, cited to the paper. Mark unreviewed pages in this register, never in player-facing text. A page being fetched recently does not prove its wording is corrected.

The corrected episode takes precedence over older summaries where they conflict. Where a reviewed page and a theory page disagree, use whichever makes the Teleport possible. Theory may be added to reviewed data where the reviewed data alone would stop short. Record each such choice under **Source choices** below: both pages, what each says, and why the game takes the one it does.

Do not reinstate claims that beta one proves self-sustaining fusion, that FRCs need no external support, or that the p-B11 main reaction excludes all neutron-producing side reactions. Do not equate the observed Casimir force with a demonstrated macroscopic wormhole.

The runtime `SOURCES` array maps these sources to six expandable lesson cards. Updating scientific content requires updating this register and its source revision. A changed source revision invalidates old in-progress saves rather than silently resuming an experiment under different assumptions.

## Source choices

Where a reviewed page and a theory page disagree, each choice is recorded here when its lesson changes. The choices decided for lessons not yet changed are in spec #25.

### Ignite: the pump as the piston, for continuous operation

- The theory pages [Ion Pumpy Thing as DPF Fusion Device](https://4orbs.com/library/theories/ion-pumpy-thing-as-dpf-fusion-device/) and [Ion Pumpy Thing as Compact Fusion Reactor](https://4orbs.com/library/theories/ion-pumpy-thing-as-compact-fusion-reactor/) list, among the labels Forbes reads off the schematic, a piston with "full command of adiabatic pressure". The compact-reactor page has the reactor power the orbs and operate indefinitely.
- The reviewed [Miley 2016 page](https://4orbs.com/research/miley-2016-fusion/#ion-pumpy-schematic) records Forbes reading that label straight off the drawing (video `70M-6hMUZEk`, 20:29), but finds no source for it: the adiabatic-piston annotation is in neither the Tarditi NIAC report nor the 2006 dense plasma focus paper, and the NIAC report's "magnetic piston" compresses an ion beam, a different thing. It rates the annotation's source an open question. The reactor in Miley's 2016 paper runs in pulsed mode, each shot giving more energy than it took, not as a self-heating burn.
- The reviewed [Dense Plasma Focus 101](https://4orbs.com/science/101/dense-plasma-focus/) page says laboratory machines fire once and then recharge, so an orb would have to run repetitively rather than in single shots. It has the machine do its own compression: the current sheet's own field drives the plasma inward, with no external magnet, and it names no piston.
- The game takes the theory pages' reading, labelled 4orbs account: the pump plays the schematic's piston, compressing the plasma in full command of its pressure, so the orbs can run continuously rather than fire once. Neither theory page ties the piston to continuous running in so many words, so the lesson joins their readings: the DPF page's piston and the compact-reactor page's reactor that powers the orbs indefinitely. It draws the contrast with the Dense Plasma Focus 101 page's laboratory machines, which fire once, and links that page there. ADR 0002 lets theory fill in where the reviewed data alone stops short. The orbs must stay powered through the Teleport, and a machine that fires once and then recharges would not keep them so. The hand pump as the control, the pressure band and the 3 seconds in it are Game rule. No sentence claims self-sustaining fusion. The reviewed pages' caution stays here, not in player text.

### Fuel: the ion pumpy schematic as a working dense plasma focus

- The theory pages [Ion Pumpy Thing as DPF Fusion Device](https://4orbs.com/library/theories/ion-pumpy-thing-as-dpf-fusion-device/) and [Ion Pumpy Thing as Compact Fusion Reactor](https://4orbs.com/library/theories/ion-pumpy-thing-as-compact-fusion-reactor/) read the schematic as a working dense plasma focus reactor that breathes air, burns boron-11 and powers the orbs.
- The reviewed [Miley 2016 page](https://4orbs.com/research/miley-2016-fusion/#ion-pumpy-schematic) records Forbes calling it the dense plasma focus Miley talks about (video `70M-6hMUZEk`, 14:07) and documents Miley's 2006 dense plasma focus study. It calls the air intake Forbes's inference (22:51), traces the drawing's annotations to open aneutronic-fusion literature, does not treat the image as evidence that a device was built, and rates that claim Unestablished.
- The Fuel source card's "it breathes air and burns boron-11, and it powers the orbs" therefore goes past the reviewed page: it is the theory pages' reading. The game takes that reading, labelled 4orbs account, because the orbs need power on board for the Teleport. The 2006 study is labelled Theory and cited to its paper. The reviewed page's caution stays here, not in player text.

### Fuel: the undulator

- The theory page [Ion Pumpy Thing as Compact Fusion Reactor](https://4orbs.com/library/theories/ion-pumpy-thing-as-compact-fusion-reactor/) lists undulators among the schematic's components.
- The reviewed [Miley 2016 page](https://4orbs.com/research/miley-2016-fusion/#ion-pumpy-schematic) says the list naming undulator rings came from a summary Forbes asked a voice assistant to generate (28:04), which he then checked against his own reading. It finds no source for the undulator annotation.
- The theory page [Electron Screening for Low-Temperature Fusion](https://4orbs.com/library/theories/electron-screening-for-low-temperature-fusion/) carries a claim that undulators synchronise electron bunches for coherent output. The Fuel step takes that page's screening reading and not this claim.
- The game leaves the undulator out because the Teleport doesn't need it: no page puts it in the chain that opens the throat.

### Orbit, Converge: three orbs, not four

- The corrected Part Three counts three objects round the airliner, and quotes Forbes that three orbs converging produce a wormhole. The measurement page fits three objects in one rigid triangle. The teleportation-mechanism theory page is titled for four orbs and its opening sentence says four, but the one claim on it that counts the orbs says three converge on the plane. The game keeps three: the corrected episode takes precedence, the theory page's own claim agrees with it, and three is the Formation the player matches in Orbit and closes in Converge to open the throat.

### Converge: the Teleport, not "teleport or annihilate"

- Two claims on the teleportation-mechanism theory page say the orbs either teleported or annihilated the airliner; spec #25 found the same pairing on other theory pages. The corrected Part Three reads the flash as removing the aircraft rather than destroying it, taken through a wormhole, and the same theory page's title, opening sentence and constant-speed claim describe a teleport. The game takes the Teleport: it is the goal of a run, and the transit view needs an airliner that crosses the throat. Annihilation would leave nothing to cross.

No full dataset has been imported. Any later import must preserve the attribution and reuse terms stated on the [open-data page](https://4orbs.com/data/), currently CC BY-NC-SA 4.0, and record original classifications separately from reviewed scientific status.
