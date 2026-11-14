import type { AppState, FrameConfig, Lang, PlacedItem, ProjectConfig, UnitSystem } from './types';
import { defaultFrame } from './standards';
import { L } from './i18n';
import {
  catalogById, clampDepth, clampUSize, defaultOverrides, isConfigurable,
  itemOccupiesU, itemUSize, occupiesU,
} from './catalog';

const PROJECT_KEY = 'btf.project.v1';
const PREFS_KEY = 'btf.prefs.v1';

type Listener = (state: AppState) => void;

function uid(): string {
  return `it_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function freshProject(): ProjectConfig {
  return {
    version: 1,
    name: 'BTF-Rack-01',
    frame: defaultFrame(),
    items: [],
    createdAt: new Date().toISOString(),
  };
}

function safeParseProject(raw: string | null): ProjectConfig | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<ProjectConfig>;
    if (!data || !data.frame || !Array.isArray(data.items)) return null;
    return normalizeProject(data);
  } catch {
    return null;
  }
}

/** Merge possibly-incomplete imported data onto defaults so old files still load. */
export function normalizeProject(data: Partial<ProjectConfig>): ProjectConfig {
  const base = freshProject();
  const frame: FrameConfig = { ...base.frame, ...(data.frame || {}) };
  const items: PlacedItem[] = (data.items || [])
    .filter((i) => i && typeof i.catalogId === 'string' && catalogById(i.catalogId))
    .map((i) => {
      const c = catalogById(i.catalogId)!;
      const out: PlacedItem = {
        id: typeof i.id === 'string' ? i.id : uid(),
        catalogId: i.catalogId,
        u: Number.isFinite(Number(i.u)) ? Number(i.u) : 1,
        slot: i.slot || 'front',
        color: i.color,
        label: i.label,
      };
      if (typeof i.name === 'string' && i.name.trim()) out.name = i.name.trim().slice(0, 60);
      if (Number.isFinite(Number(i.uSize)) && (c.uOptions || c.uRange)) {
        out.uSize = clampUSize(c, Number(i.uSize));
      }
      if (Number.isFinite(Number(i.depth)) && isConfigurable(c)) {
        out.depth = clampDepth(c, Number(i.depth));
      }
      return out;
    });
  return {
    version: 1,
    name: typeof data.name === 'string' ? data.name : base.name,
    frame,
    items,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : base.createdAt,
  };
}

function readPrefs(): { unit: UnitSystem; lang: Lang } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return {
      unit: p.unit === 'imperial' ? 'imperial' : 'metric',
      lang: p.lang === 'en' ? 'en' : 'zh',
    };
  } catch {
    return { unit: 'metric', lang: 'zh' };
  }
}

function initialState(): AppState {
  const prefs = readPrefs();
  return {
    config: safeParseProject(localStorage.getItem(PROJECT_KEY)) || freshProject(),
    unit: prefs.unit,
    lang: prefs.lang,
    selectedId: null,
    view: 'iso',
    explode: false,
    wireframe: false,
    dimensions: true,
    libraryCat: 'all',
    search: '',
    leftTab: 'wizard',
    rightTab: 'inspector',
  };
}

class Store {
  state: AppState = initialState();
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(): void {
    try {
      localStorage.setItem(PROJECT_KEY, JSON.stringify(this.state.config));
      localStorage.setItem(PREFS_KEY, JSON.stringify({ unit: this.state.unit, lang: this.state.lang }));
    } catch { /* storage may be unavailable in private mode */ }
    for (const fn of this.listeners) fn(this.state);
  }

  patch(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  patchFrame(partial: Partial<FrameConfig>): void {
    this.state = {
      ...this.state,
      config: { ...this.state.config, frame: { ...this.state.config.frame, ...partial } },
    };
    this.notify();
  }

  setItems(items: PlacedItem[]): void {
    this.state = { ...this.state, config: { ...this.state.config, items } };
    this.notify();
  }

  /** Returns true when [u, u+uSize) is free on the same mounting plane. */
  isUFree(u: number, size: number, slot: string, excludeId?: string): boolean {
    if (u < 1 || u + size - 1 > this.state.config.frame.heightU) return false;
    for (const item of this.state.config.items) {
      if (item.id === excludeId) continue;
      const c = catalogById(item.catalogId);
      if (!c || !occupiesU(c)) continue;
      if (item.slot !== slot) continue;
      const a0 = u, a1 = u + size - 1;
      const b0 = item.u, b1 = item.u + itemUSize(item) - 1;
      if (a0 <= b1 && b0 <= a1) return false;
    }
    return true;
  }

  /** Find a free U slot, preferring the requested position and searching downward first. */
  findFreeU(catalogId: string, preferred: number, slot = 'front', sizeOverride?: number, excludeId?: string): number {
    const c = catalogById(catalogId);
    if (!c || !occupiesU(c)) return 0;
    const size = sizeOverride ?? c.uSize;
    const max = this.state.config.frame.heightU - size + 1;
    if (max < 1) return 1;
    const start = Math.max(1, Math.min(max, Math.round(preferred || 1)));
    if (this.isUFree(start, size, slot, excludeId)) return start;
    for (let d = 1; d <= max; d++) {
      const below = start - d;
      if (below >= 1 && this.isUFree(below, size, slot, excludeId)) return below;
      const above = start + d;
      if (above <= max && this.isUFree(above, size, slot, excludeId)) return above;
    }
    return start;
  }

  addItem(catalogId: string, u?: number, slot?: PlacedItem['slot']): string | null {
    const c = catalogById(catalogId);
    if (!c) return null;
    if (c.maxPerRack) {
      const count = this.state.config.items.filter((i) => i.catalogId === catalogId).length;
      if (count >= c.maxPerRack) return null;
    }
    const targetSlot = slot || c.slot;
    const overrides = defaultOverrides(c);
    const size = overrides.uSize ?? c.uSize;
    const targetU = occupiesU(c) ? this.findFreeU(catalogId, u ?? 1, targetSlot, size) : 0;
    const item: PlacedItem = { id: uid(), catalogId, u: targetU, slot: targetSlot, ...overrides };
    this.setItems([...this.state.config.items, item]);
    this.state.selectedId = item.id;
    return item.id;
  }

  removeItem(id: string): void {
    this.setItems(this.state.config.items.filter((i) => i.id !== id));
    if (this.state.selectedId === id) this.state.selectedId = null;
  }

  updateItem(id: string, partial: Partial<PlacedItem>): void {
    this.setItems(this.state.config.items.map((i) => (i.id === id ? { ...i, ...partial } : i)));
  }

  moveItem(id: string, u: number): void {
    const item = this.state.config.items.find((i) => i.id === id);
    if (!item) return;
    const c = catalogById(item.catalogId);
    if (!c || !occupiesU(c)) return;
    const size = itemUSize(item);
    const clamped = Math.max(1, Math.min(this.state.config.frame.heightU - size + 1, Math.round(u)));
    if (!this.isUFree(clamped, size, item.slot, id)) return;
    this.updateItem(id, { u: clamped });
  }

  /**
   * Change a placed component's U height / depth. If the new height no longer
   * fits at the current U position, the component is moved to the nearest free
   * slot so the rack never ends up with an overlap. Returns false on no space.
   */
  resizeItem(id: string, patch: { uSize?: number; depth?: number }): boolean {
    const item = this.state.config.items.find((i) => i.id === id);
    if (!item) return false;
    const c = catalogById(item.catalogId);
    if (!c) return false;
    const nextSize = patch.uSize ?? itemUSize(item);
    const maxU = this.state.config.frame.heightU - nextSize + 1;
    if (maxU < 1) return false;
    let u = Math.min(item.u, maxU);
    if (!this.isUFree(u, nextSize, item.slot, id)) {
      u = this.findFreeU(item.catalogId, item.u, item.slot, nextSize, id);
    }
    if (!this.isUFree(u, nextSize, item.slot, id)) return false;
    this.setItems(this.state.config.items.map((i) => (i.id === id ? { ...i, ...patch, u } : i)));
    return true;
  }

  /** Duplicate a placed component, preserving its per-instance name and size. */
  duplicateItem(id: string): string | null {
    const src = this.state.config.items.find((i) => i.id === id);
    if (!src) return null;
    const c = catalogById(src.catalogId);
    if (!c) return null;
    if (c.maxPerRack && this.state.config.items.filter((i) => i.catalogId === c.id).length >= c.maxPerRack) return null;
    const size = itemUSize(src);
    const u = itemOccupiesU(src) ? this.findFreeU(c.id, src.u + size, src.slot, size) : 0;
    const copy: PlacedItem = {
      ...src, id: uid(), u,
      name: src.name ? `${src.name}${L(' · 副本', ' (copy)')}` : undefined,
    };
    this.setItems([...this.state.config.items, copy]);
    this.state.selectedId = copy.id;
    return copy.id;
  }

  /** IDs of U-mounted components, ordered top-to-bottom (descending U). */
  orderedUIds(): string[] {
    return this.state.config.items
      .filter(itemOccupiesU)
      .sort((a, b) => b.u - a.u || a.id.localeCompare(b.id))
      .map((i) => i.id);
  }

  /**
   * Reorder the assembled list and re-assign U positions to match the new order.
   * The existing vertical "anchors" (sorted start-U positions) are reused so
   * components stay near their previous height; overlaps push a component down.
   * If everything cannot fit, the stack is repacked from U1.
   */
  reorderItems(orderedIds: string[]): void {
    const items = this.state.config.items;
    const mountable = items.filter(itemOccupiesU);
    if (mountable.length < 2) return;
    const byId = new Map(mountable.map((i) => [i.id, i]));
    const order: PlacedItem[] = [];
    for (const id of orderedIds) {
      const it = byId.get(id);
      if (it && !order.includes(it)) order.push(it);
    }
    for (const it of mountable) if (!order.includes(it)) order.push(it);

    const anchors = mountable.map((i) => i.u).sort((a, b) => b - a);
    const H = this.state.config.frame.heightU;
    const next = new Map<string, number>();
    let prevU = H + 1;
    order.forEach((it, k) => {
      const size = itemUSize(it);
      const u = Math.max(1, Math.min(anchors[k] ?? it.u, prevU - size, H - size + 1));
      next.set(it.id, u);
      prevU = u;
    });

    // Detect a squeezed stack (only possible when total height exceeds the rack).
    let squeezed = false;
    for (let k = 1; k < order.length; k++) {
      const above = order[k - 1], below = order[k];
      if (next.get(below.id)! + itemUSize(below) - 1 >= next.get(above.id)!) squeezed = true;
    }
    if (squeezed) {
      let cursor = 1;
      [...order].reverse().forEach((it) => {
        next.set(it.id, cursor);
        cursor += itemUSize(it);
      });
    }
    this.setItems(items.map((i) => (next.has(i.id) ? { ...i, u: next.get(i.id)! } : i)));
  }

  /** Move one list entry up (-1) or down (+1) and reflow all U positions. */
  shiftOrder(id: string, delta: number): void {
    const ids = this.orderedUIds();
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    this.reorderItems(ids);
  }

  /** Drop one list entry at a target index (index refers to the pre-drag order). */
  moveOrderTo(id: string, targetIndex: number): void {
    const ids = this.orderedUIds();
    const from = ids.indexOf(id);
    if (from < 0) return;
    ids.splice(from, 1);
    ids.splice(Math.max(0, Math.min(ids.length, targetIndex)), 0, id);
    this.reorderItems(ids);
  }

  loadProject(config: ProjectConfig): void {
    this.state = { ...this.state, config: normalizeProject(config), selectedId: null };
    this.notify();
  }

  newProject(): void {
    this.state = { ...this.state, config: freshProject(), selectedId: null };
    this.notify();
  }
}

export const store = new Store();
