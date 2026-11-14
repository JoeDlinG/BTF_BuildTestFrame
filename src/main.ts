import './styles.css';
import * as THREE from 'three';
import { store } from './core/state';
import type { AppState, FrameConfig, ProjectConfig } from './core/types';
import { applyStaticI18n, L, setLang } from './core/i18n';
import { parseLength } from './core/units';
import { PRESETS } from './core/standards';
import { catalogById, clampDepth, clampUSize } from './core/catalog';
import { buildBom } from './core/bom';
import { validate } from './core/validation';
import {
  exportBomCsv, exportGlb, exportPng, exportProjectJson, exportStl, readProjectFile,
} from './core/export';
import { exportStep } from './core/step';
import { exportPdf } from './core/pdf';
import { Viewer } from './scene/Viewer';
import {
  renderBom, renderChecks, renderInspector, renderLibrary, renderStatus,
  renderWizard, showHelp, toast,
} from './ui/panels';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const viewport = $('viewport');
const stage = document.querySelector('.stage') as HTMLElement;
const viewer = new Viewer(viewport);

const els = {
  wizard: $('panel-wizard'), library: $('panel-library'),
  inspector: $('panel-inspector'), checks: $('panel-checks'), bom: $('panel-bom'),
  statusDot: $('status-dot'), statusText: $('status-text'), statusMetrics: $('status-metrics'),
  overlayStandard: $('overlay-standard'), overlayHint: $('overlay-hint'),
  dropHint: $('drop-hint'), exportMenu: $('export-menu'), fileInput: $('file-input') as HTMLInputElement,
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderAll(s: AppState): void {
  applyStaticI18n();
  document.querySelectorAll<HTMLElement>('#unit-switch button').forEach((b) =>
    b.classList.toggle('active', b.dataset.unit === s.unit));
  document.querySelectorAll<HTMLElement>('#lang-switch button').forEach((b) =>
    b.classList.toggle('active', b.dataset.lang === s.lang));
  document.querySelectorAll<HTMLElement>('#view-tools [data-view]').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === s.view));
  $('btn-explode').classList.toggle('active', s.explode);
  $('btn-wireframe').classList.toggle('active', s.wireframe);
  $('btn-dimensions').classList.toggle('active', s.dimensions);

  document.querySelectorAll<HTMLElement>('#left-tabs button').forEach((b) =>
    b.classList.toggle('active', b.dataset.panel === s.leftTab));
  document.querySelectorAll<HTMLElement>('#right-tabs button').forEach((b) =>
    b.classList.toggle('active', b.dataset.panel === s.rightTab));
  ['wizard', 'library'].forEach((p) =>
    els[p as 'wizard' | 'library'].classList.toggle('active', s.leftTab === p));
  ['inspector', 'checks', 'bom'].forEach((p) =>
    els[p as 'inspector' | 'checks' | 'bom'].classList.toggle('active', s.rightTab === p));

  els.wizard.innerHTML = renderWizard(s);
  els.library.innerHTML = renderLibrary(s);
  els.inspector.innerHTML = renderInspector(s);
  els.checks.innerHTML = renderChecks(s);
  els.bom.innerHTML = renderBom(s);

  const st = renderStatus(s);
  els.statusDot.className = `status-dot ${st.dot}`;
  els.statusText.textContent = st.text;
  els.statusMetrics.textContent = st.metrics;
  els.overlayStandard.textContent = s.unit === 'metric'
    ? L('国标 / 公制 · GB/T 19520.1 · IEC 60297', 'Metric · GB/T 19520.1 · IEC 60297')
    : L('英制 · EIA-310-E', 'Imperial · EIA-310-E');
  els.overlayHint.innerHTML = L(
    '左键旋转 · 滚轮缩放 · 右键平移<br/>点击部件选中 · 拖拽组件到 U 位',
    'Left-drag orbit · wheel zoom · right-drag pan<br/>Click to select · drag parts onto U slots',
  );

  viewer.sync(s);
}

