export const EXPERIMENTS = [
  { slug: 'theremin',         title: 'theremin' },
  { slug: 'air-drums',        title: 'air drums' },
  { slug: 'face-fx',          title: 'face fx' },
  { slug: 'finger-counter',   title: 'finger counter' },
  { slug: 'tetris',           title: 'tetris' },
  { slug: 'tombola',          title: 'tombola' },
  { slug: 'emoji-mirror',     title: 'emoji mirror' },
  { slug: 'connect-four',     title: 'connect four' },
  { slug: 'secret-handshake', title: 'secret handshake' },
  { slug: 'face-drums',       title: 'face drums' },
  { slug: '3d-shapes',        title: '3d shapes' },
  { slug: 'pond-surface',     title: 'pond surface' },
  { slug: 'paint',            title: 'paint' },
  { slug: 'pdf-annotator',    title: 'pdf annotator' }
];

export function getNeighbors(slug) {
  const i = EXPERIMENTS.findIndex(e => e.slug === slug);
  if (i === -1) return { prev: null, next: null };
  const n = EXPERIMENTS.length;
  return {
    prev: EXPERIMENTS[(i - 1 + n) % n],
    next: EXPERIMENTS[(i + 1) % n]
  };
}
