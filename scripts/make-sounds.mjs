// Sintetiza os sons de interface em WAV (mono, 16 bits): clique e bipe das luzes.
// Motor, largada e passagens são gravações reais (scripts/make-real-sounds.sh).
// Uso: node scripts/make-sounds.mjs  →  public/audio/*.wav
import { writeFileSync, mkdirSync } from 'node:fs';

const RATE = 44100;
const OUT = 'public/audio';
mkdirSync(OUT, { recursive: true });

function wav(name, samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? 0.7 / peak : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain)) * 32767), 44 + i * 2));
  writeFileSync(`${OUT}/${name}.wav`, buf);
  console.log(name, (buf.length / 1024).toFixed(0) + 'KB');
}

// Ruído determinístico (o build sai sempre igual).
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// Clique curto.
{
  const len = Math.round(RATE * 0.05);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    out[i] = (Math.sin(2 * Math.PI * 2300 * t) * 0.8 + rand() * 0.25) * Math.exp(-t * 140);
  }
  wav('click', out);
}

// Bipe das luzes de largada.
{
  const len = Math.round(RATE * 0.22);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const env = Math.min(1, t * 400) * Math.exp(-t * 9);
    out[i] = (Math.sin(2 * Math.PI * 880 * t) + 0.3 * Math.sin(2 * Math.PI * 1760 * t)) * env;
  }
  wav('beep', out);
}
