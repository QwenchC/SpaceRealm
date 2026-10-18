import * as THREE from 'three';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import { RNG, clamp, smoothstep } from '../core/utils.js';

const textureLoader = new THREE.TextureLoader();
const earthCache = {};
const procCache = new Map();

function configure(tex, srgb = true) {
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function loadEarthTextures() {
  if (earthCache.day) return earthCache;
  const names = {
    day: 'earth_atmos.jpg',
    clouds: 'earth_clouds.png',
    night: 'earth_lights.png',
    normal: 'earth_normal_2048.jpg',
    specular: 'earth_specular_2048.jpg',
  };
  for (const [key, file] of Object.entries(names)) {
    const tx = textureLoader.load(`/textures/${file}`);
    configure(tx, key !== 'normal' && key !== 'specular');
    earthCache[key] = tx;
  }
  return earthCache;
}

function paintCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return canvas;
}

function color(hex) {
  const c = new THREE.Color(hex);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function makeProceduralMaps(planet) {
  const key = planet.seed || planet.id;
  if (procCache.has(key)) return procCache.get(key);
  const rng = new RNG(`${key}:maps`);
  const noise = createNoise2D(() => 0.42);
  const w = 320, h = 160;
  const paint = planet.paint || ['#183a5a', '#3d7552', '#87935d', '#e6e9df'];
  const colors = paint.map(color);
  const isGiant = planet.type === 'gas' || planet.type === 'iceGiant';
  const isFrozen = ['frozen', 'ice'].includes(planet.biome) || planet.type === 'iceGiant';
  const isVolcanic = planet.biome === 'volcanic' || planet.type === 'scorched' && planet.biome === 'volcanic';
  const isDesert = planet.biome === 'desert';
  const isOcean = planet.biome === 'ocean';
  const landThreshold = isOcean ? 0.7 : 0.5;

  const day = paintCanvas(w, h);
  const dayCtx = day.getContext('2d');
  const dayImg = dayCtx.createImageData(w, h);
  const night = paintCanvas(w, h);
  const nightCtx = night.getContext('2d');
  nightCtx.fillStyle = '#000';
  nightCtx.fillRect(0, 0, w, h);
  const cloud = paintCanvas(w, h);
  const cloudCtx = cloud.getContext('2d');
  const cloudImg = cloudCtx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    const lat = (v - 0.5) * Math.PI;
    const polar = Math.abs(lat) / (Math.PI / 2);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = (y * w + x) * 4;
      let r, g, b;
      if (isGiant) {
        const swirl = Math.sin(u * Math.PI * 2 * 3 + noise(u * 5, v * 8) * 3) * 0.09;
        const bands = Math.sin((v + swirl) * Math.PI * 18 + noise(u * 3, v * 11) * 1.9);
        const bandT = bands * 0.5 + 0.5;
        const storm = Math.exp(-((u - 0.7) ** 2 * 260 + (v - 0.55) ** 2 * 600)) * 0.7;
        [r, g, b] = mix(colors[0], colors[1], bandT * 0.75 + 0.12);
        if (planet.type === 'iceGiant') [r, g, b] = mix([r, g, b], colors[2], bandT * 0.3);
        if (storm > 0.1) [r, g, b] = mix([r, g, b], [230, 210, 180], storm);
        const pole = smoothstep(0.79, 1, polar);
        [r, g, b] = mix([r, g, b], isFrozen ? [225, 240, 245] : colors[3], pole * 0.38);
      } else {
        const nx = Math.cos(lat) * Math.cos(u * Math.PI * 2 - Math.PI);
        const ny = Math.sin(lat);
        const nz = Math.cos(lat) * Math.sin(u * Math.PI * 2 - Math.PI);
        const warp = noise(nx * 2.7 + 5, nz * 2.7 + 5);
        const elev = noise((nx + warp * 0.15) * 2.8, (ny + warp * 0.15) * 2.8) * 0.5
          + noise((nx + warp * 0.1) * 6.1, (ny + warp * 0.1) * 6.1) * 0.28
          + noise((nx + warp * 0.06) * 13.4, (ny + warp * 0.06) * 13.4) * 0.14;
        const detail = noise(nx * 34, ny * 34) * 0.025;
        let e = elev + detail;
        const sea = isFrozen ? 1.2 : isDesert ? 0.22 : isVolcanic ? 0.24 : landThreshold;
        if (e < sea) {
          if (isFrozen) [r, g, b] = mix(colors[0], colors[3], clamp(0.45 + e * 0.4, 0, 1));
          else if (isVolcanic) [r, g, b] = mix([26, 12, 11], colors[1], clamp(0.3 + e * 2.5, 0, 1));
          else [r, g, b] = mix(colors[0], [colors[0][0] * 0.55, colors[0][1] * 0.65, colors[0][2] * 0.85], clamp((sea - e) * 2, 0, 1));
          if (!isFrozen && rng.chance(0.0012)) {
            // glowing volcanic fissure
            nightCtx.fillStyle = 'rgba(255,88,24,.9)';
            nightCtx.fillRect(x, y, rng.int(1, 3), 1);
          }
        } else {
          const depth = clamp((e - sea) / (0.6 - sea + 0.001), 0, 1);
          if (isDesert) [r, g, b] = mix(colors[1], colors[2], depth);
          else if (isVolcanic) [r, g, b] = mix(colors[1], colors[2], Math.pow(depth, 1.8));
          else [r, g, b] = mix(colors[1], colors[2], depth);
          if (e > 0.76 || polar > 0.84) [r, g, b] = mix([r, g, b], isDesert ? [210, 177, 132] : [232, 241, 239], smoothstep(0.74, 0.88, e) * 0.85 + smoothstep(0.84, 0.96, polar) * 0.8);
          if (isVolcanic && rng.chance(0.006)) [r, g, b] = [255, 132, 45];
          // city lights on habitable worlds
          if (planet.habitable && depth < 0.52 && !polar && rng.chance(0.0045)) {
            nightCtx.fillStyle = rng.chance(0.22) ? 'rgba(255,218,150,.95)' : 'rgba(255,190,90,.7)';
            nightCtx.fillRect(x, y, rng.int(1, 2), 1);
          }
        }
      }
      dayImg.data[i] = r; dayImg.data[i + 1] = g; dayImg.data[i + 2] = b; dayImg.data[i + 3] = 255;
      // cloud alpha
      let alpha = 0;
      if (planet.habitable) {
        const cl = noise(u * 8 + 13, v * 12 + 7) * 0.5 + noise(u * 18 + 3, v * 21 + 9) * 0.3 + noise(u * 33, v * 41) * 0.2;
        const cloudiness = isGiant ? 0.26 : planet.atmosphere > 0.3 ? 0.5 : 0.34;
        alpha = clamp((cl + 0.26 - cloudiness) * 2.1, 0, 1) * 230;
      }
      cloudImg.data[i] = 235; cloudImg.data[i + 1] = 242; cloudImg.data[i + 2] = 255; cloudImg.data[i + 3] = alpha;
    }
  }
  dayCtx.putImageData(dayImg, 0, 0);
  cloudCtx.putImageData(cloudImg, 0, 0);
  const maps = {
    day: configure(new THREE.CanvasTexture(day)),
    clouds: configure(new THREE.CanvasTexture(cloud)),
    night: configure(new THREE.CanvasTexture(night)),
  };
  procCache.set(key, maps);
  return maps;
}

