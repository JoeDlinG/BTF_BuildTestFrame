import * as THREE from 'three';
import type { AppState, FrameConfig, PlacedItem } from '../core/types';
import { catalogById, occupiesU } from '../core/catalog';
import { cabinetHeight, MOUNT_CENTER_MM, PANEL_19_MM, RAIL_OPENING_MM, U_MM } from '../core/standards';

/** Scene scale: 1 mm -> 0.01 world units (1 unit = 100 mm). */
export const S = 0.01;
export const mm = (v: number): number => v * S;

export function rackBottom(f: FrameConfig): number {
  return f.plinth + 40;
}
export function rackTop(f: FrameConfig): number {
  return rackBottom(f) + f.heightU * U_MM;
}
export function frontRailZ(f: FrameConfig): number {
  return f.depth / 2 - f.frontRailOffset;
}
export function rearRailZ(f: FrameConfig): number {
  return -(f.depth / 2 - f.rearRailOffset);
}

type StdMat = THREE.MeshStandardMaterial;

function mat(hex: string, opts: Partial<StdMat> = {}): StdMat {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    metalness: 0.28,
    roughness: 0.62,
    ...opts,
  });
}

function addBox(
  parent: THREE.Object3D, w: number, h: number, d: number,
  material: THREE.Material, x: number, y: number, z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(mm(w), mm(h), mm(d)), material);
  m.position.set(mm(x), mm(y), mm(z));
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function addCyl(
  parent: THREE.Object3D, r: number, h: number,
  material: THREE.Material, x: number, y: number, z: number,
  axis: 'x' | 'y' | 'z' = 'y',
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(mm(r), mm(r), mm(h), 16), material);
  m.position.set(mm(x), mm(y), mm(z));
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Canvas texture resembling a perforated steel door. */
function perforatedTexture(hex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 192; c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(2,5,9,0.9)';
  for (let y = 8; y < c.height - 4; y += 12) {
    for (let x = 8 + ((y / 12) % 2) * 6; x < c.width - 4; x += 12) {
      ctx.beginPath();
      ctx.arc(x, y, 3.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

/** Small identification / silk-screen label texture. */
function labelTexture(text: string, bg = '#202933', fg = '#dfe9f5'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = fg;
  ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const clipped = text.length > 24 ? `${text.slice(0, 23)}…` : text;
  ctx.fillText(clipped, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addLabelPlane(parent: THREE.Object3D, text: string, w: number, h: number,
  x: number, y: number, z: number, ry = 0): void {
  const tex = labelTexture(text);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(mm(w), mm(h)),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }),
  );
  plane.position.set(mm(x), mm(y), mm(z));
  plane.rotation.y = ry;
  parent.add(plane);
}

interface Part extends THREE.Group {
  userData: {
    itemId?: string;
    base: THREE.Vector3;
    explodeVec: THREE.Vector3;
    [k: string]: unknown;
  };
}

function makePart(parent: THREE.Group, explodeVec: [number, number, number], itemId?: string): Part {
  const g = new THREE.Group() as Part;
  g.userData = { itemId, base: new THREE.Vector3(), explodeVec: new THREE.Vector3(...explodeVec) };
  parent.add(g);
  return g;
}

function markPart(g: Part): void {
  g.userData.base = g.position.clone();
}

/** Build the whole cabinet. Returns a group whose direct children are animatable parts. */
export function buildCabinet(state: AppState): THREE.Group {
  const f = state.config.frame;
  const root = new THREE.Group();
  const W = f.width, D = f.depth, H = cabinetHeight(f);
  const rb = rackBottom(f), rt = rackTop(f);
  const frz = frontRailZ(f), rrz = rearRailZ(f);

  const frameMat = mat(f.color, { metalness: 0.42, roughness: 0.48 });
  const darkMat = mat('#1d2731', { metalness: 0.3, roughness: 0.62 });
  const railMat = mat('#aab5c0', { metalness: 0.52, roughness: 0.38 });
  const holeMat = mat('#080c11', { metalness: 0.2, roughness: 0.9 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x6a90b5, metalness: 0.05, roughness: 0.12,
    transparent: true, opacity: 0.26, transmission: 0.35, side: THREE.DoubleSide,
  });

  // ---------------- frame: 4 corner posts + top/bottom beams ----------------
  const frame = makePart(root, [0, 0, 0]);
  const post = 40, px = W / 2 - post / 2, pz = D / 2 - post / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    addBox(frame, post, H - f.plinth - 20, post, frameMat, sx * px, f.plinth + (H - f.plinth - 20) / 2, sz * pz);
  }
  for (const y of [f.plinth + 20, H - 20]) {
    for (const sz of [-1, 1]) addBox(frame, W, 40, 40, frameMat, 0, y, sz * pz);
    for (const sx of [-1, 1]) addBox(frame, 40, 40, D - 80, frameMat, sx * px, y, 0);
  }
  // meander profile hint: slim vertical beads along the front posts
  for (const sx of [-1, 1]) {
    addBox(frame, 12, H - f.plinth - 60, 12, darkMat, sx * (W / 2 - 8), f.plinth + (H - f.plinth - 60) / 2 + 20, D / 2 - 26);
  }

  // ---------------- 19" rails with square mounting holes ----------------
  const rails = makePart(root, [0, 0, 0.45]);
  const railX = MOUNT_CENTER_MM / 2 + 12;
  for (const z of [frz, rrz]) {
    for (const sx of [-1, 1]) {
      addBox(rails, 34, f.heightU * U_MM + 24, 16, railMat, sx * railX, (rb + rt) / 2, z);
    }
  }
  // horizontal cross members at top/bottom of the 19" opening
  for (const y of [rb - 12, rt + 12]) {
    for (const z of [frz, rrz]) addBox(rails, PANEL_19_MM + 60, 24, 20, frameMat, 0, y, z);
  }
  // U holes as one instanced mesh (3 square holes per U, EIA-310 triple pattern)
  const holeCount = f.heightU * 3 * 4;
  const holeGeo = new THREE.BoxGeometry(mm(9), mm(6), mm(2));
  const holes = new THREE.InstancedMesh(holeGeo, holeMat, holeCount);
  const dummy = new THREE.Object3D();
  let hi = 0;
  for (const z of [frz, rrz]) {
    for (const sx of [-1, 1]) {
      for (let u = 0; u < f.heightU; u++) {
        const yBase = rb + u * U_MM;
        for (const off of [5.5, 22.2, 27.8]) {
          dummy.position.set(mm(sx * MOUNT_CENTER_MM / 2), mm(yBase + off), mm(z + 8.2));
          dummy.updateMatrix();
          holes.setMatrixAt(hi++, dummy.matrix);
        }
      }
    }
  }
  holes.instanceMatrix.needsUpdate = true;
  rails.add(holes);

  // ---------------- base / plinth ----------------
  const base = makePart(root, [0, -1.2, 0]);
  addBox(base, W, f.plinth, D, frameMat, 0, f.plinth / 2, 0);
  addBox(base, W - 60, 12, D - 60, darkMat, 0, f.plinth + 6, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    addCyl(base, 22, 24, darkMat, sx * (W / 2 - 60), 12, sz * (D / 2 - 60));
  }
  if (f.frameType === 'mobile') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      addCyl(base, 38, 26, darkMat, sx * (W / 2 - 70), -18, sz * (D / 2 - 70), 'x');
    }
  }

  // ---------------- top cover ----------------
  const top = makePart(root, [0, 1.2, 0]);
  addBox(top, W, 18, D, frameMat, 0, H - 9, 0);
  if (f.topCover !== 'solid') {
    const holeW = W * 0.42, holeD = D * 0.3;
    addBox(top, holeW, 4, holeD, darkMat, 0, H + 1, 0);
    if (f.topCover === 'vented') {
      for (let i = -1; i <= 1; i++) {
        addCyl(top, holeW / 7, 6, darkMat, i * holeW / 3.4, H + 4, 0);
      }
    }
  }

  // ---------------- side panels (semi-transparent so internals stay visible) ----------------
  if (f.sidePanels) {
    const sideMat = mat(f.color, { transparent: true, opacity: 0.11, side: THREE.DoubleSide, depthWrite: false });
    for (const sx of [-1, 1]) {
      const g = makePart(root, [sx * 1.8, 0, 0]);
      addBox(g, 6, H - f.plinth - 40, D - 50, sideMat, sx * (W / 2 - 3), f.plinth + (H - f.plinth - 40) / 2 + 10, 0);
      addBox(g, 10, 12, D - 50, frameMat, sx * (W / 2 - 3), H - 24, 0);
      markPart(g);
    }
  }

  // ---------------- doors ----------------
  function buildDoor(kind: FrameConfig['frontDoor'], isFront: boolean): void {
    if (kind === 'none') return;
    const sign = isFront ? 1 : -1;
    const z = sign * (D / 2 - 8);
    const doorH = H - f.plinth - 60;
    const doorW = W - 50;
    const cy = f.plinth + doorH / 2 + 20;
    const g = makePart(root, [0, 0, sign * 2.4]);
    const doorColor = isFront ? f.frontDoorColor : f.color;
    // Doors stay translucent so the assembled 19" equipment remains visible,
    // exactly like an online configurator's see-through preview.
    const doorSkin = mat(doorColor, {
      transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide,
    });

    if (kind === 'glass') {
      addBox(g, doorW, doorH, 12, doorSkin, 0, cy, z);
      addBox(g, doorW - 70, doorH - 90, 6, glassMat, 0, cy, z + sign * 7);
    } else if (kind === 'perforated') {
      const tex = perforatedTexture(doorColor);
      const perforated = mat(doorColor, {
        map: tex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
      });
      addBox(g, doorW, doorH, 12, perforated, 0, cy, z);
      // opaque door frame keeps the cabinet outline readable
      for (const sx of [-1, 1]) addBox(g, 26, doorH, 16, mat(doorColor), sx * (doorW / 2 - 13), cy, z);
      addBox(g, doorW, 26, 16, mat(doorColor), 0, cy + doorH / 2 - 13, z);
      addBox(g, doorW, 26, 16, mat(doorColor), 0, cy - doorH / 2 + 13, z);
    } else if (kind === 'double') {
      for (const sx of [-1, 1]) {
        addBox(g, doorW / 2 - 6, doorH, 12, doorSkin, sx * (doorW / 4), cy, z);
        addBox(g, 18, 90, 14, railMat, sx * 24, cy, z + sign * 10);
      }
    } else {
      addBox(g, doorW, doorH, 12, doorSkin, 0, cy, z);
    }
    // handle
    addBox(g, 18, 120, 22, railMat, doorW / 2 - 60, cy - 60, z + sign * 16);
    addCyl(g, 12, 26, darkMat, doorW / 2 - 60, cy - 60, z + sign * 22, 'z');
    markPart(g);
  }
  buildDoor(f.frontDoor, true);
  buildDoor(f.rearDoor, false);

  // ---------------- placed components ----------------
  for (const item of state.config.items) {
    const c = catalogById(item.catalogId);
    if (!c) continue;
    const g = makePart(root, explodeVector(c.slot, c.geom), item.id);
    buildComponent(g, item, c, f, { rb, rt, frz, rrz, H, W, D }, frameMat, darkMat, railMat);
    markPart(g);
  }

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[];
      const list = Array.isArray(m) ? m : [m];
      for (const material of list) {
        if ('wireframe' in material) (material as THREE.MeshStandardMaterial).wireframe = state.wireframe;
      }
    }
  });
  return root;
}

