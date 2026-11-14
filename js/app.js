// Interface do Corte. Liga a tela ao motor (análise → diretor → plano → render → exportação).
import { loadSource, validateFile, isMobile } from './engine/media.js';
import { analyzeSource, analyzeMusicSource, forget } from './engine/pipeline.js';
import { interpret, newSpec, resolveStyle, fmtN, fmtDur } from './engine/director.js';
import { buildPlan } from './engine/planner.js';
import { Renderer } from './engine/render.js';
import { PRESETS } from './engine/styles.js';
import { PLATFORMS } from './engine/platforms.js';
import { CAPTION_STYLES, SHAPES, drawCaption, groupWords, markEmphasis, drawShape, ensureFonts, FONTS, googleFontsHref } from './engine/captions.js';
import { alignScript, whisperTranscribe } from './engine/transcribe.js';
import { checkPlan, checkExport, CAT_LABEL } from './engine/qc.js';
import { dropAudioCache } from './engine/audio-mix.js';
import { fmtTime, uid, deepClone, clamp, sleep } from './engine/util.js';
import * as store from './store.js';

const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); } for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k))); return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------------- estado ----------------
const prefs = Object.assign({ format: 'reels', voiceLang: 'pt-BR' }, store.loadPrefs());
const S = {
  project: { id: uid('proj'), name: 'Projeto ' + new Date().toLocaleDateString('pt-BR'), createdAt: Date.now() },
  sources: [], music: null, items: new Map(), musicA: null,
  versions: [], cur: -1, transcript: {},
  ui: { formats: [prefs.format], style: null, caption: null, shapes: [] },
  renderer: null, busy: false, playing: false, sel: null,
};
const footage = () => S.sources.filter(s => s.kind === 'video' && s.role !== 'music');
const getSrc = id => S.sources.find(s => s.id === id) || (S.music && S.music.id === id ? S.music : null);
const curV = () => S.versions[S.cur] || null;

// fontes de legenda do Google (carregam no aparelho)
document.head.append(el('link', { rel: 'stylesheet', href: googleFontsHref() }));

function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }

// ---------------- 1. arquivos ----------------
async function thumbOf(src) {
  if (src.kind !== 'video') return null;
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = src.url;
  try {
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = j; setTimeout(r, 6000); });
    v.currentTime = Math.min(1, src.duration / 3); await new Promise(r => { v.onseeked = r; setTimeout(r, 4000); });
    const c = document.createElement('canvas'); c.width = 144; c.height = 88; const x = c.getContext('2d');
    const s = Math.max(144 / v.videoWidth, 88 / v.videoHeight); x.drawImage(v, (144 - v.videoWidth * s) / 2, (88 - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
    return c.toDataURL('image/jpeg', 0.7);
  } catch (e) { return null; } finally { v.removeAttribute('src'); v.load(); }
}

async function addFiles(files, { role } = {}) {
  for (const f of files) {
    const errs = validateFile(f);
    if (errs.length) { toast(errs[0], 4000); continue; }
    try {
      const src = await loadSource(f, { role });
      src.thumb = await thumbOf(src);
      if (role === 'music' || src.kind === 'audio') { setMusic(src); }
      else S.sources.push(src);
      store.saveFile(src.id, f);
    } catch (e) { toast(`Não consegui abrir "${f.name}": ${e.message}`, 4500); }
  }
  renderMedia(); autosave();
  // já começa a analisar em segundo plano (economiza tempo depois)
  analyzeAll().catch(() => {});
}

function setMusic(src) {
  if (S.music && S.music !== src && !S.sources.includes(S.music)) forget(S.music.id);
  S.music = src;
  if (src) { src.role = src.role === 'footage' ? 'footage' : 'music'; }
  S.musicA = null;
  renderMusic(); autosave();
}

function renderMedia() {
  const ul = $('#mediaList'); ul.innerHTML = '';
  for (const s of S.sources) {
    const isMusicSrc = S.music && S.music.id === s.id;
    const li = el('li', {},
      s.thumb ? el('img', { src: s.thumb, alt: '' }) : el('div', { class: 'ph' }),
      el('div', {}, el('div', { class: 'nm' }, s.name), el('div', { class: 'meta' }, `${fmtTime(s.duration)} · ${s.width}×${s.height}${isMusicSrc ? ' · música' : ''}${s.role === 'music' ? ' (não entra na imagem)' : ''}`)),
      el('div', { class: 'acts' },
        el('button', { class: 'ghost', onclick: () => useAsMusic(s), title: 'Usar o som deste vídeo como trilha' }, isMusicSrc ? 'Trilha ✓' : 'Usar música'),
        el('button', { class: 'ghost', onclick: () => removeSource(s), 'aria-label': 'Remover ' + s.name }, 'Remover')),
      el('div', { class: 'bar' }, el('i', { id: 'bar_' + s.id })));
    ul.append(li);
  }
  $('#mediaHint').textContent = S.sources.length ? `${footage().length} vídeo(s), ${fmtDur(footage().reduce((a, s) => a + s.duration, 0))} no total.` : 'Pode mandar vários. Ficam só no seu aparelho.';
}

function useAsMusic(s) {
  if (S.music && S.music.id === s.id) { s.role = 'footage'; setMusic(null); renderMedia(); return; }
  const onlyMusic = confirm(`Usar o som de "${s.name}" como música.\n\nOK = só a música (a imagem deste vídeo não entra)\nCancelar = música E imagem`);
  s.role = onlyMusic ? 'music' : 'footage';
  setMusic(s); renderMedia();
}
function removeSource(s) {
  S.sources = S.sources.filter(x => x !== s); forget(s.id); dropAudioCache(s.id);
  if (S.music === s) setMusic(null);
  renderMedia(); autosave();
}
function renderMusic() {
  const m = S.music;
  $('#musicName').textContent = m ? `${m.name} · ${fmtTime(m.duration)}${S.musicA ? ` · ${fmtN(S.musicA.bpm)} BPM` : ''}` : 'Nenhuma escolhida';
  $('#btnMusicNone').hidden = !m; $('#musicStartRow').hidden = !m; $('#musicNote').hidden = !m;
  if (m) { const r = $('#musicStart'); r.max = Math.max(1, Math.floor(m.duration - 2)); }
}

