# Corrected source register

Reviewed on 20 November 2026 PT. Source revision: `4orbs-part3-corrected-2026-11-25m24s-transit1`.

The narrative baseline is the live [corrected November 2026 Part Three](https://4orbs.com/the-vanishing/part-3-the-science/), duration 25:24, video identifier `_gzWIv7uABs`. The 19:38 April edition returned by an earlier search cache is excluded. The live page was retrieved twice during review. The [homepage correction notices](https://4orbs.com/) document replacement of the older episode.

The second source is the live [measurement page](https://4orbs.com/research/satellite-videos/measurements/). Its observations are attributed to 4orbs. They are not independently verified by this game. In particular, the page states limits concerning scale, assumed aircraft speed, depth ambiguity, and the absence of a calibrated thermal scale.

## Stage mapping

| Stage | Source section | What the game demonstrates | Model limits |
| --- | --- | --- | --- |
| Ignite | Corrected Part Three, 6:07 | Separate electron and ion behaviour, glow colour | Pressure, temperatures and glow thresholds are illustrative. They are not a calibrated discharge model. |
| Hold | Corrected Part Three, 7:40 and 10:15 | Pressure balance and external confinement | Beta is computed as plasma pressure divided by magnetic pressure. Drift, the target band and loss threshold are game rules. The generic coils are not a Polywell or FRC simulation. |
| Fuel | Corrected Part Three, 10:15 | Charged versus neutral reaction products; differing fuel requirements | The reaction curves, thresholds and exposure rate are illustrative. p-B11 side reactions are acknowledged but not simulated. No measured-yield percentage is claimed. |
| Orbit | Measurement page, rigid formation and camera fit | One equilateral formation in two projections | Reported radius, period and camera ranges guide a synthetic reconstruction. The fixed 24° tilt and 11-second tumble are illustrative, not imported tracks. |
| Open | Corrected Part Three, 16:51 | Plate gap/area relationship; scale comparison; a conditional open throat | Ideal parallel-plate energy magnitude uses `π² ħ c A / (720 d³)`. This omits real-material, edge and temperature effects. Linear throat scaling is illustrative. |
| Converge | Corrected Part Three, 16:51; measurement page, final frames and scale | The player's formation converges; both cameras share one scene; a separate transit diagram shows geometric clearance | Triggering a throat from three orbs is an explicit scenario assumption. False colour and the flash are illustrations, not predicted sensor output. Crossing a fixed entrance is a separate kinematic illustration, not a measured trajectory or a travel-time prediction. |

## Transit diagram assumptions

Fresh live reads on 20 November reconfirmed the corrected episode's 25:24 duration and the measurement page's qualifications. The measurement page uses a 63.7 m fuselage to set its conditional 777 scale. For the cold-patch analysis it assumes 250 m/s cruise speed, explicitly noting that the video cannot supply the aircraft's forward speed. The diagram uses that assumption instead of the old game's unsupported 905 km/h value.

The aircraft drawing retains its assumed 60.9 m span. For a centred aircraft and a transverse entrance of width `w`, per-wing clearance is `(w - 60.9) / 2`. Passage of a 63.7 m fuselage past a fixed entrance at 250 m/s takes `63.7 / 250 = 0.2548 s`. Neither calculation supplies a wormhole interior, destination, travel time, or evidence of a crossing. The diagram clips the aircraft at the entrance and leaves the other side unspecified. Its playback lasts 1.6 seconds for inspection; that is display time only.

This source revision invalidates prior in-progress saves with an on-screen explanation. Personal best scores remain compatible because the scoring rule and active sequence duration have not changed.

## Linked papers and verification status

- Park et al., *High-Energy Electron Confinement in a Magnetic Cusp Configuration*, Physical Review X (2015), is identified by the site's [Polywell page](https://4orbs.com/research/polywell-bussard/). Full text was not retrieved in this review. No paper-specific loss curve is implemented.
- Morris and Thorne's 1988 traversable-wormhole work is discussed in corrected Part Three. It is classified as theory, separately from laboratory observations.
- Eric Davis, *Traversable Wormholes, Stargates, and Negative Energy* (April 2010), is linked in the site's [AAWSAP registry](https://4orbs.com/research/aatip/). The PDF could not be fully retrieved: one reader returned HTTP 403 and another rejected the file above its 50 MiB limit. Exact table headings, units and geometry were not independently checked.
- George Miley, *Inertial Electrostatic Confinement Fusion* (March 2010), is linked in the same registry. Its PDF returned HTTP 403. No numerical curve from it is claimed.

The throat display now uses the corrected episode's approximate 70 Jupiter masses per 100 m as `0.7 × width`. Both the UI and source card identify this as illustrative scaling. This replaces the previous unexplained `0.709` coefficient and claim of direct table provenance. It is not a general wormhole sizing equation.

## Correction policy

Use only concepts and papers present on 4orbs.com. A page being fetched recently does not prove its wording is corrected. The corrected episode takes precedence over older summaries where they conflict. Record the conflict; do not blend statements into a stronger claim.

Do not reinstate claims that beta one proves self-sustaining fusion, that FRCs need no external support, or that the p-B11 main reaction excludes all neutron-producing side reactions. Do not equate the observed Casimir force with a demonstrated macroscopic wormhole.

The runtime `SOURCES` array maps these sources to six expandable lesson cards. Updating scientific content requires updating this register and its source revision. A changed source revision invalidates old in-progress saves rather than silently resuming an experiment under different assumptions.

No full dataset has been imported. Any later import must preserve the attribution and reuse terms stated on the [open-data page](https://4orbs.com/data/), currently CC BY-NC-SA 4.0, and record original classifications separately from reviewed scientific status.
