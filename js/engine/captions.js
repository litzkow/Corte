// Legendas animadas no estilo das redes + textos com forma (círculo, arco, onda, selo, espiral, fita, empilhado).
import { clamp, ease } from './util.js';

// ---------------- FONTES ----------------
// As do Google carregam no aparelho; as locais (Inter, Poppins, Lora) vão junto com o app e servem de reserva.
export const FONTS = {
  montserrat: { family: 'Montserrat', google: 'Montserrat:ital,wght@0,700;0,800;0,900;1,900', fallback: 'Inter' },
  anton: { family: 'Anton', google: 'Anton', fallback: 'Inter' },
  bebas: { family: 'Bebas Neue', google: 'Bebas+Neue', fallback: 'Inter' },
  bangers: { family: 'Bangers', google: 'Bangers', fallback: 'Inter' },
  luckiest: { family: 'Luckiest Guy', google: 'Luckiest+Guy', fallback: 'Inter' },
  archivo: { family: 'Archivo Black', google: 'Archivo+Black', fallback: 'Inter' },
  oswald: { family: 'Oswald', google: 'Oswald:wght@500;700', fallback: 'Inter' },
  poppins: { family: 'Poppins', google: 'Poppins:wght@600;800;900', fallback: 'Poppins' },
  playfair: { family: 'Playfair Display', google: 'Playfair+Display:ital,wght@0,700;1,500;1,700', fallback: 'Lora' },
  caveat: { family: 'Caveat', google: 'Caveat:wght@700', fallback: 'Lora' },
  marker: { family: 'Permanent Marker', google: 'Permanent+Marker', fallback: 'Inter' },
  rubikmono: { family: 'Rubik Mono One', google: 'Rubik+Mono+One', fallback: 'Inter' },
  spacemono: { family: 'Space Mono', google: 'Space+Mono:wght@700', fallback: 'DejaVu Sans Mono' },
  lilita: { family: 'Lilita One', google: 'Lilita+One', fallback: 'Inter' },
  inter: { family: 'Inter', google: null, fallback: 'Inter' },
  lora: { family: 'Lora', google: null, fallback: 'Lora' },
};
export const googleFontsHref = () => 'https://fonts.googleapis.com/css2?' + Object.values(FONTS).filter(f => f.google).map(f => 'family=' + f.google).join('&') + '&display=swap';
const AVAIL = new Map(); // id -> true/false depois de tentar carregar
const LOCAL = new Set(['Inter', 'Poppins', 'Lora', 'DejaVu Sans Mono']);
const fam = id => { const f = FONTS[id] || FONTS.inter; return AVAIL.get(id) === false ? `"${f.fallback}", "Inter", sans-serif` : `"${f.family}", "${f.fallback}", "Inter", sans-serif`; };
// fonte de exibição que não carregou cai para Inter bem grossa (senão fica fina e sem graça)
const wgtFor = (id, w) => AVAIL.get(id) === false && !LOCAL.has((FONTS[id] || {}).family) && (+w || 400) < 800 ? 900 : w;
export async function ensureFonts(ids) {
  if (!document.fonts) return;
  await Promise.all([...new Set(ids)].map(async id => {
    const f = FONTS[id] || FONTS.inter;
    const got = await Promise.all(['400', '700', '900'].map(w => document.fonts.load(`${w} 40px "${f.family}"`).catch(() => [])));
    AVAIL.set(id, got.some(a => a && a.length) || LOCAL.has(f.family));
  }));
}
export const fontAvailable = id => AVAIL.get(id) !== false;

