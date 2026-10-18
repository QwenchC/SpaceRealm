import { SOLAR_SYSTEM, AU_KM } from './solar.js';
import { RNG, TAU, rngFor, starName, planetName, clamp } from '../core/utils.js';

export const STAR_CLASSES = [
  { cls: 'M', weight: 55, temp: 3100, radius: 0.32, color: '#ff885c', name: '红矮星' },
  { cls: 'K', weight: 20, temp: 4300, radius: 0.72, color: '#ffb46a', name: '橙矮星' },
  { cls: 'G', weight: 9, temp: 5700, radius: 1.0, color: '#ffe0a3', name: '黄矮星' },
  { cls: 'F', weight: 6, temp: 6800, radius: 1.25, color: '#fff1d0', name: '白矮星' },
  { cls: 'A', weight: 4, temp: 8600, radius: 1.7, color: '#dce9ff', name: 'A 型星' },
  { cls: 'B', weight: 2, temp: 15000, radius: 4.6, color: '#b5c8ff', name: '蓝巨星' },
  { cls: 'O', weight: 0.7, temp: 32000, radius: 8.5, color: '#91b3ff', name: '蓝超巨星' },
  { cls: 'D', weight: 1.3, temp: 12000, radius: 0.012, color: '#eef7ff', name: '白矮星' },
  { cls: 'N', weight: 0.7, temp: 2600, radius: 0.02, color: '#ff5f9a', name: '中子星' },
];

const PLANET_TYPES = {
  scorched: { label: '灼热岩质', paint: ['#4a2f28', '#8c5137', '#bc8157', '#322522'], atmo: 0.02 },
  desert: { label: '荒漠', paint: ['#7d4a32', '#b57346', '#d29a63', '#65402d'], atmo: 0.3 },
  terrestrial: { label: '类地宜居', paint: ['#1e4b78', '#38744e', '#849c55', '#b7c9b4'], atmo: 1 },
  ocean: { label: '海洋', paint: ['#0e356d', '#185e8f', '#2e8b9f', '#bde3df'], atmo: 1.2 },
  tundra: { label: '苔原', paint: ['#3d4e55', '#6b786c', '#9aa197', '#d3d8d6'], atmo: 0.5 },
  frozen: { label: '冰封', paint: ['#6a8696', '#a8c4cc', '#d7e9eb', '#effcff'], atmo: 0.1 },
  volcanic: { label: '熔岩', paint: ['#211514', '#5b251c', '#b24b2b', '#f08c38'], atmo: 4 },
  gas: { label: '气态巨行星', paint: ['#aa8a62', '#ddc9a1', '#8f6a4d', '#f3e8cb'], atmo: 10 },
  iceGiant: { label: '冰巨星', paint: ['#285f83', '#4ba5b3', '#9cd9dd', '#1c4569'], atmo: 8 },
};

const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ'];
const PLANET_SUFFIX = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const BIOME_NAMES = {
  terrestrial: ['温带海洋', '大陆性草原', '雨林群岛', '高山苔原', '季风丛林', '寒温带针叶林'],
  ocean: ['全球海洋', '群岛海洋', '深海世界'],
  desert: ['赤砂荒漠', '盐壳荒原', '峡谷旱海'],
  tundra: ['冻土苔原', '极地高原'],
  frozen: ['永冻冰原', '冰封海洋'],
  volcanic: ['熔岩台地', '火山海岭'],
  gas: ['氢氦风暴', '云带深渊'],
  iceGiant: ['甲烷云海'],
  scorched: ['焦岩平原'],
};

