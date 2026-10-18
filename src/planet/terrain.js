import * as THREE from 'three';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import { edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes.js';
import { RNG, clamp, smoothstep, lerp } from '../core/utils.js';

export const CHUNK_SIZE = 24;
export const CHUNK_CELLS = 16;
export const CELL = CHUNK_SIZE / CHUNK_CELLS;
export const LOCAL_RADIUS = 4;

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const CORNER_BITS = [1, 2, 8, 4, 16, 32, 128, 64];
const EDGES = [
  [0, 1], [1, 3], [2, 3], [0, 2],
  [4, 5], [5, 7], [6, 7], [4, 6],
  [0, 4], [1, 5], [3, 7], [2, 6],
];

const BIOME_PALETTES = {
  temperate: {
    deep: '#102b3a', water: '#1d5260', sand: '#b1a274', grass: '#3f6734', grass2: '#678b43',
    forest: '#23452c', dirt: '#5c4935', rock: '#75786c', rockDark: '#404840', snow: '#e8efee', snow2: '#fbfefe',
    sky: '#7fc6e2', sunset: '#f1aa72', cloud: '#e8f1f4',
  },
  desert: {
    deep: '#3b2b1d', water: '#6c5a39', sand: '#c99a60', grass: '#9d754a', grass2: '#b38855',
    forest: '#6e4d33', dirt: '#8d623f', rock: '#8c6145', rockDark: '#54392c', snow: '#e8d8bd', snow2: '#f5ead2',
    sky: '#e0b37c', sunset: '#d86b46', cloud: '#e8d3b0',
  },
  ice: {
    deep: '#152e3d', water: '#34667c', sand: '#93b0b5', grass: '#6e8c8b', grass2: '#89a4a1',
    forest: '#4a6a6c', dirt: '#5d6c6d', rock: '#7c9095', rockDark: '#435359', snow: '#dbeef2', snow2: '#f4fdff',
    sky: '#a9d6e4', sunset: '#d59a9c', cloud: '#eef7fb',
  },
  volcanic: {
    deep: '#1d0c0b', water: '#291210', sand: '#3c2722', grass: '#423128', grass2: '#533d31',
    forest: '#352822', dirt: '#3c2c25', rock: '#55423a', rockDark: '#241a17', snow: '#b7aaa4', snow2: '#ded5d0',
    sky: '#9c5e52', sunset: '#ff704b', cloud: '#6c534b',
  },
  alien: {
    deep: '#25163a', water: '#553077', sand: '#9c8b78', grass: '#6a547a', grass2: '#89709c',
    forest: '#46355d', dirt: '#58445d', rock: '#6e6870', rockDark: '#3f3a46', snow: '#d6cfde', snow2: '#f2edf6',
    sky: '#b08abf', sunset: '#e997a2', cloud: '#d8c4e2',
  },
  barren: {
    deep: '#263038', water: '#425e6b', sand: '#8b9294', grass: '#71797b', grass2: '#878f90',
    forest: '#5a6062', dirt: '#676464', rock: '#858686', rockDark: '#4d5052', snow: '#d8dedf', snow2: '#f6f9f9',
    sky: '#4b5260', sunset: '#c48d7a', cloud: '#aeb9bd',
  },
};

const MATERIAL_COLORS = new Map();

function paletteFor(biome, seed) {
  if (biome === 'temperate' && seed.includes('earth')) return BIOME_PALETTES.temperate;
  const base = BIOME_PALETTES[biome] || BIOME_PALETTES.temperate;
  return base;
}

function makeTerrainDetailTexture(seed) {
  const size = 256;
  const grid = 32;
  const rng = new RNG(`${seed}:terrain-detail`);
  const values = new Float32Array(grid * grid);
  for (let i = 0; i < values.length; i++) values[i] = rng.next();
  const sample = (x, y) => {
    const gx = ((x % grid) + grid) % grid;
    const gy = ((y % grid) + grid) % grid;
    return values[gy * grid + gx];
  };
  const smooth = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = sample(x0, y0), b = sample(x0 + 1, y0);
    const c = sample(x0, y0 + 1), d = sample(x0 + 1, y0 + 1);
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  };
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.55, freq = 4, norm = 0;
      for (let o = 0; o < 5; o++) {
        v += smooth((x / size) * freq, (y / size) * freq) * amp;
        norm += amp;
        amp *= 0.52;
        freq *= 2;
      }
      v = v / norm;
      // crisp fine grain + clumped soil speckle
      const speck = rng.chance(0.11) ? 0.13 : 0;
      const c = clamp(110 + v * 110 + speck * 240, 35, 235);
      const i = (y * size + x) * 4;
      img.data[i] = c;
      img.data[i + 1] = c;
      img.data[i + 2] = c;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Analytic landscape + volumetric (marching-cubes) editable near field.
 * The far landscape is a low-resolution radial heightfield. Caves and tunnels
 * are real holes in the 3D SDF mesh, not merely lowered height values.
 */
export class TerrainWorld {
  constructor(planet, seed, options = {}) {
    this.planet = planet;
    this.seed = seed;
    this.rng = new RNG(seed);
    this.noise = createNoise2D(() => 0.5);
    this.noise3 = createNoise3D(() => 0.5);
    this.biome = options.biome || (planet.biome === 'temperate' ? 'temperate' : planet.biome === 'desert' ? 'desert' : planet.biome === 'ice' || planet.biome === 'frozen' ? 'ice' : planet.biome === 'volcanic' || planet.biome === 'scorched' ? 'volcanic' : planet.habitable ? 'temperate' : planet.type === 'dwarf' ? 'barren' : planet.habitable ? 'alien' : 'barren');
    this.palette = paletteFor(this.biome, seed);
    this.isHome = planet.id === 'earth' || planet.home;
    this.seaLevel = options.seaLevel ?? 0;
    this.snowLine = options.snowLine ?? (this.biome === 'ice' ? 16 : this.biome === 'desert' ? 120 : this.biome === 'volcanic' ? 260 : 98);
    this.chunks = new Map();
    this.columnChunks = new Map();
    this.group = new THREE.Group();
    this.group.name = 'editable-terrain';
    this.edits = options.edits ? [...options.edits] : [];
    this.editGrid = new Map();
    this.editCell = 8;
    this.meshMaterial = this.createTerrainMaterial();
    this._farGroup = null;
    this.chopped = options.chopped ? new Set(options.chopped) : new Set();
    for (const edit of this.edits) this.indexEdit(edit);
    this.noiseOffsets = { a: this.rng.float(0, 500), b: this.rng.float(0, 500), c: this.rng.float(0, 500) };
    this.spawnHeight = this.heightAt(0, 0);
  }

  createTerrainMaterial() {
    const detailTexture = makeTerrainDetailTexture(this.seed);
    this.detailTexture = detailTexture;
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.015,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uDetail = { value: detailTexture };
      // Subtle world-space surface detail keeps close triangles from looking flat.
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vTerrainWorld;\nvarying vec3 vTerrainNormal;`);
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform sampler2D uDetail;\nvarying vec3 vTerrainWorld;\nvarying vec3 vTerrainNormal;\nfloat thash(vec3 p){ p = fract(p*.3183099+vec3(.1,.2,.3)); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }\nfloat tnoise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.-2.*f); return mix(mix(mix(thash(i),thash(i+vec3(1,0,0)),f.x),mix(thash(i+vec3(0,1,0)),thash(i+vec3(1,1,0)),f.x),f.y),mix(mix(thash(i+vec3(0,0,1)),thash(i+vec3(1,0,1)),f.x),mix(thash(i+vec3(0,1,1)),thash(i+vec3(1,1,1)),f.x),f.y),f.z); }`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bw = pow(abs(vTerrainNormal), vec3(3.0));
        bw /= max(vec3(0.0001), vec3(bw.x + bw.y + bw.z));
        float texFine = texture2D(uDetail, vTerrainWorld.zy * 0.36).r * bw.x
          + texture2D(uDetail, vTerrainWorld.xz * 0.36).r * bw.y
          + texture2D(uDetail, vTerrainWorld.xy * 0.36).r * bw.z;
        float texMacro = texture2D(uDetail, vTerrainWorld.zy * 0.045).r * bw.x
          + texture2D(uDetail, vTerrainWorld.xz * 0.045).r * bw.y
          + texture2D(uDetail, vTerrainWorld.xy * 0.045).r * bw.z;
        float macro = tnoise(vTerrainWorld*.075) * .45 + tnoise(vTerrainWorld*.23) * .35 + texMacro * .35;
        float detail = texFine * .7 + tnoise(vTerrainWorld*3.7) * .2;
        diffuseColor.rgb *= .56 + detail * .62 + macro * .13;
        float moss = smoothstep(.42,.86,vTerrainNormal.y) * smoothstep(.32,.72,tnoise(vTerrainWorld*.14));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(.76,1.08,.7), moss*.24);
        float dry = smoothstep(.55,.84,tnoise(vTerrainWorld*.045+vec3(8.0,2.0,4.0))) * smoothstep(.5,.9,vTerrainNormal.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.34,.30,.17), dry*.16);
      `);
      material.userData.shader = shader;
    };
    return material;
  }

  fbm(x, z, oct = 5) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += this.noise(x * freq + this.noiseOffsets.a, z * freq + this.noiseOffsets.b) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.02;
    }
    return sum / norm;
  }

  ridge(x, z) {
    let sum = 0, amp = 0.55, freq = 1, norm = 0;
    for (let i = 0; i < 5; i++) {
      const n = 1 - Math.abs(this.noise(x * freq + this.noiseOffsets.c, z * freq + 88));
      sum += n * n * amp;
      norm += amp;
      amp *= 0.52;
      freq *= 2.06;
    }
    return sum / norm;
  }

  coastLine(x) {
    return 102 + this.noise(x * 0.0032 + 9.4, 4.7) * 30 + this.noise(x * 0.011 + 2.1, 8.1) * 8;
  }

  heightAt(x, z) {
    const warpX = this.fbm(x * 0.0019 + 5, z * 0.0019 + 4, 3) * 48;
    const warpZ = this.fbm(x * 0.0017 + 9, z * 0.0017 + 11, 3) * 48;
    const wx = x + warpX;
    const wz = z + warpZ;
    const broad = this.fbm(wx * 0.0022, wz * 0.0022, 5);
    const hills = this.fbm(wx * 0.0095 + 12, wz * 0.0095 + 4, 4);
    const detail = this.fbm(wx * 0.036, wz * 0.036, 3);
    const mountainMask = smoothstep(0.02, 0.36, this.fbm(wx * 0.0012 + 4.5, wz * 0.0012 + 9.1, 3) * 0.5 + 0.5);
    const north = smoothstep(18, -260, z);
    const ridgeHeight = this.ridge(wx * 0.0038 + 2, wz * 0.0038 + 6) * (58 + 88 * mountainMask) * (north * 0.82 + 0.16);
    let height = 22 + broad * 32 + hills * 8 + detail * 1.8 + ridgeHeight;
    // A coastal shelf and bay to the south gives the mother planet a readable horizon.
    const shore = this.coastLine(x);
    const coastT = smoothstep(shore - 78, shore + 24, z - 8 + this.noise(x * 0.018, 3.3) * 14);
    height = lerp(height, -17 + detail * 3, coastT);
    // Gently roll the foreground down towards the sea, keeping a clean line of sight.
    height -= smoothstep(8, 90, z + this.noise(x * 0.02, 7.4) * 12) * (this.biome === 'ice' ? 3 : 12);
    // Volcanic islands / sea stacks across the bay add a readable far silhouette.
    if (this.biome === 'temperate' || this.biome === 'alien') {
      const ix = x + 310, iz = z - 690;
      const i2x = x - 560, i2z = z - 880;
      const island = Math.exp(-(ix * ix / (240 * 240) + iz * iz / (300 * 300))) * 235
        + Math.exp(-(i2x * i2x / (210 * 210) + i2z * i2z / (270 * 270))) * 150;
      height += island * (0.7 + this.noise(x * 0.002, z * 0.002) * 0.3);
    }
    // Level only the immediate landing pad; the surrounding meadow keeps its natural relief.
    const dist = Math.hypot(x, z);
    const levelT = 1 - smoothstep(6, 28, dist);
    const plateau = this.heightAtSpawnSafe();
    height = lerp(height, plateau + 4, levelT * 0.9);
    if (this.biome === 'volcanic') height += Math.max(0, this.noise(x * 0.014, z * 0.014) * 22);
    return height;
  }

  heightAtSpawnSafe() {
    if (this._spawnPlateau != null) return this._spawnPlateau;
    // Evaluate the raw terrain at origin once, without recursion, by clamping the plateau term out.
    const x = 0, z = 0;
    const warpX = this.fbm(x * 0.0019 + 5, z * 0.0019 + 4, 3) * 48;
    const warpZ = this.fbm(x * 0.0017 + 9, z * 0.0017 + 11, 3) * 48;
    const broad = this.fbm(warpX * 0.0022, warpZ * 0.0022, 5);
    const hills = this.fbm(warpX * 0.0095 + 12, warpZ * 0.0095 + 4, 4);
    const mountainMask = smoothstep(0.02, 0.36, this.fbm(warpX * 0.0012 + 4.5, warpZ * 0.0012 + 9.1, 3) * 0.5 + 0.5);
    const ridge = this.ridge(warpX * 0.0038 + 2, warpZ * 0.0038 + 6) * (58 + 88 * mountainMask) * 0.2;
    this._spawnPlateau = 22 + broad * 32 + hills * 8 + ridge;
    return this._spawnPlateau;
  }

  slopeAt(x, z) {
    const e = 1.6;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  colorAt(x, y, z, normalY = 1) {
    const h = this.heightAt(x, z);
    const p = this.palette;
    const depth = h - y;
    const n = this.noise(x * 0.085 + 3, z * 0.085 + 8) * 0.5 + 0.5;
    const n2 = this.noise(x * 0.018 + 9, z * 0.018 + 2) * 0.5 + 0.5;
    let color;
    if (y < this.seaLevel + 0.3) {
      color = new THREE.Color(p.sand).multiplyScalar(0.7 + n * 0.18);
      color.lerp(new THREE.Color(p.grass2), 0.15);
    } else if (depth > 1.1 || normalY < 0.56) {
      color = new THREE.Color(p.rockDark).lerp(new THREE.Color(p.rock), clamp(n * 0.6 + 0.18 + (normalY - 0.3) * 0.2, 0, 1));
      color.multiplyScalar(0.75 + n2 * 0.2);
    } else {
      const slope = clamp(1 - normalY, 0, 1);
      const alt = smoothstep(this.snowLine - 24, this.snowLine + 18, h + n * 12 - slope * 28);
      const beach = smoothstep(3.5, 0.4, h - this.seaLevel);
      if (alt > 0.45) {
        color = new THREE.Color(p.snow).lerp(new THREE.Color(p.snow2), n * 0.5);
      } else if (beach > 0.35) {
        color = new THREE.Color(p.sand).lerp(new THREE.Color(p.dirt), n * 0.2);
      } else if (normalY < 0.82) {
        color = new THREE.Color(p.rock).lerp(new THREE.Color(p.dirt), n * 0.24);
      } else {
        const richness = clamp(n2 * 0.7 + 0.25, 0, 1);
        color = new THREE.Color(p.grass).lerp(new THREE.Color(p.grass2), richness);
        color.lerp(new THREE.Color(p.forest), smoothstep(0.55, 0.9, n2) * 0.3);
      }
      if (this.biome === 'volcanic' && n > 0.82) color.lerp(new THREE.Color('#ff702b'), 0.18);
      if (this.biome === 'alien' && n > 0.76) color.lerp(new THREE.Color('#a8ffcf'), 0.14);
    }
    return color;
  }

  buildFields(ox, oy, oz) {
    const n = CHUNK_CELLS + 1;
    const fields = new Float32Array(n * n * n);
    const heights = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = ox + ix * CELL, z = oz + iz * CELL;
        heights[iz * n + ix] = this.heightAt(x, z);
      }
    }
    const edits = this.editsNear(ox, oy, oz, CHUNK_SIZE + 8);
    for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        const y = oy + iy * CELL;
        for (let ix = 0; ix < n; ix++) {
          const x = ox + ix * CELL, z = oz + iz * CELL;
          let value = y - heights[iz * n + ix];
          for (const e of edits) {
            const d = Math.hypot(x - e.x, y - e.y, z - e.z) - (e.r || 1);
            if (e.t === 'dig') {
              if (d < 0) value = Math.max(value, -d);
            } else if (d < value) {
              value = d;
            }
          }
          fields[(iz * n + iy) * n + ix] = value;
        }
      }
    }
    return fields;
  }

  editsNear(ox, oy, oz, pad) {
    const found = [];
    const cs = this.editCell;
    const x0 = Math.floor((ox - pad) / cs), x1 = Math.floor((ox + CHUNK_SIZE + pad) / cs);
    const y0 = Math.floor((oy - pad) / cs), y1 = Math.floor((oy + CHUNK_SIZE + pad) / cs);
    const z0 = Math.floor((oz - pad) / cs), z1 = Math.floor((oz + CHUNK_SIZE + pad) / cs);
    const seen = new Set();
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const list = this.editGrid.get(`${x}:${y}:${z}`);
      if (!list) continue;
      for (const e of list) {
        const key = e._id ?? `${e.x}:${e.y}:${e.z}:${e.r}:${e.t}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (e.x + e.r >= ox - pad && e.x - e.r <= ox + CHUNK_SIZE + pad &&
          e.y + e.r >= oy - pad && e.y - e.r <= oy + CHUNK_SIZE + pad &&
          e.z + e.r >= oz - pad && e.z - e.r <= oz + CHUNK_SIZE + pad) found.push(e);
      }
    }
    return found;
  }

  indexEdit(edit) {
    if (!edit._id) edit._id = Math.random().toString(36).slice(2);
    const cs = this.editCell;
    const r = edit.r || 1;
    const x0 = Math.floor((edit.x - r) / cs), x1 = Math.floor((edit.x + r) / cs);
    const y0 = Math.floor((edit.y - r) / cs), y1 = Math.floor((edit.y + r) / cs);
    const z0 = Math.floor((edit.z - r) / cs), z1 = Math.floor((edit.z + r) / cs);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const key = `${x}:${y}:${z}`;
      if (!this.editGrid.has(key)) this.editGrid.set(key, []);
      this.editGrid.get(key).push(edit);
    }
  }

  sdfAt(x, y, z) {
    let value = y - this.heightAt(x, z);
    const cs = this.editCell;
    const list = this.editGrid.get(`${Math.floor(x / cs)}:${Math.floor(y / cs)}:${Math.floor(z / cs)}`);
    if (!list) return value;
    for (const e of list) {
      const d = Math.hypot(x - e.x, y - e.y, z - e.z) - (e.r || 1);
      if (e.t === 'dig') {
        if (d < 0) value = Math.max(value, -d);
      } else if (d < value) value = d;
    }
    return value;
  }

  solidAt(x, y, z) { return this.sdfAt(x, y, z) < 0; }

  columnKey(cx, cz) { return `${cx},${cz}`; }

  buildColumn(cx, cz, extraY = null) {
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    let minH = Infinity, maxH = -Infinity;
    for (let i = 0; i <= 4; i++) {
      for (let j = 0; j <= 4; j++) {
        const h = this.heightAt(baseX + (i / 4) * CHUNK_SIZE, baseZ + (j / 4) * CHUNK_SIZE);
        minH = Math.min(minH, h);
        maxH = Math.max(maxH, h);
      }
    }
    const levels = new Set();
    const start = Math.floor((minH - 2) / CHUNK_SIZE);
    const end = Math.floor((maxH + 2) / CHUNK_SIZE);
    for (let cy = start; cy <= end; cy++) levels.add(cy);
    // Always provide one accessible layer immediately below the surface for tunnels.
    levels.add(start - 1);
    if (extraY != null) {
      levels.add(Math.floor(extraY / CHUNK_SIZE));
      levels.add(Math.floor(extraY / CHUNK_SIZE) - 1);
    }
    const ckey = this.columnKey(cx, cz);
    if (!this.columnChunks.has(ckey)) this.columnChunks.set(ckey, new Set());
    const set = this.columnChunks.get(ckey);
    for (const cy of levels) {
      if (set.has(cy) && !this.chunks.has(`${cx},${cy},${cz}`)) set.delete(cy);
      if (set.has(cy)) continue;
      set.add(cy);
      this.buildChunk(cx, cy, cz);
    }
  }

  buildChunk(cx, cy, cz) {
    const key = `${cx},${cy},${cz}`;
    const old = this.chunks.get(key);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      this.chunks.delete(key);
    }
    const ox = cx * CHUNK_SIZE, oy = cy * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    const geo = this.polygonize(ox, oy, oz);
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, this.meshMaterial);
    mesh.position.set(0, 0, 0);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.terrainChunk = { cx, cy, cz };
    mesh.name = `terrain-${key}`;
    this.chunks.set(key, mesh);
    this.group.add(mesh);
  }

  polygonize(ox, oy, oz) {
    const n = CHUNK_CELLS + 1;
    const fields = this.buildFields(ox, oy, oz);
    const positions = [];
    const indices = [];
    const vertexMap = new Map();
    const fieldAt = (x, y, z) => fields[(z * n + y) * n + x];
    const getEdgeVertex = (x, y, z, edge) => {
      const [ia, ib] = EDGES[edge];
      const a = CORNERS[ia], b = CORNERS[ib];
      const ax = x + a[0], ay = y + a[1], az = z + a[2];
      const bx = x + b[0], by = y + b[1], bz = z + b[2];
      const fa = fieldAt(ax, ay, az);
      const fb = fieldAt(bx, by, bz);
      const t = Math.abs(fa - fb) > 1e-8 ? clamp(fa / (fa - fb), 0, 1) : 0.5;
      const axis = (a[0] !== b[0]) ? 0 : (a[1] !== b[1]) ? 1 : 2;
      const gx = Math.min(ax, bx), gy = Math.min(ay, by), gz = Math.min(az, bz);
      const key = (((gz * n + gy) * n + gx) * 3 + axis);
      if (vertexMap.has(key)) return vertexMap.get(key);
      const id = positions.length / 3;
      positions.push(
        ox + (ax + (bx - ax) * t) * CELL,
        oy + (ay + (by - ay) * t) * CELL,
        oz + (az + (bz - az) * t) * CELL
      );
      vertexMap.set(key, id);
      return id;
    };

    for (let z = 0; z < CHUNK_CELLS; z++) {
      for (let y = 0; y < CHUNK_CELLS; y++) {
        for (let x = 0; x < CHUNK_CELLS; x++) {
          let cubeindex = 0;
          for (let i = 0; i < 8; i++) {
            const c = CORNERS[i];
            if (fieldAt(x + c[0], y + c[1], z + c[2]) < 0) cubeindex |= CORNER_BITS[i];
          }
          if (cubeindex === 0 || cubeindex === 255) continue;
          const bits = edgeTable[cubeindex];
          if (!bits) continue;
          const edgeVerts = [];
          for (let e = 0; e < 12; e++) {
            if (bits & (1 << e)) edgeVerts[e] = getEdgeVertex(x, y, z, e);
          }
          const base = cubeindex * 16;
          for (let i = 0; triTable[base + i] !== -1; i += 3) {
            const a = edgeVerts[triTable[base + i]];
            const b = edgeVerts[triTable[base + i + 1]];
            const c = edgeVerts[triTable[base + i + 2]];
            if (a == null || b == null || c == null) continue;
            if (a === b || b === c || c === a) continue;
            indices.push(a, b, c);
          }
        }
      }
    }
    if (!indices.length) return null;
    // Marching cubes tables can yield inward-facing winding. Orient the whole
    // patch against the SDF gradient so vertex normals (and therefore colours
    // and lighting) point into the air.
    let outwardScore = 0;
    const sampleCount = Math.min(12, indices.length / 3);
    for (let s = 0; s < sampleCount; s++) {
      const ti = Math.floor((s / sampleCount) * (indices.length / 3)) * 3;
      const a = indices[ti], b = indices[ti + 1], c = indices[ti + 2];
      if (a == null || b == null || c == null) continue;
      const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
      const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
      const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
      const eps = 0.35;
      const gx = this.sdfAt(mx + eps, my, mz) - this.sdfAt(mx - eps, my, mz);
      const gy = this.sdfAt(mx, my + eps, mz) - this.sdfAt(mx, my - eps, mz);
      const gz = this.sdfAt(mx, my, mz + eps) - this.sdfAt(mx, my, mz - eps);
      outwardScore += nx * gx + ny * gy + nz * gz;
    }
    if (outwardScore < 0) {
      for (let i = 0; i < indices.length; i += 3) {
        const t = indices[i + 1];
        indices[i + 1] = indices[i + 2];
        indices[i + 2] = t;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const normal = geo.attributes.normal;
    const colors = new Float32Array(positions.length);
    for (let i = 0; i < positions.length / 3; i++) {
      const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
      const ny = normal.getY(i);
      const col = this.colorAt(x, y, z, ny);
      // Depth shading for tunnel interiors.
      const h = this.heightAt(x, z);
      const underground = clamp((h - y) / 18, 0, 1);
      col.multiplyScalar(1 - underground * 0.35);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    return geo;
  }

  buildFarMesh() {
    if (this._farGroup) {
      this.group.remove(this._farGroup);
      this._farGroup.traverse((c) => c.geometry?.dispose?.());
    }
    const rings = 92, segs = 260;
    const hole = 88, outer = 3200;
    const positions = [], colors = [], indices = [];
    const center = new THREE.Vector3();
    const makePoint = (r, theta) => {
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const y = this.heightAt(x, z);
      return [x, y, z];
    };
    for (let ri = 0; ri <= rings; ri++) {
      const t = ri / rings;
      const r = hole + (outer - hole) * Math.pow(t, 2.2);
      for (let si = 0; si <= segs; si++) {
        const theta = (si / segs) * Math.PI * 2;
        const [x, y, z] = makePoint(r, theta);
        positions.push(x, y, z);
        const fakeNormal = 0.86;
        const col = this.colorAt(x, y, z, fakeNormal);
        col.multiplyScalar(0.82);
        colors.push(col.r, col.g, col.b);
      }
    }
    for (let ri = 0; ri < rings; ri++) {
      for (let si = 0; si < segs; si++) {
        const a = ri * (segs + 1) + si;
        const b = a + 1;
        const c = (ri + 1) * (segs + 1) + si;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.meshMaterial);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'terrain-far';
    this._farGroup = mesh;
    this.group.add(mesh);
  }

  buildInitial(playerX = 0, playerZ = 0, radius = LOCAL_RADIUS) {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        this.buildColumn(pcx + dx, pcz + dz);
      }
    }
    this.buildFarMesh();
  }

  ensureChunksAt(x, y, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${cx + dx},${cy},${cz + dz}`;
        if (!this.chunks.has(key)) this.buildColumn(cx + dx, cz + dz, y);
      }
    }
  }

  addEdit(edit) {
    this.indexEdit(edit);
    this.edits.push(edit);
    this.rebuildAround(edit);
    return edit;
  }

  rebuildAround(edit) {
    const minX = edit.x - edit.r - CELL, maxX = edit.x + edit.r + CELL;
    const minY = edit.y - edit.r - CELL, maxY = edit.y + edit.r + CELL;
    const minZ = edit.z - edit.r - CELL, maxZ = edit.z + edit.r + CELL;
    const cx0 = Math.floor(minX / CHUNK_SIZE), cx1 = Math.floor(maxX / CHUNK_SIZE);
    const cy0 = Math.floor(minY / CHUNK_SIZE), cy1 = Math.floor(maxY / CHUNK_SIZE);
    const cz0 = Math.floor(minZ / CHUNK_SIZE), cz1 = Math.floor(maxZ / CHUNK_SIZE);
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) for (let cz = cz0; cz <= cz1; cz++) {
      const key = `${cx},${cy},${cz}`;
      if (this.chunks.has(key)) this.buildChunk(cx, cy, cz);
      else {
        // If the carve reaches outside the existing column, ensure a shaft exists.
        if ((cx === 0 && cz === 0) || true) {
          const ckey = this.columnKey(cx, cz);
          if (!this.columnChunks.has(ckey)) this.buildColumn(cx, cz, edit.y);
          else this.buildColumn(cx, cz, edit.y);
        }
      }
    }
  }

  /** March a downward ray to find the highest walkable surface below startY. */
  findGround(x, z, startY, maxDistance = 60) {
    const baseHeight = this.heightAt(x, z);
    const cs = this.editCell;
    const cellKey = `${Math.floor(x / cs)}:${Math.floor(startY / cs)}:${Math.floor(z / cs)}`;
    const baseEdits = [];
    const cx = Math.floor(x / cs), cz = Math.floor(z / cs);
    const seen = new Set();
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
      const list = this.editGrid.get(`${cx + dx}:${Math.floor(startY / cs) + dy}:${cz + dz}`);
      if (!list) continue;
      for (const e of list) {
        if (seen.has(e._id)) continue;
        seen.add(e._id);
        if (Math.abs(e.x - x) <= e.r + 1 && Math.abs(e.z - z) <= e.r + 1) baseEdits.push(e);
      }
    }
    const sdf = (y) => {
      let value = y - baseHeight;
      for (const e of baseEdits) {
        const d = Math.hypot(x - e.x, y - e.y, z - e.z) - (e.r || 1);
        if (e.t === 'dig') {
          if (d < 0) value = Math.max(value, -d);
        } else if (d < value) value = d;
      }
      return value;
    };
    let y = startY;
    const step = 0.22;
    let prev = sdf(y);
    // If we start inside the solid, we're already at/below a surface.
    if (prev <= 0) return startY;
    while (y > startY - maxDistance) {
      y -= step;
      const next = sdf(y);
      if (prev > 0 && next <= 0) {
        let lo = y, hi = y + step;
        for (let i = 0; i < 5; i++) {
          const mid = (lo + hi) / 2;
          if (sdf(mid) > 0) hi = mid; else lo = mid;
        }
        return hi;
      }
      prev = next;
    }
    return null;
  }

  findCeiling(x, z, startY, maxDistance = 40) {
    let y = startY;
    let prev = this.sdfAt(x, y, z);
    while (y < startY + maxDistance) {
      y += 0.25;
      const next = this.sdfAt(x, y, z);
      if (prev > 0 && next <= 0) return y;
      prev = next;
    }
    return null;
  }

  raycastMeshes(raycaster, objects) {
    return raycaster.intersectObjects(objects, true);
  }

  get meshes() { return [...this.chunks.values(), this._farGroup].filter(Boolean); }

  dispose() {
    this.chunks.forEach((mesh) => mesh.geometry.dispose());
    this._farGroup?.geometry.dispose();
    this.detailTexture?.dispose();
    this.meshMaterial.dispose();
    this.group.clear();
  }
}

export function terrainMaterialColor(palette, key) {
  return MATERIAL_COLORS.get(palette + key) || new THREE.Color(palette[key]);
}
