document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('nav-toggle');
  const nav = document.getElementById('main-nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    nav.classList.toggle('open');
    btn.textContent = nav.classList.contains('open') ? '✕' : '☰';
  });
});
