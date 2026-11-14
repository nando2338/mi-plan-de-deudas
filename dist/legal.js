/* Shows the Spanish or English version of a legal page. Reads the app language; never writes storage. */
(function () {
  "use strict";
  let lang = "es";
  try {
    const saved = localStorage.getItem("deudas-lang-v1");
    if (saved === "es" || saved === "en") lang = saved;
    else if (!/^es\b/i.test(navigator.language || "") && /^en\b/i.test(navigator.language || "")) lang = "en";
  } catch (_) {}
  function apply(l) {
    lang = l;
    document.documentElement.lang = l;
    for (const s of document.querySelectorAll("main > section[lang]")) s.hidden = s.lang !== l;
    for (const n of document.querySelectorAll("[data-es][data-en]")) n.textContent = n.dataset[l];
    for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === l));
    const h1 = document.querySelector("main > section:not([hidden]) h1");
    if (h1) document.title = h1.textContent + (l === "en" ? " · My Debt Plan" : " · Mi Plan de Deudas");
  }
  for (const b of document.querySelectorAll("[data-lang]")) b.addEventListener("click", () => apply(b.dataset.lang));
  apply(lang);
})();
