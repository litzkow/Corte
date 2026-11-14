// Corte — interface no padrão dos editores premium (prévia grande, linha do tempo com trilhas,
// barra de ferramentas que muda com a seleção e a barra "Peça para a IA").
import { loadSource, validateFile } from './engine/media.js';
import { analyzeSource, analyzeMusicSource, forget } from './engine/pipeline.js';
import { interpret, newSpec, resolveStyle, fmtN, fmtDur } from './engine/director.js';
import { buildPlan } from './engine/planner.js';
import { Renderer, visualSegments, VideoPool, MixCache } from './engine/render.js';
import { Compositor } from './engine/gl.js';
import { PRESETS, LOOKS } from './engine/styles.js';
import { PLATFORMS } from './engine/platforms.js';
import { CAPTION_STYLES, SHAPES, TEXT_STYLES, drawTextBlock, drawCaption, groupWords, markEmphasis, drawShape, ensureFonts, FONTS, googleFontsHref } from './engine/captions.js';
import { alignScript, whisperTranscribe } from './engine/transcribe.js';
import { checkPlan, checkExport, CAT_LABEL } from './engine/qc.js';
import { dropAudioCache } from './engine/audio-mix.js';
import { referenceProfile, applyReference } from './engine/reference.js';
import { suggest } from './engine/nlu.js';
import { uid, deepClone, clamp, sleep } from './engine/util.js';
import { icon } from './icons.js';
import * as store from './store.js';

export const APP_VERSION = '2.4', APP_DATE = '14/11/2026';

const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); } for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k))); return e; };
const tc = (t, dec = true) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, '0') + ':' + (dec ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0')); };
document.head.append(el('link', { rel: 'stylesheet', href: googleFontsHref() }));

// ---------------- estado ----------------
const prefs = Object.assign({ format: 'reels', voiceLang: 'pt-BR' }, store.loadPrefs());
const S = {
  project: null, sources: [], music: null, musicA: null, ref: null, refPending: false, items: new Map(),
  versions: [], cur: -1, transcript: {}, pendingStyle: null,
  renderer: null, busy: false, playing: false, sel: null, pps: 50, syncing: false, lastT: 0.5,
  comp: null, vpool: new VideoPool(), mixCache: new MixCache(), queue: [], cancel: false,
};
const curV = () => S.versions[S.cur] || null;
const curPlan = () => (curV() || {}).plan || null;
const getSrc = id => S.sources.find(s => s.id === id) || (S.music && S.music.id === id ? S.music : null) || (S.ref && S.ref.id === id ? S.ref : null);
const footage = () => S.sources.filter(s => ((s.kind === 'video' || s.kind === 'image') && s.role === 'footage') || s.role === 'voice');
const itemsNow = () => footage().map(s => S.items.get(s.id)).filter(Boolean);

function toast(msg, ms = 2800) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }

// =====================================================================
// INÍCIO
// =====================================================================
function showHome() {
  stopPlay();
  $('#editor').hidden = true; $('#home').hidden = false;
  renderStyleRail(); renderProjects();
  railAnim();
}
const RAIL = ['social', 'energetic', 'cinematic', 'action', 'documentary', 'emotional', 'travel', 'podcast', 'trailer', 'luxury', 'vlog', 'musicvideo'];
function renderStyleRail() {
  const r = $('#styleRail'); r.innerHTML = '';
  for (const id of RAIL) {
    const p = PRESETS[id];
    r.append(el('button', { class: 'style-card', onclick: () => { newProject(); S.pendingStyle = id; $('#fileIn').click(); } },
      el('canvas', { width: '272', height: '423', 'data-kind': 'style', 'data-id': id }),
      el('div', { class: 'sc-t' }, el('b', {}, p.label), el('span', {}, p.desc.split('.')[0]))));
  }
}
async function renderProjects() {
  const list = await store.listProjects();
  const g = $('#projGrid'); g.innerHTML = '';
  $('#projCount').textContent = list.length ? `${list.length} no aparelho` : '';
  if (!list.length) { g.append(el('p', { class: 'muted' }, 'Seus projetos aparecem aqui. Eles ficam só neste aparelho.')); return; }
  for (const p of list) {
    g.append(el('button', { class: 'proj', onclick: () => openProject(p.id) },
      el('div', { class: 'th', style: p.thumb ? `background-image:url(${p.thumb})` : '' }),
      el('div', { class: 'pt' }, el('b', {}, p.name), el('span', {}, `${new Date(p.updatedAt).toLocaleDateString('pt-BR')} · ${(p.versions || []).length} versões`)),
      el('span', { class: 'del', role: 'button', 'aria-label': 'Apagar projeto', html: icon('trash', 16), onclick: async e => { e.stopPropagation(); if (await confirmSheet(`Apagar "${p.name}"?`, 'Os vídeos guardados dele neste aparelho também são apagados.', 'Apagar')) { await store.deleteProject(p.id); renderProjects(); } } })));
  }
}
// prévias animadas
let railStop = null;
const SAMPLE = 'Esse é o segredo que ninguém te conta sobre isso'.split(' ').map((w, i) => ({ w, t0: i * 0.38, t1: i * 0.38 + 0.33 }));
function paintSample(c, t, kind, id, extra = {}) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  const look = kind === 'style' ? LOOKS[PRESETS[id].color.look] : null;
  const warm = look ? look.temp : 0, con = look ? look.contrast : 1, sat = look ? look.saturation : 1;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, `hsl(${215 - warm * 300},${30 * sat}%,${16 / con + 4}%)`); g.addColorStop(0.55, `hsl(${330 - warm * 200},${22 * sat}%,26%)`); g.addColorStop(1, `hsl(25,${55 * sat}%,${42 * (2 - con)}%)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(240,205,180,.85)'; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.34, W * 0.16, W * 0.21, 0, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(30,40,70,.9)'; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.8, W * 0.42, H * 0.22, 0, 0, 7); ctx.fill();
  if (look && look.vignette) { const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${look.vignette * 1.4})`); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H); }
  const area = { x: W * 0.06, y: H * 0.1, w: W * 0.88, h: H * 0.75 };
  if (kind === 'style') { const cs = PRESETS[id].captions.style; drawCaption(ctx, groupWords(markEmphasis(SAMPLE), cs), t, cs, area, H * 0.62, {}); }
  else if (kind === 'cap') drawCaption(ctx, groupWords(markEmphasis(SAMPLE), id), t, id, area, H * 0.66, {});
  else if (kind === 'block') drawTextBlock(ctx, { text: extra.text || TEXT_STYLES[id].sample, style: id, start: 0, dur: 4.6, y: TEXT_STYLES[id].render === 'loading' ? 0.3 : 0.42, beats: [0.2, 0.6, 1, 1.4, 1.8, 2.2, 2.6, 3, 3.4, 3.8] }, t, W, H, area);
  else if (kind === 'shape') drawShape(ctx, { shape: id, text: extra.text || 'SIGA PARA MAIS', x: 0.5, y: id === 'arc' ? 0.22 : 0.42, size: 1, start: 0, dur: 99, color: extra.color || '#FFFFFF', accent: '#FFE81F' }, t + 0.6, W, H, null);
}
function animCanvases(selector) {
  const cs = [...document.querySelectorAll(selector)];
  if (!cs.length) return null;
  const t0 = performance.now(); let raf;
  const loop = () => {
    const t = ((performance.now() - t0) / 1000) % 4.6;
    for (const c of cs) { if (!c.isConnected) continue; const r = c.getBoundingClientRect(); if (r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) continue; paintSample(c, t, c.dataset.kind, c.dataset.id, { text: c.dataset.text, color: c.dataset.color }); }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}
function railAnim() { if (railStop) railStop(); ensureFonts(Object.keys(FONTS)); railStop = animCanvases('#styleRail canvas'); }

// =====================================================================
// PROJETO E MÍDIA
// =====================================================================
function releaseMedia() { if (S.renderer) { S.renderer.dispose(); S.renderer = null; } S.vpool.clear(); S.mixCache.clear(); }
function newProject() {
  releaseMedia();
  if (S.renderer) S.renderer.dispose();
  Object.assign(S, { project: { id: uid('proj'), name: 'Projeto ' + new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }), createdAt: Date.now() }, sources: [], music: null, musicA: null, ref: null, refPending: false, items: new Map(), versions: [], cur: -1, transcript: {}, renderer: null, sel: null, pendingStyle: null, lastT: 0.5 });
  openEditor();
}
function openEditor() {
  if (railStop) { railStop(); railStop = null; }
  $('#home').hidden = true; $('#editor').hidden = false;
  $('#projName').value = S.project.name;
  renderAll();
}
async function thumbOf(src) {
  const c = document.createElement('canvas'); c.width = 160; c.height = 160; const x = c.getContext('2d');
  if (src.kind === 'image') { const s = Math.max(160 / src.width, 160 / src.height); x.drawImage(src.img, (160 - src.width * s) / 2, (160 - src.height * s) / 2, src.width * s, src.height * s); return c.toDataURL('image/jpeg', 0.7); }
  if (src.kind !== 'video') return null;
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = src.url;
  try {
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = j; setTimeout(r, 6000); });
    v.currentTime = Math.min(1, src.duration / 3); await new Promise(r => { v.onseeked = r; setTimeout(r, 4000); });
    const s = Math.max(160 / v.videoWidth, 160 / v.videoHeight); x.drawImage(v, (160 - v.videoWidth * s) / 2, (160 - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
    return c.toDataURL('image/jpeg', 0.7);
  } catch (e) { return null; } finally { v.removeAttribute('src'); v.load(); }
}
async function addFiles(files, { role } = {}) {
  if (!S.project) newProject();
  if ($('#editor').hidden) openEditor();
  let added = 0;
  for (const f of files) {
    const errs = validateFile(f);
    if (errs.length) { toast(errs[0], 4500); continue; }
    try {
      const src = await loadSource(f, { role });
      src.thumb = await thumbOf(src);
      if (role === 'music') { src.role = 'music'; setMusic(src); }
      else if (role === 'reference') { src.role = 'reference'; S.ref = src; S.refPending = true; toast(`"${src.name}" é a referência. Peça: "edita igual a referência".`, 4000); }
      else if (src.kind === 'audio') {
        // áudio solto: com fala vira narração; sem fala vira música
        const it = await analyzeSource(src); S.items.set(src.id, it);
        if (it.audio && it.audio.speechRatio > 0.3) { src.role = 'voice'; S.sources.push(src); toast(`"${src.name}" tem fala: virou narração. As fotos e vídeos cobrem a voz.`, 4500); }
        else { src.role = 'music'; setMusic(src); toast(`"${src.name}" virou a música.`); }
      } else { src.role = 'footage'; S.sources.push(src); }
      store.saveFile(src.id, f); added++;
    } catch (e) { toast(`Não consegui abrir "${f.name}": ${e.message}`, 5000); }
  }
  renderAll(); autosave();
  if (added && !curV()) setTimeout(() => $('#aiInput').focus(), 200);
  analyzeAll().catch(() => {});
}
function setMusic(src) { S.music = src; S.musicA = null; renderAll(); autosave(); }

