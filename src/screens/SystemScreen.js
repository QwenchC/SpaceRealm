import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state } from '../core/state.js';
import { generateSystem, orbitPosition } from '../data/generator.js';
import { escapeHtml, fmtNumber } from '../core/utils.js';
import { realmForLevel, canSummonShip } from '../core/progression.js';
import { phaseFor, planetOrbitPositionAU } from '../core/astro.js';
import { ICONS, toast, openSettings, withCurtain } from '../ui/ui.js';
import { createPlanetMesh, createSunMesh, createMoonMesh, createStarfield, makeGlowTexture } from '../render/planet-visuals.js';
import { createStarship, animateStarship } from '../render/ship.js';

const TIME_SPEEDS = [0, 60, 600, 6000];
const SPEED_LABELS = ['暂停', '×60', '×600', '×6000'];

export class SystemScreen {
  constructor(app) {
    this.app = app;
    this.galaxy = null;
    this.system = null;
    this.root = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.planetObjects = [];
    this.starObjects = [];
    this.labels = new Map();
    this.selected = null;
    this.raf = 0;
    this.disposed = false;
    this.flight = {
      active: false, ship: null, speed: 0, yaw: 0, pitch: 0, throttle: 0,
      target: null, warping: false, pointerLocked: false,
    };
  }

  mount(parent, options = {}) {
    const galaxy = state.findGalaxy(options.galaxyId || state.data.universe.activeGalaxyId);
    if (!galaxy) { this.app.navigate('universe'); return; }
    this.galaxy = galaxy;
    const systems = this.app.getGalaxySystems(galaxy);
    const meta = systems.find((s) => s.id === (options.systemId || state.data.universe.lastSystemId)) || systems[0];
    this.systemMeta = meta;
    this.system = generateSystem(galaxy, meta);
    for (const p of this.system.planets || []) {
      if (p.phase == null) p.phase = phaseFor(meta.seed, p.id);
    }
    state.setLast({ galaxyId: galaxy.id, systemId: meta.id, planetId: null });
    this.buildUI(parent, options);
    this.initScene();
    this.createBodies();
    this.selectDefault();
    this.addEvents();
    this.resize();
    this.loop();
    requestAnimationFrame(() => this.root.classList.add('active'));
    if (options.firstVisit) {
      setTimeout(() => toast(`已抵达 ${this.system.isHome ? '太阳系 · 母星系' : this.system.name}`, 'success'), 900);
    }
    if (options.takeoff) {
      this.root.querySelector('#system-loading')?.classList.add('done');
      setTimeout(() => this.startFlight(options.fromPlanetId), 650);
    } else {
      setTimeout(() => this.root.querySelector('#system-loading')?.classList.add('done'), 450);
    }
  }

