import * as THREE from 'three';
import type { ProjectConfig } from './types';
import { itemDisplayName } from './catalog';
import { getLang } from './i18n';
import { S } from '../scene/builders';
import { safeName, triggerDownload } from './export';

/**
 * ISO 10303-21 (STEP AP214) exporter.
 *
 * The 3D scene is built almost entirely from axis-aligned boxes, so instead of
 * dumping a triangulated mesh we emit genuine analytic B-rep solids: every box
 * becomes a CLOSED_SHELL of six PLANE faces bounded by LINE edges. CAD tools can
 * therefore measure, section and boolean the result rather than seeing a faceted
 * mesh. No WASM CAD kernel and no runtime dependency are required.
 *
 * Scene axes are Y-up / +Z-front. STEP files conventionally use Z-up, so all
 * points and directions are mapped with the proper rotation (x, y, z) ->
 * (x, -z, y); det = +1 keeps face orientation valid.
 */

type V3 = [number, number, number];

interface BoxSolid {
  center: V3;   // mm, scene coordinates
  half: V3;     // mm
  group: string;
}

const toMm = (v: number): number => v / S;

/** Rotate a scene point into the STEP frame. */
const stepPoint = (p: V3): V3 => [p[0], -p[2], p[1]];
const stepDir = (d: V3): V3 => [d[0], -d[2], d[1]];

const FACES: { verts: number[]; axis: V3; ref: V3 }[] = [
  { verts: [0, 3, 2, 1], axis: [0, 0, -1], ref: [0, 1, 0] }, // -Z
  { verts: [4, 5, 6, 7], axis: [0, 0, 1], ref: [1, 0, 0] },  // +Z
  { verts: [0, 4, 7, 3], axis: [-1, 0, 0], ref: [0, 0, 1] }, // -X
  { verts: [1, 2, 6, 5], axis: [1, 0, 0], ref: [0, 1, 0] },  // +X
  { verts: [0, 1, 5, 4], axis: [0, -1, 0], ref: [1, 0, 0] }, // -Y
  { verts: [3, 7, 6, 2], axis: [0, 1, 0], ref: [0, 0, 1] },  // +Y
];

/** The 12 unique edges of a box, stored smaller-vertex-first. */
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [0, 3],
  [4, 5], [5, 6], [6, 7], [4, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

const EDGE_KEYS = EDGES.map(([a, b]) => `${a}-${b}`);
function edgeIndex(a: number, b: number): number {
  return EDGE_KEYS.indexOf(a < b ? `${a}-${b}` : `${b}-${a}`);
}

class StepWriter {
  private slots: (string | null)[] = [];
  reserve(): number { this.slots.push(null); return this.slots.length; }
  put(id: number, body: string): void { this.slots[id - 1] = `#${id} = ${body};`; }
  add(body: string): number { const id = this.reserve(); this.put(id, body); return id; }
  text(): string { return this.slots.filter((s): s is string => s !== null).join('\n'); }
  get count(): number { return this.slots.length; }
}

const num = (n: number): string => (Math.abs(n) < 1e-9 ? 0 : n).toFixed(5);
const vec = (p: V3): string => `(${num(p[0])},${num(p[1])},${num(p[2])})`;

/** Escape a STEP string, encoding non-ASCII with the \X2\ ... \X0\ mechanism. */
function stepStr(s: string): string {
  let out = '';
  let unicode = '';
  const flush = () => {
    if (unicode) { out += `\\X2\\${unicode}\\X0\\`; unicode = ''; }
  };
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c > 0x7e || c < 0x20) {
      unicode += c.toString(16).toUpperCase().padStart(4, '0');
    } else {
      flush();
      if (ch === "'") out += "''";
      else if (ch === '\\') out += '\\\\';
      else out += ch;
    }
  }
  flush();
  return out;
}

function dirKey(v: V3): string {
  return `${Math.round(v[0])},${Math.round(v[1])},${Math.round(v[2])}`;
}

