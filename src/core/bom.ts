import type { BomRow, ProjectConfig, UnitSystem } from './types';
import { catalogById } from './catalog';
import { cabinetHeight, U_MM } from './standards';
import { displayLength } from './units';
import { L } from './i18n';

function localized(zh: string, en: string): string {
  return L(zh, en);
}

/** Build a bill of materials from the frame configuration and placed items. */
export function buildBom(config: ProjectConfig, sys: UnitSystem): BomRow[] {
  const f = config.frame;
  const rows: BomRow[] = [];
  const H = cabinetHeight(f);

  const frameSpec = `${displayLength(f.width, sys)} × ${displayLength(f.depth, sys)} × ${displayLength(H, sys)} / ${f.heightU}U / 19″`;
  const frameKg = 62 + f.heightU * 0.85 + (f.width / 600 - 1) * 12 + (f.depth / 1000 - 1) * 16;
  const framePrice = 3800 + f.heightU * 55 + f.depth * 1.2;
  rows.push({
    partNo: `BTF-FR-${f.heightU}U-${Math.round(f.width)}-${Math.round(f.depth)}`,
    name: localized('钢制焊接框架主体', 'Welded steel frame'),
    spec: frameSpec, qty: 1, unitWeight: frameKg, totalWeight: frameKg,
    unitPrice: framePrice, totalPrice: framePrice,
  });

  rows.push({
    partNo: 'BTF-FR-RAIL19', name: localized('19″ 前后安装立柱（含 U 位刻度）', '19″ front/rear rails with U markings'),
    spec: `${localized('孔距', 'pitch')} ${displayLength(U_MM, sys, 2)} / U · ${localized('中心距', 'centres')} ${displayLength(465, sys, 1)}`,
    qty: 2, unitWeight: 4.2, totalWeight: 8.4, unitPrice: 420, totalPrice: 840,
  });

  const doorNameZh: Record<string, string> = { perforated: '穿孔门', glass: '玻璃门', solid: '实心门', double: '双开门', none: '无门' };
  const doorNameEn: Record<string, string> = { perforated: 'Perforated door', glass: 'Glazed door', solid: 'Solid door', double: 'Double door', none: 'No door' };
  if (f.frontDoor !== 'none') {
    rows.push({
      partNo: `BTF-DR-F-${f.frontDoor.toUpperCase()}`, name: localized(`前${doorNameZh[f.frontDoor]}`, `Front ${doorNameEn[f.frontDoor].toLowerCase()}`),
      spec: `${displayLength(f.width - 40, sys)} × ${displayLength(H - f.plinth - 60, sys)}`, qty: 1,
      unitWeight: 9, totalWeight: 9, unitPrice: f.frontDoor === 'glass' ? 1350 : 880, totalPrice: f.frontDoor === 'glass' ? 1350 : 880,
    });
  }
  if (f.rearDoor !== 'none') {
    rows.push({
      partNo: `BTF-DR-R-${f.rearDoor.toUpperCase()}`, name: localized(`后${doorNameZh[f.rearDoor]}`, `Rear ${doorNameEn[f.rearDoor].toLowerCase()}`),
      spec: localized('通风 / 可锁', 'Vented / lockable'), qty: 1,
      unitWeight: 8.5, totalWeight: 8.5, unitPrice: 820, totalPrice: 820,
    });
  }
  if (f.sidePanels) {
    rows.push({
      partNo: 'BTF-PN-SIDES', name: localized('侧板（左右一对）', 'Side panels (pair)'),
      spec: `${displayLength(f.depth - 20, sys)} × ${displayLength(H - f.plinth - 20, sys)}`, qty: 1,
      unitWeight: 15, totalWeight: 15, unitPrice: 960, totalPrice: 960,
    });
  }
  const topName: Record<string, { zh: string; en: string }> = {
    solid: { zh: '实心顶盖', en: 'Solid top cover' },
    vented: { zh: '冲孔顶盖', en: 'Vented top cover' },
    cable: { zh: '走线顶盖', en: 'Cable-entry top cover' },
  };
  rows.push({
    partNo: `BTF-PN-TOP-${f.topCover.toUpperCase()}`, name: localized(topName[f.topCover].zh, topName[f.topCover].en),
    spec: `${displayLength(f.width, sys)} × ${displayLength(f.depth, sys)}`, qty: 1,
    unitWeight: 3.4, totalWeight: 3.4, unitPrice: 320, totalPrice: 320,
  });
  rows.push({
    partNo: 'BTF-BS-PLINTH', name: localized('底座 / 调平脚', 'Plinth / leveling feet'),
    spec: `${localized('高', 'height')} ${displayLength(f.plinth, sys)}`, qty: 1,
    unitWeight: 12, totalWeight: 12, unitPrice: 620, totalPrice: 620,
  });
  if (f.grounding) {
    rows.push({
      partNo: 'BTF-BS-GND', name: localized('等电位接地套件', 'Equipotential grounding kit'),
      spec: 'IEC 60364 / GB 50054', qty: 1, unitWeight: 1.1, totalWeight: 1.1,
      unitPrice: 160, totalPrice: 160,
    });
  }

  // Aggregate placed components by part number.
  const groups = new Map<string, { count: number; item: NonNullable<ReturnType<typeof catalogById>> }>();
  for (const p of config.items) {
    const c = catalogById(p.catalogId);
    if (!c) continue;
    const g = groups.get(c.id);
    if (g) g.count += 1;
    else groups.set(c.id, { count: 1, item: c });
  }
  for (const { count, item } of groups.values()) {
    const spec = item.uSize > 0
      ? `${item.uSize}U · ${item.depth > 0 ? displayLength(item.depth, sys) : '-'} · ${item.weight} kg`
      : `0U · ${item.weight} kg`;
    const name = localized(item.name.zh, item.name.en);
    rows.push({
      partNo: item.partNo, name, spec, qty: count,
      unitWeight: item.weight, totalWeight: item.weight * count,
      unitPrice: item.price, totalPrice: item.price * count,
    });
  }
  return rows;
}