store.subscribe(renderAll);
setLang(store.state.lang);
renderAll(store.state);

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------
$('unit-switch').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-unit]');
  if (!b || !b.dataset.unit) return;
  store.patch({ unit: b.dataset.unit as AppState['unit'] });
  toast(L(
    `已切换到${b.dataset.unit === 'metric' ? '公制 / 国标 (mm, kg)' : '英制 (in, lb)'}`,
    `Switched to ${b.dataset.unit === 'metric' ? 'metric / GB (mm, kg)' : 'imperial (in, lb)'}`,
  ), 'success');
});

$('lang-switch').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lang]');
  if (!b || !b.dataset.lang) return;
  setLang(b.dataset.lang as AppState['lang']);
  store.patch({ lang: b.dataset.lang as AppState['lang'] });
});

$('btn-new').addEventListener('click', () => {
  if (!confirm(L('新建配置将清空当前机柜，继续？', 'Start a new configuration? The current rack will be cleared.'))) return;
  store.newProject();
  viewer.resetCamera();
  toast(L('已新建空白机柜', 'New empty rack created'), 'success');
});

$('btn-open').addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files?.[0];
  if (!file) return;
  try {
    const cfg = await readProjectFile(file) as ProjectConfig;
    store.loadProject(cfg);
    viewer.resetCamera();
    toast(L(`已载入 ${file.name}`, `Loaded ${file.name}`), 'success');
  } catch {
    toast(L('配置文件无效或格式不兼容', 'Invalid or incompatible configuration file'), 'error');
  }
  els.fileInput.value = '';
});

$('btn-export-toggle').addEventListener('click', (e) => {
  e.stopPropagation();
  els.exportMenu.hidden = !els.exportMenu.hidden;
});
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.dropdown')) els.exportMenu.hidden = true;
});
$('btn-help').addEventListener('click', showHelp);

// Clone the model, drop instanced meshes (U holes) and restore the assembled
// (non-exploded) position of every part so CAD exports are always the real
// assembly, even when the user currently has the exploded view enabled.
function modelForExport(): THREE.Group {
  const src = viewer.model;
  const root = src.clone(true);
  const drop: THREE.Object3D[] = [];
  root.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) drop.push(o); });
  drop.forEach((o) => o.removeFromParent());
  src.children.forEach((part, i) => {
    const base = (part.userData as { base?: THREE.Vector3 }).base;
    const target = root.children[i];
    if (target) target.position.copy(base ?? new THREE.Vector3());
  });
  root.updateMatrixWorld(true);
  return root;
}

async function doExport(kind: string): Promise<void> {
  const s = store.state;
  try {
    switch (kind) {
      case 'json': exportProjectJson(s.config); break;
      case 'csv': exportBomCsv(buildBom(s.config, s.unit), s.config, s.unit); break;
      case 'png': exportPng(viewer.capture(), s.config); break;
      case 'stl': exportStl(modelForExport(), s.config); break;
      case 'glb': await exportGlb(modelForExport(), s.config); break;
      case 'step': exportStep(modelForExport(), s.config); break;
      case 'pdf': exportPdf({
        state: s,
        rows: buildBom(s.config, s.unit),
        checks: validate(s),
        view: viewer.capture(),
      }); break;
      default: return;
    }
    const label = kind === 'step' ? 'STEP / STP' : kind.toUpperCase();
    toast(L(`已导出 ${label} 文件`, `Exported ${label} file`), 'success');
  } catch (err) {
    console.error(err);
    toast(L(`导出失败：${kind.toUpperCase()}`, `Export failed: ${kind.toUpperCase()}`), 'error');
  }
}

els.exportMenu.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-export]');
  if (!b?.dataset.export) return;
  els.exportMenu.hidden = true;
  void doExport(b.dataset.export);
});
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-export]');
  if (b?.dataset.export && !b.closest('.dropdown-menu')) void doExport(b.dataset.export);
});

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
$('left-tabs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-panel]');
  if (b?.dataset.panel) store.patch({ leftTab: b.dataset.panel as AppState['leftTab'] });
});
$('right-tabs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-panel]');
  if (b?.dataset.panel) store.patch({ rightTab: b.dataset.panel as AppState['rightTab'] });
});

// ---------------------------------------------------------------------------
// Frame wizard
// ---------------------------------------------------------------------------
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