export function generateGalaxySystems(galaxyConfig) {
  const { seed, systemCount, lifeRate } = galaxyConfig;
  const rng = rngFor(seed, 'galaxy-systems', systemCount, lifeRate);
  const armCount = rng.int(2, 3);
  const twist = rng.float(2.2, 4.5);
  const systems = [];
  const preferredArm = rng.int(0, armCount - 1);

  for (let i = 0; i < systemCount; i++) {
    let x, y, z, arm, radius;
    if (i === 0) {
      // The guaranteed cradle system of this galaxy, placed on a bright outer arm.
      arm = preferredArm;
      radius = 0.50 + rng.float(-0.02, 0.02);
      const theta = (arm / armCount) * TAU + radius * twist;
      x = Math.cos(theta) * radius + 0.006;
      z = Math.sin(theta) * radius;
      y = 0;
    } else {
      arm = rng.int(0, armCount - 1);
      // Spiral arm population + a sparse inter-arm halo.
      if (rng.chance(0.86)) {
        radius = 0.10 + Math.pow(rng.next(), 0.72) * 0.9;
        const theta = (arm / armCount) * TAU + radius * twist + rng.gaussian(0, 0.055);
        x = Math.cos(theta) * radius * rng.float(0.94, 1.06);
        z = Math.sin(theta) * radius * rng.float(0.94, 1.06);
        y = rng.gaussian(0, 0.028) * (1 - radius * 0.4);
      } else {
        radius = Math.pow(rng.next(), 0.5) * 1.02;
        const theta = rng.float(0, TAU);
        x = Math.cos(theta) * radius;
        z = Math.sin(theta) * radius;
        y = rng.gaussian(0, 0.045);
      }
    }
    const sc = i === 0 ? STAR_CLASSES.find((c) => c.cls === 'G') : pickStarClass(rng);
    const starCount = i === 0 ? 1 : rng.chance(0.064) ? (rng.chance(0.15) ? 3 : 2) : 1;
    const life = i === 0 ? true : rng.chance(lifeRate / 100);
    let planetCount = i === 0 ? 9 : rng.int(0, starCount >= 2 ? 7 : 8);
    if (life && planetCount === 0) planetCount = 1;
    systems.push({
      id: `sys-${i}`,
      index: i,
      name: i === 0 ? '太阳系' : starName(rng, i),
      x, y, z, arm, radius: Math.hypot(x, z),
      spectral: sc.cls,
      starColor: sc.color,
      starMass: sc.cls === 'M' ? 0.3 : sc.cls === 'K' ? 0.7 : sc.cls === 'G' ? 1 : sc.cls === 'F' ? 1.3 : sc.cls === 'A' ? 2.1 : 8,
      starCount,
      planetCount,
      hasLife: life,
      seed: `${seed}:${i}`,
      home: i === 0,
      rare: starCount > 1,
      visited: false,
    });
  }
  return systems;
}

function pickStarClass(rng) {
  const total = STAR_CLASSES.reduce((s, c) => s + c.weight, 0);
  let v = rng.next() * total;
  for (const c of STAR_CLASSES) {
    v -= c.weight;
    if (v <= 0) return c;
  }
  return STAR_CLASSES[0];
}

export function metaForStar(rng, sys, starIndex = 0) {
  const base = STAR_CLASSES.find((c) => c.cls === sys.spectral) || STAR_CLASSES[2];
  if (starIndex === 0) return {
    name: starIndex === 0 ? sys.name : `${sys.name} ${GREEK[starIndex]}`,
    spectral: base.cls,
    tempK: base.temp,
    radiusKm: 696340 * base.radius * rng.float(0.8, 1.2),
    color: base.color,
    classLabel: base.name,
    mass: sys.starMass || 1,
  };
  const second = STAR_CLASSES[Math.max(0, STAR_CLASSES.indexOf(base) + rng.int(-2, 2))] || base;
  return {
    name: `${sys.name} ${GREEK[starIndex]}`,
    spectral: second.cls,
    tempK: second.temp,
    radiusKm: 696340 * second.radius * rng.float(0.6, 0.9),
    color: second.color,
    classLabel: second.name,
    mass: second.radius * 0.8,
  };
}

function pickPlanetType(temperature, rng, isLife) {
  if (isLife) return rng.chance(0.2) ? 'ocean' : 'terrestrial';
  if (temperature > 420) return 'scorched';
  if (temperature > 220) return rng.chance(0.65) ? 'desert' : 'volcanic';
  if (temperature > 60) return rng.chance(0.5) ? 'desert' : 'terrestrial';
  if (temperature > -20) return rng.chance(0.5) ? 'tundra' : 'ocean';
  if (temperature > -110) return 'frozen';
  return rng.chance(0.35) ? 'iceGiant' : 'frozen';
}

