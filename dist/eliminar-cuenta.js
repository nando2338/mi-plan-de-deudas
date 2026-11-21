/* Formulario público de solicitud de eliminación. Guarda el correo en la tabla solicitudes_eliminacion
   (solo insertar; nadie puede leerla desde el navegador). Siempre muestra el mismo mensaje:
   nunca dice si el correo tiene cuenta. */
(function () {
  "use strict";
  var MSG = {
    es: { ok: "Recibimos tu solicitud; la procesaremos en máximo 30 días.", bad: "Escribe un correo electrónico válido.", err: "No pudimos enviar la solicitud. Inténtalo de nuevo o escribe a privacy@solvipath.com.", wait: "Enviando…" },
    en: { ok: "We received your request; we will process it within 30 days at most.", bad: "Enter a valid email address.", err: "We could not send the request. Try again or write to privacy@solvipath.com.", wait: "Sending…" },
  };
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function cfg() {
    var c = window.MPDD_CONFIG || {};
    return /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(String(c.supabaseUrl || "")) && /^sb_publishable_/.test(String(c.supabaseKey || "")) ? c : null;
  }
  function wire(suffix, lang) {
    var form = document.getElementById("delete-form" + (suffix ? "-" + suffix : ""));
    if (!form) return;
    var email = form.querySelector('input[type="email"]');
    var trap = form.querySelector('input[name="site"]');
    var btn = form.querySelector("button");
    var msg = form.querySelector(".delete-msg");
    function say(text, err) {
      msg.hidden = false;
      msg.className = "delete-msg" + (err ? " err" : "");
      msg.textContent = text;
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var value = email.value.trim().toLowerCase();
      if (!EMAIL.test(value) || value.length > 254) return say(MSG[lang].bad, true);
      // Un robot que llena el campo oculto recibe el mismo mensaje de éxito, pero no se guarda nada.
      if (trap && trap.value) return say(MSG[lang].ok, false);
      var c = cfg();
      if (!c) return say(MSG[lang].err, true);
      btn.disabled = true;
      say(MSG[lang].wait, false);
      fetch(c.supabaseUrl + "/rest/v1/solicitudes_eliminacion", {
        method: "POST",
        headers: { apikey: c.supabaseKey, Authorization: "Bearer " + c.supabaseKey, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ correo: value, idioma: lang }),
      })
        .then(function (r) {
          btn.disabled = false;
          if (r.ok) {
            email.value = "";
            say(MSG[lang].ok, false);
          } else say(MSG[lang].err, true);
        })
        .catch(function () {
          btn.disabled = false;
          say(MSG[lang].err, true);
        });
    });
  }
  wire("", "en");
  wire("es", "es");
})();
