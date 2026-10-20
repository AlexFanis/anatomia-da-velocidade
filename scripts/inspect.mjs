import { NodeIO } from "@gltf-transform/core";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder});
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const f = (v) => v.map((x) => x.toFixed(2)).join(',');
function walk(n, d) {
  const m = n.getMesh();
  let info = '';
  if (m) {
    const b = getBounds(n);
    const mats = [...new Set(m.listPrimitives().map((p) => p.getMaterial()?.getName()))].join('|');
    const v = m.listPrimitives().reduce((a, p) => a + p.getAttribute('POSITION').getCount(), 0);
    info = ` [mesh v=${v} mat=${mats}] min(${f(b.min)}) max(${f(b.max)})`;
  }
  console.log('  '.repeat(d) + n.getName() + ` t(${f(n.getTranslation())}) r(${f(n.getRotation())}) s(${f(n.getScale())})` + info);
  n.listChildren().forEach((c) => walk(c, d + 1));
}
for (const s of root.listScenes()) s.listChildren().forEach((n) => walk(n, 0));
console.log('\nMATERIAIS:');
for (const m of root.listMaterials()) console.log(m.getName(), 'base', m.getBaseColorTexture()?.getName() ?? '-', 'rgba', f(m.getBaseColorFactor()), 'metal', m.getMetallicFactor(), 'rough', m.getRoughnessFactor(), 'emis', f(m.getEmissiveFactor()), 'alpha', m.getAlphaMode());
console.log('\nTEXTURAS:');
for (const t of root.listTextures()) console.log(t.getName(), t.getURI(), t.getMimeType(), t.getSize()?.join('x'), (t.getImage()?.byteLength/1024|0)+'KB');