let analyzing = null;
async function analyzeAll(onStage) {
  while (analyzing) { try { await analyzing; } catch (e) {} }
  analyzing = (async () => {
    for (const s of [...footage(), ...(S.ref ? [S.ref] : [])]) {
      if (S.items.has(s.id)) continue;
      S.items.set(s.id, await analyzeSource(s, ev => onStage && onStage(ev)));
    }
    if (S.music && !S.musicA) S.musicA = await analyzeMusicSource(S.music, onStage);
  })();
  try { await analyzing; } finally { analyzing = null; }
}

// =====================================================================
// EDITAR (pedido → plano → prévia)
// =====================================================================
function setBusy(on, list) {
  S.busy = on;
  $('#busy').hidden = !on;
  for (const id of ['#btnExport', '#btnSend']) $(id).disabled = on;
  if (on && list) { const ol = $('#stages'); ol.innerHTML = ''; for (const [k, l] of list) ol.append(el('li', { id: 'st_' + k }, el('span', {}, l), el('span', {}))); }
  if (!on) renderAll();
}
function stage(k, state, pct, label) { const li = document.getElementById('st_' + k); if (!li) return; li.className = state; if (label) li.firstChild.textContent = label; li.lastChild.textContent = state === 'run' && pct != null ? Math.round(pct * 100) + '%' : state === 'done' ? '✓' : ''; }

// Pedidos feitos enquanto o app trabalha não se perdem: entram numa fila. "Cancela" interrompe o trabalho atual.
const CANCEL_RE = /^\s*(cancela|cancelar|cancele|para tudo|pare|para de|stop|cancel|abort)/i;
async function runEdit(text) {
  text = (text || '').trim();
  if (S.busy) {
    if (CANCEL_RE.test(text)) { S.cancel = true; S.queue.length = 0; toast('Cancelando…'); $('#aiInput').value = ''; return; }
    if (text) { S.queue.push(text); toast(`Na fila: "${text.slice(0, 40)}". Faço assim que terminar.`, 3500); $('#aiInput').value = ''; }
    return;
  }
  if (CANCEL_RE.test(text) && text.split(/\s+/).length <= 3) { toast('Não tem nada rodando para cancelar.'); $('#aiInput').value = ''; return; }
  try { await runEditNow(text); }
  finally { if (S.queue.length && !S.busy) { const next = S.queue.shift(); setTimeout(() => runEdit(next), 60); } }
}
async function runEditNow(text) {
  if (!footage().length) { toast('Primeiro adicione vídeos, fotos ou uma narração.'); $('#fileIn').click(); return; }
  const prev = curV() ? curV().spec : null;
  const nt = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (prev && /\b(salva|salve|guarda|save)\b.{0,30}\b(estilo|style)\b/.test(nt)) {
    const name = (text.match(/["“](.+?)["”]/) || [])[1] || 'Meu estilo';
    const all = store.loadStyles().filter(x => x.name !== name); all.unshift({ name, mix: prev.mix, over: prev.over, caption: prev.captions.style, at: Date.now() }); store.saveStyles(all);
    showReply({ said: [`Estilo "${name}" salvo: ritmo, cor, transições, som e legenda.`], warn: [], ask: [] }, text); $('#aiInput').value = ''; return;
  }
  const r = text ? interpret(text, prev, { plan: curPlan(), t: S.renderer ? S.renderer.t : null }) : { spec: deepClone(prev || newSpec()), said: [], warn: [], ask: [] };
  if (r.undo) { const was = S.cur; undo(); $('#aiInput').value = ''; showReply({ said: [was > 0 ? `Voltei para a versão ${was} de ${S.versions.length}. Para ir de novo para frente, use a seta ao lado do play.` : 'Já está na primeira versão'], warn: [], ask: [] }, text); return; }
  const spec = r.spec;
  if (/\b(meu estilo|my (signature )?style|estilo assinatura|no meu jeito)\b/.test(nt)) { const st = store.loadStyles()[0]; if (st) { spec.mix = deepClone(st.mix); spec.over = { ...deepClone(st.over), ...spec.over }; if (st.caption) spec.captions.style = st.caption; r.said.unshift(`Seu estilo "${st.name}"`); } else r.warn.push('Você ainda não salvou um estilo. Depois de gostar de um resultado, diga "salva esse estilo".'); }
  if (!prev) {
    if (!r.said.some(x => x.startsWith('Formato'))) spec.outputs = [{ platform: prefs.format, duration: (spec.target && spec.target.seconds) || null }];
    if (S.pendingStyle && !r.said.some(x => x.startsWith('Estilo'))) { spec.mix = [{ id: S.pendingStyle, w: 1 }]; r.said.unshift('Estilo: ' + PRESETS[S.pendingStyle].label); }
    if (!text && !r.said.length) r.said.push('Edição automática no estilo ' + resolveStyle(spec).label);
  }
  if ((r.useRef || S.refPending) && S.ref) {
    await analyzeAll();
    const prof = referenceProfile(S.items.get(S.ref.id));
    if (prof) { applyReference(spec, prof); r.said.push(...prof.lines); }
    S.refPending = false;
  } else if (r.useRef) r.warn.push('Mande o vídeo de referência em Mídia → "Vídeo de referência" e peça de novo.');
  if (r.ask.length && !r.said.some(x => !x.startsWith('Entendi a digitação'))) { showReply(r, text); return; }
  if (spec.music.fromVideo && !S.music) r.warn.push('Para usar a música de um vídeo: Mídia → no vídeo, "Usar o som como música".');
  if (!S.music && !spec.music.none && spec.music.mood) r.warn.push('Escolha uma música em Áudio para eu cortar no ritmo dela.');
  const seed = r.reroll ? ((curV() && curV().seed) || 1) + 1 : ((curV() && curV().seed) || 1);
  const ok = await buildAndShow(spec, { label: text ? (r.said.filter(x => !x.startsWith('Entendi a digitação'))[0] || text).slice(0, 48) : 'Edição automática', request: text || '(automático)', reply: r, seed });
  showReply(r, text);
  if (ok) $('#aiInput').value = '';
  if (ok && r.exportNow) exportSheet();
}

async function buildAndShow(spec, { label, request, reply = null, seed = 1, replaceIfSame = false }) {
  const st = [];
  for (const s of [...footage(), ...(S.ref ? [S.ref] : [])]) if (!S.items.has(s.id)) st.push(['a_' + s.id, `Assistindo "${s.name}"`]);
  if (S.music && !S.musicA) st.push(['m', `Achando as batidas de "${S.music.name}"`]);
  st.push(['p', 'Montando a edição'], ['x', 'Mixando o som']);
  setBusy(true, st); S.cancel = false;
  const checkCancel = () => { if (S.cancel) { const e = new Error('cancelado'); e.cancelled = true; throw e; } };
  try {
    await analyzeAll(ev => { checkCancel(); if (ev.stage === 'music') stage('m', 'run', ev.p); else if (ev.src) stage('a_' + ev.src.id, 'run', ev.stage === 'audio' ? 0.05 : 0.05 + 0.95 * (ev.p || 0)); });
    for (const [k] of st) if (k.startsWith('a_') || k === 'm') stage(k, 'done');
    checkCancel(); stage('p', 'run'); await sleep(16);
    const music = spec.music.none ? null : S.musicA;
    const variants = makeVariants(spec, seed);
    const made = [];
    for (const v of variants) for (let oi = 0; oi < v.spec.outputs.length; oi++) {
      const plan = buildPlan({ spec: v.spec, items: itemsNow(), music, outputIndex: oi, seed: v.seed, transcript: S.transcript });
      made.push({ id: uid('v'), label: (variants.length > 1 ? v.label : label) + (v.spec.outputs.length > 1 ? ' · ' + PLATFORMS[v.spec.outputs[oi].platform].label : ''), spec: v.spec, outIdx: oi, seed: v.seed, plan, at: Date.now(), request, reply });
    }
    checkCancel(); stage('p', 'done');
    if (replaceIfSame && curV() && curV().label === label && Date.now() - curV().at < 15000 && made.length === 1) S.versions.splice(S.cur, 1, made[0]);
    else { S.versions = S.versions.slice(0, S.cur + 1); S.versions.push(...made); S.cur = S.versions.length - made.length; }
    stage('x', 'run');
    await showVersion(S.cur, false);
    stage('x', 'done');
    autosave();
    return true;
  } catch (e) { if (e.cancelled) { toast('Cancelado. A edição anterior continua igual.'); return false; } console.error(e); toast('Deu erro: ' + (e.message || e), 6000); for (const li of document.querySelectorAll('#stages li.run')) li.className = 'err'; await sleep(1500); return false; }
  finally { setBusy(false); }
}
function makeVariants(spec, seed) {
  const n = spec.versions || 1;
  if (n <= 1) return [{ spec, label: '', seed }];
  if (spec.versionsKind === 'openings') return Array.from({ length: n }, (_, i) => ({ spec: { ...deepClone(spec), versions: 1, hookSeconds: spec.hookSeconds || 3 }, label: `Abertura ${'ABCD'[i]}`, seed: seed + i * 13 }));
  const main = spec.mix[0] ? spec.mix[0].id : 'social';
  const alts = ['cinematic', 'action', 'emotional', 'social', 'documentary'].filter(x => x !== main);
  const out = [{ spec: { ...deepClone(spec), versions: 1 }, label: 'Versão A · ' + resolveStyle(spec).label.replace(/^100% /, ''), seed }];
  for (let i = 1; i < n; i++) { const s2 = deepClone(spec); s2.mix = [{ id: alts[i - 1], w: 1 }]; s2.versions = 1; out.push({ spec: s2, label: `Versão ${'ABCD'[i]} · ${PRESETS[alts[i - 1]].label}`, seed: seed + i }); }
  return out;
}
async function showVersion(i, withBusyFlag = true) {
  const run = async () => {
    S.cur = clamp(i, 0, S.versions.length - 1);
    const v = curV(); if (!v) return;
    if (!v.plan) v.plan = buildPlan({ spec: v.spec, items: itemsNow(), music: v.spec.music.none ? null : S.musicA, outputIndex: v.outIdx || 0, seed: v.seed || 1, transcript: S.transcript });
    stopPlay();
    if (S.renderer) S.renderer.dispose();
    const plan = v.plan;
    const scale = Math.min(1, 720 / Math.max(plan.fmt.w, plan.fmt.h));
    if (!S.comp) S.comp = new Compositor($('#preview'), { preserve: false });
    const rd = new Renderer({ plan, getSrc, canvas: $('#preview'), scale, compositor: S.comp, overlayCanvas: $('#overlay'), videoPool: S.vpool, mixCache: S.mixCache });
    S.renderer = rd;
    const mix = await rd.prepare();
    v.mixStats = mix.stats;
    const t = clamp(S.lastT || 0.5, 0, plan.duration - 0.05);
    await rd.frameAt(t);
    v.qc = checkPlan(plan, v.spec, mix.stats);
    S.sel = null;
    renderAll(); syncTimeline(t);
  };
  if (withBusyFlag && !S.busy) { setBusy(true, [['x', 'Preparando a prévia']]); try { await run(); } catch (e) { toast(e.message || String(e), 5000); } finally { setBusy(false); } }
  else await run();
}
function undo() { if (S.busy) return; if (S.cur > 0) showVersion(S.cur - 1).then(() => toast(`Versão ${S.cur + 1} de ${S.versions.length}`)); else toast('Nada para desfazer'); }
function redo() { if (S.busy) return; if (S.cur < S.versions.length - 1) showVersion(S.cur + 1).then(() => toast(`Versão ${S.cur + 1} de ${S.versions.length}`)); }

