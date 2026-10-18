import * as THREE from 'three';
import { RNG, TAU, clamp, smoothstep } from '../core/utils.js';

function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  const rng = new RNG('grass-blade-v2');
  for (let i = 0; i < 52; i++) {
    const x = rng.float(3, 125);
    const h = rng.float(30, 111);
    const bend = rng.float(-18, 18);
    const width = rng.float(0.9, 2.6);
    const grad = ctx.createLinearGradient(x, 128, x + bend, 128 - h);
    grad.addColorStop(0, 'rgba(21,42,17,1)');
    grad.addColorStop(0.42, `rgba(${rng.int(57, 91)},${rng.int(101, 137)},${rng.int(36, 62)},1)`);
    grad.addColorStop(1, `rgba(${rng.int(101, 155)},${rng.int(159, 207)},${rng.int(51, 93)},1)`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, 128);
    ctx.quadraticCurveTo(x + bend * 0.18, 128 - h * 0.6, x + bend, 128 - h);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeNormalTexture(seed) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rng = new RNG(seed);
  const field = new Float32Array(size * size);
  for (let i = 0; i < field.length; i++) field[i] = rng.next();
  // simple wrapped blur for gentle water normals
  const sample = (x, y) => field[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = sample(x + 1, y) - sample(x - 1, y);
      const dy = sample(x, y + 1) - sample(x, y - 1);
      const nx = clamp(0.5 - dx * 1.3, 0, 1);
      const ny = clamp(0.5 - dy * 1.3, 0, 1);
      const i = (y * size + x) * 4;
      img.data[i] = nx * 255; img.data[i + 1] = ny * 255; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(120, 120);
  return tex;
}

function makeTreeCrownGeometry(kind) {
  if (kind === 'conifer') {
    const parts = [];
    const tiers = [
      [1.12, 1.9, 0.15], [0.96, 1.8, 0.75], [0.79, 1.6, 1.35], [0.6, 1.35, 1.92], [0.4, 1.0, 2.44],
    ];
    for (const [radius, height, y] of tiers) {
      const cone = new THREE.ConeGeometry(radius, height, 9, 1);
      cone.translate(0, y + height * 0.4, 0);
      parts.push(cone);
    }
    return parts;
  }
  const spheres = [];
  const blobs = [
    [1.0, 0, 0.65, 0, 0.82],
    [0.74, 0.5, 0.35, 0.18, 0.7],
    [0.68, -0.48, 0.4, -0.12, 0.72],
    [0.62, 0.08, 0.42, 0.5, 0.66],
    [0.55, 0.12, 1.03, -0.05, 0.55],
  ];
  for (const [r, x, y, z, sy] of blobs) {
    const s = new THREE.IcosahedronGeometry(r, 2);
    s.scale(1, sy, 1);
    s.translate(x, y, z);
    spheres.push(s);
  }
  return spheres;
}

function mergeGeos(list) {
  const pos = [], norm = [];
  for (const g of list) {
    const non = g.index ? g.toNonIndexed() : g;
    pos.push(...non.attributes.position.array);
    norm.push(...non.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  return out;
}

export class SurfaceEcosystem {
  constructor(scene, terrain, planet, system, site) {
    this.scene = scene;
    this.terrain = terrain;
    this.planet = planet;
    this.system = system;
    this.site = site;
    this.rng = new RNG(`${planet.seed || planet.id}:ecosystem`);
    this.group = new THREE.Group();
    this.group.name = 'ecosystem';
    scene.add(this.group);
    this.interactables = [];
    this.treeMeshes = [];
    this.trees = [];
    this.animals = [];
    this.grassData = [];
    this.grassGrid = new Map();
    this.bushData = [];
    this.rockData = [];
    this.flowerData = [];
    this._hideDummy = new THREE.Object3D();
    this._hideDummy.position.set(0, -999, 0);
    this._hideDummy.scale.setScalar(0.0001);
    this._hideDummy.updateMatrix();
    this.time = 0;
    this.biome = terrain.biome;
    this.grassUniforms = [];
    this.chopped = terrain.chopped || new Set();
    this.createWater();
    this.createRocks();
    this.createTrees();
    this.createGrass();
    this.createUnderstory();
    this.createAnimals();
    this.createBirds();
    this.createSpores();
    // Rebuild the same "nothing may float" rule when loading saved digs.
    if (this.terrain.edits?.length) {
      for (const edit of this.terrain.edits) this.reactToEdit(edit);
    }
  }

  createWater() {
    if (!this.planet.habitable || this.terrain.seaLevel == null) return;
    const normal = makeNormalTexture(`${this.planet.seed}:water`);
    const palette = this.terrain.palette;
    const isAlien = this.biome === 'alien' || this.biome === 'volcanic';
    const mat = new THREE.MeshPhysicalMaterial({
      color: isAlien ? palette.water : palette.water,
      emissive: new THREE.Color(palette.water).multiplyScalar(0.28),
      emissiveIntensity: 0.55,
      roughness: 0.14,
      metalness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: 0.9,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.52, 0.52),
      depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1);
    const water = new THREE.Mesh(geo, mat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = this.terrain.seaLevel + 0.08;
    water.receiveShadow = false;
    water.name = 'ocean';
    water.renderOrder = 2;
    water.userData.waterNormal = normal;
    this.water = water;
    this.group.add(water);
    const shallowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.water).multiplyScalar(1.3), transparent: true, opacity: 0.22, depthWrite: false });
    const shore = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), shallowMat);
    shore.rotation.x = -Math.PI / 2;
    shore.position.y = this.terrain.seaLevel + 0.12;
    this.group.add(shore);
    this.shoreMat = shallowMat;
    this.normalTex = normal;
  }

  createRocks() {
    const n = 70;
    const geometry = new THREE.DodecahedronGeometry(1, 0);
    const material = new THREE.MeshStandardMaterial({ color: this.biome === 'volcanic' ? '#342a27' : this.biome === 'ice' ? '#7e8e94' : '#72756c', roughness: 0.93, metalness: 0.01, flatShading: true });
    const mesh = new THREE.InstancedMesh(geometry, material, n);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    let placed = 0;
    let tries = 0;
    const rng = this.rng;
    while (placed < n && tries < 300) {
      tries++;
      const a = rng.float(0, TAU);
      const r = 8 + Math.pow(rng.next(), 0.6) * 120;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = this.terrain.heightAt(x, z);
      if (h < this.terrain.seaLevel + 0.7) continue;
      if (Math.hypot(x, z) < 7) continue;
      dummy.position.set(x, h + 0.2, z);
      dummy.rotation.set(rng.float(-0.3, 0.3), rng.float(0, TAU), rng.float(-0.2, 0.2));
      const s = rng.float(0.25, 1.8) * (rng.chance(0.08) ? 2.3 : 1);
      dummy.scale.set(s * rng.float(0.7, 1.3), s * rng.float(0.5, 1.1), s * rng.float(0.7, 1.2));
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      this.rockData.push({ mesh, index: placed, x, z, groundY: h, alive: true });
      placed++;
    }
    mesh.count = placed;
    this.group.add(mesh);
    this.rocks = mesh;
  }

  createTrees() {
    const rng = this.rng;
    if (!this.planet.habitable) { this.trees = []; return; }
    const isIce = this.biome === 'ice';
    const isDesert = this.biome === 'desert';
    const isAlien = this.biome === 'alien';
    const target = isIce ? 34 : isDesert ? 18 : 185;
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const conifers = mergeGeos(makeTreeCrownGeometry('conifer'));
    const broadleaf = mergeGeos(makeTreeCrownGeometry('broadleaf'));
    const coniferTarget = Math.floor(target * (isIce ? 0.8 : rng.float(0.22, 0.48)));
    const broadTarget = target - coniferTarget;
    const trunkMat = new THREE.MeshStandardMaterial({ color: isIce ? '#777166' : '#6d5238', roughness: 0.98 });
    const leafColor = isIce ? '#a3b9a3' : isDesert ? '#b3a06c' : isAlien ? '#a4ba8d' : '#cbe0a3';
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, target);
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    const coniferMesh = new THREE.InstancedMesh(conifers, leafMat, Math.max(1, coniferTarget));
    coniferMesh.castShadow = true;
    coniferMesh.receiveShadow = true;
    const broadMesh = new THREE.InstancedMesh(broadleaf, leafMat, Math.max(1, broadTarget));
    broadMesh.castShadow = true;
    broadMesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let ti = 0, ci = 0, bi = 0;
    let tries = 0;
    const treePositions = [];
    while (ti < target && tries < 2000) {
      tries++;
      const a = rng.float(0, TAU);
      const r = 18 + Math.pow(rng.next(), 0.64) * 138;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = this.terrain.heightAt(x, z);
      if (h < this.terrain.seaLevel + 1.2) continue;
      const slope = this.terrain.slopeAt(x, z);
      if (slope > 0.72) continue;
      // Leave a framed meadow/coastal sightline open from the landing plateau.
      if (z > 10 && Math.abs(x) < 29 && rng.chance(0.73)) continue;
      if (treePositions.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 7)) continue;
      treePositions.push({ x, z });
      const isConifer = ti < coniferTarget;
      const isBroad = !isConifer;
      const trunkH = rng.float(3.0, 6.8) * (isIce ? 0.7 : 1);
      const width = rng.float(0.75, 1.15);
      dummy.position.set(x, h - 0.05, z);
      dummy.rotation.set(0, rng.float(0, TAU), 0);
      dummy.scale.set(rng.float(0.7, 1.1), trunkH, rng.float(0.7, 1.1));
      dummy.updateMatrix();
      trunks.setMatrixAt(ti, dummy.matrix);
      dumb: {
        dummy.position.set(x, h + trunkH * 0.56, z);
        dummy.rotation.set(0, rng.float(0, TAU), 0);
        dummy.scale.set(width * trunkH * 0.29, trunkH * 0.42, width * trunkH * 0.29);
        dummy.updateMatrix();
        if (isConifer) {
          coniferMesh.setMatrixAt(ci, dummy.matrix);
          color.setHSL(rng.float(0.25, 0.36), rng.float(0.26, 0.5), rng.float(0.23, 0.37));
          coniferMesh.setColorAt(ci, color);
          ci++;
        } else {
          broadMesh.setMatrixAt(bi, dummy.matrix);
          color.setHSL(this.biome === 'alien' ? rng.float(0.65, 0.85) : rng.float(0.18, 0.32), rng.float(0.3, 0.56), rng.float(0.27, 0.42));
          broadMesh.setColorAt(bi, color);
          bi++;
        }
      }
      const harvestable = r * 0.55 + 1;
      const tree = {
        id: ti, x, z, h, groundY: h, trunkH, type: isConifer ? 'conifer' : 'broadleaf',
        meshConifer: isConifer, instance: isConifer ? ci - 1 : bi - 1,
        wood: Math.ceil(trunkH * 2.2), hp: 2 + Math.floor(trunkH / 3), gone: false,
      };
      this.trees.push(tree);
      ti++;
    }
    trunks.count = ti;
    coniferMesh.count = ci;
    broadMesh.count = bi;
    trunks.instanceMatrix.needsUpdate = true;
    coniferMesh.instanceMatrix.needsUpdate = true;
    broadMesh.instanceMatrix.needsUpdate = true;
    if (coniferMesh.instanceColor) coniferMesh.instanceColor.needsUpdate = true;
    if (broadMesh.instanceColor) broadMesh.instanceColor.needsUpdate = true;
    // Persisted harvest state: collapsed instances remain gone across reloads.
    if (this.chopped?.size) {
      const dummyHide = new THREE.Object3D();
      dummyHide.position.set(0, -999, 0);
      dummyHide.scale.setScalar(0.0001);
      dummyHide.updateMatrix();
      for (const id of this.chopped) {
        const tree = this.trees.find((t) => t.id === id);
        if (!tree) continue;
        trunks.setMatrixAt(id, dummyHide.matrix);
        if (tree.type === 'conifer') coniferMesh.setMatrixAt(tree.instance, dummyHide.matrix);
        else broadMesh.setMatrixAt(tree.instance, dummyHide.matrix);
        tree.gone = true;
      }
      trunks.instanceMatrix.needsUpdate = true;
      coniferMesh.instanceMatrix.needsUpdate = true;
      broadMesh.instanceMatrix.needsUpdate = true;
    }
    trunks.userData.treeKind = 'trunk';
    coniferMesh.userData.treeKind = 'conifer';
    broadMesh.userData.treeKind = 'broadleaf';
    this.trunks = trunks;
    this.coniferMesh = coniferMesh;
    this.broadMesh = broadMesh;
    this.group.add(trunks, coniferMesh, broadMesh);
    this.treeMeshes = [trunks, coniferMesh, broadMesh];
    this.interactables.push(trunks, coniferMesh, broadMesh);
  }

  createGrass() {
    if (!this.planet.habitable) return;
    const tex = makeGrassTexture();
    const p1 = new THREE.PlaneGeometry(0.52, 0.4);
    p1.translate(0, 0.2, 0);
    const p2 = p1.clone();
    p2.rotateY(Math.PI / 2);
    const geo = new THREE.BufferGeometry();
    const positions = [], uvs = [], indices = [];
    let offset = 0;
    for (const src of [p1, p2]) {
      const pos = src.attributes.position.array;
      const uv = src.attributes.uv.array;
      positions.push(...pos);
      uvs.push(...uv);
      const idx = src.index.array;
      for (const i of idx) indices.push(i + offset);
      offset += src.attributes.position.count;
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      map: tex, alphaTest: 0.26, side: THREE.DoubleSide, roughness: 0.88,
      color: this.biome === 'ice' ? '#dfe8dc' : this.biome === 'desert' ? '#d9c79d' : this.biome === 'alien' ? '#c7c0e5' : '#e4edc5',
    });
    const uniforms = { uTime: { value: 0 } };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;');
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float sway = sin(uTime * 1.9 + iPos.x * 0.65 + iPos.z * 0.5) * 0.055 * uv.y;
          transformed.x += sway;
          transformed.z += cos(uTime * 1.4 + iPos.z * 0.8) * 0.035 * uv.y;
        #endif
      `);
    };
    this.grassUniforms.push(uniforms);
    const count = this.biome === 'desert' ? 1600 : this.biome === 'ice' ? 1200 : 13500;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    let n = 0, tries = 0;
    const rng = this.rng;
    while (n < count && tries < count * 5) {
      tries++;
      const a = rng.float(0, TAU);
      const r = 1.6 + Math.pow(rng.next(), 0.58) * 58;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = this.terrain.heightAt(x, z);
      if (h < this.terrain.seaLevel + 0.7) continue;
      if (this.terrain.slopeAt(x, z) > 0.82) continue;
      dummy.position.set(x, h - 0.03, z);
      dummy.rotation.set(0, rng.float(0, TAU), 0);
      const s = rng.float(0.62, 1.25) * (this.biome === 'desert' ? 0.6 : 1);
      dummy.scale.set(s, s * rng.float(0.55, 1.0), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      this.grassData.push({ index: n, x, z, groundY: h, alive: true });
      const c = new THREE.Color().setHSL(
        this.biome === 'alien' ? rng.float(0.62, 0.78) : this.biome === 'ice' ? rng.float(0.42, 0.52) : rng.float(0.19, 0.3),
        rng.float(0.22, 0.48), rng.float(0.58, 0.78)
      );
      mesh.setColorAt(n, c);
      n++;
    }
    mesh.count = n;
    this.group.add(mesh);
    this.grass = mesh;
    this.grassGrid.clear();
    const cell = 8;
    for (const rec of this.grassData) {
      const key = `${Math.floor(rec.x / cell)},${Math.floor(rec.z / cell)}`;
      let bucket = this.grassGrid.get(key);
      if (!bucket) { bucket = []; this.grassGrid.set(key, bucket); }
      bucket.push(rec);
    }
  }

  createUnderstory() {
    if (!this.planet.habitable) return;
    const rng = this.rng;
    const cap = this.biome === 'desert' ? 16 : 46;
    const bushGeo = new THREE.IcosahedronGeometry(0.72, 1);
    bushGeo.scale(1, 0.62, 1);
    const bushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94 });
    const bushes = new THREE.InstancedMesh(bushGeo, bushMat, cap);
    bushes.castShadow = true;
    bushes.receiveShadow = true;
    const dummy = new THREE.Object3D();
    let placed = 0, tries = 0;
    while (placed < cap && tries < 200) {
      tries++;
      const a = rng.float(0, TAU);
      const r = 12 + rng.next() * 70;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = this.terrain.heightAt(x, z);
      if (h < this.terrain.seaLevel + 1.2) continue;
      if (z > 8 && Math.abs(x) < 22 && rng.chance(0.65)) continue;
      dummy.position.set(x, h + 0.15, z);
      dummy.rotation.set(0, rng.float(0, TAU), 0);
      const s = rng.float(0.55, 1.5);
      dummy.scale.set(s * rng.float(0.8, 1.4), s, s * rng.float(0.8, 1.4));
      dummy.updateMatrix();
      bushes.setMatrixAt(placed, dummy.matrix);
      bushes.setColorAt(placed, new THREE.Color().setHSL(this.biome === 'alien' ? rng.float(0.68, 0.82) : rng.float(0.22, 0.34), rng.float(0.3, 0.55), rng.float(0.26, 0.44)));
      this.bushData.push({ mesh: bushes, index: placed, x, z, groundY: h, alive: true });
      placed++;
    }
    bushes.count = placed;
    bushes.instanceMatrix.needsUpdate = true;
    this.group.add(bushes);
    this.bushes = bushes;

    if (this.biome === 'temperate' || this.biome === 'alien') {
      const flowerTex = (() => {
        const c = document.createElement('canvas'); c.width = 32; c.height = 32;
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'rgba(255,255,255,0)'; ctx.fillRect(0, 0, 32, 32);
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = 'rgba(255,255,255,.95)';
          ctx.beginPath();
          ctx.arc(16 + Math.cos(i / 5 * TAU) * 7, 16 + Math.sin(i / 5 * TAU) * 7, 4, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,240,160,1)';
        ctx.beginPath(); ctx.arc(16, 16, 3.3, 0, TAU); ctx.fill();
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
      })();
      const flowerCount = 900;
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(flowerCount * 3);
      const colors = new Float32Array(flowerCount * 3);
      let n = 0, ftries = 0;
      while (n < flowerCount && ftries < 6000) {
        ftries++;
        const a = rng.float(0, TAU);
        const r = 3 + Math.pow(rng.next(), 0.6) * 54;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = this.terrain.heightAt(x, z);
        if (h < this.terrain.seaLevel + 1.0) continue;
        positions[n * 3] = x;
        positions[n * 3 + 1] = h + rng.float(0.22, 0.48);
        positions[n * 3 + 2] = z;
        this.flowerData.push({ index: n, x, z, groundY: h, alive: true });
        const c = new THREE.Color().setHSL(this.biome === 'alien' ? rng.float(0.58, 0.9) : rng.pick([0.97, 0.12, 0.16, 0.58, 0.78]), rng.float(0.45, 0.9), rng.float(0.6, 0.85));
        colors[n * 3] = c.r; colors[n * 3 + 1] = c.g; colors[n * 3 + 2] = c.b;
        n++;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setDrawRange(0, n);
      const mat = new THREE.PointsMaterial({ size: 0.18, map: flowerTex, vertexColors: true, transparent: true, alphaTest: 0.2, depthWrite: false, sizeAttenuation: true });
      const flowers = new THREE.Points(geo, mat);
      this.group.add(flowers);
      this.flowers = flowers;
    }
  }

  createAnimals() {
    if (!this.planet.habitable) { this.animals = []; return; }
    const count = this.biome === 'desert' || this.biome === 'ice' ? 4 : 7;
    const rng = this.rng;
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#6f6858', roughness: 0.9 });
    const accentMat = new THREE.MeshStandardMaterial({ color: '#c8a774', roughness: 0.85 });
    const glowMat = new THREE.MeshBasicMaterial({ color: '#8ef5e2', toneMapped: false });
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 10), bodyMat);
      body.scale.set(1, 0.72, 1.5);
      body.position.y = 0.72;
      group.add(body);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 6), bodyMat);
      neck.position.set(0, 1.08, -0.45);
      neck.rotation.x = -0.55;
      group.add(neck);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), accentMat);
      head.position.set(0, 1.47, -0.75);
      group.add(head);
      for (let eye = 0; eye < 2; eye++) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), glowMat);
        e.position.set(eye ? 0.14 : -0.14, 1.5, -0.92);
        group.add(e);
      }
      for (let a = 0; a < 3; a++) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.58 - a * 0.09, 4), accentMat);
        horn.position.set((a - 1) * 0.14, 1.68, -0.67);
        horn.rotation.z = (a - 1) * 0.38;
        horn.rotation.x = -0.25;
        group.add(horn);
      }
      const legs = [];
      for (let l = 0; l < 4; l++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.85, 5), bodyMat);
        leg.position.set(l < 2 ? -0.26 : 0.26, 0.36, l % 2 ? 0.46 : -0.46);
        group.add(leg);
        legs.push(leg);
      }
      const a = rng.float(0, TAU);
      const r = rng.float(14, 58);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      group.position.set(x, this.terrain.findGround(x, z, this.terrain.heightAt(x, z) + 4, 12) || this.terrain.heightAt(x, z), z);
      group.userData.creature = { hp: 40 + i * 4, type: '星鹿', legs, speed: 0, dir: rng.float(0, TAU), timer: rng.float(1, 6), alive: true, bob: rng.float(0, TAU), groundY: group.position.y, supportTimer: rng.float(0, 0.15) };
      group.scale.setScalar(rng.float(0.8, 1.35));
      this.group.add(group);
      this.animals.push(group);
      group.traverse((c) => { if (c.isMesh) c.userData.creatureRoot = group; });
      this.interactables.push(group);
    }
  }

  createBirds() {
    if (!this.planet.habitable) { this.birds = []; return; }
    this.birds = [];
    const mat = new THREE.MeshBasicMaterial({ color: '#1a2325', side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([0, 0, 0, -0.45, 0.14, 0.08, -0.06, -0.02, 0.02]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const rng = this.rng;
    for (let i = 0; i < 14; i++) {
      const bird = new THREE.Group();
      const left = new THREE.Mesh(geo, mat);
      left.scale.x = -1;
      bird.add(left);
      bird.add(new THREE.Mesh(geo, mat));
      const radius = rng.float(25, 85);
      bird.userData.flight = { radius, height: rng.float(25, 62), angle: rng.float(0, TAU), speed: rng.float(0.05, 0.14), flap: rng.float(0, TAU), phase: rng.float(0, 6) };
      bird.scale.setScalar(rng.float(0.8, 1.4));
      this.group.add(bird);
      this.birds.push(bird);
    }
  }

  createSpores() {
    if (!this.planet.habitable) return;
    const count = this.biome === 'temperate' && this.planet.id === 'earth' ? 120 : 240;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    const rng = this.rng;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rng.float(-38, 38);
      pos[i * 3 + 1] = rng.float(0.4, 7);
      pos[i * 3 + 2] = rng.float(-38, 38);
      seed[i] = rng.next();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uColor: { value: new THREE.Color(this.biome === 'alien' ? '#ba95ff' : this.biome === 'volcanic' ? '#ff9157' : '#c9ff9e') } },
      vertexShader: `
        attribute float aSeed; uniform float uTime; varying float vS;
        void main(){
          vS = aSeed;
          vec3 p = position;
          p.x += sin(uTime*.34 + aSeed*9.0)*2.4;
          p.y += sin(uTime*.7 + aSeed*17.0)*.55 + .25;
          p.z += cos(uTime*.28 + aSeed*5.0)*2.4;
          vec4 mv = modelViewMatrix*vec4(p,1.0);
          gl_Position = projectionMatrix*mv;
          gl_PointSize = (1.0 + aSeed*1.4) * (120.0/max(10.0,-mv.z));
        }
      `,
      fragmentShader: `
        uniform float uNight; uniform vec3 uColor; varying float vS;
        void main(){
          vec2 uv = gl_PointCoord-.5; float d=length(uv); if(d>.5) discard;
          float a = smoothstep(.5,0.,d) * (.06 + uNight*.28) * (.4+vS);
          gl_FragColor=vec4(uColor, a);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.spores = new THREE.Points(geo, mat);
    this.group.add(this.spores);
  }

  // ---------------------------------------------------------------------
  // Terrain support. Foliage is placed on the analytic surface, so after a
  // SDF carve we must remove anything whose root now hangs over air.
  isGrounded(x, z, groundY, tolerance = 0.4) {
    return this.terrain.sdfAt(x, groundY - tolerance, z) < 0;
  }

  hideTree(tree, markChopped = true) {
    if (!tree || tree.gone) return false;
    tree.gone = true;
    this.trunks.setMatrixAt(tree.id, this._hideDummy.matrix);
    if (tree.type === 'conifer') this.coniferMesh.setMatrixAt(tree.instance, this._hideDummy.matrix);
    else this.broadMesh.setMatrixAt(tree.instance, this._hideDummy.matrix);
    this.trunks.instanceMatrix.needsUpdate = true;
    this.coniferMesh.instanceMatrix.needsUpdate = true;
    this.broadMesh.instanceMatrix.needsUpdate = true;
    if (markChopped) this.chopped.add(tree.id);
    return true;
  }

  hideInstance(record) {
    if (!record || !record.alive) return false;
    record.alive = false;
    record.mesh.setMatrixAt(record.index, this._hideDummy.matrix);
    return true;
  }

  reactToEdit(edit) {
    if (!edit || edit.t !== 'dig') return 0;
    const radius = (edit.r || 2) + 2.2;
    const r2 = radius * radius;
    let hiddenTrees = 0;

    for (const tree of this.trees) {
      if (tree.gone || this.chopped.has(tree.id)) continue;
      if ((tree.x - edit.x) ** 2 + (tree.z - edit.z) ** 2 > r2) continue;
      if (!this.isGrounded(tree.x, tree.z, tree.groundY, 0.65) && this.hideTree(tree, true)) hiddenTrees++;
    }

    let grassDirty = false;
    const cell = 8;
    const ix0 = Math.floor((edit.x - radius) / cell);
    const ix1 = Math.floor((edit.x + radius) / cell);
    const iz0 = Math.floor((edit.z - radius) / cell);
    const iz1 = Math.floor((edit.z + radius) / cell);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const bucket = this.grassGrid.get(`${ix},${iz}`);
        if (!bucket) continue;
        for (const rec of bucket) {
          if (!rec.alive) continue;
          if ((rec.x - edit.x) ** 2 + (rec.z - edit.z) ** 2 > r2) continue;
          if (!this.isGrounded(rec.x, rec.z, rec.groundY, 0.3)) {
            rec.alive = false;
            this.grass.setMatrixAt(rec.index, this._hideDummy.matrix);
            grassDirty = true;
          }
        }
      }
    }
    if (grassDirty) this.grass.instanceMatrix.needsUpdate = true;

    let bushDirty = false;
    for (const rec of this.bushData) {
      if (!rec.alive) continue;
      if ((rec.x - edit.x) ** 2 + (rec.z - edit.z) ** 2 > r2) continue;
      if (!this.isGrounded(rec.x, rec.z, rec.groundY, 0.5)) {
        rec.alive = false;
        rec.mesh.setMatrixAt(rec.index, this._hideDummy.matrix);
        bushDirty = true;
      }
    }
    if (bushDirty) this.bushes.instanceMatrix.needsUpdate = true;

    let rockDirty = false;
    for (const rec of this.rockData) {
      if (!rec.alive) continue;
      if ((rec.x - edit.x) ** 2 + (rec.z - edit.z) ** 2 > r2) continue;
      if (!this.isGrounded(rec.x, rec.z, rec.groundY, 0.8)) {
        rec.alive = false;
        rec.mesh.setMatrixAt(rec.index, this._hideDummy.matrix);
        rockDirty = true;
      }
    }
    if (rockDirty) this.rocks.instanceMatrix.needsUpdate = true;

    if (this.flowers && this.flowerData.length) {
      const positions = this.flowers.geometry.attributes.position;
      let flowerDirty = false;
      for (const rec of this.flowerData) {
        if (!rec.alive) continue;
        if ((rec.x - edit.x) ** 2 + (rec.z - edit.z) ** 2 > r2) continue;
        if (!this.isGrounded(rec.x, rec.z, rec.groundY, 0.32)) {
          rec.alive = false;
          positions.array[rec.index * 3 + 1] = -999;
          flowerDirty = true;
        }
      }
      if (flowerDirty) positions.needsUpdate = true;
    }
    return hiddenTrees;
  }

  chopTreeAt(object, instanceId, hitPoint, tool) {
    if (!object.userData.treeKind) return null;
    let tree;
    if (object.userData.treeKind === 'trunk') tree = this.trees[instanceId];
    else if (object.userData.treeKind === 'conifer') tree = this.trees.find((t) => t.type === 'conifer' && t.instance === instanceId);
    else tree = this.trees.find((t) => t.type === 'broadleaf' && t.instance === instanceId);
    if (!tree) return null;
    if (this.chopped.has(tree.id) || tree.gone) return null;
    tree.hp -= Math.max(1, Math.ceil((tool?.damage || 5) / 8));
    if (tree.hp > 0) return { tree, fell: false };
    this.hideTree(tree, true);
    return { tree, fell: true, wood: tree.wood };
  }

  damageAnimal(group, damage) {
    const c = group?.userData?.creature;
    if (!c || !c.alive) return null;
    c.hp -= damage;
    if (c.hp <= 0) {
      c.alive = false;
      this.group.remove(group);
      return { killed: true, bio: 2 + Math.floor(Math.random() * 3) };
    }
    c.flee = 5;
    return { killed: false };
  }

  update(dt, playerPos, daylight, weatherCover) {
    this.time += dt;
    for (const u of this.grassUniforms) u.uTime.value = this.time;
    if (this.normalTex) {
      this.normalTex.offset.x = this.time * 0.008;
      this.normalTex.offset.y = this.time * 0.005;
    }
    if (this.water) this.water.material.opacity = 0.84 + Math.sin(this.time * 0.3) * 0.02;
    if (this.spores) {
      this.spores.material.uniforms.uTime.value = this.time;
      this.spores.material.uniforms.uNight.value = 1 - daylight;
    }
    for (const group of this.animals) {
      const c = group.userData.creature;
      if (!c.alive) continue;
      c.timer -= dt;
      c.flee = Math.max(0, (c.flee || 0) - dt);
      const dx = group.position.x - playerPos.x;
      const dz = group.position.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 12) {
        c.flee = Math.max(c.flee, 1.5);
        c.dir = Math.atan2(dx, dz);
      }
      if (c.timer <= 0) {
        c.timer = 2 + Math.random() * 6;
        c.dir = Math.random() * TAU;
      }
      const walking = c.flee > 0 || c.timer > 0;
      const speed = c.flee > 0 ? 4.4 : c.wanderSpeed || 1.1;
      if (walking) {
        const nx = group.position.x + Math.sin(c.dir) * speed * dt;
        const nz = group.position.z + Math.cos(c.dir) * speed * dt;
        const h = this.terrain.heightAt(nx, nz);
        if (h > this.terrain.seaLevel + 0.3) {
          group.position.x = nx;
          group.position.z = nz;
          group.rotation.y = c.dir + Math.PI;
          c.speed = speed;
        } else {
          c.dir += Math.PI * 0.7;
        }
      }
      c.bob += dt * (c.speed > 2 ? 9 : 3.2);
      c.supportTimer = (c.supportTimer ?? 0) - dt;
      if (c.supportTimer <= 0) {
        c.supportTimer = 0.16;
        c.groundY = this.terrain.findGround(group.position.x, group.position.z, group.position.y + 2.5, 14);
      }
      if (c.groundY != null) group.position.y = c.groundY + Math.abs(Math.sin(c.bob)) * (c.speed > 2 ? 0.18 : 0.04);
      else group.position.y -= 9 * dt;
      c.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(c.bob + i % 2 * Math.PI) * (c.speed > 1 ? 0.48 : 0.08);
      });
      c.speed *= 0.94;
    }
    if (this.birds) {
      const center = new THREE.Vector3(10, 0, 10);
      for (const bird of this.birds) {
        const f = bird.userData.flight;
        f.angle += f.speed * dt;
        f.flap += dt * 8;
        bird.position.set(
          center.x + Math.cos(f.angle + f.phase) * f.radius,
          this.terrain.heightAt(center.x, center.z) + f.height + Math.sin(f.angle * 2 + f.phase) * 4,
          center.z + Math.sin(f.angle + f.phase) * f.radius
        );
        bird.rotation.y = -f.angle;
        bird.rotation.z = Math.sin(f.flap) * 0.24;
        bird.children.forEach((wing, i) => { wing.rotation.z = Math.sin(f.flap + i * Math.PI) * 0.35; });
      }
    }
  }

  dispose() {
    this.group.traverse((c) => {
      if (c.geometry && c.geometry !== this.grass?.geometry) c.geometry.dispose?.();
    });
    this.group.clear();
    this.scene.remove(this.group);
  }
}
