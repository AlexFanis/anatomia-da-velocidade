import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const MODEL_URL = `${import.meta.env.BASE_URL}models/car.glb`;
// Usado quando o servidor não manda Content-Length.
const MODEL_BYTES = 4_473_440;

// Pinturas: "original" mantém a textura; as outras trocam só o azul-marinho
// da carroceria, preservando logos, vermelho e amarelo.
export const PAINTS = {
  original: null,
  branco: '#eeeef1',
  vermelho: '#c40f26',
  preto: '#0c0c0e',
  laranja: '#ff6a0a',
};

// Vista explodida como desenho técnico: só os conjuntos principais, cada um num
// eixo reto, em onda da frente para trás. [nó, eixo, distância (m), atraso 0–1]
const FWD = [0, 0, 1];
const BACK = [0, 0.2, -1];
const L = [1, 0, 0];
const R = [-1, 0, 0];
const EXPLODE = [
  // 1. Asa dianteira (todas as lâminas juntas) e, atrás dela, o bico.
  ['frontwing_fl_01_003', FWD, 1.35, 0],
  ['frontwing_fr_01_003', FWD, 1.35, 0],
  ['frontflap_fl_003', FWD, 1.35, 0],
  ['frontflap_fr_003', FWD, 1.35, 0],
  ['frontspoiler_fm_003', FWD, 1.35, 0],
  ['nosecone_006', FWD, 0.7, 0.06],
  // 2. Rodas dianteiras para os lados.
  ['WHEEL_LF', L, 0.95, 0.14],
  ['WHEEL_RF', R, 0.95, 0.14],
  // 3. Sidepods abrem.
  ['sidepod_fl_006', L, 0.6, 0.28],
  ['sidepod_fr_006', R, 0.6, 0.28],
  ['sidewing_fl_004', L, 0.6, 0.28],
  ['sidewing_fr_004', R, 0.6, 0.28],
  // 4. Rodas traseiras.
  ['WHEEL_LR', L, 0.95, 0.4],
  ['WHEEL_RR', R, 0.95, 0.4],
  // 5. Asa traseira inteira para trás.
  ['rearwing_bl_005', BACK, 1.1, 0.46],
  ['rearwing_br_005', BACK, 1.1, 0.46],
  ['rearwing_top_005', BACK, 1.1, 0.46],
  ['DRS_1', BACK, 1.1, 0.46],
];
// Atraso máximo (a última peça começa nesse ponto do progresso).
const STAGGER = 0.46;

