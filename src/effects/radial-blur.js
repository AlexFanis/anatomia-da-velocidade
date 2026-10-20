import { Effect, EffectAttribute } from 'postprocessing';
import { Uniform } from 'three';

// Motion blur radial: amostra a imagem em direção ao centro. strength 0 = desligado.
const fragmentShader = /* glsl */ `
uniform float strength;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (strength <= 0.0005) { outputColor = inputColor; return; }
  vec2 center = vec2(0.5, 0.48);
  vec2 dir = (uv - center);
  // Centro nítido, bordas borradas.
  float falloff = smoothstep(0.08, 0.7, length(dir * vec2(aspect, 1.0)));
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 10; i++) {
    float k = float(i) / 9.0;
    acc += texture2D(inputBuffer, uv - dir * k * strength * falloff);
  }
  outputColor = acc / 10.0;
}
`;

export class RadialBlurEffect extends Effect {
  constructor() {
    super('RadialBlurEffect', fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([['strength', new Uniform(0)]]),
    });
  }

  get strength() {
    return this.uniforms.get('strength').value;
  }

  set strength(v) {
    this.uniforms.get('strength').value = v;
  }
}
