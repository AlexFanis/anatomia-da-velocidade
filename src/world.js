import * as THREE from 'three';
import { noise2D } from './glsl/noise.js';
import { isMobile, THEME } from './stage.js';

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const worldVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fogFragment = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uSeed;
uniform vec3 uColor;
varying vec3 vWorld;
${noise2D}
void main() {
  vec2 p = vWorld.xz * 0.22 + vec2(uTime * 0.035 + uSeed, uTime * 0.012 - uSeed);
  float n = fbm(p);
  float r = length(vWorld.xz * vec2(0.9, 0.7)) / 10.0;
  float a = smoothstep(0.4, 0.85, n) * (1.0 - smoothstep(0.15, 1.0, r)) * uOpacity;
  gl_FragColor = vec4(uColor, a);
}
`;

// Pista que corre por baixo do carro parado: asfalto, linhas e zebras.
const trackFragment = /* glsl */ `
uniform float uOffset;
uniform float uShow;
uniform float uBlur;
uniform vec3 uRed;
varying vec3 vWorld;
${noise2D}
void main() {
  float x = abs(vWorld.x);
  float z = vWorld.z + uOffset;
  float fade = smoothstep(42.0, 8.0, abs(vWorld.z)) * uShow;

  // Asfalto com granulado esticado pelo movimento.
  float grain = hash12(vec2(floor(vWorld.x * 60.0), floor(z * mix(30.0, 0.6, uBlur))));
  vec3 asphalt = vec3(0.07, 0.07, 0.08) + grain * 0.035;
  float road = 1.0 - smoothstep(3.9, 4.0, x);

  // Zebra vermelha e branca nas bordas.
  float kerbZone = smoothstep(3.9, 3.92, x) * (1.0 - smoothstep(4.55, 4.57, x));
  float stripe = smoothstep(0.5 - uBlur * 0.5, 0.5 + uBlur * 0.5, fract(z / 1.4));
  stripe = mix(stripe, 0.5, uBlur * 0.85);
  vec3 kerb = mix(vec3(0.95), uRed, stripe);

  // Linha branca junto à zebra e tracejado no meio (vira risco contínuo em alta).
  float line = smoothstep(3.6, 3.62, x) * (1.0 - smoothstep(3.72, 3.74, x));
  float dash = (1.0 - smoothstep(0.05, 0.07, abs(vWorld.x - 1.4))) * step(0.55 - uBlur * 0.5, fract(z / 6.0));

  vec3 col = asphalt;
  col = mix(col, vec3(0.92), max(line, dash * 0.8));
  col = mix(col, kerb, kerbZone);
  float a = max(road, kerbZone) * fade;
  gl_FragColor = vec4(col, a);
}
`;

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // Cúpula do fundo: degradê azul-meia-noite com um brilho vermelho atrás do carro.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(90, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uHorizon: { value: THEME.horizon.clone() },
        uZenith: { value: THEME.zenith.clone() },
        uGlow: { value: THEME.red.clone() },
        uGlowAmt: { value: 0 },
        uDark: { value: 0 },
      },
      vertexShader: worldVertex,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        uniform vec3 uGlow;
        uniform float uGlowAmt;
        uniform float uDark;
        varying vec3 vWorld;
        void main() {
          vec3 dir = normalize(vWorld);
          float h = max(dir.y, 0.0);
          vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h));
          // Brilho atrás do carro (−Z), achatado no horizonte.
          vec2 g = vec2(atan(dir.x, -dir.z) * 2.4, (dir.y - 0.02) * 9.0);
          col += uGlow * exp(-dot(g, g) * 1.6) * 0.3 * uGlowAmt;
          // Faixa fria bem sutil do lado oposto.
          col += vec3(0.05, 0.08, 0.2) * exp(-pow(atan(dir.x, dir.z) * 1.4, 2.0)) * (1.0 - smoothstep(0.0, 0.3, h)) * 0.12;
          col *= 1.0 - uDark * 0.75;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  dome.renderOrder = -10;
  group.add(dome);

  // Piso escuro semitransparente: deixa ver o reflexo do carro por baixo e some no
  // horizonte, revelando a cúpula (sem linha dura). Grade técnica fina por cima.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color('#04060f') },
        uLine: { value: new THREE.Color(0.85, 0.88, 1) },
        uOpacity: { value: 0.78 },
        uTravel: { value: 0 },
        uGrid: { value: 0.14 },
      },
      vertexShader: worldVertex,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uLine;
        uniform float uOpacity;
        uniform float uTravel;
        uniform float uGrid;
        varying vec3 vWorld;
        float gridLine(vec2 p, float scale) {
          vec2 q = p / scale;
          vec2 d = abs(fract(q - 0.5) - 0.5) / fwidth(q);
          return 1.0 - min(min(d.x, d.y), 1.0);
        }
        void main() {
          float r = length(vWorld.xz * vec2(1.0, 0.8));
          float fade = 1.0 - smoothstep(5.0, 26.0, r);
          vec2 p = vWorld.xz + vec2(0.0, uTravel);
          float g = max(gridLine(p, 1.0) * 0.5, gridLine(p, 5.0));
          float gFade = (1.0 - smoothstep(2.5, 15.0, r)) * 0.09 * uGrid;
          vec3 col = mix(uColor, uLine, g * gFade * 4.0);
          float a = max(uOpacity * fade, g * gFade);
          gl_FragColor = vec4(col, a);
        }
      `,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = -2;
  group.add(floor);

  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.45 }));
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = 0.002;
  shadowCatcher.receiveShadow = true;
  group.add(shadowCatcher);

  // Sombra de contato macia (oclusão sob o assoalho).
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 7),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(0,0,0,0.85)'], [0.5, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true,
      depthWrite: false,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.006;
  group.add(contact);

  // Reflexo: cópia espelhada do carro sob o piso (o piso semitransparente escurece).
  const mirror = new THREE.Group();
  mirror.scale.y = -1;
  group.add(mirror);
  let mirrorPairs = [];
  let follow = null;
  function addReflection(source, followRoot) {
    follow = followRoot;
    const copy = source.clone(true);
    const a = [];
    const b = [];
    source.traverse((o) => a.push(o));
    copy.traverse((o) => {
      b.push(o);
      if (o.isMesh) o.castShadow = o.receiveShadow = false;
      if (o.isLight) o.intensity = 0;
    });
    mirrorPairs = a.map((o, i) => [o, b[i]]);
    mirror.add(copy);
  }

  // Neblina rasteira branca.
  const fogLayers = [];
  const layerCount = isMobile ? 3 : 5;
  for (let i = 0; i < layerCount; i++) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: worldVertex,
      fragmentShader: fogFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uSeed: { value: i * 3.7 },
        uColor: { value: new THREE.Color(0.16, 0.18, 0.26) },
      },
    });
    const layer = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mat);
    layer.rotation.x = -Math.PI / 2;
    layer.position.y = 0.04 + i * 0.09;
    layer.userData.baseOpacity = 0.2 - i * 0.03;
    group.add(layer);
    fogLayers.push(layer);
  }

  // Pista (seção Velocidade).
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(9.4, 90),
    new THREE.ShaderMaterial({
      vertexShader: worldVertex,
      fragmentShader: trackFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uOffset: { value: 0 },
        uShow: { value: 0 },
        uBlur: { value: 0 },
        uRed: { value: new THREE.Color('#e3143a') },
      },
    }),
  );
  track.rotation.x = -Math.PI / 2;
  track.position.y = 0.003;
  group.add(track);

  // Túnel de luzes: duas fileiras de barras acima do carro.
  const barCount = 16;
  const SPACING = 6;
  const bars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.06, 0.06, 2.6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4) }),
    barCount * 2,
  );
  bars.frustumCulled = false;
  group.add(bars);

  // Riscos de vento: linhas finas passando rente ao carro.
  const streakCount = isMobile ? 40 : 90;
  const streaks = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.012, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    streakCount,
  );
  streaks.frustumCulled = false;
  const streakData = Array.from({ length: streakCount }, () => {
    const side = Math.random() < 0.5 ? -1 : 1;
    return {
      x: side * (1.3 + Math.random() * 5),
      y: 0.05 + Math.random() * 2.6,
      z: Math.random() * 60 - 30,
      len: 2 + Math.random() * 6,
      speed: 0.7 + Math.random() * 0.6,
    };
  });
  group.add(streaks);

  // Luzes: recorte atrás, principal de cima com sombra, chave lateral e ambiente.
  const rimL = new THREE.SpotLight(0xffffff, 0, 10, 0.3, 1, 2);
  rimL.position.set(-4.5, 2.6, -6.5);
  const rimR = new THREE.SpotLight(0xff3b4e, 0, 10, 0.3, 1, 2);
  rimR.position.set(4.5, 2.6, -6.5);
  const top = new THREE.SpotLight(0xffffff, 0, 0, 0.62, 1, 2);
  top.position.set(0.5, 9, 1.5);
  top.castShadow = true;
  top.shadow.mapSize.setScalar(isMobile ? 1024 : 2048);
  top.shadow.bias = -0.0004;
  top.shadow.normalBias = 0.02;
  top.shadow.radius = 8;
  top.shadow.camera.near = 4;
  top.shadow.camera.far = 14;
  const key = new THREE.SpotLight(0xfff4ea, 0, 0, 0.7, 1, 2);
  key.position.set(5, 3.5, 6);
  for (const l of [rimL, rimR, top, key]) {
    l.target.position.set(0, 0.5, 0);
    group.add(l, l.target);
  }
  rimL.target.position.y = rimR.target.position.y = 1.1;
  const hemi = new THREE.HemisphereLight(0x8fa4ff, 0x0a0f24, 0);
  group.add(hemi);

  const targets = { rimL: 160, rimR: 140, top: 35, key: 30, hemi: 0.15, glow: 1 };
  const state = { power: 0, fog: 0, fogScale: 1, speed: 0, travel: 0, glow: 1, dark: 0, grid: 0.1 };

  function applyPower() {
    const p = state.power;
    rimL.intensity = targets.rimL * p;
    rimR.intensity = targets.rimR * p;
    top.intensity = targets.top * p;
    key.intensity = targets.key * p;
    hemi.intensity = targets.hemi * p;
    dome.material.uniforms.uGlowAmt.value = targets.glow * p * state.glow;
  }
  applyPower();

  const m = new THREE.Matrix4();
  const identity = new THREE.Quaternion();
  const standing = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const LOOP = barCount * SPACING;

  return {
    group,
    state,
    applyPower,
    addReflection,
    lights: { rimL, rimR, top, key, hemi },
    update(time, dt) {
      const speed = state.speed;
      if (follow) mirror.rotation.y = follow.rotation.y;
      for (const [src, dst] of mirrorPairs) {
        dst.position.copy(src.position);
        dst.quaternion.copy(src.quaternion);
        dst.scale.copy(src.scale);
      }
      applyPower();
      dome.material.uniforms.uDark.value = state.dark;
      floor.material.uniforms.uTravel.value = state.travel;
      floor.material.uniforms.uGrid.value = state.grid;
      // ~95 m/s a 340 km/h; o mundo anda para trás (−Z).
      state.travel += speed * 95 * dt;

      for (const layer of fogLayers) {
        layer.material.uniforms.uTime.value = time + state.travel * 0.05;
        layer.material.uniforms.uOpacity.value = layer.userData.baseOpacity * state.fog * state.fogScale * (1 - speed * 0.7);
      }

      const tu = track.material.uniforms;
      tu.uOffset.value = state.travel;
      tu.uShow.value = Math.min(1, speed * 4);
      tu.uBlur.value = THREE.MathUtils.smoothstep(speed, 0.25, 0.9);

      // Barras do túnel, recicladas quando passam da câmera.
      const show = THREE.MathUtils.smoothstep(speed, 0.05, 0.4);
      const stretch = 1 + speed * 3;
      for (let i = 0; i < barCount; i++) {
        const z = 30 - ((i * SPACING + state.travel) % LOOP);
        for (let side = 0; side < 2; side++) {
          v.set(side ? 2.6 : -2.6, 3.4, z);
          s.set(show, show, show * stretch);
          m.compose(v, identity, s);
          bars.setMatrixAt(i * 2 + side, m);
        }
      }
      bars.instanceMatrix.needsUpdate = true;

      streaks.material.opacity = 0.75 * THREE.MathUtils.smoothstep(speed, 0.2, 0.7);
      for (let i = 0; i < streakCount; i++) {
        const d = streakData[i];
        const z = ((((d.z - state.travel * d.speed * 1.4 + 30) % 60) + 60) % 60) - 30;
        v.set(d.x, d.y, z);
        s.set(1, d.len * (0.4 + speed), 1);
        m.compose(v, standing, s);
        streaks.setMatrixAt(i, m);
      }
      streaks.instanceMatrix.needsUpdate = true;
    },
  };
}