/** Collect axis-aligned boxes and the assembly group each belongs to. */
function collectBoxes(root: THREE.Object3D, config: ProjectConfig): BoxSolid[] {
  const lang = getLang();
  const out: BoxSolid[] = [];
  const f = config.frame;
  const structural = [
    lang === 'zh' ? '机柜框架' : 'Cabinet frame',
    lang === 'zh' ? '19 英寸立柱' : '19-inch mounting rails',
    lang === 'zh' ? '底座' : 'Plinth / base',
    lang === 'zh' ? '顶盖' : 'Top cover',
  ];
  if (f.sidePanels) {
    structural.push(lang === 'zh' ? '左侧板' : 'Side panel L');
    structural.push(lang === 'zh' ? '右侧板' : 'Side panel R');
  }
  if (f.frontDoor !== 'none') structural.push(lang === 'zh' ? '前门' : 'Front door');
  if (f.rearDoor !== 'none') structural.push(lang === 'zh' ? '后门' : 'Rear door');

  const fallback = lang === 'zh' ? '结构件' : 'Structure';
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);

  for (const child of root.children) {
    const ud = child.userData as { itemId?: string; label?: { zh: string; en: string } };
    let group: string;
    if (ud.itemId) {
      const item = config.items.find((i) => i.id === ud.itemId);
      group = item ? itemDisplayName(item, lang)
        : (ud.label ? ud.label[lang] : fallback);
    } else {
      group = ud.label ? ud.label[lang] : (structural.shift() ?? fallback);
    }

    child.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) return;
      const geo = mesh.geometry;
      if (!(geo instanceof THREE.BoxGeometry)) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity;
      let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (const x of [bb.min.x, bb.max.x]) {
        for (const y of [bb.min.y, bb.max.y]) {
          for (const z of [bb.min.z, bb.max.z]) {
            v.set(x, y, z).applyMatrix4(mesh.matrixWorld);
            x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); z0 = Math.min(z0, v.z);
            x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y); z1 = Math.max(z1, v.z);
          }
        }
      }
      const half: V3 = [toMm(x1 - x0) / 2, toMm(y1 - y0) / 2, toMm(z1 - z0) / 2];
      if (half.some((h) => h < 0.05)) return; // skip degenerate decoration
      const center: V3 = [toMm(x0 + x1) / 2, toMm(y0 + y1) / 2, toMm(z0 + z1) / 2];
      out.push({ center, half, group });
    });
  }
  return out;
}

