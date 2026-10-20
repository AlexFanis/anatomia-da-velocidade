import { Howl, Howler } from 'howler';

const url = (name) => `${import.meta.env.BASE_URL}audio/${name}`;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Sons reais de F1 (gravações CC0, ver scripts/make-real-sounds.sh) + bipe e clique sintéticos.
// Começa desligado; os arquivos só carregam no primeiro "ligar"
// (o navegador exige um gesto do usuário para tocar áudio).
export function createAudio() {
  let sounds = null;
  let ids = {};
  let enabled = false;
  // Enquanto a largada real toca, os loops do motor abaixam para não embolar.
  let duckUntil = 0;
  const level = { idle: 0, high: 0, track: 0, rateIdle: 1, rateHigh: 0.85 };

  function load() {
    sounds = {
      idle: new Howl({ src: [url('engine-idle.wav')], loop: true, volume: 0 }),
      high: new Howl({ src: [url('engine-high.wav')], loop: true, volume: 0 }),
      track: new Howl({ src: [url('trackside.wav')], loop: true, volume: 0 }),
      launch: new Howl({ src: [url('launch.mp3')], volume: 0.8 }),
      passby: new Howl({ src: [url('passby.mp3')], volume: 0.45 }),
      click: new Howl({ src: [url('click.wav')], volume: 0.25 }),
      beep: new Howl({ src: [url('beep.wav')], volume: 0.4 }),
    };
    ids = { idle: sounds.idle.play(), high: sounds.high.play(), track: sounds.track.play() };
  }

  return {
    get enabled() {
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      if (enabled && !sounds) load();
      Howler.mute(!enabled);
      return enabled;
    },
    play(name, opts = {}) {
      if (!enabled || !sounds?.[name]) return;
      const id = sounds[name].play();
      // Passagens com tom levemente diferente a cada vez, para não soar repetido.
      const rate = opts.rate ?? (name === 'passby' ? 0.9 + Math.random() * 0.25 : 1);
      sounds[name].rate(rate, id);
      if (name === 'launch') duckUntil = performance.now() + 7000;
    },
    // speed: 0–1 (velocidade da cena); scroll: velocidade da rolagem em px/quadro.
    update(speed, scroll) {
      if (!enabled || !sounds) return;
      const rev = clamp01(Math.abs(scroll) / 50);
      // Mistura lenta → giro alto conforme a cena acelera ou a rolagem fica rápida.
      const mix = clamp01(Math.max(speed * 1.15, rev * 0.85));
      const duck = performance.now() < duckUntil ? 0.15 : 1;
      const targets = {
        idle: (1 - mix) * 0.35 * duck,
        high: mix * 0.65 * duck,
        track: speed * 0.4,
        rateIdle: 0.92 + rev * 0.3,
        rateHigh: 0.82 + speed * 0.38 + rev * 0.12,
      };
      for (const k of Object.keys(targets)) level[k] += (targets[k] - level[k]) * 0.08;
      sounds.idle.volume(level.idle, ids.idle);
      sounds.high.volume(level.high, ids.high);
      sounds.track.volume(level.track, ids.track);
      sounds.idle.rate(level.rateIdle, ids.idle);
      sounds.high.rate(level.rateHigh, ids.high);
    },
  };
}
