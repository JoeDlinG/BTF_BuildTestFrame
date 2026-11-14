import type { AppState, PlacedItem } from '../core/types';
import {
  CATALOG, CATEGORY_ORDER, catalogById, categoryLabel, isConfigurable,
  itemDepth, itemDisplayName, itemOccupiesU, itemUSize, occupiesU,
} from '../core/catalog';
import {
  cabinetHeight, DEPTH_OPTIONS, HEIGHT_U_OPTIONS, PRESETS, RAL_COLORS,
  loadLimit, rackHeight, usableDepth, U_MM, WIDTH_OPTIONS,
} from '../core/standards';
import { displayLength, displayMass, fmt, lengthUnit, parseLength, standardLabel, toDisplayLength } from '../core/units';
import { L, loc } from '../core/i18n';
import { buildBom } from '../core/bom';
import { projectMetrics, validate } from '../core/validation';

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c
  ));
}

function lenValue(mmv: number, sys: AppState['unit']): string {
  return fmt(toDisplayLength(mmv, sys), sys === 'metric' ? 0 : 2);
}

function field(label: string, key: string, value: string, unit: string, sub?: string): string {
  return `<div class="field">
    <label>${label}${sub ? `<span class="field-sub">${sub}</span>` : ''}</label>
    <span style="display:flex;align-items:center;gap:5px">
      <input class="input" data-field="${key}" data-kind="length" value="${esc(value)}" />
      <span class="input-unit">${unit}</span>
    </span>
  </div>`;
}

