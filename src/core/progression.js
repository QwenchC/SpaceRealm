export const REALMS = [
  { name: '凡人', level: 1, color: '#9aa8b8', desc: '肉体凡胎，初识星尘。' },
  { name: '炼气', level: 4, color: '#7fe0c3', desc: '引星辉入体，感知天地灵气。' },
  { name: '筑基', level: 8, color: '#64c8ff', desc: '筑就道基，可召唤第一艘星舰。' },
  { name: '金丹', level: 13, color: '#ffd66b', desc: '结成金丹，举手可裂岩。' },
  { name: '元婴', level: 18, color: '#ff9f5b', desc: '元婴出窍，神识覆盖山海。' },
  { name: '化神', level: 24, color: '#ff779d', desc: '一念化神，掌控局部天象。' },
  { name: '炼虚', level: 30, color: '#c18bff', desc: '炼虚合道，折叠近地空间。' },
  { name: '合体', level: 37, color: '#9c8cff', desc: '身与星核合体，力量跨越山岳。' },
  { name: '大乘', level: 44, color: '#7fa8ff', desc: '大道将成，能动摇行星地壳。' },
  { name: '渡劫', level: 52, color: '#6ce5ff', desc: '引动行星雷劫，星海共震。' },
  { name: '地仙', level: 60, color: '#ffe28a', desc: '陆地真仙，一步可越千里。' },
  { name: '星君', level: 70, color: '#fff7dc', desc: '受封星君，掌恒星系之权柄。' },
  { name: '宇宙主宰', level: 82, color: '#ffffff', desc: '身即宇宙，念动星河。' },
];

export const MAX_REASONABLE_LEVEL = 99;

export function xpToNext(level) {
  return Math.floor(120 * Math.pow(1.265, Math.max(0, level - 1)));
}

export function realmForLevel(level) {
  let current = REALMS[0];
  for (const r of REALMS) if (level >= r.level) current = r;
  return current;
}

export function nextRealm(level) {
  return REALMS.find((r) => r.level > level) || null;
}

export function powerMultiplier(level) {
  return Math.pow(1.185, Math.max(0, level - 1));
}

export function totalXpForLevel(level) {
  let sum = 0;
  for (let i = 1; i < level; i++) sum += xpToNext(i);
  return sum;
}

export function deriveLevelFromXp(totalXp) {
  let level = 1;
  let rest = totalXp;
  while (level < MAX_REASONABLE_LEVEL && rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, xp: rest };
}

export function addXp(player, amount) {
  const before = player.level;
  player.xp += Math.max(0, amount);
  let levels = 0;
  while (player.level < MAX_REASONABLE_LEVEL && player.xp >= xpToNext(player.level)) {
    player.xp -= xpToNext(player.level);
    player.level++;
    levels++;
  }
  if (levels > 0) {
    player.maxHp = maxHpFor(player.level);
    player.maxMana = maxManaFor(player.level);
    player.maxStamina = maxStaminaFor(player.level);
    player.hp = player.maxHp;
    player.mana = player.maxMana;
  }
  return { levels, before, after: player.level, realm: realmForLevel(player.level) };
}

export function maxHpFor(level) { return 100 + (level - 1) * 18; }
export function maxManaFor(level) { return 60 + (level - 1) * 12; }
export function maxStaminaFor(level) { return 100 + (level - 1) * 2.2; }

export function xpProgress(player) {
  const need = xpToNext(player.level);
  return { xp: player.xp, need, percent: Math.min(100, (player.xp / need) * 100) };
}

export function canSummonShip(player) {
  return player.level >= 8;
}
