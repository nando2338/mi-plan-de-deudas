/* 1.8 "Enviar sugerencia": a small dialog (type, message, optional contact email) that
   inserts one row in the insert-only "sugerencias" table through MPDDCloud.sendSuggestion.
   - User text is only set with textContent / input values; never logged.
   - Hidden honeypot field: if filled, pretend success and send nothing.
   - Device limit: 3 sends per 10 minutes (timestamps only, localStorage).
   - Unsent draft kept in sessionStorage so closing the dialog does not lose it. */
(function () {
  "use strict";
  const MAX = 1000;
  const RATE_KEY = "mpdd-sugerencias-v1";
  const DRAFT_KEY = "mpdd-sugerencia-borrador-v1";
  const WINDOW_MS = 10 * 60 * 1000;
  const LIMIT = 3;
  const TIPOS = [
    ["sugerencia", "Sugerencia"],
    ["error", "Error"],
    ["gusto", "Algo que me gustó"],
  ];
  const T = {
    title: "Enviar sugerencia",
    intro: "Cuéntanos qué mejorar, un error que encontraste o algo que te gustó. No incluyas datos de tus deudas.",
    type: "Tipo",
    message: "Mensaje",
    contact: "Correo de contacto (opcional)",
    contactHelp: "Solo si quieres que te respondamos.",
    honeypot: "No llenes este campo",
    send: "Enviar",
    sending: "Enviando…",
    close: "Cerrar",
    thanks: "¡Gracias! Recibimos tu mensaje.",
    errEmpty: "Escribe tu mensaje.",
    errLong: "El mensaje puede tener máximo 1000 caracteres.",
    errEmail: "Revisa el correo de contacto.",
    errNetwork: "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.",
    errServer: "No se pudo enviar. Inténtalo de nuevo en unos minutos.",
    errRate: "Ya enviaste varias sugerencias. Espera unos minutos e inténtalo de nuevo.",
    errConfig: "Por ahora no es posible enviar sugerencias desde esta app.",
    moreTitle: "Sugerencias",
    moreIntro: "¿Tienes una idea o encontraste un error? Escríbenos.",
  };
  window.MPDDStrings = Object.assign(window.MPDDStrings || {}, { sugerencias: T });

  function el(tag, attrs, text) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v;
      else n.setAttribute(k, v);
    }
    if (text !== undefined) n.textContent = text;
    return n;
  }
  const lang = () => (document.documentElement.lang === "en" ? "en" : "es");

  /* ---------- device limit (timestamps only) ---------- */
  function recent(now) {
    try {
      const v = JSON.parse(localStorage.getItem(RATE_KEY) || "[]");
      return Array.isArray(v) ? v.filter((t) => Number.isFinite(t) && t <= now && now - t < WINDOW_MS) : [];
    } catch (_) {
      return [];
    }
  }
  function limited() {
    return recent(Date.now()).length >= LIMIT;
  }
  function remember() {
    const now = Date.now();
    try {
      localStorage.setItem(RATE_KEY, JSON.stringify(recent(now).concat(now)));
    } catch (_) {}
  }

  /* ---------- draft (sessionStorage) ---------- */
  function readDraft() {
    try {
      const v = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
      return v && typeof v === "object" ? v : null;
    } catch (_) {
      return null;
    }
  }
  function saveDraft() {
    try {
      const d = { tipo: currentTipo(), texto: text.value, contacto: email.value };
      if (!d.texto && !d.contacto && d.tipo === "sugerencia") sessionStorage.removeItem(DRAFT_KEY);
      else sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch (_) {}
  }
  function clearDraft() {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch (_) {}
  }

  /* ---------- dialog ---------- */
  const dialog = el("dialog", { id: "sug-dialog", class: "account-dialog sug-dialog", "aria-labelledby": "sug-title" });
  const form = el("form", { class: "modal", id: "sug-form", novalidate: "" });
  const title = el("h2", { id: "sug-title" }, T.title);
  const intro = el("p", { id: "sug-intro" }, T.intro);
  dialog.setAttribute("aria-describedby", "sug-intro");

  const typeSet = el("fieldset", { class: "sug-types" });
  typeSet.append(el("legend", { class: "sug-legend" }, T.type));
  const seg = el("div", { class: "sug-seg" });
  for (const [value, label] of TIPOS) {
    const id = "sug-tipo-" + value;
    const input = el("input", { type: "radio", name: "sug-tipo", id, value });
    if (value === "sugerencia") input.checked = true;
    seg.append(input, el("label", { for: id }, label));
  }
  typeSet.append(seg);

  const textField = el("div", { class: "field" });
  const textLabel = el("label", { for: "sug-texto" }, T.message);
  const text = el("textarea", { id: "sug-texto", name: "texto", maxlength: String(MAX), rows: "5", required: "", "aria-describedby": "sug-count", "aria-required": "true" });
  const count = el("span", { id: "sug-count", class: "sug-count", "data-localized-output": "true" }, "0/" + MAX);
  textField.append(textLabel, text, count);

  const emailField = el("div", { class: "field" });
  const email = el("input", { id: "sug-contacto", name: "contacto", type: "email", inputmode: "email", autocomplete: "email", maxlength: "254", "aria-describedby": "sug-contacto-help" });
  emailField.append(el("label", { for: "sug-contacto" }, T.contact), email, el("span", { id: "sug-contacto-help", class: "help" }, T.contactHelp));

  // Honeypot: invisible for people and assistive technology; bots tend to fill it.
  const trap = el("div", { class: "sug-trap", "aria-hidden": "true" });
  const trapInput = el("input", { id: "sug-web", name: "web", type: "text", tabindex: "-1", autocomplete: "off", "aria-hidden": "true" });
  trap.append(el("label", { for: "sug-web" }, T.honeypot), trapInput);

  const msg = el("p", { class: "sug-msg", role: "status", "aria-live": "polite" });
  const buttons = el("div", { class: "modalbuttons" });
  const closeBtn = el("button", { type: "button", class: "cancel" }, T.close);
  const sendBtn = el("button", { type: "submit", class: "save", id: "sug-send" }, T.send);
  buttons.append(closeBtn, sendBtn);
  form.append(title, intro, typeSet, textField, emailField, trap, msg, buttons);
  dialog.append(form);
  document.body.append(dialog);

  function currentTipo() {
    const r = form.querySelector('input[name="sug-tipo"]:checked');
    return r && TIPOS.some(([v]) => v === r.value) ? r.value : "sugerencia";
  }
  function setTipo(v) {
    for (const r of form.querySelectorAll('input[name="sug-tipo"]')) r.checked = r.value === v;
    if (!form.querySelector('input[name="sug-tipo"]:checked')) form.querySelector("#sug-tipo-sugerencia").checked = true;
  }
  function updateCount() {
    count.textContent = text.value.length + "/" + MAX;
  }
  function say(message, kind) {
    msg.textContent = message || "";
    msg.classList.toggle("error", kind === "error");
    msg.classList.toggle("sug-ok", kind === "ok");
  }
  function cloud() {
    const C = window.MPDDCloud;
    try {
      return C && typeof C.sendSuggestion === "function" && C.configStatus() === "ok" ? C : null;
    } catch (_) {
      return null;
    }
  }
  function validEmail(v) {
    return v.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v);
  }
  let sending = false;
  function setSending(on) {
    sending = on;
    sendBtn.disabled = on;
    sendBtn.textContent = on ? T.sending : T.send;
    form.setAttribute("aria-busy", on ? "true" : "false");
  }
  function clearForm() {
    text.value = "";
    email.value = "";
    trapInput.value = "";
    setTipo("sugerencia");
    updateCount();
    clearDraft();
    text.removeAttribute("aria-invalid");
    email.removeAttribute("aria-invalid");
  }

  text.addEventListener("input", () => {
    if (text.value.length > MAX) text.value = text.value.slice(0, MAX);
    updateCount();
    text.removeAttribute("aria-invalid");
    saveDraft();
  });
  email.addEventListener("input", () => {
    email.removeAttribute("aria-invalid");
    saveDraft();
  });
  seg.addEventListener("change", saveDraft);
  closeBtn.addEventListener("click", () => close());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    const texto = text.value.trim();
    const contacto = email.value.trim();
    if (!texto) {
      text.setAttribute("aria-invalid", "true");
      say(T.errEmpty, "error");
      text.focus();
      return;
    }
    if (texto.length > MAX) {
      text.setAttribute("aria-invalid", "true");
      say(T.errLong, "error");
      text.focus();
      return;
    }
    if (contacto && !validEmail(contacto)) {
      email.setAttribute("aria-invalid", "true");
      say(T.errEmail, "error");
      email.focus();
      return;
    }
    // Bot filled the hidden field: act as if it worked, send nothing.
    if (trapInput.value) {
      clearForm();
      say(T.thanks, "ok");
      return;
    }
    if (limited()) {
      say(T.errRate, "error");
      return;
    }
    const C = cloud();
    if (!C) {
      say(T.errConfig, "error");
      return;
    }
    setSending(true);
    say("");
    let r;
    try {
      r = await C.sendSuggestion({ tipo: currentTipo(), texto, contacto: contacto || null, idioma: lang(), version: window.MPDD_VERSION || "" });
    } catch (_) {
      r = { ok: false, error: "network" };
    }
    setSending(false);
    if (r && r.ok) {
      remember();
      clearForm();
      say(T.thanks, "ok");
      return;
    }
    // Keep everything the user typed; the same button retries.
    saveDraft();
    const err = r && r.error;
    say(err === "rateLimit" ? T.errRate : err === "config" ? T.errConfig : err === "network" ? T.errNetwork : T.errServer, "error");
  });

  dialog.addEventListener("close", () => {
    if (!sending) saveDraft();
  });

  let opener = null;
  function open() {
    opener = document.activeElement;
    const d = readDraft();
    if (d) {
      setTipo(typeof d.tipo === "string" ? d.tipo : "sugerencia");
      text.value = typeof d.texto === "string" ? d.texto.slice(0, MAX) : "";
      email.value = typeof d.contacto === "string" ? d.contacto.slice(0, 254) : "";
    }
    updateCount();
    say(cloud() ? "" : T.errConfig, cloud() ? undefined : "error");
    sendBtn.disabled = sending;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    try {
      text.focus();
    } catch (_) {}
  }
  function close() {
    saveDraft();
    if (dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    if (opener && typeof opener.focus === "function" && document.contains(opener)) {
      try {
        opener.focus();
      } catch (_) {}
    }
  }

  /* ---------- entry points ---------- */
  // "Más": its own small section in the settings panel.
  const more = document.querySelector("#view-more .more-settings");
  if (more) {
    const h3 = el("h3", { id: "sug-more-title" }, T.moreTitle);
    const p = el("p", { class: "label" }, T.moreIntro);
    const b = el("button", { type: "button", class: "ghost", id: "sug-open-more" }, T.title);
    b.addEventListener("click", open);
    more.append(h3, p, b);
  }
  // Inicio: a discreet text link next to the legal links in the footer.
  const legal = document.querySelector("#view-home .footer.legal-links") || document.querySelector("main .footer.legal-links");
  if (legal) {
    const b = el("button", { type: "button", class: "link-button", id: "sug-open-home" }, T.title);
    b.addEventListener("click", open);
    legal.append(document.createTextNode(" · "), b);
  }

  window.MPDDSugerencias = Object.freeze({ open, close, LIMIT, WINDOW_MS, RATE_KEY, DRAFT_KEY });
})();