// mudanças diretas (controles, linha do tempo): copia a especificação, altera e reconstrói
async function changeSpec(mutator, label, { replace = false } = {}) {
  const v = curV(); if (!v || S.busy) return;
  const spec = deepClone(v.spec); spec.ops = spec.ops || []; spec.audio = spec.audio || {}; spec.over = spec.over || {};
  mutator(spec);
  await buildAndShow(spec, { label, request: label, seed: v.seed || 1, replaceIfSame: replace });
}

// =====================================================================
// RESPOSTA DA IA
// =====================================================================
function showReply(r, text) {
  const box = $('#reply'); box.innerHTML = '';
  box.append(el('button', { class: 'x', 'aria-label': 'Fechar', onclick: () => { box.hidden = true; } }, '×'));
  if (text) box.append(el('div', { class: 'muted', style: 'margin-bottom:4px' }, `"${text.slice(0, 120)}"`));
  r.said.forEach(x => box.append(el('div', { class: 'r-row ok' }, x)));
  r.warn.forEach(x => box.append(el('div', { class: 'r-row warn' }, x)));
  r.ask.forEach(x => box.append(el('div', { class: 'r-row q' }, x)));
  const sug = r.suggestions && r.suggestions.length ? r.suggestions : (r.ask.length && !r.said.length ? suggest(text || '') : []);
  if (sug.length) box.append(el('div', { class: 'sugg' }, ...sug.map(s => el('button', { class: 'chip', onclick: () => { $('#aiInput').value = s; runEdit(s); } }, s))));
  box.hidden = false;
  clearTimeout(box._h); if (!r.ask.length && !r.warn.length) box._h = setTimeout(() => { box.hidden = true; }, 8000);
}

// =====================================================================
// PRÉVIA E LINHA DO TEMPO
// =====================================================================
function renderAll() {
  if ($('#editor').hidden) return;
  const p = curPlan();
  $('#emptyState').hidden = !!p;
  $('#preview').style.visibility = p ? 'visible' : 'hidden'; $('#overlay').style.visibility = p ? 'visible' : 'hidden';
  const em = $('#emptyMedia'); em.innerHTML = '';
  for (const s of S.sources) em.append(s.thumb ? el('img', { src: s.thumb, alt: s.name }) : el('div', { class: 'add', html: icon(s.role === 'voice' ? 'voice' : 'media') }));
  if (S.music) em.append(el('div', { class: 'add', title: S.music.name, html: icon('music') }));
  em.append(el('button', { class: 'add', 'aria-label': 'Adicionar mídia', html: icon('plus'), onclick: () => $('#fileIn').click() }));
  const f = p ? p.fmt : PLATFORMS[prefs.format];
  $('#fmtLabel').textContent = `${f.aspect} · ${f.label.replace('Instagram ', '').replace('YouTube Shorts', 'Shorts')}`;
  $('#btnUndo').disabled = S.busy || S.cur <= 0; $('#btnRedo').disabled = S.busy || S.cur >= S.versions.length - 1;
  $('#btnExport').disabled = S.busy || !p;
  $('#tcTotal').textContent = tc(p ? p.duration : 0);
  renderTimeline(); renderToolbar(); positionSafe();
}
// a camada de textos fica exatamente em cima da imagem
function placeOverlay() { const c = $('#preview'), o = $('#overlay'); if (!c || !o) return; const r = c.getBoundingClientRect(), pr = $('#player').getBoundingClientRect(); Object.assign(o.style, { left: (r.left - pr.left) + 'px', top: (r.top - pr.top) + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: getComputedStyle(c).borderRadius, visibility: c.style.visibility || 'visible' }); }
function positionSafe() { const p = curPlan(), g = $('#safeGuide'), c = $('#preview'); placeOverlay(); if (!p) return; const s = p.fmt.safe; const r = c.getBoundingClientRect(), pr = $('#player').getBoundingClientRect(); g.style.left = (r.left - pr.left + s.left * r.width) + 'px'; g.style.width = r.width * (1 - s.left - s.right) + 'px'; g.style.top = (r.top - pr.top + s.top * r.height) + 'px'; g.style.height = r.height * (1 - s.top - s.bottom) + 'px'; }
function thumbForSeg(seg) {
  const it = S.items.get(seg.srcId); if (!it || !it.video) { const s = getSrc(seg.srcId); return s && s.thumb; }
  const sh = it.video.shots.find(s => seg.in >= s.start - 0.01 && seg.in < s.end) || it.video.shots[0];
  return sh ? sh.thumb : null;
}
const TRANS = { cut: 'Corte seco', dissolve: 'Dissolver', dip: 'Escurecer', flash: 'Flash', whip: 'Chicote', zoom: 'Zoom', glitch: 'Glitch' };
const TR_MARK = { dissolve: 'D', dip: 'E', flash: 'F', whip: 'C', zoom: 'Z', glitch: 'G' };
function renderTimeline() {
  const inner = $('#tlInner'), sc = $('#tlScroll'); inner.innerHTML = '';
  const p = curPlan(); if (!p) return;
  const W = sc.clientWidth || 360, pad = W / 2, pps = S.pps;
  inner.style.width = (p.duration * pps + W) + 'px';
  const X = t => pad + t * pps;
  const ruler = el('div', { class: 'tl-ruler' });
  const step = pps > 90 ? 1 : pps > 40 ? 2 : pps > 18 ? 5 : 10;
  for (let t = 0; t <= p.duration + 0.01; t += step) ruler.append(el('span', { style: `left:${X(t)}px` }, tc(t, false)));
  inner.append(ruler);
  // imagem
  const vt = el('div', { class: 'tl-track', style: 'top:20px;height:54px' });
  for (const s of visualSegments(p)) {
    const th = thumbForSeg(s);
    const c = p.clips.find(x => x.id === s.clipId);
    vt.append(el('button', { class: 'tl-clip' + (S.sel === s.clipId ? ' sel' : ''), style: `left:${X(s.start) + 1}px;width:${Math.max(4, s.dur * pps - 2)}px;${th ? `background-image:url(${th})` : ''}`, 'aria-label': `Corte de ${tc(s.start)} a ${tc(s.start + s.dur)}`, onclick: e => { e.stopPropagation(); S.sel = S.sel === s.clipId ? null : s.clipId; renderTimeline(); renderToolbar(); seekTo(s.start + 0.05, true); } },
      c && c.speed !== 1 ? el('span', { class: 'sp' }, c.speed === 'ramp' ? 'rampa' : c.speed === 'freeze' ? 'parado' : c.speed + 'x') : null));
    if (s.trans && s.trans.type !== 'cut') vt.append(el('span', { class: 'tl-trans', style: `left:${X(s.start)}px`, title: TRANS[s.trans.type] }, el('i', {}, TR_MARK[s.trans.type] || '•')));
  }
  inner.append(vt);
  // texto
  const tt = el('div', { class: 'tl-track', style: 'top:80px;height:20px' });
  if (p.captions.length && p.captionsOn) for (const g of groupWords(p.captions, p.captionStyle)) tt.append(el('div', { class: 'tl-cap', style: `left:${X(g.t0)}px;width:${Math.max(6, (g.hold - g.t0) * pps - 1)}px` }, g.words.map(w => w.w).join(' ')));
  for (const o of p.overlays || []) tt.append(el('div', { class: 'tl-ov', style: `left:${X(o.start)}px;width:${Math.max(8, o.dur * pps)}px;${o.kind === 'progress' ? 'top:13px;height:6px;padding:0' : ''}` }, o.kind === 'progress' ? '' : (o.text || o.kind)));
  inner.append(tt);
  // som
  const at = el('div', { class: 'tl-track', style: 'top:106px;height:26px' });
  for (const tr of p.audio.tracks) if (tr.gainDb > -10) at.append(el('div', { class: 'tl-voice', style: `left:${X(tr.start)}px;width:${Math.max(2, (tr.out - tr.in) * pps)}px;top:15px;height:10px` }));
  if (p.audio.music) at.append(el('div', { class: 'tl-mus', style: `left:${X(p.audio.music.start || 0)}px;width:${(p.audio.music.dur || p.duration) * pps}px;height:13px` }, (S.music ? S.music.name : 'Música') + (p.audio.music.bpm ? ` · ${fmtN(p.audio.music.bpm)} BPM` : '')));
  for (const f of p.audio.sfx) at.append(el('span', { class: 'tl-sfx', style: `left:${X(f.t)}px`, title: f.kind }));
  inner.append(at);
  syncTimeline(S.renderer ? (S.renderer.t || 0) : 0);
}
function syncTimeline(t) {
  const sc = $('#tlScroll'); S.syncing = true; sc.scrollLeft = t * S.pps; $('#tc').textContent = tc(t); S.lastT = t;
  clearTimeout(S._syncH); S._syncH = setTimeout(() => { S.syncing = false; }, 60);
}
let seekTimer = null;
function seekTo(t, moveTimeline = false) {
  if (!S.renderer) return;
  if (S.playing) stopPlay();
  t = clamp(t, 0, S.renderer.plan.duration - 0.02);
  S.renderer.t = t; S.lastT = t; $('#tc').textContent = tc(t);
  if (moveTimeline) syncTimeline(t);
  clearTimeout(seekTimer); seekTimer = setTimeout(() => S.renderer && S.renderer.frameAt(t), 40);
}
async function togglePlay() {
  const rd = S.renderer; if (!rd || S.busy) return;
  if (S.playing) { stopPlay(); return; }
  S.playing = true; $('#btnPlay').innerHTML = icon('pause', 22);
  let from = rd.t || 0; if (from >= rd.plan.duration - 0.1) from = 0;
  await rd.play(from, { onTime: t => syncTimeline(t), onEnd: () => stopPlay() });
}
function stopPlay() { if (S.renderer) S.renderer.stop(); S.playing = false; $('#btnPlay').innerHTML = icon('play', 22); }