// ---------------- 2. chips ----------------
const FORMAT_CHIPS = ['tiktok', 'reels', 'shorts', 'youtube', 'feed', 'square'];
function renderChips() {
  const cf = $('#chipsFormat'); cf.innerHTML = '';
  for (const id of FORMAT_CHIPS) cf.append(el('button', { class: 'chip' + (S.ui.formats.includes(id) ? ' on' : ''), onclick: () => { const i = S.ui.formats.indexOf(id); if (i >= 0) { if (S.ui.formats.length > 1) S.ui.formats.splice(i, 1); } else S.ui.formats.push(id); prefs.format = S.ui.formats[0]; store.savePrefs(prefs); renderChips(); } }, PLATFORMS[id].label.replace('Instagram ', '')));
  const cs = $('#chipsStyle'); cs.innerHTML = '';
  cs.append(el('button', { class: 'chip' + (!S.ui.style ? ' on' : ''), onclick: () => { S.ui.style = null; renderChips(); } }, 'Pelo pedido'));
  for (const st of store.loadStyles()) cs.append(el('button', { class: 'chip' + (S.ui.style === 'saved:' + st.name ? ' on' : ''), onclick: () => { S.ui.style = 'saved:' + st.name; renderChips(); } }, '★ ' + st.name));
  for (const [id, p] of Object.entries(PRESETS)) cs.append(el('button', { class: 'chip' + (S.ui.style === id ? ' on' : ''), title: p.desc, onclick: () => { S.ui.style = id; renderChips(); } }, p.label));
  const cc = $('#chipsCaption'); cc.innerHTML = '';
  cc.append(el('button', { class: 'chip' + (!S.ui.caption ? ' on' : ''), onclick: () => { S.ui.caption = null; renderChips(); } }, 'Pelo estilo'));
  cc.append(el('button', { class: 'chip' + (S.ui.caption === 'none' ? ' on' : ''), onclick: () => { S.ui.caption = 'none'; renderChips(); } }, 'Sem legenda'));
  for (const [id, c] of Object.entries(CAPTION_STYLES)) cc.append(el('button', { class: 'chip' + (S.ui.caption === id ? ' on' : ''), title: c.desc, onclick: () => { S.ui.caption = id; renderChips(); } }, c.label));
  const sh = $('#chipsShapes'); sh.innerHTML = '';
  if (!S.ui.shapes.length) sh.append(el('span', { class: 'muted' }, 'Nenhum. Ex.: "SIGA PARA MAIS" girando em círculo.'));
  S.ui.shapes.forEach((x, i) => sh.append(el('button', { class: 'chip on', onclick: () => { S.ui.shapes.splice(i, 1); renderChips(); } }, `${SHAPES[x.shape].label}: ${x.text}`, el('span', { class: 'x' }, '×'))));
}

// ---------------- voz ----------------
let rec = null, recTarget = null;
function setupMic(btn, target) {
  btn.addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Este navegador não tem reconhecimento de voz. Use o microfone do teclado do celular.', 4500); target.focus(); return; }
    if (rec) { rec.stop(); return; }
    rec = new SR(); recTarget = target;
    rec.lang = prefs.voiceLang; rec.interimResults = true; rec.continuous = true;
    const before = target.value ? target.value.trim() + ' ' : '';
    let finalTxt = '';
    rec.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finalTxt += r[0].transcript + ' '; else interim += r[0].transcript; } target.value = before + finalTxt + interim; };
    rec.onerror = e => { if (e.error === 'not-allowed') toast('Permita o microfone nas configurações do navegador.', 4000); else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Voz: ' + e.error); };
    rec.onend = () => { btn.classList.remove('on'); rec = null; target.value = target.value.trim(); if (target.value && target === $('#adjust')) { /* ajuste por voz: confirma sozinho */ runEdit(target.value, true); } };
    btn.classList.add('on'); rec.start();
  });
}

// ---------------- etapas ----------------
let stageEls = {};
function stagesInit(list) {
  const ol = $('#stages'); ol.innerHTML = ''; stageEls = {};
  for (const [key, label] of list) { const li = el('li', { id: 'st_' + key }, el('span', {}, label), el('span', { class: 'pct' })); ol.append(li); stageEls[key] = li; }
}
function stage(key, state, pct, label) {
  const li = stageEls[key]; if (!li) return;
  li.className = state; if (label) li.firstChild.textContent = label;
  li.lastChild.textContent = pct != null && state === 'run' ? Math.round(pct * 100) + '%' : '';
}

function showUnderstood(r) {
  const box = $('#understood'); box.innerHTML = '';
  if (r.said.length) box.append(el('div', { class: 'row' }, el('b', {}, 'Entendi:')));
  r.said.forEach(x => box.append(el('div', { class: 'row ok' }, x)));
  r.warn.forEach(x => box.append(el('div', { class: 'row warn' }, x)));
  r.ask.forEach(x => box.append(el('div', { class: 'row q' }, x)));
}

// ---------------- análise ----------------
async function analyzeAll(onStage) {
  for (const s of footage()) {
    if (S.items.has(s.id)) continue;
    const bar = document.getElementById('bar_' + s.id);
    const it = await analyzeSource(s, ev => { onStage && onStage(ev); if (bar) bar.style.width = ((ev.stage === 'audio' ? 0.1 : 0.1 + 0.9 * (ev.p || 0)) * 100) + '%'; });
    S.items.set(s.id, it);
    if (bar) bar.style.width = '100%';
  }
  if (S.music && !S.musicA) { S.musicA = await analyzeMusicSource(S.music, onStage); renderMusic(); }
}
let analyzing = null;
function analyzeOnce(onStage) { if (!analyzing) analyzing = analyzeAll(onStage).finally(() => { analyzing = null; }); return analyzing; }

// ---------------- estilos salvos ----------------
function applySavedStyle(spec, name) {
  const st = store.loadStyles().find(x => x.name === name); if (!st) return spec;
  spec.mix = deepClone(st.mix); spec.over = { ...deepClone(st.over), ...spec.over };
  if (st.caption) spec.captions.style = st.caption;
  return spec;
}