els.wizard.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const presetBtn = t.closest<HTMLElement>('[data-preset]');
  if (presetBtn?.dataset.preset) {
    const p = PRESETS.find((x) => x.id === presetBtn.dataset.preset);
    if (!p) return;
    store.patch({ unit: p.id.startsWith('eia') ? 'imperial' : 'metric' });
    store.patchFrame({ heightU: p.heightU, width: p.width, depth: p.depth, frameType: p.frameType });
    viewer.resetCamera();
    toast(`${L('已应用预设', 'Preset applied')}: ${p.name[store.state.lang]}`, 'success');
    return;
  }
  const sw = t.closest<HTMLElement>('[data-swatch]');
  if (sw?.dataset.swatch && sw.dataset.target) {
    store.patchFrame({ [sw.dataset.target]: sw.dataset.swatch } as Partial<FrameConfig>);
  }
});

els.wizard.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  const field = t.dataset.field;
  if (!field) return;
  const kind = t.dataset.kind;
  const value = t.value;

  if (field === 'name') {
    store.patch({ config: { ...store.state.config, name: value.trim() || 'BTF-Rack-01' } });
    return;
  }
  if (kind === 'length') {
    const mmv = parseLength(value, store.state.unit);
    if (mmv === null || !Number.isFinite(mmv)) {
      toast(L('无法解析尺寸，请输入如 600mm / 24in / 0.6m', 'Cannot parse dimension; try 600mm / 24in / 0.6m'), 'error');
      renderAll(store.state);
      return;
    }
    const ranges: Record<string, [number, number]> = {
      width: [300, 1400], depth: [300, 1800], plinth: [0, 400],
      frontRailOffset: [0, 400], rearRailOffset: [0, 400],
    };
    const [lo, hi] = ranges[field] || [0, 5000];
    const v = clamp(mmv, lo, hi);
    store.patchFrame({ [field]: v } as Partial<FrameConfig>);
    return;
  }
  if (kind === 'enum') {
    const patch: Record<string, unknown> = { [field]: field === 'heightU' ? Number(value) : value };
    store.patchFrame(patch as Partial<FrameConfig>);
    if (field === 'heightU' || field === 'width' || field === 'depth') viewer.resetCamera();
    return;
  }
  if (kind === 'bool') {
    store.patchFrame({ [field]: (t as HTMLInputElement).checked } as Partial<FrameConfig>);
    return;
  }
  if (kind === 'color') {
    store.patchFrame({ [field]: value } as Partial<FrameConfig>);
  }
});

// ---------------------------------------------------------------------------
// Component library: drag & drop + search + quick add
// ---------------------------------------------------------------------------
let dragCatalog: string | null = null;
let dragU: number | null = null;

els.library.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const cat = t.closest<HTMLElement>('[data-cat]');
  if (cat?.dataset.cat) {
    store.patch({ libraryCat: cat.dataset.cat as AppState['libraryCat'] });
    return;
  }
  const add = t.closest<HTMLElement>('[data-add]');
  if (add?.dataset.add) {
    const id = store.addItem(add.dataset.add, 1);
    if (!id) toast(L('该部件已达到最大数量', 'Maximum quantity reached for this part'), 'warn');
    else store.patch({ rightTab: 'inspector' });
  }
});

els.library.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id !== 'lib-search') return;
  store.state.search = t.value; // local only; avoid re-render while typing
  const q = t.value.trim().toLowerCase();
  els.library.querySelectorAll<HTMLElement>('.lib-item').forEach((el) => {
    const c = catalogById(el.dataset.catalog || '');
    const hay = c ? `${c.name.zh} ${c.name.en} ${c.partNo} ${c.desc.zh} ${c.desc.en}`.toLowerCase() : '';
    el.style.display = !q || hay.includes(q) ? '' : 'none';
  });
});

els.library.addEventListener('dragstart', (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>('[data-catalog]');
  if (!item?.dataset.catalog || !e.dataTransfer) return;
  dragCatalog = item.dataset.catalog;
  e.dataTransfer.setData('text/btf-catalog', item.dataset.catalog);
  e.dataTransfer.effectAllowed = 'copy';
});

