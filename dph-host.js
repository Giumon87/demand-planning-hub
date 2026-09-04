(function () {
  var APP = "https://app.demandplanninghub.com";
  var host = (location.hostname || "").toLowerCase();
  var onApp =
    host === "app.demandplanninghub.com" ||
    host === "localhost" ||
    host === "127.0.0.1";
  if (onApp) return;

  function toApp(path) {
    location.href = APP + path;
  }

  document.addEventListener(
    "click",
    function (e) {
      var el = e.target.closest("a,button");
      if (!el) return;
      if (el.id === "btn-start" || el.id === "btn-start-2") {
        e.preventDefault();
        e.stopPropagation();
        toApp("/index.html?go=upload");
        return;
      }
      if (el.id === "nav-account") {
        e.preventDefault();
        toApp("/area.html");
        return;
      }
      var href = el.getAttribute("href") || "";
      if (href === "area.html" || href.indexOf("area.html") === 0) {
        e.preventDefault();
        toApp("/area.html");
        return;
      }
      if (href.indexOf("index.html") === 0 || href === "index.html?go=upload") {
        e.preventDefault();
        toApp("/" + href.replace(/^\//, ""));
      }
    },
    true
  );
})();
