// Globals set by the Google Analytics loader in ga4.js.
interface Window {
  dataLayer: unknown[];
  gtag: (...args: unknown[]) => void;
}

// One camera's view in a 3D frame: the part of the canvas it fills (from `left`, `width` wide,
// the full height, in CSS pixels), where on the canvas the scene's origin falls, its camera, and
// the scene list it draws (docs/adr/0003, docs/adr/0004).
interface SceneView {
  left: number, width: number, origin: [number, number],
  camera: { angle: number, scale: number },
  look?: 'heat' | 'visible' | 'lab' | 'diagram',
  list: any[]
}

// Set by view3d.js, the 3D view's renderer, which the game loads after its first flat frame.
interface Window {
  IonView3D: {
    start(canvas: HTMLCanvasElement, options: { props: { airliner: string }, onLost: () => void }): Promise<{
      draw(frame: { width: number, height: number, pixelRatio: number, look: 'heat' | 'visible' | 'lab' | 'diagram', views: SceneView[] }): void
    }>
  };
}
