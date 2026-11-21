# Corrected source register

Reviewed on 20 November 2026 PT. Source revision: `4orbs-part3-corrected-2026-11-25m24s-transit1`.

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
| Ignite | Corrected Part Three, 6:07 | Separate electron and ion behaviour, glow colour | Pressure, temperatures and glow thresholds are illustrative. They are not a calibrated discharge model. |
| Hold | Corrected Part Three, 7:40 and 10:15; Polywell page | Beta, the Polywell cusp trap, Grad's high-beta boundary as tested by Park et al. (2015) | Beta is computed as plasma pressure divided by magnetic pressure. Drift, the target band and the loss above beta one are game rules. The coils are a simplified cusp. |
| Fuel | Corrected Part Three, 10:15; Polywell and AAWSAP pages | Charged versus neutral reaction products; the Polywell's virtual cathode; Miley's IEC report | The reaction curves, thresholds and exposure rate are simplified. p-B11 side reactions are stated but not simulated. |
| Orbit | Measurement page, rigid formation and camera fit | One equilateral formation in two projections | Reported radius, period and camera ranges guide a synthetic reconstruction. The fixed 24° tilt and 11-second tumble are illustrative, not imported tracks. |
| Open | Corrected Part Three, 16:51; Sonny White page; AAWSAP page | Morris–Thorne negative energy; the Casimir effect; Gao–Jafferis–Wall; the DIA report's throat table; the orbs as the source | Ideal parallel-plate energy uses `π² ħ c A / (720 d³)`. The throat scales the report's 70 Jupiter masses per 100 m linearly. The orbs supplying the energy is labelled Game rule. |
| Converge | Corrected Part Three, 16:51; measurement page, final frames and scale | Forbes's convergence account; the DIA report's bright spot and cooling; both cameras share one scene; a transit diagram shows clearance | Convergence opens the throat, as in the 4orbs account. False colour and the flash are drawn for viewing. The transit is a kinematic diagram; no destination is drawn because the account names none. |

## Transit diagram assumptions

Fresh live reads on 20 November reconfirmed the corrected episode's 25:24 duration and the measurement page's qualifications. The measurement page uses a 63.7 m fuselage to set its conditional 777 scale. For the cold-patch analysis it assumes 250 m/s cruise speed, explicitly noting that the video cannot supply the aircraft's forward speed. The diagram uses that assumption instead of the old game's unsupported 905 km/h value.

The aircraft drawing retains its assumed 60.9 m span. For a centred aircraft and a transverse entrance of width `w`, per-wing clearance is `(w - 60.9) / 2`. Passage of a 63.7 m fuselage past a fixed entrance at 250 m/s takes `63.7 / 250 = 0.2548 s`. Neither calculation supplies a wormhole interior, destination, travel time, or evidence of a crossing. The diagram clips the aircraft at the entrance and leaves the other side unspecified. Its playback lasts 1.6 seconds for inspection; that is display time only.

This source revision invalidates prior in-progress saves with an on-screen explanation. Personal best scores remain compatible because the scoring rule and active sequence duration have not changed.

## Papers used in the lessons

Each is cited by a 4orbs page and linked from the lesson's source card.

| Paper | Cited on | Used in | Link |
| --- | --- | --- | --- |
| Park et al., *High Energy Electron Confinement in a Magnetic Cusp Configuration*, Physical Review X (2015) | [Polywell page](https://4orbs.com/research/polywell-bussard/) | Hold | [arXiv:1406.0133](https://arxiv.org/abs/1406.0133) |
| Miley, *Inertial Electrostatic Confinement Fusion*, DIA report (March 2010) | [AAWSAP registry](https://4orbs.com/research/aatip/) | Fuel | [PDF](https://www.war.gov/medialink/ufo/sept-18/release-06/assets/DOW-UAP-D125_AAWSA-DIRD-Inertial-Electrostatic-Confinement-Fusion-March-10-2010.pdf) |
| Morris and Thorne, *Wormholes in spacetime and their use for interstellar travel*, American Journal of Physics (1988) | Corrected Part Three | Open, ledger | [doi:10.1119/1.15620](https://doi.org/10.1119/1.15620) |
| Lamoreaux, *Demonstration of the Casimir Force in the 0.6 to 6 μm Range*, Physical Review Letters (1997) | [Sonny White page](https://4orbs.com/research/sonny-white-casimir/) | Open | [doi:10.1103/PhysRevLett.78.5](https://doi.org/10.1103/PhysRevLett.78.5) |
| Gao, Jafferis and Wall, *Traversable Wormholes via a Double Trace Deformation*, JHEP (2017) | Corrected Part Three (unnamed there) | Open | [arXiv:1608.05687](https://arxiv.org/abs/1608.05687) |
| Jafferis et al., *Traversable wormhole dynamics on a quantum processor*, Nature (2022) | Corrected Part Three (unnamed there) | Open | [Nature](https://www.nature.com/articles/s41586-022-05424-3) |
| Davis, *Traversable Wormholes, Stargates, and Negative Energy*, DIA report (April 2010) | Corrected Part Three; AAWSAP registry | Open, Converge | [PDF](https://www.war.gov/medialink/ufo/sept-18/release-06/assets/DOW-UAP-D139_AAWSAP-DIRD-Traversable-Wormholes-Stargates-and-Negative-Energy-April-6-2010.pdf) |

## Verification status

- Park et al.: the arXiv abstract was read on 20 November 2026. The lesson uses its stated result, that confinement is enhanced in a magnetic cusp when beta is of order one. No paper-specific loss curve is implemented.
- Eric Davis, *Traversable Wormholes, Stargates, and Negative Energy* (April 2010), is linked in the site's [AAWSAP registry](https://4orbs.com/research/aatip/). The PDF could not be fully retrieved: one reader returned HTTP 403 and another rejected the file above its 50 MiB limit. Exact table headings, units and geometry were not independently checked.
- George Miley, *Inertial Electrostatic Confinement Fusion* (March 2010), is linked in the same registry. Its PDF returned HTTP 403. No numerical curve from it is claimed.

The throat display uses the corrected episode's figure from the DIA report, about 70 Jupiter masses for a 100 m wormhole, scaled linearly as `0.7 × width`. The source card says so.

## Correction policy

Use only concepts and papers present on 4orbs.com. Attribute each claim to its source and label it as above. A page being fetched recently does not prove its wording is corrected. The corrected episode takes precedence over older summaries where they conflict. Record the conflict; do not blend statements into a stronger claim.

Do not reinstate claims that beta one proves self-sustaining fusion, that FRCs need no external support, or that the p-B11 main reaction excludes all neutron-producing side reactions. Do not equate the observed Casimir force with a demonstrated macroscopic wormhole.

The runtime `SOURCES` array maps these sources to six expandable lesson cards. Updating scientific content requires updating this register and its source revision. A changed source revision invalidates old in-progress saves rather than silently resuming an experiment under different assumptions.

No full dataset has been imported. Any later import must preserve the attribution and reuse terms stated on the [open-data page](https://4orbs.com/data/), currently CC BY-NC-SA 4.0, and record original classifications separately from reviewed scientific status.

## Candidate material

A 21 November 2026 Ashton Forbes livestream, *Ion Pumpy Thing SOLVED — UFO Files 8*, reads the ion-pumpy schematic as a dense plasma focus. It is not on this register. Ideas that might later become game changes are recorded in [the UFO Files 8 proposal](proposals/ufo-files-8.md). Do not add its claims to lessons, source cards, or the ledger until a 4orbs.com page carries them and this revision is updated.