// =====================================================================
// BARRA DE FERRAMENTAS
// =====================================================================
function tool(ic, label, fn, cls = '') { return el('button', { class: 'tool ' + cls, onclick: fn, html: icon(ic) + `<span>${label}</span>` }); }
function renderToolbar() {
  const tb = $('#toolbar'); tb.innerHTML = '';
  const p = curPlan();
  if (S.sel && p) {
    const c = p.clips.find(x => x.id === S.sel);
    if (!c) { S.sel = null; return renderToolbar(); }
    tb.append(
      tool('back', 'Voltar', () => { S.sel = null; renderTimeline(); renderToolbar(); }),
      tool('split', 'Dividir', () => clipOp('split')),
      tool('speed', 'Velocidade', () => speedSheet(c)),
      tool('trans', 'Transição', () => transSheet(c)),
      tool('freeze', 'Congelar', () => clipOp('freeze')),
      tool('trim', 'Duração', () => trimSheet(c)),
      tool('trash', 'Excluir', () => clipOp('delete'), 'danger'));
    return;
  }
  tb.append(
    tool('spark', 'IA', aiSheet, 'accent'), tool('media', 'Mídia', mediaSheet), tool('style', 'Estilo', styleSheet),
    tool('captions', 'Legendas', captionsSheet), tool('text', 'Texto', textSheet), tool('audio', 'Áudio', audioSheet),
    tool('color', 'Cor', colorSheet), tool('format', 'Formato', formatSheet), tool('versions', 'Versões', versionsSheet), tool('quality', 'Qualidade', qualitySheet));
}
async function clipOp(kind) {
  const p = curPlan(); if (!p) return;
  const c = p.clips.find(x => x.id === S.sel); if (!c) return;
  const t = S.renderer ? S.renderer.t : c.start;
  const inside = t > c.start + 0.05 && t < c.start + c.dur - 0.05;
  const sp = typeof c.speed === 'number' ? c.speed : 0.7;
  const at = c.in + ((inside ? t : c.start + c.dur / 2) - c.start) * sp;
  if (kind === 'split') { await changeSpec(s => s.ops.push({ op: 'split', srcId: c.srcId, at }), 'Dividir corte'); if (!inside) toast('Dividi no meio do corte. Para escolher o ponto, arraste a linha do tempo antes de tocar em Dividir.', 4500); }
  if (kind === 'freeze') await changeSpec(s => s.ops.push({ op: 'freeze', srcId: c.srcId, at, dur: 1.5 }), 'Congelar imagem');
  if (kind === 'delete') { if (await confirmSheet('Excluir este corte?', 'Dá para desfazer depois.', 'Excluir')) await changeSpec(s => s.ops.push({ op: 'deleteClip', srcId: c.srcId, in: c.in }), 'Corte excluído'); }
}

// =====================================================================
// FOLHAS
// =====================================================================
let sheetStop = null;
function openSheet(title, sub, ...content) {
  if (sheetStop) { sheetStop(); sheetStop = null; }
  const c = $('#sheetContent'); c.innerHTML = '';
  c.append(el('h3', { id: 'sheetTitle' }, title)); if (sub) c.append(el('p', { class: 'sub' }, sub));
  for (const x of content.flat()) if (x) c.append(x);
  $('#sheet').hidden = false;
  ensureFonts(Object.keys(FONTS));
  sheetStop = animCanvases('#sheetContent canvas[data-kind]');
}
function closeSheet() { if (sheetStop) { sheetStop(); sheetStop = null; } $('#sheet').hidden = true; }
function confirmSheet(title, sub, okLabel) {
  return new Promise(res => openSheet(title, sub, el('div', { style: 'display:flex;gap:8px;margin-top:10px' }, el('button', { class: 'btn ghost wide', onclick: () => { closeSheet(); res(false); } }, 'Cancelar'), el('button', { class: 'btn primary wide', onclick: () => { closeSheet(); res(true); } }, okLabel))));
}
const label = t => el('div', { class: 'label' }, t);
function slider(name, min, max, step, val, fmt, oninput, onchange) {
  const out = el('output', {}, fmt(val));
  const inp = el('input', { type: 'range', min, max, step, value: String(val), 'aria-label': name });
  inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); oninput && oninput(+inp.value); });
  inp.addEventListener('change', () => onchange && onchange(+inp.value));
  return el('div', { class: 'slider' }, el('span', {}, name), inp, out);
}
function switchRow(text, checked, onchange) { const i = el('input', { type: 'checkbox' }); i.checked = !!checked; i.addEventListener('change', () => onchange(i.checked)); return el('label', { class: 'switch' }, el('span', {}, text), i); }
const galBtn = (kind, id, title, desc, on, fn) => el('button', { class: on ? 'on' : '', 'data-id': id, onclick: fn }, el('canvas', { width: '280', height: '373', 'data-kind': kind, 'data-id': id }), el('div', { class: 'gl' }, el('b', {}, title), el('span', {}, desc)));