export function planetMaps(planet) {
  if (planet.id === 'earth' || planet.textureSet === 'earth') return loadEarthTextures();
  return makeProceduralMaps(planet);
}

export function createAtmosphereMaterial(colorHex, intensity = 0.85) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uIntensity: { value: intensity },
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: `
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vViewDir = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform vec3 uSunDirection;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vec3 n = normalize(vNormalW);
        float rim = pow(1.0 - abs(dot(n, normalize(vViewDir))), 2.6);
        float lit = smoothstep(-0.4, 0.45, dot(n, normalize(uSunDirection)));
        float alpha = rim * uIntensity * (0.25 + lit * 0.9);
        gl_FragColor = vec4(uColor * (0.6 + lit * 1.2), alpha);
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
}

export function createNightLightsMaterial(nightMap) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: nightMap },
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
      uIntensity: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uSunDirection;
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vNormalW;
      void main() {
        vec3 lights = texture2D(uMap, vUv).rgb;
        float terminator = smoothstep(0.15, -0.22, dot(normalize(vNormalW), normalize(uSunDirection)));
        float lum = max(lights.r, max(lights.g, lights.b));
        gl_FragColor = vec4(lights * vec3(1.15, 0.8, 0.48), lum * terminator * uIntensity);
      }
    `,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/**
 * Build a planet group suitable for orbital views. Real Earth uses NASA textures;
 * every other world gets deterministic 512x256 albedo/cloud/night maps.
 */
