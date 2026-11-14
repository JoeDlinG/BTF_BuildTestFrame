import type { Lang, LocalizedText } from './types';

let lang: Lang = 'zh';

/** Static strings used by the HTML skeleton (data-i18n attributes). */
const DICT: Record<string, LocalizedText> = {
  'app.subtitle': { zh: '在线标准机柜设计拼装', en: 'Online 19″ Rack Cabinet Configurator' },
  'top.unit': { zh: '单位', en: 'Units' },
  'top.lang': { zh: '语言', en: 'Language' },
  'top.new': { zh: '新建', en: 'New' },
  'top.open': { zh: '打开', en: 'Open' },
  'top.export': { zh: '导出 ▾', en: 'Export ▾' },
  'unit.metricShort': { zh: 'mm · GB', en: 'mm · GB' },
  'unit.imperialShort': { zh: 'in · EIA', en: 'in · EIA' },
  'tab.wizard': { zh: '框架向导', en: 'Frame Wizard' },
  'tab.library': { zh: '组件库', en: 'Component Library' },
  'tab.inspector': { zh: '属性', en: 'Inspector' },
  'tab.checks': { zh: '检查', en: 'Checks' },
  'tab.bom': { zh: 'BOM', en: 'BOM' },
  'view.iso': { zh: '等轴测', en: 'Isometric' },
  'view.front': { zh: '前视', en: 'Front' },
  'view.rear': { zh: '后视', en: 'Rear' },
  'view.side': { zh: '侧视', en: 'Side' },
  'view.top': { zh: '顶视', en: 'Top' },
  'view.explode': { zh: '爆炸图', en: 'Exploded' },
  'view.wireframe': { zh: '线框', en: 'Wireframe' },
  'view.dimensions': { zh: '尺寸标注', en: 'Dimensions' },
  'view.reset': { zh: '复位', en: 'Reset' },
  'export.json': { zh: '配置文件 (.json)', en: 'Configuration (.json)' },
  'export.csv': { zh: '物料清单 (.csv)', en: 'Bill of materials (.csv)' },
  'export.png': { zh: '视图快照 (.png)', en: 'View snapshot (.png)' },
  'export.stl': { zh: '3D 模型 (.stl)', en: '3D model (.stl)' },
  'export.glb': { zh: '3D 模型 (.glb)', en: '3D model (.glb)' },
  'export.step': { zh: 'CAD 实体模型 (.stp)', en: 'CAD solids / STEP (.stp)' },
  'export.pdf': { zh: '工程报告 (.pdf)', en: 'Engineering report (.pdf)' },
};

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  lang = next;
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  document.title = next === 'zh'
    ? 'BTF BuildTestFrame · 在线机柜设计拼装'
    : 'BTF BuildTestFrame · Rack Cabinet Configurator';
  applyStaticI18n();
}

/** Update all elements carrying data-i18n. */
export function applyStaticI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const entry = DICT[el.dataset.i18n || ''];
    if (entry) el.textContent = loc(entry);
  });
}

/** Get a localized string for a static key. */
export function t(key: string): string {
  const entry = DICT[key];
  return entry ? loc(entry) : key;
}

/** Inline bilingual literal — the main i18n mechanism for dynamically rendered UI. */
export function L(zh: string, en: string): string {
  return lang === 'zh' ? zh : en;
}

export function loc(value: LocalizedText): string {
  return lang === 'zh' ? value.zh : value.en;
}
