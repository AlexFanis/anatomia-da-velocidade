import { Effect } from 'postprocessing';
import { Uniform, Color } from 'three';
import { noise2D } from '../glsl/noise.js';

// Revela a cena a partir do centro por uma máscara de ruído com borda brilhante.
// progress: 0 = tela coberta (cor do loader), 1 = cena inteira.
const fragmentShader = /* glsl */ `
uniform float progress;
uniform vec3 coverColor;
uniform vec3 edgeColor;
${noise2D}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (progress >= 1.0) { outputColor = inputColor; return; }
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float n = fbm(p * 2.6 + vec2(0.0, time * 0.08));
  float v = 0.62 * (1.0 - length(p) * 0.9) + 0.38 * n;
  float t = mix(1.05, -0.35, progress);
  float mask = smoothstep(t, t + 0.06, v);
  float edge = smoothstep(t - 0.015, t + 0.01, v) - smoothstep(t + 0.01, t + 0.07, v);
  vec3 col = mix(coverColor, inputColor.rgb, mask) + edgeColor * edge * (1.0 - progress);
  outputColor = vec4(col, inputColor.a);
}
`;

export class RevealEffect extends Effect {
  constructor({ cover = new Color(), edge = new Color(1, 1, 1) } = {}) {
    super('RevealEffect', fragmentShader, {
      uniforms: new Map([
        ['progress', new Uniform(0)],
        ['coverColor', new Uniform(cover)],
        ['edgeColor', new Uniform(edge)],
      ]),
    });
  }

  get progress() {
    return this.uniforms.get('progress').value;
  }

  set progress(v) {
    this.uniforms.get('progress').value = v;
  }
}