export function createPlanetMesh(planet, opts = {}) {
  const group = new THREE.Group();
  group.name = `planet-${planet.id}`;
  const visualRadius = opts.radius || 1;
  const maps = planetMaps(planet);
  const isGiant = planet.type === 'gas' || planet.type === 'iceGiant';
  const isEarth = planet.id === 'earth';
  const material = new THREE.MeshStandardMaterial({
    map: maps.day,
    roughness: isGiant ? 0.85 : 0.92,
    metalness: 0,
    color: 0xffffff,
    emissive: new THREE.Color(isEarth ? '#0a1a26' : '#0b1419'),
    emissiveIntensity: isEarth ? 0.55 : 0.35,
  });
  if (maps.specular) {
    material.roughnessMap = maps.specular;
    material.roughness = 0.72;
  }
  if (maps.normal) {
    material.normalMap = maps.normal;
    material.normalScale = new THREE.Vector2(0.65, 0.65);
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(visualRadius, isEarth ? 96 : 64, isEarth ? 64 : 40), material);
  body.userData.planet = planet;
  body.userData.kind = 'planet';
  body.castShadow = false;
  body.receiveShadow = false;
  group.add(body);

  // Only living worlds carry a suspended water/ice cloud deck.
  if (planet.habitable && maps.clouds) {
    const cloudMat = new THREE.MeshStandardMaterial({
      map: maps.clouds,
      alphaMap: maps.clouds,
      transparent: true,
      opacity: isEarth ? 0.9 : 0.62,
      depthWrite: false,
      roughness: 1,
      side: THREE.DoubleSide,
    });
    if (!isEarth) cloudMat.alphaTest = 0.02;
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(visualRadius * 1.012, 64, 40), cloudMat);
    clouds.userData.cloudShell = true;
    group.add(clouds);
  }

  const atmoColor = isEarth ? '#6bb9ff' : isGiant ? '#e4c28f' : planet.habitable ? '#7dd8ff' : planet.type === 'volcanic' ? '#ff7c4f' : '#9bbdce';
  if (planet.atmosphere > 0.03 || isGiant) {
    const atmoMat = createAtmosphereMaterial(atmoColor, isEarth ? 0.9 : 0.56);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(visualRadius * 1.065, 48, 32), atmoMat);
    atmo.userData.atmosphere = atmoMat;
    group.add(atmo);
  }

  if (maps.night && (isEarth || planet.habitable)) {
    const lightsMat = createNightLightsMaterial(maps.night);
    const lights = new THREE.Mesh(new THREE.SphereGeometry(visualRadius * 1.008, 64, 40), lightsMat);
    lights.userData.nightLights = lightsMat;
    group.add(lights);
  }

  if (planet.rings) {
    const inner = planet.rings.inner, outer = planet.rings.outer;
    const ringGeo = new THREE.RingGeometry(visualRadius * inner, visualRadius * outer, 96, 1);
    // fix UVs for ring gradient
    const pos = ringGeo.attributes.position;
    const uv = ringGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const v3 = new THREE.Vector3(pos.getX(i), pos.getY(i), 0);
      const r = (v3.length() - visualRadius * inner) / (visualRadius * (outer - inner));
      uv.setXY(i, r, 0.5);
    }
    const ringCanvas = paintCanvas(256, 1);
    const ctx = ringCanvas.getContext('2d');
    for (let i = 0; i < 256; i++) {
      const a = 0.2 + Math.sin(i * 0.6) * 0.1 + Math.sin(i * 0.17 + 1) * 0.13;
      ctx.fillStyle = `rgba(214,202,172,${clamp(a, 0.05, 0.55)})`;
      ctx.fillRect(i, 0, 1, 1);
    }
    const ringTex = configure(new THREE.CanvasTexture(ringCanvas));
    const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, color: planet.rings.color, opacity: 0.78 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.userData.ring = true;
    group.add(ring);
  }

  group.userData.bodyMesh = body;
  group.userData.visualRadius = visualRadius;
  return group;
}

