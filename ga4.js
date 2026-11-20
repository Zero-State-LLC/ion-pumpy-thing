// First-party GA4 loader. gtag.js is injected only on the production host.
// Previews, tests, and any other hostname do not contact Google.
(function () {
  var host = location.hostname;
  if (host !== "ion-pumpy-thing.app") return;
  var id = "G-TEC2RE9FGC";
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", id);
  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + id;
  document.head.appendChild(script);
})();
