// Formatos de saída e áreas seguras (onde a interface de cada app cobre o vídeo).
// Margens em fração da altura/largura. Valores conservadores medidos nas interfaces de 2025-2026.
export const PLATFORMS = {
  tiktok:   { id: 'tiktok',   label: 'TikTok',            aspect: '9:16', w: 1080, h: 1920, fps: 30, maxDur: 600, safe: { top: 0.13, bottom: 0.24, left: 0.06, right: 0.16 }, captionY: 0.62 },
  reels:    { id: 'reels',    label: 'Instagram Reels',   aspect: '9:16', w: 1080, h: 1920, fps: 30, maxDur: 180, safe: { top: 0.12, bottom: 0.22, left: 0.06, right: 0.14 }, captionY: 0.63 },
  shorts:   { id: 'shorts',   label: 'YouTube Shorts',    aspect: '9:16', w: 1080, h: 1920, fps: 30, maxDur: 180, safe: { top: 0.10, bottom: 0.22, left: 0.06, right: 0.15 }, captionY: 0.63 },
  youtube:  { id: 'youtube',  label: 'YouTube',           aspect: '16:9', w: 1920, h: 1080, fps: 30, maxDur: 43200, safe: { top: 0.05, bottom: 0.12, left: 0.05, right: 0.05 }, captionY: 0.80 },
  feed:     { id: 'feed',     label: 'Instagram feed 4:5', aspect: '4:5', w: 1080, h: 1350, fps: 30, maxDur: 3600, safe: { top: 0.06, bottom: 0.10, left: 0.05, right: 0.05 }, captionY: 0.74 },
  square:   { id: 'square',   label: 'Quadrado 1:1',      aspect: '1:1',  w: 1080, h: 1080, fps: 30, maxDur: 3600, safe: { top: 0.06, bottom: 0.10, left: 0.05, right: 0.05 }, captionY: 0.76 },
  facebook: { id: 'facebook', label: 'Facebook',          aspect: '4:5',  w: 1080, h: 1350, fps: 30, maxDur: 14400, safe: { top: 0.06, bottom: 0.12, left: 0.05, right: 0.05 }, captionY: 0.74 },
  presentation: { id: 'presentation', label: 'Apresentação 16:9', aspect: '16:9', w: 1920, h: 1080, fps: 30, maxDur: 43200, safe: { top: 0.05, bottom: 0.08, left: 0.05, right: 0.05 }, captionY: 0.82 },
};

export function makeFormat(platformId, opts = {}) {
  const p = PLATFORMS[platformId] || PLATFORMS.reels;
  let w = p.w, h = p.h;
  if (opts.resolution === '4k') { const k = 2; w *= k; h *= k; }
  else if (opts.resolution === '720p') { const k = 2 / 3; w = Math.round(w * k / 2) * 2; h = Math.round(h * k / 2) * 2; }
  if (opts.width && opts.height) { w = opts.width; h = opts.height; }
  return { platform: p.id, label: p.label, aspect: p.aspect, w, h, fps: opts.fps || p.fps, safe: p.safe, captionY: p.captionY, maxDur: p.maxDur };
}

// Retângulo seguro em pixels.
export function safeRect(fmt) {
  const s = fmt.safe;
  return { x: s.left * fmt.w, y: s.top * fmt.h, w: fmt.w * (1 - s.left - s.right), h: fmt.h * (1 - s.top - s.bottom) };
}

// Bitrate razoável por resolução (bits/s) para a exportação.
export function bitrateFor(fmt) {
  const px = fmt.w * fmt.h * (fmt.fps / 30);
  return Math.round(Math.min(45e6, Math.max(4e6, px * 6.5)));
}