function writeBox(
  w: StepWriter, box: BoxSolid, solidId: number,
  dirs: Record<string, number>, vectors: Record<string, number>,
): void {
  const [cx, cy, cz] = box.center;
  const [hx, hy, hz] = box.half;
  const p: V3[] = [
    [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz],
    [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz],
  ];
  const pointIds = p.map((q) => w.add(`CARTESIAN_POINT('',${vec(stepPoint(q))})`));
  const vertexIds = pointIds.map((id) => w.add(`VERTEX_POINT('',#${id})`));

  const edgeIds = EDGES.map(([a, b]) => {
    const raw: V3 = [p[b][0] - p[a][0], p[b][1] - p[a][1], p[b][2] - p[a][2]];
    const len = Math.hypot(...raw) || 1;
    const d = dirKey(stepDir([raw[0] / len, raw[1] / len, raw[2] / len]));
    // LINE expects a VECTOR (direction + magnitude), not a bare DIRECTION.
    const lineId = w.add(`LINE('',#${pointIds[a]},#${vectors[d]})`);
    return w.add(`EDGE_CURVE('',#${vertexIds[a]},#${vertexIds[b]},#${lineId},.T.)`);
  });

  const faceIds = FACES.map((face) => {
    const oeIds: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = face.verts[i], b = face.verts[(i + 1) % 4];
      const idx = edgeIndex(a, b);
      const sense = a === EDGES[idx][0] ? '.T.' : '.F.';
      oeIds.push(w.add(`ORIENTED_EDGE('',*,*,#${edgeIds[idx]},${sense})`));
    }
    const loopId = w.add(`EDGE_LOOP('',(${oeIds.map((i) => `#${i}`).join(',')}))`);
    const boundId = w.add(`FACE_OUTER_BOUND('',#${loopId},.T.)`);
    const axisId = dirs[dirKey(stepDir(face.axis))];
    const refId = dirs[dirKey(stepDir(face.ref))];
    const placeId = w.add(`AXIS2_PLACEMENT_3D('',#${pointIds[face.verts[0]]},#${axisId},#${refId})`);
    const planeId = w.add(`PLANE('',#${placeId})`);
    return w.add(`ADVANCED_FACE('',(#${boundId}),#${planeId},.T.)`);
  });

  const shellId = w.add(`CLOSED_SHELL('',(${faceIds.map((i) => `#${i}`).join(',')}))`);
  w.put(solidId, `MANIFOLD_SOLID_BREP('${stepStr(box.group)}',#${shellId})`);
}

function buildStep(boxes: BoxSolid[], config: ProjectConfig): string {
  const w = new StepWriter();
  const name = stepStr(config.name || 'BTF Rack');
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, '');

  // --- application / product context ---------------------------------------
  const appCtx = w.add(`APPLICATION_CONTEXT('automotive design')`);
  w.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${appCtx})`);
  const prodCtx = w.add(`PRODUCT_CONTEXT('',#${appCtx},'mechanical')`);
  const pdCtx = w.add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${appCtx},'design')`);
  const product = w.add(`PRODUCT('${name}','${name}','',(#${prodCtx}))`);
  const formation = w.add(`PRODUCT_DEFINITION_FORMATION('','',#${product})`);
  const pdef = w.add(`PRODUCT_DEFINITION('design','',#${formation},#${pdCtx})`);
  const pds = w.add(`PRODUCT_DEFINITION_SHAPE('','',#${pdef})`);

  const lenUnit = w.add(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`);
  const angUnit = w.add(`( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )`);
  const solUnit = w.add(`( NAMED_UNIT(*) SOLID_ANGLE_UNIT() SI_UNIT($,.STERADIAN.) )`);
  const unc = w.add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),#${lenUnit},'distance_accuracy_value','')`);
  const repCtx = w.add(
    `( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc})) ` +
    `GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lenUnit},#${angUnit},#${solUnit})) REPRESENTATION_CONTEXT('','3D') )`,
  );

  // Six shared axis directions (all geometry is axis-aligned). LINE needs a
  // VECTOR wrapper around each DIRECTION; AXIS2_PLACEMENT_3D takes the raw one.
  const dirs: Record<string, number> = {};
  const vectors: Record<string, number> = {};
  for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as V3[]) {
    const key = dirKey(d);
    dirs[key] = w.add(`DIRECTION('',${vec(d)})`);
    vectors[key] = w.add(`VECTOR('',#${dirs[key]},1.)`);
  }

  // --- reserve ids referenced by the top-level representation --------------
  const placementId = w.reserve();
  const originId = w.reserve();
  const placementAxisId = w.reserve();
  const placementRefId = w.reserve();
  const solidIds = boxes.map(() => w.reserve());
  const repId = w.add(
    `ADVANCED_BREP_SHAPE_REPRESENTATION('${name}',` +
    `(#${placementId},${solidIds.map((i) => `#${i}`).join(',')}),#${repCtx})`,
  );
  w.add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${repId})`);

  w.put(originId, `CARTESIAN_POINT('',(0.00000,0.00000,0.00000))`);
  w.put(placementAxisId, `DIRECTION('',(0.00000,0.00000,1.00000))`);
  w.put(placementRefId, `DIRECTION('',(1.00000,0.00000,0.00000))`);
  w.put(placementId, `AXIS2_PLACEMENT_3D('',#${originId},#${placementAxisId},#${placementRefId})`);

  boxes.forEach((box, i) => writeBox(w, box, solidIds[i], dirs, vectors));

  // Group solids per assembly part so CAD tools show a named layer tree.
  const layers = new Map<string, number[]>();
  boxes.forEach((box, i) => {
    const list = layers.get(box.group) || [];
    list.push(solidIds[i]);
    layers.set(box.group, list);
  });
  for (const [group, ids] of layers) {
    w.add(`PRESENTATION_LAYER_ASSIGNMENT('${stepStr(group)}','',(${ids.map((i) => `#${i}`).join(',')}))`);
  }

  const header = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('BTF BuildTestFrame 19-inch rack assembly / analytic B-rep'),'2;1');`,
    `FILE_NAME('${safeName(config.name)}.stp','${stamp}',('BTF BuildTestFrame'),('BTF BuildTestFrame'),'','BTF BuildTestFrame','');`,
    `FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));`,
    'ENDSEC;',
    'DATA;',
  ].join('\n');

  return `${header}\n${w.text()}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

/**
 * Export the assembly as a STEP AP214 file (.stp, identical to .step).
 * Only axis-aligned solid boxes are exported: silk-screen planes, U-hole
 * instancing and turned decorations (casters / knobs) have no analytic B-rep
 * equivalent here and are intentionally omitted.
 */
export function exportStep(root: THREE.Object3D, config: ProjectConfig): number {
  const boxes = collectBoxes(root, config);
  if (!boxes.length) throw new Error('no-solid-geometry');
  const text = buildStep(boxes, config);
  triggerDownload(`${safeName(config.name)}.stp`,
    new Blob([text], { type: 'application/step;charset=utf-8' }));
  return boxes.length;
}