  buildUI(parent, options) {
    const g = this.galaxy;
    const sys = this.system;
    const homePlanet = sys.planets?.find((p) => p.home || p.id === 'earth');
    const isHome = sys.isHome;
    const root = document.createElement('section');
    root.className = 'screen system-screen';
    root.innerHTML = `
      <div class="system-canvas-wrap" id="system-canvas-wrap"></div>
      <div class="system-loading" id="system-loading">
        <div><div class="loader-ring"></div><div class="loader-copy">实时构建恒星系 · 计算 ${sys.planets?.length || 0} 条轨道<br><span style="font-size:8px;opacity:.6">轨道参数依据开普勒定律生成 · 无需读取行星地表</span></div></div>
      </div>
      <header class="site-header">
        <div class="brand" id="brand-home">
          <div class="brand-mark"></div>
          <div class="brand-text"><span class="brand-name">SPACE REALM</span><span class="brand-sub">星 海 境 界</span></div>
        </div>
        <nav class="site-nav">
          <button class="nav-link" id="nav-galaxy">${escapeHtml(g.name)}</button>
          <button class="nav-link active">${escapeHtml(sys.name)}</button>
          <button class="nav-link" id="nav-cmd">指令</button>
        </nav>
        <div class="header-right">
          <div class="header-meta"><span class="signal"><i></i><i></i><i></i></span><span>${isHome ? 'SOLAR EPHEMERIS · LIVE' : 'ORBITAL SOLUTION · LIVE'}</span></div>
          <button class="icon-btn" data-action="settings" title="设置">${ICONS.settings}</button>
          <button class="icon-btn" data-action="fullscreen" title="全屏">${ICONS.fullscreen}</button>
        </div>
      </header>
      <div class="page-route">
        <span class="crumb" id="route-universe">宇宙</span><span class="sep">/</span>
        <span class="crumb" id="route-galaxy">${escapeHtml(g.name)}</span><span class="sep">/</span>
        <span class="current">${escapeHtml(sys.name)}</span>
      </div>
      <div class="system-head">
        <div class="eyebrow ${isHome ? 'gold' : ''}">${isHome ? 'CRADLE SYSTEM / 母星系' : sys.multi ? 'MULTIPLE STAR SYSTEM' : 'STELLAR SYSTEM'}</div>
        <h1 class="system-title">${escapeHtml(sys.name)} <small>${sys.multi ? `${sys.starCount} × STAR` : sys.primary?.spectral || sys.stars?.[0]?.spectral || ''}</small></h1>
        <div class="system-meta">
          <span class="tag ${isHome ? 'gold' : 'green'}">${isHome ? '现实太阳系 1:1' : sys.multi ? '稀有复合恒星系' : '单星系统'}</span>
          <span>${sys.stars?.length || 1} 恒星 · ${sys.planets?.length || 0} 行星 · ${sys.planets?.reduce((a, p) => a + (Array.isArray(p.moons) ? p.moons.length : Number(p.moons) || 0), 0) || 0} 卫星</span>
          <span>局部星历 · 实时演算</span>
        </div>
      </div>
      <div class="system-top-right">
        <div class="time-box" id="time-box" title="点击调整星历流速">
          <div class="time-label">STELLAR EPHEMERIS / 星历 2187</div>
          <div class="time-value" id="time-value">DAY 087.000</div>
          <div class="time-speed" id="time-speed">流速 ×60 · 1 现实秒 = 1 游戏分</div>
        </div>
        <button class="icon-btn" id="show-ship" title="星舰">${ICONS.ship}</button>
      </div>
      <div class="system-labels" id="system-labels"></div>
      <div class="system-scale-note">轨道距离为非线性视觉映射 · 行星半径与轨道参数采用真实比例数据 · 实时开普勒演算</div>
      <aside class="orbit-panel" id="orbit-panel"></aside>
      <div class="body-dock" id="body-dock"></div>
      <div class="flight-hud" id="flight-hud">
        <div class="flight-brackets"><i></i></div>
        <div class="flight-reticle"></div>
        <div class="flight-message" id="flight-message">曲率场展开</div>
        <div class="flight-target">目标 · <b id="flight-target-name">未锁定</b></div>
        <div class="flight-controls">
          <div class="flight-speed">
            <div class="fs-top"><span>STARSHIP SR-01</span><span id="flight-status">ORBIT</span></div>
            <div class="fs-value"><span id="flight-speed-value">0.00</span><small>KU / S</small></div>
            <div class="flight-throttle"><i id="flight-throttle"></i></div>
          </div>
          <button class="btn ghost sm" id="exit-flight">退出星舰</button>
        </div>
        <div class="flight-data">
          <span>目标距离 <b id="flight-dist">—</b></span>
          <span>推进 <b id="flight-thrust-label">IDLE</b></span>
          <span>曲率驱动 <b id="flight-warp-state">READY</b></span>
        </div>
        <button class="btn primary sm flight-warp" id="flight-warp">J · 曲率跃迁至目标</button>
        <button class="btn gold sm flight-warp" id="flight-land" style="bottom:30px;display:none">自动引导着陆</button>
        <div class="flight-lock-hint">鼠标控制航向 · W/S 推进/制动 · Shift 加力 · J 跃迁 · L 着陆 · V 退出</div>
        <button class="btn ghost sm exit-flight" id="exit-flight-top">${ICONS.close} 退出星舰</button>
      </div>
      <div class="warp-flash" id="warp-flash"></div>
    `;
    parent.appendChild(root);
    this.root = root;
    this.wrap = root.querySelector('#system-canvas-wrap');

    root.querySelector('#brand-home').addEventListener('click', () => this.app.navigate('home'));
    root.querySelector('#nav-galaxy').addEventListener('click', () => this.app.navigate('galaxy', { galaxyId: g.id }));
    root.querySelector('#nav-cmd').addEventListener('click', () => window.dispatchEvent(new CustomEvent('spacerealm:open-commands')));
    root.querySelector('#route-universe').addEventListener('click', () => this.app.navigate('universe'));
    root.querySelector('#route-galaxy').addEventListener('click', () => this.app.navigate('galaxy', { galaxyId: g.id }));
    root.querySelector('[data-action="settings"]').addEventListener('click', () => openSettings({}));
    root.querySelector('[data-action="fullscreen"]').addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
    root.querySelector('#time-box').addEventListener('click', () => this.cycleTimeSpeed());
    root.querySelector('#show-ship').addEventListener('click', () => this.tryStartFlight());
    root.querySelector('#exit-flight').addEventListener('click', () => this.stopFlight());
    root.querySelector('#exit-flight-top').addEventListener('click', () => this.stopFlight());
    root.querySelector('#flight-warp').addEventListener('click', () => this.warpToTarget());
    root.querySelector('#flight-land').addEventListener('click', () => {
      if (this.selected?.kind === 'planet') this.landOnPlanet(this.selected.data);
    });
  }

