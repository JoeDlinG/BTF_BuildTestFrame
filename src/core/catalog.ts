import type { CatalogItem, Category } from './types';

/**
 * Component library. Everything is an open, generic 19" part — no vendor-specific
 * part numbers or proprietary data are reproduced from the reference site.
 * Prices are indicative placeholders (CNY) for BOM structure only.
 */
export const CATALOG: CatalogItem[] = [
  // ---------- doors / locks ----------
  { id: 'lock-mech', partNo: 'BTF-DR-LOCK01', category: 'door', slot: 'front', uSize: 0, depth: 0, weight: 0.4, power: 0, price: 180, geom: 'label', icon: 'LK',
    name: { zh: '机械门锁', en: 'Mechanical door lock' }, desc: { zh: '带钥匙的转舌锁，适配前后门', en: 'Keyed quarter-turn lock for front/rear doors' } },
  { id: 'lock-rfid', partNo: 'BTF-DR-LOCK02', category: 'door', slot: 'front', uSize: 0, depth: 0, weight: 0.6, power: 5, price: 1250, geom: 'label', icon: 'RF',
    name: { zh: 'RFID 电子门禁', en: 'RFID access lock' }, desc: { zh: '刷卡/远程开门，带门磁状态输出', en: 'RFID / remote unlock with door status output' } },
  { id: 'door-seal', partNo: 'BTF-DR-SEAL1', category: 'door', slot: 'front', uSize: 0, depth: 0, weight: 0.8, power: 0, price: 260, geom: 'label', icon: 'SE',
    name: { zh: 'EMC / IP 门密封条', en: 'EMC / IP door gasket' }, desc: { zh: '织物导电密封条，提升屏蔽与防护等级', en: 'Conductive textile gasket for shielding and sealing' } },
  { id: 'door-hinge', partNo: 'BTF-DR-HINGE', category: 'door', slot: 'front', uSize: 0, depth: 0, weight: 0.5, power: 0, price: 150, geom: 'label', icon: 'HG',
    name: { zh: '180° 快拆铰链', en: '180° quick-release hinge' }, desc: { zh: '可左右换向，单人拆装门板', en: 'Reversible, single-person door removal' } },

  // ---------- panels / covers ----------
  { id: 'side-solid', partNo: 'BTF-PN-SIDE1', category: 'panel', slot: 'side', uSize: 0, depth: 0, weight: 8.5, power: 0, price: 480, geom: 'side', icon: 'SP',
    name: { zh: '实心侧板（对）', en: 'Solid side panels (pair)' }, desc: { zh: '钢板侧板，提升 EMC 与防护', en: 'Steel side panels for EMC and ingress protection' } },
  { id: 'side-vented', partNo: 'BTF-PN-SIDE2', category: 'panel', slot: 'side', uSize: 0, depth: 0, weight: 7.2, power: 0, price: 520, geom: 'side', icon: 'SV',
    name: { zh: '通风侧板（对）', en: 'Vented side panels (pair)' }, desc: { zh: '冲孔散热侧板', en: 'Perforated side panels for extra airflow' } },
  { id: 'top-vented', partNo: 'BTF-PN-TOP01', category: 'panel', slot: 'top', uSize: 0, depth: 0, weight: 3.4, power: 0, price: 320, geom: 'top', icon: 'TV',
    name: { zh: '冲孔顶盖', en: 'Vented top cover' }, desc: { zh: '带风扇安装位与走线开孔', en: 'Fan mounting positions and cable entry' } },
  { id: 'top-cable', partNo: 'BTF-PN-TOP02', category: 'panel', slot: 'top', uSize: 0, depth: 0, weight: 3.8, power: 0, price: 380, geom: 'top', icon: 'TC',
    name: { zh: '大走线顶盖', en: 'Cable-entry top cover' }, desc: { zh: '大尺寸开孔＋毛刷进线', en: 'Large cut-out with brush strip' } },
  { id: 'rear-panel', partNo: 'BTF-PN-REAR1', category: 'panel', slot: 'rear', uSize: 0, depth: 0, weight: 6.0, power: 0, price: 400, geom: 'side', icon: 'RP',
    name: { zh: '实心背板', en: 'Solid rear panel' }, desc: { zh: '可开孔的整块后封板', en: 'Full-height rear closure panel' } },

  // ---------- base / mobility ----------
  { id: 'plinth-fixed', partNo: 'BTF-BS-PLN01', category: 'base', slot: 'base', uSize: 0, depth: 0, weight: 12, power: 0, price: 620, geom: 'plinth', icon: 'PL',
    name: { zh: '固定底座 100 mm', en: 'Fixed plinth 100 mm' }, desc: { zh: '带进线开孔与调平脚', en: 'Cable entry and leveling feet' } },
  { id: 'caster-set', partNo: 'BTF-BS-CAST1', category: 'base', slot: 'base', uSize: 0, depth: 0, weight: 6.5, power: 0, price: 880, geom: 'caster', icon: 'CS',
    name: { zh: '重载脚轮组', en: 'Heavy-duty caster set' }, desc: { zh: '4 只带刹车脚轮，动载 1000 kg', en: '4 braked castors, 1000 kg dynamic load' } },
  { id: 'leveling-feet', partNo: 'BTF-BS-FEET1', category: 'base', slot: 'base', uSize: 0, depth: 0, weight: 2.2, power: 0, price: 200, geom: 'plinth', icon: 'LF',
    name: { zh: '调平支脚组', en: 'Leveling feet set' }, desc: { zh: '可调高度，补偿地面不平', en: 'Height adjustable for uneven floors' } },
  { id: 'seismic-base', partNo: 'BTF-BS-SEIS1', category: 'base', slot: 'base', uSize: 0, depth: 0, weight: 22, power: 0, price: 1900, geom: 'plinth', icon: 'SB',
    name: { zh: '抗震加固底座', en: 'Seismic reinforced base' }, desc: { zh: '加强型地脚固定，适用于抗震框架', en: 'Anchored base for seismic frames' } },
  { id: 'ground-kit', partNo: 'BTF-BS-GND01', category: 'base', slot: 'base', uSize: 0, depth: 0, weight: 1.1, power: 0, price: 160, geom: 'ground', icon: 'GD',
    name: { zh: '接地套件', en: 'Grounding kit' }, desc: { zh: '门/侧板/框架等电位接地编织带', en: 'Equipotential bonding straps for doors and panels' } },

  // ---------- 19" devices ----------
  { id: 'server-1u', partNo: 'BTF-DV-SRV1U', category: 'device', slot: 'front', uSize: 1, depth: 750, weight: 13, power: 450, price: 12000, geom: 'server', icon: 'S1',
    name: { zh: '1U 机架服务器', en: '1U rack server' }, desc: { zh: '深度 750 mm，双电源', en: '750 mm deep, redundant PSU' } },
  { id: 'server-2u', partNo: 'BTF-DV-SRV2U', category: 'device', slot: 'front', uSize: 2, depth: 800, weight: 24, power: 850, price: 22000, geom: 'server', icon: 'S2',
    name: { zh: '2U 双路服务器', en: '2U dual-socket server' }, desc: { zh: '深度 800 mm，需 ≥1000 mm 机柜', en: '800 mm deep, requires ≥1000 mm cabinet' } },
  { id: 'server-4u', partNo: 'BTF-DV-IPC4U', category: 'device', slot: 'front', uSize: 4, depth: 650, weight: 30, power: 900, price: 18000, geom: 'server', icon: 'S4',
    name: { zh: '4U 工控机 / 测试主机', en: '4U industrial PC / test host' }, desc: { zh: '测试系统主机，深度 650 mm', en: 'Test system controller, 650 mm deep' } },
  { id: 'switch-1u', partNo: 'BTF-DV-SW01', category: 'device', slot: 'front', uSize: 1, depth: 450, weight: 6, power: 160, price: 5600, geom: 'switch', icon: 'SW',
    name: { zh: '1U 以太网交换机', en: '1U Ethernet switch' }, desc: { zh: '48 口千兆＋4 光口', en: '48×GbE + 4×SFP+' } },
  { id: 'patch-1u', partNo: 'BTF-DV-PT01', category: 'device', slot: 'front', uSize: 1, depth: 120, weight: 1.2, power: 0, price: 320, geom: 'patch', icon: 'PP',
    name: { zh: '1U 配线架', en: '1U patch panel' }, desc: { zh: '24 口，含理线环', en: '24-port with rear cable management' } },
  { id: 'kvm-1u', partNo: 'BTF-DV-KVM1', category: 'device', slot: 'front', uSize: 1, depth: 500, weight: 8, power: 35, price: 4200, geom: 'kvm', icon: 'KV',
    name: { zh: '1U 折叠 KVM', en: '1U fold-out KVM' }, desc: { zh: '17″ 液晶＋键盘，滑轨抽拉', en: '17″ display + keyboard on rails' } },
  { id: 'storage-2u', partNo: 'BTF-DV-STO2', category: 'device', slot: 'front', uSize: 2, depth: 700, weight: 21, power: 520, price: 16000, geom: 'server', icon: 'ST',
    name: { zh: '2U 存储阵列', en: '2U storage array' }, desc: { zh: '12 盘位，深度 700 mm', en: '12-bay, 700 mm deep' } },
  { id: 'meas-2u', partNo: 'BTF-DV-MEAS2', category: 'device', slot: 'front', uSize: 2, depth: 550, weight: 11, power: 260, price: 9800, geom: 'server', icon: 'MS',
    name: { zh: '2U 测试测量仪器', en: '2U test & measurement unit' }, desc: { zh: '程控电源 / 数据采集主机', en: 'Programmable supply / DAQ mainframe' } },

  // ---------- power ----------
  { id: 'pdu-0u', partNo: 'BTF-PW-PDU0U', category: 'power', slot: 'vertical', uSize: 0, depth: 0, weight: 3.2, power: 0, price: 1450, geom: 'pdu-v', icon: 'P0',
    name: { zh: '0U 竖直 PDU', en: '0U vertical PDU' }, desc: { zh: '24 位 C13/C19，带电流监测', en: '24×C13/C19 with current metering' }, maxPerRack: 2 },
  { id: 'pdu-1u', partNo: 'BTF-PW-PDU1U', category: 'power', slot: 'front', uSize: 1, depth: 180, weight: 2.6, power: 0, price: 780, geom: 'pdu-h', icon: 'P1',
    name: { zh: '1U 水平 PDU', en: '1U horizontal PDU' }, desc: { zh: '8 位国标/万用插座，带开关', en: '8 outlets with master switch' } },
  { id: 'ups-2u', partNo: 'BTF-PW-UPS2', category: 'power', slot: 'front', uSize: 2, depth: 600, weight: 26, power: 120, price: 6800, geom: 'ups', icon: 'UP',
    name: { zh: '2U 在线式 UPS', en: '2U online UPS' }, desc: { zh: '3 kVA，含电池组', en: '3 kVA with battery pack' } },
  { id: 'surge-1u', partNo: 'BTF-PW-SPD1', category: 'power', slot: 'front', uSize: 1, depth: 150, weight: 1.8, power: 0, price: 420, geom: 'pdu-h', icon: 'SD',
    name: { zh: '1U 防雷电源分配', en: '1U surge-protected PDU' }, desc: { zh: '带 SPD 与滤波器', en: 'SPD and EMI filter' } },

  // ---------- cooling ----------
  { id: 'fan-top', partNo: 'BTF-CL-FANT', category: 'cooling', slot: 'top', uSize: 0, depth: 0, weight: 4.2, power: 90, price: 1100, geom: 'fan', icon: 'FT',
    name: { zh: '顶置风扇单元', en: 'Top-mounted fan tray' }, desc: { zh: '3 风机，顶部排风', en: '3 fans, roof exhaust' }, maxPerRack: 2 },
  { id: 'fan-1u', partNo: 'BTF-CL-FAN1', category: 'cooling', slot: 'front', uSize: 1, depth: 300, weight: 3.0, power: 70, price: 680, geom: 'fan', icon: 'F1',
    name: { zh: '1U 风扇插箱', en: '1U fan tray' }, desc: { zh: '前部送风，3 风机', en: 'Front intake, 3 fans' } },
  { id: 'baffle-1u', partNo: 'BTF-CL-BAF1', category: 'cooling', slot: 'front', uSize: 1, depth: 200, weight: 0.9, power: 0, price: 160, geom: 'blank', icon: 'BF',
    name: { zh: '1U 气流导流板', en: '1U airflow baffle' }, desc: { zh: '阻断热风回流', en: 'Blocks hot-air recirculation' } },
  { id: 'thermostat', partNo: 'BTF-CL-THM1', category: 'cooling', slot: 'vertical', uSize: 0, depth: 0, weight: 0.5, power: 8, price: 560, geom: 'label', icon: 'TH',
    name: { zh: '温控 / 环境监测', en: 'Thermostat / env. monitor' }, desc: { zh: '双探头，支持告警输出', en: 'Dual probe with alarm output' }, maxPerRack: 1 },

  // ---------- accessories ----------
  { id: 'shelf-1u', partNo: 'BTF-AC-SHF1', category: 'accessory', slot: 'front', uSize: 1, depth: 600, weight: 4.5, power: 0, price: 380, geom: 'shelf', icon: 'SH',
    name: { zh: '1U 固定层板', en: '1U fixed shelf' }, desc: { zh: '承重 50 kg，深度 600 mm', en: '50 kg load, 600 mm deep' } },
  { id: 'shelf-slide', partNo: 'BTF-AC-SHF2', category: 'accessory', slot: 'front', uSize: 1, depth: 700, weight: 6.8, power: 0, price: 760, geom: 'shelf', icon: 'SL',
    name: { zh: '1U 滑动层板', en: '1U sliding shelf' }, desc: { zh: '带滑轨，可抽出维护', en: 'Pull-out rails for service' } },
  { id: 'cable-1u', partNo: 'BTF-AC-CBL1', category: 'accessory', slot: 'front', uSize: 1, depth: 100, weight: 1.0, power: 0, price: 180, geom: 'cable', icon: 'C1',
    name: { zh: '1U 理线架', en: '1U cable manager' }, desc: { zh: '带盖板水平理线槽', en: 'Horizontal manager with cover' } },
  { id: 'cable-2u', partNo: 'BTF-AC-CBL2', category: 'accessory', slot: 'front', uSize: 2, depth: 120, weight: 1.6, power: 0, price: 280, geom: 'cable', icon: 'C2',
    name: { zh: '2U 大理线槽', en: '2U cable trough' }, desc: { zh: '高密度跳线整理', en: 'High-density patch cord routing' } },
  { id: 'blank-1u', partNo: 'BTF-AC-BLK1', category: 'accessory', slot: 'front', uSize: 1, depth: 20, weight: 0.3, power: 0, price: 55, geom: 'blank', icon: 'B1',
    name: { zh: '1U 盲板', en: '1U blanking panel' }, desc: { zh: '免工具卡扣，优化气流', en: 'Tool-less, improves airflow' } },
  { id: 'blank-2u', partNo: 'BTF-AC-BLK2', category: 'accessory', slot: 'front', uSize: 2, depth: 20, weight: 0.5, power: 0, price: 85, geom: 'blank', icon: 'B2',
    name: { zh: '2U 盲板', en: '2U blanking panel' }, desc: { zh: '免工具卡扣', en: 'Tool-less snap-in' } },
  { id: 'brush-1u', partNo: 'BTF-AC-BRS1', category: 'accessory', slot: 'front', uSize: 1, depth: 40, weight: 0.4, power: 0, price: 120, geom: 'brush', icon: 'BR',
    name: { zh: '1U 毛刷进线板', en: '1U brush strip panel' }, desc: { zh: '防尘同时允许线缆穿过', en: 'Dust seal with cable pass-through' } },
  { id: 'rail-kit', partNo: 'BTF-AC-RAIL', category: 'accessory', slot: 'rear', uSize: 0, depth: 0, weight: 5.5, power: 0, price: 520, geom: 'label', icon: 'RK',
    name: { zh: '19″ 后立柱导轨套件', en: '19″ rear rail kit' }, desc: { zh: '支持前后双对立柱（C 尺寸）', en: 'Second rail pair (C dimension) for deep devices' } },

  // ---------- customization ----------
  { id: 'cutout', partNo: 'BTF-CU-CUT01', category: 'custom', slot: 'front', uSize: 1, depth: 15, weight: 0.2, power: 0, price: 240, geom: 'cutout', icon: 'CO',
    name: { zh: '定制开孔面板', en: 'Custom cut-out panel' }, desc: { zh: '按开孔库在面板上开孔', en: 'Panel with cut-outs from the library' } },
  { id: 'text-print', partNo: 'BTF-CU-TXT01', category: 'custom', slot: 'front', uSize: 1, depth: 15, weight: 0.2, power: 0, price: 160, geom: 'label', icon: 'TX',
    name: { zh: '文字丝印', en: 'Silk-screen text' }, desc: { zh: '自定义标识文字（可编辑）', en: 'Editable identification text' } },
  { id: 'logo-plate', partNo: 'BTF-CU-LOGO1', category: 'custom', slot: 'front', uSize: 1, depth: 15, weight: 0.3, power: 0, price: 260, geom: 'logo', icon: 'LG',
    name: { zh: 'Logo 铭牌', en: 'Logo nameplate' }, desc: { zh: '前门/顶部标识牌', en: 'Brand plate for door or top' } },
];

export const CATEGORY_ORDER: Category[] = [
  'door', 'panel', 'base', 'device', 'power', 'cooling', 'accessory', 'custom',
];

const INDEX = new Map(CATALOG.map((c) => [c.id, c]));

export function catalogById(id: string): CatalogItem | undefined {
  return INDEX.get(id);
}

export function categoryLabel(cat: Category | 'all'): { zh: string; en: string } {
  const map: Record<Category | 'all', { zh: string; en: string }> = {
    all: { zh: '全部', en: 'All' },
    door: { zh: '门与锁', en: 'Doors & Locks' },
    panel: { zh: '覆板', en: 'Panels' },
    base: { zh: '底座', en: 'Base' },
    device: { zh: '19″ 设备', en: '19″ Devices' },
    power: { zh: '供电', en: 'Power' },
    cooling: { zh: '散热', en: 'Cooling' },
    accessory: { zh: '附件', en: 'Accessories' },
    custom: { zh: '定制', en: 'Custom' },
  };
  return map[cat];
}

/** True when the item occupies one or more U positions in a 19" rail. */
export function occupiesU(item: CatalogItem): boolean {
  return item.uSize > 0 && (item.slot === 'front' || item.slot === 'rear');
}