// ---------------- editar ----------------
async function runEdit(text, isAdjust = false) {
  if (S.busy) return;
  if (!footage().length) { toast('Primeiro escolha pelo menos um vídeo.'); $('#drop').focus(); return; }
  const prev = isAdjust && curV() ? curV().spec : null;
  const t = (text || '').trim();
  // "salva esse estilo como meu estilo"
  const nt = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (prev && /\b(salva|salve|guarda|save)\b.{0,30}\b(estilo|style)\b/.test(nt)) {
    const name = (t.match(/["“](.+?)["”]/) || [])[1] || (/\b(assinatura|signature|meu estilo|my style)\b/.test(nt) ? 'Meu estilo' : prompt('Nome do estilo:', 'Meu estilo'));
    if (name) { const all = store.loadStyles().filter(x => x.name !== name); all.unshift({ name, mix: prev.mix, over: prev.over, caption: prev.captions.style, at: Date.now() }); store.saveStyles(all); toast(`Estilo "${name}" salvo com o ritmo, a cor, as transições e a legenda.`); renderChips(); }
    $('#adjust').value = ''; return;
  }
  let r = t ? interpret(t, prev) : { spec: deepClone(prev || newSpec()), said: [], warn: [], ask: [] };
  if (r.undo) { undo(); return; }
  const spec = r.spec;
  if (/\b(meu estilo|my (signature )?style|estilo assinatura|no meu jeito)\b/.test(nt)) { const st = store.loadStyles()[0]; if (st) { applySavedStyle(spec, st.name); r.said.unshift(`Seu estilo "${st.name}"`); } else r.warn.push('Você ainda não salvou um estilo. Depois de gostar de um resultado, diga "salva esse estilo como meu estilo".'); }
  // escolhas dos botões (valem quando o texto não disse o contrário)
  if (!isAdjust) {
    if (!r.said.some(x => x.startsWith('Formato'))) spec.outputs = S.ui.formats.map(p => ({ platform: p, duration: (spec.target && spec.target.seconds) || null }));
    if (S.ui.style && !r.said.some(x => x.startsWith('Estilo'))) { if (S.ui.style.startsWith('saved:')) applySavedStyle(spec, S.ui.style.slice(6)); else spec.mix = [{ id: S.ui.style, w: 1 }]; }
    if (S.ui.caption === 'none') spec.captions.enabled = false; else if (S.ui.caption && !spec.captions.style) spec.captions.style = S.ui.caption;
    for (const sh of S.ui.shapes) spec.texts.push({ ...sh });
    if (!t && !r.said.length) r.said.push('Sem pedido escrito: usei os botões escolhidos e o estilo ' + resolveStyle(spec).label);
  }
  if (r.ask.length && !r.said.length) { $('#secWork').hidden = false; stagesInit([]); showUnderstood(r); return; }
  if (spec.music.fromVideo && !S.music) r.warn.push('Pediu a música de um vídeo: toque em "Usar música" no vídeo certo, no item 1, e peça de novo.');
  if (!S.music && !spec.music.none && spec.music.mood) r.warn.push('Não há música escolhida. Escolha uma em "Música" (item 1) para eu sincronizar os cortes com a batida.');

  S.busy = true; setBusy(true);
  $('#secWork').hidden = false; $('#workTitle').textContent = isAdjust ? 'Ajustando' : 'Editando';
  showUnderstood(r);
  const st = [];
  for (const s of footage()) if (!S.items.has(s.id)) st.push(['a_' + s.id, `Assistindo e ouvindo "${s.name}"`]);
  if (S.music && !S.musicA) st.push(['music', `Achando as batidas de "${S.music.name}"`]);
  st.push(['plan', 'Montando o plano de edição'], ['mix', 'Mixando o som e preparando a prévia'], ['qc', 'Conferindo a qualidade']);
  stagesInit(st);
  try {
    // análise (aproveita o que já foi feito)
    for (const s of footage()) if (!S.items.has(s.id)) stage('a_' + s.id, 'run', 0);
    await analyzeOnce(ev => {
      if (ev.stage === 'music') stage('music', 'run', ev.p);
      else stage('a_' + ev.src.id, 'run', ev.stage === 'audio' ? 0.05 : 0.05 + 0.95 * (ev.p || 0), ev.label);
    });
    await analyzeAll();
    for (const s of footage()) stage('a_' + s.id, 'done');
    stage('music', 'done');
    // plano(s)
    stage('plan', 'run');
    await sleep(20);
    const items = footage().map(s => S.items.get(s.id));
    const music = spec.music.none ? null : S.musicA;
    const variants = makeVariants(spec);
    const made = [];
    for (const v of variants) {
      for (let oi = 0; oi < v.spec.outputs.length; oi++) {
        const plan = buildPlan({ spec: v.spec, items, music, outputIndex: oi, seed: v.seed, transcript: S.transcript });
        made.push({ id: uid('v'), label: (isAdjust && r.said[0] ? r.said.slice(0, 2).join(' · ') : v.label) + (v.spec.outputs.length > 1 ? ' · ' + PLATFORMS[v.spec.outputs[oi].platform].label : ''), spec: v.spec, outIdx: oi, seed: v.seed, plan, at: Date.now(), request: t || '(botões)' });
      }
    }
    // ajuste substitui a partir daqui (o histórico continua guardado para desfazer)
    S.versions.push(...made);
    S.cur = S.versions.length - made.length;
    stage('plan', 'done', null, `Plano pronto: ${made.length > 1 ? made.length + ' versões' : made[0].plan.clips.length + ' cortes, ' + fmtDur(made[0].plan.duration)}`);
    stage('mix', 'run');
    await showVersion(S.cur, p => stage('mix', 'run', p));
    stage('mix', 'done');
    stage('qc', 'done');
    $('#secResult').hidden = false;
    if (!isAdjust) $('#secResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (isAdjust) $('#adjust').value = '';
    autosave();
  } catch (e) {
    console.error(e);
    for (const li of Object.values(stageEls)) if (li.className === 'run') li.className = 'err';
    toast('Deu erro: ' + (e.message || e), 6000);
  } finally { S.busy = false; setBusy(false); }
}

function makeVariants(spec) {
  const n = spec.versions || 1;
  if (n <= 1) return [{ spec, label: label(spec), seed: 1 }];
  if (spec.versionsKind === 'openings') return Array.from({ length: n }, (_, i) => ({ spec: { ...deepClone(spec), hookSeconds: spec.hookSeconds || 3 }, label: `Abertura ${'ABCD'[i]}`, seed: 1 + i * 13 }));
  const main = spec.mix[0] ? spec.mix[0].id : 'social';
  const alts = ['cinematic', 'action', 'emotional', 'social', 'documentary'].filter(x => x !== main);
  const out = [{ spec, label: 'Versão A · ' + label(spec), seed: 1 }];
  for (let i = 1; i < n; i++) { const s2 = deepClone(spec); s2.mix = [{ id: alts[i - 1], w: 1 }]; s2.versions = 1; out.push({ spec: s2, label: `Versão ${'ABCD'[i]} · ${PRESETS[alts[i - 1]].label}`, seed: 1 + i }); }
  out[0].spec = { ...deepClone(spec), versions: 1 };
  return out;
}
const label = spec => resolveStyle(spec).label.replace(/^100% /, '');

function setBusy(b) { for (const id of ['#btnGo', '#btnAdjust', '#btnExport', '#btnUndo']) { const x = $(id); if (x) x.disabled = b; } }

async function showVersion(i, onProgress = () => {}) {
  S.cur = i;
  const v = curV(); if (!v) return;
  if (!v.plan) v.plan = buildPlan({ spec: v.spec, items: footage().map(s => S.items.get(s.id)), music: v.spec.music.none ? null : S.musicA, outputIndex: v.outIdx || 0, seed: v.seed || 1, transcript: S.transcript });
  stopPlay();
  if (S.renderer) S.renderer.dispose();
  const plan = v.plan;
  const scale = Math.min(1, 640 / Math.max(plan.fmt.w, plan.fmt.h));
  const rd = new Renderer({ plan, getSrc, canvas: $('#preview'), scale });
  S.renderer = rd;
  const mix = await rd.prepare((p, l) => onProgress(p));
  v.mixStats = mix.stats;
  rd.t = Math.min(0.6, plan.duration / 2);
  await rd.frameAt(rd.t);
  v.qc = checkPlan(plan, v.spec, mix.stats);
  renderResult();
}

// ---------------- resultado ----------------
function renderResult() {
  const v = curV(); if (!v) return;
  const plan = v.plan;
  $('#resultMeta').textContent = `${plan.fmt.label} · ${plan.fmt.w}×${plan.fmt.h} · ${fmtDur(plan.duration)} · ${plan.clips.length} cortes`;
  // versões
  const vs = $('#versions'); vs.innerHTML = '';
  S.versions.forEach((x, i) => vs.append(el('button', { class: i === S.cur ? 'on' : '', onclick: () => { if (!S.busy) withBusy(() => showVersion(i)); } }, el('b', {}, `V${i + 1}`), x.label)));
  vs.scrollLeft = vs.scrollWidth;
  updateTc(S.renderer ? S.renderer.t : 0);
  renderDid(); renderTimeline(); renderCaptionsTab(); renderQuality(); positionSafe();
}
async function withBusy(fn) { S.busy = true; setBusy(true); try { await fn(); } catch (e) { toast(e.message || String(e), 5000); } finally { S.busy = false; setBusy(false); } }

function renderDid() {
  const v = curV(), p = v.plan;
  const box = $('#tab-did'); box.innerHTML = '';
  box.append(el('p', { class: 'muted' }, `Pedido: "${v.request}" · Estilo: ${p.styleLabel}`));
  const ul = el('ul', { class: 'did' });
  p.decisions.forEach(d => ul.append(el('li', {}, d)));
  p.warnings.forEach(d => ul.append(el('li', { class: 'warn' }, d)));
  box.append(ul);
}

// linha do tempo
function thumbFor(c) {
  const it = S.items.get(c.srcId); if (!it || !it.video) return null;
  const sh = it.video.shots.find(s => c.in >= s.start - 0.01 && c.in < s.end) || it.video.shots[0];
  return sh ? sh.thumb : null;
}
const TRANS_PT = { cut: 'Corte seco', dissolve: 'Dissolver', dip: 'Escurecer', flash: 'Flash', whip: 'Chicote', zoom: 'Zoom', glitch: 'Glitch' };
function renderTimeline() {
  const v = curV(), p = v.plan, box = $('#tab-timeline'); box.innerHTML = '';
  const strip = el('div', { class: 'tl' });
  p.clips.forEach((c, i) => {
    const b = el('button', { class: 'clip' + (S.sel === i ? ' sel' : ''), style: `width:${Math.max(36, c.dur * 46)}px;background-image:url(${thumbFor(c) || ''})`, onclick: () => { S.sel = i; renderTimeline(); seekTo(c.start + 0.05); } },
      c.trans && c.trans.type !== 'cut' ? el('i', { class: 'tr' }, TRANS_PT[c.trans.type]) : null,
      el('span', {}, `${fmtN(c.dur)}s${c.speed !== 1 ? ' · ' + (c.speed === 'ramp' ? 'rampa' : c.speed + 'x') : ''}`));
    strip.append(b);
  });
  box.append(el('p', { class: 'muted' }, 'Toque num corte para mudar transição, velocidade, duração ou tirar. Tudo continua editável; nada se perde.'), strip);
  if (S.sel != null && p.clips[S.sel]) {
    const c = p.clips[S.sel];
    const ed = el('div', { class: 'tl-edit' },
      el('div', {}, el('b', {}, `Corte ${S.sel + 1}`), ` · de "${(getSrc(c.srcId) || {}).name}" ${fmtTime(c.in, true)}–${fmtTime(c.out, true)} · na tela em ${fmtTime(c.start, true)}`),
      el('div', { class: 'row' }, el('label', {}, 'Transição de entrada'), ...Object.keys(TRANS_PT).map(k => el('button', { class: 'chip' + (c.trans && c.trans.type === k ? ' on' : ''), disabled: S.sel === 0, onclick: () => manualOp({ op: 'setTrans', srcId: c.srcId, in: c.in, type: k }, `Transição ${TRANS_PT[k]}`) }, TRANS_PT[k]))),
      el('div', { class: 'row' }, el('label', {}, 'Velocidade'), ...[[1, 'Normal'], [0.5, 'Câmera lenta'], ['ramp', 'Speed ramp']].map(([s, l]) => el('button', { class: 'chip' + (c.speed === s ? ' on' : ''), onclick: () => manualOp({ op: 'setSpeed', srcId: c.srcId, in: c.in, speed: s }, l) }, l))),
      el('div', { class: 'row' }, el('label', {}, 'Duração'), el('button', { class: 'chip', onclick: () => manualOp({ op: 'trim', srcId: c.srcId, in: c.in, delta: -0.25 }, 'Encurtar corte') }, '− 0,25 s'), el('button', { class: 'chip', onclick: () => manualOp({ op: 'trim', srcId: c.srcId, in: c.in, delta: 0.25 }, 'Alongar corte') }, '+ 0,25 s'),
        el('button', { class: 'chip', onclick: () => { if (confirm('Tirar este corte do vídeo? (Dá para desfazer.)')) manualOp({ op: 'deleteClip', srcId: c.srcId, in: c.in }, 'Corte removido'); } }, 'Tirar este corte')));
    box.append(ed);
  }
}
async function manualOp(op, what) {
  const v = curV(); if (!v || S.busy) return;
  const spec = deepClone(v.spec); spec.ops = [...(spec.ops || []), op];
  await withBusy(async () => {
    const plan = buildPlan({ spec, items: footage().map(s => S.items.get(s.id)), music: spec.music.none ? null : S.musicA, outputIndex: v.outIdx || 0, seed: v.seed || 1, transcript: S.transcript });
    S.versions.push({ id: uid('v'), label: what, spec, outIdx: v.outIdx, seed: v.seed, plan, at: Date.now(), request: what });
    await showVersion(S.versions.length - 1);
    autosave();
  });
}
function undo() {
  if (S.cur > 0) withBusy(() => showVersion(S.cur - 1)).then(() => toast(`Voltei para a V${S.cur + 1}. As outras versões continuam guardadas.`));
  else toast('Nada para desfazer.');
}

// legendas
function speechSourcesInPlan(plan) { return [...new Set(plan.clips.filter(c => c.kind === 'dialogue' || c.kind === 'hook').map(c => c.srcId))].filter(id => { const it = S.items.get(id); return it && it.audio && it.audio.speechRatio > 0.15; }); }
function renderCaptionsTab() {
  const v = curV(), p = v.plan, box = $('#tab-captions'); box.innerHTML = '';
  const speech = speechSourcesInPlan(p);
  const missing = speech.filter(id => !S.transcript[id]);
  const wrap = el('div', { class: 'caps' });
  if (!speech.length) wrap.append(el('p', { class: 'muted' }, 'Não achei fala neste vídeo. Legenda não é necessária; use um texto com forma ou título se quiser.'));
  if (missing.length) {
    wrap.append(el('p', {}, `Para legendar preciso do texto da fala de ${missing.map(id => '"' + getSrc(id).name + '"').join(', ')}. Duas formas grátis:`));
    const langSel = el('select', { id: 'trLang' }, el('option', { value: 'portuguese' }, 'Português'), el('option', { value: 'english' }, 'Inglês'), el('option', { value: '' }, 'Detectar sozinho'));
    wrap.append(el('div', { class: 'actions' }, el('button', { class: 'btn small primary', onclick: () => doWhisper(missing, langSel.value) }, 'Transcrever no aparelho'), langSel));
    wrap.append(el('p', { class: 'fine' }, 'Na primeira vez baixa uns 75 MB (o modelo Whisper) e guarda. Depois funciona sem internet. Em iPhone antigo pode ser lento.'));
    const ta = el('textarea', { placeholder: 'Ou cole aqui o roteiro / o que foi falado. Eu sincronizo com a voz.' });
    wrap.append(ta, el('div', { class: 'actions' }, el('button', { class: 'btn small', onclick: () => { if (!ta.value.trim()) return toast('Cole o texto primeiro.'); for (const id of missing) { const it = S.items.get(id); S.transcript[id] = { words: alignScript(ta.value, it.audio.speech), from: 'roteiro' }; } rebuildCurrent('Legenda pelo roteiro'); } }, 'Sincronizar roteiro')));
  }
  // estilo, posição, tamanho
  const cs = el('div', { class: 'chips scroll' });
  for (const [id, c] of Object.entries(CAPTION_STYLES)) cs.append(el('button', { class: 'chip' + (p.captionStyle === id ? ' on' : ''), onclick: () => quickCaption({ style: id }) }, c.label));
  wrap.append(el('div', { class: 'chips-title' }, 'Estilo da legenda'), cs);
  const pos = el('input', { type: 'range', min: '0.25', max: '0.9', step: '0.01', value: String(p.captionY != null ? p.captionY : p.fmt.captionY) });
  pos.addEventListener('input', () => quickCaption({ y: +pos.value }, true));
  const size = el('input', { type: 'range', min: '0.6', max: '1.6', step: '0.05', value: String((p.captionOpts && p.captionOpts.scale) || 1) });
  size.addEventListener('input', () => quickCaption({ scale: +size.value }, true));
  wrap.append(el('div', { class: 'field' }, el('label', {}, 'Altura na tela'), pos), el('div', { class: 'field' }, el('label', {}, 'Tamanho'), size));
  wrap.append(el('div', { class: 'actions' },
    el('button', { class: 'chip' + (p.captionsOn ? ' on' : ''), onclick: () => quickCaption({ on: !p.captionsOn }) }, p.captionsOn ? 'Legenda ligada' : 'Legenda desligada'),
    el('button', { class: 'chip' + (p.captionOpts && p.captionOpts.highlight !== false ? ' on' : ''), onclick: () => quickCaption({ highlight: !(p.captionOpts && p.captionOpts.highlight !== false) }) }, 'Destacar palavras fortes'),
    el('button', { class: 'chip' + (p.captionOpts && p.captionOpts.uppercase ? ' on' : ''), onclick: () => quickCaption({ uppercase: !(p.captionOpts && p.captionOpts.uppercase) }) }, 'CAIXA ALTA')));
  // correção das palavras
  if (p.captions.length) {
    wrap.append(el('div', { class: 'chips-title' }, 'Corrigir palavras (toque e edite)'));
    const groups = groupWords(p.captions, p.captionStyle);
    groups.slice(0, 200).forEach(g => {
      const row = el('div', { class: 'group' }, el('span', { class: 't' }, fmtTime(g.t0, true)));
      g.words.forEach(w => { const inp = el('input', { value: w.w, size: String(Math.max(2, w.w.length)) }); inp.addEventListener('change', () => fixWord(w, inp.value)); row.append(inp); });
      wrap.append(row);
    });
  }
  box.append(wrap);
}
function quickCaption(ch, light = false) {
  const v = curV(); if (!v) return;
  const p = v.plan;
  if (ch.style) { p.captionStyle = ch.style; v.spec.captions.style = ch.style; }
  if (ch.on != null) { p.captionsOn = ch.on; v.spec.captions.enabled = ch.on; }
  if (ch.y != null) { p.captionY = ch.y; v.spec.over.captionY = ch.y; }
  p.captionOpts = p.captionOpts || {};
  if (ch.scale != null) { p.captionOpts.scale = ch.scale; v.spec.over.captionScale = ch.scale; }
  if (ch.highlight != null) { p.captionOpts.highlight = ch.highlight; v.spec.captions.highlight = ch.highlight; }
  if (ch.uppercase != null) { p.captionOpts.uppercase = ch.uppercase; v.spec.captions.uppercase = ch.uppercase; }
  if (S.renderer) { S.renderer.overlays.setCaptions(p.captions); ensureFonts(S.renderer.overlays.fontsUsed()).then(() => S.renderer.frameAt(S.renderer.t || currentT())); }
  if (!light) renderCaptionsTab();
  autosave();
}
function fixWord(w, txt) {
  // procura a palavra na transcrição da fonte pelo tempo e troca
  for (const [id, tr] of Object.entries(S.transcript)) {
    const c = curV().plan.clips.find(c => c.srcId === id && w.t0 >= c.start - 0.01 && w.t0 < c.start + c.dur);
    if (!c) continue;
    const srcT = c.in + (w.t0 - c.start);
    const sw = tr.words.reduce((b, x) => Math.abs(x.t0 - srcT) < Math.abs(b.t0 - srcT) ? x : b, tr.words[0]);
    if (sw && Math.abs(sw.t0 - srcT) < 0.3) { sw.w = txt; w.w = txt; }
  }
  if (S.renderer) { S.renderer.overlays.setCaptions(curV().plan.captions); S.renderer.frameAt(currentT()); }
  autosave();
}
async function doWhisper(ids, lang) {
  await withBusy(async () => {
    $('#secWork').hidden = false; stagesInit(ids.map(id => ['tr_' + id, `Transcrevendo "${getSrc(id).name}"`]));
    for (const id of ids) {
      stage('tr_' + id, 'run', 0);
      try {
        const res = await whisperTranscribe(getSrc(id), { language: lang || null, onProgress: e => stage('tr_' + id, 'run', e.p, e.label) });
        S.transcript[id] = { words: res.words, from: 'whisper' };
        stage('tr_' + id, 'done', null, `Transcrito: ${res.words.length} palavras`);
      } catch (e) {
        stage('tr_' + id, 'err', null, 'A transcrição no aparelho falhou: ' + (e.message || e) + '. Use "Colar roteiro".');
        throw e;
      }
    }
  });
  await rebuildCurrent('Legenda transcrita');
}
async function rebuildCurrent(what) {
  const v = curV(); if (!v) return;
  await withBusy(async () => {
    const plan = buildPlan({ spec: v.spec, items: footage().map(s => S.items.get(s.id)), music: v.spec.music.none ? null : S.musicA, outputIndex: v.outIdx || 0, seed: v.seed || 1, transcript: S.transcript });
    S.versions.push({ ...v, id: uid('v'), plan, label: what, request: what, at: Date.now() });
    await showVersion(S.versions.length - 1);
    autosave();
  });
}

// qualidade
function renderQuality() {
  const v = curV(), q = v.qc, box = $('#tab-quality'); box.innerHTML = '';
  if (!q) return;
  const wrap = el('div', { class: 'qc' }, el('div', { class: 'score' }, el('b', {}, String(q.score)), el('span', { class: 'muted' }, 'de 100, pelas medições abaixo (não é opinião estética)')));
  const bars = el('div', { class: 'bars' });
  for (const [k, val] of Object.entries(q.cat)) bars.append(el('span', {}, CAT_LABEL[k]), el('i', {}, el('u', { class: val >= 85 ? '' : val >= 65 ? 'mid' : 'low', style: `width:${val}%` })), el('span', {}, String(val)));
  wrap.append(bars);
  const ul = el('ul', {});
  q.issues.forEach(x => ul.append(el('li', {}, x.msg, x.fix ? el('em', {}, 'Sugestão: ' + x.fix) : null)));
  q.ok.forEach(x => ul.append(el('li', {}, '✓ ' + x)));
  if (v.exportCheck) ul.append(el('li', {}, v.exportCheck.ok ? '✓ Arquivo exportado conferido: abre, duração e proporção certas, sem tela preta.' : 'Arquivo exportado: ' + v.exportCheck.problems.join(' ')));
  wrap.append(ul);
  box.append(wrap);
}

// ---------------- player ----------------
const currentT = () => S.renderer ? (S.renderer.t || 0) : 0;
function updateTc(t) { const p = curV() && curV().plan; if (!p) return; $('#tc').textContent = `${fmtTime(t)} / ${fmtTime(p.duration)}`; $('#scrub').value = String(Math.round(t / p.duration * 1000)); }
async function togglePlay() {
  const rd = S.renderer; if (!rd) return;
  if (S.playing) { stopPlay(); return; }
  S.playing = true; $('#btnPlay').textContent = 'Pausar'; $('#bigPlay').hidden = true;
  let from = rd.t || 0; if (from >= rd.plan.duration - 0.1) from = 0;
  await rd.play(from, { onTime: t => updateTc(t), onEnd: () => { stopPlay(); } });
}
function stopPlay() { if (S.renderer) S.renderer.stop(); S.playing = false; $('#btnPlay').textContent = 'Tocar'; $('#bigPlay').hidden = false; }
let seekTimer = null;
function seekTo(t) { stopPlay(); if (!S.renderer) return; S.renderer.t = t; updateTc(t); clearTimeout(seekTimer); seekTimer = setTimeout(() => S.renderer && S.renderer.frameAt(t), 60); }
function positionSafe() {
  const p = curV() && curV().plan, g = $('#safeGuide'), c = $('#preview'); if (!p) return;
  const s = p.fmt.safe; g.style.left = s.left * 100 + '%'; g.style.right = s.right * 100 + '%'; g.style.top = s.top * 100 + '%'; g.style.bottom = s.bottom * 100 + '%';
}

// ---------------- exportar ----------------
async function exportCurrent() {
  const v = curV(); if (!v) return;
  stopPlay();
  const p = v.plan;
  const box = el('div', {},
    el('h3', {}, 'Exportar vídeo'),
    el('p', { class: 'sub' }, `${p.fmt.label} · ${p.fmt.w}×${p.fmt.h} · ${p.fmt.fps} quadros/s · ${fmtDur(p.duration)}`),
    el('div', { class: 'progress' }, el('i', { id: 'exBar' })), el('p', { id: 'exMsg', class: 'muted' }, 'Preparando…'),
    el('p', { class: 'fine' }, 'Deixe esta tela aberta e o aparelho ligado até terminar. O vídeo é montado quadro a quadro aqui no aparelho, nada é enviado para servidor.'),
    el('div', { id: 'exDone' }));
  openSheet(box);
  const cv = document.createElement('canvas');
  const rd = new Renderer({ plan: p, getSrc, canvas: cv, scale: 1 });
  S.exporting = rd;
  const msg = m => { const x = $('#exMsg'); if (x) x.textContent = m; };
  const bar = f => { const x = $('#exBar'); if (x) x.style.width = Math.round(f * 100) + '%'; };
  let wake = null; try { wake = await navigator.wakeLock.request('screen'); } catch (e) {}
  try {
    await rd.prepare((f, l) => { bar(f * 0.05); msg(l || 'Preparando'); });
    let res;
    const sup = await Renderer.preciseSupport(rd.W, rd.H, p.fmt.fps);
    if (sup) {
      res = await rd.exportPrecise({ onProgress: (f, x) => { bar(0.05 + f * 0.9); msg(`Quadro ${x.frame} de ${x.frames} · falta ~${fmtDur(Math.max(1, Math.round(x.etaSec)))}`); } });
    } else {
      msg('Gravando em tempo real (este navegador não tem o modo quadro a quadro). Não troque de aba.');
      res = await rd.export({ onProgress: f => bar(0.05 + f * 0.9) });
    }
    msg('Conferindo o arquivo…'); bar(0.97);
    v.exportCheck = await checkExport(res.blob, p);
    bar(1);
    const ext = res.type.includes('webm') ? 'webm' : 'mp4';
    const name = `corte-${p.fmt.platform}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext}`;
    const url = URL.createObjectURL(res.blob);
    const file = new File([res.blob], name, { type: res.type.split(';')[0] });
    msg(`Pronto: ${(res.blob.size / 1e6).toFixed(1)} MB${res.stats && res.stats.seconds ? ` em ${fmtDur(Math.round(res.stats.seconds))}` : ''}. ${v.exportCheck.ok ? 'Arquivo conferido.' : 'Atenção: ' + v.exportCheck.problems.join(' ')}`);
    const done = $('#exDone');
    done.append(el('div', { class: 'actions', style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px' },
      navigator.canShare && navigator.canShare({ files: [file] }) ? el('button', { class: 'btn primary', onclick: () => navigator.share({ files: [file], title: name }).catch(() => {}) }, 'Salvar / compartilhar') : null,
      el('a', { class: 'btn' + (navigator.canShare ? '' : ' primary'), href: url, download: name }, 'Baixar arquivo')));
    if (ext === 'webm') done.append(el('p', { class: 'fine' }, 'Este navegador gravou em WebM. Instagram e TikTok preferem MP4: no iPhone use o Safari, no computador o Chrome atualizado.'));
    renderQuality();
  } catch (e) {
    console.error(e); msg('Falhou: ' + (e.message || e));
  } finally { rd.dispose(); S.exporting = null; if (wake) wake.release().catch(() => {}); }
}

// ---------------- folhas ----------------
function openSheet(content) { $('#sheetContent').innerHTML = ''; $('#sheetContent').append(content); $('#sheet').hidden = false; galleryAnim(); }
function closeSheet() { $('#sheet').hidden = true; galleryStop(); }
let gAnim = null, gCanvases = [];
function galleryStop() { if (gAnim) cancelAnimationFrame(gAnim); gAnim = null; gCanvases = []; }
function galleryAnim() {
  galleryStop();
  gCanvases = [...document.querySelectorAll('#sheetContent canvas[data-kind]')];
  if (!gCanvases.length) return;
  ensureFonts(Object.keys(FONTS));
  const words = 'Esse é o segredo que ninguém te conta sobre dinheiro'.split(' ').map((w, i) => ({ w, t0: i * 0.38, t1: i * 0.38 + 0.33 }));
  const t0 = performance.now();
  const loop = () => {
    const t = ((performance.now() - t0) / 1000) % 4.4;
    for (const c of gCanvases) {
      const r = c.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue;
      const W = c.width, H = c.height, ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#24324a'); g.addColorStop(0.55, '#6a4a5b'); g.addColorStop(1, '#c47a4a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(240,205,180,.85)'; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.34, W * 0.16, W * 0.21, 0, 0, 7); ctx.fill();
      if (c.dataset.kind === 'cap') { const id = c.dataset.id; drawCaption(ctx, groupWords(markEmphasis(words), id), t, id, { x: W * 0.06, y: H * 0.1, w: W * 0.88, h: H * 0.75 }, H * 0.68, {}); }
      else drawShape(ctx, { shape: c.dataset.id, text: c.dataset.text || 'SIGA PARA MAIS', x: 0.5, y: c.dataset.id === 'arc' ? 0.22 : 0.42, size: 1, start: 0, dur: 99, color: c.dataset.color || '#FFFFFF', accent: '#FFE81F' }, t + 0.5, W, H, null);
    }
    gAnim = requestAnimationFrame(loop);
  };
  gAnim = requestAnimationFrame(loop);
}
function captionGallery() {
  const g = el('div', { class: 'gallery' });
  const curStyle = curV() ? curV().plan.captionStyle : S.ui.caption;
  for (const [id, c] of Object.entries(CAPTION_STYLES)) g.append(el('button', { class: id === curStyle ? 'on' : '', onclick: () => { S.ui.caption = id; renderChips(); if (curV()) quickCaption({ style: id }); closeSheet(); toast(`Legenda: ${c.label}`); } }, el('canvas', { width: '300', height: '400', 'data-kind': 'cap', 'data-id': id }), el('div', { class: 'gl' }, el('b', {}, c.label), el('span', {}, c.desc))));
  openSheet(el('div', {}, el('h3', {}, 'Estilos de legenda'), el('p', { class: 'sub' }, 'Os estilos que mais aparecem em vídeos virais. Toque para usar.'), g));
}
function shapeSheet() {
  let shape = 'circle', color = '#FFFFFF';
  const txt = el('input', { type: 'text', value: 'SIGA PARA MAIS', maxlength: '60' });
  const follow = el('input', { type: 'checkbox' });
  const g = el('div', { class: 'gallery' });
  const sel = () => { [...g.children].forEach(b => b.classList.toggle('on', b.dataset.id === shape)); gCanvases.forEach(c => { c.dataset.text = txt.value || ' '; c.dataset.color = color; }); };
  for (const [id, s] of Object.entries(SHAPES)) g.append(el('button', { 'data-id': id, onclick: () => { shape = id; sel(); } }, el('canvas', { width: '300', height: '400', 'data-kind': 'shape', 'data-id': id }), el('div', { class: 'gl' }, el('b', {}, s.label), el('span', {}, s.desc))));
  txt.addEventListener('input', sel);
  const sw = el('div', { class: 'swatches' }, ...['#FFFFFF', '#FFE81F', '#111111', '#FF2BD6', '#3DFF6E'].map(c => el('button', { style: `background:${c}`, 'aria-label': 'Cor ' + c, onclick: e => { color = c; [...sw.children].forEach(b => b.classList.toggle('on', b === e.currentTarget)); sel(); } })));
  openSheet(el('div', {}, el('h3', {}, 'Texto com forma'), el('p', { class: 'sub' }, 'O tipo de letreiro que os apps não oferecem e os vídeos virais usam.'),
    el('div', { class: 'field' }, el('label', {}, 'Frase'), txt),
    el('div', { class: 'field' }, el('label', {}, 'Cor'), sw),
    el('label', { class: 'field', style: 'flex-direction:row;align-items:center;gap:8px' }, follow, 'Seguir a pessoa (em volta do rosto)'),
    g,
    el('button', { class: 'btn primary wide', onclick: () => { const item = { shape, text: (txt.value || 'SIGA PARA MAIS').trim(), follow: follow.checked, color }; S.ui.shapes.push(item); renderChips(); closeSheet(); if (curV()) { const v = curV(); const s2 = deepClone(v.spec); s2.texts.push(item); S.versions.push({ ...v, id: uid('v'), spec: s2, plan: null, label: 'Texto: ' + SHAPES[shape].label, request: 'Texto com forma' }); withBusy(() => showVersion(S.versions.length - 1)); } } }, 'Adicionar ao vídeo')));
  sel();
}
async function projectsSheet() {
  const list = await store.listProjects();
  const ul = el('ul', { class: 'list-proj' });
  for (const p of list) ul.append(el('li', {}, el('div', {}, el('b', {}, p.name), el('div', { class: 'meta' }, `${new Date(p.updatedAt).toLocaleString('pt-BR')} · ${(p.files || []).length} arquivo(s) · ${(p.versions || []).length} versão(ões)`)),
    el('div', {}, el('button', { class: 'btn small', onclick: () => { closeSheet(); openProject(p.id); } }, 'Abrir'), el('button', { class: 'ghost', onclick: async () => { if (confirm(`Apagar "${p.name}" e os vídeos guardados dele neste aparelho?`)) { await store.deleteProject(p.id); projectsSheet(); } } }, 'Apagar'))));
  const info = await store.storageInfo();
  openSheet(el('div', {}, el('h3', {}, 'Projetos'), el('p', { class: 'sub' }, 'Guardados só neste aparelho.' + (info ? ` Usando ${(info.used / 1e9).toFixed(2)} de ${(info.quota / 1e9).toFixed(0)} GB.` : '')),
    el('button', { class: 'btn primary', onclick: () => { closeSheet(); newProject(); } }, 'Novo projeto'), el('div', { style: 'height:12px' }), list.length ? ul : el('p', { class: 'muted' }, 'Nenhum projeto ainda.')));
}
function settingsSheet() {
  const styles = store.loadStyles();
  const sl = el('ul', { class: 'list-proj' });
  styles.forEach(s => sl.append(el('li', {}, el('div', {}, el('b', {}, s.name), el('div', { class: 'meta' }, `${(s.mix || []).map(m => PRESETS[m.id] ? PRESETS[m.id].label : m.id).join(' + ')} · legenda ${s.caption || 'do estilo'}`)), el('button', { class: 'ghost', onclick: () => { store.saveStyles(store.loadStyles().filter(x => x.name !== s.name)); settingsSheet(); renderChips(); } }, 'Apagar'))));
  openSheet(el('div', {}, el('h3', {}, 'Ajustes'),
    el('div', { class: 'field' }, el('label', {}, 'Meus estilos salvos (diga "salva esse estilo como meu estilo" depois de gostar de um resultado)'), styles.length ? sl : el('p', { class: 'muted' }, 'Nenhum ainda.')),
    el('h3', { style: 'margin-top:18px' }, 'Como funciona e o que ainda não faz'),
    el('ul', { class: 'did' },
      el('li', {}, 'Tudo roda no seu aparelho. Os vídeos não saem dele.'),
      el('li', {}, 'O "diretor" entende pedidos comuns em português e inglês por regras; não é uma IA conversando. Ele sempre mostra o que entendeu.'),
      el('li', {}, 'Legenda: transcrição no aparelho (Whisper) ou roteiro colado. Tradução automática ainda não.'),
      el('li', {}, 'Repetições e erros de fala ainda não são cortados sozinhos; silêncios e pausas, sim.'),
      el('li', {}, 'Rosto é achado por cor de pele e formato; em luz muito colorida pode errar. Dá para trocar o foco desligando "seguir a pessoa".'),
      el('li', {}, 'Música: você escolhe o arquivo ou o som de um vídeo seu. Efeitos sonoros são gerados por código, sem direitos autorais.'))));
}

// ---------------- projeto ----------------
let saveTimer = null;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!S.sources.length && !S.music) return;
    store.saveProject({
      id: S.project.id, name: S.project.name, createdAt: S.project.createdAt,
      files: [...S.sources, ...(S.music && !S.sources.includes(S.music) ? [S.music] : [])].map(s => ({ id: s.id, name: s.name, role: s.role })),
      musicId: S.music ? S.music.id : null,
      versions: S.versions.map(v => ({ id: v.id, label: v.label, spec: v.spec, outIdx: v.outIdx, seed: v.seed, request: v.request, at: v.at })),
      cur: S.cur, transcript: S.transcript, ui: S.ui,
    });
  }, 600);
}
function newProject() {
  if (S.renderer) S.renderer.dispose(); S.renderer = null;
  Object.assign(S, { project: { id: uid('proj'), name: 'Projeto ' + new Date().toLocaleDateString('pt-BR'), createdAt: Date.now() }, sources: [], music: null, musicA: null, items: new Map(), versions: [], cur: -1, transcript: {}, sel: null });
  S.ui.shapes = [];
  $('#secWork').hidden = true; $('#secResult').hidden = true; $('#prompt').value = '';
  renderMedia(); renderMusic(); renderChips();
}
async function openProject(id) {
  const p = await store.getProject(id); if (!p) return;
  newProject();
  S.project = { id: p.id, name: p.name, createdAt: p.createdAt };
  for (const f of p.files || []) {
    const file = await store.getFile(f.id).catch(() => null);
    if (!file) { toast(`O arquivo "${f.name}" não está mais guardado.`); continue; }
    const src = await loadSource(file, { id: f.id, role: f.role }); src.thumb = await thumbOf(src);
    if (f.id === p.musicId) S.music = src;
    if (src.kind === 'video') S.sources.push(src);
  }
  S.transcript = p.transcript || {}; if (p.ui) S.ui = { ...S.ui, ...p.ui };
  S.versions = (p.versions || []).map(v => ({ ...v, plan: null }));
  renderMedia(); renderMusic(); renderChips();
  if (S.versions.length) {
    await withBusy(async () => {
      $('#secWork').hidden = false; stagesInit(footage().map(s => ['a_' + s.id, `Reanalisando "${s.name}"`]));
      await analyzeAll(ev => ev.src && stage('a_' + ev.src.id, 'run', ev.p));
      Object.keys(stageEls).forEach(k => stage(k, 'done'));
      await showVersion(Math.max(0, Math.min(p.cur, S.versions.length - 1)));
      $('#secResult').hidden = false;
    });
  }
  toast(`Projeto "${p.name}" aberto.`);
}

