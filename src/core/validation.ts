import type { AppState, CheckResult, PlacedItem } from './types';
import { catalogById, occupiesU } from './catalog';
import { cabinetHeight, coolingBudget, loadLimit, rackHeight, usableDepth, WIDTH_OPTIONS } from './standards';
import { displayLength, displayMass, displayU } from './units';
import { L } from './i18n';

/** Plausibility checks, mirroring the reference configurator's "plausibility check". */
export function validate(state: AppState): CheckResult[] {
  const out: CheckResult[] = [];
  const { frame, items } = state.config;
  const sys = state.unit;
  const push = (level: CheckResult['level'], zh: string, en: string, itemId?: string) =>
    out.push({ level, text: L(zh, en), itemId });

  const limit = loadLimit(frame);
  const budget = coolingBudget(frame);
  const depthAvail = usableDepth(frame);

  let frameKg = 62 + frame.heightU * 0.85 + (frame.width / 600 - 1) * 12 + (frame.depth / 1000 - 1) * 16;
  if (frame.sidePanels) frameKg += 15;
  if (frame.frontDoor !== 'none') frameKg += 9;
  if (frame.rearDoor !== 'none') frameKg += 9;
  let totalKg = frameKg;
  let totalW = 0;

  // --- per-item checks ---
  const mounted: { item: PlacedItem; u: number; size: number; slot: string }[] = [];
  for (const item of items) {
    const c = catalogById(item.catalogId);
    if (!c) continue;
    totalKg += c.weight;
    totalW += c.power;
    if (!occupiesU(c)) continue;
    mounted.push({ item, u: item.u, size: c.uSize, slot: item.slot });

    if (item.u < 1 || item.u + c.uSize - 1 > frame.heightU) {
      push('error',
        `「${c.name.zh}」超出 19″ 安装区（${frame.heightU}U），当前起始 ${item.u}U。`,
        `"${c.name.en}" exceeds the ${frame.heightU}U mounting area (starts at U${item.u}).`,
        item.id);
    }
    if (c.depth > 0 && c.depth > depthAvail) {
      push('error',
        `「${c.name.zh}」深度 ${displayLength(c.depth, sys)} 大于可用安装深度 ${displayLength(depthAvail, sys)}，请加深机柜或调整 Xf/C 尺寸。`,
        `"${c.name.en}" is ${displayLength(c.depth, sys)} deep but only ${displayLength(depthAvail, sys)} is available. Increase cabinet depth or adjust Xf/C.`,
        item.id);
    }
  }

  // --- U slot collisions (same mounting plane) ---
  for (let i = 0; i < mounted.length; i++) {
    for (let j = i + 1; j < mounted.length; j++) {
      const a = mounted[i], b = mounted[j];
      if (a.slot !== b.slot) continue;
      if (a.u <= b.u + b.size - 1 && b.u <= a.u + a.size - 1) {
        const ca = catalogById(a.item.catalogId)!;
        const cb = catalogById(b.item.catalogId)!;
        push('error',
          `U 位冲突：${ca.name.zh} (U${a.u}–U${a.u + a.size - 1}) 与 ${cb.name.zh} (U${b.u}–U${b.u + b.size - 1}) 重叠。`,
          `U conflict: ${ca.name.en} (U${a.u}–U${a.u + a.size - 1}) overlaps ${cb.name.en} (U${b.u}–U${b.u + b.size - 1}).`,
          b.item.id);
      }
    }
  }

  // --- frame level checks ---
  if (!WIDTH_OPTIONS.includes(frame.width)) {
    push('warn',
      `宽度 ${displayLength(frame.width, sys)} 不是常用标准值（600 / 800 mm），可能需要定制框架。`,
      `Width ${displayLength(frame.width, sys)} is not a standard 600/800 mm value; a custom frame may be required.`);
  }
  if (frame.depth < 600) {
    push('warn',
      `深度 ${displayLength(frame.depth, sys)} 偏浅，多数 19″ 设备无法安装。`,
      `Depth ${displayLength(frame.depth, sys)} is too shallow for most 19″ devices.`);
  }
  if (frame.frontRailOffset < 50 || frame.rearRailOffset < 50) {
    push('warn',
      'Xf / C 凹槽尺寸偏小，前门或后门内可能缺少布线空间。',
      'Xf / C rail setback is small; cable space in front of / behind the rail may be insufficient.');
  }
  if (totalKg > limit) {
    push('error',
      `总重 ${displayMass(totalKg, sys)} 超过${frame.frameType === 'mobile' ? '动载' : '静载'}上限 ${displayMass(limit, sys)}，请减小负载或改用静止式框架。`,
      `Total mass ${displayMass(totalKg, sys)} exceeds the ${frame.frameType === 'mobile' ? 'dynamic' : 'static'} limit of ${displayMass(limit, sys)}. Reduce load or use a static frame.`);
  } else if (totalKg > limit * 0.85) {
    push('warn',
      `总重 ${displayMass(totalKg, sys)} 已接近上限 ${displayMass(limit, sys)}。`,
      `Total mass ${displayMass(totalKg, sys)} is close to the ${displayMass(limit, sys)} limit.`);
  }
  if (totalW > budget) {
    push('warn',
      `设备功耗 ${Math.round(totalW)} W 超过估算散热能力 ${budget} W，建议增加风扇单元或改用穿孔门。`,
      `Heat load ${Math.round(totalW)} W exceeds the estimated ${budget} W cooling budget. Add fan trays or perforated doors.`);
  }
  if (frame.ip === 'IP55' && frame.frontDoor === 'perforated') {
    push('warn',
      'IP55 防护与穿孔前门冲突，应改用实心门并加装密封条。',
      'IP55 conflicts with a perforated front door; use a solid door plus gasket.');
  }
  if (frame.emc && !frame.sidePanels) {
    push('warn',
      '已启用 EMC 屏蔽但未装侧板，屏蔽效能无法保证。',
      'EMC shielding is enabled but side panels are missing.');
  }
  if (frame.emc && !frame.grounding) {
    push('warn',
      'EMC 屏蔽机柜建议启用接地套件。',
      'A grounding kit is recommended for EMC shielded cabinets.');
  }
  if (frame.frontDoor === 'none') {
    push('warn',
      '未配置前门：为开放式机架，防护等级与气流控制受限。',
      'No front door: this is an open rack with limited ingress protection and airflow control.');
  }
  const hasCasters = items.some((i) => i.catalogId === 'caster-set');
  if (frame.frameType === 'mobile' && !hasCasters) {
    push('warn',
      '移动式框架尚未从组件库添加重载脚轮组。',
      'Mobile frame has no heavy-duty caster set from the library yet.');
  }
  if (frame.frameType === 'seismic' && frame.plinth < 100) {
    push('warn',
      '抗震框架的底座高度偏小，建议 ≥100 mm 并加装抗震加固底座。',
      'Seismic frames should use a plinth ≥100 mm with a reinforced base.');
  }

  const usedU = new Set<number>();
  for (const m of mounted) if (m.slot === 'front') {
    for (let u = m.u; u < m.u + m.size; u++) usedU.add(u);
  }
  const freeU = frame.heightU - usedU.size;
  if (freeU > frame.heightU * 0.3 && items.length > 0) {
    push('warn',
      `还有 ${displayU(freeU)} 空位未占用，建议加装盲板以阻断热风回流。`,
      `${displayU(freeU)} are still open; blanking panels are recommended to prevent hot-air recirculation.`);
  }
  if (items.length === 0) {
    push('ok',
      `框架已就绪：${displayU(frame.heightU)} · ${displayLength(frame.width, sys)} × ${displayLength(frame.depth, sys)} × ${displayLength(cabinetHeight(frame), sys)}，从组件库拖放部件开始拼装。`,
      `Frame ready: ${displayU(frame.heightU)} · ${displayLength(frame.width, sys)} × ${displayLength(frame.depth, sys)} × ${displayLength(cabinetHeight(frame), sys)}. Drag parts from the library to start.`);
  }
  if (!out.some((c) => c.level === 'error' || c.level === 'warn')) {
    push('ok',
      `配置通过全部合理性检查：${items.length} 个组件 · 19″ 区 ${displayLength(rackHeight(frame), sys)} · 总重 ${displayMass(totalKg, sys)}。`,
      `All plausibility checks passed: ${items.length} components · 19″ area ${displayLength(rackHeight(frame), sys)} · total ${displayMass(totalKg, sys)}.`);
  }

  const rank = { error: 0, warn: 1, ok: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Aggregate metrics shown in the status bar. */
export function projectMetrics(state: AppState): { totalKg: number; totalW: number; usedU: number; price: number } {
  const { frame, items } = state.config;
  let totalKg = 62 + frame.heightU * 0.85 + (frame.width / 600 - 1) * 12 + (frame.depth / 1000 - 1) * 16;
  if (frame.sidePanels) totalKg += 15;
  if (frame.frontDoor !== 'none') totalKg += 9;
  if (frame.rearDoor !== 'none') totalKg += 9;
  let totalW = 0, price = 3800 + frame.heightU * 55 + frame.depth * 1.2;
  const used = new Set<number>();
  for (const item of items) {
    const c = catalogById(item.catalogId);
    if (!c) continue;
    totalKg += c.weight;
    totalW += c.power;
    price += c.price;
    if (occupiesU(c) && item.slot === 'front') {
      for (let u = item.u; u < item.u + c.uSize; u++) used.add(u);
    }
  }
  return { totalKg, totalW, usedU: used.size, price };
}
