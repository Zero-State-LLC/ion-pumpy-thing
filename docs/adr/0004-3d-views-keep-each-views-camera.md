# 3D views keep each view's camera

Status: accepted

A 3D view uses the camera its flat view already draws: the same angle, and an orthographic projection. Heat-camera views shade every surface by temperature on the game's thermal scale, so the 3D look stays the visual world the layout already describes. We chose orthographic because the game's own camera model (`camB`) is orthographic, and because only an orthographic view keeps the 50 m scale bar true across the screen at every depth. A perspective camera would draw a view that no lesson describes.

## Considered options

- **Perspective cameras**: more depth on screen, but sizes would change with distance, and the scale bar would be right at one depth only.
- **Realistic lab lighting and textures**: a second visual world beside the heat camera, and one that the lessons don't describe.

## Consequences

- Where a camera is part of a claim, such as Orbit's two cameras and the angle between them, the 3D view uses exactly that camera.
- Only heat-camera views use the thermal scale. Converge's Visible view stays visible light, where the flash is bright as its Measured lesson says, and diagrams such as the transit diagram stay schematic.
- Props bring shape only. Heat-camera views colour them by temperature, so Meshy is asked for untextured models.

## Thermal-scale design-rule precedence (accepted 22 November 2026 PT)

The owner explicitly chose to keep the existing multicolour thermal scale for the scientific views, even though Hallmark v2's generic static Floor-2a rule flags its purple/pink gradient. The scale carries heat information and must not be changed solely to clear an aesthetic lint failure. The alternative, an untested single-hue mapping, risks changing the visual information the lesson teaches. Record the Hallmark **static FAIL** plainly, without waiving or relabeling it as compliant. Require independently passing rendered accessibility and scientifically consistent heat mapping. Any future palette replacement needs a separate source, design and accessibility review.

## Orbit camera sensor parity (accepted 22 November 2026 PT)

The owner chose to depict Orbit Camera 1 as the **visible overhead satellite view** and Orbit Camera 2 as a **side-on thermal-camera reconstruction**, matching the distinctions attributed to the two videos in the corrected 4orbs measurement account. Both the flat view and the 3D scene must apply the same per-camera presentation while keeping the existing orthographic projection, measured camera-angle controls, positions and scale. The labels must distinguish a simulated thermal palette from a calibrated temperature measurement. We rejected keeping both as visible-light diagrams because that hides the reported sensor distinction. This is a separately reviewed rendering task, not a silent change to scientific geometry or an authorization to deploy.
