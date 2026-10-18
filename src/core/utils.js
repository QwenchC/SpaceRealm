// Core deterministic utilities shared by the universe simulator.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const inverseLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed) {
    this.state = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x9e3779b9;
  }
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(a = 0, b = 1) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.float(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  gaussian(mean = 0, sd = 1) {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export function rngFor(...parts) { return new RNG(parts.join('::')); }

const SYL_A = ['苍', '玄', '星', '天', '羲', '归', '白', '赤', '青', '太', '烛', '启', '寂', '瑶', '瀚', '云', '霜', '澜', '烬', '朔', '明', '幽', '紫', '御'];
const SYL_B = ['梧', '戈', '璇', '渊', '明', '阙', '衡', '霄', '穹', '海', '陵', '原', '垣', '枢', '辰', '离', '极', '屿', '野', '川', '荒', '照', '临', '衍'];
const ROMAN = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ'];

export function starName(rng, index) {
  if (rng.chance(0.22)) return `${rng.pick(SYL_A)}${rng.pick(SYL_B)}-${String(index + 1).padStart(3, '0')}`;
  return `${rng.pick(SYL_A)}${rng.pick(SYL_B)} ${rng.pick(ROMAN)}-${index + 1}`;
}

export function planetName(rng, star, index) {
  const suffix = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  if (rng.chance(0.42)) return `${rng.pick(SYL_A)}${rng.pick(SYL_B)} ${suffix[index] || index + 1}`;
  return `${star.split(' ')[0]}-${suffix[index] || index + 1}`;
}

export function fmtNumber(n, digits = 0) {
  if (n === Infinity) return '∞';
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}×10¹²`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}×10⁹`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}×10⁶`;
  return n.toLocaleString('zh-CN', { maximumFractionDigits: digits });
}

export function fmtCompact(n) {
  if (n >= 1e15) return `${(n / 1e15).toFixed(1)}P`;
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}G`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.floor(n)}`;
}

export function fmtTime(seconds) {
  const d = seconds / 86400;
  if (d >= 365.25) return `${(d / 365.25).toFixed(2)} 地球年`;
  if (d >= 1) return `${d.toFixed(2)} 天`;
  const h = seconds / 3600;
  if (h >= 1) return `${h.toFixed(2)} 小时`;
  return `${Math.max(0, seconds / 60).toFixed(1)} 分钟`;
}

export function formatDate(ts) {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function seededNoiseFactory(seed) {
  return {
    rng: new RNG(seed),
  };
}

export function randomSeed() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function clampText(str, n = 30) {
  const s = String(str);
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeRngFromSeed(seed) { return new RNG(seed); }