/**
 * Generate one star system on demand. Only the star, planets, orbit and moon
 * metadata are created. A planet's terrain is never generated until landing.
 */
export function generateSystem(galaxyConfig, sysMeta) {
  if (sysMeta.home) {
    return {
      ...structuredClone(SOLAR_SYSTEM),
      meta: sysMeta,
      seed: sysMeta.seed,
      starName: '太阳',
      multiple: false,
      isHome: true,
    };
  }
  const rng = rngFor(sysMeta.seed, 'system-v1');
  const stars = [];
  const count = sysMeta.starCount || 1;
  for (let i = 0; i < count; i++) stars.push(metaForStar(rng, sysMeta, i));
  const primary = stars[0];
  const luminosity = Math.pow(primary.radiusKm / 696340, 2) * Math.pow(primary.tempK / 5772, 4);

  const planetTotal = sysMeta.planetCount;
  const planets = [];
  let habitableIndex = sysMeta.hasLife && planetTotal > 0 ? rng.int(0, planetTotal - 1) : -1;
  if (planetTotal === 0) habitableIndex = -1;

  for (let i = 0; i < planetTotal; i++) {
    const aAU = i === 0 ? rng.float(0.16, 0.36) : 0.32 * Math.pow(1.52, i) * rng.float(0.72, 1.25);
    const isLife = i === habitableIndex;
    const equilibrium = 278 * Math.pow(luminosity, 0.25) / Math.sqrt(aAU);
    const temperature = equilibrium + rng.float(-28, 28);
    let type;
    if (aAU > 5.5 && rng.chance(0.62)) type = rng.chance(0.55) ? 'gas' : 'iceGiant';
    else type = pickPlanetType(temperature, rng, isLife);
    if (isLife) type = rng.chance(0.22) ? 'ocean' : 'terrestrial';
    const isGiant = type === 'gas' || type === 'iceGiant';
    let radiusKm;
    if (isGiant) radiusKm = rng.float(22000, 72000);
    else radiusKm = rng.float(1600, 9800) * (isLife ? 1.03 : 1);
    const periodDays = Math.sqrt(Math.pow(aAU, 3) / Math.max(0.12, primary.mass)) * 365.256 * (count > 1 ? rng.float(0.9, 1.1) : 1);
    const rotHours = rng.chance(0.08) ? -rng.float(12, 90) : rng.float(6, 72);
    const tilt = isGiant ? rng.float(0, 28) : rng.float(0, 48);
    const paint = PLANET_TYPES[type]?.paint || PLANET_TYPES.desert.paint;
    const moonCount = isGiant ? rng.int(1, 5) : rng.int(0, 2);
    const moons = [];
    for (let m = 0; m < moonCount; m++) {
      moons.push({
        name: `${sysMeta.name}${['卫一', '卫二', '卫三', '卫四', '卫五'][m] || `卫${m + 1}`}`,
        en: `MOON ${m + 1}`,
        radiusKm: rng.float(80, isGiant ? 2600 : 1500),
        aKm: radiusKm * rng.float(4, 18) < 40000 ? radiusKm * rng.float(3, 7) : radiusKm * rng.float(4, 13),
        periodDays: rng.float(0.4, 32),
        color: rng.chance(0.5) ? '#b7b0a5' : '#8b8075',
      });
    }
    const typeData = PLANET_TYPES[type] || PLANET_TYPES.desert;
    const densityFactor = isGiant ? 2.3 : type === 'volcanic' ? 1.28 : type === 'terrestrial' ? 1 : 0.88;
    const gravity = Math.max(0.05, (radiusKm / 6371) * densityFactor);
    planets.push({
      id: `pl-${i}`,
      name: planetName(rng, sysMeta.name, i),
      en: `PLANET ${PLANET_SUFFIX[i] || i + 1}`,
      radiusKm,
      aAU,
      periodDays,
      rotationHours: rotHours,
      tilt,
      eccentricity: rng.float(0, 0.16),
      inclination: rng.float(0, 4),
      color: paint[1],
      paint,
      type,
      typeLabel: typeData.label,
      biome: type === 'gas' || type === 'iceGiant' ? 'gas' : isLife ? 'temperate' : type === 'desert' ? 'desert' : type === 'frozen' ? 'ice' : 'alien',
      biomeName: rng.pick(BIOME_NAMES[type] || BIOME_NAMES.desert),
      atmosphere: typeData.atmo * rng.float(0.6, 1.6),
      gravity,
      tempC: Math.round(temperature - 273.15),
      habitable: isLife,
      ocean: type === 'ocean' || isLife,
      life: isLife,
      moons,
      rings: isGiant && rng.chance(0.24) ? { inner: 1.35, outer: rng.float(1.9, 2.5), color: '#c7bda4' } : null,
      description: isLife
        ? `一颗位于 ${stars.map((s) => s.name).join(' / ')} 宜居带内的生命行星。${rng.pick(['海洋与大陆交错，生态圈活跃。', '季风带来辽阔的绿色大陆。', '巨大的潮汐与火山活动塑造出奇异地貌。'])}`
        : `${typeData.label}世界，${rng.pick(['表面遍布古老撞击坑。', '大气稀薄，昼夜温差极大。', '风暴与电离辐射持续雕刻地表。', '轨道周期稳定，记录着恒星系的漫长历史。'])}`,
      seed: `${sysMeta.seed}:planet-${i}`,
      visited: false,
    });
  }
  return {
    id: sysMeta.id,
    name: sysMeta.name,
    displayName: sysMeta.name,
    en: `STELLAR SYSTEM · ${sysMeta.spectral}`,
    stars,
    primary,
    starCount: stars.length,
    multi: stars.length > 1,
    planetCount: planets.length,
    planets,
    meta: sysMeta,
    seed: sysMeta.seed,
    isHome: false,
    starColor: primary.color,
    description: stars.length > 1
      ? `一个稀有的${stars.length === 3 ? '三体' : '双星'}恒星系统，${stars.length} 颗恒星围绕共同质心舞蹈，行星轨道在复合引力场中被持续重塑。`
      : `围绕一颗${primary.classLabel}演化的行星系，包含 ${planets.length} 颗行星。`,
  };
}

