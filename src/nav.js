import { getNeighbors } from './experiments.js';

function setup() {
  const m = window.location.pathname.match(/\/experiments\/([^/]+)/);
  if (!m) return;
  const { prev, next } = getNeighbors(m[1]);
  if (!prev || !next) return;

  const style = document.createElement('style');
  style.textContent = `
    #experiment-nav {
      position: absolute; right: 160px; top: 12px;
      display: flex; gap: 6px;
      z-index: 10;
    }
    #experiment-nav a {
      font-size: 12px; color: #eaeaea; text-decoration: none;
      background: rgba(0, 0, 0, 0.45); padding: 8px 10px; border-radius: 6px;
      line-height: 1;
    }
    #experiment-nav a:hover { background: rgba(0, 0, 0, 0.7); }
  `;
  document.head.appendChild(style);

  const nav = document.createElement('div');
  nav.id = 'experiment-nav';
  nav.innerHTML = `
    <a href="/experiments/${prev.slug}/" title="prev: ${prev.title}">←</a>
    <a href="/experiments/${next.slug}/" title="next: ${next.title}">→</a>
  `;
  document.body.appendChild(nav);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setup);
} else {
  setup();
}