// ---------------- ESTILOS DE LEGENDA ----------------
// size = fração da largura do vídeo; strokeW = fração do tamanho da letra.
export const CAPTION_STYLES = {
  hormozi:  { label: 'Destaque palavra', desc: 'Branca com contorno, palavra falada em amarelo e salta. O clássico viral.', font: 'montserrat', weight: 900, upper: true, size: 0.085, maxWords: 3, fill: '#FFFFFF', stroke: '#000000', strokeW: 0.2, shadow: [0, 0.06, 0.1, 'rgba(0,0,0,.55)'], active: { fill: '#FFE81F', scale: 1.14 }, emph: { fill: '#3DFF6E' }, enter: 'pop' },
  beast:    { label: 'Colorido gigante', desc: 'Letra de quadrinho enorme, uma cor por frase, contorno grosso e leve inclinação.', font: 'luckiest', weight: 400, upper: true, size: 0.11, maxWords: 2, fill: '#FFFFFF', stroke: '#000000', strokeW: 0.22, shadow: [0.04, 0.07, 0, '#000000'], cycle: ['#FFE81F', '#3DFF6E', '#FF4D6D', '#4DD9FF', '#FFFFFF'], active: { scale: 1.08 }, enter: 'pop', tilt: 4 },
  boxed:    { label: 'Caixa na palavra', desc: 'A palavra falada ganha uma caixa colorida atrás. Limpo e moderno.', font: 'poppins', weight: 800, upper: false, size: 0.072, maxWords: 4, fill: '#FFFFFF', stroke: null, shadow: [0, 0.04, 0.12, 'rgba(0,0,0,.6)'], active: { box: '#7C4DFF', fill: '#FFFFFF', scale: 1.04 }, enter: 'fade' },
  karaoke:  { label: 'Karaokê', desc: 'A frase inteira aparece e vai pintando conforme a fala.', font: 'montserrat', weight: 900, upper: true, size: 0.068, maxWords: 6, fill: 'rgba(255,255,255,.55)', stroke: '#000000', strokeW: 0.14, shadow: [0, 0.05, 0.1, 'rgba(0,0,0,.5)'], sweep: '#22E1FF', enter: 'fade', mode: 'karaoke' },
  impact:   { label: 'Uma palavra, impacto', desc: 'Uma palavra por vez, condensada e enorme, entra batendo.', font: 'anton', weight: 400, upper: true, size: 0.16, maxWords: 1, fill: '#FFFFFF', stroke: '#000000', strokeW: 0.08, shadow: [0, 0.03, 0.2, 'rgba(0,0,0,.7)'], emph: { fill: '#FF3B3B' }, enter: 'slam' },
  neon:     { label: 'Neon', desc: 'Brilho rosa e azul, como letreiro.', font: 'montserrat', weight: 800, upper: true, size: 0.075, maxWords: 3, fill: '#FFFFFF', stroke: null, glow: '#FF2BD6', active: { glow: '#22E1FF', scale: 1.08 }, enter: 'flicker' },
  minimal:  { label: 'Minimalista', desc: 'Frase limpa, sem caixa alta, sombra suave.', font: 'inter', weight: 600, upper: false, size: 0.052, maxWords: 8, fill: '#FFFFFF', stroke: null, shadow: [0, 0.04, 0.25, 'rgba(0,0,0,.65)'], enter: 'fade', mode: 'sentence' },
  cinema:   { label: 'Legenda de cinema', desc: 'Discreta, embaixo, como em filme.', font: 'inter', weight: 500, upper: false, size: 0.042, maxWords: 10, fill: '#F4F1E8', stroke: null, shadow: [0, 0.05, 0.2, 'rgba(0,0,0,.9)'], enter: 'fade', mode: 'sentence', low: true },
  documentary: { label: 'Documentário', desc: 'Faixa escura translúcida, texto claro.', font: 'inter', weight: 600, upper: false, size: 0.046, maxWords: 9, fill: '#FFFFFF', stroke: null, bar: 'rgba(0,0,0,.55)', enter: 'fade', mode: 'sentence' },
  elegant:  { label: 'Editorial elegante', desc: 'Serifa itálica misturada com caixa alta fina. Estética de revista.', font: 'playfair', weight: 700, italic: true, upper: false, size: 0.07, maxWords: 4, fill: '#FFFFFF', stroke: null, shadow: [0, 0.03, 0.2, 'rgba(0,0,0,.5)'], emph: { font: 'montserrat', weight: 800, upper: true, italic: false, scaleSize: 0.82, fill: '#F2D49B' }, enter: 'rise' },
  typewriter: { label: 'Máquina de escrever', desc: 'Letra por letra com cursor piscando.', font: 'spacemono', weight: 700, upper: false, size: 0.055, maxWords: 6, fill: '#FFFFFF', stroke: null, bar: 'rgba(0,0,0,.7)', enter: 'type', mode: 'sentence' },
  bubble:   { label: 'Balão branco', desc: 'Texto preto em pílula branca, estilo vlog.', font: 'poppins', weight: 800, upper: false, size: 0.06, maxWords: 4, fill: '#111111', stroke: null, pill: '#FFFFFF', enter: 'pop' },
  gradient: { label: 'Degradê pôr do sol', desc: 'Letra grossa preenchida com degradê quente.', font: 'archivo', weight: 400, upper: true, size: 0.085, maxWords: 2, gradient: ['#FFD166', '#FF5E62', '#B5179E'], stroke: '#000000', strokeW: 0.1, shadow: [0, 0.05, 0.15, 'rgba(0,0,0,.6)'], enter: 'pop' },
  outline:  { label: 'Contorno vazado', desc: 'Letras vazadas; a palavra falada preenche.', font: 'archivo', weight: 400, upper: true, size: 0.085, maxWords: 3, fill: 'transparent', stroke: '#FFFFFF', strokeW: 0.035, active: { fill: '#FFFFFF' }, enter: 'fade' },
  retro3d:  { label: '3D retrô', desc: 'Letra com volume em camadas, cor de fliperama.', font: 'rubikmono', weight: 400, upper: true, size: 0.068, maxWords: 2, fill: '#FFE81F', stroke: '#1B0A3C', strokeW: 0.08, extrude: ['#FF2BD6', 6], enter: 'pop' },
  travel:   { label: 'Escrito à mão', desc: 'Letra de caneta, levemente torta. Viagem e vlog.', font: 'caveat', weight: 700, upper: false, size: 0.1, maxWords: 3, fill: '#FFFFFF', stroke: null, shadow: [0, 0.03, 0.15, 'rgba(0,0,0,.6)'], enter: 'rise', tilt: 5 },
  clean:    { label: 'Clássico limpo', desc: 'Branco, negrito, sombra. Combina com tudo.', font: 'inter', weight: 800, upper: false, size: 0.06, maxWords: 5, fill: '#FFFFFF', stroke: '#000000', strokeW: 0.1, shadow: [0, 0.04, 0.12, 'rgba(0,0,0,.6)'], enter: 'fade' },
};

