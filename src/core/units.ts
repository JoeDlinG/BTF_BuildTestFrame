import type { UnitSystem } from './types';
import { INCH_MM, LB_KG, U_MM } from './standards';

export const MM_PER_IN = INCH_MM;
export const KG_PER_LB = LB_KG;

export function isMetric(sys: UnitSystem): boolean {
  return sys === 'metric';
}

export function lengthUnit(sys: UnitSystem): string {
  return sys === 'metric' ? 'mm' : 'in';
}

export function massUnit(sys: UnitSystem): string {
  return sys === 'metric' ? 'kg' : 'lb';
}

export function mmToIn(mm: number): number {
  return mm / INCH_MM;
}

export function inToMm(inches: number): number {
  return inches * INCH_MM;
}

export function kgToLb(kg: number): number {
  return kg / LB_KG;
}

export function lbToKg(lb: number): number {
  return lb * LB_KG;
}

export function fmt(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return '-';
  const s = n.toFixed(decimals);
  return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

/** Convert an internal mm value to the number shown in the active unit system. */
export function toDisplayLength(mm: number, sys: UnitSystem): number {
  return sys === 'metric' ? mm : mmToIn(mm);
}

export function toDisplayMass(kg: number, sys: UnitSystem): number {
  return sys === 'metric' ? kg : kgToLb(kg);
}

export function displayLength(mm: number, sys: UnitSystem, decimals?: number): string {
  const d = decimals ?? (sys === 'metric' ? 0 : 2);
  return `${fmt(toDisplayLength(mm, sys), d)} ${lengthUnit(sys)}`;
}

export function displayMass(kg: number, sys: UnitSystem, decimals = 1): string {
  return `${fmt(toDisplayMass(kg, sys), decimals)} ${massUnit(sys)}`;
}

/**
 * Parse a user-entered length into internal mm.
 * Accepts: "600", "600mm", "24in", "24\"", "2' 6\"", "0.6m", "60cm".
 * A bare number is interpreted in the currently active unit system.
 */
export function parseLength(raw: string, sys: UnitSystem): number | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ');
  if (!s) return null;

  // Feet + inches, e.g. 5' 3" / 5ft 3in / 2'6"
  const ft = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s*(?:(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")?)?$/);
  if (ft) {
    return inToMm(Number(ft[1]) * 12 + (ft[2] ? Number(ft[2]) : 0));
  }

  const single = s.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch|inches|"|')?$/);
  if (!single) return null;
  const value = Number(single[1]);
  const suffix = single[2];
  if (!suffix) return sys === 'metric' ? value : inToMm(value);
  switch (suffix) {
    case 'mm': return value;
    case 'cm': return value * 10;
    case 'm': return value * 1000;
    case 'in': case 'inch': case 'inches': case '"': return inToMm(value);
    case "'": return inToMm(value * 12);
    default: return null;
  }
}

/** Parse a mass value into internal kg. */
export function parseMass(raw: string, sys: UnitSystem): number | null {
  const s = raw.trim().toLowerCase().replace(/,/g, '');
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(kg|lb|lbs)?$/);
  if (!m) return null;
  const v = Number(m[1]);
  if (m[2] === 'kg') return v;
  if (m[2] === 'lb' || m[2] === 'lbs') return lbToKg(v);
  return sys === 'metric' ? v : lbToKg(v);
}

export function uToMm(u: number): number {
  return u * U_MM;
}

export function mmToU(mm: number): number {
  return mm / U_MM;
}

export function displayU(u: number): string {
  return `${fmt(u, 0)}U`;
}

/** Standard description shown for the active unit system. */
export function standardLabel(sys: UnitSystem): string {
  return sys === 'metric' ? 'GB/T 19520.1 · IEC 60297' : 'EIA-310-E · ANSI/EIA';
}
