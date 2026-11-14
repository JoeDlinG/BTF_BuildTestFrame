export type Lang = 'zh' | 'en';
export type UnitSystem = 'metric' | 'imperial';
export type FrameType = 'static' | 'mobile' | 'seismic';
export type Slot = 'front' | 'rear' | 'top' | 'base' | 'side' | 'vertical';
export type Category = 'door' | 'panel' | 'base' | 'device' | 'test' | 'power' | 'cooling' | 'accessory' | 'custom';
export type ViewMode = 'iso' | 'front' | 'rear' | 'side' | 'top';
export type IpRating = 'IP20' | 'IP40' | 'IP55';
export type DoorKind = 'perforated' | 'glass' | 'solid' | 'double' | 'none';
export type TopKind = 'solid' | 'vented' | 'cable';

export interface LocalizedText {
  zh: string;
  en: string;
}

/** All physical values are stored in SI-ish base units: mm, kg, W. */
export interface FrameConfig {
  heightU: number;
  width: number; // mm
  depth: number; // mm
  frameType: FrameType;
  color: string; // hex
  plinth: number; // mm, base height
  frontRailOffset: number; // Xf: mm from front edge to the 19" rail
  rearRailOffset: number; // mm from rear edge to the rear rail
  ip: IpRating;
  emc: boolean;
  grounding: boolean;
  frontDoor: DoorKind;
  rearDoor: DoorKind;
  sidePanels: boolean;
  topCover: TopKind;
  frontDoorColor: string;
}

export interface PlacedItem {
  id: string;
  catalogId: string;
  /** 1-based U index measured from the bottom of the 19" mounting area. 0 = 0U item. */
  u: number;
  slot: Slot;
  color?: string;
  label?: string;
  /** Per-layer rename; overrides the catalog name in lists, BOM specs and the 3D nameplate. */
  name?: string;
  /** Per-instance U height override (configurable instruments / custom chassis). */
  uSize?: number;
  /** Per-instance depth override in mm (custom chassis). */
  depth?: number;
}

export type GeomKind =
  | 'server' | 'switch' | 'ups' | 'patch' | 'kvm' | 'pdu-h' | 'pdu-v'
  | 'fan' | 'shelf' | 'blank' | 'cable' | 'brush' | 'door' | 'side'
  | 'top' | 'plinth' | 'caster' | 'label' | 'cutout' | 'logo' | 'ground'
  | 'chassis' | 'scope' | 'rf' | 'psu';

export interface CatalogItem {
  id: string;
  name: LocalizedText;
  desc: LocalizedText;
  category: Category;
  slot: Slot;
  uSize: number; // 0 means 0U (vertical mounting)
  depth: number; // mm; 0 = no depth constraint
  weight: number; // kg
  power: number; // W
  price: number; // CNY, indicative placeholder
  geom: GeomKind;
  icon: string;
  partNo: string;
  maxPerRack?: number;
  /** Discrete selectable U heights, e.g. [3,4,5] for a 3U–5U instrument. */
  uOptions?: number[];
  /** Free-form U height range [min,max] for a custom chassis. */
  uRange?: [number, number];
  /** Free-form depth range in mm [min,max] for a custom chassis. */
  depthRange?: [number, number];
}

export interface ProjectConfig {
  version: 1;
  name: string;
  frame: FrameConfig;
  items: PlacedItem[];
  createdAt: string;
}

export interface CheckResult {
  level: 'ok' | 'warn' | 'error';
  text: string;
  itemId?: string;
}

export interface BomRow {
  partNo: string;
  name: string;
  spec: string;
  qty: number;
  unitWeight: number; // kg
  totalWeight: number;
  unitPrice: number;
  totalPrice: number;
}

export interface AppState {
  config: ProjectConfig;
  unit: UnitSystem;
  lang: Lang;
  selectedId: string | null;
  view: ViewMode;
  explode: boolean;
  wireframe: boolean;
  dimensions: boolean;
  libraryCat: Category | 'all';
  search: string;
  leftTab: 'wizard' | 'library';
  rightTab: 'inspector' | 'checks' | 'bom';
}
