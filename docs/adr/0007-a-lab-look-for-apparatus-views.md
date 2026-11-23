# A lab look for apparatus views

Status: accepted 22 November 2026 (PT). Amends [ADR 0004](0004-3d-views-keep-each-views-camera.md), which rejected "realistic lab lighting and textures" for every view.

The visual audit ([docs/VISUAL-AUDIT.md](../VISUAL-AUDIT.md)) found that the 3D view reproduces the flat view and adds nothing: the views that depict real apparatus (the glass jar and hand pump in Ignite, the vacuum chamber and coils in Hold, the reactor core in Fuel, the Casimir plates in Open) draw their props as flat, unlit fills. The owner chose to add a fourth look, **lab**: visible light, key, fill and rim lights, and materials chosen by prop kind (glass, copper, brushed and polished metal). Ignite, Hold, both Fuel views and Open-plates switch to it. Everything else ADR 0004 decided stays: orthographic cameras from the flat view, the thermal scale for heat views, untextured props so heat views can colour them, and the scene list as the only source of what is drawn.

## Considered options

- **Keep everything unlit**: faithful to ADR 0004 as written, but leaves the 3D view with no reason to exist.
- **Light and texture every view**: the option ADR 0004 rejected, and still rejected: heat views would lose the thermal scale's meaning, and diagrams (Open-cavity, the transit diagram) depict an idea, not hardware, and carry a "not to scale" mark that lighting would contradict.
- **A lit look only where the lesson shows apparatus** (chosen): the lesson's own distinction, hardware versus schematic, decides which views are lit.

## Consequences

- The look is chosen per view in the scene list, like the other three. A view switches look by changing one entry, not the renderer.
- The flat view stays a diagram. It draws the same state (the same props, labels, pressure band and scale bar) and a different picture; the two views are no longer expected to match pixel for pixel, only in what they show.
- Open-cavity and the transit diagram stay `diagram`. Orbit, Throat and Converge stay `visible` or `heat` and are untouched.
- Props still bring shape only. Lab materials are assigned by prop kind in the renderer, not baked into the model, so a prop drawn by a heat view is still colourable by temperature.
