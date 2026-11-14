// Gravador de arquivo MP4 (H.264 + AAC ou Opus), com o índice no começo (abre rápido em qualquer lugar).
// Recebe os pedaços já codificados pelo WebCodecs e monta o arquivo.

const enc = new TextEncoder();
function u8(...a) { return Uint8Array.from(a); }
function u16(v) { return u8((v >> 8) & 255, v & 255); }
function u32(v) { return u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); }
function i32(v) { return u32(v >>> 0); }
function str(s) { return enc.encode(s); }
function cat(parts) { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; }
function box(type, ...parts) { const body = cat(parts.flat()); return cat([u32(body.length + 8), str(type), body]); }
function full(type, ver, flags, ...parts) { return box(type, u8(ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...parts); }
const MATRIX = cat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);

function sttsOf(durs) {
  const runs = [];
  for (const d of durs) { const l = runs[runs.length - 1]; if (l && l[1] === d) l[0]++; else runs.push([1, d]); }
  return full('stts', 0, 0, u32(runs.length), ...runs.map(([c, d]) => cat([u32(c), u32(d)])));
}

function esds(asc, bitrate) {
  // descritores MPEG-4 (tamanho em 1 byte basta aqui)
  const dsi = cat([u8(0x05, asc.length), asc]);
  const dcd = cat([u8(0x04, 13 + dsi.length, 0x40, 0x15, 0, 0, 0), u32(bitrate), u32(bitrate), dsi]);
  const sl = u8(0x06, 1, 2);
  const es = cat([u8(0x03, 3 + dcd.length + sl.length), u16(1), u8(0), dcd, sl]);
  return full('esds', 0, 0, es);
}