export function orbitPosition(body, tDays, scale = 1) {
  const angle = (tDays / body.periodDays) * TAU + (body.phase ?? 0);
  const e = body.eccentricity || 0;
  const r = body.aAU * (1 - e * e) / (1 + e * Math.cos(angle)) * scale;
  return {
    x: Math.cos(angle) * r,
    z: Math.sin(angle) * r * Math.cos((body.inclination || 0) * Math.PI / 180),
    y: Math.sin(angle) * r * Math.sin((body.inclination || 0) * Math.PI / 180),
    angle,
    radiusAU: r / scale,
  };
}

export function moonPosition(moon, planetPos, tDays, visualScale) {
  const angle = (tDays / moon.periodDays) * TAU + Math.PI * 0.45;
  const dist = visualScale * (0.55 + Math.log10(1 + (moon.aKm || 300000) / 10000) * 0.43);
  return {
    x: planetPos.x + Math.cos(angle) * dist,
    y: planetPos.y + Math.sin(angle) * dist * 0.25,
    z: planetPos.z + Math.sin(angle) * dist,
    angle,
  };
}

export function realOrbitPositionAU(body, tDays) {
  const angle = (tDays / body.periodDays) * TAU + (body.phase ?? 0);
  const e = body.eccentricity || 0;
  const r = body.aAU * (1 - e * e) / (1 + e * Math.cos(angle));
  return {
    x: Math.cos(angle) * r,
    z: Math.sin(angle) * r,
    y: Math.sin(angle) * r * Math.sin((body.inclination || 0) * Math.PI / 180),
    angle,
    radiusAU: r,
  };
}

export function starLuminosity(star) {
  return Math.pow(star.radiusKm / 696340, 2) * Math.pow(star.tempK / 5772, 4);
}

export function getStarClass(colorKey) {
  return STAR_CLASSES.find((c) => c.cls === colorKey) || STAR_CLASSES[2];
}

export function planetRadiusEarth(planet) {
  return planet.radiusKm / 6371;
}

export function auToKm(au) { return au * AU_KM; }