// palavras que costumam merecer destaque
const POWER = new Set('nunca sempre segredo dinheiro gratis grátis melhor pior incrivel incrível verdade erro errado certo agora hoje importante maior menor rapido rápido facil fácil impossivel impossível perigo cuidado atencao atenção pare morte vida amor guerra imperio império rei deus deuses never always secret money free best worst amazing truth wrong right now today important biggest fastest easy impossible danger stop death life love war empire king god gods million milhao milhão bilhao bilhão'.split(' '));
export function markEmphasis(words) {
  return words.map((w, i) => {
    const clean = w.w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const num = /\d/.test(w.w);
    const bang = /[!?]$/.test(w.w);
    const proper = i > 0 && /^\p{Lu}/u.test(w.w) && !/[.!?]$/.test(words[i - 1].w);
    return { ...w, emph: w.emph || num || bang || POWER.has(clean) || proper || clean.length >= 10 };
  });
}

// Agrupa palavras em frases curtas que cabem na tela.
export function groupWords(words, style, W) {
  const st = CAPTION_STYLES[style] || CAPTION_STYLES.clean;
  const maxW = st.maxWords;
  const groups = [];
  let cur = [];
  const flush = () => { if (cur.length) groups.push({ words: cur, t0: cur[0].t0, t1: cur[cur.length - 1].t1 }); cur = []; };
  for (let i = 0; i < words.length; i++) {
    const w = words[i], prev = words[i - 1];
    if (cur.length && (cur.length >= maxW || (prev && w.t0 - prev.t1 > 0.35) || /[.!?;:]$/.test(prev.w) || (/,$/.test(prev.w) && cur.length >= Math.ceil(maxW / 2)))) flush();
    cur.push(w);
  }
  flush();
  // segura a frase na tela até a próxima (se o buraco for pequeno)
  for (let i = 0; i < groups.length; i++) { const nx = groups[i + 1]; groups[i].hold = nx ? Math.min(nx.t0, groups[i].t1 + 0.6) : groups[i].t1 + 0.6; }
  return groups;
}