export class Mp4Muxer {
  constructor({ width, height, fps, audio }) {
    this.w = width; this.h = height; this.fps = fps;
    this.vts = 90000; this.v = []; this.vDesc = null;
    this.a = []; this.aDesc = null; this.audio = audio; // { codec:'aac'|'opus', sampleRate, channels }
  }
  addVideo(chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description && !this.vDesc) this.vDesc = new Uint8Array(meta.decoderConfig.description instanceof ArrayBuffer ? meta.decoderConfig.description : meta.decoderConfig.description.buffer.slice(meta.decoderConfig.description.byteOffset, meta.decoderConfig.description.byteOffset + meta.decoderConfig.description.byteLength));
    const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
    this.v.push({ data, ts: chunk.timestamp, dur: chunk.duration, key: chunk.type === 'key' });
  }
  addAudio(chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description && !this.aDesc) { const d = meta.decoderConfig.description; this.aDesc = new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)); }
    const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
    this.a.push({ data, ts: chunk.timestamp, dur: chunk.duration });
  }
  finalize() {
    if (!this.v.length) throw new Error('nenhum quadro de vídeo codificado');
    if (!this.vDesc) throw new Error('codificador não informou a configuração H.264 (avcC)');
    // vídeo: tempos de decodificação regulares; composição = timestamp real
    const vts = this.vts, fd = Math.round(vts / this.fps);
    const vDur = this.v.map(() => fd);
    const vCts = this.v.map((s, i) => Math.round(s.ts * vts / 1e6) - i * fd);
    const needCtts = vCts.some(x => x !== 0);
    const vDuration = this.v.length * fd;
    const hasA = this.a.length > 0;
    const asr = hasA ? this.audio.sampleRate : 0;
    const aDur = this.a.map(s => Math.max(1, Math.round((s.dur || (this.audio.codec === 'opus' ? 20000 : 1024 * 1e6 / asr)) * asr / 1e6)));
    const aDuration = aDur.reduce((x, y) => x + y, 0);
    // ordem no mdat: intercala por tempo
    const order = [];
    let i = 0, j = 0;
    while (i < this.v.length || j < this.a.length) {
      const tv = i < this.v.length ? i * fd / vts : Infinity, ta = j < this.a.length ? this.a[j].ts / 1e6 : Infinity;
      if (tv <= ta) order.push(['v', i++]); else order.push(['a', j++]);
    }
    const build = (mdatStart) => {
      const vOff = [], aOff = []; let off = mdatStart + 8;
      for (const [k, idx] of order) { const s = k === 'v' ? this.v[idx] : this.a[idx]; (k === 'v' ? vOff : aOff)[idx] = off; off += s.data.length; }
      const movieDur = Math.round(Math.max(vDuration / vts, hasA ? aDuration / asr : 0) * 1000);
      const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(movieDur), u32(0x00010000), u16(0x0100), u8(0, 0), u32(0), u32(0), MATRIX, u32(0), u32(0), u32(0), u32(0), u32(0), u32(0), u32(hasA ? 3 : 2));
      const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
      // --- trilha de vídeo ---
      const avc1 = box('avc1', u8(0, 0, 0, 0, 0, 0), u16(1), u16(0), u16(0), u32(0), u32(0), u32(0), u16(this.w), u16(this.h), u32(0x00480000), u32(0x00480000), u32(0), u16(1), new Uint8Array(32), u16(0x18), u16(0xffff), box('avcC', this.vDesc));
      const vStbl = box('stbl',
        full('stsd', 0, 0, u32(1), avc1),
        sttsOf(vDur),
        ...(needCtts ? [full('ctts', 1, 0, u32(this.v.length), ...vCts.map(c => cat([u32(1), i32(c)])))] : []),
        full('stss', 0, 0, u32(this.v.filter(s => s.key).length), ...this.v.map((s, k) => s.key ? u32(k + 1) : null).filter(Boolean)),
        full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
        full('stsz', 0, 0, u32(0), u32(this.v.length), ...this.v.map(s => u32(s.data.length))),
        full('stco', 0, 0, u32(this.v.length), ...vOff.map(o => u32(o))));
      const vTrak = box('trak',
        full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(Math.round(vDuration / vts * 1000)), u32(0), u32(0), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(this.w << 16), u32(this.h << 16)),
        box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(vts), u32(vDuration), u16(0x55c4), u16(0)),
          full('hdlr', 0, 0, u32(0), str('vide'), u32(0), u32(0), u32(0), str('Corte video\0')),
          box('minf', full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)), dinf, vStbl)));
      let aTrak = [];
      if (hasA) {
        const ch = this.audio.channels;
        let entry;
        if (this.audio.codec === 'opus') {
          const dOps = box('dOps', u8(0), u8(ch), u16(312), u32(this.audio.sampleRate), u16(0), u8(0));
          entry = box('Opus', u8(0, 0, 0, 0, 0, 0), u16(1), u32(0), u32(0), u16(ch), u16(16), u16(0), u16(0), u32(48000 << 16), dOps);
        } else {
          let asc = this.aDesc;
          if (!asc) { const fi = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000].indexOf(asr); asc = u8((2 << 3) | (fi >> 1), ((fi & 1) << 7) | (ch << 3)); }
          entry = box('mp4a', u8(0, 0, 0, 0, 0, 0), u16(1), u32(0), u32(0), u16(ch), u16(16), u16(0), u16(0), u32(asr << 16), esds(asc, 192000));
        }
        const aStbl = box('stbl', full('stsd', 0, 0, u32(1), entry), sttsOf(aDur),
          full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
          full('stsz', 0, 0, u32(0), u32(this.a.length), ...this.a.map(s => u32(s.data.length))),
          full('stco', 0, 0, u32(this.a.length), ...aOff.map(o => u32(o))));
        aTrak = [box('trak',
          full('tkhd', 0, 3, u32(0), u32(0), u32(2), u32(0), u32(Math.round(aDuration / asr * 1000)), u32(0), u32(0), u16(0), u16(1), u16(0x0100), u16(0), MATRIX, u32(0), u32(0)),
          box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(asr), u32(aDuration), u16(0x55c4), u16(0)),
            full('hdlr', 0, 0, u32(0), str('soun'), u32(0), u32(0), u32(0), str('Corte audio\0')),
            box('minf', full('smhd', 0, 0, u16(0), u16(0)), dinf, aStbl)))];
      }
      return box('moov', mvhd, vTrak, ...aTrak);
    };
    const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
    let moov = build(0);
    moov = build(ftyp.length + moov.length);
    const mdatLen = order.reduce((s, [k, idx]) => s + (k === 'v' ? this.v[idx] : this.a[idx]).data.length, 0);
    const parts = [ftyp, moov, cat([u32(mdatLen + 8), str('mdat')])];
    for (const [k, idx] of order) parts.push((k === 'v' ? this.v[idx] : this.a[idx]).data);
    return new Blob(parts, { type: 'video/mp4' });
  }
}
