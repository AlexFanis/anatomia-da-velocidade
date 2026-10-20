import * as THREE from 'three';
import { isMobile } from './stage.js';

const vertex = /* glsl */ `
attribute float aLife;
attribute float aSize;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (1.0 - aLife * 0.6) * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
varying float vLife;
void main() {
  if (vLife >= 1.0) discard;
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  // Branco-amarelo quando nasce, laranja e depois vermelho ao apagar (HDR para o bloom).
  vec3 col = mix(vec3(4.0, 3.2, 1.6), vec3(3.2, 0.9, 0.12), smoothstep(0.0, 0.4, vLife));
  col = mix(col, vec3(1.2, 0.08, 0.02), smoothstep(0.5, 1.0, vLife));
  gl_FragColor = vec4(col, a * (1.0 - vLife));
}
`;

// Faíscas de titânio saindo sob o assoalho (prancha raspando no chão).
export function createSparks(scene) {
  const count = isMobile ? 220 : 700;
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const life = new Float32Array(count).fill(1);
  const ttl = new Float32Array(count);
  const size = new Float32Array(count);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  let cursor = 0;
  let carry = 0;
  const state = { rate: 0 };

  function emit(n) {
    for (let k = 0; k < n; k++) {
      const i = cursor;
      cursor = (cursor + 1) % count;
      // Dois pontos de origem: sob a frente do assoalho e sob a prancha central.
      const front = Math.random() < 0.55;
      pos[i * 3] = (Math.random() - 0.5) * (front ? 0.9 : 0.5);
      pos[i * 3 + 1] = 0.02;
      pos[i * 3 + 2] = front ? 0.9 + Math.random() * 0.5 : -0.8 + Math.random() * 0.8;
      const spread = (Math.random() - 0.5) * 2.4;
      vel[i * 3] = spread;
      vel[i * 3 + 1] = 0.6 + Math.random() * 2.2;
      vel[i * 3 + 2] = -(4 + Math.random() * 9);
      ttl[i] = 0.35 + Math.random() * 0.55;
      life[i] = 0;
      size[i] = 0.08 + Math.random() * 0.14;
    }
  }

  return {
    state,
    update(dt) {
      carry += state.rate * (isMobile ? 220 : 520) * dt;
      const n = Math.floor(carry);
      carry -= n;
      if (n > 0) emit(n);

      for (let i = 0; i < count; i++) {
        if (life[i] >= 1) continue;
        life[i] = Math.min(1, life[i] + dt / ttl[i]);
        vel[i * 3 + 1] -= 9.8 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        // Quica no chão perdendo energia.
        if (pos[i * 3 + 1] < 0.01) {
          pos[i * 3 + 1] = 0.01;
          vel[i * 3 + 1] *= -0.35;
          vel[i * 3] *= 0.7;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aLife.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
    },
  };
}
