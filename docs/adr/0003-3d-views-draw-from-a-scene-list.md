# 3D views draw from a scene list the tests can read

Status: accepted

Each 3D view builds a scene list from the run's state on every frame: one entry for each thing on screen, giving its kind, its position and size in metres, and its colour. A standalone renderer draws the list with three.js on a WebGL canvas behind the 2D canvas, and all text stays on the 2D canvas. Node tests check the scene list the way they check 2D drawing calls under ADR 0001. Real Chrome checks that WebGL starts, draws a frame that isn't blank and logs no errors at 390 px and 320 px. Without WebGL, the 2D canvas draws the flat view instead. We chose this because the node harness can't run WebGL, and because the list states what the player sees in the game's own units.

## Considered options

- **Run three.js in the node harness against a stand-in WebGL**: every test would depend on three.js internals, and each three.js upgrade could break them.
- **Check the 3D views only in real Chrome, by screenshot**: slow, uneven across graphics hardware, and unable to say which object is where.
- **Test only the flat view**: the 3D views would go untested.

## Consequences

- In ADR 0001, "canvas drawing" now covers both the 2D drawing calls and the scene list.
- The game hands each frame's scene list to the renderer script. The test harness wraps the renderer before the game starts, as it wraps the sound engine, and records every list, so `window.__lab` stays as it is.
- The renderer holds no game rules. Anything a physics model shapes or moves reaches it through the list, so no claim can sit in the renderer where tests can't see it.
- A prop enters the list by kind and size only. Its mesh file is presentation.
- The flat view stays, with its tests, as the fallback.