// ---------------- ligações ----------------
function bind() {
  const drop = $('#drop');
  $('#fileIn').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileIn').click(); } });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));
  $('#musicIn').addEventListener('change', e => { addFiles([...e.target.files], { role: 'music' }); e.target.value = ''; });
  $('#btnMusicNone').addEventListener('click', () => { if (S.music) S.music.role = 'footage'; setMusic(null); renderMedia(); });
  $('#musicStart').addEventListener('input', e => { const v = +e.target.value; $('#musicStartLbl').textContent = v < 0 ? 'automático (melhor trecho)' : fmtTime(v); });
  $('#musicStart').addEventListener('change', e => { const v = +e.target.value; const cv = curV(); if (cv) { const s2 = deepClone(cv.spec); s2.music.start = v < 0 ? null : v; S.versions.push({ ...cv, id: uid('v'), spec: s2, plan: null, label: 'Trecho da música', request: 'Trecho da música' }); withBusy(() => showVersion(S.versions.length - 1)); } });
  $('#btnGo').addEventListener('click', () => runEdit($('#prompt').value, false));
  $('#prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runEdit($('#prompt').value, false); });
  $('#btnAdjust').addEventListener('click', () => { const t = $('#adjust').value.trim(); if (!t) return toast('Escreva ou fale o ajuste.'); runEdit(t, true); });
  $('#adjust').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#btnAdjust').click(); } });
  $('#btnUndo').addEventListener('click', undo);
  setupMic($('#btnMic'), $('#prompt')); setupMic($('#btnMic2'), $('#adjust'));
  document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', () => { prefs.voiceLang = b.dataset.lang; store.savePrefs(prefs); document.querySelectorAll('.lang button').forEach(x => x.classList.toggle('on', x === b)); }));
  document.querySelectorAll('.lang button').forEach(x => x.classList.toggle('on', x.dataset.lang === prefs.voiceLang));
  $('#btnPlay').addEventListener('click', togglePlay); $('#bigPlay').addEventListener('click', togglePlay); $('#preview').addEventListener('click', togglePlay);
  $('#scrub').addEventListener('input', e => { const p = curV() && curV().plan; if (p) seekTo(+e.target.value / 1000 * p.duration); });
  $('#btnSafe').addEventListener('click', () => { $('#safeGuide').hidden = !$('#safeGuide').hidden; });
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.tabpane').forEach(p => p.hidden = p.id !== 'tab-' + b.dataset.tab); }));
  $('#btnExport').addEventListener('click', exportCurrent);
  $('#btnCapGallery').addEventListener('click', captionGallery); $('#btnStyles').addEventListener('click', captionGallery);
  $('#btnShapeAdd').addEventListener('click', shapeSheet);
  $('#btnProjects').addEventListener('click', projectsSheet); $('#btnHome').addEventListener('click', projectsSheet);
  $('#btnSettings').addEventListener('click', settingsSheet);
  $('#sheetX').addEventListener('click', closeSheet); $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet' && !S.exporting) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden && !S.exporting) closeSheet(); if (e.key === ' ' && e.target === document.body && curV()) { e.preventDefault(); togglePlay(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.exporting) toast('A exportação pausa se o app ficar em segundo plano. Volte para esta tela.', 5000); });
  window.addEventListener('beforeunload', e => { if (S.exporting) { e.preventDefault(); e.returnValue = ''; } });
}

bind(); renderChips(); renderMedia(); renderMusic(); store.askPersist();
window.__corte = { S, runEdit, addFiles, exportCurrent, showVersion, togglePlay, seekTo, captionGallery, shapeSheet, projectsSheet, openProject };