function explodeVector(slot: string, geom: string): [number, number, number] {
  if (slot === 'top') return [0, 2.0, 0];
  if (slot === 'base') return [0, -1.6, 0];
  if (slot === 'side') return [2.0, 0, 0];
  if (slot === 'vertical') return [geom === 'pdu-v' ? 1.6 : 0.8, 0, 0];
  if (slot === 'rear') return [0, 0, -2.2];
  return [0, 0, 2.2];
}

interface Dims { rb: number; rt: number; frz: number; rrz: number; H: number; W: number; D: number }

function buildComponent(
  g: THREE.Group, item: PlacedItem, c: NonNullable<ReturnType<typeof catalogById>>,
  f: FrameConfig, d: Dims, frameMat: StdMat, darkMat: StdMat, railMat: StdMat,
): void {
  const bodyMat = mat(item.color || '#5a6d82', { metalness: 0.34, roughness: 0.52 });
  const faceMat = mat('#314252', { metalness: 0.34, roughness: 0.5 });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x43d17f });
  const portMat = mat('#0c1117', { metalness: 0.3, roughness: 0.8 });

  // Non-U accessories mounted on doors / rails / top / base.
  if (!occupiesU(c)) {
    switch (c.slot) {
      case 'top': {
        if (c.geom === 'fan') {
          addBox(g, d.W - 120, 44, d.D / 3, darkMat, 0, d.H - 34, 0);
          for (let i = -1; i <= 1; i++) {
            addCyl(g, 58, 10, railMat, i * (d.W - 160) / 3, d.H - 8, 0);
            addCyl(g, 16, 12, darkMat, i * (d.W - 160) / 3, d.H - 2, 0);
          }
        } else {
          addBox(g, d.W - 80, 8, d.D - 80, frameMat, 0, d.H + 12, 0);
        }
        break;
      }
      case 'base': {
        addBox(g, d.W - 80, 26, d.D - 80, c.geom === 'caster' ? railMat : frameMat, 0, 24, 0);
        if (c.geom === 'caster') {
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            addCyl(g, 34, 22, darkMat, sx * (d.W / 2 - 70), -14, sz * (d.D / 2 - 70), 'x');
          }
        }
        break;
      }
      case 'side': {
        const side = mat(item.color || f.color, { transparent: true, opacity: 0.18, side: THREE.DoubleSide });
        for (const sx of [-1, 1]) addBox(g, 8, d.H - f.plinth - 60, d.D - 60, side, sx * (d.W / 2 - 22), f.plinth + (d.H - f.plinth - 60) / 2 + 20, 0);
        break;
      }
      case 'vertical': {
        const px = d.W / 2 - 70;
        const pz = d.frz - 110;
        const h = f.heightU * U_MM - 20;
        addBox(g, 48, h, 62, faceMat, px, d.rb + h / 2, pz);
        const outlets = Math.min(24, Math.floor(h / 38));
        for (let i = 0; i < outlets; i++) {
          addBox(g, 30, 22, 4, portMat, px, d.rb + 24 + i * (h - 46) / Math.max(1, outlets - 1), pz + 33);
        }
        addLabelPlane(g, c.partNo, 42, 60, px, d.rb + h - 40, pz + 34);
        break;
      }
      default: {
        // small door / rail mounted hardware
        addBox(g, 46, 70, 24, railMat, d.W / 2 - 110, d.H * 0.55, d.D / 2 + 4);
        if (c.geom === 'label' || c.geom === 'logo') {
          addLabelPlane(g, item.label || c.partNo, 120, 32, d.W / 2 - 110, d.H * 0.55 + 55, d.D / 2 + 18);
        }
      }
    }
    return;
  }

  // ---- U-mounted component ----
  const h = c.uSize * U_MM - 3;
  const yBottom = d.rb + (item.u - 1) * U_MM;
  const cy = yBottom + c.uSize * U_MM / 2;
  const isRear = item.slot === 'rear';
  const railZ = isRear ? d.rrz : d.frz;
  const sign = isRear ? -1 : 1;
  const faceZ = railZ + sign * 2;
  const deviceDepth = Math.max(40, c.depth || 120);
  const bodyZ = railZ - sign * deviceDepth / 2;

  // chassis + 19" front panel
  addBox(g, RAIL_OPENING_MM - 20, h * 0.86, deviceDepth, bodyMat, 0, cy, bodyZ);
  const panelMat = c.geom === 'blank' || c.geom === 'cutout'
    ? mat(item.color || f.color, { metalness: 0.6 }) : faceMat;
  addBox(g, PANEL_19_MM, h, 4, panelMat, 0, cy, faceZ);
  for (const sx of [-1, 1]) {
    addBox(g, 22, c.uSize * 12, 8, railMat, sx * (PANEL_19_MM / 2 - 11), cy, faceZ + sign * 4);
  }

  switch (c.geom) {
    case 'server': case 'ups': {
      const bays = c.uSize >= 2 ? 6 : 4;
      for (let i = 0; i < bays; i++) {
        const bx = -150 + i * (300 / bays);
        addBox(g, 300 / bays - 8, Math.min(28, h * 0.5), 4, portMat, bx, cy, faceZ + sign * 3);
      }
      addBox(g, 40, 8, 4, ledMat, 165, cy + h * 0.3, faceZ + sign * 3);
      addBox(g, 40, 8, 4, ledMat, 165, cy + h * 0.15, faceZ + sign * 3);
      break;
    }
    case 'switch': case 'patch': case 'kvm': {
      const n = c.geom === 'kvm' ? 8 : 20;
      for (let i = 0; i < n; i++) {
        const bx = -170 + i * (340 / n);
        addBox(g, 340 / n - 3, 15, 4, portMat, bx, cy - 4, faceZ + sign * 3);
        if (i % 2 === 0) addBox(g, 5, 5, 4, ledMat, bx, cy + 12, faceZ + sign * 3);
      }
      break;
    }
    case 'pdu-h': {
      for (let i = 0; i < 8; i++) addBox(g, 26, 20, 4, portMat, -160 + i * 46, cy, faceZ + sign * 3);
      break;
    }
    case 'fan': {
      for (let i = -1; i <= 1; i++) {
        addCyl(g, 52, 6, railMat, i * 145, cy, faceZ + sign * 5, 'z');
        addCyl(g, 12, 8, darkMat, i * 145, cy, faceZ + sign * 10, 'z');
      }
      break;
    }
    case 'shelf': {
      addBox(g, RAIL_OPENING_MM - 20, 8, deviceDepth, railMat, 0, yBottom + 12, bodyZ);
      break;
    }
    case 'cable': {
      for (let i = 0; i < 9; i++) addBox(g, 16, h * 0.6, 26, railMat, -180 + i * 45, cy, faceZ + sign * 18);
      break;
    }
    case 'brush': {
      addBox(g, PANEL_19_MM - 60, h * 0.55, 12, darkMat, 0, cy, faceZ + sign * 6);
      break;
    }
    case 'cutout': {
      const holes = 3;
      for (let i = 0; i < holes; i++) {
        addCyl(g, 26, 8, darkMat, -140 + i * 140, cy, faceZ + sign * 5, 'z');
      }
      break;
    }
    case 'logo': case 'label': {
      addLabelPlane(g, item.label || c.partNo, PANEL_19_MM - 80, Math.min(h - 6, 34), 0, cy, faceZ + sign * 4, 0);
      break;
    }
    case 'blank': break;
    default: break;
  }

  if (item.label && (c.geom === 'server' || c.geom === 'switch')) {
    addLabelPlane(g, item.label, 170, 16, -110, cy + h * 0.34, faceZ + sign * 5, 0);
  }
}

/** Convert a world-space Y coordinate (in scene units) to a 1-based U index. */
export function yToU(worldY: number, f: FrameConfig): number | null {
  const yMm = worldY / S;
  const u = Math.floor((yMm - rackBottom(f)) / U_MM) + 1;
  if (u < 1 || u > f.heightU) return null;
  return u;
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    const list = Array.isArray(m) ? m : [m];
    for (const material of list) {
      const withMap = material as THREE.MeshStandardMaterial;
      if (withMap.map) withMap.map.dispose();
      material.dispose();
    }
  });
}
