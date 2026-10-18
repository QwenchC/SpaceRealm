import * as THREE from 'three';
import { RNG, clamp, smoothstep, lerp, TAU } from '../core/utils.js';
import { computeSky } from '../core/astro.js';
import { makeGlowTexture } from '../render/planet-visuals.js';

function createStarMapTexture(seed) {
  const rng = new RNG(`starsky:${seed}`);
  const w = 2048, h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#010204';
  ctx.fillRect(0, 0, w, h);
  // Milky way band
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 130; i++) {
    const x = rng.float(0, w);
    const y = h * 0.44 + Math.sin(x / w * TAU * 1.2 + 0.6) * h * 0.115 + rng.gaussian(0, 38);
    const r = rng.float(25, 140);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = rng.chance(0.35) ? '125,155,215' : rng.chance(0.4) ? '202,178,140' : '164,130,190';
    g.addColorStop(0, `rgba(${hue},${rng.float(0.012, 0.05)})`);
    g.addColorStop(1, `rgba(${hue},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5200; i++) {
    const x = rng.float(0, w);
    const yband = h * 0.44 + Math.sin(x / w * TAU * 1.2 + 0.6) * h * 0.115;
    const y = rng.chance(0.55) ? yband + rng.gaussian(0, 85) : rng.float(0, h);
    if (y < 0 || y >= h) continue;
    const alpha = rng.float(0.06, 0.78);
    const size = rng.float(0.22, 0.85);
    const tint = rng.chance(0.15) ? '255,220,170' : rng.chance(0.14) ? '170,205,255' : '235,244,255';
    ctx.fillStyle = `rgba(${tint},${alpha})`;
    ctx.fillRect(x, y, size, size);
    if (rng.chance(0.004)) {
      ctx.fillStyle = 'rgba(240,250,255,.55)';
      ctx.fillRect(x - 2, y + size / 2, 5, 0.7);
    }
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 1;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

const SKY_VERTEX = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = `
  precision highp float;
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uCamPos;
  uniform float uCover;
  uniform float uStorm;
  uniform float uFlash;
  uniform float uQuality;
  uniform float uAtmosphere;
  uniform float uClouds;
  uniform sampler2D uStarMap;
  uniform vec3 uFogColor;
  varying vec3 vDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a = hash21(i), b = hash21(i+vec2(1,0));
    float c = hash21(i+vec2(0,1)), d = hash21(i+vec2(1,1));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += noise2(p) * a;
      p = p * 2.03 + vec2(13.1, 7.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float sunH = uSunDir.y;
    float day = smoothstep(-0.18, 0.12, sunH);
    float twilight = smoothstep(0.3, 0.0, abs(sunH)) * smoothstep(-0.32, -0.02, sunH);
    float horizon = pow(1.0 - clamp(dir.y, 0.0, 1.0), 2.2);
    float facingSun = max(dot(dir, normalize(uSunDir)), 0.0);

    vec3 nightZenith = vec3(0.003, 0.007, 0.017);
    vec3 nightHorizon = vec3(0.018, 0.031, 0.05);
    vec3 dayZenith = vec3(0.055, 0.225, 0.48);
    vec3 dayHorizon = vec3(0.44, 0.63, 0.72);
    vec3 sunsetHorizon = vec3(1.0, 0.46, 0.21);

    vec3 col = mix(nightHorizon, nightZenith, pow(clamp(dir.y, 0.0, 1.0), 0.52));
    vec3 dayCol = mix(dayHorizon, dayZenith, pow(clamp(dir.y, 0.0, 1.0), 0.52));
    dayCol = mix(dayCol, sunsetHorizon, horizon * twilight * (0.24 + facingSun * 0.8));
    dayCol *= mix(0.08, 1.0, clamp(uAtmosphere, 0.0, 1.0));
    col = mix(col, dayCol, day);

    // Subtle cloud-filtered sun halo.
    col += uSunColor * pow(facingSun, 180.0) * 0.24 * (0.2 + day);
    col += uSunColor * pow(facingSun, 9.0) * 0.055 * (0.25 + day);

    // Stars.
    float starMask = max(1.0 - smoothstep(-0.06, 0.2, sunH), (1.0 - clamp(uAtmosphere * 2.5, 0.0, 1.0)) * 0.9);
    if (starMask > 0.01) {
      vec2 uv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265 + 0.5);
      vec3 stars = texture2D(uStarMap, uv).rgb;
      col += stars * starMask * (0.9 + uFlash * 0.1);
    }

    // Endless layered volumetric cloud sheet. The ray is actually integrated
    // through a 900 m thick slab, and shaded using a secondary density probe
    // towards the sun.
    float cloudCover = 0.0;
    vec3 cloudColor = vec3(0.0);
    if (dir.y > 0.005 && uAtmosphere > 0.04 && uClouds > 0.5) {
      float base = 260.0;
      float top = 1300.0;
      float t0 = (base - uCamPos.y) / max(dir.y, 0.006);
      float t1 = (top - uCamPos.y) / max(dir.y, 0.006);
      t0 = max(t0, 40.0);
      t1 = min(t1, 22000.0);
      float dt = (t1 - t0) / 7.0;
      float transmittance = 1.0;
      vec3 wind = vec3(uTime * (4.0 + uStorm * 16.0), 0.0, uTime * (1.2 + uStorm * 4.0));
      float threshold = mix(0.59, 0.18, uCover);
      for (int i = 0; i < 7; i++) {
        float t = t0 + dt * (float(i) + 0.5);
        vec3 p = uCamPos + dir * t + wind;
        float heightN = clamp((t * dir.y + uCamPos.y - base) / (top - base), 0.0, 1.0);
        float profile = smoothstep(0.0, 0.18, heightN) * (1.0 - smoothstep(0.55, 1.0, heightN));
        vec2 q = p.xz * 0.00072;
        float baseNoise = fbm(q + fbm(q * 0.63 + 3.1) * 0.7);
        float detail = noise2(q * 7.5 + uTime * 0.025) * 0.09;
        float density = baseNoise * 1.24 + detail - 0.35;
        density *= (0.55 + profile * 0.85);
        density += uStorm * 0.1;
        float d = smoothstep(threshold, threshold + 0.22, density);
        if (d > 0.002) {
          vec3 sunP = p + normalize(uSunDir) * 42.0;
          float ahead = fbm(sunP.xz * 0.00072 + fbm(sunP.xz * 0.00045) * 0.7) * 1.24 + 0.04 - 0.35;
          float lit = clamp(1.0 - (ahead - density) * 4.0, 0.08, 1.25);
          vec3 litCol = mix(vec3(0.2, 0.24, 0.3), vec3(1.05, 1.02, 0.97), day);
          litCol = mix(litCol, uSunColor * vec3(1.25, 0.74, 0.46), twilight * 0.6);
          litCol *= 0.5 + lit * 0.68;
          float localAlpha = clamp(d * 0.42 * (1.0 - float(i) / 10.0), 0.0, 0.72);
          cloudColor += litCol * localAlpha * transmittance;
          cloudCover += localAlpha * transmittance;
          transmittance *= (1.0 - localAlpha * 0.72);
        }
      }
    }
    col = mix(col, cloudColor / max(cloudCover, 0.001), clamp(cloudCover * 1.35, 0.0, 0.92));

    // Horizon aerial perspective.
    vec3 fog = uFogColor;
    float horizonFog = pow(1.0 - clamp(dir.y, 0.0, 1.0), 6.0);
    col = mix(col, fog, horizonFog * 0.65 * uAtmosphere);

    // Lightning fills clouds and sky with a cold flash.
    col += vec3(0.62, 0.76, 1.0) * uFlash * (0.14 + cloudCover * 0.8);

    // Vignette-free dithering prevents banding on large gradients.
    float dither = hash21(gl_FragCoord.xy) * 0.004;
    gl_FragColor = vec4(col + dither, 1.0);
  }
`;

export class SkySystem {
  constructor(scene, planet, system, site, options = {}) {
    this.scene = scene;
    this.planet = planet;
    this.system = system;
    this.site = site;
    this.rng = new RNG(`${planet.seed || planet.id}:weather`);
    this.starMap = createStarMapTexture(system.seed || planet.seed || 'sol');
    this.skyUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, -0.2) },
      uSunColor: { value: new THREE.Color('#ffe6b0') },
      uCamPos: { value: new THREE.Vector3() },
      uCover: { value: 0.25 },
      uStorm: { value: 0 },
      uFlash: { value: 0 },
      uQuality: { value: stateQuality() },
      uAtmosphere: { value: Math.min(1.25, Math.max(0, planet.atmosphere ?? 1)) },
      uClouds: { value: planet.habitable ? 1 : 0 },
      uStarMap: { value: this.starMap },
      uFogColor: { value: new THREE.Color('#9fbcc6') },
    };
    const geo = new THREE.SphereGeometry(4400, 48, 28);
    this.skyMesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    }));
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = -1000;
    scene.add(this.skyMesh);

    this.sunLight = new THREE.DirectionalLight('#ffe3b5', 3.4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(stateQuality() > 0.5 ? 2048 : 1024, stateQuality() > 0.5 ? 2048 : 1024);
    this.sunLight.shadow.camera.left = -85;
    this.sunLight.shadow.camera.right = 85;
    this.sunLight.shadow.camera.top = 85;
    this.sunLight.shadow.camera.bottom = -85;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 260;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.045;
    this.sunLight.target.position.set(0, 0, 0);
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.hemi = new THREE.HemisphereLight('#b9d8df', '#29342b', 0.52);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight('#6b8494', 0.18);
    scene.add(this.ambient);
    this.moonLight = new THREE.DirectionalLight('#8bbce7', 0.26);
    scene.add(this.moonLight);
    this.lightning = new THREE.PointLight('#b8d8ff', 0, 160, 2);
    scene.add(this.lightning);

    this.celestial = new THREE.Group();
    this.celestial.name = 'sky-bodies';
    scene.add(this.celestial);
    this.sunMesh = this.createSun();
    this.celestial.add(this.sunMesh.group);
    this.moonMesh = this.createMoon();
    this.celestial.add(this.moonMesh.group);
    this.planetDiscs = new Map();
    this.otherStarGlows = [];
    this.rain = this.createWeatherParticles();
    scene.add(this.rain.points);

    this.weather = {
      type: 'clear', label: '晴朗', intensity: 0, targetCover: 0.22, cover: 0.22,
      storm: 0, targetStorm: 0, precipitation: 0, targetPrecipitation: 0, lightning: 0,
      wind: 0.2, tempMod: 0, lastPeriod: -1, transition: 0,
    };
    this.palette = options.palette;
    this.fog = new THREE.FogExp2('#9db9c5', 0.00165);
    scene.fog = this.fog;
    this.lastSky = null;
    this.sunsetFactor = 0;
    this.time = 0;
    this.lightningTimer = 7;
    this.weatherTypes = this.buildWeatherDeck();
    this.updateWeather(0);
  }

  createSun() {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#fff3d1', fog: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat);
    group.add(mesh);
    const glowTex = makeGlowTexture('#ffdca6');
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffd9a0', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.95 }));
    group.add(glow);
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffd9a0', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.2 }));
    group.add(aura);
    group.renderOrder = -10;
    group.userData.mesh = mesh;
    group.userData.glow = glow;
    group.userData.aura = aura;
    group.visible = false;
    return { group, mesh, glow, aura };
  }

  createMoon() {
    const group = new THREE.Group();
    const loader = new THREE.TextureLoader();
    const map = loader.load('/textures/moon_1024.jpg');
    map.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0, fog: false, emissive: '#11151a', emissiveIntensity: 0.3 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 26), mat);
    group.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture('#b8d0e8'), color: '#a8c2da', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    group.add(glow);
    group.visible = false;
    group.userData.mesh = mesh;
    group.userData.glow = glow;
    return { group, mesh, glow, material: mat };
  }

  buildWeatherDeck() {
    const b = this.planet.biome || 'temperate';
    if ((this.planet.atmosphere ?? 1) < 0.03) {
      return [['clear', '真空', 0.0, 0], ['clear', '无大气 · 静默', 0.0, 0]];
    }
    if (!this.planet.habitable) {
      // Lifeless worlds have no cloud deck. They may still experience dust,
      // ash or ground fog, which are rendered as particles and atmospheric haze.
      if (b === 'volcanic' || b === 'scorched') return [['ash', '火山灰', 0.0, 0.22], ['clear', '灼热晴空', 0.0, 0], ['storm', '电离风暴', 0.0, 0.36]];
      if (b === 'desert') return [['clear', '晴朗', 0.0, 0], ['dust', '扬尘', 0.0, 0.32], ['dust', '沙尘暴', 0.0, 0.55]];
      if (this.site.cold || b === 'ice' || b === 'frozen') return [['clear', '冷寂', 0.0, 0], ['fog', '冰雾', 0.0, 0.04]];
      return [['clear', '无生命 · 静谧', 0.0, 0], ['clear', '稀薄大气', 0.0, 0]];
    }
    if (this.site.cold || b === 'ice' || b === 'frozen' || b === 'tundra') {
      return [
        ['snow', '降雪', 0.6, 0.5], ['overcast', '阴天', 0.84, 0.2], ['clear', '晴冷', 0.2, 0.05],
        ['snow', '细雪', 0.52, 0.32], ['fog', '冰雾', 0.62, 0.1], ['clear', '极地晴空', 0.1, 0],
      ];
    }
    if (b === 'desert') {
      return [
        ['clear', '晴朗', 0.16, 0], ['dust', '扬尘', 0.62, 0.35], ['clear', '烈日', 0.08, 0],
        ['dust', '沙暴', 0.88, 0.62], ['overcast', '薄霾', 0.55, 0.12],
      ];
    }
    if (b === 'volcanic' || b === 'scorched') {
      return [
        ['ash', '火山灰', 0.68, 0.3], ['overcast', '烟霾', 0.56, 0.15], ['storm', '电离风暴', 0.92, 0.7],
        ['clear', '灼热晴空', 0.24, 0],
      ];
    }
    return [
      ['clear', '晴朗', 0.22, 0.02], ['cloudy', '少云', 0.48, 0.06], ['rain', '阵雨', 0.74, 0.34],
      ['clear', '碧空', 0.12, 0], ['overcast', '阴天', 0.82, 0.12], ['storm', '雷暴', 0.95, 0.78],
      ['cloudy', '积云', 0.52, 0.1], ['fog', '晨雾', 0.58, 0.08], ['rain', '细雨', 0.64, 0.24],
      ['clear', '晴朗', 0.2, 0.02],
    ];
  }

  chooseWeather(days) {
    const period = Math.floor(days * 3.5);
    if (period === this.weather.lastPeriod) return;
    this.weather.lastPeriod = period;
    const rng = new RNG(`${this.system.seed || this.planet.seed}:${this.site.lat.toFixed(2)}:${period}`);
    const deck = this.weatherTypes;
    const entry = deck[Math.floor(rng.next() * deck.length)];
    if (!entry) return;
    const [type, label, cover, precip] = entry;
    const currentType = this.weather.type;
    this.weather.type = type;
    this.weather.label = label;
    this.weather.targetCover = cover;
    this.weather.targetPrecipitation = precip;
    this.weather.targetStorm = type === 'storm' ? 0.85 : type === 'ash' ? 0.38 : 0;
    this.weather.transition = 1;
    if (currentType !== type) this.weatherChanged?.(this.weather);
  }

  updateWeather(days) {
    this.chooseWeather(days);
    const w = this.weather;
    const speed = 0.12;
    w.cover += (w.targetCover - w.cover) * speed;
    w.precipitation += (w.targetPrecipitation - w.precipitation) * (speed * 0.7);
    w.storm += (w.targetStorm - w.storm) * (speed * 0.5);
    w.lightning = Math.max(0, w.lightning - 0.035);
    if (w.storm > 0.35) {
      this.lightningTimer -= 1 / 60;
      if (this.lightningTimer <= 0) {
        w.lightning = 1;
        this.lightningTimer = 4 + this.rng.float(2, 13);
      }
    }
    this.skyUniforms.uCover.value = w.cover;
    this.skyUniforms.uStorm.value = w.storm;
    this.skyUniforms.uFlash.value = w.lightning;
    if (this.palette) {
      this.fog.density = lerp(0.00145, 0.0068, w.cover) + w.precipitation * 0.001;
    }
    this.sunLight.intensity = (this.lastSky?.daylight ?? 1) * 3.4 * (1 - w.cover * 0.62);
    this.hemi.intensity = 0.24 + (this.lastSky?.daylight ?? 1) * 0.45 * (1 - w.cover * 0.2);
    this.ambient.intensity = 0.1 + (1 - (this.lastSky?.daylight ?? 1)) * 0.12;
    this.lightning.intensity = w.lightning > 0.1 ? 5 * w.lightning : 0;
    if (this.moonLight) this.moonLight.intensity = 0.05 + (1 - (this.lastSky?.daylight ?? 1)) * 0.34 * (0.4 + w.cover * 0.2);
  }

  createWeatherParticles() {
    const count = 1400;
    const rng = new RNG(`${this.planet.seed}:precip`);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rng.float(-40, 40);
      pos[i * 3 + 1] = rng.float(0, 36);
      pos[i * 3 + 2] = rng.float(-40, 40);
      seed[i] = rng.next();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSpeed: { value: 18 }, uSize: { value: 1.4 },
        uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#d6f2ff') }, uWind: { value: new THREE.Vector2(1, 0.4) },
        uPixel: { value: Math.min(2, window.devicePixelRatio || 1) },
      },
      vertexShader: `
        attribute float aSeed;
        uniform float uTime; uniform float uSpeed; uniform float uSize; uniform vec2 uWind; uniform float uPixel;
        varying float vSeed;
        void main(){
          vSeed = aSeed;
          vec3 p = position;
          p.y = mod(position.y - uTime * uSpeed * (.45 + aSeed), 36.0);
          p.x += uWind.x * uTime * (2.0 + aSeed * 3.0);
          p.z += uWind.y * uTime * (1.5 + aSeed * 2.0);
          p.x = mod(p.x + 40.0, 80.0) - 40.0;
          p.z = mod(p.z + 40.0, 80.0) - 40.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uPixel * (280.0 / max(15.0, -mv.z)) * (.6 + aSeed * .8);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity;
        varying float vSeed;
        void main(){
          vec2 uv = gl_PointCoord - .5;
          float d = length(uv * vec2(1.0, .52));
          if (d > .5) discard;
          float a = smoothstep(.5, 0.0, d) * uOpacity;
          gl_FragColor = vec4(uColor * (0.8 + vSeed*.4), a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    return { points, mat };
  }

  update(days, camera, dt) {
    this.time += dt;
    this.sunsetFactor = 0;
    const data = computeSky(this.system, this.planet, days, this.site.lat, this.site.lon);
    this.lastSky = data;
    this.updateWeather(days);
    const u = this.skyUniforms;
    const sunDir = new THREE.Vector3(data.sun.direction.x, data.sun.direction.y, data.sun.direction.z).normalize();
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.set(data.sun.color);
    u.uCamPos.value.copy(camera.position);
    u.uTime.value = this.time;
    u.uFlash.value = this.weather.lightning;
    this.skyMesh.position.copy(camera.position);

    const daylight = data.daylight;
    const sunset = smoothstep(0.45, 0.0, Math.abs(data.sun.altitude / 90)) * daylight;
    this.sunsetFactor = sunset;
    const sunTint = new THREE.Color(data.sun.color).lerp(new THREE.Color('#ff9b61'), sunset * 0.75);
    this.sunLight.color.copy(sunTint);
    this.sunLight.position.copy(camera.position).addScaledVector(sunDir, 120);
    this.sunLight.target.position.copy(camera.position);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.intensity = daylight * 4.4 * (1 - this.weather.cover * 0.7);
    this.sunLight.visible = daylight > 0.012;

    const fogDay = new THREE.Color(this.palette?.sky || '#93b6c1');
    const fogNight = new THREE.Color('#0b151e');
    const fog = fogNight.clone().lerp(fogDay, daylight);
    fog.lerp(new THREE.Color('#c38566'), sunset * 0.35);
    fog.lerp(new THREE.Color('#56666c'), this.weather.cover * 0.45);
    const airless = (this.planet.atmosphere ?? 1) < 0.03;
    u.uFogColor.value.copy(fog);
    this.fog.color.copy(fog);
    this.fog.density = airless ? 0.00008 : lerp(0.0009, 0.0048, this.weather.cover) + this.weather.precipitation * 0.0008;

    // Sun
    const sunDist = 3300;
    const sunAng = Math.max(0.15, data.sun.angularDiameter || 0.53) * Math.PI / 180;
    const sunRadius = Math.tan(sunAng / 2) * sunDist;
    this.sunMesh.group.visible = sunDir.y > -0.12;
    this.sunMesh.group.position.copy(camera.position).addScaledVector(sunDir, sunDist);
    this.sunMesh.mesh.scale.setScalar(sunRadius);
    this.sunMesh.glow.position.copy(this.sunMesh.group.position).sub(camera.position).setLength(0);
    this.sunMesh.glow.position.set(0, 0, 0);
    this.sunMesh.glow.scale.setScalar(sunRadius * 20);
    this.sunMesh.glow.material.opacity = 0.9 * (0.25 + daylight);
    if (this.sunMesh.aura) {
      this.sunMesh.aura.scale.setScalar(sunRadius * 60);
      this.sunMesh.aura.material.opacity = 0.16 * (0.2 + daylight);
    }
    this.sunMesh.mesh.material.color.set(data.sun.color).multiplyScalar(1.8);

    // Primary moon
    const moon = data.bodies.find((b) => b.kind === 'moon');
    if (moon) {
      const md = new THREE.Vector3(moon.direction.x, moon.direction.y, moon.direction.z).normalize();
      const dist = 1900;
      this.moonMesh.group.visible = md.y > -0.12;
      this.moonMesh.group.position.copy(camera.position).addScaledVector(md, dist);
      const mr = Math.tan((moon.angularDiameter * Math.PI / 180) / 2) * dist;
      this.moonMesh.mesh.scale.setScalar(mr);
      this.moonMesh.glow.scale.setScalar(mr * 3.2);
      this.moonMesh.glow.material.opacity = 0.14 * (0.2 + (1 - daylight));
      this.moonMesh.group.rotation.y += dt * 0.006;
      this.moonLight.position.copy(camera.position).addScaledVector(md, 80);
      this.moonLight.target.position.copy(camera.position);
      this.moonLight.target.updateMatrixWorld();
      this.moonLight.color.set(moon.color || '#8bbce7');
    } else {
      this.moonMesh.group.visible = false;
      this.moonLight.intensity = 0;
    }

    // Other planets: visible callbacks of the living orrery.
    for (const body of data.bodies.filter((b) => b.kind === 'planet')) {
      let mesh = this.planetDiscs.get(body.id);
      if (!mesh) {
        const g = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: body.color || '#aac2d0', fog: false, toneMapped: false });
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mat);
        g.add(sphere);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(body.color || '#88bbd0'), color: body.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        g.add(glow);
        g.userData = { sphere, glow, body };
        this.celestial.add(g);
        this.planetDiscs.set(body.id, g);
        mesh = g;
      }
      const d = new THREE.Vector3(body.direction.x, body.direction.y, body.direction.z).normalize();
      const dist = 2800;
      mesh.visible = d.y > -0.04;
      mesh.position.copy(camera.position).addScaledVector(d, dist);
      const pr = Math.max(0.5, Math.tan((Math.max(body.angularDiameter, 0.018) * Math.PI / 180) / 2) * dist);
      mesh.userData.sphere.scale.setScalar(pr);
      mesh.userData.glow.scale.setScalar(pr * 3.4);
      mesh.userData.glow.material.opacity = 0.22 + (1 - daylight) * 0.2;
    }
    for (const [id, group] of this.planetDiscs) {
      if (!data.bodies.find((b) => b.kind === 'planet' && b.id === id)) group.visible = false;
    }

    // Other stars in multiple systems.
    while (this.otherStarGlows.length < data.bodies.filter((b) => b.kind === 'star').length) {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture('#ffffff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      this.celestial.add(glow);
      this.otherStarGlows.push(glow);
    }
    const otherStars = data.bodies.filter((b) => b.kind === 'star');
    this.otherStarGlows.forEach((glow, i) => {
      const b = otherStars[i];
      glow.visible = !!b;
      if (!b) return;
      const d = new THREE.Vector3(b.direction.x, b.direction.y, b.direction.z).normalize();
      glow.position.copy(camera.position).addScaledVector(d, 3100);
      glow.material.color.set(b.color || '#ffffff');
      glow.scale.setScalar(150);
      glow.visible = d.y > -0.08;
    });

    // Precipitation
    const precip = this.weather.precipitation;
    const isSnow = this.weather.type === 'snow';
    const isDust = this.weather.type === 'dust' || this.weather.type === 'ash';
    this.rain.points.visible = precip > 0.03;
    if (this.rain.points.visible) {
      this.rain.points.position.set(camera.position.x, camera.position.y, camera.position.z);
      this.rain.mat.uniforms.uTime.value = this.time;
      this.rain.mat.uniforms.uSpeed.value = isSnow ? 2.2 : isDust ? 4.5 : 28;
      this.rain.mat.uniforms.uSize.value = isSnow ? 2.6 : isDust ? 2.2 : 1.15;
      this.rain.mat.uniforms.uOpacity.value = clamp(precip * 0.55, 0, 0.65);
      this.rain.mat.uniforms.uColor.value.set(isSnow ? '#e8f4ff' : isDust ? '#bba176' : '#bcdced');
      this.rain.mat.uniforms.uWind.value.set(isDust ? 2.4 : 0.6, isDust ? 1.6 : 0.24);
    }

    const fogDensity = this.fog.density;
    const amb = this.ambient;
    amb.intensity = 0.24 + (1 - daylight) * 0.1 + this.weather.lightning * 0.7;
    this.hemi.intensity = 0.32 + daylight * (0.9 - this.weather.cover * 0.16);
    this.lightning.position.copy(camera.position).add(new THREE.Vector3(20, 55, -30));
    this.lightning.intensity = this.weather.lightning * 9;

    return data;
  }

  getWeather() { return this.weather; }

  dispose() {
    this.scene.remove(this.skyMesh);
    this.skyMesh.geometry.dispose();
    this.skyMesh.material.dispose();
    this.starMap.dispose();
    this.scene.remove(this.sunLight);
    this.scene.remove(this.hemi);
    this.scene.remove(this.ambient);
    this.scene.remove(this.rain.points);
    this.rain.points.geometry.dispose();
    this.rain.points.material.dispose();
    this.celestial.clear();
    this.sunMesh.mesh.geometry.dispose();
    this.sunMesh.mesh.material.dispose();
    this.moonMesh.mesh.geometry.dispose();
    this.moonMesh.material.dispose();
    this.planetDiscs.forEach((g) => {
      g.userData.sphere.geometry.dispose();
      g.userData.sphere.material.dispose();
    });
  }
}

function stateQuality() {
  // Avoid importing the whole store here just for one display option.
  try {
    const raw = localStorage.getItem('spacerealm.save.v2');
    return raw && JSON.parse(raw).settings?.quality === 'low' ? 0 : 1;
  } catch { return 1; }
}
