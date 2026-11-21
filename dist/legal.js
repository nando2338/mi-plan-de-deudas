/* Muestra la versión en español o en inglés de una página legal. Lee el idioma de la app; nunca escribe en el almacenamiento. */
(function () {
  "use strict";
  var KEY = "deudas-lang-v1";
  var lang = "es";
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === "es" || saved === "en") lang = saved;
    else if (!/^es\b/i.test(navigator.language || "") && /^en\b/i.test(navigator.language || "")) lang = "en";
  } catch (_) {}
  function apply(l) {
    lang = l;
    document.documentElement.lang = l;
    var secs = document.querySelectorAll("main > section[lang]");
    for (var i = 0; i < secs.length; i++) secs[i].hidden = secs[i].lang !== l;
    var ns = document.querySelectorAll("[data-es][data-en]");
    for (var j = 0; j < ns.length; j++) ns[j].textContent = ns[j].getAttribute("data-" + l);
    var bs = document.querySelectorAll("[data-lang]");
    for (var k = 0; k < bs.length; k++) bs[k].setAttribute("aria-pressed", String(bs[k].getAttribute("data-lang") === l));
    var h1 = document.querySelector("main > section:not([hidden]) h1");
    if (h1) document.title = h1.textContent;
    document.dispatchEvent(new CustomEvent("legal-lang", { detail: l }));
  }
  var bs = document.querySelectorAll("[data-lang]");
  for (var i = 0; i < bs.length; i++)
    bs[i].addEventListener("click", function () {
      var l = this.getAttribute("data-lang");
      apply(l);
    });
  apply(lang);
})();