function setFont(ctx, st, px, over = {}) {
  const f = over.font || st.font, wgt = wgtFor(f, over.weight || st.weight), it = over.italic != null ? over.italic : st.italic;
  ctx.font = `${it ? 'italic ' : ''}${wgt} ${Math.round(px)}px ${fam(f)}`;
}
const up = (st, s, over = {}) => (over.upper != null ? over.upper : st.upper) ? s.toLocaleUpperCase('pt-BR') : s;

// quebra em linhas para caber na largura
function layoutLines(ctx, st, words, px, maxW) {
  const lines = []; let line = [], lw = 0;
  setFont(ctx, st, px);
  const grow = st.active && st.active.scale ? st.active.scale : 1;
  const space = ctx.measureText(' ').width;
  for (const w of words) {
    const o = w.emph && st.emph ? st.emph : {};
    setFont(ctx, st, px * (o.scaleSize || 1), o);
    const ww = ctx.measureText(up(st, w.w, o)).width * grow;
    if (line.length && lw + space + ww > maxW) { lines.push({ words: line, w: lw }); line = []; lw = 0; }
    line.push({ ...w, mw: ww, o }); lw += (line.length > 1 ? space : 0) + ww;
  }
  if (line.length) lines.push({ words: line, w: lw });
  return lines;
}

function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); } }

function drawWord(ctx, st, text, x, y, px, opt) {
  const { fill, stroke, strokeW, glow, shadow, gradient, extrude } = opt;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  if (extrude) { const [c, n] = extrude; for (let k = n; k >= 1; k--) { ctx.fillStyle = c; ctx.fillText(text, x + k * px * 0.03, y + k * px * 0.03); } }
  if (shadow) { ctx.shadowOffsetX = shadow[0] * px; ctx.shadowOffsetY = shadow[1] * px; ctx.shadowBlur = shadow[2] * px; ctx.shadowColor = shadow[3]; }
  if (stroke && strokeW) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeW * px * 2; ctx.strokeText(text, x, y); ctx.shadowColor = 'transparent'; }
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = px * 0.35; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.fillStyle = glow; ctx.fillText(text, x, y); ctx.shadowBlur = px * 0.12; }
  if (gradient) { const g = ctx.createLinearGradient(0, y - px / 2, 0, y + px / 2); gradient.forEach((c, i) => g.addColorStop(i / (gradient.length - 1), c)); ctx.fillStyle = g; }
  else ctx.fillStyle = fill;
  if (fill !== 'transparent' || gradient) ctx.fillText(text, x, y);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
}