// IA
function aiSheet() {
  const log = el('div', { class: 'log' });
  const reqs = S.versions.filter(v => v.reply);
  if (!reqs.length) log.append(el('div', { class: 'bubble ai' }, 'Me diga o que você quer, do seu jeito. Ex.: "Reels de 30 segundos, cortes rápidos, música épica, legenda palavra por palavra e manchete “O segredo do império”".'));
  for (const v of reqs.slice(-8)) {
    log.append(el('div', { class: 'bubble me' }, v.request));
    log.append(el('div', { class: 'bubble ai' }, ...v.reply.said.map(x => el('div', {}, '✓ ' + x)), ...v.reply.warn.map(x => el('div', { style: 'color:#F6CF85' }, '! ' + x)), ...(v.plan ? v.plan.decisions.slice(0, 4).map(x => el('div', { class: 'muted' }, x)) : [])));
  }
  const ta = el('textarea', { placeholder: 'Escreva o pedido…', rows: '3', 'aria-label': 'Pedido' });
  const mic = el('button', { class: 'ai-mic', 'aria-label': 'Falar', html: '<span class="ring"></span>' + icon('mic', 20) });
  setupMic(mic, ta, false);
  const go = el('button', { class: 'btn primary', onclick: () => { const t = ta.value.trim(); closeSheet(); runEdit(t); } }, curV() ? 'Ajustar' : 'Editar com IA');
  const cards = el('div', { class: 'gal' }, ...Object.entries(PRESETS).map(([id, p]) => galBtn('style', id, p.label, p.desc, curV() && curV().spec.mix.length === 1 && curV().spec.mix[0].id === id, () => pickStyle(id))));
  openSheet('Editar com IA', 'Fale ou escreva. Ela entende português e inglês, com gíria e erro de digitação.', log,
    el('div', { class: 'field' }, ta), el('div', { style: 'display:flex;gap:10px;align-items:center' }, mic, el('div', { style: 'flex:1' }), go),
    label('Ou escolha um estilo'), cards);
}
function pickStyle(id) {
  closeSheet();
  if (!curV()) { S.pendingStyle = id; runEdit(''); }
  else changeSpec(s => { s.mix = [{ id, w: 1 }]; for (const k of ['pacing', 'color', 'transitions', 'effects']) delete s.over[k]; }, 'Estilo: ' + PRESETS[id].label);
}
// Mídia
function mediaSheet() {
  const ul = el('ul', { class: 'list' });
  const roleTxt = s => s.role === 'voice' ? 'Narração (as imagens cobrem a voz)' : s.kind === 'image' ? 'Foto (ganha movimento lento)' : `${tc(s.duration, false)} · ${s.width}×${s.height}`;
  for (const s of S.sources) ul.append(el('li', {}, s.thumb ? el('img', { src: s.thumb, alt: '' }) : el('div', { class: 'ph', html: icon('voice') }), el('div', { class: 'grow' }, el('b', {}, s.name), el('span', {}, roleTxt(s) + (S.music === s ? ' · é a música' : ''))),
    s.kind === 'video' && S.music !== s ? el('button', { class: 'btn sm', onclick: () => { setMusic(s); closeSheet(); toast(`O som de "${s.name}" virou a música.`); if (curV()) changeSpec(x => { x.music.none = false; }, 'Música do vídeo'); } }, 'Usar o som como música') : null,
    el('button', { class: 'icon-btn', 'aria-label': 'Remover ' + s.name, html: icon('trash', 18), onclick: () => { S.sources = S.sources.filter(x => x !== s); forget(s.id); dropAudioCache(s.id); S.items.delete(s.id); if (S.music === s) S.music = null; mediaSheet(); renderAll(); autosave(); } })));
  openSheet('Mídia', 'Vídeos, fotos e narração. Ficam só no seu aparelho.', ul,
    el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px' },
      el('button', { class: 'btn primary', onclick: () => { closeSheet(); $('#fileIn').click(); }, html: icon('plus', 18) + ' Adicionar' }),
      el('button', { class: 'btn', onclick: () => { closeSheet(); $('#musicIn').click(); }, html: icon('music', 18) + ' Música' }),
      el('button', { class: 'btn', onclick: () => { closeSheet(); $('#refIn').click(); }, html: icon('ref', 18) + ' Vídeo de referência' })),
    S.ref ? el('p', { class: 'muted', style: 'margin-top:10px' }, `Referência: "${S.ref.name}". Peça "edita igual a referência".`) : null,
    el('p', { class: 'muted', style: 'margin-top:12px' }, 'Áudio com fala vira narração sozinho: as fotos e vídeos cobrem a voz, no ritmo do estilo.'));
}
// Estilo
function styleSheet() {
  const v = curV(); const curId = v && v.spec.mix.length === 1 ? v.spec.mix[0].id : null;
  const saved = store.loadStyles();
  openSheet('Estilos', 'Cada estilo muda o ritmo, a cor, as transições, o som e a legenda juntos.',
    saved.length ? [label('Meus estilos'), el('div', { class: 'chips' }, ...saved.map(st => el('button', { class: 'chip', onclick: () => { closeSheet(); if (curV()) changeSpec(s => { s.mix = deepClone(st.mix); s.over = { ...deepClone(st.over) }; if (st.caption) s.captions.style = st.caption; }, 'Meu estilo: ' + st.name); } }, st.name)))] : null,
    label('Estilos'), el('div', { class: 'gal' }, ...Object.entries(PRESETS).map(([id, p]) => galBtn('style', id, p.label, p.desc, id === curId, () => pickStyle(id)))));
}
// Legendas
function speechSources(p) { return [...new Set(p.clips.filter(c => c.kind === 'dialogue' || c.kind === 'hook').map(c => c.srcId))].filter(id => { const it = S.items.get(id); return it && it.audio && it.audio.speechRatio > 0.15; }); }
function captionsSheet() {
  const p = curPlan(); if (!p) return toast('Primeiro faça uma edição.');
  const sp = speechSources(p), missing = sp.filter(id => !S.transcript[id]);
  const parts = [];
  if (!sp.length) parts.push(el('p', { class: 'muted' }, 'Não achei fala neste vídeo. Use Texto para manchete ou texto com forma.'));
  if (missing.length) {
    const lang = el('select', { 'aria-label': 'Idioma da fala' }, el('option', { value: 'portuguese' }, 'Português'), el('option', { value: 'english' }, 'Inglês'), el('option', { value: '' }, 'Detectar'));
    const ta = el('textarea', { placeholder: 'Ou cole aqui o roteiro / o que foi falado', 'aria-label': 'Roteiro' });
    parts.push(label('Texto da fala'), el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, el('button', { class: 'btn primary', onclick: () => { closeSheet(); doWhisper(missing, lang.value); } }, 'Transcrever no aparelho'), lang),
      el('p', { class: 'muted' }, 'Na primeira vez baixa uns 75 MB e guarda. Grátis, sem enviar seu vídeo.'),
      el('div', { class: 'field' }, ta), el('button', { class: 'btn', onclick: async () => { if (!ta.value.trim()) return toast('Cole o texto primeiro.'); for (const id of missing) S.transcript[id] = { words: alignScript(ta.value, S.items.get(id).audio.speech), from: 'roteiro' }; closeSheet(); await changeSpec(() => {}, 'Legenda pelo roteiro'); } }, 'Sincronizar roteiro'));
  }
  const o = p.captionOpts || {};
  const g = el('div', { class: 'gal' });
  for (const [id, c] of Object.entries(CAPTION_STYLES)) g.append(galBtn('cap', id, c.label, c.desc, p.captionStyle === id, e => { quickCaption({ style: id }); [...g.children].forEach(b => b.classList.toggle('on', b.dataset.id === id)); }));
  const sw = el('div', { class: 'swatches' }, ...[null, '#FFE81F', '#3DFF6E', '#FF3B3B', '#4DD9FF', '#FF2BD6', '#FF8A1F'].map(col => el('button', { class: (o.color || null) === col ? 'on' : '', style: `background:${col || 'conic-gradient(#fff,#888,#fff)'}`, 'aria-label': col ? 'Cor ' + col : 'Cor do estilo', onclick: e => { quickCaption({ color: col }); [...sw.children].forEach(b => b.classList.toggle('on', b === e.currentTarget)); } })));
  const fonts = el('div', { class: 'chips scroll' }, ...[null, 'montserrat', 'anton', 'bebas', 'bangers', 'luckiest', 'archivo', 'poppins', 'playfair', 'caveat', 'marker', 'oswald'].map(f => el('button', { class: 'chip' + ((o.font || null) === f ? ' on' : ''), style: f ? `font-family:"${FONTS[f].family}"` : '', onclick: e => { quickCaption({ font: f }); [...fonts.children].forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, f ? FONTS[f].family : 'Do estilo')));
  openSheet('Legendas', 'Estilos que viralizam. Toque para trocar na hora.', ...parts,
    switchRow('Legenda ligada', p.captionsOn, v => quickCaption({ on: v })),
    switchRow('Destacar palavras fortes', o.highlight !== false, v => quickCaption({ highlight: v })),
    switchRow('CAIXA ALTA', !!o.uppercase, v => quickCaption({ uppercase: v })),
    slider('Altura', 0.2, 0.88, 0.01, p.captionY != null ? p.captionY : p.fmt.captionY, v => Math.round(v * 100) + '%', v => quickCaption({ y: v })),
    slider('Tamanho', 0.6, 1.8, 0.05, o.scale || 1, v => Math.round(v * 100) + '%', v => quickCaption({ scale: v })),
    label('Cor de destaque'), sw, label('Fonte'), fonts, label('Estilo'), g,
    p.captions.length ? [label('Corrigir palavras'), ...groupWords(p.captions, p.captionStyle).slice(0, 150).map(gr => el('div', { class: 'cap-words' }, el('span', { class: 't' }, tc(gr.t0)), ...gr.words.map(w => { const i = el('input', { value: w.w, size: String(Math.max(2, w.w.length)) }); i.addEventListener('change', () => fixWord(w, i.value)); return i; })))] : null);
}
function quickCaption(ch) {
  const v = curV(); if (!v) return;
  const p = v.plan; p.captionOpts = p.captionOpts || {}; v.spec.over = v.spec.over || {};
  if (ch.style) { p.captionStyle = ch.style; v.spec.captions.style = ch.style; }
  if (ch.on != null) { p.captionsOn = ch.on; v.spec.captions.enabled = ch.on; }
  if (ch.y != null) { p.captionY = ch.y; v.spec.over.captionY = ch.y; }
  if (ch.scale != null) { p.captionOpts.scale = ch.scale; v.spec.over.captionScale = ch.scale; }
  if (ch.highlight != null) { p.captionOpts.highlight = ch.highlight; v.spec.captions.highlight = ch.highlight; }
  if (ch.uppercase != null) { p.captionOpts.uppercase = ch.uppercase; v.spec.captions.uppercase = ch.uppercase; }
  if ('color' in ch) { p.captionOpts.color = ch.color; v.spec.over.captionColor = ch.color; }
  if ('font' in ch) { p.captionOpts.font = ch.font; v.spec.over.captionFont = ch.font; }
  if (S.renderer) { S.renderer.overlays.setCaptions(p.captions); ensureFonts(S.renderer.overlays.fontsUsed()).then(() => S.renderer && S.renderer.frameAt(S.renderer.t || 0)); }
  renderTimeline(); autosave();
}
function fixWord(w, txt) {
  for (const [id, tr] of Object.entries(S.transcript)) {
    const c = curPlan().clips.find(c => c.srcId === id && w.t0 >= c.start - 0.01 && w.t0 < c.start + c.dur); if (!c) continue;
    const st = c.in + (w.t0 - c.start);
    const sw = tr.words.reduce((b, x) => Math.abs(x.t0 - st) < Math.abs(b.t0 - st) ? x : b, tr.words[0]);
    if (sw && Math.abs(sw.t0 - st) < 0.3) { sw.w = txt; w.w = txt; }
  }
  if (S.renderer) { S.renderer.overlays.setCaptions(curPlan().captions); S.renderer.frameAt(S.renderer.t || 0); }
  autosave();
}
async function doWhisper(ids, lang) {
  setBusy(true, ids.map(id => ['tr_' + id, `Transcrevendo "${getSrc(id).name}"`]));
  try {
    for (const id of ids) {
      stage('tr_' + id, 'run', 0);
      const res = await whisperTranscribe(getSrc(id), { language: lang || null, onProgress: e => stage('tr_' + id, 'run', e.p, e.label) });
      S.transcript[id] = { words: res.words, from: 'whisper' }; stage('tr_' + id, 'done', null, `${res.words.length} palavras`);
    }
  } catch (e) { setBusy(false); toast('A transcrição no aparelho falhou: ' + (e.message || e) + '. Use "Colar roteiro".', 7000); return; }
  setBusy(false);
  await changeSpec(() => {}, 'Legenda transcrita');
}
// Texto
function textSheet() {
  const v = curV(); if (!v) return toast('Primeiro faça uma edição.');
  const sp = v.spec;
  let shape = 'circle', color = '#FFFFFF';
  const txt = el('input', { type: 'text', value: 'SIGA PARA MAIS', maxlength: '60', 'aria-label': 'Frase do texto com forma' });
  const follow = switchRow('Seguir a pessoa (em volta do rosto)', false, () => {});
  const g = el('div', { class: 'gal' });
  const upd = () => { [...g.children].forEach(b => b.classList.toggle('on', b.dataset.id === shape)); g.querySelectorAll('canvas').forEach(c => { c.dataset.text = txt.value || ' '; c.dataset.color = color; }); };
  for (const [id, s] of Object.entries(SHAPES)) g.append(galBtn('shape', id, s.label, s.desc, false, () => { shape = id; upd(); }));
  txt.addEventListener('input', upd);
  const sw = el('div', { class: 'swatches' }, ...['#FFFFFF', '#FFE81F', '#111111', '#FF2BD6', '#3DFF6E', '#4DD9FF'].map(c => el('button', { style: `background:${c}`, 'aria-label': 'Cor ' + c, onclick: e => { color = c; [...sw.children].forEach(b => b.classList.toggle('on', b === e.currentTarget)); upd(); } })));
  const head = el('input', { type: 'text', value: (sp.headline && sp.headline.text) || '', placeholder: 'Ex.: 3 erros que todo mundo comete', 'aria-label': 'Manchete' });
  // texto na tela: frase em bloco nos estilos em alta
  let bstyle = 'serifa', ball = true;
  const btxt = el('textarea', { rows: '2', maxlength: '200', placeholder: 'Ex.: Dane-se o projeto verão. Agora a meta é ficar forte. Em conversa de mensagem, separe as falas com |', 'aria-label': 'Frase do texto na tela' });
  const bg = el('div', { class: 'gal' });
  const bupd = () => { [...bg.children].forEach(b => b.classList.toggle('on', b.dataset.id === bstyle)); bg.querySelectorAll('canvas').forEach(c => { if (btxt.value.trim()) c.dataset.text = btxt.value.trim(); else delete c.dataset.text; }); };
  for (const [id, st] of Object.entries(TEXT_STYLES)) bg.append(galBtn('block', id, st.label, st.desc, false, () => { bstyle = id; bupd(); }));
  btxt.addEventListener('input', bupd);
  const bwhen = el('div', { class: 'chips' }, ...[['O vídeo todo', true], ['Primeiros segundos', false]].map(([l, v], i) => el('button', { class: 'chip' + (i === 0 ? ' on' : ''), onclick: e => { ball = v; [...bwhen.children].forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, l)));
  openSheet('Texto', 'Frase na tela nos estilos em alta, manchete, textos com forma e barra de progresso.',
    label('Texto na tela'), el('div', { class: 'field' }, btxt), bg, bwhen,
    el('button', { class: 'btn primary wide', style: 'margin-top:12px', onclick: () => { const tx = btxt.value.trim(); if (!tx) return toast('Escreva a frase primeiro.'); closeSheet(); changeSpec(s => { s.texts = [...(s.texts || []), { shape: 'block', style: bstyle, text: tx, all: ball }]; }, 'Texto: ' + TEXT_STYLES[bstyle].label); } }, 'Colocar no vídeo'),
    label('Manchete no topo'), el('div', { class: 'field' }, head),
    el('div', { style: 'display:flex;gap:8px' }, el('button', { class: 'btn primary', onclick: () => { closeSheet(); changeSpec(s => { s.headline = head.value.trim() ? { text: head.value.trim(), all: false, style: 'box' } : null; }, head.value.trim() ? 'Manchete' : 'Sem manchete'); } }, 'Primeiros segundos'),
      el('button', { class: 'btn', onclick: () => { closeSheet(); changeSpec(s => { s.headline = head.value.trim() ? { text: head.value.trim(), all: true, style: 'box' } : null; }, 'Manchete o vídeo todo'); } }, 'O vídeo todo')),
    switchRow('Barra de progresso', resolveStyle(sp).progressBar, on => { closeSheet(); changeSpec(s => { s.over.progressBar = on; }, on ? 'Barra de progresso' : 'Sem barra'); }),
    label('Texto com forma'), el('div', { class: 'field' }, txt), sw, follow, g,
    el('button', { class: 'btn primary wide', style: 'margin-top:12px', onclick: () => { const item = { shape, text: (txt.value || 'SIGA PARA MAIS').trim(), follow: follow.querySelector('input').checked, color }; closeSheet(); changeSpec(s => { s.texts = [...(s.texts || []), item]; }, 'Texto: ' + SHAPES[shape].label); } }, 'Adicionar texto com forma'),
    (sp.texts || []).length ? [label('Textos no vídeo (toque para tirar)'), el('div', { class: 'chips' }, ...sp.texts.map((t, i) => el('button', { class: 'chip on', onclick: () => { closeSheet(); changeSpec(s => { s.texts.splice(i, 1); }, 'Texto removido'); } }, `${t.shape === 'block' ? (TEXT_STYLES[t.style] || TEXT_STYLES.contorno).label : SHAPES[t.shape].label}: ${t.text.slice(0, 40)} ×`)))] : null);
  upd(); bupd();
}
// Áudio
function audioSheet() {
  const v = curV(); if (!v) return toast('Primeiro faça uma edição.');
  const a = v.spec.audio || {}, E = resolveStyle(v.spec), m = S.music;
  const commit = (fn, lbl) => { closeSheet(); changeSpec(fn, lbl, { replace: true }); };
  openSheet('Áudio', 'Volumes, música e efeitos. Tudo sai mixado no volume das redes (-14 LUFS).',
    label('Música'),
    el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, el('span', { class: 'muted', style: 'flex:1' }, m ? `${m.name}${S.musicA ? ` · ${fmtN(S.musicA.bpm)} BPM` : ''}` : 'Nenhuma'), el('button', { class: 'btn sm', onclick: () => { closeSheet(); $('#musicIn').click(); } }, m ? 'Trocar' : 'Escolher'), m ? el('button', { class: 'btn sm ghost', onclick: () => { closeSheet(); S.music = null; S.musicA = null; changeSpec(s => { s.music.none = true; }, 'Sem música'); } }, 'Tirar') : null),
    m ? slider('Começa em', -1, Math.max(1, Math.floor(m.duration - 3)), 1, v.spec.music.start != null ? v.spec.music.start : -1, x => x < 0 ? 'auto' : tc(x, false), null, x => commit(s => { s.music.start = x < 0 ? null : x; }, 'Trecho da música')) : null,
    m ? el('p', { class: 'muted' }, 'Música de artista conhecido pode ser silenciada ou reivindicada pelas redes quando você postar.') : null,
    label('Volumes'),
    slider('Voz / som', -20, 12, 1, a.originalDb || 0, x => (x > 0 ? '+' : '') + x + ' dB', null, x => commit(s => { s.audio.originalDb = x; }, 'Volume da voz')),
    slider('Música', -24, 12, 1, a.musicDb || 0, x => (x > 0 ? '+' : '') + x + ' dB', null, x => commit(s => { s.audio.musicDb = x; }, 'Volume da música')),
    slider('Efeitos', -20, 10, 1, a.sfxDb || 0, x => (x > 0 ? '+' : '') + x + ' dB', null, x => commit(s => { s.audio.sfxDb = x; }, 'Volume dos efeitos')),
    slider('Qtd. efeitos', 0, 1, 0.05, E.sfx.density, x => Math.round(x * 100) + '%', null, x => commit(s => { s.over.sfx = { ...(s.over.sfx || {}), density: x }; }, 'Quantidade de efeitos')),
    switchRow('Tirar o som original dos vídeos', !!a.muteOriginal, on => commit(s => { s.audio.muteOriginal = on; }, on ? 'Sem som original' : 'Com som original')),
    switchRow('Cortar no ritmo da música', !!E.pacing.beatSync, on => commit(s => { s.over.pacing = { ...(s.over.pacing || {}), beatSync: on }; }, 'Ritmo da música')),
    switchRow('Zoom pulsando na batida', (E.beatPulse || 0) > 0, on => commit(s => { s.over.beatPulse = on ? 0.7 : 0; }, 'Pulso na batida')),
    switchRow('Tirar silêncios', !!E.silence.remove, on => commit(s => { s.over.silence = { ...(s.over.silence || {}), remove: on }; }, 'Silêncios')),
    switchRow('Tirar "ahn" e repetições (precisa de legenda)', !!E.fillers, on => commit(s => { s.over.fillers = on; }, 'Muletas')));
}
// Cor
function colorSheet() {
  const v = curV(); if (!v) return toast('Primeiro faça uma edição.');
  const E = resolveStyle(v.spec), adj = { exposure: 0, contrast: 1, saturation: 1, temp: 0, ...(E.adjust || {}) };
  const redraw = () => { if (S.renderer) S.renderer.frameAt(S.renderer.t || 0); };
  const live = () => { v.plan.adjust = { ...adj }; redraw(); };
  const commit = () => { v.spec.over.adjust = { ...adj }; autosave(); };
  const looks = el('div', { class: 'chips' }, ...Object.entries(LOOKS).map(([id, l]) => el('button', { class: 'chip' + (E.color.look === id ? ' on' : ''), onclick: e => { v.plan.look = { ...v.plan.look, id }; v.spec.over.color = { ...(v.spec.over.color || {}), look: id }; [...looks.children].forEach(b => b.classList.toggle('on', b === e.currentTarget)); redraw(); autosave(); } }, l.label)));
  openSheet('Cor e imagem', 'O efeito aparece na hora na prévia.',
    label('Look'), looks, label('Ajuste fino'),
    slider('Luz', -0.8, 0.8, 0.02, adj.exposure, x => (x > 0 ? '+' : '') + x.toFixed(2), x => { adj.exposure = x; live(); }, commit),
    slider('Contraste', 0.6, 1.6, 0.02, adj.contrast, x => Math.round(x * 100) + '%', x => { adj.contrast = x; live(); }, commit),
    slider('Saturação', 0, 2, 0.02, adj.saturation, x => Math.round(x * 100) + '%', x => { adj.saturation = x; live(); }, commit),
    slider('Temperatura', -0.3, 0.3, 0.01, adj.temp, x => (x > 0 ? 'quente ' : x < 0 ? 'fria ' : '') + Math.round(Math.abs(x) * 100), x => { adj.temp = x; live(); }, commit),
    slider('Vinheta', 0, 0.7, 0.02, adj.vignette != null ? adj.vignette : (LOOKS[E.color.look] || {}).vignette || 0, x => Math.round(x * 100) + '%', x => { adj.vignette = x; live(); }, commit),
    slider('Granulado', 0, 0.3, 0.01, adj.grain != null ? adj.grain : (LOOKS[E.color.look] || {}).grain || 0, x => Math.round(x * 100) + '%', x => { adj.grain = x; live(); }, commit),
    label('Enquadramento'),
    switchRow('Mostrar o vídeo inteiro (fundo desfocado)', !!E.fit, on => { closeSheet(); changeSpec(s => { s.over.fit = on; }, on ? 'Vídeo inteiro' : 'Preencher a tela'); }),
    switchRow('Espelhar', !!E.mirror, on => { v.plan.mirror = on; v.spec.over.mirror = on; redraw(); autosave(); }),
    switchRow('Faixas pretas de cinema (horizontal)', !!E.effects.letterbox, on => { v.plan.letterbox = on; v.spec.over.effects = { ...(v.spec.over.effects || {}), letterbox: on }; redraw(); autosave(); }),
    el('button', { class: 'btn ghost wide', style: 'margin-top:10px', onclick: () => { Object.assign(adj, { exposure: 0, contrast: 1, saturation: 1, temp: 0 }); delete adj.vignette; delete adj.grain; live(); commit(); colorSheet(); } }, 'Zerar ajustes'));
}
// Formato
function formatSheet() {
  const v = curV(); const cur = v ? v.plan.fmt.platform : prefs.format;
  const g = el('ul', { class: 'list' });
  for (const id of ['tiktok', 'reels', 'shorts', 'youtube', 'feed', 'square', 'facebook', 'presentation']) {
    const p = PLATFORMS[id];
    g.append(el('li', { class: id === cur ? 'cur' : '', style: 'cursor:pointer', onclick: () => { prefs.format = id; store.savePrefs(prefs); closeSheet(); if (v) changeSpec(s => { s.outputs = [{ platform: id, duration: (s.outputs[0] && s.outputs[0].duration) || (s.target && s.target.seconds) || null }]; }, 'Formato: ' + p.label); else renderAll(); } },
      el('div', { class: 'ph', style: 'display:grid;place-items:center;background:var(--s3)', html: `<div style="width:${p.w > p.h ? 34 : 34 * p.w / p.h}px;height:${p.h > p.w ? 34 : 34 * p.h / p.w}px;border:2px solid var(--ink2);border-radius:4px"></div>` }),
      el('div', { class: 'grow' }, el('b', {}, p.label), el('span', {}, `${p.aspect} · ${p.w}×${p.h} · até ${fmtDur(p.maxDur)}`))));
  }
  const ex = v ? v.spec.export : { resolution: '1080p', fps: 30 };
  openSheet('Formato', 'Cada rede tem sua área segura: a legenda nunca fica embaixo dos botões do app.', g,
    label('Qualidade da exportação'),
    el('div', { class: 'chips' }, ...['720p', '1080p', '4k'].map(r => el('button', { class: 'chip' + (ex.resolution === r ? ' on' : ''), onclick: () => { closeSheet(); if (v) changeSpec(s => { s.export.resolution = r; }, 'Resolução ' + r); } }, r.toUpperCase()))),
    el('div', { class: 'chips', style: 'margin-top:8px' }, ...[24, 30, 60].map(f => el('button', { class: 'chip' + (ex.fps === f ? ' on' : ''), onclick: () => { closeSheet(); if (v) changeSpec(s => { s.export.fps = f; }, f + ' fps'); } }, f + ' fps'))),
    el('div', { class: 'chips', style: 'margin-top:8px' }, el('button', { class: 'chip', onclick: () => { $('#safeGuide').hidden = !$('#safeGuide').hidden; positionSafe(); closeSheet(); } }, 'Mostrar/ocultar área segura na prévia')));
}
// Versões
function versionsSheet() {
  const ul = el('ul', { class: 'list' });
  S.versions.forEach((v, i) => ul.append(el('li', { class: i === S.cur ? 'cur' : '', style: 'cursor:pointer', onclick: () => { closeSheet(); showVersion(i); } },
    el('div', { class: 'ph', style: 'display:grid;place-items:center;font-weight:800;background:var(--s3)' }, 'V' + (i + 1)),
    el('div', { class: 'grow' }, el('b', {}, v.label || v.request), el('span', {}, v.plan ? `${fmtDur(v.plan.duration)} · ${v.plan.clips.length} cortes · ${v.plan.fmt.label}` : 'toque para abrir')))));
  openSheet('Versões', 'Nada se perde: cada pedido vira uma versão. Toque para voltar a qualquer uma.', S.versions.length ? ul : el('p', { class: 'muted' }, 'Nenhuma ainda.'),
    S.versions.length ? el('button', { class: 'btn wide', style: 'margin-top:12px', onclick: () => { closeSheet(); runEdit('faz 3 versões diferentes'); } }, 'Gerar 3 versões diferentes para comparar') : null);
}
// Qualidade
function qualitySheet() {
  const v = curV(); if (!v || !v.qc) return toast('Primeiro faça uma edição.');
  const q = v.qc;
  const bars = el('div', { class: 'bars' });
  for (const [k, val] of Object.entries(q.cat)) bars.append(el('span', {}, CAT_LABEL[k]), el('i', {}, el('u', { class: val >= 85 ? '' : val >= 65 ? 'mid' : 'low', style: `width:${val}%` })), el('span', {}, String(val)));
  openSheet('Qualidade', 'Notas por medição, não por gosto.', el('div', { class: 'qc-score' }, el('b', {}, String(q.score)), el('span', { class: 'muted' }, 'de 100')), bars,
    el('ul', { class: 'issues' }, ...q.issues.map(x => el('li', {}, x.msg, x.fix ? el('em', {}, 'Sugestão: ' + x.fix) : null)), ...q.ok.map(x => el('li', {}, '✓ ' + x)),
      v.exportCheck ? el('li', {}, v.exportCheck.ok ? '✓ Arquivo exportado conferido: abre, duração e proporção certas, sem tela preta.' : 'Arquivo: ' + v.exportCheck.problems.join(' ')) : null),
    label('O que a IA fez'), el('ul', { class: 'issues' }, ...v.plan.decisions.map(d => el('li', {}, d)), ...v.plan.warnings.map(d => el('li', { style: 'color:#F6CF85' }, d))));
}
// corte selecionado
function speedSheet(c) { openSheet('Velocidade', 'Só para este corte.', el('div', { class: 'chips' }, ...[[1, 'Normal'], [0.5, 'Câmera lenta'], ['ramp', 'Speed ramp']].map(([sp, l]) => el('button', { class: 'chip' + (c.speed === sp ? ' on' : ''), onclick: () => { closeSheet(); changeSpec(s => s.ops.push({ op: 'setSpeed', srcId: c.srcId, in: c.in, speed: sp }), l); } }, l)))); }
function transSheet(c) {
  const p = curPlan(); const first = p.clips[0] && p.clips[0].id === c.id;
  openSheet('Transição de entrada', first ? 'O primeiro corte não tem transição de entrada.' : 'Como este corte entra.', el('div', { class: 'chips' }, ...Object.entries(TRANS).map(([k, l]) => el('button', { class: 'chip' + (c.trans && c.trans.type === k ? ' on' : ''), disabled: first, onclick: () => { closeSheet(); changeSpec(s => s.ops.push({ op: 'setTrans', srcId: c.srcId, in: c.in, type: k }), 'Transição ' + l); } }, l))));
}
function trimSheet(c) { openSheet('Duração', `Agora: ${fmtN(c.dur)} s`, el('div', { class: 'chips' }, ...[-1, -0.5, -0.25, 0.25, 0.5, 1].map(d => el('button', { class: 'chip', onclick: () => { closeSheet(); changeSpec(s => s.ops.push({ op: 'trim', srcId: c.srcId, in: c.in, delta: d }), d < 0 ? 'Encurtar corte' : 'Alongar corte'); } }, (d > 0 ? '+' : '−') + fmtN(Math.abs(d)) + ' s')))); }
// Exportar
async function exportSheet() {
  const v = curV(); if (!v || S.exporting) return;
  stopPlay();
  const p = v.plan;
  const bar = el('div', { class: 'progress' }, el('i', {})), msg = el('p', { class: 'muted' }, 'Preparando…'), done = el('div', {});
  openSheet('Exportar vídeo', `${p.fmt.label} · ${p.fmt.w}×${p.fmt.h} · ${p.fmt.fps} quadros/s · ${fmtDur(p.duration)}`, bar, msg,
    el('p', { class: 'muted' }, 'Deixe esta tela aberta e o aparelho ligado. O vídeo é montado aqui mesmo, quadro a quadro.'), done);
  const setP = f => { bar.firstChild.style.width = Math.round(f * 100) + '%'; };
  const rd = new Renderer({ plan: p, getSrc, canvas: document.createElement('canvas'), scale: 1 });
  S.exporting = rd;
  let wake = null; try { wake = await navigator.wakeLock.request('screen'); } catch (e) {}
  try {
    await rd.prepare((f, l) => { setP(f * 0.05); msg.textContent = l || 'Preparando'; });
    let res;
    const sup = await Renderer.preciseSupport(rd.W, rd.H, p.fmt.fps);
    if (sup) res = await rd.exportPrecise({ onProgress: (f, x) => { setP(0.05 + f * 0.9); msg.textContent = `Quadro ${x.frame} de ${x.frames} · falta ~${fmtDur(Math.max(1, Math.round(x.etaSec)))}`; } });
    else { msg.textContent = 'Gravando em tempo real (este navegador não monta quadro a quadro). Não troque de tela.'; res = await rd.export({ onProgress: f => setP(0.05 + f * 0.9) }); }
    msg.textContent = 'Conferindo o arquivo…'; setP(0.97);
    v.exportCheck = await checkExport(res.blob, p); setP(1);
    const ext = res.type.includes('webm') ? 'webm' : 'mp4';
    const name = `corte-${p.fmt.platform}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext}`;
    const file = new File([res.blob], name, { type: res.type.split(';')[0] });
    const url = URL.createObjectURL(res.blob);
    msg.textContent = `Pronto: ${(res.blob.size / 1e6).toFixed(1)} MB${res.stats && res.stats.seconds ? ` em ${fmtDur(Math.round(res.stats.seconds))}` : ''}. ${v.exportCheck.ok ? 'Arquivo conferido.' : 'Atenção: ' + v.exportCheck.problems.join(' ')}`;
    done.append(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px' },
      navigator.canShare && navigator.canShare({ files: [file] }) ? el('button', { class: 'btn primary', onclick: () => navigator.share({ files: [file], title: name }).catch(() => {}), html: icon('download', 18) + ' Salvar / compartilhar' }) : null,
      el('a', { class: 'btn' + (navigator.canShare ? '' : ' primary'), href: url, download: name }, 'Baixar arquivo')));
    if (ext === 'webm') done.append(el('p', { class: 'muted' }, 'Este navegador gravou em WebM. Instagram e TikTok preferem MP4: use Safari no iPhone ou Chrome no computador.'));
  } catch (e) { console.error(e); msg.textContent = 'Falhou: ' + (e.message || e); }
  finally { rd.dispose(); S.exporting = null; if (wake) wake.release().catch(() => {}); }
}
// Ajustes
function settingsSheet() {
  const styles = store.loadStyles();
  openSheet('Ajustes', null,
    label('Idioma da voz'), el('div', { class: 'chips' }, ...[['pt-BR', 'Português'], ['en-US', 'Inglês']].map(([k, l]) => el('button', { class: 'chip' + (prefs.voiceLang === k ? ' on' : ''), onclick: () => { prefs.voiceLang = k; store.savePrefs(prefs); settingsSheet(); } }, l))),
    label('Meus estilos (toque para apagar)'), styles.length ? el('div', { class: 'chips' }, ...styles.map(s => el('button', { class: 'chip', onclick: () => { store.saveStyles(store.loadStyles().filter(x => x.name !== s.name)); settingsSheet(); } }, s.name + ' ×'))) : el('p', { class: 'muted' }, 'Depois de gostar de um resultado, diga "salva esse estilo".'),
    label('Versão'), el('p', { class: 'muted' }, `Corte ${APP_VERSION} · publicada em ${APP_DATE}`),
    label('Como funciona'),
    el('ul', { class: 'issues' },
      el('li', {}, 'Tudo roda no seu aparelho. Seus vídeos não são enviados para lugar nenhum.'),
      el('li', {}, 'A IA de edição entende pedidos em português e inglês por um banco de regras testado com mais de 300 frases; ela sempre mostra o que entendeu.'),
      el('li', {}, 'Legenda: transcrição no aparelho ou roteiro colado. Tradução automática ainda não.'),
      el('li', {}, 'Ainda não estabiliza imagem tremida; evita os trechos tremidos.'),
      el('li', {}, 'Efeitos sonoros são gerados por código, sem direitos autorais. Música de artista pode ser silenciada pelas redes.')));
}

// voz
let rec = null;
function setupMic(btn, target, autoSend = true) {
  btn.addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Este navegador não tem reconhecimento de voz. Use o microfone do teclado.', 4500); target.focus(); return; }
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = prefs.voiceLang; rec.interimResults = true; rec.continuous = true;
    const before = target.value ? target.value.trim() + ' ' : ''; let fin = '';
    rec.onresult = e => { let mid = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) fin += r[0].transcript + ' '; else mid += r[0].transcript; } target.value = before + fin + mid; };
    rec.onerror = e => { if (e.error === 'not-allowed') toast('Permita o microfone para o site nas configurações do Safari/Chrome.', 4500); };
    rec.onend = () => { btn.classList.remove('on'); rec = null; target.value = target.value.trim(); if (autoSend && target.value) runEdit(target.value); };
    btn.classList.add('on'); rec.start();
  });
}

