export const ITEMS = {
  dirt: { name: '星球沃土', icon: 'soil', color: '#8a6b46', desc: '混合有机质的表层土壤，可用于凝铸地形。', value: 1 },
  stone: { name: '岩石', icon: 'rock', color: '#8a9298', desc: '致密的硅酸盐岩块，基础建造材料。', value: 1 },
  wood: { name: '木质纤维', icon: 'wood', color: '#a8794b', desc: '从本地植物中提取的坚韧纤维。', value: 1 },
  fiber: { name: '植物纤维', icon: 'fiber', color: '#84a967', desc: '可编织为索具与隔热层。', value: 1 },
  iron: { name: '铁矿石', icon: 'ore', color: '#b17c61', desc: '含铁量可观的暗红色矿石。', value: 2 },
  titanium: { name: '钛矿', icon: 'ore', color: '#9eb9c8', desc: '轻而坚固的星舰结构材料。', value: 3 },
  crystal: { name: '星髓晶', icon: 'crystal', color: '#6de1ff', desc: '凝结了恒星辉光的晶体，可直接汲取 22 点法力，也是法力的固态载体。', value: 6, usable: true },
  ice: { name: '冰晶', icon: 'crystal', color: '#bfeef5', desc: '低温水冰，可电解出氧气与氢燃料。', value: 1 },
  exotic: { name: '奇点尘埃', icon: 'crystal', color: '#d99bff', desc: '来自高能天体边缘的奇异物质。', value: 12 },
  bio: { name: '异星孢子', icon: 'fiber', color: '#b7ef7d', desc: '具有发光特性的生态样本，蕴含微量灵气。', value: 4 },
  scrap: { name: '合金残骸', icon: 'metal', color: '#8f9aa1', desc: '旧时代航行器的残片，可回收利用。', value: 2 },
  beacon: { name: '星舰信标', icon: 'beacon', color: '#7fe9ff', desc: '向近地轨道上传牵引坐标，召唤个人星舰。', value: 30, craftable: true },
  medkit: { name: '纳米修复剂', icon: 'vial', color: '#ff6f7e', desc: '恢复 45 点生命，生存模式必备。', value: 8, craftable: true, usable: true },
  manaVial: { name: '星髓浓缩液', icon: 'vial', color: '#67dcff', desc: '恢复 40 点法力。', value: 10, craftable: true, usable: true },
  ration: { name: '营养凝胶', icon: 'vial', color: '#d9e27d', desc: '恢复 35 点体力并小幅回复生命。', value: 5, craftable: true, usable: true },
  stonePick: { name: '石质采掘镐', icon: 'tool', color: '#a8a49b', desc: '扩大开挖半径的基础工具。', value: 20, craftable: true, tool: 'stonePick' },
  ironPick: { name: '铁质采掘镐', icon: 'tool', color: '#d1b295', desc: '稳定快速的深层采掘工具。', value: 50, craftable: true, tool: 'ironPick' },
  plasmaDrill: { name: '等离子掘进器', icon: 'tool', color: '#5bd9ff', desc: '以约束等离子束切开岩层，可挖出宽阔隧道。', value: 180, craftable: true, tool: 'plasmaDrill' },
  terraformer: { name: '物质凝铸器', icon: 'tool', color: '#ffce73', desc: '将背包材料重构为固态地形，右键凝铸。', value: 120, craftable: true, tool: 'terraformer' },
  pulseRifle: { name: '脉冲步枪', icon: 'weapon', color: '#88d0ff', desc: '凝聚星辉的脉冲武器，对实体与地形造成高额破坏。', value: 220, craftable: true, weapon: 'pulseRifle' },
  starblade: { name: '星陨长剑', icon: 'weapon', color: '#ffd687', desc: '以星髓晶锻造的近战兵器，破坏力随境界指数增长。', value: 360, craftable: true, weapon: 'starblade' },
  annihilator: { name: '湮灭炮', icon: 'weapon', color: '#e7a3ff', desc: '高能奇点武器。谨慎使用：它能抹去整片山体。', value: 900, craftable: true, weapon: 'annihilator' },
  singularityCore: { name: '曲率核心', icon: 'crystal', color: '#b58fff', desc: '星舰跃迁引擎的心脏，需星髓晶与奇点尘埃。', value: 500, craftable: true },
  shipDrive: { name: '跃迁引擎', icon: 'metal', color: '#95c9ff', desc: '可进行恒星系内跃迁的曲率推进单元。', value: 700, craftable: true },
};

