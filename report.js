(function () {
  const token = localStorage.getItem("dph_token") || "";
  const msg = document.getElementById("dash-msg");
  if (!token) {
    msg.textContent = "Accedi dall’Area aziendale, poi riapri questa pagina.";
    return;
  }

  fetch("/api/dashboard", { headers: { Authorization: "Bearer " + token } })
    .then((r) => {
      if (r.status === 401) throw new Error("Sessione scaduta. Torna in Area e accedi.");
      if (r.status === 404) throw new Error("Dashboard non ancora sul server. Attendi il deploy e ricarica.");
      if (!r.ok) throw new Error("Errore server " + r.status + ". Riprova dopo il deploy.");
      return r.json();
    })
    .then(draw)
    .catch((e) => {
      msg.textContent = e.message || "Non riesco a leggere i dati. Accedi di nuovo da Area aziendale.";
    });

  function draw(d) {
    document.getElementById("dash-sub").textContent =
      (d.azienda || "Azienda") + " · " + d.n_forecasts + " previsioni salvate";
    msg.textContent = d.hint || "";
    const kpis = document.getElementById("kpi-row");
    kpis.innerHTML =
      card("Previsioni", String(d.n_forecasts)) +
      card("MAPE medio", d.avg_mape != null ? d.avg_mape + " %" : "—") +
      card("Confronti", String((d.history || []).filter((h) => h.mape != null).length));

    const labels = (d.history || []).slice().reverse().map((h) =>
      new Date(h.created_at * 1000).toLocaleDateString("it-IT")
    );
    const values = (d.history || []).slice().reverse().map((h) => h.mape);
    const ctx = document.getElementById("mape-chart");
    if (ctx && window.Chart) {
      new Chart(ctx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [{
            label: "MAPE %",
            data: values,
            borderColor: "#1e3a5f",
            tension: 0.2,
            spanGaps: true
          }]
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      });
    }

    const box = document.getElementById("compare-box");
    const rows = d.last_compare || [];
    if (!rows.length) {
      box.innerHTML = "<p class='upload-hint'>Ancora nessun consuntivo da confrontare. Salva una previsione, il mese dopo ricarica lo storico e salva di nuovo.</p>";
      return;
    }
    box.innerHTML = rows.map((s) => {
      const body = (s.points || []).map((p) =>
        "<tr><td>" + p.date + "</td><td>" + p.forecast + "</td><td>" + p.actual + "</td><td>" +
        (p.mape != null ? p.mape + " %" : "—") + "</td></tr>"
      ).join("");
      return "<h3>" + s.name + "</h3><table class='results-table'><thead><tr><th>Periodo</th><th>Previsione</th><th>Consuntivo</th><th>MAPE</th></tr></thead><tbody>" + body + "</tbody></table>";
    }).join("");
  }

  function card(title, value) {
    return '<div class="form-group"><label>' + title + "</label><p style='font-size:1.6rem;margin:0;font-weight:700;'>" + value + "</p></div>";
  }
})();
