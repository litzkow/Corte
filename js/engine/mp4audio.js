// Tira só a trilha de som (AAC) de um MP4/MOV sem carregar o vídeo inteiro na memória.
// Lê o índice do arquivo (moov) e depois só os pedaços de áudio, montando um fluxo ADTS pequeno
// que o navegador decodifica. Um vídeo de celular de 400 MB vira uns 2 a 4 MB de som.
// Se qualquer coisa não bater (outro formato, outro codec), devolve null e quem chamou usa o caminho antigo.

const rd = async (file, a, n) => new DataView(await file.slice(a, a + n).arrayBuffer());
const type4 = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));

// caixas de primeiro nível: só lê os cabeçalhos (8 ou 16 bytes cada)
async function topBoxes(file) {
  const out = []; let o = 0;
  while (o + 8 <= file.size && out.length < 64) {
    const h = await rd(file, o, 16);
    let size = h.getUint32(0), hdr = 8; const t = type4(h, 4);
    if (size === 1) { size = Number(h.getBigUint64(8)); hdr = 16; } else if (size === 0) size = file.size - o;
    if (size < hdr) break;
    out.push({ t, o, size, hdr }); o += size;
  }
  return out;
}
function kids(dv, a, b) {
  const out = []; let o = a;
  while (o + 8 <= b) {
    let size = dv.getUint32(o), hdr = 8; const t = type4(dv, o + 4);
    if (size === 1) { size = Number(dv.getBigUint64(o + 8)); hdr = 16; } else if (size === 0) size = b - o;
    if (size < hdr || o + size > b) break;
    out.push({ t, o, size, hdr, a: o + hdr, b: o + size }); o += size;
  }
  return out;
}
const find = (dv, box, t) => kids(dv, box.a, box.b).find(k => k.t === t);

// descritor MPEG-4 (esds): tamanho em 1 a 4 bytes de 7 bits
function descLen(dv, o) { let n = 0, i = 0, b; do { b = dv.getUint8(o + i); n = (n << 7) | (b & 0x7f); i++; } while (b & 0x80 && i < 4); return [n, i]; }
function audioSpecificConfig(dv, esds) {
  let o = esds.a + 4; // versão+flags
  const end = esds.b;
  while (o < end) {
    const tag = dv.getUint8(o); const [len, nl] = descLen(dv, o + 1); const body = o + 1 + nl;
    if (tag === 0x03) { o = body + 3; const flags = dv.getUint8(body + 2); if (flags & 0x80) o += 2; if (flags & 0x40) o += 1 + dv.getUint8(o); if (flags & 0x20) o += 2; continue; }
    if (tag === 0x04) { if (dv.getUint8(body) !== 0x40) return null; o = body + 13; continue; } // 0x40 = AAC
    if (tag === 0x05) { const b0 = dv.getUint8(body), b1 = dv.getUint8(body + 1); return { aot: b0 >> 3, sfi: ((b0 & 7) << 1) | (b1 >> 7), ch: (b1 >> 3) & 15 }; }
    o = body + len;
  }
  return null;
}

