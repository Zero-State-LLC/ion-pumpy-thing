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