stage.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  const id = dragCatalog || e.dataTransfer?.getData('text/btf-catalog') || '';
  if (!id) return;
  dragCatalog = id;
  dragU = viewer.uAtPointer(e.clientX, e.clientY, store.state.config.frame);
  const c = catalogById(id);
  els.dropHint.hidden = false;
  els.dropHint.textContent = c
    ? `${L('放置', 'Drop')} ${c.name[store.state.lang]} → ${dragU ? `U${dragU}` : L('自动空位', 'auto slot')}`
    : L('放置到机柜', 'Drop into rack');
});
stage.addEventListener('dragleave', (e) => {
  if (!stage.contains(e.relatedTarget as Node)) {
    els.dropHint.hidden = true;
    dragCatalog = null;
    dragU = null;
  }
});
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  els.dropHint.hidden = true;
  const id = dragCatalog || e.dataTransfer?.getData('text/btf-catalog');
  const u = viewer.uAtPointer(e.clientX, e.clientY, store.state.config.frame) ?? dragU ?? 1;
  dragCatalog = null;
  dragU = null;
  if (!id) return;
  const newId = store.addItem(id, u);
  if (!newId) {
    toast(L('该部件已达到最大数量或无法放入', 'Part limit reached or cannot be placed'), 'warn');
    return;
  }
  store.patch({ rightTab: 'inspector' });
  toast(L('部件已添加到机柜', 'Component added to rack'), 'success');
});

// ---------------------------------------------------------------------------
// Inspector / checks / bom interactions
// ---------------------------------------------------------------------------
function selectItem(id: string): void {
  store.patch({ selectedId: id, rightTab: 'inspector' });
}

function bindSelection(host: HTMLElement): void {
  host.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    // Reorder buttons handle their own click; don't treat them as a row selection.
    if (t.closest('[data-order]')) return;
    const remove = t.closest<HTMLElement>('[data-remove]');
    if (remove?.dataset.remove) {
      e.stopPropagation();
      store.removeItem(remove.dataset.remove);
      return;
    }
    const sel = t.closest<HTMLElement>('[data-select]');
    if (sel?.dataset.select) selectItem(sel.dataset.select);
  });
}
bindSelection(els.inspector);
bindSelection(els.checks);

els.inspector.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const ob = t.closest<HTMLElement>('[data-order]');
  if (ob?.dataset.order && ob.dataset.orderId) {
    store.shiftOrder(ob.dataset.orderId, ob.dataset.order === 'up' ? -1 : 1);
    return;
  }
  const b = t.closest<HTMLElement>('[data-act]');
  if (!b?.dataset.act) return;
  const id = store.state.selectedId;
  if (!id) return;
  const item = store.state.config.items.find((i) => i.id === id);
  if (!item) return;
  switch (b.dataset.act) {
    case 'up': store.moveItem(id, item.u + 1); break;
    case 'down': store.moveItem(id, item.u - 1); break;
    case 'delete': store.removeItem(id); break;
    case 'duplicate': store.duplicateItem(id); break;
    case 'clear':
      if (confirm(L('清空所有已装配组件？', 'Remove all assembled components?'))) store.setItems([]);
      break;
  }
});

els.inspector.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  const key = t.dataset.item;
  const id = store.state.selectedId;
  if (!key || !id) return;
  const item = store.state.config.items.find((i) => i.id === id);
  const c = item ? catalogById(item.catalogId) : null;
  if (key === 'u') {
    const n = Number(t.value);
    const before = item?.u;
    store.moveItem(id, n);
    const after = store.state.config.items.find((i) => i.id === id)?.u;
    if (before === after && Number.isFinite(n)) {
      toast(L('该 U 位已被占用或超出范围', 'That U position is occupied or out of range'), 'warn');
      renderAll(store.state);
    }
  } else if (key === 'name') {
    const v = t.value.trim().slice(0, 60);
    store.updateItem(id, { name: v || undefined });
  } else if (key === 'label') {
    store.updateItem(id, { label: t.value });
  } else if (key === 'color') {
    store.updateItem(id, { color: t.value });
  } else if (key === 'uSize' && c) {
    const n = clampUSize(c, Number(t.value));
    const beforeU = item?.u;
    if (!store.resizeItem(id, { uSize: n })) {
      toast(L('空间不足，无法调整为所选 U 高', 'Not enough free U space for that height'), 'warn');
      renderAll(store.state);
    } else {
      const afterU = store.state.config.items.find((i) => i.id === id)?.u;
      if (beforeU !== undefined && afterU !== undefined && beforeU !== afterU) {
        toast(L(`U 高改变后已自动移到 U${afterU} 以避开冲突`, `Height changed; auto-moved to U${afterU} to avoid overlap`), 'info');
      }
    }
  } else if (key === 'depth' && c) {
    const mmv = parseLength(t.value, store.state.unit);
    if (mmv === null || !Number.isFinite(mmv)) {
      toast(L('无法解析深度，请输入如 600mm / 24in', 'Cannot parse depth; try 600mm / 24in'), 'error');
      renderAll(store.state);
      return;
    }
    if (!store.resizeItem(id, { depth: clampDepth(c, mmv) })) {
      toast(L('空间不足，无法调整该深度', 'Not enough space for that depth'), 'warn');
      renderAll(store.state);
    }
  }
});

