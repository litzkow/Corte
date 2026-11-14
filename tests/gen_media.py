"""Gera vídeos de teste com verdade conhecida (silêncios, cenas, batidas).
Saída em /home/claude/media: talk.mp4, broll.mp4, music.wav, truth.json
"""
import json, subprocess, math
import numpy as np

OUT = "/home/claude/media"
SR = 48000
rng = np.random.default_rng(7)


def ffmpeg_from_frames(path, w, h, fps, frames_iter, audio_path, label):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
           "-i", audio_path,
           "-vf", f"drawtext=fontfile=/usr/share/fonts/opentype/inter/Inter-Bold.otf:text='{label} %{{pts\\:hms}}':x=20:y=20:fontsize={h//22}:fontcolor=white:box=1:boxcolor=black@0.5",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-g", "60",
           "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in frames_iter:
        p.stdin.write(f.tobytes())
    p.stdin.close()
    p.wait()
    assert p.returncode == 0, path


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype(np.int16)
    if pcm.ndim == 1:
        pcm = np.stack([pcm, pcm], 1)
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ---------------- TALK: fala sintética com pausas conhecidas ----------------
def voice(dur, f0=118):
    t = np.arange(int(dur * SR)) / SR
    # vibrato e entonação
    f = f0 * (1 + 0.08 * np.sin(2 * np.pi * 0.7 * t) + 0.02 * np.sin(2 * np.pi * 5 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    src = sum((1 / k) * np.sin(k * ph) for k in range(1, 25))
    # envelope de sílabas ~4.5 Hz com variação
    syl = np.clip(np.sin(2 * np.pi * 4.3 * t + 0.6 * np.sin(2 * np.pi * 0.9 * t)), 0, 1) ** 0.6
    env = 0.25 + 0.75 * syl
    fade = np.minimum(1, np.minimum(t / 0.04, (dur - t) / 0.04))
    return 0.22 * src / 3.5 * env * fade


talk_plan = [  # (tipo, duração)
    ("s", 3.2), ("p", 0.25), ("s", 2.6), ("p", 1.9), ("s", 4.0), ("p", 0.35),
    ("s", 2.2), ("p", 3.5), ("s", 3.0), ("p", 0.6), ("s", 5.0), ("p", 2.4),
    ("s", 2.8), ("p", 0.3), ("s", 3.6), ("p", 1.2),
]
segs = []
audio = []
t0 = 0.0
for kind, d in talk_plan:
    if kind == "s":
        audio.append(voice(d, 110 + rng.uniform(0, 25)))
        segs.append({"start": round(t0, 3), "end": round(t0 + d, 3), "type": "speech"})
    else:
        audio.append(np.zeros(int(d * SR)))
        segs.append({"start": round(t0, 3), "end": round(t0 + d, 3), "type": "pause"})
    t0 += d
talk_dur = t0
a = np.concatenate(audio)
a += rng.normal(0, 0.0015, a.size)  # ruído de sala
write_wav(f"{OUT}/talk_audio.wav", a)
speech_env = np.zeros(int(math.ceil(talk_dur * 30)) + 2)
for s in segs:
    if s["type"] == "speech":
        speech_env[int(s["start"] * 30):int(s["end"] * 30)] = 1

W, H, FPS = 1280, 720, 30
yy, xx = np.mgrid[0:H, 0:W]
bg = np.zeros((H, W, 3), np.float32)
bg[..., 0] = 40 + 30 * (xx / W)
bg[..., 1] = 48 + 20 * (yy / H)
bg[..., 2] = 62 + 40 * (1 - xx / W)
# estante ao fundo
for i in range(6):
    x0 = 80 + i * 70
    bg[200:520, x0:x0 + 40] = [90 + 20 * i, 60, 40]


def talk_frames():
    n = int(talk_dur * FPS)
    for i in range(n):
        t = i / FPS
        img = bg.copy()
        cx = int(W * 0.68 + 18 * math.sin(t * 0.8))
        cy = int(H * 0.46 + 6 * math.sin(t * 1.3))
        # ombros
        m = ((xx - cx) / 230) ** 2 + ((yy - (cy + 300)) / 170) ** 2 < 1
        img[m] = [30, 60, 110]
        # rosto
        m = ((xx - cx) / 95) ** 2 + ((yy - cy) / 125) ** 2 < 1
        img[m] = [224, 172, 140]
        # cabelo
        m = (((xx - cx) / 100) ** 2 + ((yy - (cy - 60)) / 80) ** 2 < 1) & (yy < cy - 50)
        img[m] = [50, 35, 25]
        # olhos
        for ex in (-35, 35):
            m = ((xx - (cx + ex)) / 10) ** 2 + ((yy - (cy - 15)) / 7) ** 2 < 1
            img[m] = [30, 30, 30]
        # boca abre quando fala
        talking = speech_env[min(i, speech_env.size - 1)]
        open_ = 4 + talking * 14 * abs(math.sin(t * 2 * math.pi * 4.3))
        m = ((xx - cx) / 32) ** 2 + ((yy - (cy + 55)) / max(open_, 2)) ** 2 < 1
        img[m] = [110, 30, 40]
        yield np.clip(img, 0, 255).astype(np.uint8)


ffmpeg_from_frames(f"{OUT}/talk.mp4", W, H, FPS, talk_frames(), f"{OUT}/talk_audio.wav", "TALK")

# ---------------- BROLL: 6 cenas com características conhecidas ----------------
W2, H2 = 1280, 720
yy2, xx2 = np.mgrid[0:H2, 0:W2]
SC = 5.0
scenes = ["sunset", "pan", "ball", "dark", "shaky", "bright", "black"]
scene_d = {"black": 1.5}
broll_dur = sum(scene_d.get(s, SC) for s in scenes)


def broll_frames():
    t_acc = 0
    for s in scenes:
        d = scene_d.get(s, SC)
        n = int(d * FPS)
        for i in range(n):
            t = i / FPS
            img = np.zeros((H2, W2, 3), np.float32)
            if s == "sunset":
                img[..., 0] = 255 - 120 * yy2 / H2
                img[..., 1] = 140 - 90 * yy2 / H2
                img[..., 2] = 60 + 80 * yy2 / H2
                sy = H2 * 0.55 + t * 18
                m = ((xx2 - W2 * 0.5) ** 2 + (yy2 - sy) ** 2) < 70 ** 2
                img[m] = [255, 235, 160]
                img[yy2 > H2 * 0.7] = [20, 25, 50]
            elif s == "pan":
                off = int(t * 220)
                img[...] = [70, 90, 120]
                for k in range(30):
                    bx = (k * 97 - off) % (W2 + 200) - 100
                    bh = 150 + (k * 53) % 300
                    img[H2 - bh:H2, max(0, bx):max(0, min(W2, bx + 70))] = [30 + k * 3, 30, 50]
            elif s == "ball":
                img[...] = [40, 120, 50]
                bx = W2 * 0.5 + 420 * math.sin(t * 5.1)
                by = H2 * 0.75 - abs(380 * math.sin(t * 6.3))
                m = ((xx2 - bx) ** 2 + (yy2 - by) ** 2) < 45 ** 2
                img[m] = [250, 250, 250]
            elif s == "dark":
                img[...] = [12, 12, 16]
                m = ((xx2 - W2 * 0.3 - t * 30) ** 2 + (yy2 - H2 * 0.5) ** 2) < 120 ** 2
                img[m] = [35, 30, 28]
            elif s == "shaky":
                jx, jy = rng.integers(-28, 28, 2)
                img[...] = [120, 110, 90]
                img[max(0, 200 + jy):max(0, 520 + jy), max(0, 400 + jx):max(0, 880 + jx)] = [60, 40, 30]
            elif s == "bright":
                img[...] = [250, 250, 245]
                img[300:420, 500 + int(t * 40):700 + int(t * 40)] = [255, 255, 255]
            elif s == "black":
                pass
            yield np.clip(img, 0, 255).astype(np.uint8)
        t_acc += d


bnoise = rng.normal(0, 0.02, int(broll_dur * SR))
# impactos fortes em pontos conhecidos (bola quica)
impacts = [12.1, 13.4, 14.2]
for it in impacts:
    i0 = int(it * SR)
    k = np.arange(int(0.25 * SR))
    bnoise[i0:i0 + k.size] += 0.7 * np.exp(-k / (0.03 * SR)) * np.sin(2 * np.pi * 70 * k / SR)
write_wav(f"{OUT}/broll_audio.wav", bnoise)
ffmpeg_from_frames(f"{OUT}/broll.mp4", W2, H2, FPS, broll_frames(), f"{OUT}/broll_audio.wav", "BROLL")

# ---------------- MÚSICA 128 BPM ----------------
BPM = 128
mdur = 60.0
n = int(mdur * SR)
t = np.arange(n) / SR
mus = np.zeros(n)
beat = 60 / BPM
for b in range(int(mdur / beat)):
    i0 = int(b * beat * SR)
    k = np.arange(int(0.35 * SR))
    kk = k[: max(0, min(k.size, n - i0))]
    f = 55 + 90 * np.exp(-kk / (0.02 * SR))
    mus[i0:i0 + kk.size] += 0.8 * np.exp(-kk / (0.09 * SR)) * np.sin(2 * np.pi * np.cumsum(f) / SR)
    # chimbal no contratempo
    j0 = int((b + 0.5) * beat * SR)
    kh = np.arange(int(0.05 * SR))
    kh = kh[: max(0, min(kh.size, n - j0))]
    mus[j0:j0 + kh.size] += 0.15 * rng.normal(0, 1, kh.size) * np.exp(-kh / (0.01 * SR))
# acordes
chords = [220, 174.6, 261.6, 196]
for ci in range(int(mdur / (beat * 4))):
    i0 = int(ci * beat * 4 * SR); i1 = min(n, int((ci + 1) * beat * 4 * SR))
    f = chords[ci % 4]
    tt = t[i0:i1] - t[i0]
    mus[i0:i1] += 0.06 * (np.sin(2 * np.pi * f * tt) + np.sin(2 * np.pi * f * 1.26 * tt) + np.sin(2 * np.pi * f * 1.5 * tt))
mus *= 0.6
write_wav(f"{OUT}/music.wav", mus)

truth = {
    "talk": {"duration": talk_dur, "segments": segs, "subject_x": 0.68},
    "broll": {"duration": broll_dur, "scenes": [
        {"name": s, "start": round(sum(scene_d.get(x, SC) for x in scenes[:i]), 3)} for i, s in enumerate(scenes)],
        "impacts": impacts},
    "music": {"bpm": BPM, "duration": mdur},
}
json.dump(truth, open(f"{OUT}/truth.json", "w"), indent=1)
print(json.dumps(truth)[:400])
