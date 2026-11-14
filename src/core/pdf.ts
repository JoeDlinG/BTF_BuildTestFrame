import type { AppState, BomRow, CheckResult, Lang } from './types';
import { catalogById, itemDepth, itemDisplayName, itemOccupiesU, itemUSize } from './catalog';
import { cabinetHeight, coolingBudget, loadLimit, rackHeight, usableDepth } from './standards';
import { displayLength, displayMass, standardLabel } from './units';
import { safeName, triggerDownload } from './export';

/**
 * Multi-page A3 engineering report exported as a real PDF file.
 *
 * Pages are drawn on a high-resolution canvas (bilingual text is rendered with
 * the system CJK font, so no multi-megabyte embedded font is needed) and then
 * embedded as DCT/JPEG images in a hand-written, dependency-free PDF 1.4
 * container. This is a 2D page report, not an interactive 3D PDF (PRC/U3D).
 */

const W = 2480, H = 1754;            // canvas pixels, A3 landscape @ ~150 dpi
const PW = 1191, PH = 842;           // PDF points, A3 landscape
const FONT = '"Microsoft YaHei","PingFang SC","Segoe UI",Arial,sans-serif';

const C = {
  ink: '#17212d', sub: '#5a6b7e', faint: '#8b9aab', line: '#cfd9e4',
  panel: '#f2f6fa', white: '#ffffff', dark: '#16212e',
  accent: '#c62828', ok: '#1e8e5a', warn: '#c8871a', err: '#c62828',
  blue: '#2f5d8a', teal: '#1c7f86', violet: '#6a55a8', olive: '#6c7b2e',
};
const PALETTE = [C.accent, C.blue, C.teal, C.violet, C.olive, C.warn];

type G = CanvasRenderingContext2D;

const T = (lang: Lang, zh: string, en: string): string => (lang === 'zh' ? zh : en);

function wrap(g: G, s: string, maxWidth: number, size: number): string[] {
  g.font = `400 ${size}px ${FONT}`;
  const out: string[] = [];
  let lineStr = '';
  for (const ch of s) {
    if (g.measureText(lineStr + ch).width > maxWidth && lineStr) { out.push(lineStr); lineStr = ch; }
    else lineStr += ch;
  }
  if (lineStr) out.push(lineStr);
  return out;
}