function selectField(label: string, key: string, options: { value: string; label: string }[], current: string): string {
  return `<div class="field">
    <label>${label}</label>
    <select class="select" data-field="${key}" data-kind="enum">
      ${options.map((o) => `<option value="${esc(o.value)}" ${o.value === current ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>
  </div>`;
}

function checkField(label: string, key: string, checked: boolean): string {
  return `<label class="check-row"><input type="checkbox" data-field="${key}" data-kind="bool" ${checked ? 'checked' : ''}/> ${label}</label>`;
}

function swatches(target: string, current: string): string {
  return `<div class="color-row">${RAL_COLORS.map((c) => `
    <button type="button" class="swatch ${c.hex === current ? 'active' : ''}" style="background:${c.hex}"
      title="${c.code}" data-swatch="${c.hex}" data-target="${target}"></button>`).join('')}
    <label class="color-custom" style="margin:0"><input type="color" data-field="${target}" data-kind="color" value="${esc(current)}" title="${L('自定义颜色', 'Custom colour')}"/></label>
  </div>`;
}

export function renderWizard(s: AppState): string {
  const f = s.config.frame;
  const sys = s.unit;
  const u = lengthUnit(sys);
  const presetHtml = PRESETS.map((p) => `
    <button type="button" class="preset" data-preset="${p.id}">
      <strong>${esc(loc(p.name))}</strong>${esc(loc(p.note))}
    </button>`).join('');

  return `
  <div class="section">
    <div class="section-title">${L('项目', 'PROJECT')}<span class="hint">v1.0 · ${esc(standardLabel(sys))}</span></div>
    <div class="card">
      <div class="field"><label>${L('配置名称', 'Configuration name')}</label>
        <input class="input wide" data-field="name" data-kind="string" value="${esc(s.config.name)}" /></div>
      <p class="note">${L('所有尺寸内部以 mm 存储，切换单位仅改变显示与输入解析。', 'All dimensions are stored in mm; switching units only changes display and input parsing.')}</p>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${L('标准预设', 'STANDARD PRESETS')}</div>
    <div class="preset-grid">${presetHtml}</div>
  </div>

  <div class="section">
    <div class="section-title">${L('框架尺寸', 'FRAME DIMENSIONS')}<span class="hint">${L('先定义框架', 'Defines the 3D frame')}</span></div>
    <div class="card">
      ${selectField(L('安装高度 (U)', 'Mounting height (U)'), 'heightU',
        HEIGHT_U_OPTIONS.map((n) => ({ value: String(n), label: `${n}U · ${displayLength(cabinetHeight({ ...f, heightU: n }), sys)}` })),
        String(f.heightU))}
      ${field(L('机柜宽度', 'Cabinet width'), 'width', lenValue(f.width, sys), u,
        `${L('常用', 'Standard')} ${WIDTH_OPTIONS.map((w) => fmt(toDisplayLength(w, sys), sys === 'metric' ? 0 : 1)).join(' / ')} ${u}`)}
      ${field(L('机柜深度', 'Cabinet depth'), 'depth', lenValue(f.depth, sys), u,
        `${L('可用安装深', 'Usable depth')} ${displayLength(usableDepth(f), sys)}`)}
      ${field(L('底座高度', 'Plinth height'), 'plinth', lenValue(f.plinth, sys), u)}
      <p class="note">${L('19″ 安装区高度', '19″ mounting area')}: ${displayLength(rackHeight(f), sys)} ·
        ${L('1U', '1U')} = ${displayLength(U_MM, sys, 2)} ·
        ${L('外形总高', 'Overall height')} ${displayLength(cabinetHeight(f), sys)}</p>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${L('Xf / C 立柱凹槽', 'RAIL SETBACK Xf / C')}</div>
    <div class="card">
      ${field(L('Xf 前立柱凹槽', 'Xf front rail setback'), 'frontRailOffset', lenValue(f.frontRailOffset, sys), u)}
      ${field(L('C 后立柱凹槽', 'C rear rail setback'), 'rearRailOffset', lenValue(f.rearRailOffset, sys), u)}
      <p class="note">${L('前后立柱位置决定设备深度与布线空间；调整后会自动参与合理性检查。', 'Rail positions determine usable device depth and cable space; they feed the plausibility checks.')}</p>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${L('框架与防护', 'FRAME & PROTECTION')}</div>
    <div class="card">
      ${selectField(L('框架类型', 'Frame type'), 'frameType', [
        { value: 'static', label: L('静止式 · 静载 1600 kg', 'Static · 1600 kg') },
        { value: 'mobile', label: L('移动式 · 动载 1000 kg', 'Mobile · 1000 kg') },
        { value: 'seismic', label: L('抗震式 · 加固', 'Seismic · reinforced') },
      ], f.frameType)}
      ${selectField(L('防护等级', 'IP rating'), 'ip', [
        { value: 'IP20', label: 'IP20' }, { value: 'IP40', label: 'IP40' }, { value: 'IP55', label: 'IP55' },
      ], f.ip)}
      ${selectField(L('前门', 'Front door'), 'frontDoor', [
        { value: 'perforated', label: L('穿孔通风门', 'Perforated door') },
        { value: 'glass', label: L('玻璃门', 'Glazed door') },
        { value: 'solid', label: L('实心门', 'Solid door') },
        { value: 'none', label: L('无门（开放机架）', 'No door (open rack)') },
      ], f.frontDoor)}
      ${selectField(L('后门', 'Rear door'), 'rearDoor', [
        { value: 'perforated', label: L('穿孔通风门', 'Perforated door') },
        { value: 'solid', label: L('实心门', 'Solid door') },
        { value: 'double', label: L('双开门', 'Double door') },
        { value: 'none', label: L('无门', 'No door') },
      ], f.rearDoor)}
      ${selectField(L('顶盖', 'Top cover'), 'topCover', [
        { value: 'vented', label: L('冲孔顶盖', 'Vented top') },
        { value: 'solid', label: L('实心顶盖', 'Solid top') },
        { value: 'cable', label: L('大走线顶盖', 'Cable-entry top') },
      ], f.topCover)}
      <div style="margin-top:10px">
        ${checkField(L('安装左右侧板', 'Install side panels'), 'sidePanels', f.sidePanels)}
        ${checkField(L('EMC 电磁屏蔽', 'EMC shielding'), 'emc', f.emc)}
        ${checkField(L('等电位接地套件', 'Equipotential grounding kit'), 'grounding', f.grounding)}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${L('颜色（即时预览）', 'COLOUR (LIVE PREVIEW)')}</div>
    <div class="card">
      <p class="note" style="margin:0 0 7px">${L('框架 / RAL 色板', 'Frame / RAL palette')}</p>
      ${swatches('color', f.color)}
      <p class="note" style="margin:12px 0 7px">${L('前门颜色', 'Front door colour')}</p>
      ${swatches('frontDoorColor', f.frontDoorColor)}
    </div>
  </div>

  <div class="section">
    <div class="section-title">${L('参考标准', 'REFERENCE STANDARDS')}</div>
    <div class="card"><p class="note" style="margin:0">
      ${L('公制：GB/T 19520.1、IEC 60297-3-100；英制：EIA-310-E。19″ = 482.6 mm，安装孔中心距 465 mm，1U = 44.45 mm (1.75 in)。',
         'Metric: GB/T 19520.1, IEC 60297-3-100; imperial: EIA-310-E. 19″ = 482.6 mm, mounting centres 465 mm, 1U = 44.45 mm (1.75 in).')}
    </p></div>
  </div>`;
}

export function renderLibrary(s: AppState): string {
  const cats = ['all', ...CATEGORY_ORDER] as const;
  const catHtml = cats.map((c) => `
    <button type="button" class="${s.libraryCat === c ? 'active' : ''}" data-cat="${c}">${esc(loc(categoryLabel(c)))}</button>`).join('');

  const items = CATALOG.filter((c) => s.libraryCat === 'all' || c.category === s.libraryCat);
  const itemHtml = items.map((c) => {
    const sizeText = c.uOptions
      ? `${Math.min(...c.uOptions)}–${Math.max(...c.uOptions)}U ${L('可选', 'selectable')}`
      : c.uRange ? `${c.uRange[0]}–${c.uRange[1]}U`
        : c.uSize > 0 ? `${c.uSize}U` : '0U';
    const depthText = c.depthRange
      ? L('深度可调', 'adjustable depth')
      : c.depth > 0 ? displayLength(c.depth, s.unit, s.unit === 'metric' ? 0 : 1) : '-';
    const specParts = [sizeText, depthText, displayMass(c.weight, s.unit, 1)];
    return `<div class="lib-item" draggable="true" data-catalog="${c.id}" title="${esc(loc(c.desc))}">
      <div class="lib-icon">${esc(c.icon)}</div>
      <div class="lib-info">
        <div class="lib-name">${esc(loc(c.name))}${isConfigurable(c) ? `<span class="badge-config">${L('可调', 'ADJ')}</span>` : ''}</div>
        <div class="lib-spec">${esc(specParts.join(' · '))}</div>
      </div>
      <button type="button" class="lib-add" data-add="${c.id}" title="${L('添加到机柜', 'Add to rack')}">+</button>
    </div>`;
  }).join('');

  return `
  <div class="section">
    <input class="input lib-search" id="lib-search" placeholder="${L('搜索组件…', 'Search components…')}" value="${esc(s.search)}" />
    <div class="lib-cats">${catHtml}</div>
    <p class="note" style="margin:0 0 10px">${L('拖拽组件到 3D 视图的 U 位，或点击 + 自动放入空位。', 'Drag a component onto a U position in the 3D view, or click + to auto-place it.')}</p>
    <div id="lib-list">${itemHtml || `<div class="lib-empty">${L('没有匹配的组件', 'No matching components')}</div>`}</div>
  </div>`;
}

export function renderInspector(s: AppState): string {
  const { items, frame } = s.config;
  const selected = items.find((i) => i.id === s.selectedId);
  const c = selected ? catalogById(selected.catalogId) : null;

  const mounted = items.filter(itemOccupiesU).sort((a, b) => b.u - a.u);
  const others = items.filter((i) => !itemOccupiesU(i));
  const row = (i: PlacedItem, rank: number, total: number, sortable: boolean): string => {
    const ci = catalogById(i.catalogId);
    if (!ci) return '';
    const size = itemUSize(i);
    const depth = itemDepth(i);
    const tag = sortable
      ? `U${i.u}${size > 1 ? `–${i.u + size - 1}` : ''}`
      : loc(categoryLabel(ci.category));
    const name = itemDisplayName(i, s.lang);
    const spec = `${size}U${depth > 0 ? ` · ${displayLength(depth, s.unit)}` : ''}`;
    const orderButtons = sortable ? `
      <button type="button" class="order-btn" data-order="up" data-order-id="${i.id}" title="${L('上移一层', 'Move up one layer')}" ${rank === 0 ? 'disabled' : ''}>▲</button>
      <button type="button" class="order-btn" data-order="down" data-order-id="${i.id}" title="${L('下移一层', 'Move down one layer')}" ${rank === total - 1 ? 'disabled' : ''}>▼</button>` : '';
    return `<div class="item-row ${i.id === s.selectedId ? 'selected' : ''}" data-select="${i.id}"
      ${sortable ? `draggable="true" data-order-id="${i.id}"` : ''} title="${esc(name)} · ${esc(spec)}">
      <span class="u-tag">${esc(tag)}</span>
      <span class="name">${esc(name)}<em class="row-spec">${esc(spec)}</em></span>
      ${orderButtons}
      <button type="button" class="del" data-remove="${i.id}" title="${L('删除', 'Delete')}">×</button>
    </div>`;
  };
  const list = items.length
    ? mounted.map((i, idx) => row(i, idx, mounted.length, true)).join('')
      + others.map((i) => row(i, 0, 0, false)).join('')
    : `<div class="empty-state">${L('尚未添加组件', 'No components yet')}<br/>${L('从「组件库」拖放部件开始拼装', 'Drag parts from the Component Library')}</div>`;

  let detail = '';
  if (selected && c) {
    const uEditable = itemOccupiesU(selected);
    const size = itemUSize(selected);
    const depth = itemDepth(selected);
    const sizeField = c.uOptions
      ? `<div class="field"><label>${L('机架高度 (U)', 'Rack height (U)')}</label>
          <select class="select" data-item="uSize">${c.uOptions.map((n) => `<option value="${n}" ${n === size ? 'selected' : ''}>${n}U · ${displayLength(n * U_MM, s.unit)}</option>`).join('')}</select></div>`
      : c.uRange
        ? `<div class="field"><label>${L('机架高度 (U)', 'Rack height (U)')}<span class="field-sub">${c.uRange[0]}–${c.uRange[1]}U</span></label>
            <span style="display:flex;align-items:center;gap:5px"><input class="input" data-item="uSize" type="number" min="${c.uRange[0]}" max="${c.uRange[1]}" value="${size}" style="width:64px"/><span class="input-unit">U · ${displayLength(size * U_MM, s.unit)}</span></span></div>`
        : `<div class="field"><label>${L('机架高度', 'Rack height')}</label><strong>${size}U · ${displayLength(size * U_MM, s.unit)}</strong></div>`;
    const depthField = c.depthRange
      ? `<div class="field"><label>${L('设备深度', 'Device depth')}<span class="field-sub">${L('可用', 'usable')} ${displayLength(usableDepth(frame), s.unit)}</span></label>
          <span style="display:flex;align-items:center;gap:5px"><input class="input" data-item="depth" value="${lenValue(depth, s.unit)}"/><span class="input-unit">${lengthUnit(s.unit)}</span></span></div>
        <p class="note" style="margin:-4px 0 10px">${L('可输入 600mm / 24in 等带单位数值，切换单位会自动换算。', 'Unit-suffixed values such as 600mm / 24in are accepted; switching units converts them.')}</p>`
      : `<div class="field"><label>${L('设备深度', 'Device depth')}</label><strong>${depth > 0 ? displayLength(depth, s.unit) : '-'}</strong></div>`;
    detail = `<div class="section">
      <div class="section-title">${L('选中部件', 'SELECTED COMPONENT')}</div>
      <div class="card">
        <div class="field"><label>${L('组件名称（可重命名）', 'Layer name (editable)')}</label>
          <input class="input wide" data-item="name" value="${esc(selected.name || '')}" placeholder="${esc(loc(c.name))}" /></div>
        <div class="field"><label>${L('物料号', 'Part No.')}</label><span class="lib-spec">${esc(c.partNo)}</span></div>
        ${uEditable ? `<div class="field"><label>${L('起始 U 位', 'Start U')}</label>
          <span style="display:flex;align-items:center;gap:5px"><input class="input" data-item="u" value="${selected.u}" style="width:64px"/><span class="input-unit">/ ${frame.heightU}U</span></span></div>` : ''}
        ${sizeField}
        ${depthField}
        <div class="field"><label>${L('丝印 / 备注', 'Silk-screen / note')}</label>
          <input class="input wide" data-item="label" value="${esc(selected.label || '')}" placeholder="${L('面板丝印文字', 'Panel legend')}" /></div>
        <div class="field"><label>${L('部件颜色', 'Colour')}</label>
          <input type="color" data-item="color" value="${esc(selected.color || '#3c4857')}" style="width:52px;height:26px;background:none;border:1px solid var(--line);border-radius:4px"/></div>
        <p class="note">${esc(loc(c.desc))}</p>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:10px">
          ${uEditable ? `<button type="button" class="btn sm" data-act="up">${L('上移 1U', 'Up 1U')}</button>
            <button type="button" class="btn sm" data-act="down">${L('下移 1U', 'Down 1U')}</button>` : ''}
          <button type="button" class="btn sm" data-act="duplicate">${L('复制', 'Duplicate')}</button>
          <button type="button" class="btn sm danger" data-act="delete">${L('删除', 'Delete')}</button>
        </div>
      </div>
    </div>`;
  }

  const orderHint = mounted.length > 1
    ? `<p class="note" style="margin:0 0 8px">${L('拖动行或点 ▲▼ 调整顺序，组件在机柜中的 U 位会同步重排。', 'Drag a row or use ▲▼ to reorder; U positions in the rack reflow automatically.')}</p>`
    : '';
  return `${detail}
  <div class="section">
    <div class="section-title">${L('已装配组件', 'ASSEMBLED COMPONENTS')}<span class="hint">${items.length}</span></div>
    ${orderHint}
    ${list}
    ${items.length ? `<button type="button" class="btn sm" data-act="clear" style="margin-top:8px">${L('清空组件', 'Clear all')}</button>` : ''}
  </div>
  <div class="section">
    <div class="section-title">${L('框架摘要', 'FRAME SUMMARY')}</div>
    <div class="card"><p class="note" style="margin:0">
      ${frame.heightU}U · ${displayLength(frame.width, s.unit)} × ${displayLength(frame.depth, s.unit)} × ${displayLength(cabinetHeight(frame), s.unit)}<br/>
      ${L('可用安装深度', 'Usable depth')}: ${displayLength(usableDepth(frame), s.unit)} ·
      ${L('承载上限', 'Load limit')}: ${displayMass(loadLimit(frame), s.unit, 0)}<br/>
      ${esc(standardLabel(s.unit))}
    </p></div>
  </div>`;
}

export function renderChecks(s: AppState): string {
  const checks = validate(s);
  const m = projectMetrics(s);
  const f = s.config.frame;
  const errs = checks.filter((c) => c.level === 'error').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  const boxes = `
    <div class="summary-box">
      <div><span>${L('U 位占用', 'U occupancy')}</span><strong>${m.usedU} / ${f.heightU}U</strong></div>
      <div><span>${L('总重', 'Total mass')}</span><strong>${displayMass(m.totalKg, s.unit, 1)}</strong></div>
      <div><span>${L('设备功耗', 'Heat load')}</span><strong>${Math.round(m.totalW)} W</strong></div>
      <div><span>${L('检查状态', 'Checks')}</span><strong style="color:${errs ? 'var(--red)' : warns ? 'var(--amber)' : 'var(--green)'}">${errs ? `${errs} ${L('错误', 'err')}` : warns ? `${warns} ${L('提示', 'warn')}` : L('通过', 'OK')}</strong></div>
    </div>`;
  const list = checks.map((c) => `
    <div class="check ${c.level}" ${c.itemId ? `data-select="${c.itemId}"` : ''}>
      <span class="ico">${c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '×'}</span>
      <span class="msg">${esc(c.text)}</span>
    </div>`).join('');
  return `${boxes}
  <div class="section-title">${L('合理性检查', 'PLAUSIBILITY CHECK')}<span class="hint">${L('自动', 'Automatic')}</span></div>
  ${list}
  <p class="note">${L('检查覆盖：U 位冲突、设备深度、载重、散热、IP/EMC 与门的匹配、脚轮/接地套件缺件、空 U 位气流。',
    'Checks cover: U collisions, device depth, load, cooling, door vs IP/EMC, missing castors/grounding kits, and open U airflow.')}</p>`;
}

export function renderBom(s: AppState): string {
  const rows = buildBom(s.config, s.unit);
  const totalW = rows.reduce((a, r) => a + r.totalWeight, 0);
  const totalP = rows.reduce((a, r) => a + r.totalPrice, 0);
  const table = `<table class="bom"><thead><tr>
      <th>#</th><th>${L('物料号', 'Part No.')}</th><th>${L('名称', 'Description')}</th>
      <th>${L('数量', 'Qty')}</th><th>${L('单重', 'kg')}</th><th>${L('合价', 'CNY')}</th>
    </tr></thead><tbody>${rows.map((r, i) => `<tr title="${esc(r.spec)}">
      <td>${i + 1}</td><td>${esc(r.partNo)}</td><td>${esc(r.name)}</td>
      <td class="num">${r.qty}</td><td class="num">${r.unitWeight.toFixed(1)}</td>
      <td class="num">${fmt(r.totalPrice, 0)}</td>
    </tr>`).join('')}</tbody></table>`;
  return `
  <div class="section">
    <div class="section-title">${L('物料清单', 'BILL OF MATERIALS')}<span class="hint">${rows.length} ${L('行', 'lines')}</span></div>
    <div class="summary-box">
      <div><span>${L('总重', 'Total mass')}</span><strong>${displayMass(totalW, s.unit, 1)}</strong></div>
      <div><span>${L('参考价', 'Indicative price')}</span><strong>¥${fmt(totalP, 0)}</strong></div>
    </div>
    ${table}
    <div class="bom-total"><span>${L('合计', 'TOTAL')}</span><span>¥${fmt(totalP, 0)}</span></div>
    <button type="button" class="btn" data-export="csv" style="width:100%">${L('导出 BOM (.csv)', 'Export BOM (.csv)')}</button>
    <p class="note">${L('价格为占位参考值，不构成报价。CSV 同时输出公制与英制总重。',
      'Prices are indicative placeholders, not a quotation. The CSV includes both metric and imperial total mass.')}</p>
  </div>`;
}

export function renderStatus(s: AppState): { dot: string; text: string; metrics: string } {
  const checks = validate(s);
  const errs = checks.filter((c) => c.level === 'error').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  const m = projectMetrics(s);
  const dot = errs ? 'error' : warns ? 'warn' : '';
  const text = errs
    ? L(`${errs} 项配置错误，请在「检查」面板查看`, `${errs} configuration errors — see Checks`)
    : warns
      ? L(`${warns} 项提示，建议复核`, `${warns} warnings — review recommended`)
      : L('配置有效 · 自动保存至本地', 'Valid configuration · auto-saved locally');
  const metrics = `${s.config.frame.heightU}U · ${m.usedU}U ${L('已用', 'used')} · ${displayMass(m.totalKg, s.unit, 1)} · ${Math.round(m.totalW)} W · ${s.config.items.length} ${L('件', 'parts')}`;
  return { dot, text, metrics };
}

export function toast(message: string, kind: 'info' | 'success' | 'warn' | 'error' = 'info'): void {
  const host = document.getElementById('toast-host');
  if (!host) return;
  while (host.children.length >= 3) host.firstElementChild?.remove();
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

export function showHelp(): void {
  const host = document.getElementById('modal-host');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `<div class="modal">
    <h2>${L('BTF BuildTestFrame 使用说明', 'BTF BuildTestFrame — User Guide')}</h2>
    <p>${L('开源在线 19″ 标准机柜设计拼装工具。参考 nVent SCHROFF Varistar CP 3D 配置器的公开交互流程独立实现，未使用其任何代码或素材。',
      'An open-source online 19″ rack configurator. Independently implemented after studying the publicly documented workflow of the nVent SCHROFF Varistar CP 3D configurator; no code or assets from that site are used.')}</p>
    <h3>${L('工作流程', 'Workflow')}</h3>
    <ol>
      <li>${L('「框架向导」定义高度 / 宽度 / 深度 / Xf-C 凹槽 → 生成 3D 框架。', 'Use the Frame Wizard to define height / width / depth / Xf-C setbacks → the 3D frame is generated.')}</li>
      <li>${L('「组件库」拖放部件到 3D 视图的目标 U 位，或点 + 自动找空位。', 'Drag parts from the Component Library onto a U position in the 3D view, or click + for auto-placement.')}</li>
      <li>${L('「属性」修改组件名称、U 位、U 高、深度、颜色、丝印文字；「检查」实时做合理性校验。', 'Edit the layer name, U position, U height, depth, colour and silk-screen text in Inspector; Checks validates live.')}</li>
      <li>${L('「BOM」查看物料清单；顶部「导出」可输出 JSON / CSV / PNG / STL / GLB。', 'Review the BOM; the top Export menu writes JSON / CSV / PNG / STL / GLB.')}</li>
    </ol>
    <h3>${L('单位与标准', 'Units & standards')}</h3>
    <table>
      <tr><th></th><th>${L('公制 / 国标', 'Metric / GB')}</th><th>${L('英制', 'Imperial')}</th></tr>
      <tr><td>${L('标准', 'Standard')}</td><td>GB/T 19520.1 · IEC 60297</td><td>EIA-310-E</td></tr>
      <tr><td>1U</td><td>44.45 mm</td><td>1.75 in</td></tr>
      <tr><td>19″</td><td>482.6 mm</td><td>19 in</td></tr>
      <tr><td>${L('安装孔中心距', 'Mounting centres')}</td><td>465 mm</td><td>18.31 in</td></tr>
    </table>
    <p>${L('输入框支持带单位文本，如 600mm、24in、2′6″、0.6m；不带单位时按当前单位体系解释。',
      'Inputs accept unit suffixes such as 600mm, 24in, 2′6″, 0.6m; bare numbers follow the active unit system.')}</p>
    <h3>${L('可配置组件与排序', 'Configurable parts & ordering')}</h3>
    <ul>
      <li>${L('「测试设备」分类：自定义测试机箱（1–12U、深度 200–1400 mm 可调）、示波器与 RF 测试仪（3 / 4 / 5U 可选）、可编程电源（1–5U 可选）。',
        'Test Equipment: custom test chassis (1–12U, 200–1400 mm depth), oscilloscope and RF test set (3 / 4 / 5U), programmable PSU (1–5U).')}</li>
      <li>${L('在「属性」里可为每层组件改名，名称显示在列表、BOM 规格与 3D 面板铭牌上。',
        'Each layer can be renamed in Inspector; the name shows in the list, BOM spec and the 3D nameplate.')}</li>
      <li>${L('拖动「已装配组件」列表的行，或点 ▲▼ 调整顺序，机柜内 U 位会自动重排并避让冲突。',
        'Drag rows in Assembled Components or use ▲▼; U positions reflow automatically with collision avoidance.')}</li>
    </ul>
    <h3>${L('操作提示', 'Tips')}</h3>
    <p>${L('左键旋转 / 滚轮缩放 / 右键平移；点击部件选中；切到「组件库」后可直接拖拽。配置自动保存在浏览器本地，也可用 JSON 文件导入导出。',
      'Left-drag orbits, wheel zooms, right-drag pans. Click a part to select it. Configurations are auto-saved locally and can be exchanged as JSON files.')}</p>
    <h3>${L('开源许可', 'Open source')}</h3>
    <p>MIT · ${L('依赖', 'Dependencies')}: three.js (MIT), Vite (MIT), TypeScript (Apache-2.0). ${L('价格为占位参考值。', 'Prices are indicative placeholders.')}</p>
    <div class="modal-actions"><button type="button" class="btn primary" id="modal-close">${L('知道了', 'Got it')}</button></div>
  </div>`;
  document.getElementById('modal-close')?.addEventListener('click', () => { host.hidden = true; host.innerHTML = ''; });
  host.addEventListener('click', (e) => {
    if (e.target === host) { host.hidden = true; host.innerHTML = ''; }
  }, { once: true });
}