// Desenha a legenda do instante t. area = {x,y,w,h} seguro; cy = centro vertical desejado.
export function drawCaption(ctx, groups, t, styleId, area, cy, opts = {}) {
  const st = CAPTION_STYLES[styleId] || CAPTION_STYLES.clean;
  const gi = groups.findIndex(g => t >= g.t0 - 0.05 && t < g.hold);
  if (gi < 0) return;
  const g = groups[gi];
  const px = Math.min(area.w, area.h * 0.9) * st.size * 1.45 * (opts.scale || 1);
  const upper = opts.uppercase != null ? opts.uppercase : st.upper;
  const s2 = { ...st, upper };
  ctx.save();
  const lines = layoutLines(ctx, s2, g.words, px, area.w * 1.0);
  const lh = px * 1.18;
  const totalH = lines.length * lh;
  let y0 = (st.low ? area.y + area.h - totalH - px * 0.4 : cy - totalH / 2) + lh / 2;
  const age = t - g.t0;
  // entrada do grupo
  let gScale = 1, gAlpha = 1, gDy = 0;
  if (st.enter === 'pop') { const e = clamp(age / 0.16, 0, 1); gScale = 0.7 + 0.3 * ease.back(e); gAlpha = clamp(age / 0.06, 0, 1); }
  else if (st.enter === 'fade') gAlpha = clamp(age / 0.12, 0, 1);
  else if (st.enter === 'rise') { const e = clamp(age / 0.25, 0, 1); gDy = (1 - ease.out(e)) * px * 0.5; gAlpha = e; }
  else if (st.enter === 'slam') { const e = clamp(age / 0.12, 0, 1); gScale = 1.7 - 0.7 * ease.out(e); gAlpha = e; }
  else if (st.enter === 'flicker') gAlpha = age < 0.18 ? (Math.floor(age * 40) % 2 ? 0.25 : 1) : 1;
  const out = clamp((g.hold - t) / 0.08, 0, 1);
  ctx.globalAlpha = gAlpha * out;
  const cx = area.x + area.w / 2;
  ctx.translate(cx, cy); ctx.scale(gScale, gScale);
  if (st.tilt) ctx.rotate(((gi % 3) - 1) * st.tilt * Math.PI / 180);
  ctx.translate(-cx, -cy + gDy);
  const cycleColor = st.cycle ? st.cycle[gi % st.cycle.length] : null;
  // faixa de fundo (documentário / máquina de escrever)
  if (st.bar) { const bw = Math.max(...lines.map(l => l.w)) + px * 0.9; ctx.fillStyle = st.bar; roundRect(ctx, cx - bw / 2, y0 - lh / 2 - px * 0.2, bw, totalH + px * 0.4, px * 0.18); ctx.fill(); }
  let charBudget = st.enter === 'type' ? Math.floor(age * 28) : Infinity;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let x = cx - line.w / 2;
    if (st.pill) { ctx.fillStyle = st.pill; roundRect(ctx, x - px * 0.3, y0 - px * 0.66, line.w + px * 0.6, px * 1.32, px * 0.36); ctx.fill(); }
    for (const w of line.words) {
      const o = w.o || {};
      const pxw = px * (o.scaleSize || 1);
      setFont(ctx, s2, pxw, o);
      const text = up(s2, w.w, o);
      const active = t >= w.t0 && t < Math.max(w.t1, w.t0 + 0.12);
      const spoken = t >= w.t0;
      let fill = o.fill || (w.emph && st.emph && opts.highlight !== false ? st.emph.fill : null) || cycleColor || st.fill;
      let sc = 1;
      if (active && st.active) { fill = st.active.fill || fill; sc = st.active.scale || 1; }
      if (st.mode === 'karaoke') fill = spoken ? st.sweep : st.fill;
      const ww = ctx.measureText(text).width;
      const slot = w.mw || ww; const pad = (slot - ww) / 2;
      x += pad;
      // pílula e caixa
      if (active && st.active && st.active.box) { ctx.fillStyle = st.active.box; roundRect(ctx, x - pxw * 0.14, y0 - pxw * 0.6, ww + pxw * 0.28, pxw * 1.2, pxw * 0.2); ctx.fill(); }
      ctx.save();
      if (sc !== 1) { const wx = x + ww / 2; ctx.translate(wx, y0); ctx.scale(sc, sc); ctx.translate(-wx, -y0); }
      let shown = text;
      if (charBudget !== Infinity) { shown = text.slice(0, Math.max(0, charBudget)); charBudget -= text.length + 1; }
      if (shown) drawWord(ctx, st, shown, x, y0, pxw, { fill, stroke: st.stroke, strokeW: st.strokeW, glow: active && st.active && st.active.glow ? st.active.glow : st.glow, shadow: st.shadow, gradient: st.gradient, extrude: st.extrude });
      ctx.restore();
      x += ww + pad; setFont(ctx, s2, px); x += ctx.measureText(' ').width;
    }
    const typingHere = charBudget !== Infinity && (charBudget <= 0 || li === lines.length - 1) && !line._cursorDone;
    if (st.enter === 'type' && typingHere && (charBudget <= 0 ? charBudget > -line.words.reduce((a, w) => a + w.w.length + 1, 0) - 1 : true) && Math.floor(t * 2.5) % 2 === 0) { ctx.fillStyle = st.fill; ctx.fillRect(x - px * 0.1, y0 - px * 0.45, px * 0.08, px * 0.9); }
    y0 += lh;
  }
  ctx.restore();
}