export const WEAPONS = {
  cutter: { name: '拓荒切割器', damage: 5, radius: 1.05, yield: 0.8, cooldown: 240, desc: '初始多功能切割器，可破坏地形与采集资源。' },
  stonePick: { name: '石质采掘镐', damage: 7, radius: 1.35, yield: 1.1, cooldown: 230, desc: '更快的采掘工具。' },
  ironPick: { name: '铁质采掘镐', damage: 11, radius: 1.7, yield: 1.3, cooldown: 210, desc: '可以深入岩层。' },
  plasmaDrill: { name: '等离子掘进器', damage: 23, radius: 2.5, yield: 1.8, cooldown: 160, desc: '大直径隧道掘进。' },
  pulseRifle: { name: '脉冲步枪', damage: 38, radius: 2.0, yield: 1.4, cooldown: 280, desc: '远程脉冲火力。' },
  starblade: { name: '星陨长剑', damage: 72, radius: 2.8, yield: 1.7, cooldown: 340, desc: '近身斩裂地层。' },
  annihilator: { name: '湮灭炮', damage: 260, radius: 6.5, yield: 2.4, cooldown: 1100, desc: '在湮灭波中蒸发岩层。' },
};

export const TOOL_ORDER = ['cutter', 'stonePick', 'ironPick', 'plasmaDrill', 'pulseRifle', 'starblade', 'annihilator', 'terraformer'];

export const RECIPES = [
  { id: 'beacon', name: '星舰信标', out: 'beacon', count: 1, cost: { iron: 4, crystal: 2, fiber: 3 }, level: 4, cat: '星际' },
  { id: 'stone_pick', name: '石质采掘镐', out: 'stonePick', count: 1, cost: { stone: 6, wood: 3 }, level: 1, cat: '工具' },
  { id: 'iron_pick', name: '铁质采掘镐', out: 'ironPick', count: 1, cost: { iron: 6, wood: 2 }, level: 3, cat: '工具' },
  { id: 'terraformer', name: '物质凝铸器', out: 'terraformer', count: 1, cost: { titanium: 4, crystal: 3 }, level: 5, cat: '工具' },
  { id: 'plasma_drill', name: '等离子掘进器', out: 'plasmaDrill', count: 1, cost: { titanium: 8, crystal: 5, exotic: 1 }, level: 10, cat: '工具' },
  { id: 'pulse_rifle', name: '脉冲步枪', out: 'pulseRifle', count: 1, cost: { titanium: 5, crystal: 4, scrap: 3 }, level: 6, cat: '武器' },
  { id: 'starblade', name: '星陨长剑', out: 'starblade', count: 1, cost: { iron: 12, crystal: 8, exotic: 2 }, level: 13, cat: '武器' },
  { id: 'annihilator', name: '湮灭炮', out: 'annihilator', count: 1, cost: { titanium: 20, crystal: 24, exotic: 6 }, level: 24, cat: '武器' },
  { id: 'medkit', name: '纳米修复剂', out: 'medkit', count: 1, cost: { fiber: 3, bio: 2, crystal: 1 }, level: 1, cat: '消耗品' },
  { id: 'manavial', name: '星髓浓缩液', out: 'manaVial', count: 1, cost: { crystal: 2, ice: 2 }, level: 2, cat: '消耗品' },
  { id: 'ration', name: '营养凝胶', out: 'ration', count: 2, cost: { bio: 3, fiber: 2 }, level: 1, cat: '消耗品' },
  { id: 'core', name: '曲率核心', out: 'singularityCore', count: 1, cost: { exotic: 3, crystal: 6, titanium: 4 }, level: 13, cat: '星际' },
  { id: 'drive', name: '跃迁引擎', out: 'shipDrive', count: 1, cost: { singularityCore: 1, titanium: 8, scrap: 5 }, level: 18, cat: '星际' },
];

export const LOOT_TABLE = {
  dirt: 2, stone: 3, wood: 2, fiber: 2, iron: 1, titanium: 1, crystal: 1, ice: 1, bio: 1,
};

export function toolDisplay(player) {
  return WEAPONS[player.equippedTool] || WEAPONS.cutter;
}
