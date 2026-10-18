// Real solar-system ephemeris data. Everything is the actual measured value,
// normalised into game units (1 AU, Earth radius, Earth day).

export const SUN = {
  id: 'sun',
  name: '太阳',
  type: 'star',
  spectral: 'G2V',
  radiusKm: 696340,
  mass: 1,
  tempK: 5772,
  color: '#ffd27a',
  glow: '#ffab45',
  rotationDays: 25.38,
  description: '母星系的唯一恒星，一颗已经燃烧了 46 亿年的 G2V 型黄矮星。',
};

export const PLANETS = [
  {
    id: 'mercury', name: '水星', en: 'MERCURY', radiusKm: 2439.7, aAU: 0.387098, periodDays: 87.969,
    rotationHours: 1407.6, tilt: 0.034, eccentricity: 0.2056, inclination: 7.0, color: '#9c9187',
    type: 'rocky', biome: 'airless', atmosphere: 0, tempC: 167, moons: 0, gravity: 0.38,
    description: '最靠近太阳的行星，昼夜温差超过 600°C，表面遍布撞击坑。',
  },
  {
    id: 'venus', name: '金星', en: 'VENUS', radiusKm: 6051.8, aAU: 0.723332, periodDays: 224.701,
    rotationHours: -5832.5, tilt: 177.36, eccentricity: 0.0068, inclination: 3.39, color: '#e6bd83',
    type: 'rocky', biome: 'volcanic', atmosphere: 92, tempC: 464, moons: 0, gravity: 0.904,
    description: '被浓密二氧化碳大气包裹的炼狱，硫酸云层下地表温度足以熔化铅。',
  },
  {
    id: 'earth', name: '地球', en: 'EARTH', radiusKm: 6371, aAU: 1.000001, periodDays: 365.256,
    rotationHours: 23.9345, tilt: 23.4393, eccentricity: 0.0167, inclination: 0, color: '#4c8fc4',
    type: 'terrestrial', biome: 'temperate', atmosphere: 1, tempC: 15, moons: 1, habitable: true, home: true, gravity: 1,
    description: '人类文明的摇篮，当前星历下的母星。蔚蓝海洋、锋利山脉与稠密生态圈在昼夜线两侧呼吸。',
    moons: [
      { name: '月球', en: 'LUNA', radiusKm: 1737.4, aKm: 384400, periodDays: 27.3217, color: '#b7b3aa', description: '地球唯一的天然卫星，潮汐锁定，表面覆盖古老玄武岩月海。' },
    ],
  },
  {
    id: 'mars', name: '火星', en: 'MARS', radiusKm: 3389.5, aAU: 1.523679, periodDays: 686.98,
    rotationHours: 24.6229, tilt: 25.19, eccentricity: 0.0934, inclination: 1.85, color: '#b45f3f',
    type: 'rocky', biome: 'desert', atmosphere: 0.006, tempC: -65, moons: 2, gravity: 0.379,
    description: '铁锈色的荒漠世界，拥有太阳系最高的火山和最大的峡谷系统。',
    moons: [
      { name: '火卫一', en: 'PHOBOS', radiusKm: 11.27, aKm: 9376, periodDays: 0.3189, color: '#8c7f73' },
      { name: '火卫二', en: 'DEIMOS', radiusKm: 6.2, aKm: 23463, periodDays: 1.2624, color: '#81766b' },
    ],
  },
  {
    id: 'jupiter', name: '木星', en: 'JUPITER', radiusKm: 69911, aAU: 5.2044, periodDays: 4332.59,
    rotationHours: 9.925, tilt: 3.13, eccentricity: 0.0489, inclination: 1.3, color: '#d8b187',
    type: 'gas-giant', biome: 'gas', atmosphere: 100, tempC: -110, moons: 95, gravity: 2.528,
    description: '太阳系质量最大行星，持续数百年的风暴红斑横亘在氢氦云带之间。',
    moons: [
      { name: '木卫一', en: 'IO', radiusKm: 1821.6, aKm: 421700, periodDays: 1.769, color: '#e8d17a' },
      { name: '木卫二', en: 'EUROPA', radiusKm: 1560.8, aKm: 671034, periodDays: 3.551, color: '#c4b8a3' },
      { name: '木卫三', en: 'GANYMEDE', radiusKm: 2634.1, aKm: 1070412, periodDays: 7.155, color: '#9b9589' },
      { name: '木卫四', en: 'CALLISTO', radiusKm: 2410.3, aKm: 1882709, periodDays: 16.689, color: '#766e65' },
    ],
  },
  {
    id: 'saturn', name: '土星', en: 'SATURN', radiusKm: 58232, aAU: 9.5826, periodDays: 10759.22,
    rotationHours: 10.656, tilt: 26.73, eccentricity: 0.0565, inclination: 2.49, color: '#d9c89b',
    type: 'gas-giant', biome: 'gas', atmosphere: 100, tempC: -140, moons: 146, gravity: 1.065, rings: { inner: 1.24, outer: 2.27, color: '#d9ceb1' },
    description: '环系之王，冰粒与岩屑组成的壮丽环带以数万公里的宽度切割星光。',
    moons: [
      { name: '土卫六', en: 'TITAN', radiusKm: 2574.7, aKm: 1221870, periodDays: 15.945, color: '#d5a65d', atmosphere: 1.5 },
      { name: '土卫二', en: 'ENCELADUS', radiusKm: 252.1, aKm: 237948, periodDays: 1.370, color: '#d8e2e3' },
    ],
  },
  {
    id: 'uranus', name: '天王星', en: 'URANUS', radiusKm: 25362, aAU: 19.1914, periodDays: 30688.5,
    rotationHours: -17.24, tilt: 97.77, eccentricity: 0.0457, inclination: 0.77, color: '#9bd5d6',
    type: 'ice-giant', biome: 'ice', atmosphere: 100, tempC: -195, moons: 28, gravity: 0.886,
    description: '侧躺着自转的冰巨星，甲烷赋予它冷淡的青蓝色。',
    moons: [
      { name: '天卫三', en: 'TITANIA', radiusKm: 788.4, aKm: 435910, periodDays: 8.706, color: '#b3acaa' },
    ],
  },
  {
    id: 'neptune', name: '海王星', en: 'NEPTUNE', radiusKm: 24622, aAU: 30.0611, periodDays: 60182,
    rotationHours: 16.11, tilt: 28.32, eccentricity: 0.0113, inclination: 1.77, color: '#4a71d8',
    type: 'ice-giant', biome: 'ice', atmosphere: 100, tempC: -200, moons: 16, gravity: 1.14,
    description: '太阳系最远的行星，超音速风暴在深蓝甲烷大气中永不停歇。',
    moons: [
      { name: '海卫一', en: 'TRITON', radiusKm: 1353.4, aKm: 354759, periodDays: -5.877, color: '#cec6bd' },
    ],
  },
  {
    id: 'pluto', name: '冥王星', en: 'PLUTO', radiusKm: 1188.3, aAU: 39.482, periodDays: 90560,
    rotationHours: 153.3, tilt: 122.53, eccentricity: 0.2488, inclination: 17.16, color: '#cfb4a3',
    type: 'dwarf', biome: 'ice', atmosphere: 0.00001, tempC: -229, moons: 5, dwarf: true, gravity: 0.063,
    description: '柯伊伯带中的冰封矮行星，与冥卫一在遥远黑暗中相互潮汐锁定。',
    moons: [
      { name: '冥卫一', en: 'CHARON', radiusKm: 606, aKm: 19591, periodDays: 6.387, color: '#9b908a' },
    ],
  },
];

export const SOLAR_SYSTEM = {
  id: 'sol-home',
  name: '太阳系',
  displayName: '太阳系 · 母星系',
  en: 'SOLAR SYSTEM',
  type: 'home',
  starCount: 1,
  stars: [SUN],
  planets: PLANETS,
  description: '人类起源恒星系。行星半径、轨道半长轴、离心率与公转自转周期均与现实太阳系 1:1 等比例。',
  reference: true,
};

export const AU_KM = 149597870.7;
export const EARTH_RADIUS_KM = 6371;
export const DAY_SECONDS = 86400;
// One real second is one game minute (60x). Orbital mechanics are evaluated from a
// single monotonic cosmic clock so every view agrees.
export const GAME_TIME_SCALE = 60;
