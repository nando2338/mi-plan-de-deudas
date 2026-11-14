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
    passwordNew: "Contraseña (mínimo 8 caracteres)",
    passwordRepeat: "Repite la contraseña",
    passwordRecovery: "Nueva contraseña (mínimo 8 caracteres)",
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
    m_checkSignup: "Si el correo es válido, te enviamos un mensaje para confirmar la cuenta. Revisa también la carpeta de spam.",
    m_checkMagic: "Si hay una cuenta con ese correo, te enviamos un enlace para entrar. Ábrelo en este mismo navegador.",
    m_checkReset: "Si hay una cuenta con ese correo, te enviamos un enlace para cambiar la contraseña. Ábrelo en este mismo navegador.",
    m_credentials: "No se pudo iniciar sesión. Revisa el correo y la contraseña. Si acabas de crear la cuenta, confírmala desde el correo que te enviamos.",
    m_email: "Escribe un correo electrónico válido.",
    m_passwordLength: "La contraseña debe tener al menos 8 caracteres.",
    m_mismatch: "Las contraseñas no coinciden.",
    m_terms: "Para crear la cuenta debes aceptar la política de privacidad y los términos de uso.",
    m_rateLimit: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
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
    return { wrap: el("div", { class: "field" }, el("label", { for: id, text: label }), i), input: i };
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

  function renderSignedOut() {
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
      form.append(email.wrap, pass.wrap, el("div", { class: "actions" }, btn(T.enter, null, "save", "submit")), el("div", { class: "actions account-secondary" }, magic, forgot), googleButton(), msg);
      form.onsubmit = async (e) => {
        e.preventDefault();
        busy(form, true);
        say(msg, "m_working");
        const r = await Cloud.signIn(email.input.value, pass.input.value);
        busy(form, false);
        if (r.ok) {
          pass.input.value = "";
          msg.textContent = "";
        } else say(msg, resultKey(r), true);
      };
      body.append(form);
    } else {
      const form = el("form", { class: "account-form", novalidate: true });
      const email = input("acc-signup-email", T.email, "email", { autocomplete: "email", required: true, maxlength: "254" });
      const pass = input("acc-signup-password", T.passwordNew, "password", { autocomplete: "new-password", minlength: "8" });
      const pass2 = input("acc-signup-password2", T.passwordRepeat, "password", { autocomplete: "new-password", minlength: "8" });
      const check = el("input", { type: "checkbox", id: "acc-accept", required: true });
      check.checked = false;
      const [p, t] = legalLinks(true);
      const accept = el("label", { class: "account-accept", for: "acc-accept" }, check, " ", el("span", { text: T.acceptA }), " ", p, " ", el("span", { text: T.acceptB }), " ", t, ".");
      const msg = message();
      form.append(email.wrap, pass.wrap, pass2.wrap, accept, el("div", { class: "actions" }, btn(T.createBtn, null, "save", "submit")), googleButton(), msg);
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (pass.input.value.length < 8) return say(msg, "m_passwordLength", true);
        if (pass.input.value !== pass2.input.value) return say(msg, "m_mismatch", true);
        if (!check.checked) return say(msg, "m_terms", true);
        busy(form, true);
        say(msg, "m_working");
        const r = await Cloud.signUp(email.input.value, pass.input.value, check.checked === true);
        busy(form, false);
        if (r.ok) {
          pass.input.value = pass2.input.value = "";
          if (r.result === "checkEmail") say(msg, "m_checkSignup");
          else msg.textContent = "";
        } else say(msg, resultKey(r), true);
      };
      body.append(form);
    }
  }
  function resultKey(r) {
    if (!r || r.ok) return "e_generic";
    if (r.error === "network") return "e_network";
    return T["m_" + r.error] ? "m_" + r.error : "e_generic";
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
  function renderRecovery() {
    body.replaceChildren();
    const form = el("form", { class: "account-form", novalidate: true });
    const pass = input("acc-recovery-password", T.passwordRecovery, "password", { autocomplete: "new-password", minlength: "8" });
    const pass2 = input("acc-recovery-password2", T.passwordRepeat, "password", { autocomplete: "new-password", minlength: "8" });
    const msg = message();
    form.append(el("h4", { text: T.recoveryTitle }), pass.wrap, pass2.wrap, el("div", { class: "actions" }, btn(T.saveNewPassword, null, "save", "submit")), msg);
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (pass.input.value.length < 8) return say(msg, "m_passwordLength", true);
      if (pass.input.value !== pass2.input.value) return say(msg, "m_mismatch", true);
      busy(form, true);
      const r = await Cloud.updatePassword(pass.input.value);
      busy(form, false);
      if (r.ok) {
        pass.input.value = pass2.input.value = "";
        say(detail, "m_passwordUpdated");
      } else say(msg, resultKey(r), true);
    };
    body.append(form);
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
      const actions = el("div", { class: "actions account-actions" }, syncBtn, btn(T.signOut, () => openSignOut()), preBtn);
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

  Cloud.onChange((s) => {
    const signedIn = !!s.userId;
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
      } else if (next === "signedOut") renderSignedOut();
      else if (next === "recovery") renderRecovery();
    }
    if (view === "signedIn") renderSignedIn(s);
    const ek = view === "disabled" ? null : errorKey(s);
    if (ek) say(detail, ek, s.state !== "offline");
    else if (detail.textContent && detail.textContent !== T.m_passwordUpdated) detail.textContent = "";
    renderNotices(s);
    if (s.state === "needsChoice" && s.choice && !choiceShown) openChoice(s);
    if (s.state !== "needsChoice") choiceShown = false;
  });
})();
