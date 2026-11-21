// Globals set by the Google Analytics loader in ga4.js.
interface Window {
  dataLayer: unknown[];
  gtag: (...args: unknown[]) => void;
}
