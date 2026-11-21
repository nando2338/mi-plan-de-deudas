/* "Cuenta" panel (menú Más), header status and sync notices.
   All visible text is Spanish and translated by i18n.js entries.
   User data (emails, debt names) is only inserted with textContent. */
(function () {
  "use strict";
  const Cloud = window.MPDDCloud;
  const root = document.getElementById("account-root");
  if (!Cloud || !root) return;

  const T = {
    intro: "Opcional: crea una cuenta para ver tus deudas, pagos, presupuesto y recordatorios en todos tus dispositivos. Sin cuenta, la app funciona igual y todo se guarda solo en este dispositivo.",
    stateLabel: "Estado:",
    st_disabled: "No disponible",
    st_signedOut: "Sin sesión",
    st_starting: "Conectando…",
    st_syncing: "Sincronizando…",
    st_synced: "Sincronizado",
    st_offline: "Sin conexión (cambios guardados en este dispositivo)",
    st_error: "Error de sincronización",
    st_paused: "Sincronización en pausa",
    st_needsChoice: "Falta elegir qué hacer con tus datos",
    hdr_local: "● DATOS EN ESTE DISPOSITIVO",
    hdr_synced: "● SINCRONIZADO CON TU CUENTA",
    hdr_syncing: "● SINCRONIZANDO…",
    hdr_offline: "● SIN CONEXIÓN · CAMBIOS GUARDADOS AQUÍ",
    hdr_error: "● ERROR DE SINCRONIZACIÓN",
    hdr_paused: "● SINCRONIZACIÓN EN PAUSA",
    hdr_choice: "● CUENTA: ACCIÓN PENDIENTE",
    disabled: "Las cuentas en la nube todavía no están activadas en esta versión. Tus datos siguen guardándose solo en este dispositivo.",
    secretKey: "La configuración contiene una clave secreta. Por seguridad, las cuentas están desactivadas.",
    badConfig: "La configuración de la nube no es válida. Las cuentas están desactivadas.",
    tabLogin: "Iniciar sesión",
    tabSignup: "Crear cuenta",
    email: "Correo electrónico",
    password: "Contraseña",
    passwordNew: "Contraseña (mínimo 6 caracteres)",
    passwordRepeat: "Repite la contraseña",
    passwordRecovery: "Nueva contraseña (mínimo 6 caracteres)",
    enter: "Entrar",
    magic: "Enviarme un enlace mágico",
    forgot: "¿Olvidaste tu contraseña?",
    google: "Continuar con Google (próximamente)",
    googleOn: "Continuar con Google",
    acceptA: "Acepto la",
    acceptB: "y los",
    privacy: "Política de privacidad",
    terms: "Términos de uso",
    createBtn: "Crear cuenta",
    recoveryTitle: "Escribe tu nueva contraseña",
    saveNewPassword: "Guardar nueva contraseña",
    signedInAs: "Sesión iniciada como",
    pending: "Cambios pendientes de enviar:",
    lastSync: "Última sincronización:",
    syncNow: "Sincronizar ahora",
    signOut: "Cerrar sesión",
    downloadPre: "Descargar copias previas a la sincronización",
    preLocal: "Copia de este dispositivo",
    preCloud: "Copia de la nube",
    deleteAccount: "Eliminar mi cuenta y mis datos",
    unsyncable: "Estas deudas no se pueden sincronizar porque no cumplen las reglas de la nube (por ejemplo, un nombre de más de 80 caracteres). Edítalas para corregirlas:",
    chooseNow: "Elegir ahora",
    e_network: "Sin conexión. Tus cambios se guardan en este dispositivo y se enviarán cuando vuelva la conexión.",
    e_auth: "Tu sesión ya no es válida. Cierra sesión y vuelve a iniciarla.",
    e_sessionExpired: "Tu sesión terminó. Tus datos siguen en este dispositivo; inicia sesión de nuevo para sincronizar.",
    e_server: "El servidor no respondió como se esperaba. Se reintentará automáticamente.",
    e_otherTab: "Los datos cambiaron en otra pestaña. Recarga la página para sincronizar.",
    e_apply: "No se pudieron aplicar los cambios de la nube en este dispositivo. Tus datos locales no se modificaron.",
    e_paused: "Sincronización en pausa: hay una recuperación pendiente o datos que requieren revisión en este dispositivo.",
    e_prebackup: "No hay espacio para guardar la copia de respaldo previa. No se reemplazó nada.",
    e_linkInvalid: "El enlace del correo no es válido o expiró. Solicita uno nuevo.",
    e_wipeLocked: "Sesión cerrada. No se borró la copia local porque hay una recuperación pendiente.",
    e_remoteReset: "Tus datos en la nube se borraron desde otro dispositivo. Se cerró la sesión y se conservó la copia de este dispositivo; si quieres volver a subirla, inicia sesión otra vez.",
    e_generic: "No se pudo completar la operación. Inténtalo de nuevo.",
    m_checkSignup: "Te enviamos un correo para confirmar tu cuenta. Revisa también la carpeta de spam.",
    resend: "Reenviar correo",
    m_resent: "Listo, te reenviamos el correo. Revisa también la carpeta de spam.",
    m_notConfirmed: "Aún no has confirmado tu correo. Abre el mensaje que te enviamos o pide que te lo reenviemos.",
    m_userExists: "Ese correo ya está registrado. Inicia sesión o recupera tu contraseña.",
    m_emailInvalid: "El correo no es válido. Revísalo e inténtalo de nuevo.",
    m_generic: "Algo salió mal. Inténtalo de nuevo.",
    m_linkExpired: "El enlace venció o ya no es válido. Pide otro correo.",
    tagline: "Tu camino a la tranquilidad financiera",
    recNewTitle: "Crea tu nueva contraseña",
    recSave: "Guardar contraseña",
    recDone: "Contraseña actualizada",
    recContinue: "Terminar de crear tu nueva contraseña",
    recSignOut: "Cerrar sesión",
    expTitle: "El enlace venció o no es válido",
    expText: "Los enlaces del correo duran poco tiempo y solo sirven una vez. Escribe tu correo y te enviamos otro.",
    expSend: "Pedir otro correo",
    expClose: "Cerrar",
    m_checkMagic: "Si hay una cuenta con ese correo, te enviamos un enlace para entrar. Ábrelo en este mismo navegador.",
    m_checkReset: "Si hay una cuenta con ese correo, te enviamos un enlace para cambiar la contraseña. Ábrelo en este mismo navegador.",
    m_credentials: "No se pudo iniciar sesión. Revisa el correo y la contraseña. Si acabas de crear la cuenta, confírmala desde el correo que te enviamos.",
    m_email: "Escribe un correo electrónico válido.",
    m_passwordLength: "La contraseña es muy corta: debe tener al menos 6 caracteres.",
    m_mismatch: "Las contraseñas no coinciden.",
    m_terms: "Para crear la cuenta debes aceptar la política de privacidad y los términos de uso.",
    m_rateLimit: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
    m_server: "No pudimos enviar el correo. Inténtalo de nuevo en unos minutos.",
    m_weakPassword: "Esa contraseña no cumple los requisitos de seguridad. Usa una más larga y difícil de adivinar.",
    m_samePassword: "La nueva contraseña debe ser distinta de la anterior.",
    m_passwordUpdated: "Contraseña actualizada.",
    m_working: "Procesando…",
    n_conflictRemote: "Había cambios en ambos lados; se usó la versión más reciente de tu cuenta para:",
    n_conflictLocal: "Había cambios en ambos lados; se conservó la versión más reciente de este dispositivo y se reemplazó la de la nube para:",
    n_conflictLocalDeleted: "Se eliminó también de la nube, aunque tenía cambios desde otro dispositivo:",
    n_conflictDeleted: "Se eliminó porque la borraste en otro dispositivo después de tu último cambio aquí:",
    n_deletedRemotely: "Se eliminó porque la borraste en otro dispositivo:",
    n_conflictSettings: "Algunos ajustes se reemplazaron con la versión más reciente de tu cuenta.",
    n_settings: "Se actualizaron tus ajustes desde la cuenta. Recarga la página para verlos.",
    n_copy: "Antes de cada cambio se guardó una copia anterior en este dispositivo.",
    reload: "Recargar",
    ok: "Entendido",
    cancel: "Cancelar",
    c_uploadTitle: "¿Subir tus datos a tu cuenta?",
    c_uploadText: "Si los subes, podrás verlos en tus otros dispositivos. Seguirán guardados también en este dispositivo.",
    c_uploadBtn: "Subir mis datos",
    c_notNow: "Ahora no (cerrar sesión)",
    c_bothTitle: "Tu cuenta ya tiene datos",
    c_here: "En este dispositivo:",
    c_cloud: "En tu cuenta:",
    c_debts: "deudas",
    c_settings: "ajustes de presupuesto o recordatorios",
    c_otherUser: "Atención: los datos de este dispositivo se usaron antes con otra cuenta. Si no son tuyos, elige «Usar la nube».",
    c_safety: "Antes de reemplazar algo se guarda una copia de respaldo en este dispositivo; podrás descargarla desde Cuenta.",
    c_merge: "Combinar",
    c_mergeText: "Junta ambas listas. Si una misma deuda aparece en los dos lados con diferencias, se conserva la de tu cuenta.",
    c_useCloud: "Usar la nube",
    c_useCloudText: "Este dispositivo mostrará lo que hay en tu cuenta. Las deudas locales se guardan antes en una copia de respaldo.",
    c_useLocal: "Usar lo de este dispositivo",
    c_useLocalText: "Tu cuenta quedará igual que este dispositivo. Lo que había en la nube se guarda antes en una copia de respaldo local.",
    o_title: "Cerrar sesión",
    o_text: "¿Qué hacemos con la copia de tus datos en este dispositivo? Si el equipo es compartido, te recomendamos borrarla.",
    o_pending: "Hay cambios que aún no se han enviado a la nube. Si borras la copia local, se perderán. Descarga un respaldo antes.",
    o_keep: "Conservar en este dispositivo",
    o_wipe: "Borrar de este dispositivo",
    o_backup: "Descargar respaldo",
    d_title: "Eliminar mi cuenta y mis datos",
    d_text1: "Se borrarán de la nube todas tus deudas, pagos, presupuesto, recordatorios y tu cuenta. Esta acción no se puede deshacer.",
    d_text2: "Después podrás decidir si conservas o borras la copia de este dispositivo.",
    d_continue: "Continuar",
    d_type: "Para confirmar, escribe ELIMINAR en el campo:",
    d_word: "Palabra de confirmación",
    d_final: "Eliminar definitivamente",
    d_done: "Tu cuenta y tus datos en la nube se eliminaron.",
    d_partial: "Tus datos en la nube se eliminaron, pero la cuenta no se pudo eliminar automáticamente. Escríbenos al contacto de la política de privacidad para completarlo.",
    d_localQuestion: "¿Qué hacemos con la copia de tus datos en este dispositivo?",
    backupCloudNote: "Con sesión iniciada, restaurar un respaldo también reemplaza los datos de tu cuenta en la nube.",
    noticeLocal: "Tus registros se guardan solo en este navegador y dispositivo. Descarga un respaldo con frecuencia para conservarlos o trasladarlos a otro dispositivo.",
    noticeCloud: "Tus registros se guardan en este dispositivo y se sincronizan con tu cuenta en la nube. Si no hay conexión, los cambios esperan aquí y se envían al volver. Aun así, descarga un respaldo de vez en cuando.",
    // 1.4
    authTitle: "Entra a tu cuenta",
    close: "Cerrar",
    menuLabel: "Menú de cuenta",
    myAccount: "Mi cuenta",
    homeCard: "Crea tu cuenta gratis para no perder tus deudas si cambias de teléfono",
    notNow: "Ahora no",
    ask_plan: "Crea tu cuenta para guardar tu plan",
    ask_notifications: "Crea tu cuenta para recibir avisos en todos tus dispositivos",
    ask_thirdDebt: "Ya tienes 3 deudas. Crea tu cuenta gratis para no perderlas",
    changePassword: "Cambiar contraseña",
  };
  window.MPDDAccountStrings = T;

  /* ---------- tiny DOM helpers (textContent only) ---------- */
  function el(tag, opts, ...kids) {
    const n = document.createElement(tag);
    if (opts)
      for (const [k, v] of Object.entries(opts)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === "text") n.textContent = v;
        else if (k === "class") n.className = v;
        else if (k === "on") for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
        else if (k in n && typeof v !== "string") n[k] = v;
        else n.setAttribute(k, v === true ? "" : v);
      }
    for (const k of kids) if (k !== null && k !== undefined && k !== false) n.append(k);
    return n;
  }
  const raw = (text) => el("span", { "data-localized-output": "true", text }); // user data: never translated
  function btn(text, fn, cls = "ghost", type = "button") {
    return el("button", { type, class: cls, text, on: fn ? { click: fn } : undefined });
  }
  function input(id, label, type, attrs = {}) {
    const i = el("input", Object.assign({ id, name: id, type }, attrs));
    if (type === "password") return { wrap: el("div", { class: "field" }, el("label", { for: id, text: label }), passwordBox(i)), input: i };
    return { wrap: el("div", { class: "field" }, el("label", { for: id, text: label }), i), input: i };
  }

  /* 1.6: eye button to show or hide the password. Hidden by default; the label follows the
     app language. Icons are drawn with DOM APIs (no innerHTML). */
  const SVG = "http://www.w3.org/2000/svg";
  function svgIcon(open) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "22");
    svg.setAttribute("height", "22");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = (d) => {
      const p = document.createElementNS(SVG, "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", "currentColor");
      p.setAttribute("stroke-width", "2");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      svg.append(p);
    };
    path("M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z");
    path("M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z");
    if (!open) path("M4 4l16 16");
    return svg;
  }
  const EYE = { es: ["Mostrar contraseña", "Ocultar contraseña"], en: ["Show password", "Hide password"] };
  function passwordBox(i) {
    const box = el("div", { class: "pw-reveal" });
    const toggle = el("button", { type: "button", class: "pw-eye", "aria-controls": i.id, "aria-pressed": "false" });
    const paint = () => {
      const shown = i.type === "text";
      const words = EYE[document.documentElement.lang === "en" ? "en" : "es"];
      toggle.setAttribute("aria-label", shown ? words[1] : words[0]);
      toggle.title = shown ? words[1] : words[0];
      toggle.setAttribute("aria-pressed", shown ? "true" : "false");
      // Open eye = "show"; crossed-out eye = the password is visible and the button hides it.
      toggle.replaceChildren(svgIcon(!shown));
    };
    toggle.addEventListener("click", () => {
      const pos = [i.selectionStart, i.selectionEnd];
      i.type = i.type === "password" ? "text" : "password";
      paint();
      try {
        i.focus({ preventScroll: true });
        if (pos[0] !== null) i.setSelectionRange(pos[0], pos[1]);
      } catch (_) {}
    });
    const onLang = () => {
      // Form already replaced: drop the listener.
      if (!toggle.isConnected && box.dataset.shown) return document.removeEventListener("deudas:languagechange", onLang);
      if (toggle.isConnected) box.dataset.shown = "1";
      paint();
    };
    document.addEventListener("deudas:languagechange", onLang);
    paint();
    box.append(i, toggle);
    return box;
  }
  function message() {
    return el("p", { class: "account-msg", role: "status", "aria-live": "polite" });
  }
  function say(p, key, isError) {
    p.textContent = T[key] || T.e_generic;
    p.classList.toggle("error", !!isError);
  }
  function busy(form, on) {
    for (const b of form.querySelectorAll("button,input")) {
      if (b.dataset.alwaysDisabled) continue;
      b.disabled = on;
    }
  }
  function legalLinks(blank) {
    const a = (href, text) => el("a", { href, text, target: blank ? "_blank" : null, rel: blank ? "noopener" : null });
    return [a("/privacidad.html", T.privacy), a("/terminos.html", T.terms)];
  }

  /* ---------- panel skeleton ---------- */
  const dot = el("span", { class: "acc-dot", "aria-hidden": "true" });
  const stateText = el("span");
  const statusLine = el("p", { class: "account-status" }, dot, el("strong", { text: T.stateLabel }), " ", stateText);
  const detail = el("p", { class: "label account-detail", role: "status", "aria-live": "polite" });
  const body = el("div", { class: "account-body" });
  const [pl, tl] = legalLinks(false);
  root.append(el("p", { class: "label", text: T.intro }), statusLine, detail, body, el("p", { class: "label legal-links" }, pl, " · ", tl));

  let view = null; // "disabled" | "signedOut" | "recovery" | "signedIn"
  let tab = "login";

  /* ---------- sign-in / create-account dialog (1.4) ---------- */
  function brandBlock() {
    return el("div", { class: "auth-brand" }, el("img", { src: "/logo-encabezado.png", alt: "", width: "44", height: "44" }), el("strong", { class: "auth-brand-name", text: "SolviPath" }), el("span", { class: "auth-brand-tagline", text: T.tagline }));
  }
  /* Botón "Reenviar correo": aparece después de crear la cuenta o si falta confirmar el correo. */
  function resendButton(form, msg, getEmail) {
    const b = btn(T.resend, async () => {
      busy(form, true);
      say(msg, "m_working");
      const r = await Cloud.resendSignup(getEmail());
      busy(form, false);
      say(msg, r.ok ? "m_resent" : resultKey(r), !r.ok);
    });
    b.hidden = true;
    b.classList.add("account-resend");
    return b;
  }
  const authDialog = el("dialog", { id: "account-auth-dialog", class: "account-dialog account-auth", "aria-labelledby": "account-auth-title" });
  const authTitle = el("h2", { id: "account-auth-title" });
  const authDetail = el("p", { class: "account-msg", role: "status", "aria-live": "polite" });
  const authBody = el("div", { class: "account-auth-body" });
  const [apl, atl] = legalLinks(true);
  authDialog.append(
    el(
      "div",
      { class: "modal" },
      brandBlock(),
      authTitle,
      el("p", { class: "label", text: T.intro }),
      authDetail,
      authBody,
      el("p", { class: "label legal-links" }, apl, " · ", atl),
      el("div", { class: "modalbuttons" }, btn(T.close, () => closeAuth(), "cancel")),
    ),
  );
  document.body.append(authDialog);
  let authReason = null;
  authDialog.addEventListener("close", () => {
    // Never keep typed passwords around once the dialog is closed.
    authBody.replaceChildren();
    authReason = null;
  });
  function openAuth(opts = {}) {
    authReason = opts.reason || null;
    if (opts.tab) tab = opts.tab;
    authTitle.textContent = authReason ? T["ask_" + authReason] : T.authTitle;
    const ek = errorKey(Cloud.status());
    if (ek) say(authDetail, ek, true);
    else authDetail.textContent = "";
    renderSignedOut();
    if (!authDialog.open) {
      if (typeof authDialog.showModal === "function") authDialog.showModal();
      else authDialog.setAttribute("open", "");
    }
    const first = authBody.querySelector("input");
    if (first && first.focus) first.focus();
  }
  function closeAuth() {
    if (!authDialog.open) return;
    if (typeof authDialog.close === "function") authDialog.close();
    else {
      authDialog.removeAttribute("open");
      authDialog.dispatchEvent(new Event("close"));
    }
  }

  function renderSignedOut() {
    const body = authBody;
    body.replaceChildren();
    const tabs = el("div", { class: "switch account-tabs", role: "tablist" });
    const tLogin = btn(T.tabLogin, () => ((tab = "login"), renderSignedOut()), tab === "login" ? "active" : "");
    const tSignup = btn(T.tabSignup, () => ((tab = "signup"), renderSignedOut()), tab === "signup" ? "active" : "");
    tLogin.setAttribute("role", "tab");
    tSignup.setAttribute("role", "tab");
    tLogin.setAttribute("aria-selected", String(tab === "login"));
    tSignup.setAttribute("aria-selected", String(tab === "signup"));
    tabs.append(tLogin, tSignup);
    body.append(tabs);
    if (tab === "login") {
      const form = el("form", { class: "account-form", novalidate: true });
      const email = input("acc-login-email", T.email, "email", { autocomplete: "email", required: true, maxlength: "254" });
      const pass = input("acc-login-password", T.password, "password", { autocomplete: "current-password" });
      const msg = message();
      const resendL = resendButton(form, msg, () => email.input.value);
      const magic = btn(T.magic, async () => {
        busy(form, true);
        say(msg, "m_working");
        const r = await Cloud.magicLink(email.input.value);
        busy(form, false);
        say(msg, r.ok ? "m_checkMagic" : resultKey(r), !r.ok);
      });
      const forgot = btn(T.forgot, async () => {
        busy(form, true);
        say(msg, "m_working");
        const r = await Cloud.resetPassword(email.input.value);
        busy(form, false);
        say(msg, r.ok ? "m_checkReset" : resultKey(r), !r.ok);
      });
      form.append(email.wrap, pass.wrap, el("div", { class: "actions" }, btn(T.enter, null, "save", "submit")), el("div", { class: "actions account-secondary" }, magic, forgot), googleButton(), msg, resendL);
      form.onsubmit = async (e) => {
        e.preventDefault();
        busy(form, true);
        say(msg, "m_working");
        resendL.hidden = true;
        const r = await Cloud.signIn(email.input.value, pass.input.value);
        busy(form, false);
        if (r.ok) {
          pass.input.value = "";
          msg.textContent = "";
        } else {
          say(msg, resultKey(r), true);
          resendL.hidden = r.error !== "notConfirmed";
        }
      };
      body.append(form);
    } else {
      const form = el("form", { class: "account-form", novalidate: true });
      const email = input("acc-signup-email", T.email, "email", { autocomplete: "email", required: true, maxlength: "254" });
      const pass = input("acc-signup-password", T.passwordNew, "password", { autocomplete: "new-password", minlength: "6" });
      const pass2 = input("acc-signup-password2", T.passwordRepeat, "password", { autocomplete: "new-password", minlength: "6" });
      const check = el("input", { type: "checkbox", id: "acc-accept", required: true });
      check.checked = false;
      const [p, t] = legalLinks(true);
      const accept = el("label", { class: "account-accept", for: "acc-accept" }, check, " ", el("span", { text: T.acceptA }), " ", p, " ", el("span", { text: T.acceptB }), " ", t, ".");
      const msg = message();
      const resendS = resendButton(form, msg, () => email.input.value);
      form.append(email.wrap, pass.wrap, pass2.wrap, accept, el("div", { class: "actions" }, btn(T.createBtn, null, "save", "submit")), googleButton(), msg, resendS);
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (pass.input.value.length < 6) return say(msg, "m_passwordLength", true);
        if (pass.input.value !== pass2.input.value) return say(msg, "m_mismatch", true);
        if (!check.checked) return say(msg, "m_terms", true);
        busy(form, true);
        say(msg, "m_working");
        resendS.hidden = true;
        const r = await Cloud.signUp(email.input.value, pass.input.value, check.checked === true);
        busy(form, false);
        if (r.ok) {
          pass.input.value = pass2.input.value = "";
          if (r.result === "checkEmail") {
            say(msg, "m_checkSignup");
            resendS.hidden = false;
          } else msg.textContent = "";
        } else say(msg, resultKey(r), true);
      };
      body.append(form);
    }
  }
  function resultKey(r) {
    if (!r || r.ok) return "e_generic";
    if (r.error === "network") return "e_network";
    return T["m_" + r.error] ? "m_" + r.error : "m_generic";
  }
  function googleButton() {
    const on = window.MPDD_CONFIG && window.MPDD_CONFIG.googleEnabled === true;
    const b = btn(on ? T.googleOn : T.google, on ? () => Cloud.google() : null, "ghost account-google");
    if (!on) {
      b.disabled = true;
      b.dataset.alwaysDisabled = "1";
      b.setAttribute("aria-disabled", "true");
    }
    return el("div", { class: "actions" }, b);
  }
  // Más → Cuenta without a session: sign-in lives behind the header icon and the dialog.
  function renderPanelSignedOut() {
    body.replaceChildren(el("div", { class: "actions" }, btn(T.enter, () => openAuth({ tab: "login" }), "save account-panel-enter")));
  }
  function renderRecovery() {
    body.replaceChildren(el("div", { class: "actions" }, btn(T.recContinue, () => openRecovery(), "save")));
    openRecovery();
  }

  /* ---------- 1.9: pantalla "Crea tu nueva contraseña" (a pantalla completa y persistente) ---------- */
  const recDialog = el("dialog", { id: "recovery-dialog", class: "account-dialog account-auth account-recovery", "aria-labelledby": "recovery-title" });
  recDialog.addEventListener("cancel", (e) => e.preventDefault());
  document.body.append(recDialog);
  let recDoneTimer = null,
    recSuccess = false;
  function openRecovery() {
    if (recDialog.open) return;
    clearTimeout(recDoneTimer);
    recSuccess = false;
    recDialog.replaceChildren();
    const form = el("form", { class: "account-form", novalidate: true });
    const pass = input("acc-recovery-password", T.passwordRecovery, "password", { autocomplete: "new-password", minlength: "6" });
    const pass2 = input("acc-recovery-password2", T.passwordRepeat, "password", { autocomplete: "new-password", minlength: "6" });
    const msg = message();
    form.append(pass.wrap, pass2.wrap, el("div", { class: "actions" }, btn(T.recSave, null, "save", "submit")), msg);
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (pass.input.value.length < 6) return say(msg, "m_passwordLength", true);
      if (pass.input.value !== pass2.input.value) return say(msg, "m_mismatch", true);
      busy(form, true);
      say(msg, "m_working");
      const r = await Cloud.updatePassword(pass.input.value);
      busy(form, false);
      if (r.ok) {
        pass.input.value = pass2.input.value = "";
        recSuccess = true;
        say(msg, "recDone");
        msg.classList.remove("error");
        say(detail, "m_passwordUpdated");
        busy(form, true);
        recDoneTimer = setTimeout(closeRecovery, 1200);
      } else if (r.error === "linkExpired") closeRecovery();
      else say(msg, resultKey(r), true);
    };
    recDialog.append(
      el("div", { class: "modal" }, brandBlock(), el("h2", { id: "recovery-title", text: T.recNewTitle }), form, el("div", { class: "modalbuttons" }, btn(T.recSignOut, () => Cloud.signOut({ keepLocal: true }), "cancel"))),
    );
    if (typeof recDialog.showModal === "function") recDialog.showModal();
    else recDialog.setAttribute("open", "");
    const first = recDialog.querySelector("input");
    if (first && first.focus) first.focus();
  }
  function closeRecovery() {
    clearTimeout(recDoneTimer);
    recSuccess = false;
    if (!recDialog.open) return;
    if (typeof recDialog.close === "function") recDialog.close();
    else recDialog.removeAttribute("open");
    recDialog.replaceChildren();
  }

  /* ---------- 1.9: enlace vencido o inválido: pedir otro correo ---------- */
  const expDialog = el("dialog", { id: "link-expired-dialog", class: "account-dialog account-auth", "aria-labelledby": "link-expired-title" });
  document.body.append(expDialog);
  function openExpired() {
    if (expDialog.open) return;
    expDialog.replaceChildren();
    const form = el("form", { class: "account-form", novalidate: true });
    const email = input("acc-expired-email", T.email, "email", { autocomplete: "email", required: true, maxlength: "254" });
    const msg = message();
    form.append(email.wrap, el("div", { class: "actions" }, btn(T.expSend, null, "save", "submit")), msg);
    form.onsubmit = async (e) => {
      e.preventDefault();
      busy(form, true);
      say(msg, "m_working");
      const r = await Cloud.resetPassword(email.input.value);
      busy(form, false);
      say(msg, r.ok ? "m_checkReset" : resultKey(r), !r.ok);
    };
    expDialog.append(
      el("div", { class: "modal" }, brandBlock(), el("h2", { id: "link-expired-title", text: T.expTitle }), el("p", { class: "label", text: T.expText }), form, el("div", { class: "modalbuttons" }, btn(T.expClose, closeExpired, "cancel"))),
    );
    if (typeof expDialog.showModal === "function") expDialog.showModal();
    else expDialog.setAttribute("open", "");
  }
  function closeExpired() {
    if (expDialog.open) {
      if (typeof expDialog.close === "function") expDialog.close();
      else expDialog.removeAttribute("open");
    }
    expDialog.replaceChildren();
    Cloud.clearLinkExpired();
  }
  let signedInParts = null;
  function renderSignedIn(s) {
    if (!signedInParts) {
      body.replaceChildren();
      const who = el("span", { "data-localized-output": "true" });
      const pendingN = el("strong", { "data-localized-output": "true" });
      const last = el("strong", { "data-localized-output": "true" });
      const lastLine = el("p", { class: "label" }, el("span", { text: T.lastSync }), " ", last);
      const unsync = el("div", { class: "notice", hidden: true });
      const choose = btn(T.chooseNow, () => openChoice(Cloud.status()));
      const chooseRow = el("div", { class: "actions", hidden: true }, choose);
      const syncBtn = btn(T.syncNow, () => Cloud.syncNow());
      const preBtn = btn(T.downloadPre, downloadPre);
      const actions = el("div", { class: "actions account-actions" }, syncBtn, btn(T.changePassword, () => openChangePassword()), btn(T.signOut, () => openSignOut()), preBtn);
      const danger = el("div", { class: "actions" }, btn(T.deleteAccount, () => openDelete(), "ghost danger"));
      const pre = el("div", { class: "account-pre" });
      body.append(el("p", {}, el("span", { text: T.signedInAs }), " ", who), el("p", { class: "label" }, el("span", { text: T.pending }), " ", pendingN), lastLine, chooseRow, unsync, actions, pre, danger);
      signedInParts = { who, pendingN, last, lastLine, unsync, chooseRow, syncBtn, preBtn, pre };
    }
    const p = signedInParts;
    p.who.textContent = s.email || "";
    p.pendingN.textContent = String(s.pending || 0);
    p.lastLine.hidden = !s.lastSync;
    if (s.lastSync)
      p.last.textContent = new Date(s.lastSync).toLocaleString(document.documentElement.lang === "en" ? "en-US" : "es-CO");
    p.chooseRow.hidden = s.state !== "needsChoice";
    p.syncBtn.disabled = s.state === "needsChoice" || s.state === "paused" || s.state === "syncing";
    p.preBtn.hidden = !Cloud.preBackups().length;
    if (s.unsyncable && s.unsyncable.length) {
      p.unsync.hidden = false;
      p.unsync.replaceChildren(el("p", { text: T.unsyncable }), el("ul", {}, ...s.unsyncable.map((u) => el("li", {}, raw(u.name)))));
    } else p.unsync.hidden = true;
  }
  function downloadPre() {
    const list = Cloud.preBackups();
    const box = signedInParts.pre;
    box.replaceChildren();
    const item = list[0];
    if (!item) return;
    const link = (text, content, name) => {
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      return el("a", { href: url, download: name, class: "ghost", text });
    };
    if (item.local) box.append(link(T.preLocal, item.local, "copia-dispositivo-antes-de-sincronizar.json"), " ");
    if (item.cloud) box.append(link(T.preCloud, item.cloud, "copia-nube-antes-de-sincronizar.json"));
  }

  /* ---------- dialogs ---------- */
  const dialog = el("dialog", { id: "account-dialog", class: "account-dialog" });
  const modal = el("div", { class: "modal" });
  dialog.append(modal);
  document.body.append(dialog);
  let dialogLocked = false;
  dialog.addEventListener("cancel", (e) => {
    if (dialogLocked) e.preventDefault();
  });
  function openDialog(children, lockIt) {
    dialogLocked = !!lockIt;
    modal.replaceChildren(...children);
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
  }
  function closeDialog() {
    dialogLocked = false;
    if (dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }
  function countLine(label, debtsN, settingsN) {
    const p = el("p", {}, el("strong", { text: label }), " ", raw(String(debtsN)), " ", el("span", { text: T.c_debts }));
    if (settingsN) p.append(" · ", el("span", { text: T.c_settings }));
    return p;
  }
  function choose(choice) {
    closeDialog();
    Cloud.resolveLink(choice);
  }
  function option(title, text, choice) {
    return el("div", { class: "account-option" }, btn(title, () => choose(choice), "save"), el("p", { text }));
  }
  let choiceShown = false;
  function openChoice(s) {
    const c = s.choice;
    if (!c) return;
    choiceShown = true;
    const parts = [];
    if (c.kind === "upload") {
      parts.push(el("h2", { text: T.c_uploadTitle }), countLine(T.c_here, c.localDebts, c.localSettings), el("p", { text: T.c_uploadText }));
      if (c.otherUser) parts.push(el("p", { class: "error", text: T.c_otherUser }));
      parts.push(el("div", { class: "modalbuttons" }, btn(T.c_notNow, () => choose("cancel"), "cancel"), btn(T.c_uploadBtn, () => choose("upload"), "save")));
    } else {
      parts.push(el("h2", { text: T.c_bothTitle }), countLine(T.c_here, c.localDebts, c.localSettings), countLine(T.c_cloud, c.remoteDebts, c.remoteSettings));
      if (c.otherUser) parts.push(el("p", { class: "error", text: T.c_otherUser }));
      parts.push(el("p", { text: T.c_safety }), option(T.c_merge, T.c_mergeText, "merge"), option(T.c_useCloud, T.c_useCloudText, "cloud"), option(T.c_useLocal, T.c_useLocalText, "local"));
      parts.push(el("div", { class: "modalbuttons" }, btn(T.c_notNow, () => choose("cancel"), "cancel")));
    }
    openDialog(parts, true);
  }
  function clickExport() {
    const b = document.getElementById("export");
    if (b) b.click();
  }
  function localChoice(onDone, intro) {
    const pending = Cloud.pendingCount();
    const parts = [el("p", { text: intro })];
    if (pending) parts.push(el("p", { class: "error", text: T.o_pending }), el("div", { class: "actions" }, btn(T.o_backup, clickExport)));
    const msg = message();
    parts.push(
      el(
        "div",
        { class: "modalbuttons" },
        btn(T.o_keep, async () => {
          closeDialog();
          await Cloud.signOut({ keepLocal: true });
          onDone && onDone();
        }, "save"),
        btn(T.o_wipe, async () => {
          closeDialog();
          await Cloud.signOut({ keepLocal: false });
          onDone && onDone();
        }, "cancel danger"),
      ),
      msg,
    );
    return parts;
  }
  function openSignOut() {
    openDialog([el("h2", { text: T.o_title }), ...localChoice(null, T.o_text), el("div", { class: "modalbuttons" }, btn(T.cancel, closeDialog, "cancel"))]);
  }
  function openChangePassword() {
    const form = el("form", { class: "account-form", novalidate: true });
    const pass = input("acc-change-password", T.passwordRecovery, "password", { autocomplete: "new-password", minlength: "6" });
    const pass2 = input("acc-change-password2", T.passwordRepeat, "password", { autocomplete: "new-password", minlength: "6" });
    const msg = message();
    form.append(pass.wrap, pass2.wrap, el("div", { class: "modalbuttons" }, btn(T.cancel, closeDialog, "cancel"), btn(T.saveNewPassword, null, "save", "submit")), msg);
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (pass.input.value.length < 6) return say(msg, "m_passwordLength", true);
      if (pass.input.value !== pass2.input.value) return say(msg, "m_mismatch", true);
      busy(form, true);
      say(msg, "m_working");
      const r = await Cloud.updatePassword(pass.input.value);
      busy(form, false);
      pass.input.value = pass2.input.value = "";
      if (r.ok) {
        closeDialog();
        say(detail, "m_passwordUpdated");
      } else say(msg, resultKey(r), true);
    };
    openDialog([el("h2", { text: T.changePassword }), form]);
  }
  function openDelete() {
    openDialog([
      el("h2", { text: T.d_title }),
      el("p", { text: T.d_text1 }),
      el("p", { text: T.d_text2 }),
      el("div", { class: "modalbuttons" }, btn(T.cancel, closeDialog, "cancel"), btn(T.d_continue, openDeleteStep2, "save danger")),
    ]);
  }
  function openDeleteStep2() {
    const word = input("acc-delete-word", T.d_word, "text", { autocomplete: "off", autocapitalize: "characters", spellcheck: "false" });
    const msg = message();
    const final = btn(T.d_final, async () => {
      const v = word.input.value.trim().toUpperCase();
      if (v !== "ELIMINAR" && v !== "DELETE") return;
      final.disabled = true;
      say(msg, "m_working");
      const r = await Cloud.deleteAccount();
      if (!r.ok) {
        final.disabled = false;
        return say(msg, r.error === "network" || r.error === "offline" ? "e_network" : "e_generic", true);
      }
      openDialog([el("h2", { text: T.d_title }), el("p", { text: r.accountDeleted ? T.d_done : T.d_partial }), ...localChoice(null, T.d_localQuestion)], true);
    }, "save danger");
    final.disabled = true;
    word.input.addEventListener("input", () => {
      const v = word.input.value.trim().toUpperCase();
      final.disabled = v !== "ELIMINAR" && v !== "DELETE";
    });
    openDialog([el("h2", { text: T.d_title }), el("p", { text: T.d_type }), word.wrap, el("div", { class: "modalbuttons" }, btn(T.cancel, closeDialog, "cancel"), final), msg]);
  }

  /* ---------- header, notices, sync messages ---------- */
  const header = document.getElementById("data-status");
  const storageNotice = document.getElementById("storage-notice");
  const syncBox = document.getElementById("sync-notices");
  const tools = document.getElementById("nav-more");
  const backupNote = el("p", { class: "label account-backup-note", hidden: true, text: T.backupCloudNote });
  if (tools) tools.after(backupNote);
  let touched = false;
  const HDR = { synced: "hdr_synced", syncing: "hdr_syncing", starting: "hdr_syncing", offline: "hdr_offline", error: "hdr_error", paused: "hdr_paused", needsChoice: "hdr_choice" };
  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }
  function renderNotices(s) {
    if (!syncBox) return;
    const list = s.notices || [];
    if (!list.length && !s.settingsChanged) {
      syncBox.hidden = true;
      syncBox.replaceChildren();
      return;
    }
    const items = [];
    for (const n of list) {
      const text = T["n_" + n.kind];
      if (!text) continue;
      items.push(el("li", {}, el("span", { text }), n.name ? " " : null, n.name ? el("strong", {}, raw(n.name)) : null));
    }
    const parts = [];
    if (items.length) parts.push(el("ul", {}, ...items), el("p", { class: "label", text: T.n_copy }));
    if (s.settingsChanged) parts.push(el("p", { text: T.n_settings }), el("div", { class: "actions" }, btn(T.reload, () => location.reload())));
    parts.push(el("div", { class: "actions" }, btn(T.ok, () => Cloud.dismissNotices())));
    syncBox.replaceChildren(...parts);
    syncBox.hidden = false;
  }
  function errorKey(s) {
    if (s.state === "paused") return "e_paused";
    if (s.state === "offline") return "e_network";
    if (!s.error || s.error === "unsyncable") return null;
    const k = "e_" + s.error;
    return T[k] ? k : "e_generic";
  }

  /* ---------- 1.4: header account icon + menu ---------- */
  const JOURNAL = "nando-restore-journal-v1",
    PROMPTS = "mpdd-account-prompts-v1",
    WEEK = 7 * 24 * 60 * 60 * 1000;
  const memorySnooze = {}; // used when localStorage cannot be written (pending restore, full storage)
  function prompts() {
    try {
      const v = JSON.parse(localStorage.getItem(PROMPTS) || "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch (_) {
      return {};
    }
  }
  function snooze(key) {
    memorySnooze[key] = Date.now();
    try {
      if (localStorage.getItem(JOURNAL) !== null) return false;
      const p = prompts();
      p[key] = Date.now();
      localStorage.setItem(PROMPTS, JSON.stringify(p));
      return true;
    } catch (_) {
      return false;
    }
  }
  function snoozed(key) {
    const now = Date.now();
    for (const t of [Number(prompts()[key]), Number(memorySnooze[key])]) if (t > 0 && t <= now + 60000 && now - t < WEEK) return true;
    return false;
  }
  const accountsOn = () => Cloud.status().state !== "disabled";
  // Only a confirmed "no session" state: not while a stored session is still loading.
  const signedOutForSure = () => !Cloud.status().userId && Cloud.status().state === "signedOut";

  const headerBox = el("div", { class: "account-header", hidden: true });
  const enterBtn = btn(T.enter, () => openAuth({ tab: "login" }), "account-enter");
  const initial = el("span", { class: "account-initial", "aria-hidden": "true", "data-localized-output": "true" });
  const avatar = el("button", { type: "button", class: "account-avatar", id: "account-avatar", "aria-expanded": "false", "aria-controls": "account-menu" }, initial, el("span", { class: "visually-hidden", text: T.menuLabel }));
  const menuEmail = el("span", { "data-localized-output": "true" });
  const menu = el(
    "div",
    { class: "account-menu", id: "account-menu", hidden: true },
    el("p", { class: "account-menu-email" }, menuEmail),
    btn(T.myAccount, () => {
      closeMenu(false);
      goToAccount();
    }, "account-menu-item"),
    btn(T.signOut, () => {
      closeMenu(false);
      openSignOut();
    }, "account-menu-item"),
  );
  headerBox.append(enterBtn, avatar, menu);
  const top = document.querySelector("header .top");
  if (top) top.append(headerBox);
  function openMenu() {
    menu.hidden = false;
    avatar.setAttribute("aria-expanded", "true");
    const first = menu.querySelector("button");
    if (first && first.focus) first.focus();
  }
  function closeMenu(focusBack) {
    if (menu.hidden) return;
    menu.hidden = true;
    avatar.setAttribute("aria-expanded", "false");
    if (focusBack && avatar.focus) avatar.focus();
  }
  avatar.addEventListener("click", () => (menu.hidden ? openMenu() : closeMenu(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      e.preventDefault();
      closeMenu(true);
    }
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !headerBox.contains(e.target)) closeMenu(false);
  });
  function goToAccount() {
    if (window.MPDDNavigate) window.MPDDNavigate("more");
    const a = document.getElementById("account-title");
    if (!a) return;
    if (a.scrollIntoView) a.scrollIntoView({ block: "start" });
    a.setAttribute("tabindex", "-1");
    if (a.focus) a.focus();
  }
  function renderHeader(s) {
    const signedIn = !!s.userId;
    headerBox.hidden = s.state === "disabled" || (!signedIn && s.state !== "signedOut");
    enterBtn.hidden = signedIn;
    avatar.hidden = !signedIn;
    if (!signedIn) closeMenu(false);
    const email = s.email || "";
    setText(initial, email ? email.trim().charAt(0).toUpperCase() : "•");
    setText(menuEmail, email);
  }

  /* ---------- 1.4: Inicio card for users without an account ---------- */
  const homeCard = el(
    "section",
    { class: "notice account-home-card", id: "account-home-card", hidden: true },
    el("p", { text: T.homeCard }),
    el(
      "div",
      { class: "actions" },
      btn(T.createBtn, () => openAuth({ tab: "signup" }), "save"),
      btn(T.notNow, () => {
        snooze("homeCard");
        homeCard.hidden = true;
      }),
    ),
  );
  const home = document.getElementById("view-home");
  const homeOverview = home && home.querySelector(":scope > .overview");
  if (homeOverview) homeOverview.after(homeCard);
  else if (home) home.prepend(homeCard);
  function renderHomeCard() {
    homeCard.hidden = !(accountsOn() && signedOutForSure() && !snoozed("homeCard"));
  }

  /* ---------- 1.4: ask for an account at important moments ---------- */
  function ask(reason) {
    if (!T["ask_" + reason]) return false;
    if (!accountsOn() || !signedOutForSure()) return false;
    if (reason === "thirdDebt") snooze("thirdDebt");
    openAuth({ tab: "signup", reason });
    return true;
  }
  function debtCount() {
    try {
      return window.MPDDApp && window.MPDDApp.debts ? window.MPDDApp.debts().length : 0;
    } catch (_) {
      return 0;
    }
  }
  let lastCount = debtCount();
  function afterDebtForm(fn) {
    const form = document.getElementById("dialog");
    if (form && form.open) form.addEventListener("close", () => setTimeout(fn, 0), { once: true });
    else fn();
  }
  function checkThirdDebt() {
    const n = debtCount(),
      prev = lastCount;
    lastCount = n;
    // Only a single new debt (not a restore or a cloud download) that reaches 3 or more.
    if (n !== prev + 1 || n < 3) return;
    if (!accountsOn() || !signedOutForSure() || snoozed("thirdDebt")) return;
    afterDebtForm(() => ask("thirdDebt"));
  }
  document.addEventListener("mpdd:localchange", () => setTimeout(checkThirdDebt, 0));
  window.MPDDAccount = Object.freeze({ ask, open: (tabName) => (accountsOn() && signedOutForSure() ? (openAuth({ tab: tabName === "signup" ? "signup" : "login" }), true) : false) });

  Cloud.onChange((s) => {
    const signedIn = !!s.userId;
    renderHeader(s);
    renderHomeCard();
    if (signedIn) closeAuth();
    else if (authDialog.open) {
      const ek = errorKey(s);
      if (ek) say(authDetail, ek, true);
    }
    setText(stateText, T["st_" + s.state] || T.st_signedOut);
    dot.dataset.state = s.state;
    // Signed out: leave the original header and notice untouched (identical to the no-account app).
    if (signedIn) {
      setText(header, HDR[s.state] ? T[HDR[s.state]] : T.hdr_local);
      setText(storageNotice, T.noticeCloud);
      touched = true;
    } else if (touched) {
      setText(header, T.hdr_local);
      setText(storageNotice, T.noticeLocal);
    }
    backupNote.hidden = !signedIn;
    let next;
    if (s.state === "disabled") next = "disabled";
    else if (signedIn && s.recovery) next = "recovery";
    else if (signedIn) next = "signedIn";
    else next = "signedOut";
    if (next !== view) {
      view = next;
      signedInParts = null;
      if (next === "disabled") {
        body.replaceChildren(el("p", { class: s.config === "placeholder" ? "label" : "error", text: s.config === "secret" ? T.secretKey : s.config === "placeholder" ? T.disabled : T.badConfig }));
      } else if (next === "signedOut") renderPanelSignedOut();
      else if (next === "recovery") renderRecovery();
    }
    if (s.recovery && signedIn) openRecovery();
    else if (recDialog.open && !recSuccess) closeRecovery();
    if (s.linkExpired) openExpired();
    if (view === "signedIn") renderSignedIn(s);
    const ek = view === "disabled" ? null : errorKey(s);
    if (ek) say(detail, ek, s.state !== "offline");
    else if (detail.textContent && detail.textContent !== T.m_passwordUpdated) detail.textContent = "";
    renderNotices(s);
    if (s.state === "needsChoice" && s.choice && !choiceShown) openChoice(s);
    if (s.state !== "needsChoice") choiceShown = false;
  });
})();
