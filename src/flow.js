import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isMobile } from './stage.js';

// Silhueta aproximada do carro (altura do topo em função de z), usada para
// as linhas de ar contornarem o bico, o cockpit, a tampa do motor e a asa.
const PROFILE = [
  [3.4, 0], [2.9, 0.3], [2.3, 0.42], [1.6, 0.58], [0.7, 0.78], [0.25, 1.05],
  [-0.4, 1.14], [-1.1, 0.96], [-2.0, 0.78], [-2.35, 1.02], [-2.95, 1.06], [-3.2, 0],
];

function profile(z) {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [z0, h0] = PROFILE[i];
    const [z1, h1] = PROFILE[i + 1];
    if (z <= z0 && z >= z1) return h0 + ((z - z0) / (z1 - z0)) * (h1 - h0);
  }
  return 0;
}

const bump = (v, a, b, soft) => THREE.MathUtils.smoothstep(v, a - soft, a) * (1 - THREE.MathUtils.smoothstep(v, b, b + soft));

// Altura do obstáculo em (x, z).
function height(x, z) {
  const ax = Math.abs(x);
  let h = profile(z) * (1 - THREE.MathUtils.smoothstep(ax, 0.32, 0.62));
  h = Math.max(h, 0.68 * bump(z, -1.6, 0.7, 0.4) * (1 - THREE.MathUtils.smoothstep(ax, 0.85, 1.05)));
  h = Math.max(h, 0.34 * bump(z, 2.3, 3.0, 0.15) * (1 - THREE.MathUtils.smoothstep(ax, 0.95, 1.1)));
  const wheelX = bump(ax, 0.58, 1.02, 0.08);
  h = Math.max(h, 0.68 * wheelX * Math.max(bump(z, 1.15, 1.85, 0.1), bump(z, -2.5, -1.8, 0.1)));
  h = Math.max(h, 1.06 * bump(z, -2.95, -2.35, 0.08) * (1 - THREE.MathUtils.smoothstep(ax, 0.5, 0.62)));
  return h;
}

function streamline(x0, y0) {
  const pts = [];
  const N = 90;
  let x = x0;
  let lift = 0;
  for (let i = 0; i <= N; i++) {
    const z = THREE.MathUtils.lerp(4.0, -7, i / N);
    // Antecipa o obstáculo: o ar começa a subir antes de chegar na peça.
    let hAhead = 0;
    for (let k = 0; k < 4; k++) hAhead = Math.max(hAhead, height(x, z + k * 0.25) - k * 0.06);
    const target = Math.max(0, hAhead + 0.07 - y0);
    lift += (target - lift) * (target > lift ? 0.55 : 0.12);
    // Linhas baixas que batem nos sidepods são empurradas para fora.
    if (Math.abs(x) < 1.15 && hAhead > y0 + 0.2) x += Math.sign(x || 1) * 0.02;
    // Esteira atrás da asa traseira: o ar sobe e se enrola.
    const wake = z < -2.9 ? Math.exp(-((z + 4.2) ** 2) * 0.6) * 0.35 * (1 - Math.min(1, Math.abs(x) / 1.2)) : 0;
    pts.push(new THREE.Vector3(x, y0 + lift + wake, z));
  }
  return new THREE.CatmullRomCurve3(pts);
}

const vertex = /* glsl */ `
attribute float aSeed;
varying float vU;
varying float vSeed;
void main() {
  vU = uv.x;
  vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragment = /* glsl */ `
uniform float uTime;
uniform float uShow;
uniform vec3 uColor;
uniform vec3 uHot;
varying float vU;
varying float vSeed;
void main() {
  // Pulso que corre da frente para trás em cada linha.
  float phase = fract(vU * 2.2 - uTime * (0.35 + vSeed * 0.25) + vSeed * 7.0);
  float streak = pow(smoothstep(0.0, 0.85, phase) * (1.0 - smoothstep(0.85, 1.0, phase)), 2.0);
  float edges = smoothstep(0.0, 0.22, vU) * (1.0 - smoothstep(0.8, 1.0, vU));
  // A linha "aparece" da frente para trás quando a seção entra.
  float reveal = smoothstep(uShow * 1.2 - 0.2, uShow * 1.2, 1.0 - vU) ;
  float a = (0.12 + streak * 0.5) * edges * (1.0 - reveal) * min(uShow * 3.0, 1.0);
  vec3 col = mix(uColor, uHot, streak);
  gl_FragColor = vec4(col, a);
}
`;

export function createFlow(scene) {
  const geos = [];
  const xs = isMobile ? [-1.1, -0.6, -0.2, 0.2, 0.6, 1.1] : [-1.35, -1.0, -0.7, -0.4, -0.15, 0.15, 0.4, 0.7, 1.0, 1.35];
  const ys = isMobile ? [0.2, 0.55, 0.95] : [0.12, 0.35, 0.6, 0.85, 1.1, 1.35];
  let seed = 0;
  for (const x of xs) {
    for (const y of ys) {
      const curve = streamline(x + (Math.random() - 0.5) * 0.08, y + (Math.random() - 0.5) * 0.06);
      const g = new THREE.TubeGeometry(curve, 160, 0.0045, 3, false);
      const s = (seed++ * 0.6180339) % 1;
      g.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(s), 1));
      geos.push(g);
    }
  }
  const geometry = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());

  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uShow: { value: 0 },
      uColor: { value: new THREE.Color(0.55, 0.62, 0.85) },
      uHot: { value: new THREE.Color('#ff2a45').multiplyScalar(1.1) },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  return {
    mesh,
    set show(v) {
      material.uniforms.uShow.value = v;
      mesh.visible = v > 0.001;
    },
    update(time) {
      material.uniforms.uTime.value = time;
    },
  };
}