export function createSunMesh(radius, colorHex, opts = {}) {
  const group = new THREE.Group();
  const color = new THREE.Color(colorHex);
  const coreMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.4), toneMapped: false });
  const core = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), coreMat);
  group.add(core);
  const glowTex = makeGlowTexture(colorHex);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: colorHex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, opacity: opts.glowOpacity ?? 0.9,
  }));
  halo.scale.setScalar(radius * 9);
  group.add(halo);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: colorHex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, opacity: 0.22,
  }));
  aura.scale.setScalar(radius * 28);
  group.add(aura);
  const light = new THREE.PointLight(colorHex, opts.lightIntensity ?? 4.2, 0, 1.1);
  group.add(light);
  group.userData.isStar = true;
  group.userData.core = core;
  group.userData.halo = halo;
  group.userData.aura = aura;
  return group;
}

export function makeGlowTexture(colorHex = '#7fe9ff') {
  const c = paintCanvas(128, 128);
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  const col = new THREE.Color(colorHex);
  const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.07, `rgba(${rgb},1)`);
  grad.addColorStop(0.22, `rgba(${rgb},.55)`);
  grad.addColorStop(0.5, `rgba(${rgb},.12)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return configure(new THREE.CanvasTexture(c));
}

export function createStarfield(count = 2800, radius = 1800, tint = 1) {
  const rng = new RNG(`starfield:${count}:${tint}`);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const palette = [
    new THREE.Color('#bdd9ff'), new THREE.Color('#ffffff'), new THREE.Color('#ffe6bc'),
    new THREE.Color('#ffcf9d'), new THREE.Color('#9fc8ff'), new THREE.Color('#e5d4ff'),
  ];
  for (let i = 0; i < count; i++) {
    const r = radius * (0.55 + rng.next() * 0.45);
    const theta = rng.next() * Math.PI * 2;
    const phi = Math.acos(2 * rng.next() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) * 0.72;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const c = rng.pick(palette);
    colors[i * 3] = c.r * tint; colors[i * 3 + 1] = c.g * tint; colors[i * 3 + 2] = c.b * tint;
    sizes[i] = rng.float(0.5, 2.2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) } },
    vertexShader: `
      attribute float aSize;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio * (900.0 / max(100.0, -mv.z));
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 uv = gl_PointCoord - .5;
        float d = length(uv);
        if (d > .5) discard;
        float a = smoothstep(.5, .06, d);
        gl_FragColor = vec4(vColor * (0.8 + a * 1.4), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

export function createMoonMesh(moon, radius) {
  const rng = new RNG(`${moon.name}:moon`);
  const c = paintCanvas(128, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = moon.color || '#9c968d';
  ctx.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 160; i++) {
    const shade = rng.float(0.5, 1.2);
    ctx.fillStyle = `rgba(${shade < 0.8 ? 20 : 220},${shade < 0.8 ? 17 : 215},${shade < 0.8 ? 14 : 200},${rng.float(0.03, 0.16)})`;
    const x = rng.float(0, 128), y = rng.float(0, 64), r = rng.float(0.5, 5);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = configure(new THREE.CanvasTexture(c));
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), mat);
  mesh.userData.moon = moon;
  return mesh;
}

export function disposeObject(obj) {
  obj.traverse?.((child) => {
    if (child.geometry) child.geometry.dispose?.();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        // Do not dispose cached textures accidentally.
        m.dispose?.();
      });
    }
  });
}