// Pontos dos rótulos técnicos (seção Aerodinâmica).
const ANCHORS = {
  frontwing: 'frontwing_fl_01_003',
  halo: 'hal_004',
  sidepod: 'sidepod_fl_006',
  floor: 'floor_damage_l_003',
  rearwing: 'rearwing_top_005',
};

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Shader da pintura: tinge só o azul-marinho e faz a troca com uma varredura
// da frente para trás, com uma costura brilhante na transição.
function paintShader(material) {
  const uniforms = {
    uFrom: { value: new THREE.Color() },
    uFromAmt: { value: 0 },
    uTo: { value: new THREE.Color() },
    uToAmt: { value: 0 },
    uSweep: { value: 1 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaintPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvPaintPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uFrom; uniform float uFromAmt;
uniform vec3 uTo; uniform float uToAmt;
uniform float uSweep;
varying vec3 vPaintPos;
float paintSeam = 0.0;
vec3 tintBase(vec3 c, vec3 tint, float amt) {
  float mask = 1.0 - smoothstep(0.035, 0.11, max(c.r, c.g));
  float shade = 0.55 + 6.0 * dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(c, tint * shade, mask * amt);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float zLine = mix(3.6, -3.6, uSweep);
  float painted = smoothstep(zLine - 0.12, zLine + 0.12, vPaintPos.z);
  vec3 a = tintBase(diffuseColor.rgb, uFrom, uFromAmt);
  vec3 b = tintBase(diffuseColor.rgb, uTo, uToAmt);
  diffuseColor.rgb = mix(a, b, painted);
  paintSeam = (1.0 - smoothstep(0.0, 0.18, abs(vPaintPos.z - zLine))) * step(uSweep, 0.999) * step(0.001, uSweep);
}`,
      )
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb += vec3(1.0, 0.25, 0.2) * paintSeam * 2.5;');
  };
  return uniforms;
}

function upgradeMaterials(root) {
  let paint = null;
  let paintUniforms = null;
  const brakes = [];
  const seen = new Set();

  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const m = o.material;
    // Decalques e vidro não projetam sombra.
    if (m.transparent) o.castShadow = false;
    if (m.name === 'redbull_paint') {
      if (!paint) {
        // Pintura original com verniz por cima.
        paint = new THREE.MeshPhysicalMaterial({
          name: 'paint',
          map: m.map,
          metalness: 0.15,
          roughness: 0.3,
          clearcoat: 0.7,
          clearcoatRoughness: 0.05,
          envMapIntensity: 0.6,
        });
        paintUniforms = paintShader(paint);
      }
      o.material = paint;
      return;
    }
    if (seen.has(m)) return;
    seen.add(m);

    if (m.name !== 'glass') m.envMapIntensity = 0.6;
    if (/carbon/i.test(m.name)) {
      m.envMapIntensity = 0.55;
      m.roughness = 0.38;
    } else if (/^Material #/.test(m.name)) {
      // Pneus: borracha fosca.
      m.roughness = Math.max(m.roughness, 0.78);
      m.envMapIntensity = 0.5;
    } else if (m.name === 'rear_light') {
      m.emissive = new THREE.Color(1, 0.04, 0.02);
      m.emissiveMap = m.map;
      m.emissiveIntensity = 0;
    } else if (m.name === 'glass') {
      m.transparent = true;
      m.opacity = 0.35;
      m.roughness = 0.05;
    } else if (/disc/i.test(m.name)) {
      m.emissive = new THREE.Color(1, 0.35, 0.05);
      m.emissiveMap = m.map;
      m.emissiveIntensity = 0;
      brakes.push(m);
    }
  });

  return { paintUniforms, brakes };
}

export async function loadCar(onProgress) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const gltf = await loader.loadAsync(MODEL_URL, (e) => {
    const total = e.total || MODEL_BYTES;
    onProgress?.(Math.min(e.loaded / total, 1), total);
  });

  const model = gltf.scene;
  const { paintUniforms, brakes } = upgradeMaterials(model);

  // Centraliza no chão: frente do carro aponta para +Z.
  const box = new THREE.Box3().setFromObject(model);
  const mid = box.getCenter(new THREE.Vector3());
  model.position.x -= mid.x;
  model.position.z -= mid.z;
  model.position.y -= box.min.y;

  const root = new THREE.Group();
  root.name = 'car';
  root.add(model);
  root.updateMatrixWorld(true);

  const byName = (n) => model.getObjectByName(n);

  // --- Vista explodida -------------------------------------------------
  const parts = [];
  for (const [name, dir, dist, delay] of EXPLODE) {
    const node = byName(name);
    if (!node) continue;
    const b = new THREE.Box3().setFromObject(node);
    const c = b.getCenter(new THREE.Vector3());
    const target = c.clone().addScaledVector(new THREE.Vector3(...dir).normalize(), dist);
    const parent = node.parent;
    const delta = parent.worldToLocal(target.clone()).sub(parent.worldToLocal(c.clone()));
    parts.push({ node, box: b, base: node.position.clone(), delta, delay });
  }

  // Os logos ficam num grupo à parte: cada decalque vai junto com a peça que o contém.
  const partNodes = new Set(parts.map((p) => p.node));
  const isInsidePart = (o) => {
    for (let p = o.parent; p; p = p.parent) if (partNodes.has(p)) return true;
    return false;
  };
  const decals = [];
  model.traverse((o) => {
    if (o.isMesh && o.material.transparent && o.material.name !== 'glass' && !isInsidePart(o)) decals.push(o);
  });
  // Cada peça vira uma nuvem de pontos (amostrada); o decalque vai para a peça
  // cujo ponto mais próximo está mais perto do centro dele.
  const v = new THREE.Vector3();
  const partPoints = parts.map((p) => {
    const pts = [];
    p.node.traverse((o) => {
      if (!o.isMesh || o.material.transparent) return;
      const attr = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(attr.count / 600));
      for (let i = 0; i < attr.count; i += step) pts.push(v.fromBufferAttribute(attr, i).applyMatrix4(o.matrixWorld).clone());
    });
    return pts;
  });
  // A carroceria fixa também concorre: logo pintado nela fica onde está.
  const bodyPoints = [];
  model.traverse((o) => {
    if (!o.isMesh || o.material.transparent || isInsidePart(o) || partNodes.has(o)) return;
    const attr = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(attr.count / 600));
    for (let i = 0; i < attr.count; i += step) bodyPoints.push(v.fromBufferAttribute(attr, i).applyMatrix4(o.matrixWorld).clone());
  });
  const center = new THREE.Vector3();
  const tmpBox = new THREE.Box3();
  for (const decal of decals) {
    tmpBox.setFromObject(decal).getCenter(center);
    let best = -1;
    let bestD = 0.12 * 0.12;
    partPoints.forEach((pts, i) => {
      for (const pt of pts) {
        const d = pt.distanceToSquared(center);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    });
    if (best < 0) continue;
    if (bodyPoints.some((pt) => pt.distanceToSquared(center) < bestD)) continue;
    parts[best].node.attach(decal);
  }

  const partProgress = (p, e) => THREE.MathUtils.clamp((e - p.delay) / (1 - STAGGER), 0, 1);

  function setExplode(e) {
    for (const p of parts) p.node.position.copy(p.base).addScaledVector(p.delta, easeInOut(partProgress(p, e)));
  }

  // --- Âncoras dos rótulos ---------------------------------------------
  const anchors = {};
  for (const [key, name] of Object.entries(ANCHORS)) {
    const node = byName(name);
    if (!node) continue;
    const c = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
    anchors[key] = { node, local: node.worldToLocal(c.clone()) };
  }
  const anchorWorld = (key, out) => {
    const a = anchors[key];
    return a ? a.node.localToWorld(out.copy(a.local)) : null;
  };

  // --- Rodas, freios, luz traseira --------------------------------------
  const wheels = ['WHEEL_LF', 'WHEEL_RF', 'WHEEL_LR', 'WHEEL_RR'].map(byName).filter(Boolean);
  const frontWheel = byName('WHEEL_LF');
  const frontWheelPos = frontWheel ? new THREE.Box3().setFromObject(frontWheel).getCenter(new THREE.Vector3()) : new THREE.Vector3();

  const rearLight = [];
  model.traverse((o) => {
    if (o.isMesh && o.material.name === 'rear_light' && !rearLight.includes(o.material)) rearLight.push(o.material);
  });

  const brakeLight = new THREE.PointLight(0xff6a1a, 0, 1.6, 2);
  brakeLight.position.copy(frontWheelPos).add(new THREE.Vector3(-0.12, 0, 0));
  root.add(brakeLight);

  const heatColor = new THREE.Color();
  const cold = new THREE.Color(1, 0.55, 0.1);
  const hot = new THREE.Color(1, 0.12, 0.04);

  // --- Troca de pintura ---------------------------------------------------
  let currentPaint = 'original';
  let paintTween = null;

  return {
    root,
    model,
    size: box.getSize(new THREE.Vector3()),
    frontWheelPos,
    paintNames: Object.keys(PAINTS),
    get paint() {
      return currentPaint;
    },
    setExplode,
    anchorWorld,
    spinWheels(angle) {
      for (const w of wheels) w.rotateX(angle);
    },
    setBrakeHeat(h) {
      heatColor.copy(cold).lerp(hot, THREE.MathUtils.smoothstep(h, 0.4, 1));
      for (const m of brakes) {
        m.emissive.copy(heatColor);
        m.emissiveIntensity = h * h * 14;
      }
      brakeLight.color.copy(heatColor);
      brakeLight.intensity = h * h * 6;
    },
    setRearLight(v) {
      for (const m of rearLight) m.emissiveIntensity = v;
    },
    setPaint(name, gsap) {
      if (!paintUniforms || name === currentPaint || !(name in PAINTS)) return false;
      const u = paintUniforms;
      // O estado atual vira o "de"; o novo entra pela varredura.
      u.uFrom.value.copy(u.uTo.value);
      u.uFromAmt.value = u.uToAmt.value;
      if (PAINTS[name]) {
        u.uTo.value.set(PAINTS[name]);
        u.uToAmt.value = 1;
      } else {
        u.uToAmt.value = 0;
      }
      currentPaint = name;
      paintTween?.kill();
      u.uSweep.value = 0;
      paintTween = gsap.to(u.uSweep, { value: 1, duration: 1.6, ease: 'power2.inOut' });
      return true;
    },
  };
}
