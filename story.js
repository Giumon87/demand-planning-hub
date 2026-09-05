(function () {
  const slides = [
    {
      kicker: "1 / 5",
      title: "Oggi si parte a sensazione",
      text: "I commerciali sentono il mercato. Il magazzino sente lo stock. Manca un numero condiviso: quanto venderemo il mese prossimo.",
      voice: "Oggi si parte a sensazione. I commerciali sentono il mercato, il magazzino sente lo stock. Manca un numero condiviso."
    },
    {
      kicker: "2 / 5",
      title: "Se prevedi troppo",
      text: "Compri e produci di più “per sicurezza”. Il capitale resta fermo sugli scaffali. Poi si sconta.",
      voice: "Se prevedi troppo, produci di più per sicurezza. Il capitale resta fermo sugli scaffali."
    },
    {
      kicker: "3 / 5",
      title: "Se prevedi troppo poco",
      text: "Manca il pezzo dal dealer. Si perde la vendita e mesi di lavoro commerciale.",
      voice: "Se prevedi troppo poco, manca il pezzo. Si perde la vendita e il lavoro dei commerciali."
    },
    {
      kicker: "4 / 5",
      title: "Una previsione usabile",
      text: "Storico in Excel, modello statistico, correzioni dei commerciali. Un file che produzione e acquisti possono seguire.",
      voice: "Una previsione usabile nasce dallo storico, dal modello, e dalle correzioni dei commerciali."
    },
    {
      kicker: "5 / 5",
      title: "Demand Planning Hub",
      text: "Strumento, metodo e prima consulenza. La bussola della domanda, per PMI che oggi non hanno un planner dedicato.",
      voice: "Demand Planning Hub. Strumento, metodo e prima consulenza. La bussola della domanda."
    }
  ];
  const root = document.getElementById("dph-story");
  if (!root) return;
  let i = 0;
  const title = document.getElementById("story-title");
  const text = document.getElementById("story-text");
  const kick = document.getElementById("story-kicker");
  const dots = document.getElementById("story-dots");

  function speak(t) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "it-IT";
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }
  function render() {
    const s = slides[i];
    kick.textContent = s.kicker;
    title.textContent = s.title;
    text.textContent = s.text;
    dots.innerHTML = slides.map((_, n) =>
      '<button type="button" class="story-dot' + (n === i ? " on" : "") + '" data-i="' + n + '"></button>'
    ).join("");
  }
  document.getElementById("story-next").addEventListener("click", () => {
    i = Math.min(slides.length - 1, i + 1);
    render();
    speak(slides[i].voice);
  });
  document.getElementById("story-prev").addEventListener("click", () => {
    i = Math.max(0, i - 1);
    render();
  });
  document.getElementById("story-play").addEventListener("click", () => speak(slides[i].voice));
  dots.addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    i = Number(b.getAttribute("data-i"));
    render();
    speak(slides[i].voice);
  });
  render();
})();