export async function extractAacAdts(file) {
  if (!file || typeof file.slice !== 'function') return null;
  const tops = await topBoxes(file);
  const mv = tops.find(b => b.t === 'moov'); if (!mv || mv.size > 64e6) return null;
  const dv = await rd(file, mv.o, mv.size);
  const moov = { a: mv.hdr, b: mv.size };
  for (const trak of kids(dv, moov.a, moov.b).filter(k => k.t === 'trak')) {
    const mdia = find(dv, trak, 'mdia'); if (!mdia) continue;
    const hdlr = find(dv, mdia, 'hdlr'); if (!hdlr || type4(dv, hdlr.a + 8) !== 'soun') continue;
    const mdhd = find(dv, mdia, 'mdhd'); const ver = dv.getUint8(mdhd.a);
    const timescale = dv.getUint32(mdhd.a + (ver === 1 ? 20 : 12));
    const minf = find(dv, mdia, 'minf'), stbl = minf && find(dv, minf, 'stbl'); if (!stbl) return null;
    const stsd = find(dv, stbl, 'stsd'); const entry = { a: stsd.a + 8, b: stsd.b };
    const mp4a = kids(dv, entry.a, entry.b)[0]; if (!mp4a || mp4a.t !== 'mp4a') return null;
    const sver = dv.getUint16(mp4a.a + 8);   // versão do SoundDescription (MOV pode ter 1 ou 2)
    const skip = 28 + (sver === 1 ? 16 : sver === 2 ? 36 : 0);
    const inner = kids(dv, mp4a.a + skip, mp4a.b), wave = inner.find(k => k.t === 'wave');
    const esdsBox = inner.find(k => k.t === 'esds') || (wave && kids(dv, wave.a, wave.b).find(k => k.t === 'esds'));
    if (!esdsBox) return null;
    const asc = audioSpecificConfig(dv, esdsBox); if (!asc || asc.aot < 1 || asc.aot > 4 || asc.sfi > 12 || asc.ch < 1 || asc.ch > 7) return null;
    // tamanhos, pedaços e onde cada pedaço começa
    const stsz = find(dv, stbl, 'stsz'); const fixed = dv.getUint32(stsz.a + 4), count = dv.getUint32(stsz.a + 8);
    const sizes = new Uint32Array(count); for (let i = 0; i < count; i++) sizes[i] = fixed || dv.getUint32(stsz.a + 12 + i * 4);
    const stsc = find(dv, stbl, 'stsc'); const nsc = dv.getUint32(stsc.a + 4);
    const sc = []; for (let i = 0; i < nsc; i++) sc.push([dv.getUint32(stsc.a + 8 + i * 12), dv.getUint32(stsc.a + 12 + i * 12)]);
    const co = find(dv, stbl, 'stco') || find(dv, stbl, 'co64'); const big = co.t === 'co64'; const nch = dv.getUint32(co.a + 4);
    const offs = []; for (let i = 0; i < nch; i++) offs.push(big ? Number(dv.getBigUint64(co.a + 8 + i * 8)) : dv.getUint32(co.a + 8 + i * 4));
    // atraso inicial (priming do AAC) que o arquivo manda pular
    let skipSamples = 0;
    const edts = find(dv, trak, 'edts'), elst = edts && find(dv, edts, 'elst');
    if (elst) { const ev = dv.getUint8(elst.a); const mt = ev === 1 ? Number(dv.getBigInt64(elst.a + 16)) : dv.getInt32(elst.a + 12); if (mt > 0) skipSamples = mt; }
    // monta o ADTS lendo pedaço por pedaço
    const total = sizes.reduce((a, b) => a + b, 0) + count * 7;
    if (total > 200e6) return null;
    const out = new Uint8Array(total); let w = 0, si = 0;
    const prof = asc.aot - 1;
    // onde está cada pedaço (início, tamanho, quantas amostras)
    const chunks = []; let s0 = 0;
    for (let c = 0; c < nch && s0 < count; c++) {
      let per = sc[0][1]; for (const [first, n] of sc) { if (c + 1 >= first) per = n; else break; }
      let len = 0; for (let k = 0; k < per && s0 + k < count; k++) len += sizes[s0 + k];
      chunks.push({ off: offs[c], len, per }); s0 += per;
    }
    // lê em blocos de até 6 MB (som e imagem vêm intercalados: ler pedaço por pedaço seria lento demais)
    const BLOCK = 6e6;
    for (let i = 0; i < chunks.length;) {
      let j = i, a = chunks[i].off, b = a + chunks[i].len;
      while (j + 1 < chunks.length && chunks[j + 1].off >= a && chunks[j + 1].off + chunks[j + 1].len - a <= BLOCK) { j++; b = Math.max(b, chunks[j].off + chunks[j].len); }
      const buf = new Uint8Array(await file.slice(a, b).arrayBuffer());
      if (buf.length < b - a) return null;
      for (let k = i; k <= j; k++) {
        let p = chunks[k].off - a;
        for (let m = 0; m < chunks[k].per && si < count; m++, si++) {
          const n = sizes[si], fl = n + 7;
          out[w] = 0xff; out[w + 1] = 0xf1; out[w + 2] = (prof << 6) | (asc.sfi << 2) | (asc.ch >> 2);
          out[w + 3] = ((asc.ch & 3) << 6) | (fl >> 11); out[w + 4] = (fl >> 3) & 0xff; out[w + 5] = ((fl & 7) << 5) | 0x1f; out[w + 6] = 0xfc;
          out.set(buf.subarray(p, p + n), w + 7); w += fl; p += n;
        }
      }
      i = j + 1;
    }
    if (si < count) return null;
    return { bytes: out.buffer, skipSeconds: skipSamples / timescale };
  }
  return null;
}
