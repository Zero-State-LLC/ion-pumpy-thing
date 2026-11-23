# Visual audit: baseline

Status: **audit of `main` at `0a4fe83`, 22 November 2026 (PT). No game change.**
Evidence: `docs/visual-audit/baseline/` (44 screenshots and `index.json`), captured by `tools/visual-capture.mjs` from the `completed-run` fixture in headless Microsoft Edge 158.0.4370.33 on an NVIDIA GeForce RTX 5060 Ti (ANGLE D3D11), in a 1280 × 800 desktop window at 1× and a 390 × 844 phone window at 2×, each scene in the flat view and the 3D view. Contact sheets: `docs/visual-audit/sheet-3d.png`, `sheet-flat.png`, `sheet-3d-phone.png`.

What this audit is not: a device test (ADR 0006 keeps iOS Safari, Android Chrome, VoiceOver and TalkBack with human testers), a rights review (ADR 0005), or a copy review (#81). Motion and game feel are judged from the running game during capture and from the renderer's code, not from the stills alone; stills can't show flicker, easing or response to input, so those rows are marked as such.

## Scoring

0 = absent, 1 = placeholder, 2 = functional, 3 = competent, 4 = polished, 5 = premium. One row per scene the browser check draws in 3D. The 3D column scores the 3D view; the flat view is scored once, below the table.

| Scene (look) | Materials | Lighting | Depth and composition | Effects (plasma, field, energy) | Readability and science clarity | Motion and feel | Draw cost, desktop (median / p95 ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ignite, glass jar and pump (diagram) | 1 | 0 | 1 | 2 | 4 | 2 | 1.3 / 1.7 |
| Hold, plasma ball between coils (diagram) | 1 | 0 | 1 | 2 | 4 | 3 | 4.5 / 8.0 |
| Fuel, reactor core (diagram) | 1 | 0 | 1 | 2 | 4 | 2 | 0.7 / 0.8 |
| Fuel, with electron screening (diagram) | 1 | 0 | 1 | 2 | 4 | 2 | 0.7 / 0.9 |
| Orbit, camera 1 visible (visible) | 2 | 2 | 2 | 2 | 4 | 3 | 1.3 / 1.8 (both cameras) |
| Orbit, camera 2 thermal (heat) | 3 | n/a | 2 | 2 | 4 | 3 | (above) |
| Open, plates (diagram) | 1 | 0 | 1 | 2 | 4 | 2 | 0.2 / 0.4 |
| Open, throat (visible) | 2 | 2 | 2 | 2 | 4 | 2 | 0.3 / 0.5 |
| Open, plasma cavity (diagram) | 1 | 0 | 1 | 2 | 4 | 2 | 0.4 / 0.5 |
| Converge, thermal (heat) | 3 | n/a | 2 | 2 | 3 | 3 | 1.1 / 1.4 |
| Converge, visible (visible) | 2 | 2 | 2 | 2 | 4 | 3 | 0.3 / 0.5 |
| Converge, transit diagram (diagram) | 1 | 0 | 1 | 1 | 5 | 2 | 0.1 / 0.3 |

Flat view: materials and lighting n/a, depth 1, effects 2, readability 4, motion 2. It is the design the 3D view reproduces, so it is where the 3D view's ceiling currently sits.

Phone window: every scene is captured at 390 px; no clipping, no overflow and no page errors in any shot. Scores are the same as desktop; nothing degrades at phone size, and nothing improves.

## Findings, ranked by impact

1. **The 3D view is almost indistinguishable from the flat view.** Put `sheet-3d.png` beside `sheet-flat.png`: in nine of the eleven scenes the only differences are the faint prop silhouettes (vacuum chamber behind Hold's wall lines, the piston housing in Ignite, the plate mount in Open) and the airliner's shading in the two visible-look scenes. A player who turns on 3D view gets the same picture at the cost of a WebGL context. This is the finding that the rest follow from: the renderer was built to reproduce the flat view (ADR 0003's scene-list contract makes that the correct first target), and it does so faithfully, but nothing has yet been added on top of that reproduction.
2. **Diagram-look scenes are unlit.** Ignite, Hold, Fuel, Open-plates, Open-cavity and Transit use `MeshBasicMaterial`, so the five Meshy props and every primitive draw as flat fills: no normals, no edges, no depth. The vacuum chamber in Hold is navy on navy and nearly invisible; the coils are two flat orange capsules; the plates are two flat rectangles. These are the scenes that depict real laboratory apparatus (jar, pump, chamber, coils, Casimir plates), which is where lit materials would carry the most information, not the least.
3. **Plasma is a radial sprite.** Every plasma body (Ignite's glow, Hold's ball, Fuel's core, the orbs' formation glow) is a single soft radial gradient texture on a plane, with flat-dot specks around it. There is no internal structure, no filament, no edge turbulence and, in the stills, no time variation (the renderer animates the specks only). For a game whose subject is plasma, this is the most visible gap after finding 1.
4. **Fields and energy are lines.** Hold's cusp field is concentric ellipses and the cusp leaks are tube arcs rebuilt every frame with `swapGeometry` (which is also why Hold is the only scene over 2 ms); Fuel's field edge is a dashed circle; Open's gap glow is a gradient rectangle. All correct, all schematic, none suggesting a field.
5. **Converge thermal reads as a smudge.** The airliner is drawn cold (black on the thermal scale), which is scientifically consistent with the lesson, but at a 134° camera angle the cold mark is a black blob with no edge; at a glance it is not an aircraft. A thin outline at the scale's cold end, which the heat look already draws for other surfaces, would fix it without changing a single temperature.
6. **Visible-look scenes are Lambert-lit, single light.** Orbit cam 1, Throat and Converge-visible have an ambient and one directional light with `MeshLambertMaterial`. The airliner shows some form, but the shading is soft and the material is matte grey; no specular, no environment, no fresnel. Competent, not premium.
7. **No bloom, no depth cue, no atmosphere.** The visible flash in Converge is a white sprite; the clouds are flat grey ellipses; the backgrounds are solid tokens. There is no post-processing of any kind.
8. **Performance headroom is large.** Worst scene (Hold) 4.5 ms median / 8.0 ms p95 (4.4 / 5.3 in the phone window) on a desktop GPU; the rest under 1.5 ms. The budget for everything below is roughly 10 ms on this hardware before a 60 Hz frame is at risk, and much less on a phone GPU, where nothing has been measured (ADR 0006). The one existing hot spot, Hold's per-frame tube rebuild, should be fixed before anything is added to that scene.

What is right and must stay: the orthographic camera and the 50 m scale bar (ADR 0004); the thermal scale and its meaning (ADR 0004 precedence rule); the two Orbit cameras' sensor distinction (#89); all text on the 2D canvas; the scene-list contract (ADR 0003); the flat view; the labels and the "Schematic · not to scale" marks.

## What the upgrade should do, in slices

Each slice is a stacked PR with its failing test first, each needs the owner's go before it opens, and no slice merges without a separate yes. The decision that makes slices 3 and 4 possible is [ADR 0007](adr/0007-a-lab-look-for-apparatus-views.md), which amends ADR 0004: it keeps orthographic cameras, the thermal scale and scene-list rendering, and adds a lit **lab** look for the views that depict apparatus. The owner chose this (option b) on 22 November 2026 PT over keeping everything unlit (a) or lighting and texturing everything (c).

| Slice | Addresses | What changes | Verified by |
| --- | --- | --- | --- |
| 1 (this PR) | evidence | `tools/visual-capture.mjs`, this audit, baseline shots | the captures exist; `npm test` and the browser check unchanged |
| 2 | 3, 4, 8 | Plasma as a layered body: a core, a shell with noise-driven filaments and edge turbulence, driven by the same scene-list entries (kind, size, colour or heat); field lines that breathe; cusp leaks as a stable instanced mesh. Reduced motion freezes the noise. | node tests on the scene list (unchanged entries), browser check non-blank, capture set `slice-2`, Hold draw cost at or under baseline |
| 3 | 2, 5 | ADR 0007: the lab look. Ignite, Hold, Fuel and Open-plates get key, fill and rim lights and physically based materials (glass, brushed metal, copper coil, polished plate) chosen per prop kind; thermal views unchanged but gain the cold outline. Open-cavity and Transit stay diagrams. | per-look node tests, capture set `slice-3`, thermal-scale pixel check unchanged |
| 4 | 2 | Prop detailing in Blender (background scripts under `tools/blender/`, deterministic, outputs hash-registered in `docs/ASSETS.md`), plus a paid Meshy texture or refine pass where a prop's silhouette, not its surface, is the problem. | asset test (hashes, sizes, no textures in heat-look props), capture set `slice-4` |
| 5 | 6, 7, 8 | Selective bloom on emissive plasma and the flash only, fresnel on glass, a depth tint on far objects, quality levels (auto by GPU timing, overridable), and a regression capture per quality level. | capture set `slice-5` at each level, draw-cost table, browser check at 320 px |

Not in scope: the Orbit camera presentation (landed in #89), copy (#81), device qualification (ADR 0006), Meshy rights (ADR 0005, tracked separately), perspective cameras or textured heat-look props (ADR 0004).

## Decisions taken (22 November 2026 PT)

- Slice 3: Ignite, Hold, Fuel (both views) and Open-plates switch to the lab look; Open-cavity and Transit stay diagrams (ADR 0007).
- Slice 2: under reduced motion the plasma noise freezes at its first frame; the structure stays, the motion goes.
- Slice 4: Blender detailing first; a paid Meshy texture pass only on a prop whose surface is still the weak point after slice 3 lights it. The airliner is excluded (ADR 0004 keeps heat-look props untextured).
- Slice 5: three quality levels (low: no post; medium: fresnel and depth tint; high: adds selective bloom on emissive plasma and the flash), auto-picked from the first 60 frames' draw time, bloom on by default at desktop and off on phones under auto, with a per-device player override beside the 3D view switch.
- Phones: slices are gated on desktop timings and the 390 px emulated window (ADR 0006 keeps the physical-device rows Pending); the auto quality level protects phone GPUs at runtime.