// ---------------------------------------------------------------------------
// Reorder the assembled list: HTML5 drag & drop plus the ▲▼ buttons.
// The store re-assigns U positions so list order always equals rack order.
// ---------------------------------------------------------------------------
let orderDragId: string | null = null;

function clearDragMarks(): void {
  els.inspector.querySelectorAll('.item-row.dragging, .item-row.drag-over')
    .forEach((el) => el.classList.remove('dragging', 'drag-over'));
}

els.inspector.addEventListener('dragstart', (e) => {
  const row = (e.target as HTMLElement).closest<HTMLElement>('.item-row[draggable="true"]');
  if (!row?.dataset.orderId || !e.dataTransfer) return;
  orderDragId = row.dataset.orderId;
  e.dataTransfer.setData('text/btf-order', orderDragId);
  e.dataTransfer.effectAllowed = 'move';
  row.classList.add('dragging');
});
els.inspector.addEventListener('dragover', (e) => {
  if (!orderDragId) return;
  const row = (e.target as HTMLElement).closest<HTMLElement>('.item-row[draggable="true"]');
  if (!row) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  els.inspector.querySelectorAll('.item-row.drag-over')
    .forEach((el) => el.classList.remove('drag-over'));
  if (row.dataset.orderId !== orderDragId) row.classList.add('drag-over');
});
els.inspector.addEventListener('drop', (e) => {
  if (!orderDragId) return;
  e.preventDefault();
  const row = (e.target as HTMLElement).closest<HTMLElement>('.item-row[draggable="true"]');
  const targetId = row?.dataset.orderId;
  const dragId = orderDragId;
  clearDragMarks();
  orderDragId = null;
  if (targetId && targetId !== dragId) {
    const ids = store.orderedUIds();
    store.moveOrderTo(dragId, ids.indexOf(targetId));
  }
});
els.inspector.addEventListener('dragend', () => {
  clearDragMarks();
  orderDragId = null;
});

// ---------------------------------------------------------------------------
// 3D viewport: picking + view tools
// ---------------------------------------------------------------------------
viewport.addEventListener('click', (e) => {
  const id = viewer.pick(e.clientX, e.clientY);
  store.patch({ selectedId: id, rightTab: id ? 'inspector' : store.state.rightTab });
});

$('view-tools').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!b) return;
  if (b.dataset.view) {
    store.patch({ view: b.dataset.view as AppState['view'] });
    viewer.setView(b.dataset.view as AppState['view']);
    return;
  }
  switch (b.id) {
    case 'btn-explode': store.patch({ explode: !store.state.explode }); break;
    case 'btn-wireframe': store.patch({ wireframe: !store.state.wireframe }); break;
    case 'btn-dimensions': store.patch({ dimensions: !store.state.dimensions }); break;
    case 'btn-reset-camera': viewer.resetCamera(); break;
  }
});

document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && store.state.selectedId) {
    e.preventDefault();
    store.removeItem(store.state.selectedId);
  }
  if (e.key === 'Escape') {
    store.patch({ selectedId: null });
    $('modal-host').hidden = true;
    $('modal-host').innerHTML = '';
  }
});

window.addEventListener('resize', () => viewer.sync(store.state));