  initScene() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.wrap.appendChild(renderer.domElement);
    this.renderer = renderer;
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.add(createStarfield(state.settings.quality === 'high' ? 5600 : 2600, 1400));
    const nebulaColors = ['#4f8fb8', '#7665b8', '#b47866', '#4eaeb4'];
    for (let i = 0; i < 5; i++) {
      const color = nebulaColors[i % nebulaColors.length];
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(color), color, transparent: true, opacity: 0.055,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
      }));
      const angle = (i / 5) * Math.PI * 2 + 0.7;
      sprite.position.set(Math.cos(angle) * 850, 120 + (i % 2) * 170, Math.sin(angle) * 850);
      sprite.scale.setScalar(1150 + i * 160);
      scene.add(sprite);
    }
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 5000);
    this.computeVisualOrbits();
    const maxOrbit = this.maxOrbit();
    camera.position.set(maxOrbit * 0.12, maxOrbit * 1.35, maxOrbit * 2.0);
    camera.lookAt(0, 0, 0);
    this.camera = camera;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.rotateSpeed = 0.48;
    controls.zoomSpeed = 0.85;
    controls.minDistance = 3.2;
    controls.maxDistance = maxOrbit * 4.5;
    controls.enablePan = false;
    controls.target.set(0, 0, 0);
    controls.update();
    this.controls = controls;
    this.clock = new THREE.Clock();
    this._maxOrbit = maxOrbit;
  }

  maxOrbit() {
    if (!this._visualA) this.computeVisualOrbits();
    return Math.max(6, ...this._visualA.values());
  }

  // The source AU values are compressed for readability. A minimum gap is then
  // enforced so that adjacent planets can never overlap, and the inner planets
  // still get a generous orbit radius instead of being clustered at the star.
  computeVisualOrbits() {
    const map = new Map();
    const planets = [...(this.system.planets || [])].sort((a, b) => (a.aAU || 0.5) - (b.aAU || 0.5));
    let previous = null;
    let previousVisual = -Infinity;
    for (const planet of planets) {
      const base = this.visualOrbit(planet.aAU || 0.5);
      const clearance = previous
        ? this.visualRadius(previous.radiusKm) + this.visualRadius(planet.radiusKm) + 0.8
        : 0;
      const value = Math.max(base, previousVisual + Math.max(2.0, clearance));
      map.set(planet.id, value);
      previous = planet;
      previousVisual = value;
    }
    this._visualA = map;
    return map;
  }

  visualOrbit(aAU) {
    return 3.8 + Math.log10(1 + aAU) * 12.5;
  }

  visualRadius(radiusKm) {
    return Math.min(1.9, Math.max(0.35, 0.32 + Math.log10(1 + radiusKm / 1400) * 0.62));
  }

  createBodies() {
    const sys = this.system;
    const root = this.root;
    const labelLayer = root.querySelector('#system-labels');
    const visualMap = this._visualA || this.computeVisualOrbits();
    const maxOrbit = this.maxOrbit();
    this._maxOrbit = maxOrbit;

    // multi-star display
    sys.stars.forEach((star, i) => {
      const radius = 0.92 * Math.min(2.0, Math.max(0.6, Math.pow(star.radiusKm / 696340, 0.23)));
      const group = createSunMesh(radius, star.color, { lightIntensity: i === 0 ? 4.2 : 2.0 });
      const orbitDist = sys.stars.length > 1 ? (sys.stars.length === 3 ? 2.4 + i * 1.2 : 1.8 + i * 1.9) : 0;
      group.position.set(orbitDist, 0, orbitDist * 0.35 * (i % 2 ? 1 : -1));
      group.userData.star = star;
      group.userData.index = i;
      group.userData.orbitDist = orbitDist;
      this.scene.add(group);
      this.starObjects.push(group);
      const label = document.createElement('button');
      label.className = 'body-label star';
      label.innerHTML = `<i class="bl-dot"></i><span class="bl-name">${escapeHtml(star.name)}</span><span class="bl-sub">${star.spectral}</span>`;
      label.addEventListener('click', () => this.selectStar(i));
      labelLayer.appendChild(label);
      this.labels.set(`star-${i}`, { el: label, group, kind: 'star' });
    });
    if (!sys.stars.length) {
      const group = createSunMesh(1.5, sys.starColor || '#ffd27a');
      this.scene.add(group);
      this.starObjects.push(group);
    }
    this.scene.add(new THREE.AmbientLight('#6987a2', 0.9));
    this.scene.add(new THREE.HemisphereLight('#5b84a1', '#1a2128', 0.72));
    const fill = new THREE.DirectionalLight('#8fc9e8', 1.35);
    fill.position.set(-14, 18, 10);
    this.scene.add(fill);
    this.cockpitFill = new THREE.PointLight('#9fd4ef', 0, 28, 1.5);
    this.scene.add(this.cockpitFill);

    for (const planet of sys.planets) {
      const aAU = planet.aAU || 0.5;
      const rVisual = visualMap.get(planet.id) ?? this.visualOrbit(aAU);
      const radius = this.visualRadius(planet.radiusKm);
      const meshGroup = createPlanetMesh(planet, { radius });
      const holder = new THREE.Group();
      holder.add(meshGroup);
      holder.userData.planet = planet;
      this.scene.add(holder);
      // orbit ring
      const pts = [];
      const segs = 180;
      for (let i = 0; i <= segs; i++) {
        const theta = (i / segs) * Math.PI * 2;
        const e = planet.eccentricity || 0;
        const rAU = aAU * (1 - e * e) / (1 + e * Math.cos(theta));
        const vis = rVisual * (rAU / aAU);
        pts.push(new THREE.Vector3(Math.cos(theta) * vis, 0, Math.sin(theta) * vis));
      }
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const isLife = planet.habitable;
      const orbitMat = new THREE.LineBasicMaterial({ color: isLife ? 0x6fe0e6 : 0x355d70, transparent: true, opacity: isLife ? 0.4 : 0.22 });
      const orbitLine = new THREE.Line(orbitGeo, orbitMat);
      this.scene.add(orbitLine);

      // moons
      const moonObjs = [];
      const moons = Array.isArray(planet.moons) ? planet.moons : [];
      moons.forEach((moon, mi) => {
        const mr = Math.max(0.055, radius * (moon.radiusKm > 2000 ? 0.32 : 0.2));
        const m = createMoonMesh(moon, mr);
        m.userData.baseOrbit = radius * (1.8 + mi * 0.65) + 0.45;
        m.userData.period = moon.periodDays;
        m.userData.phase = phaseFor(planet.seed || planet.id, moon.name, 3);
        m.userData.angle = m.userData.phase;
        holder.add(m);
        moonObjs.push(m);
        if (planet.id === 'earth') {
          const orbitRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
            new Array(48).fill(0).map((_, i) => {
              const a = (i / 48) * Math.PI * 2;
              return new THREE.Vector3(Math.cos(a) * m.userData.baseOrbit, 0, Math.sin(a) * m.userData.baseOrbit);
            })
          ), new THREE.LineBasicMaterial({ color: 0x96b8c8, transparent: true, opacity: 0.2 }));
          holder.add(orbitRing);
        }
      });
      const label = document.createElement('button');
      label.className = `body-label ${planet.habitable ? 'life' : ''} ${planet.home || planet.id === 'earth' ? 'home' : ''}`;
      label.innerHTML = `<i class="bl-dot"></i><span class="bl-name">${escapeHtml(planet.name)}</span><span class="bl-sub">${planet.id === 'earth' ? 'HOME' : planet.type === 'gas-giant' ? 'GAS' : planet.type === 'ice-giant' ? 'ICE' : planet.habitable ? 'LIFE' : ''}</span>`;
      label.addEventListener('click', () => this.selectPlanet(planet));
      labelLayer.appendChild(label);
      this.labels.set(planet.id, { el: label, group: holder, kind: 'planet' });

      this.planetObjects.push({ planet, holder, meshGroup, moonObjs, orbitDist: rVisual, visA: rVisual });
    }

    // Ship (hidden until needed)
    this.flight.ship = createStarship({ scale: 0.58 });
    this.flight.ship.visible = false;
    this.scene.add(this.flight.ship);

    // Dock
    const dock = root.querySelector('#body-dock');
    const starDock = document.createElement('button');
    starDock.className = 'dock-body';
    starDock.innerHTML = `<div class="dock-orb" style="background:radial-gradient(circle at 35% 30%,#fff,${sys.stars[0]?.color || '#ffd27a'} 38%,#a25a1f)"></div><span class="dock-name">${escapeHtml(sys.stars[0]?.name || '恒星')}</span>`;
    starDock.addEventListener('click', () => this.selectStar(0));
    dock.appendChild(starDock);
    this.planetObjects.forEach((p) => {
      const b = document.createElement('button');
      b.className = `dock-body ${p.planet.habitable ? 'life' : ''}`;
      b.innerHTML = `<div class="dock-orb" style="background:radial-gradient(circle at 35% 30%,${p.planet.color},#182626)"></div><span class="dock-name">${escapeHtml(p.planet.name)}</span>${p.planet.habitable ? '<i class="dock-mark"></i>' : ''}`;
      b.addEventListener('click', () => this.selectPlanet(p.planet));
      dock.appendChild(b);
    });
    this.updateDockActive();
  }

  selectDefault() {
    const home = this.system.planets.find((p) => p.id === 'earth' || p.home  || p.habitable);
    if (home) this.selectPlanet(home);
    else if (this.system.planets[0]) this.selectPlanet(this.system.planets[0]);
    else this.selectStar(0);
  }

  selectStar(index) {
    const star = this.system.stars[index];
    this.selected = { kind: 'star', data: star, index };
    this.updateLabels();
    this.showStarPanel(star);
    this.updateDockActive();
  }

  selectPlanet(planet) {
    this.selected = { kind: 'planet', data: planet };
    this.updateLabels();
    this.showPlanetPanel(planet);
    this.updateDockActive();
    this.flight.target = planet;
    const targetName = this.root?.querySelector('#flight-target-name');
    if (targetName) targetName.textContent = planet.name;
    this.root?.querySelector('#flight-land')?.style.setProperty('display', this.flight.active && this.isLandable(planet) ? 'block' : 'none');
  }

  updateLabels() {
    for (const [id, entry] of this.labels) {
      const selected = this.selected && (
        (this.selected.kind === 'star' && id === `star-${this.selected.index}`) ||
        (this.selected.kind === 'planet' && id === this.selected.data.id)
      );
      entry.el.classList.toggle('selected', !!selected);
    }
  }

  updateDockActive() {
    if (!this.root) return;
    const dock = this.root.querySelector('#body-dock');
    const planetId = this.selected?.kind === 'planet' ? this.selected.data.id : null;
    [...dock.children].forEach((b, i) => {
      const label = b.querySelector('.dock-name')?.textContent;
      b.classList.toggle('active', label === (planetId ? this.selected.data.name : this.system.stars[0]?.name));
    });
  }

  showPlanetPanel(planet) {
    const panel = this.root.querySelector('#orbit-panel');
    const moons = Array.isArray(planet.moons) ? planet.moons : [];
    const isGiant = planet.type === 'gas-giant' || planet.type === 'ice-giant' || planet.type === 'gas' || planet.type === 'iceGiant';
    const landable = this.isLandable(planet);
    const gravity = planet.gravity ?? ((planet.radiusKm / 6371) * (isGiant ? 2.3 : 0.95));
    panel.innerHTML = `
      <div class="panel-kicker"><span>ORBITAL ANALYSIS · ${escapeHtml(planet.id.toUpperCase())}</span><span style="color:${planet.habitable ? 'var(--teal)' : 'var(--muted)'}">${planet.habitable ? 'BIO SIGNAL' : isGiant ? 'GASEOUS' : 'SOLID'}</span></div>
      <h3>${escapeHtml(planet.name)}</h3>
      <div class="en-name">${escapeHtml(planet.en || 'CELESTIAL BODY')} ${planet.home ? '· 母星' : ''}</div>
      <div class="sel-tags" style="margin-top:11px">
        ${planet.home ? '<span class="tag gold">人类母星</span>' : planet.habitable ? '<span class="tag green">可居留</span>' : ''}
        <span class="tag">${escapeHtml(planet.typeLabel || planet.biomeName || (isGiant ? '气态巨行星' : '岩质行星'))}</span>
        ${planet.atmosphere > 0.5 ? '<span class="tag">拥有大气</span>' : ''}
      </div>
      <div class="body-desc">${escapeHtml(planet.description || planet.biomeName || '')}</div>
      <div class="panel-note">轨道相位、周期与轴倾角依据真实参数实时解算；为提高可读性，星体视直径与轨道间距采用非线性视觉压缩。</div>
      <div class="body-data">
        <div class="data-item"><span>半径</span><b>${fmtNumber(planet.radiusKm, 0)} km</b></div>
        <div class="data-item"><span>轨道半长轴</span><b>${planet.aAU?.toFixed(3)} AU</b></div>
        <div class="data-item"><span>公转周期</span><b>${planet.periodDays ? (planet.periodDays > 365 ? (planet.periodDays / 365.25).toFixed(2) + ' 年' : planet.periodDays.toFixed(1) + ' 天') : '—'}</b></div>
        <div class="data-item"><span>表面温度</span><b>${planet.tempC != null ? `${planet.tempC > 0 ? '+' : ''}${planet.tempC} °C` : '—'}</b></div>
        <div class="data-item"><span>自转周期</span><b>${planet.rotationHours ? Math.abs(planet.rotationHours).toFixed(1) + ' h' : '—'}</b></div>
        <div class="data-item"><span>重力</span><b>${gravity.toFixed(2)} G</b></div>
      </div>
      ${moons.length ? `<div style="margin-bottom:6px;color:var(--muted);font-family:var(--font-cn);font-size:8px">天然卫星 · ${moons.length}</div><div class="moon-list">${moons.map((m) => `<span class="moon-chip">${escapeHtml(m.name)}</span>`).join('')}</div>` : ''}
      <div class="system-actions">
        <button class="btn ghost sm" id="focus-body">聚焦轨道</button>
        <button class="btn ${landable ? 'primary' : 'ghost'} sm" id="land-body" ${landable ? '' : 'disabled title="气态巨行星无法着陆"'}>${landable ? (planet.home ? '降落母星' : '进入行星') : '无法着陆'}</button>
      </div>
    `;
    panel.classList.add('show');
    panel.querySelector('#focus-body').addEventListener('click', () => this.focusBody(planet));
    panel.querySelector('#land-body').addEventListener('click', () => this.landOnPlanet(planet));
  }

  showStarPanel(star) {
    const panel = this.root.querySelector('#orbit-panel');
    panel.innerHTML = `
      <div class="panel-kicker"><span>STELLAR ANALYSIS</span><span style="color:var(--gold)">FUSION ACTIVE</span></div>
      <h3>${escapeHtml(star.name)}</h3>
      <div class="en-name">${escapeHtml(star.spectral || sysStarClass(star))} · ${star.classLabel || '恒星'}</div>
      <div class="body-desc">${escapeHtml(star.description || `该恒星系的引力核心。表面温度 ${fmtNumber(star.tempK, 0)} K，持续进行氢核聚变，为整个行星系提供光和热。`)}</div>
      <div class="body-data">
        <div class="data-item"><span>半径</span><b>${fmtNumber(star.radiusKm, 0)} km</b></div>
        <div class="data-item"><span>表面温度</span><b>${fmtNumber(star.tempK, 0)} K</b></div>
        <div class="data-item"><span>光谱型</span><b>${escapeHtml(star.spectral || '—')}</b></div>
        <div class="data-item"><span>系统恒星数</span><b>${this.system.stars.length}</b></div>
      </div>
      <div class="system-actions"><button class="btn ghost sm" id="focus-star">聚焦恒星</button></div>
    `;
    panel.classList.add('show');
    panel.querySelector('#focus-star').addEventListener('click', () => this.focusStar(star));
  }

  isLandable(planet) {
    return !['gas-giant', 'ice-giant', 'gas', 'iceGiant'].includes(planet.type);
  }

  focusBody(planet) {
    const obj = this.planetObjects.find((p) => p.planet.id === planet.id);
    if (!obj || !this.camera) return;
    const pos = obj.holder.position;
    this.controls.target.copy(pos);
    const view = new THREE.Vector3(3, 2.4, 5).multiplyScalar(this.visualRadius(planet.radiusKm) * 5.2);
    this.camera.position.copy(pos).add(view);
    this.controls.update();
  }

  focusStar(star) {
    this.controls.target.set(0, 0, 0);
    const dist = this._maxOrbit * 0.7;
    this.camera.position.set(dist * 0.25, dist * 0.45, dist);
    this.controls.update();
  }

  landOnPlanet(planet) {
    if (!this.isLandable(planet)) {
      toast('气态巨行星没有可着陆的表面', 'error');
      return;
    }
    const key = `${this.galaxy.id}:${this.systemMeta.id}:${planet.id}`;
    const first = state.landPlanet(key);
    state.setLast({ galaxyId: this.galaxy.id, systemId: this.systemMeta.id, planetId: planet.id });
    withCurtain(`穿越 ${escapeHtml(planet.name)} 大气层`, async () => {
      if (first) {
        const realm = realmForLevel(state.player.level);
        const bonus = 180 + state.player.level * 30;
        const levelInfo = state.addXp(bonus);
        setTimeout(() => toast(`首次踏足 ${planet.name} · 获得 ${bonus} 修为`, 'gold', 3600), 1200);
        if (levelInfo.levels > 0) setTimeout(() => toast(`境界突破 · 当前 ${realmForLevel(state.player.level).name}（LV.${state.player.level}）`, 'gold', 4200), 2200);
      }
      this.app.navigate('planet', { galaxyId: this.galaxy.id, systemId: this.systemMeta.id, planetId: planet.id });
    }, 650);
  }

  cycleTimeSpeed() {
    const current = TIME_SPEEDS.indexOf(this.app.simSpeed);
    const next = (current + 1) % TIME_SPEEDS.length;
    this.app.setSimSpeed(TIME_SPEEDS[next]);
    const speed = this.root?.querySelector('#time-speed');
    if (speed) {
      speed.textContent = TIME_SPEEDS[next] === 0 ? '星历暂停' : `流速 ${SPEED_LABELS[next]} · 实时轨道演算`;
    }
    if (this.flight.active) this.updateFlightHud();
  }

  addEvents() {
    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    this._keydown = (e) => {
      if (e.key.toLowerCase() === 'v' && !e.ctrlKey && !e.metaKey && !isTyping(e)) {
        if (this.flight.active) this.stopFlight(); else this.tryStartFlight();
      }
      if (e.key.toLowerCase() === 'j' && this.flight.active && !isTyping(e)) this.warpToTarget();
      if (e.key.toLowerCase() === 'l' && this.flight.active && !isTyping(e) && this.selected?.kind === 'planet') this.landOnPlanet(this.selected.data);
      if (e.key.toLowerCase() === 'escape' && this.flight.active) this.stopFlight();
    };
    window.addEventListener('keydown', this._keydown);
    this._pointerlock = () => {
      this.flight.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    };
    document.addEventListener('pointerlockchange', this._pointerlock);
    this._mousemove = (e) => {
      if (!this.flight.active) return;
      if (!this.flight.pointerLocked) return;
      this.flight.yaw -= e.movementX * 0.0018 * (state.settings.sensitivity || 1);
      this.flight.pitch = Math.max(-1.2, Math.min(1.2, this.flight.pitch - e.movementY * 0.0016 * (state.settings.sensitivity || 1)));
    };
    document.addEventListener('mousemove', this._mousemove);
    this._flightKeys = new Set();
    this._keydownFlight = (e) => {
      if (!this.flight.active) return;
      if (isTyping(e)) return;
      if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space'].includes(e.code)) {
        this._flightKeys.add(e.code);
        e.preventDefault();
      }
    };
    this._keyupFlight = (e) => this._flightKeys.delete(e.code);
    window.addEventListener('keydown', this._keydownFlight);
    window.addEventListener('keyup', this._keyupFlight);
    this._canvasClickLock = () => {
      if (this.flight.active && !this.flight.pointerLocked && this.renderer) {
        this.renderer.domElement.requestPointerLock?.();
      }
    };
    if (this.renderer) this.renderer.domElement.addEventListener('click', this._canvasClickLock);
  }

  tryStartFlight() {
    if (!canSummonShip(state.player) && !state.data.progress.shipUnlocked) {
      toast(`筑基之后方可召唤星舰 · 当前境界 ${realmForLevel(state.player.level).name}（LV.${state.player.level}）`, 'error', 4000);
      return;
    }
    this.startFlight();
  }

  releaseInput() {
    this._flightKeys?.clear();
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  onCommandOpen() {
    this.releaseInput();
  }

  startFlight(fromPlanetId) {
    if (this.flight.active) return;
    this.flight.active = true;
    this.controls.enabled = false;
    this.flight.speed = 0.7;
    this.flight.throttle = 0;
    this.flight.warping = false;
    const targetPlanet = this.system.planets.find((p) => p.id === fromPlanetId) || this.selected?.data || this.system.planets[0];
    if (targetPlanet) this.selectPlanet(targetPlanet);
    const targetObj = this.planetObjects.find((p) => p.planet.id === targetPlanet?.id);
    const basePos = targetObj ? targetObj.holder.position.clone() : new THREE.Vector3(0, 0, 8);
    const outward = basePos.length() > 0.01 ? basePos.clone().normalize() : new THREE.Vector3(0, 0, 1);
    const start = basePos.clone().add(outward.multiplyScalar(7.5)).add(new THREE.Vector3(0, 2.6, 0));
    this.flight.ship.position.copy(start);
    this.flight.ship.visible = true;
    // Face the planet we just left so the first frame shows world, ship and star together.
    const inward = basePos.clone().sub(start).normalize();
    this.flight.yaw = Math.atan2(-inward.x, -inward.z);
    this.flight.pitch = -0.06;
    this.flight.ship.quaternion.setFromEuler(new THREE.Euler(this.flight.pitch, this.flight.yaw, 0, 'YXZ'));
    this.snapFlightCamera();
    if (this.cockpitFill) {
      this.cockpitFill.intensity = 3.2;
      this.cockpitFill.position.copy(this.camera.position);
    }
    this.root.querySelector('#flight-hud').classList.add('active');
    this.root.classList.add('in-flight');
    this.root.querySelector('#orbit-panel').classList.remove('show');
    this.root.querySelector('#ship-cutscene')?.classList.add('show');
    this.root.querySelector('#flight-status').textContent = 'IGNITION';
    this.root.querySelector('#flight-message').textContent = '反重力引擎已点火 · 脱离行星引力井';
    this.root.querySelector('#flight-message').classList.add('show');
    setTimeout(() => {
      this.root.querySelector('#flight-message').classList.remove('show');
      this.root.querySelector('#flight-status').textContent = 'ORBIT';
    }, 2100);
    toast('星舰已就位 · 点击画面锁定航向，W 推进 · J 曲率跃迁', 'success', 5200);
    this.updateFlightHud();
  }

  stopFlight() {
    if (!this.flight.active) return;
    this.flight.active = false;
    this.flight.ship.visible = false;
    if (this.cockpitFill) this.cockpitFill.intensity = 0;
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.flight.pointerLocked = false;
    this.root.querySelector('#flight-hud').classList.remove('active');
    this.root.classList.remove('in-flight');
    this.root.querySelector('#flight-land').style.display = 'none';
    this.controls.enabled = true;
    if (this.selected?.kind === 'planet') this.showPlanetPanel(this.selected.data);
  }

  warpToTarget() {
    const target = this.flight.target || (this.selected?.kind === 'planet' ? this.selected.data : null);
    if (!target) { toast('未锁定跃迁目标', 'error'); return; }
    if (this.flight.warping) return;
    this.flight.warping = true;
    const flash = this.root.querySelector('#warp-flash');
    flash.classList.remove('active');
    void flash.offsetWidth;
    flash.classList.add('active');
    this.root.querySelector('#flight-warp-state').textContent = 'SPOOLING';
    this.root.querySelector('#flight-message').textContent = `锁定 ${target.name} · 曲率场展开`;
    this.root.querySelector('#flight-message').classList.add('show');
    setTimeout(() => {
      const obj = this.planetObjects.find((p) => p.planet.id === target.id);
      if (obj) {
        const pos = obj.holder.position.clone();
        const outward = pos.length() > 0.01 ? pos.clone().normalize() : new THREE.Vector3(0, 0, 1);
        this.flight.ship.position.copy(pos).add(outward.multiplyScalar(this.visualRadius(target.radiusKm) * 4.2)).add(new THREE.Vector3(0, this.visualRadius(target.radiusKm) * 2.2, 0));
        const dir = pos.clone().sub(this.flight.ship.position).normalize();
        this.flight.yaw = Math.atan2(-dir.x, -dir.z);
        this.flight.pitch = Math.asin(dir.y);
        this.flight.ship.quaternion.setFromEuler(new THREE.Euler(this.flight.pitch, this.flight.yaw, 0, 'YXZ'));
        this.flight.speed = 0.4;
      }
      this.flight.warping = false;
      this.root.querySelector('#flight-warp-state').textContent = 'READY';
      this.root.querySelector('#flight-message').classList.remove('show');
      const landBtn = this.root.querySelector('#flight-land');
      landBtn.style.display = this.isLandable(target) ? 'block' : 'none';
      landBtn.textContent = `自动引导着陆 · ${target.name}`;
      this.selectPlanet(target);
      toast(`已抵达 ${target.name} 轨道`, 'success');
    }, 1500);
  }

  snapFlightCamera() {
    if (!this.flight.ship) return;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.flight.ship.quaternion);
    this.camera.position.copy(this.flight.ship.position).addScaledVector(forward, -10.2).add(new THREE.Vector3(0, 3.3, 0));
    this.camera.lookAt(this.flight.ship.position.clone().addScaledVector(forward, 5).add(new THREE.Vector3(0, 0.25, 0)));
    this.controls.target.copy(this.flight.ship.position);
  }

  updateFlightHud() {
    if (!this.root) return;
    const speed = this.flight.speed || 0;
    this.root.querySelector('#flight-speed-value').textContent = speed.toFixed(2);
    this.root.querySelector('#flight-throttle').style.width = `${Math.min(100, speed * 3.8)}%`;
    const km = Math.round(speed * 780);
    this.root.querySelector('#flight-thrust-label').textContent = speed > 2.4 ? 'MAX BURN' : speed > 0.1 ? `${km} KM/S` : 'IDLE';
    const targetObj = this.flight.target ? this.planetObjects.find((p) => p.planet.id === this.flight.target.id) : null;
    if (targetObj && this.flight.ship) {
      this.root.querySelector('#flight-dist').textContent = `${this.flight.ship.position.distanceTo(targetObj.holder.position).toFixed(2)} KU`;
    }
  }

  updateFlight(dt) {
    if (!this.flight.active || !this.flight.ship) return;
    const keys = this._flightKeys || new Set();
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (keys.has('KeyW')) this.flight.speed += (boost ? 11 : 4.6) * dt;
    if (keys.has('KeyS')) this.flight.speed -= 5.6 * dt;
    if (keys.has('Space')) this.flight.speed -= 12 * dt;
    this.flight.speed = Math.max(0, Math.min(boost ? 18 : 9, this.flight.speed));
    this.flight.speed *= (1 - dt * 0.08);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.flight.pitch, this.flight.yaw, 0, 'YXZ'));
    this.flight.ship.quaternion.slerp(q, 0.12);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.flight.ship.quaternion);
    this.flight.ship.position.addScaledVector(forward, this.flight.speed * dt);
    const dist = this.flight.ship.position.length();
    if (dist > this._maxOrbit * 3.2) this.flight.ship.position.multiplyScalar(this._maxOrbit * 3.2 / dist);
    animateStarship(this.flight.ship, dt, 0.25 + this.flight.speed / 9);
    const desired = this.flight.ship.position.clone().addScaledVector(forward, -10.2).add(new THREE.Vector3(0, 3.3, 0));
    this.camera.position.lerp(desired, 1 - Math.pow(0.000001, dt));
    const look = this.flight.ship.position.clone().addScaledVector(forward, 5).add(new THREE.Vector3(0, 0.25, 0));
    this.camera.lookAt(look);
    this.controls.target.copy(this.flight.ship.position);
    if (this.cockpitFill) this.cockpitFill.position.copy(this.camera.position);
    this.root.querySelector('#flight-target-name').textContent = this.flight.target?.name || '未锁定';
    this.updateFlightHud();
  }

  resize() {
    if (!this.renderer || !this.wrap) return;
    const w = this.wrap.clientWidth || window.innerWidth;
    const h = this.wrap.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loop() {
    let prev = performance.now();
    const render = (now) => {
      if (this.disposed) return;
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      const days = this.app.tickSimulation(now);
      this.days = days;
      this.updateBodies(days, dt);
      if (this.flight.active) this.updateFlight(dt);
      else this.controls.update();
      this.updateLabelsPosition();
      this.updateTimeDisplay(days);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(render);
    };
    this.raf = requestAnimationFrame(render);
  }

  updateBodies(days, dt) {
    // stars
    for (const starGroup of this.starObjects) {
      const i = starGroup.userData.index || 0;
      if (this.system.stars.length > 1) {
        const a = days * 0.15 + i * 2.3;
        const d = starGroup.userData.orbitDist;
        starGroup.position.set(Math.cos(a) * d, Math.sin(a * 0.7) * 0.4, Math.sin(a) * d);
      }
      starGroup.rotation.y += dt * 0.03;
    }
    const frame = { time: days };
    for (const obj of this.planetObjects) {
      const pos = planetOrbitPositionAU(obj.planet, days);
      const theta = Math.atan2(pos.z, pos.x);
      const trueR = pos.r;
      const visA = obj.visA || this.visualOrbit(obj.planet.aAU || 0.5);
      const r = visA * (trueR / (obj.planet.aAU || 0.5));
      obj.holder.position.set(Math.cos(theta) * r, pos.y * (visA * 0.18), Math.sin(theta) * r);
      obj.meshGroup.rotation.y = (days / Math.abs((obj.planet.rotationHours || 24) / 24)) * Math.PI * 2;
      obj.meshGroup.traverse((c) => {
        if (c.userData.cloudShell) c.rotation.y = days * 0.9;
        if (c.userData.atmosphere) {
          const objPos = obj.holder.position;
          c.userData.atmosphere.uniforms.uSunDirection.value.set(0, 0, 0).sub(objPos).normalize();
        }
        if (c.userData.nightLights) {
          const objPos = obj.holder.position;
          c.userData.nightLights.uniforms.uSunDirection.value.set(0, 0, 0).sub(objPos).normalize();
        }
      });
      for (const m of obj.moonObjs) {
        const a = (days / (m.userData.period || 27)) * Math.PI * 2 + (m.userData.phase || 0);
        const rr = m.userData.baseOrbit;
        const moonInc = 5.1 * Math.PI / 180;
        m.position.set(Math.cos(a) * rr, Math.sin(a) * rr * Math.sin(moonInc), Math.sin(a) * rr * Math.cos(moonInc));
      }
    }
    // sun light on planetary orbits: at home primary at origin; point lights live in sun group.
  }

  updateLabelsPosition() {
    if (!this.root) return;
    const rect = this.wrap.getBoundingClientRect();
    const vec = new THREE.Vector3();
    const placed = [];
    for (const entry of this.labels.values()) {
      const pos = entry.kind === 'star' ? entry.group.position.clone() : entry.group.getWorldPosition(vec.clone());
      // Stars (sun groups) are positioned in world coords already.
      const p = pos.project(this.camera);
      const visible = p.z < 1 && p.z > -1;
      entry.el.style.display = visible ? 'flex' : 'none';
      if (!visible) continue;
      const x = (p.x * 0.5 + 0.5) * rect.width;
      const y = (-p.y * 0.5 + 0.5) * rect.height;
      if (x < -100 || x > rect.width + 100 || y < 0 || y > rect.height) { entry.el.style.display = 'none'; continue; }
      entry.el.style.left = '0px';
      entry.el.style.top = '0px';
      const w = entry.el.offsetWidth || 86;
      const h = entry.el.offsetHeight || 20;
      const halfW = w / 2;
      const halfH = h / 2;
      const candidates = [
        [x + halfW + 8, y - 10], [x + halfW + 8, y + 12], [x + halfW + 8, y - 32], [x + halfW + 8, y + 32],
        [x - halfW - 8, y - 8], [x - halfW - 8, y + 14], [x, y + halfH + 12],
      ];
      let best = null;
      for (const [cx, cy] of candidates) {
        const centerX = Math.max(halfW + 4, Math.min(rect.width - halfW - 4, cx));
        const centerY = Math.max(halfH + 4, Math.min(rect.height - halfH - 4, cy));
        const left = centerX - halfW;
        const top = centerY - halfH;
        const overlaps = placed.some((r) => left < r.x + r.w + 3 && left + w + 3 > r.x && top < r.y + r.h + 3 && top + h + 3 > r.y);
        if (!best) best = [centerX, centerY, left, top];
        if (!overlaps) { best = [centerX, centerY, left, top]; break; }
      }
      const [centerX, centerY, left, top] = best || [x + 10, y - 10, x + 10 - halfW, y - 10 - halfH];
      entry.el.style.left = `${centerX}px`;
      entry.el.style.top = `${centerY}px`;
      placed.push({ x: left, y: top, w, h });
    }
  }

  updateTimeDisplay(days) {
    const value = this.root?.querySelector('#time-value');
    if (!value) return;
    const year = 2187;
    const day = days % 365.25;
    const speed = TIME_SPEEDS.includes(this.app.simSpeed) ? this.app.simSpeed : 60;
    const idx = TIME_SPEEDS.indexOf(speed);
    value.textContent = `DAY ${day < 100 ? '0' : ''}${day.toFixed(3)}`;
    if (idx >= 0) {
      const speedEl = this.root.querySelector('#time-speed');
      if (speedEl) speedEl.textContent = idx === 0 ? '星历暂停' : `流速 ${SPEED_LABELS[idx]} · 实时轨道演算`;
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._resize || (() => {}));
    window.removeEventListener('keydown', this._keydown || (() => {}));
    window.removeEventListener('keydown', this._keydownFlight || (() => {}));
    window.removeEventListener('keyup', this._keyupFlight || (() => {}));
    document.removeEventListener('mousemove', this._mousemove || (() => {}));
    document.removeEventListener('pointerlockchange', this._pointerlock || (() => {}));
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.controls?.dispose();
    this.renderer?.forceContextLoss?.();
    this.renderer?.dispose();
    this.root?.remove();
  }
}

function isTyping(e) {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
}

function sysStarClass(star) {
  return star.spectral || 'G2V';
}
