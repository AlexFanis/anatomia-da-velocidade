import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  NoiseEffect,
  ChromaticAberrationEffect,
  BlendFunction,
} from 'postprocessing';
import { RevealEffect } from './effects/reveal.js';
import { RadialBlurEffect } from './effects/radial-blur.js';
import { HeatEffect } from './effects/heat.js';

export const isMobile = matchMedia('(max-width: 720px), (pointer: coarse)').matches;
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Paleta tirada da pintura do carro: azul-meia-noite, vermelho e amarelo.
export const THEME = {
  night: new THREE.Color('#070b1c'),
  horizon: new THREE.Color('#0a0f26'),
  zenith: new THREE.Color('#020308'),
  red: new THREE.Color('#d7102f'),
  yellow: new THREE.Color('#ffc21a'),
};

export function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

// Estúdio fotográfico montado em código: sala escura com softboxes.
// Vira o environment map, que desenha os reflexos em faixa na pintura.
// (A sala é escura de propósito: o fundo branco é só o que a câmera vê.)
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x0c0c0e);

  const panel = (w, h, intensity, color, pos, lookAt) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(...pos);
    mesh.lookAt(...lookAt);
    env.add(mesh);
  };

  // Faixa longa no teto: o reflexo principal ao longo da carroceria.
  panel(1.2, 14, 6, 0xffffff, [0, 6, 0], [0, 0, 0]);
  panel(0.5, 14, 3, 0xffffff, [-2.4, 5.5, 0], [0, 0, 0]);
  panel(0.5, 14, 3, 0xffffff, [2.4, 5.5, 0], [0, 0, 0]);
  // Recortes laterais: um frio, um vermelho (cores da pintura).
  panel(8, 1.4, 2.4, 0xc8d6ff, [-7, 1.6, -2], [0, 1, 0]);
  panel(8, 1.4, 2.4, 0xff3040, [7, 1.6, 2], [0, 1, 0]);
  panel(10, 3, 3, 0xffffff, [0, 2.5, -9], [0, 1, 0]);
  panel(6, 2, 1, 0xffffff, [0, 2, 9], [0, 1, 0]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  env.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return rt.texture;
}

export function createStage(canvas) {
  const dpr = Math.min(window.devicePixelRatio, isMobile ? 1.25 : 1.5);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Sombra só é recalculada quando algo se mexe (ver main.js).
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  // O fundo é uma cúpula com degradê (world.js); isto só aparece se ela falhar.
  scene.background = THEME.night.clone();
  scene.environment = studioEnvironment(renderer);

  const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.1, 120);

  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: isMobile ? 0 : 4,
  });
  composer.addPass(new RenderPass(scene, camera));

  const heat = new HeatEffect();
  const bloom = new BloomEffect({
    mipmapBlur: true,
    luminanceThreshold: 0.85,
    luminanceSmoothing: 0.15,
    intensity: 1.1,
    radius: 0.7,
  });
  const radialBlur = new RadialBlurEffect();
  const chroma = new ChromaticAberrationEffect({
    offset: new THREE.Vector2(0, 0),
    radialModulation: true,
    modulationOffset: 0.25,
  });
  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.55 });
  const grain = new NoiseEffect({ premultiply: false, blendFunction: BlendFunction.OVERLAY });
  grain.blendMode.opacity.value = 0.12;
  const reveal = new RevealEffect({ cover: THEME.night.clone(), edge: new THREE.Color(2.2, 0.25, 0.3) });

  // Efeitos que amostram vizinhos (convolução) precisam de passes separados.
  if (!isMobile && !reducedMotion) composer.addPass(new EffectPass(camera, heat));
  composer.addPass(new EffectPass(camera, bloom, radialBlur));
  composer.addPass(new EffectPass(camera, chroma, toneMapping, vignette, grain, reveal));

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h, false);
  };
  window.addEventListener('resize', resize);

  // Resolução adaptativa: se a média ficar abaixo de ~55 fps, desce um degrau.
  const steps = [dpr, 1.25, 1].filter((v, i, arr) => v <= dpr && arr.indexOf(v) === i);
  let step = 0;
  let frames = 0;
  let elapsed = 0;
  const governor = (dt) => {
    frames++;
    elapsed += dt;
    if (elapsed < 2) return;
    const fps = frames / elapsed;
    frames = 0;
    elapsed = 0;
    if (fps < 55 && step < steps.length - 1) {
      step++;
      renderer.setPixelRatio(steps[step]);
      resize();
    }
  };

  return {
    renderer,
    governor,
    scene,
    camera,
    composer,
    effects: { heat, bloom, radialBlur, chroma, vignette, grain, reveal },
  };
}
