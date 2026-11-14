import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { AppState, FrameConfig, ViewMode } from '../core/types';
import { cabinetHeight, U_MM } from '../core/standards';
import { displayLength, standardLabel } from '../core/units';
import { L } from '../core/i18n';
import { buildCabinet, disposeObject, frontRailZ, mm, rackBottom, S, yToU } from './builders';

interface PartUserData {
  base: THREE.Vector3;
  explodeVec: THREE.Vector3;
  itemId?: string;
  [key: string]: unknown;
}

export class Viewer {
  private host: HTMLElement;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private controls: OrbitControls;
  private grid: THREE.GridHelper;
  private modelRoot: THREE.Group | null = null;
  private dimGroup = new THREE.Group();
  private selectionBox: THREE.BoxHelper | null = null;
  private raycaster = new THREE.Raycaster();
  private resizeObserver: ResizeObserver;
  private explodeTarget = 0;
  private explodeCurrent = 0;
  private lastKey = '';
  private lastFitKey = '';
  private radius = 22;
  private height = 20;
  private currentState: AppState | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    this.scene.background = new THREE.Color('#0b0f15');
    this.scene.fog = new THREE.Fog('#0b0f15', 70, 190);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    host.appendChild(this.renderer.domElement);

    // A generated PBR environment is essential: metallic materials are almost
    // black without one (they reflect the environment, not diffuse light).
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    } catch (err) {
      console.warn('Environment map unavailable, using direct lights only.', err);
    }
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.labelRenderer.domElement.style.zIndex = '3';
    host.appendChild(this.labelRenderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xa8c0dc, 0x1a222c, 1.45));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(14, 28, 20);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -30; key.shadow.camera.right = 30;
    key.shadow.camera.top = 30; key.shadow.camera.bottom = -30;
    key.shadow.camera.near = 1; key.shadow.camera.far = 90;
    key.shadow.bias = -0.0004;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x7799dd, 0.75);
    fill.position.set(-16, 12, -14);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd9c0, 0.35);
    rim.position.set(0, 8, -22);
    this.scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.ShadowMaterial({ opacity: 0.28 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.grid = new THREE.GridHelper(120, 60, 0x2a3644, 0x1a222c);
    this.grid.position.y = -0.01;
    this.scene.add(this.grid);
    this.scene.add(this.dimGroup);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 90;
    this.controls.maxPolarAngle = Math.PI * 0.495;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.animate();
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.labelRenderer.setSize(w, h);
  }

  /** Full rebuild only when geometry-relevant state changes. */
  sync(state: AppState): void {
    this.currentState = state;
    const key = JSON.stringify({
      config: state.config, unit: state.unit, lang: state.lang,
      dimensions: state.dimensions, wireframe: state.wireframe,
    });
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.rebuild(state);
    }
    this.explodeTarget = state.explode ? 1 : 0;
    this.dimGroup.visible = state.dimensions;
    this.updateSelection(state.selectedId);
  }

  private rebuild(state: AppState): void {
    if (this.modelRoot) {
      this.scene.remove(this.modelRoot);
      disposeObject(this.modelRoot);
      this.modelRoot = null;
    }
    this.modelRoot = buildCabinet(state);
    this.scene.add(this.modelRoot);

    const f = state.config.frame;
    this.radius = Math.max(cabinetHeight(f), f.width, f.depth) * S * 1.35;
    this.height = cabinetHeight(f) * S;
    // Only reframe the camera when the outer dimensions change, so editing
    // components does not undo the user's orbit / zoom.
    const fitKey = `${f.heightU}|${f.width}|${f.depth}|${f.plinth}`;
    if (fitKey !== this.lastFitKey) {
      this.lastFitKey = fitKey;
      this.fitCamera();
    }
    this.buildDimensions(state);
    this.updateSelection(state.selectedId);
  }

  private fitCamera(): void {
    const r = this.radius;
    this.controls.target.set(0, this.height * 0.48, 0);
    this.camera.position.set(r * 0.82, this.height * 0.78, r * 1.12);
    this.camera.far = r * 14;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setView(mode: ViewMode): void {
    const r = this.radius, h = this.height;
    const t = new THREE.Vector3(0, h * 0.48, 0);
    const map: Record<ViewMode, THREE.Vector3> = {
      iso: new THREE.Vector3(r * 0.82, h * 0.78, r * 1.12),
      front: new THREE.Vector3(0.001, h * 0.5, r * 1.45),
      rear: new THREE.Vector3(0.001, h * 0.5, -r * 1.45),
      side: new THREE.Vector3(r * 1.45, h * 0.5, 0.001),
      top: new THREE.Vector3(0.001, r * 1.6, 0.02),
    };
    this.camera.position.copy(map[mode]);
    this.controls.target.copy(t);
    this.controls.update();
  }

  resetCamera(): void { this.fitCamera(); }

  private buildDimensions(state: AppState): void {
    this.dimGroup.clear();
    const f = state.config.frame;
    const W = f.width, D = f.depth, H = cabinetHeight(f);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x4b7fc4, transparent: true, opacity: 0.85 });
    const addLine = (pts: THREE.Vector3[]) => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.dimGroup.add(new THREE.Line(geo, lineMat));
    };
    const addTag = (text: string, cls: string, x: number, y: number, z: number) => {
      const div = document.createElement('div');
      div.className = cls;
      div.textContent = text;
      const obj = new CSS2DObject(div);
      obj.position.set(mm(x), mm(y), mm(z));
      this.dimGroup.add(obj);
    };

    const xh = -W / 2 - 170;
    addLine([new THREE.Vector3(mm(xh), 0, mm(D / 2 + 30)), new THREE.Vector3(mm(xh), mm(H), mm(D / 2 + 30))]);
    addLine([new THREE.Vector3(mm(xh - 40), 0, mm(D / 2 + 30)), new THREE.Vector3(mm(xh + 40), 0, mm(D / 2 + 30))]);
    addLine([new THREE.Vector3(mm(xh - 40), mm(H), mm(D / 2 + 30)), new THREE.Vector3(mm(xh + 40), mm(H), mm(D / 2 + 30))]);
    addTag(`${L('高', 'H')} ${displayLength(H, state.unit)}`, 'dim-label', xh, H / 2, D / 2 + 30);

    const zw = D / 2 + 170;
    addLine([new THREE.Vector3(mm(-W / 2), mm(28), mm(zw)), new THREE.Vector3(mm(W / 2), mm(28), mm(zw))]);
    addTag(`${L('宽', 'W')} ${displayLength(W, state.unit)}`, 'dim-label', 0, 28, zw);

    const xd = W / 2 + 170;
    addLine([new THREE.Vector3(mm(xd), mm(28), mm(-D / 2)), new THREE.Vector3(mm(xd), mm(28), mm(D / 2))]);
    addTag(`${L('深', 'D')} ${displayLength(D, state.unit)}`, 'dim-label', xd, 28, 0);

    addTag(`19″ / ${displayLength(482.6, state.unit, 1)} · ${f.heightU}U`, 'dim-label', 0, H + 130, 0);
    addTag(standardLabel(state.unit), 'dim-label', 0, -110, D / 2 + 40);

    // U ruler, one label every 5U
    const rb = rackBottom(f);
    for (let u = 5; u <= f.heightU; u += 5) {
      const y = rb + (u - 0.5) * U_MM;
      addTag(`${u}U`, 'u-label', -W / 2 - 62, y, frontRailZ(f) + 20);
      addLine([
        new THREE.Vector3(mm(-W / 2 - 45), mm(y), mm(frontRailZ(f) + 20)),
        new THREE.Vector3(mm(-W / 2 - 8), mm(y), mm(frontRailZ(f) + 20)),
      ]);
    }
  }

  private updateSelection(id: string | null): void {
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox.geometry.dispose();
      (this.selectionBox.material as THREE.Material).dispose();
      this.selectionBox = null;
    }
    if (!id || !this.modelRoot) return;
    const part = this.modelRoot.children.find((c) => (c.userData as PartUserData).itemId === id);
    if (!part) return;
    this.selectionBox = new THREE.BoxHelper(part, 0x4f9dff);
    (this.selectionBox.material as THREE.LineBasicMaterial).depthTest = false;
    this.scene.add(this.selectionBox);
  }

  /** Pick a placed component; returns its id or null. */
  pick(clientX: number, clientY: number): string | null {
    if (!this.modelRoot) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.modelRoot.children, true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        const id = (o.userData as PartUserData).itemId;
        if (id) return id;
        o = o.parent;
      }
    }
    return null;
  }

  /** Convert a pointer position to a U index on the front 19" plane. */
  uAtPointer(clientX: number, clientY: number, f: FrameConfig): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const planeZ = frontRailZ(f) * S;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeZ);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, p)) return null;
    if (Math.abs(p.x) > (f.width / 2 + 60) * S) return null;
    return yToU(p.y, f);
  }

  capture(): HTMLCanvasElement {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }

  get model(): THREE.Group {
    return this.modelRoot || new THREE.Group();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.explodeCurrent += (this.explodeTarget - this.explodeCurrent) * 0.14;
    if (this.modelRoot) {
      for (const child of this.modelRoot.children) {
        const ud = child.userData as PartUserData;
        if (ud.base && ud.explodeVec) {
          child.position.copy(ud.base).addScaledVector(ud.explodeVec, this.explodeCurrent);
        }
      }
    }
    if (this.selectionBox) this.selectionBox.update();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };
}
