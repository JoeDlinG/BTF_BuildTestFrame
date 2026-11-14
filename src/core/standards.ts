import type { FrameConfig, LocalizedText } from './types';

/** IEC 60297 / GB/T 19520 / EIA-310-E core dimensions. */
export const U_MM = 44.45;
export const U_IN = 1.75;
export const INCH_MM = 25.4;
export const PANEL_19_MM = 482.6;
export const MOUNT_CENTER_MM = 465.0;
export const RAIL_OPENING_MM = 450.0;
export const LB_KG = 0.45359237;

/** Typical finished cabinet outer heights for a given U count (Varistar-like series). */
export const HEIGHT_TABLE: Record<number, number> = {
  18: 1000, 20: 1100, 24: 1200, 27: 1300, 30: 1450, 32: 1600,
  36: 1700, 37: 1800, 40: 1900, 42: 2000, 45: 2100, 47: 2200,
  48: 2250, 52: 2400, 58: 2700,
};
export const HEIGHT_U_OPTIONS = Object.keys(HEIGHT_TABLE).map(Number).sort((a, b) => a - b);
export const WIDTH_OPTIONS = [600, 800];
export const DEPTH_OPTIONS = [600, 800, 900, 1000, 1100, 1200];

export interface ColorChip {
  code: string;
  hex: string;
}
export const RAL_COLORS: ColorChip[] = [
  { code: 'RAL 7021', hex: '#2c3138' },
  { code: 'RAL 7035', hex: '#c8ccc7' },
  { code: 'RAL 9005', hex: '#171a1c' },
  { code: 'RAL 9010', hex: '#f0efe8' },
  { code: 'RAL 5010', hex: '#1b5c93' },
  { code: 'RAL 3005', hex: '#6d2525' },
];

export interface Preset {
  id: string;
  name: LocalizedText;
  heightU: number;
  width: number;
  depth: number;
  frameType: FrameConfig['frameType'];
  note: LocalizedText;
}

export const PRESETS: Preset[] = [
  {
    id: 'gb-42',
    name: { zh: '国标 42U 服务器柜', en: 'GB 42U Server Rack' },
    heightU: 42, width: 600, depth: 1000, frameType: 'static',
    note: { zh: 'GB/T 19520.1 · 600×1000×2000', en: 'GB/T 19520.1 · 600×1000×2000' },
  },
  {
    id: 'gb-47',
    name: { zh: '国标 47U 网络柜', en: 'GB 47U Network Rack' },
    heightU: 47, width: 800, depth: 1200, frameType: 'static',
    note: { zh: 'GB/T 19520.1 · 800×1200×2200', en: 'GB/T 19520.1 · 800×1200×2200' },
  },
  {
    id: 'eia-42',
    name: { zh: '英制 42U 机柜', en: 'EIA 42U Cabinet' },
    heightU: 42, width: 600, depth: 1066.8, frameType: 'static',
    note: { zh: 'EIA-310-E · 24 × 42 × 78.7 in', en: 'EIA-310-E · 24 × 42 × 78.7 in' },
  },
  {
    id: 'eia-45',
    name: { zh: '英制 45U 深柜', en: 'EIA 45U Deep Rack' },
    heightU: 45, width: 762, depth: 1219.2, frameType: 'static',
    note: { zh: 'EIA-310-E · 30 × 48 in', en: 'EIA-310-E · 30 × 48 in' },
  },
];

export function defaultFrame(): FrameConfig {
  return {
    heightU: 42,
    width: 600,
    depth: 1000,
    frameType: 'static',
    color: RAL_COLORS[0].hex,
    plinth: 100,
    frontRailOffset: 75,
    rearRailOffset: 75,
    ip: 'IP20',
    emc: false,
    grounding: true,
    frontDoor: 'perforated',
    rearDoor: 'perforated',
    sidePanels: true,
    topCover: 'vented',
    frontDoorColor: RAL_COLORS[0].hex,
  };
}

/** Overall outer height (mm) incl. plinth and top cover allowance. */
export function cabinetHeight(frame: FrameConfig): number {
  return HEIGHT_TABLE[frame.heightU] ?? Math.round((frame.heightU * U_MM + 133) / 50) * 50;
}

/** Usable mounting depth between front and rear 19" rails (mm). */
export function usableDepth(frame: FrameConfig): number {
  return Math.max(0, frame.depth - frame.frontRailOffset - frame.rearRailOffset);
}

/** The 19" mounting area height (mm), i.e. U count × 44.45. */
export function rackHeight(frame: FrameConfig): number {
  return frame.heightU * U_MM;
}

/** Static load limit in kg. Mobile frames use the dynamic rating. */
export function loadLimit(frame: FrameConfig): number {
  return frame.frameType === 'mobile' ? 1000 : frame.frameType === 'seismic' ? 1200 : 1600;
}

/** Rough heat budget in W per cabinet, based on vented top and perforated doors. */
export function coolingBudget(frame: FrameConfig): number {
  let w = 2500;
  if (frame.topCover === 'vented') w += 2000;
  if (frame.frontDoor === 'perforated') w += 2500;
  if (frame.rearDoor === 'perforated' || frame.rearDoor === 'double') w += 2000;
  if (frame.sidePanels && frame.ip !== 'IP20') w -= 1000;
  return Math.max(1500, w);
}

export function nearestHeightU(mm: number): number {
  let best = HEIGHT_U_OPTIONS[0];
  let delta = Infinity;
  for (const u of HEIGHT_U_OPTIONS) {
    const d = Math.abs(HEIGHT_TABLE[u] - mm);
    if (d < delta) { delta = d; best = u; }
  }
  return best;
}