// ---------------- TEXTOS COM FORMA ----------------
export const SHAPES = {
  circle: { label: 'Círculo girando', desc: 'Frase em volta de um círculo, girando devagar. Fica ótimo em volta do rosto ou num canto.' },
  badge: { label: 'Selo', desc: 'Círculo preenchido com a frase girando na borda e uma seta no meio. O "SIGA" dos vídeos virais.' },
  arc: { label: 'Arco', desc: 'Frase curvada como um sorriso ou um arco-íris.' },
  wave: { label: 'Onda', desc: 'Letras subindo e descendo numa onda que se mexe.' },
  spiral: { label: 'Espiral', desc: 'Frase entrando em espiral até o centro.' },
  ribbon: { label: 'Fita', desc: 'Faixa inclinada com texto correndo, tipo fita de aviso.' },
  stack: { label: 'Empilhado editorial', desc: 'Palavras em tamanhos diferentes, todas com a mesma largura.' },
  bounce: { label: 'Letras pulando', desc: 'Cada letra cai e quica no lugar.' },
};

export const SHAPE_DEFAULTS = { font: 'montserrat', weight: 900, color: '#FFFFFF', stroke: '#000000', accent: '#FFE81F', size: 1 };

function charsAlong(ctx, text, R, cx, cy, startAng, dir = 1, opts = {}) {
  const chars = [...text]; const widths = chars.map(c => ctx.measureText(c).width);
  for (const pass of opts.stroke ? ['s', 'f'] : ['f']) {
    let ang = startAng;
    for (let i = 0; i < chars.length; i++) {
      const a = ang + dir * (widths[i] / 2) / R;
      ctx.save(); ctx.translate(cx + R * Math.cos(a), cy + R * Math.sin(a)); ctx.rotate(a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
      if (pass === 's') ctx.strokeText(chars[i], 0, 0); else ctx.fillText(chars[i], 0, 0);
      ctx.restore();
      ang += dir * widths[i] / R;
    }
  }
}

// el = { shape, text, x, y (0..1), size, color, accent, font, start, dur }
export function drawShape(ctx, el, t, W, H, subject) {
  const age = t - el.start; if (age < 0 || age > el.dur) return;
  const o = { ...SHAPE_DEFAULTS, ...el };
  const inA = clamp(age / 0.35, 0, 1), outA = clamp((el.dur - age) / 0.3, 0, 1);
  const k = ease.back(inA);
  const base = Math.min(W, H);
  const anchor = el.follow && subject ? subject : { x: o.x, y: o.y };
  const cx = anchor.x * W, cy = anchor.y * H;
  ctx.save(); ctx.globalAlpha = Math.min(inA * 2, 1) * outA;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const text = (o.text || '').toLocaleUpperCase('pt-BR');
  if (o.shape === 'circle' || o.shape === 'badge') {
    const R = base * 0.2 * o.size * (o.shape === 'badge' ? 0.8 : 1) * (0.6 + 0.4 * k);
    const px = R * 0.24;
    ctx.font = `${wgtFor(o.font, o.weight)} ${px}px ${fam(o.font)}`;
    // repete a frase até fechar o círculo e ajusta o espaçamento para fechar certinho
    const sep = '  •  ';
    let s = text + sep; const circ = 2 * Math.PI * R;
    let reps = Math.max(1, Math.round(circ / ctx.measureText(s).width));
    let full = s.repeat(reps);
    const wfull = ctx.measureText(full).width;
    ctx.save(); ctx.translate(cx, cy);
    if (o.shape === 'badge') {
      ctx.fillStyle = o.accent; ctx.beginPath(); ctx.arc(0, 0, R + px * 0.85, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = `900 ${R * 0.75}px ${fam('montserrat')}`; ctx.fillText(el.icon || '↓', 0, R * 0.04 + Math.sin(age * 5) * R * 0.04);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, px * 0.06); ctx.beginPath(); ctx.arc(0, 0, R - px * 0.75, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.scale(circ / wfull, circ / wfull);
    ctx.font = `${wgtFor(o.font, o.weight)} ${px}px ${fam(o.font)}`;
    ctx.fillStyle = o.shape === 'badge' ? '#111' : o.color; ctx.strokeStyle = o.stroke; ctx.lineWidth = px * 0.18;
    const rot = age * (el.speed || 0.6);
    charsAlong(ctx, full, R / (circ / wfull), 0, 0, rot - Math.PI / 2, 1, { stroke: o.shape !== 'badge' });
    ctx.restore();
  } else if (o.shape === 'arc') {
    const px = base * 0.085 * o.size;
    ctx.font = `${wgtFor(o.font, o.weight)} ${px}px ${fam(o.font)}`;
    const tw = ctx.measureText(text).width;
    const R = Math.max(tw / 2.2, base * 0.32 * o.size);
    const span = tw / R;
    ctx.fillStyle = o.color; ctx.strokeStyle = o.stroke; ctx.lineWidth = px * 0.2;
    const shown = text.slice(0, Math.ceil(text.length * clamp(age / 0.6, 0, 1)));
    charsAlong(ctx, shown, R, cx, cy + R, -Math.PI / 2 - span / 2, 1, { stroke: true });
  } else if (o.shape === 'wave') {
    const px = base * 0.09 * o.size;
    ctx.font = `${wgtFor(o.font, o.weight)} ${px}px ${fam(o.font)}`;
    const chars = [...text]; const ws = chars.map(c => ctx.measureText(c).width); const tw = ws.reduce((a, b) => a + b, 0);
    let x = cx - tw / 2;
    ctx.fillStyle = o.color; ctx.strokeStyle = o.stroke; ctx.lineWidth = px * 0.2;
    chars.forEach((c, i) => {
      const y = cy + Math.sin(age * 5 - i * 0.55) * px * 0.35;
      const cxx = x + ws[i] / 2;
      ctx.save(); ctx.translate(cxx, y); ctx.rotate(Math.cos(age * 5 - i * 0.55) * 0.12); ctx.strokeText(c, 0, 0); ctx.restore();
      ctx.save(); ctx.translate(cxx, y); ctx.rotate(Math.cos(age * 5 - i * 0.55) * 0.12); ctx.fillText(c, 0, 0); ctx.restore();
      x += ws[i];
    });
  } else if (o.shape === 'spiral') {
    const px = base * 0.05 * o.size;
    ctx.font = `${wgtFor(o.font, o.weight)} ${px}px ${fam(o.font)}`;
    ctx.fillStyle = o.color; ctx.strokeStyle = o.stroke; ctx.lineWidth = px * 0.18;
    const full = (text + ' • ').repeat(4);
    for (const pass of ['s', 'f']) {
      let ang = age * 0.8, R = base * 0.3 * o.size;
      for (const ch of full) {
        const w = ctx.measureText(ch).width;
        if (R < px * 1.4) break;
        ctx.save(); ctx.translate(cx + R * Math.cos(ang), cy + R * Math.sin(ang)); ctx.rotate(ang + Math.PI / 2);
        if (pass === 's') ctx.strokeText(ch, 0, 0); else ctx.fillText(ch, 0, 0); ctx.restore();
        ang += w / R; R -= w * 0.05;
      }
    }
  } else if (o.shape === 'ribbon') {
    const px = base * 0.06 * o.size; const bh = px * 1.6;
    ctx.translate(cx, cy); ctx.rotate(-8 * Math.PI / 180 * k);
    ctx.fillStyle = o.accent; ctx.fillRect(-W, -bh / 2, W * 2, bh);
    ctx.fillStyle = '#111'; ctx.font = `${wgtFor(o.font, o.weight)} ${px}px ${fam(o.font)}`;
    const unit = text + '   ★   '; const uw = ctx.measureText(unit).width;
    const off = -((age * px * 3) % uw);
    for (let x = -W + off; x < W; x += uw) { ctx.textAlign = 'left'; ctx.fillText(unit, x, px * 0.05); }
  } else if (o.shape === 'stack') {
    const words = text.split(/\s+/).filter(Boolean);
    const maxW = W * 0.72 * o.size;
    let y = cy - (words.length * base * 0.06) / 2;
    const fonts = [[o.font, o.weight, false], ['playfair', 700, true], [o.font, o.weight, false]];
    words.forEach((w, i) => {
      const [f, wg, it] = fonts[i % 3];
      ctx.font = `${it ? 'italic ' : ''}${wg} 100px ${fam(f)}`;
      const m = ctx.measureText(it ? w.toLowerCase() : w).width;
      const px = clamp(100 * maxW / m, base * 0.04, base * 0.22);
      const e = clamp((age - i * 0.12) / 0.3, 0, 1);
      ctx.globalAlpha = e * outA;
      ctx.font = `${it ? 'italic ' : ''}${wg} ${px}px ${fam(f)}`;
      ctx.fillStyle = i % 3 === 1 ? o.accent : o.color;
      ctx.fillText(it ? w.toLowerCase() : w, cx, y + px * 0.45 + (1 - ease.out(e)) * px * 0.4);
      y += px * 0.92;
    });
  } else if (o.shape === 'bounce') {
    const px = base * 0.1 * o.size;
    ctx.font = `${wgtFor(o.font, o.weight)} ${px}px ${fam(o.font)}`;
    const chars = [...text]; const ws = chars.map(c => ctx.measureText(c).width); const tw = ws.reduce((a, b) => a + b, 0);
    let x = cx - tw / 2;
    ctx.fillStyle = o.color; ctx.strokeStyle = o.stroke; ctx.lineWidth = px * 0.2;
    chars.forEach((c, i) => {
      const e = clamp((age - i * 0.05) / 0.4, 0, 1);
      const y = cy - (1 - ease.elastic(e)) * px * 2.5;
      ctx.globalAlpha = Math.min(1, e * 3) * outA;
      ctx.strokeText(c, x + ws[i] / 2, y); ctx.fillText(c, x + ws[i] / 2, y);
      x += ws[i];
    });
  }
  ctx.restore();
}

// Título de abertura/fechamento.
export function drawTitle(ctx, el, t, W, H) {
  const age = t - el.start; if (age < 0 || age > el.dur) return;
  const a = clamp(age / 0.5, 0, 1) * clamp((el.dur - age) / 0.4, 0, 1);
  const base = Math.min(W, H);
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (el.style === 'trailer') {
    const px = base * 0.2; const sp = 1 + 0.05 * age;
    ctx.translate(W / 2, H / 2); ctx.scale(sp, sp);
    ctx.font = `${wgtFor('bebas', 400)} ${px}px ${fam('bebas')}`; ctx.fillStyle = '#F4EFE6';
    ctx.shadowColor = 'rgba(255,200,120,.6)'; ctx.shadowBlur = px * 0.3;
    ctx.fillText(el.text.toLocaleUpperCase('pt-BR').split('').join(' '), 0, 0);
  } else {
    const px = base * 0.12;
    ctx.font = `900 ${px}px ${fam('montserrat')}`; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = px * 0.2;
    ctx.fillText(el.text, W / 2, H / 2 + (1 - ease.out(clamp(age / 0.5, 0, 1))) * px * 0.4);
  }
  ctx.restore();
}

// Camada de textos usada pelo renderizador.
export class Overlays {
  constructor(plan) {
    this.plan = plan;
    this.setCaptions(plan.captions || []);
    this.subjectAt = null;
  }
  setCaptions(words) {
    const st = this.plan.captionStyle || 'clean';
    this.groups = groupWords(markEmphasis(words), st);
  }
  draw(ctx, t, W, H) {
    const p = this.plan, fmt = p.fmt, s = fmt.safe;
    const area = { x: s.left * W, y: s.top * H, w: W * (1 - s.left - s.right), h: H * (1 - s.top - s.bottom) };
    for (const el of p.overlays || []) {
      if (el.kind === 'shape') drawShape(ctx, el, t, W, H, this.subjectAt ? this.subjectAt(t) : null);
      else if (el.kind === 'title') drawTitle(ctx, el, t, W, H);
    }
    if (p.captionsOn !== false && this.groups.length) {
      const cy = (p.captionY != null ? p.captionY : fmt.captionY) * H;
      drawCaption(ctx, this.groups, t, p.captionStyle || 'clean', area, Math.min(cy, area.y + area.h - H * 0.06), p.captionOpts || {});
    }
  }
  fontsUsed() {
    const ids = new Set([(CAPTION_STYLES[this.plan.captionStyle] || CAPTION_STYLES.clean).font, 'montserrat', 'bebas']);
    const em = (CAPTION_STYLES[this.plan.captionStyle] || {}).emph; if (em && em.font) ids.add(em.font);
    for (const el of this.plan.overlays || []) if (el.font) ids.add(el.font); else ids.add('montserrat');
    ids.add('playfair');
    return [...ids];
  }
}
