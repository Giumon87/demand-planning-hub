(function () {
  const tokenKey = "dph_token";
  const api = "";

  function token() {
    return localStorage.getItem(tokenKey) || "";
  }
  function headers() {
    return { Authorization: "Bearer " + token() };
  }
  function msg(el, text, ok) {
    const n = document.getElementById(el);
    if (!n) return;
    n.textContent = text;
    n.style.color = ok ? "#059669" : "#b45309";
  }
  function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }
  function fmtDate(sec) {
    return new Date(sec * 1000).toLocaleString("it-IT");
  }

  async function parseErr(res) {
    try {
      const j = await res.json();
      return j.detail || JSON.stringify(j);
    } catch (e) {
      return "Errore " + res.status;
    }
  }

  async function refreshMe() {
    if (!token()) return showAuth();
    let res;
    try {
      res = await fetch(api + "/api/me", { headers: headers() });
    } catch (e) {
      msg("auth-msg", "Il server non è acceso. Leggi ISTRUZIONI-SERVER.txt.", false);
      return showAuth();
    }
    if (!res.ok) {
      localStorage.removeItem(tokenKey);
      return showAuth();
    }
    const me = await res.json();
    showVault(me);
    await refreshFiles();
    await refreshForecasts();
  }

  function showAuth() {
    document.getElementById("auth-box").style.display = "block";
    document.getElementById("vault-box").style.display = "none";
  }
  function showVault(me) {
    document.getElementById("auth-box").style.display = "none";
    document.getElementById("vault-box").style.display = "block";
    document.getElementById("who").textContent =
      me.nome + " " + me.cognome + " · " + me.azienda + " · piano " + me.piano;
  }

  async function refreshForecasts() {
    const box = document.querySelector("#fc-table tbody");
    if (!box) return;
    const res = await fetch(api + "/api/forecasts", { headers: headers() });
    if (!res.ok) return;
    const data = await res.json();
    box.innerHTML = "";
    if (!data.forecasts.length) {
      box.innerHTML = "<tr><td colspan='4'>Nessuna previsione salvata. Calcola nello strumento e premi Salva.</td></tr>";
      return;
    }
    data.forecasts.forEach((f) => {
      const mape = f.mape != null ? f.mape + "% (" + f.mape_n + " punti)" : "— (aspetta il consuntivo)";
      const tr = document.createElement("tr");
      tr.innerHTML = "<td>" + f.title + "</td><td>" + fmtDate(f.created_at) + "</td><td>" + mape +
        "</td><td><button type='button' class='btn btn-text' data-open='" + f.id + "'>Apri</button> " +
        "<button type='button' class='btn btn-text' data-rm='" + f.id + "'>Elimina</button></td>";
      box.appendChild(tr);
    });
    box.querySelectorAll("[data-open]").forEach((b) => {
      b.addEventListener("click", () => openForecast(b.getAttribute("data-open")));
    });
    box.querySelectorAll("[data-rm]").forEach((b) => {
      b.addEventListener("click", () => removeForecast(b.getAttribute("data-rm")));
    });
  }

  async function openForecast(id) {
    window.location.href = "index.html?forecast=" + id;
    return;
    const box = document.getElementById("fc-detail");
    const res = await fetch(api + "/api/forecasts/" + id, { headers: headers() });
    if (!res.ok) {
      box.textContent = "Non riesco ad aprire questa previsione.";
      return;
    }
    const f = await res.json();
    const series = (f.payload && f.payload.series) || [];
    let html = "<h3>" + f.title + "</h3>";
    series.forEach((s) => {
      html += "<p><strong>" + s.name + "</strong>" + (s.chosen ? " · " + s.chosen : "") + "</p><table class='results-table'><thead><tr><th>Data</th><th>Previsione</th></tr></thead><tbody>";
      (s.forecast || []).forEach((p) => {
        html += "<tr><td>" + p.date + "</td><td>" + (p.value != null ? Number(p.value).toLocaleString("it-IT") : "") + "</td></tr>";
      });
      html += "</tbody></table>";
    });
    box.innerHTML = html || "<p>Nessuna serie.</p>";
  }

  async function removeForecast(id) {
    if (!confirm("Eliminare questa previsione salvata?")) return;
    await fetch(api + "/api/forecasts/" + id, { method: "DELETE", headers: headers() });
    document.getElementById("fc-detail").innerHTML = "";
    await refreshForecasts();
  }

  async function refreshFiles() {
    const res = await fetch(api + "/api/files", { headers: headers() });
    if (!res.ok) return;
    const data = await res.json();
    const tb = document.querySelector("#file-table tbody");
    tb.innerHTML = "";
    if (!data.files.length) {
      tb.innerHTML = "<tr><td colspan='4'>Nessun file caricato.</td></tr>";
      return;
    }
    data.files.forEach((f) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + f.name + "</td><td>" + fmtSize(f.size) + "</td><td>" + fmtDate(f.created_at) +
        "</td><td><button class='btn btn-text' data-dl='" + f.id + "'>Scarica</button> " +
        "<button class='btn btn-text' data-del='" + f.id + "'>Elimina</button></td>";
      tb.appendChild(tr);
    });
    tb.querySelectorAll("[data-dl]").forEach((b) => {
      b.addEventListener("click", () => download(b.getAttribute("data-dl")));
    });
    tb.querySelectorAll("[data-del]").forEach((b) => {
      b.addEventListener("click", () => remove(b.getAttribute("data-del")));
    });
  }

  async function download(id) {
    const res = await fetch(api + "/api/files/" + id, { headers: headers() });
    if (!res.ok) {
      msg("up-msg", await parseErr(res), false);
      return;
    }
    const blob = await res.blob();
    const cd = res.headers.get("content-disposition") || "";
    let name = "file.xlsx";
    const m = cd.match(/filename="?([^"]+)"?/);
    if (m) name = m[1];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  }

  async function remove(id) {
    if (!confirm("Eliminare questo file dall’area aziendale?")) return;
    const res = await fetch(api + "/api/files/" + id, { method: "DELETE", headers: headers() });
    if (!res.ok) {
      msg("up-msg", await parseErr(res), false);
      return;
    }
    await refreshFiles();
  }

  async function postForm(url, fields) {
    const fd = new FormData();
    Object.keys(fields).forEach((k) => fd.append(k, fields[k]));
    const res = await fetch(api + url, { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || "Errore");
    return body;
  }

  function showRegisterForm() {
    document.getElementById("auth-title").textContent = "Crea l’account";
    document.getElementById("reg-fields").style.display = "";
    document.getElementById("btn-register").style.display = "";
    document.getElementById("btn-signin").style.display = "none";
    document.getElementById("auth-links").style.display = "none";
    document.getElementById("auth-links-reg").style.display = "block";
  }
  function showLoginForm() {
    document.getElementById("auth-title").textContent = "Accedi";
    document.getElementById("reg-fields").style.display = "none";
    document.getElementById("btn-register").style.display = "none";
    document.getElementById("btn-signin").style.display = "";
    document.getElementById("auth-links").style.display = "block";
    document.getElementById("auth-links-reg").style.display = "none";
  }
  document.getElementById("link-register").addEventListener("click", (e) => {
    e.preventDefault();
    showRegisterForm();
  });
  document.getElementById("link-login").addEventListener("click", (e) => {
    e.preventDefault();
    showLoginForm();
  });
  document.getElementById("link-forgot").addEventListener("click", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = prompt("Nuova password (min. 8 caratteri):");
    if (!password) return;
    const code = prompt("Codice reset pilota:");
    try {
      await postForm("/api/reset-password", { email, password, code: code || "" });
      msg("auth-msg", "Password aggiornata. Ora accedi.", true);
    } catch (err) {
      msg("auth-msg", err.message, false);
    }
  });

  document.getElementById("btn-register").addEventListener("click", async () => {
    try {
      const body = await postForm("/api/register", {
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
        nome: document.getElementById("nome").value,
        cognome: document.getElementById("cognome").value,
        azienda: document.getElementById("azienda").value
      });
      localStorage.setItem(tokenKey, body.token);
      msg("auth-msg", "Account creato.", true);
      await refreshMe();
    } catch (e) {
      msg("auth-msg", e.message, false);
    }
  });

  document.getElementById("btn-signin").addEventListener("click", async () => {
    try {
      const body = await postForm("/api/login", {
        email: document.getElementById("email").value,
        password: document.getElementById("password").value
      });
      localStorage.setItem(tokenKey, body.token);
      await refreshMe();
    } catch (e) {
      msg("auth-msg", e.message, false);
    }
  });

  document.getElementById("btn-up").addEventListener("click", async () => {
    const inp = document.getElementById("file-up");
    if (!inp.files[0]) {
      msg("up-msg", "Scegli un file Excel o CSV.", false);
      return;
    }
    const fd = new FormData();
    fd.append("file", inp.files[0]);
    const res = await fetch(api + "/api/files", { method: "POST", headers: headers(), body: fd });
    if (!res.ok) {
      msg("up-msg", await parseErr(res), false);
      return;
    }
    inp.value = "";
    msg("up-msg", "File salvato solo per la tua azienda.", true);
    await refreshFiles();
  });

  document.getElementById("btn-out").addEventListener("click", async () => {
    await fetch(api + "/api/logout", { method: "POST", headers: headers() });
    localStorage.removeItem(tokenKey);
    showAuth();
  });

  refreshMe();
})();
