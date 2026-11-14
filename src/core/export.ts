import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { BomRow, ProjectConfig, UnitSystem } from './types';
import { cabinetHeight } from './standards';
import { displayLength, displayMass, standardLabel } from './units';
import { L } from './i18n';

export function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeName(name: string): string {
  return (name || 'btf-rack').replace(/[^\w.-]+/g, '_');
}

export function exportProjectJson(config: ProjectConfig): void {
  const payload = { ...config, version: 1 as const, exportedAt: new Date().toISOString() };
  triggerDownload(`${safeName(config.name)}.json`,
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportBomCsv(rows: BomRow[], config: ProjectConfig, sys: UnitSystem): void {
  const f = config.frame;
  const meta: (string | number)[][] = [
    [L('BTF BuildTestFrame 物料清单 / Bill of Materials', 'BTF BuildTestFrame — Bill of Materials')],
    [L('项目', 'Project'), config.name],
    [L('标准', 'Standard'), standardLabel(sys)],
    [L('机柜规格', 'Cabinet'), `${f.heightU}U · ${displayLength(f.width, sys)} × ${displayLength(f.depth, sys)} × ${displayLength(cabinetHeight(f), sys)}`],
    [L('导出时间', 'Exported'), new Date().toLocaleString()],
    [],
  ];
  const headers = [
    L('序号', '#'), L('物料号', 'Part No.'), L('名称', 'Description'), L('规格', 'Specification'),
    L('数量', 'Qty'), L('单重(kg)', 'Unit weight (kg)'), L('总重(kg)', 'Total weight (kg)'),
    L('单价(CNY)', 'Unit price (CNY)'), L('合价(CNY)', 'Total price (CNY)'),
  ];
  const body = rows.map((r, i) => [
    i + 1, r.partNo, r.name, r.spec, r.qty,
    r.unitWeight.toFixed(2), r.totalWeight.toFixed(2),
    r.unitPrice.toFixed(2), r.totalPrice.toFixed(2),
  ]);
  const totalWeight = rows.reduce((s, r) => s + r.totalWeight, 0);
  const totalPrice = rows.reduce((s, r) => s + r.totalPrice, 0);
  const footer: (string | number)[][] = [
    [],
    [L('合计', 'TOTAL'), '', '', '', '', '', totalWeight.toFixed(2), '', totalPrice.toFixed(2)],
    [L('总重(公制)', 'Total mass (metric)'), `${totalWeight.toFixed(2)} kg`],
    [L('总重(英制)', 'Total mass (imperial)'), displayMass(totalWeight, 'imperial')],
    [L('说明：价格为占位参考值，非报价。', 'Note: prices are indicative placeholders, not a quotation.')],
  ];
  const csv = '\uFEFF' + [...meta, headers, ...body, ...footer]
    .map((row) => row.map(csvCell).join(',')).join('\r\n');
  triggerDownload(`${safeName(config.name)}_BOM.csv`,
    new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

export function exportPng(canvas: HTMLCanvasElement, config: ProjectConfig): void {
  try {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName(config.name)}_view.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    throw new Error('png-capture-failed');
  }
}

export function exportStl(root: THREE.Object3D, config: ProjectConfig): void {
  const exporter = new STLExporter();
  const result = exporter.parse(root, { binary: true });
  const blob = result instanceof DataView
    ? new Blob([result.buffer as ArrayBuffer], { type: 'model/stl' })
    : new Blob([result], { type: 'model/stl' });
  triggerDownload(`${safeName(config.name)}.stl`, blob);
}

export async function exportGlb(root: THREE.Object3D, config: ProjectConfig): Promise<void> {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, { binary: true, onlyVisible: true });
  triggerDownload(`${safeName(config.name)}.glb`,
    new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' }));
}

export function readProjectFile(file: File): Promise<ProjectConfig> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as ProjectConfig;
        if (!data || !data.frame || !Array.isArray(data.items)) throw new Error('bad schema');
        resolve(data);
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}