function text(g: G, s: string, x: number, y: number, size: number,
  color = C.ink, weight = '400', align: CanvasTextAlign = 'left'): void {
  g.font = `${weight} ${size}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillText(s, x, y);
}

function rect(g: G, x: number, y: number, w: number, h: number, fill: string, stroke?: string, lw = 2): void {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
}

function line(g: G, x1: number, y1: number, x2: number, y2: number, color = C.line, lw = 2): void {
  g.strokeStyle = color; g.lineWidth = lw;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Truncate to an actual pixel width so table cells never bleed into neighbours. */
function fit(g: G, s: string, maxW: number, size: number, weight = '400'): string {
  g.font = `${weight} ${size}px ${FONT}`;
  if (g.measureText(s).width <= maxW) return s;
  let out = s;
  while (out.length > 1 && g.measureText(`${out}…`).width > maxW) out = out.slice(0, -1);
  return `${out}…`;
}

function meter(g: G, x: number, y: number, w: number, k: string, ratio: number, v: string): void {
  text(g, k, x, y, 23, C.sub, '600');
  text(g, fit(g, v, w, 22, '600'), x + w, y, 22, C.ink, '600', 'right');
  rect(g, x, y + 14, w, 16, '#e7edf3');
  const r = Math.max(0, Math.min(1, ratio));
  rect(g, x, y + 14, Math.max(2, w * r), 16, ratio > 1 ? C.err : r > 0.85 ? C.warn : C.ok);
}

interface PageCtx {
  s: AppState;
  rows: BomRow[];
  checks: CheckResult[];
  snap: HTMLCanvasElement;
  total: number;
}

function pageFrame(g: G, p: PageCtx, no: number, title: string, subtitle: string): void {
  rect(g, 0, 0, W, 132, C.dark);
  rect(g, 0, 0, 14, 132, C.accent);
  text(g, 'BTF BuildTestFrame', 68, 62, 46, C.white, '700');
  text(g, subtitle, 68, 110, 27, '#aebdcc');
  text(g, title, W - 68, 68, 40, C.white, '600', 'right');
  text(g, `${T(p.s.lang, '机柜配置工程报告', 'RACK CONFIGURATION REPORT')}  ·  ${no} / ${p.total}`,
    W - 68, 110, 25, '#aebdcc', '400', 'right');
}

function pageFooter(g: G, p: PageCtx, no: number): void {
  line(g, 68, H - 96, W - 68, H - 96, C.line, 2);
  text(g, T(p.s.lang,
    'BTF BuildTestFrame · 开源在线 19 英寸标准机柜设计拼装 · 本文件由配置器自动生成，价格为占位参考值，非报价。',
    'BTF BuildTestFrame · Open-source 19-inch rack configurator · Auto-generated; prices are placeholders, not a quotation.'),
    68, H - 52, 24, C.faint);
  text(g, `${new Date().toLocaleString()}   ·   ${no} / ${p.total}`,
    W - 68, H - 52, 24, C.faint, '400', 'right');
}

function cardTitle(g: G, x: number, y: number, w: number, title: string): void {
  text(g, title, x, y, 30, C.ink, '700');
  line(g, x, y + 18, x + w, y + 18, C.line, 2);
}

function kv(g: G, x: number, y: number, w: number, k: string, v: string, row = 0): void {
  const yy = y + row * 62;
  if (row % 2 === 0) rect(g, x, yy - 34, w, 58, C.panel);
  text(g, fit(g, k, w * 0.46, 26), x + 16, yy, 26, C.sub);
  text(g, fit(g, v, w * 0.48, 27, '600'), x + w - 16, yy, 27, C.ink, '600', 'right');
}

function enumLabel(lang: Lang, kind: string, v: string): string {
  const map: Record<string, Record<string, [string, string]>> = {
    frameType: {
      static: ['静态框架', 'Static frame'], mobile: ['移动式 / 脚轮', 'Mobile / castors'],
      seismic: ['抗震加固', 'Seismic reinforced'],
    },
    frontDoor: {
      perforated: ['穿孔门', 'Perforated'], glass: ['玻璃门', 'Glass'],
      solid: ['实心门', 'Solid'], double: ['双开门', 'Double'], none: ['无', 'None'],
    },
    rearDoor: {
      perforated: ['穿孔门', 'Perforated'], glass: ['玻璃门', 'Glass'],
      solid: ['实心门', 'Solid'], double: ['双开门', 'Double'], none: ['无', 'None'],
    },
    topCover: { solid: ['实心顶板', 'Solid'], vented: ['通风顶板', 'Vented'], cable: ['走线顶板', 'Cable entry'] },
  };
  const e = map[kind]?.[v];
  return e ? (lang === 'zh' ? e[0] : e[1]) : v;
}

function drawCover(g: G, p: PageCtx): void {
  const { s } = p;
  const f = s.config.frame, sys = s.unit, lang = s.lang;
  pageFrame(g, p, 1, T(lang, '总览', 'OVERVIEW'), T(lang, '机柜规格与 3D 装配视图', 'CABINET SPECIFICATION & 3D ASSEMBLY'));

  // --- 3D render ---------------------------------------------------------
  const vx = 68, vy = 180, vw = 1380, vh = 1230;
  cardTitle(g, vx, vy, vw, T(lang, '3D 装配视图', '3D ASSEMBLY VIEW'));
  rect(g, vx, vy + 34, vw, vh - 34, C.white, C.line);
  const pad = 26;
  const ar = p.snap.width / p.snap.height;
  const bw = vw - pad * 2, bh = vh - 34 - pad * 2;
  let dw = bw, dh = bw / ar;
  if (dh > bh) { dh = bh; dw = bh * ar; }
  g.drawImage(p.snap, vx + (vw - dw) / 2, vy + 34 + (vh - 34 - dh) / 2, dw, dh);
  text(g, T(lang, '视图为导出时相机角度的渲染快照', 'Snapshot of the camera view at export time'),
    vx + 16, vy + vh + 40, 24, C.faint);

  // --- specification -----------------------------------------------------
  const sx = 1490, sw = W - 68 - sx;
  cardTitle(g, sx, vy, sw, T(lang, '机架规格', 'CABINET SPECIFICATION'));
  const rows: [string, string][] = [
    [T(lang, '项目名称', 'Project'), clip(s.config.name, 24)],
    [T(lang, '采用标准', 'Standard'), standardLabel(sys)],
    [T(lang, '机架高度', 'Rack height'), `${f.heightU} U`],
    [T(lang, '外形 高×宽×深', 'Overall H×W×D'),
      `${displayLength(cabinetHeight(f), sys)} × ${displayLength(f.width, sys)} × ${displayLength(f.depth, sys)}`],
    [T(lang, '19 英寸安装区', '19-inch mounting area'), displayLength(rackHeight(f), sys)],
    [T(lang, '可用安装深度', 'Usable mounting depth'), displayLength(usableDepth(f), sys)],
    [T(lang, '前立柱偏置 Xf', 'Front rail offset Xf'), displayLength(f.frontRailOffset, sys)],
    [T(lang, '后立柱偏置 C', 'Rear rail offset C'), displayLength(f.rearRailOffset, sys)],
    [T(lang, '框架类型', 'Frame type'), enumLabel(lang, 'frameType', f.frameType)],
    [T(lang, '前门 / 后门', 'Front / rear door'),
      `${enumLabel(lang, 'frontDoor', f.frontDoor)} / ${enumLabel(lang, 'rearDoor', f.rearDoor)}`],
    [T(lang, '侧板 / 顶盖', 'Side panels / top'),
      `${f.sidePanels ? T(lang, '有', 'Yes') : T(lang, '无', 'No')} / ${enumLabel(lang, 'topCover', f.topCover)}`],
    [T(lang, '防护 / EMC', 'IP rating / EMC'), `${f.ip} / ${f.emc ? T(lang, '是', 'Yes') : T(lang, '否', 'No')}`],
    [T(lang, '接地套件', 'Grounding kit'), f.grounding ? T(lang, '已配置', 'Included') : T(lang, '未配置', 'Not included')],
    [T(lang, '静载上限', 'Static load limit'), displayMass(loadLimit(f), sys)],
    [T(lang, '散热预算', 'Cooling budget'), `${coolingBudget(f)} W`],
    [T(lang, '主体颜色', 'Frame colour'), f.color.toUpperCase()],
  ];
  rows.forEach(([k, v], i) => kv(g, sx, vy + 88, sw, k, v, i));

  // --- KPI strip ---------------------------------------------------------
  const usedU = s.config.items.reduce((acc, i) => acc + (itemOccupiesU(i) ? itemUSize(i) : 0), 0);
  const totalKg = p.rows.reduce((a, r) => a + r.totalWeight, 0);
  const totalW = s.config.items.reduce((a, i) => a + (catalogById(i.catalogId)?.power ?? 0), 0);
  const ky = 1470, kw = (W - 136) / 4;
  const kpis: [string, string][] = [
    [T(lang, '已装配组件', 'COMPONENTS'), String(s.config.items.length)],
    [T(lang, 'U 位占用', 'U SPACE USED'), `${usedU} / ${f.heightU} U`],
    [T(lang, '总重', 'TOTAL MASS'), displayMass(totalKg, sys)],
    [T(lang, '总功耗', 'TOTAL POWER'), `${totalW} W`],
  ];
  kpis.forEach(([k, v], i) => {
    const x = 68 + i * kw;
    rect(g, x, ky, kw - 12, 150, C.panel, C.line);
    text(g, k, x + 28, ky + 52, 24, C.sub, '600');
    text(g, v, x + 28, ky + 116, 46, i === 0 ? C.accent : C.ink, '700');
  });
  pageFooter(g, p, 1);
}

function drawLayout(g: G, p: PageCtx): void {
  const { s } = p;
  const f = s.config.frame, lang = s.lang;
  pageFrame(g, p, 2, T(lang, 'U 位布置', 'U-SPACE LAYOUT'),
    T(lang, '19 英寸安装区正视图与合理性检查', '19-INCH FRONT ELEVATION & PLAUSIBILITY CHECKS'));

  const lx = 68, lw = 1180;
  cardTitle(g, lx, 180, lw, T(lang, '机柜正视图 / U 位排布', 'FRONT ELEVATION / U ALLOCATION'));
  rect(g, lx, 214, lw, 1210, C.white, C.line);

  const top = 270, bottom = 1360, uh = (bottom - top) / f.heightU;
  const bx = 390, bw = 520;
  rect(g, bx - 26, top - 24, bw + 52, bottom - top + 48, C.panel, C.line);
  for (let u = 1; u <= f.heightU; u++) {
    const y = bottom - u * uh;
    line(g, bx - 26, y, bx + bw + 26, y, u % 5 === 0 ? '#aebdcc' : '#e2e9f0', u % 5 === 0 ? 2 : 1);
    if (u % 5 === 0 || u === 1) text(g, `U${u}`, bx - 40, y + 9, 22, C.faint, '500', 'right');
  }
  line(g, bx, top - 24, bx, bottom + 24, '#aebdcc');
  line(g, bx + bw, top - 24, bx + bw, bottom + 24, '#aebdcc');

  const front = s.config.items
    .filter((i) => itemOccupiesU(i) && i.slot === 'front')
    .sort((a, b) => b.u - a.u);
  front.forEach((item, idx) => {
    const size = itemUSize(item);
    const y = bottom - (item.u + size - 1) * uh;
    const h = size * uh - 4;
    const color = item.color || PALETTE[idx % PALETTE.length];
    rect(g, bx + 6, y + 2, bw - 12, Math.max(h, 4), color);
    if (h > 30) {
      text(g, clip(itemDisplayName(item, lang), 18), bx + 20, y + Math.min(h / 2 + 10, h - 6),
        Math.min(26, h * 0.6), C.white, '700');
    }
    text(g, `U${item.u}${size > 1 ? `–${item.u + size - 1}` : ''}`, bx + bw + 44, y + Math.max(26, h / 2),
      23, C.ink, '600');
    text(g, clip(itemDisplayName(item, lang), 16), bx + bw + 140, y + Math.max(26, h / 2), 23, C.sub);
  });
  const rear = s.config.items.filter((i) => itemOccupiesU(i) && i.slot !== 'front');
  text(g, T(lang, `后侧 / 0U 安装：${rear.length} 件`, `Rear / 0U mounted: ${rear.length} pcs`),
    lx + 24, 1462, 24, C.sub);
  text(g, T(lang, '色块高度按实际 U 高绘制，含自定义机箱与仪表', 'Block heights use effective U sizes, including custom chassis and instruments'),
    lx + 24, 1498, 22, C.faint);

  // --- checks, utilisation meters and assembly schedule ------------------
  const rx = 1290, rw = W - 68 - rx, cw = 690;
  cardTitle(g, rx, 180, rw, T(lang, '合理性检查与装配明细', 'PLAUSIBILITY & ASSEMBLY SCHEDULE'));
  rect(g, rx, 214, rw, 1210, C.white, C.line);

  text(g, T(lang, '合理性检查', 'PLAUSIBILITY CHECKS'), rx + 24, 264, 25, C.sub, '700');
  const shown = p.checks.slice(0, 5);
  if (!shown.length) text(g, T(lang, '暂无检查项', 'No checks available'), rx + 24, 316, 25, C.faint);
  shown.forEach((c, i) => {
    const y = 300 + i * 72;
    const color = c.level === 'ok' ? C.ok : c.level === 'warn' ? C.warn : C.err;
    g.fillStyle = color;
    g.beginPath(); g.arc(rx + 38, y, 11, 0, Math.PI * 2); g.fill();
    text(g, c.level === 'ok' ? '✓' : '!', rx + 38, y + 7, 19, C.white, '700', 'center');
    const lines = wrap(g, c.text, cw - 90, 23);
    lines.slice(0, 2).forEach((t2, j) => text(g, t2, rx + 62, y + 8 + j * 28, 23, C.ink));
    line(g, rx + 24, y + 42, rx + cw, y + 42, '#e8eef4', 1);
  });
  const errs = p.checks.filter((c) => c.level === 'error').length;
  const warns = p.checks.filter((c) => c.level === 'warn').length;
  text(g, T(lang,
    `共 ${p.checks.length} 项 · ${errs} 错误 · ${warns} 提醒${p.checks.length > shown.length ? ` · 另有 ${p.checks.length - shown.length} 项未列出` : ''}`,
    `${p.checks.length} checks · ${errs} errors · ${warns} warnings${p.checks.length > shown.length ? ` · ${p.checks.length - shown.length} more omitted` : ''}`),
    rx + 24, 690, 23, errs ? C.err : C.sub, '600');

  // utilisation meters in the right column
  const usedU = s.config.items.reduce((a, i) => a + (itemOccupiesU(i) ? itemUSize(i) : 0), 0);
  const totalKg = p.rows.reduce((a, r) => a + r.totalWeight, 0);
  const totalW = s.config.items.reduce((a, i) => a + (catalogById(i.catalogId)?.power ?? 0), 0);
  const maxDepth = s.config.items.reduce((a, i) => Math.max(a, itemDepth(i)), 0);
  const mx = rx + cw + 30, mw = rw - cw - 58;
  text(g, T(lang, '资源利用率', 'UTILISATION'), mx, 264, 25, C.sub, '700');
  const meters: [string, number, string][] = [
    [T(lang, 'U 位占用', 'U space'), usedU / f.heightU, `${usedU} / ${f.heightU} U`],
    [T(lang, '静载', 'Static load'), totalKg / loadLimit(f),
      `${displayMass(totalKg, s.unit)} / ${displayMass(loadLimit(f), s.unit)}`],
    [T(lang, '散热', 'Cooling'), totalW / coolingBudget(f), `${totalW} / ${coolingBudget(f)} W`],
    [T(lang, '最大设备深度', 'Max depth'), maxDepth / usableDepth(f),
      `${displayLength(maxDepth, s.unit)} / ${displayLength(usableDepth(f), s.unit)}`],
  ];
  meters.forEach(([k, r, v], i) => meter(g, mx, 300 + i * 92, mw, k, r, v));

  // assembly schedule
  line(g, rx + 24, 740, rx + rw - 24, 740, C.line, 2);
  text(g, T(lang, '装配明细 / ASSEMBLY SCHEDULE', 'ASSEMBLY SCHEDULE'), rx + 24, 786, 27, C.ink, '700');
  const cols = [150, 420, 100, 160, 140, 140];
  const heads2 = [
    T(lang, 'U 位', 'U POS'), T(lang, '名称', 'DESCRIPTION'), T(lang, 'U 高', 'HEIGHT'),
    T(lang, '深度', 'DEPTH'), T(lang, '重量', 'MASS'), T(lang, '功率', 'POWER'),
  ];
  const hy = 806;
  rect(g, rx + 24, hy, rw - 48, 50, C.panel);
  let hx = rx + 38;
  heads2.forEach((h, i) => { text(g, h, hx, hy + 34, 22, C.sub, '700'); hx += cols[i]; });
  const scheduled = [...s.config.items].sort((a, b) => b.u - a.u).slice(0, 9);
  scheduled.forEach((item, i) => {
    const y = hy + 50 + i * 54;
    if (i % 2 === 0) rect(g, rx + 24, y, rw - 48, 54, '#f8fafc');
    const c = catalogById(item.catalogId);
    const size = itemUSize(item);
    const cells2 = [
      itemOccupiesU(item) ? `U${item.u}${size > 1 ? `–${item.u + size - 1}` : ''}` : '0U',
      itemDisplayName(item, lang), `${size}U`,
      itemDepth(item) > 0 ? displayLength(itemDepth(item), s.unit) : '-',
      c ? displayMass(c.weight, s.unit) : '-', c ? `${c.power} W` : '-',
    ];
    let px = rx + 38;
    cells2.forEach((v, j) => {
      text(g, fit(g, v, cols[j] - 16, 23), px, y + 36, 23,
        j === 1 ? C.ink : C.sub, j === 1 ? '600' : '400');
      px += cols[j];
    });
  });
  if (s.config.items.length > scheduled.length) {
    text(g, T(lang, `另有 ${s.config.items.length - scheduled.length} 件未列出`,
      `${s.config.items.length - scheduled.length} more parts omitted`),
      rx + 38, hy + 50 + scheduled.length * 54 + 34, 22, C.faint);
  }
  pageFooter(g, p, 2);
}

const BOM_COLS = [90, 250, 560, 470, 100, 170, 170, 250, 280];
const BOM_PER_PAGE = 19;

function drawBomPage(g: G, p: PageCtx, pageNo: number, bomPages: number, start: number): void {
  const { s } = p;
  const lang = s.lang;
  pageFrame(g, p, pageNo, T(lang, '物料清单', 'BILL OF MATERIALS'),
    T(lang, `零部件清单与重量汇总 · 第 ${pageNo - 2} / ${bomPages} 页`, `PARTS, WEIGHTS & COSTS · SHEET ${pageNo - 2} / ${bomPages}`));

  const x0 = 68, y0 = 210, tw = W - 136;
  const heads = [
    T(lang, '#', '#'), T(lang, '物料号', 'PART NO.'), T(lang, '名称', 'DESCRIPTION'),
    T(lang, '规格', 'SPECIFICATION'), T(lang, '数量', 'QTY'),
    T(lang, '单重', 'UNIT MASS'), T(lang, '总重', 'TOTAL MASS'),
    T(lang, '单价 (CNY)', 'UNIT PRICE'), T(lang, '合价 (CNY)', 'TOTAL PRICE'),
  ];
  rect(g, x0, y0, tw, 64, C.dark);
  let cx = x0;
  heads.forEach((h, i) => {
    text(g, fit(g, h, BOM_COLS[i] - 20, 21, '700'), cx + 14, y0 + 42, 21, C.white, '700');
    cx += BOM_COLS[i];
  });

  const slice = p.rows.slice(start, start + BOM_PER_PAGE);
  const rowH = Math.min(86, Math.max(62, Math.floor(1150 / Math.max(slice.length, 8))));
  slice.forEach((r, i) => {
    const y = y0 + 64 + i * rowH;
    if (i % 2 === 0) rect(g, x0, y, tw, rowH, C.panel);
    line(g, x0, y + rowH, x0 + tw, y + rowH, '#e5ebf2', 1);
    const cells = [
      String(start + i + 1), r.partNo, r.name, r.spec,
      String(r.qty), r.unitWeight.toFixed(2), r.totalWeight.toFixed(2),
      r.unitPrice.toFixed(2), r.totalPrice.toFixed(2),
    ];
    let px = x0;
    cells.forEach((v, j) => {
      const right = j >= 4;
      const weight = j === 2 ? '600' : '400';
      text(g, fit(g, v, BOM_COLS[j] - 26, 25, weight),
        right ? px + BOM_COLS[j] - 14 : px + 14, y + rowH / 2 + 9, 25,
        j === 2 ? C.ink : C.sub, weight, right ? 'right' : 'left');
      px += BOM_COLS[j];
    });
  });

  const tableBottom = y0 + 64 + slice.length * rowH;
  line(g, x0, tableBottom, x0 + tw, tableBottom, C.line, 2);
  if (pageNo === 2 + bomPages) {
    const totalW = p.rows.reduce((a, r) => a + r.totalWeight, 0);
    const totalP = p.rows.reduce((a, r) => a + r.totalPrice, 0);
    rect(g, x0, tableBottom + 18, tw, 74, '#fdf1f1', C.accent);
    text(g, T(lang, '合计 / TOTAL', 'TOTAL'), x0 + 20, tableBottom + 66, 30, C.accent, '700');
    text(g, displayMass(totalW, s.unit), x0 + BOM_COLS.slice(0, 7).reduce((a, b) => a + b, 0) - 14,
      tableBottom + 66, 28, C.accent, '700', 'right');
    text(g, `${totalP.toFixed(2)}`, x0 + tw - 20, tableBottom + 66, 30, C.accent, '700', 'right');
    text(g, T(lang, '说明：单价为占位参考值，不代表实际报价；重量含框架与已装配组件。',
      'Note: unit prices are indicative placeholders, not a quotation; mass includes the frame and all assembled parts.'),
      x0 + 20, tableBottom + 132, 24, C.faint);
  }
  pageFooter(g, p, pageNo);
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.9): Uint8Array {
  const b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Assemble a minimal but spec-correct PDF 1.4 with one DCT image per page. */
function buildPdf(images: Uint8Array[], pxW: number, pxH: number): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let pos = 0;
  const push = (v: string | Uint8Array): void => {
    const b = typeof v === 'string' ? enc.encode(v) : v;
    chunks.push(b); pos += b.length;
  };
  const obj = (id: number, head: string): void => {
    offsets[id] = pos;
    push(`${id} 0 obj\n${head}\n`);
  };

  push('%PDF-1.4\n');
  const n = images.length;
  const kids = Array.from({ length: n }, (_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); push('endobj\n');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`); push('endobj\n');

  for (let i = 0; i < n; i++) {
    const pageId = 3 + i * 3, contentId = pageId + 1, imageId = pageId + 2;
    obj(pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] ` +
      `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    push('endobj\n');

    const stream = `q\n${PW} 0 0 ${PH} 0 0 cm\n/Im0 Do\nQ\n`;
    obj(contentId, `<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    push('endobj\n');

    obj(imageId,
      `<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${images[i].length} >>\nstream\n`);
    push(images[i]);
    push('\nendstream\nendobj\n');
  }

  const infoId = 3 + n * 3;
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  obj(infoId, `<< /Title (BTF BuildTestFrame Rack Configuration Report) ` +
    `/Author (BTF BuildTestFrame) /Creator (BTF BuildTestFrame Configurator) ` +
    `/Producer (BTF BuildTestFrame) /Subject (19-inch rack assembly report) ` +
    `/CreationDate (D:${stamp}) >>`);
  push('endobj\n');

  const xrefPos = pos;
  push(`xref\n0 ${infoId + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= infoId; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${infoId + 1} /Root 1 0 R /Info ${infoId} 0 R >>\n` +
    `startxref\n${xrefPos}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

/** Render every page and download the report. Returns the page count. */
export function exportPdf(opts: {
  state: AppState;
  rows: BomRow[];
  checks: CheckResult[];
  view: HTMLCanvasElement;
}): number {
  const snap = document.createElement('canvas');
  snap.width = opts.view.width;
  snap.height = opts.view.height;
  const snapCtx = snap.getContext('2d');
  if (!snapCtx) throw new Error('canvas-unavailable');
  snapCtx.drawImage(opts.view, 0, 0);

  const bomPages = Math.max(1, Math.ceil(opts.rows.length / BOM_PER_PAGE));
  const total = 2 + bomPages;
  const p: PageCtx = {
    s: opts.state, rows: opts.rows, checks: opts.checks, snap, total,
  };

  const images: Uint8Array[] = [];
  const makePage = (draw: (g: G) => void): void => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (!g) throw new Error('canvas-unavailable');
    g.fillStyle = C.white;
    g.fillRect(0, 0, W, H);
    draw(g);
    images.push(canvasToJpeg(cv));
  };

  makePage((g) => drawCover(g, p));
  makePage((g) => drawLayout(g, p));
  for (let i = 0; i < bomPages; i++) {
    makePage((g) => drawBomPage(g, p, 3 + i, bomPages, i * BOM_PER_PAGE));
  }

  triggerDownload(`${safeName(opts.state.config.name)}_report.pdf`, buildPdf(images, W, H));
  return total;
}
