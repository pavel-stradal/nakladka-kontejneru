const authEls = {
  shell: document.querySelector("#authShell"),
  loading: document.querySelector("#authLoading"),
  panel: document.querySelector("#authPanel"),
  tabs: document.querySelector("#authTabs"),
  tabButtons: document.querySelectorAll(".auth-tab"),
  loginForm: document.querySelector("#loginForm"),
  registerForm: document.querySelector("#registerForm"),
  setupForm: document.querySelector("#setupAdminForm"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  rememberLogin: document.querySelector("#rememberLogin"),
  registerName: document.querySelector("#registerName"),
  registerEmail: document.querySelector("#registerEmail"),
  registerPassword: document.querySelector("#registerPassword"),
  registerPasswordAgain: document.querySelector("#registerPasswordAgain"),
  setupName: document.querySelector("#setupAdminName"),
  setupEmail: document.querySelector("#setupAdminEmail"),
  setupPassword: document.querySelector("#setupAdminPassword"),
  setupPasswordAgain: document.querySelector("#setupAdminPasswordAgain"),
  message: document.querySelector("#authMessage"),
  userName: document.querySelector("#currentUserName"),
  openAdmin: document.querySelector("#openAdmin"),
  logout: document.querySelector("#logoutButton"),
  adminDialog: document.querySelector("#adminDialog"),
  closeAdmin: document.querySelector("#closeAdmin"),
  adminUsers: document.querySelector("#adminUsers"),
  adminMessage: document.querySelector("#adminMessage"),
};

let currentUser = null;
let setupKey = "";
let plannerScriptsPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(new Error("Aplikaci se nepodařilo načíst. Zkontrolujte připojení a zkuste to znovu."));
    };
    document.body.appendChild(script);
  });
}

function loadPlannerScripts() {
  if (!plannerScriptsPromise) {
    const loadThree = window.THREE ? Promise.resolve() : loadScript("three.global.js?v=2");
    plannerScriptsPromise = loadThree
      .then(() => loadScript("app.js?v=56"))
      .catch((error) => {
        plannerScriptsPromise = null;
        throw error;
      });
  }
  return plannerScriptsPromise;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function api(path, options = {}) {
  const requestOptions = {
    credentials: "same-origin",
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers,
  };
  const retryable = path === "/api/auth/login" || path === "/api/auth/me" || path === "/api/auth/logout";
  const attempts = retryable ? 3 : 1;
  let response;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      response = await fetch(path, requestOptions);
    } catch {
      if (attempt === attempts - 1) {
        throw new Error("Spojení s přihlašovací službou se nezdařilo. Obnovte stránku a zkuste to znovu.");
      }
      await delay(350 * (attempt + 1));
      continue;
    }
    if (response.status < 500 || attempt === attempts - 1) break;
    await delay(350 * (attempt + 1));
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Požadavek se nepodařilo dokončit.");
  return data;
}

function setBusy(form, busy) {
  const button = form.querySelector("button[type='submit']");
  form.querySelectorAll("input, button").forEach((control) => { control.disabled = busy; });
  if (button) button.classList.toggle("is-busy", busy);
}

function showMessage(element, message, type = "error") {
  element.textContent = message;
  element.dataset.type = message ? type : "";
}

function showAuthView(view) {
  const setup = view === "setup";
  authEls.tabs.hidden = setup;
  authEls.loginForm.hidden = view !== "login";
  authEls.registerForm.hidden = view !== "register";
  authEls.setupForm.hidden = !setup;
  authEls.tabButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.authView === view));
  showMessage(authEls.message, "");
}

function showAnonymous(view = "login") {
  currentUser = null;
  window.__authenticatedUser = null;
  document.body.dataset.authState = "anonymous";
  authEls.loading.hidden = true;
  authEls.panel.hidden = false;
  showAuthView(view);
}

async function showAuthenticated(user) {
  currentUser = user;
  window.__authenticatedUser = user;
  authEls.userName.textContent = user.name;
  authEls.openAdmin.hidden = user.role !== "admin";
  document.body.dataset.authState = "loading";
  authEls.panel.hidden = true;
  authEls.loading.hidden = false;
  authEls.loading.textContent = "Načítám plánovač…";
  await loadPlannerScripts();
  authEls.loading.hidden = true;
  document.body.dataset.authState = "authenticated";
  window.dispatchEvent(new CustomEvent("planner-authenticated", { detail: user }));
}

authEls.tabButtons.forEach((button) => button.addEventListener("click", () => showAuthView(button.dataset.authView)));

authEls.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(authEls.loginForm, true);
  showMessage(authEls.message, "");
  try {
    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: authEls.loginEmail.value,
        password: authEls.loginPassword.value,
        remember: authEls.rememberLogin.checked,
      }),
    });
    const result = await api("/api/auth/me");
    authEls.loginPassword.value = "";
    await showAuthenticated(result.user);
  } catch (error) {
    showAnonymous("login");
    showMessage(authEls.message, error.message);
  } finally {
    setBusy(authEls.loginForm, false);
  }
});

