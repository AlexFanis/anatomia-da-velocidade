// Gera public/models/car.glb a partir do rb16.glb original:
// corrige materiais e comprime (meshopt + WebP), mantendo a pintura original.
// Uso: node scripts/optimize.mjs <entrada.glb> public/models/car.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, textureCompress, weld, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
const root = doc.getRoot();

// Materiais: o export (Assetto Corsa → Blender) marcou tudo como metal=1 e BLEND.
// Só fica BLEND quem tem transparência de verdade na textura (decalques, vidro).
async function hasAlpha(tex) {
  if (!tex) return false;
  const { channels } = await sharp(Buffer.from(tex.getImage())).stats();
  return channels.length === 4 && channels[3].min < 250;
}

for (const mat of root.listMaterials()) {
  const name = mat.getName();
  const transparent = /glass/i.test(name) || (!/carbon/i.test(name) && (await hasAlpha(mat.getBaseColorTexture())));
  mat.setAlphaMode(transparent ? 'BLEND' : 'OPAQUE');
  mat.setMetallicFactor(/chrome|disc|wheel_hub/i.test(name) ? 0.85 : 0);
  if (/carbon/i.test(name)) mat.setRoughnessFactor(0.35);
  if (transparent) console.log('BLEND:', name);
}

await doc.transform(
  prune(),
  dedup(),
  resample(),
  weld(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 85 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  prune(),
);

await io.write(output, doc);
console.log('ok →', output);
