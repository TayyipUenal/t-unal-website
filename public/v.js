/* Visitor count for arbeitssicherheitscout.de: reports the page to tayyipuenal.de. No cookies, nothing stored in the browser. */
(function () {
  try {
    fetch("https://www.tayyipuenal.de/api/visit", {
      method: "POST",
      mode: "cors",
      keepalive: true,
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ path: location.pathname, ref: document.referrer, q: location.search }),
    }).catch(function () {});
  } catch (e) {}
})();