authEls.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (authEls.registerPassword.value !== authEls.registerPasswordAgain.value) {
    showMessage(authEls.message, "Zadaná hesla se neshodují.");
    return;
  }
  setBusy(authEls.registerForm, true);
  showMessage(authEls.message, "");
  try {
    const result = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: authEls.registerName.value,
        email: authEls.registerEmail.value,
        password: authEls.registerPassword.value,
      }),
    });
    authEls.loginEmail.value = authEls.registerEmail.value;
    authEls.registerForm.reset();
    showAuthView("login");
    showMessage(authEls.message, result.message, "success");
  } catch (error) {
    showMessage(authEls.message, error.message);
  } finally {
    setBusy(authEls.registerForm, false);
  }
});

authEls.setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (authEls.setupPassword.value !== authEls.setupPasswordAgain.value) {
    showMessage(authEls.message, "Zadaná hesla se neshodují.");
    return;
  }
  setBusy(authEls.setupForm, true);
  try {
    await api("/api/auth/setup-admin", {
      method: "POST",
      body: JSON.stringify({
        setupKey,
        name: authEls.setupName.value,
        email: authEls.setupEmail.value,
        password: authEls.setupPassword.value,
      }),
    });
    const email = authEls.setupEmail.value;
    history.replaceState({}, "", location.pathname);
    setupKey = "";
    authEls.loginEmail.value = email;
    authEls.setupForm.reset();
    showAuthView("login");
    showMessage(authEls.message, "Administrátor byl vytvořen. Nyní se přihlaste.", "success");
  } catch (error) {
    showMessage(authEls.message, error.message);
  } finally {
    setBusy(authEls.setupForm, false);
  }
});

authEls.logout.addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST" }); } catch { /* Session still ends locally. */ }
  if (authEls.adminDialog.open) authEls.adminDialog.close();
  showAnonymous("login");
});

function statusLabel(status) {
  return ({ pending: "Čeká", active: "Aktivní", rejected: "Odmítnutý", disabled: "Deaktivovaný" })[status] || status;
}

function actionButtons(user, currentUserId) {
  if (user.id === currentUserId) return "<span class=\"small-note\">Váš účet</span>";
  if (user.status === "pending") return `<button data-user-action="approve" data-user-id="${user.id}">Schválit</button><button class="danger-command" data-user-action="reject" data-user-id="${user.id}">Odmítnout</button>`;
  if (user.status === "active") return `<button class="danger-command" data-user-action="disable" data-user-id="${user.id}">Deaktivovat</button>`;
  return `<button data-user-action="activate" data-user-id="${user.id}">Aktivovat</button>`;
}

async function loadAdminUsers() {
  showMessage(authEls.adminMessage, "Načítám registrace…", "info");
  try {
    const result = await api("/api/admin/users");
    authEls.adminUsers.innerHTML = result.users.map((user) => `
      <tr>
        <td><strong>${escapeHtml(user.name)}</strong><span class="small-note">${escapeHtml(user.email)}</span></td>
        <td><span class="status-badge" data-status="${user.status}">${statusLabel(user.status)}</span>${user.role === "admin" ? '<span class="small-note">Administrátor</span>' : ""}</td>
        <td>${new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(user.createdAt))}</td>
        <td class="admin-actions">${actionButtons(user, result.currentUserId)}</td>
      </tr>
    `).join("");
    showMessage(authEls.adminMessage, result.users.some((user) => user.status === "pending") ? "Nové registrace čekají na rozhodnutí." : "Žádné registrace nečekají.", "info");
  } catch (error) {
    showMessage(authEls.adminMessage, error.message);
  }
}

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

authEls.openAdmin.addEventListener("click", async () => {
  authEls.adminDialog.showModal();
  await loadAdminUsers();
});
authEls.closeAdmin.addEventListener("click", () => authEls.adminDialog.close());
authEls.adminDialog.addEventListener("click", (event) => {
  if (event.target === authEls.adminDialog) authEls.adminDialog.close();
});
authEls.adminUsers.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-user-action]");
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/admin/users/${encodeURIComponent(button.dataset.userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ action: button.dataset.userAction }),
    });
    await loadAdminUsers();
  } catch (error) {
    showMessage(authEls.adminMessage, error.message);
    button.disabled = false;
  }
});

(async function bootstrapAuth() {
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  if (params.get("setup") === "admin" && hash.get("key")) {
    setupKey = hash.get("key");
    showAnonymous("setup");
    return;
  }
  try {
    const result = await api("/api/auth/me");
    if (result.authenticated) await showAuthenticated(result.user);
    else showAnonymous();
  } catch {
    showAnonymous();
    showMessage(authEls.message, "Přihlašovací služba není dostupná. Zkuste stránku obnovit.");
  }
})();
