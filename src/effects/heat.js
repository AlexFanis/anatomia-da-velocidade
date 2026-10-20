import { Effect, EffectAttribute } from 'postprocessing';
import { Uniform, Vector2 } from 'three';
import { noise2D } from '../glsl/noise.js';

// Distorção de "ar quente" que segue o mouse: deslocamento por ruído,
// mais forte quanto mais rápido o mouse anda; some sozinha quando ele para.
const fragmentShader = /* glsl */ `
uniform vec2 mouse;
uniform vec2 velocity;
uniform float amount;
${noise2D}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (amount <= 0.001) { outputColor = inputColor; return; }
  vec2 d = (uv - mouse) * vec2(aspect, 1.0);
  // Rastro alongado na direção do movimento.
  float along = dot(d, normalize(velocity + 1e-5));
  float r = length(d - normalize(velocity + 1e-5) * clamp(along, -0.25, 0.0));
  float falloff = exp(-r * r * 38.0);
  vec2 n = vec2(fbm(uv * 9.0 + time * 1.3), fbm(uv * 9.0 - time * 1.1 + 4.0)) - 0.5;
  vec2 offset = n * falloff * amount * 0.05;
  vec4 c = texture2D(inputBuffer, uv + offset);
  outputColor = vec4(c.rgb, inputColor.a);
}
`;

export class HeatEffect extends Effect {
  constructor() {
    super('HeatEffect', fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([
        ['mouse', new Uniform(new Vector2(0.5, 0.5))],
        ['velocity', new Uniform(new Vector2())],
        ['amount', new Uniform(0)],
      ]),
    });
  }
}
