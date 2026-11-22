// Globals set by the Google Analytics loader in ga4.js.
interface Window {
  dataLayer: unknown[];
  gtag: (...args: unknown[]) => void;
}

// Set by view3d.js, the 3D view's renderer, which the game loads after its first flat frame.
interface Window {
  IonView3D: {
    start(canvas: HTMLCanvasElement, options: { props: { airliner: string }, onLost: () => void }): Promise<{
      draw(frame: { width: number, height: number, pixelRatio: number, look: 'heat' | 'visible' | 'diagram', camera: { angle: number, scale: number }, list: any[] }): void
    }>
  };
}
