import type { AppState, FrameConfig, Lang, PlacedItem, ProjectConfig, UnitSystem } from './types';
import { defaultFrame } from './standards';
import { catalogById, occupiesU } from './catalog';

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
    .map((i) => ({
      id: typeof i.id === 'string' ? i.id : uid(),
      catalogId: i.catalogId,
      u: Number.isFinite(Number(i.u)) ? Number(i.u) : 1,
      slot: i.slot || 'front',
      color: i.color,
      label: i.label,
    }));
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
      const b0 = item.u, b1 = item.u + c.uSize - 1;
      if (a0 <= b1 && b0 <= a1) return false;
    }
    return true;
  }

  /** Find a free U slot, preferring the requested position and searching downward first. */
  findFreeU(catalogId: string, preferred: number, slot = 'front'): number {
    const c = catalogById(catalogId);
    if (!c || !occupiesU(c)) return 0;
    const max = this.state.config.frame.heightU - c.uSize + 1;
    const start = Math.max(1, Math.min(max, Math.round(preferred || 1)));
    if (this.isUFree(start, c.uSize, slot)) return start;
    for (let d = 1; d <= max; d++) {
      const below = start - d;
      if (below >= 1 && this.isUFree(below, c.uSize, slot)) return below;
      const above = start + d;
      if (above <= max && this.isUFree(above, c.uSize, slot)) return above;
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
    const targetU = occupiesU(c) ? this.findFreeU(catalogId, u ?? 1, targetSlot) : 0;
    const item: PlacedItem = { id: uid(), catalogId, u: targetU, slot: targetSlot };
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
    const clamped = Math.max(1, Math.min(this.state.config.frame.heightU - c.uSize + 1, Math.round(u)));
    if (!this.isUFree(clamped, c.uSize, item.slot, id)) return;
    this.updateItem(id, { u: clamped });
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
