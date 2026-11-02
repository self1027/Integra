(() => {
  const root = document.documentElement;
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  let selected;
  try { selected = localStorage.getItem('integra-theme'); } catch {}
  const apply = theme => {
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#101114' : '#f8f7f4';
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.setAttribute('aria-label', theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
  };
  if (selected !== 'dark' && selected !== 'light') selected = null;
  apply(selected || (preference.matches ? 'dark' : 'light'));
  preference.addEventListener('change', event => {
    if (!selected) apply(event.matches ? 'dark' : 'light');
  });
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('themeToggle');
    apply(root.dataset.theme);
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      selected = root.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(selected);
      try { localStorage.setItem('integra-theme', selected); } catch {}
    });
  });
})();