// =====================================================================
// GUARDAR / ABRIR
// =====================================================================
let saveTimer = null;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!S.project || (!S.sources.length && !S.music)) return;
    const all = [...S.sources, ...(S.music && !S.sources.includes(S.music) ? [S.music] : []), ...(S.ref ? [S.ref] : [])];
    store.saveProject({
      id: S.project.id, name: S.project.name, createdAt: S.project.createdAt, thumb: (S.sources.find(s => s.thumb) || {}).thumb || null,
      files: all.map(s => ({ id: s.id, name: s.name, role: s.role, isMusic: S.music === s, isRef: S.ref === s })),
      versions: S.versions.map(v => ({ id: v.id, label: v.label, spec: v.spec, outIdx: v.outIdx, seed: v.seed, request: v.request, at: v.at, reply: v.reply ? { said: v.reply.said, warn: v.reply.warn, ask: [] } : null })),
      cur: S.cur, transcript: S.transcript,
    });
  }, 700);
}
async function openProject(id) {
  releaseMedia();
  const p = await store.getProject(id); if (!p) return;
  newProject();
  S.project = { id: p.id, name: p.name, createdAt: p.createdAt };
  $('#projName').value = p.name;
  for (const f of p.files || []) {
    const file = await store.getFile(f.id).catch(() => null);
    if (!file) { toast(`"${f.name}" não está mais guardado.`); continue; }
    const src = await loadSource(file, { id: f.id, role: f.role }); src.role = f.role; src.thumb = await thumbOf(src);
    if (f.isRef) S.ref = src; else { if (f.isMusic) S.music = src; if (f.role === 'footage' || f.role === 'voice') S.sources.push(src); }
  }
  S.transcript = p.transcript || {};
  S.versions = (p.versions || []).map(v => ({ ...v, plan: null }));
  renderAll();
  if (S.versions.length) {
    setBusy(true, [['a', 'Reabrindo o projeto']]);
    try { await analyzeAll(); await showVersion(clamp(p.cur, 0, S.versions.length - 1), false); } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
}

// =====================================================================
// LIGAÇÕES
// =====================================================================
function bind() {
  const av = $('#appVersion'); if (av) av.textContent = `Corte · versão ${APP_VERSION} · ${APP_DATE}`;
  $('#btnSettings').innerHTML = icon('gear'); $('#btnBack').innerHTML = icon('back'); $('#btnUndo').innerHTML = icon('undo', 20); $('#btnRedo').innerHTML = icon('redo', 20);
  $('#btnPlay').innerHTML = icon('play', 22); $('#btnMic').innerHTML = '<span class="ring"></span>' + icon('mic', 20); $('#btnSend').innerHTML = icon('send', 20); $('#sheetX').innerHTML = icon('close', 20);
  $('#btnNew').querySelector('.plus').innerHTML = icon('plus', 26);
  $('#btnNew').addEventListener('click', () => { newProject(); $('#fileIn').click(); });
  $('#btnSettings').addEventListener('click', settingsSheet);
  $('#btnBack').addEventListener('click', () => { autosave(); showHome(); });
  $('#projName').addEventListener('change', e => { S.project.name = e.target.value.trim() || S.project.name; autosave(); });
  $('#fileIn').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) addFiles(f); });
  $('#musicIn').addEventListener('change', async e => { const f = [...e.target.files]; e.target.value = ''; if (!f.length) return; await addFiles(f, { role: 'music' }); if (curV()) changeSpec(s => { s.music.none = false; }, 'Música nova'); });
  $('#refIn').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) addFiles(f, { role: 'reference' }); });
  $('#btnSend').addEventListener('click', () => runEdit($('#aiInput').value));
  $('#aiInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runEdit($('#aiInput').value); } });
  setupMic($('#btnMic'), $('#aiInput'));
  $('#btnPlay').addEventListener('click', togglePlay); $('#preview').addEventListener('click', togglePlay);
  $('#btnUndo').addEventListener('click', undo); $('#btnRedo').addEventListener('click', redo);
  $('#btnExport').addEventListener('click', exportSheet);
  $('#btnFormat').addEventListener('click', formatSheet);
  $('#zoomIn').addEventListener('click', () => { S.pps = Math.min(240, S.pps * 1.5); renderTimeline(); });
  $('#zoomOut').addEventListener('click', () => { S.pps = Math.max(8, S.pps / 1.5); renderTimeline(); });
  $('#tlScroll').addEventListener('scroll', () => { if (S.syncing || !curPlan()) return; seekTo($('#tlScroll').scrollLeft / S.pps); }, { passive: true });
  $('#sheetX').addEventListener('click', () => { if (!S.exporting) closeSheet(); });
  $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet' && !S.exporting) closeSheet(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#sheet').hidden && !S.exporting) closeSheet();
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === ' ' && curPlan()) { e.preventDefault(); togglePlay(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  });
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
  document.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) { if ($('#editor').hidden) newProject(); addFiles([...e.dataTransfer.files]); } });
  window.addEventListener('resize', () => { renderTimeline(); positionSafe(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.exporting) toast('A exportação pausa com o app em segundo plano. Volte para esta tela.', 5000); });
  window.addEventListener('beforeunload', e => { if (S.exporting) { e.preventDefault(); e.returnValue = ''; } });
}

bind(); showHome(); store.askPersist();
window.__corte = { S, runEdit, addFiles, exportSheet, showVersion, togglePlay, seekTo, newProject, openProject, changeSpec, aiSheet, captionsSheet, colorSheet, audioSheet, textSheet, styleSheet, mediaSheet, formatSheet, qualitySheet, versionsSheet };
