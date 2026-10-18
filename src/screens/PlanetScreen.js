import * as THREE from 'three';
import { state } from '../core/state.js';
import { generateSystem } from '../data/generator.js';
import { chooseLandingSite, phaseFor, computeSky } from '../core/astro.js';
import { realmForLevel, xpProgress, powerMultiplier, canSummonShip, nextRealm, REALMS } from '../core/progression.js';
import { WEAPONS, TOOL_ORDER, ITEMS, RECIPES } from '../core/items.js';
import { escapeHtml, clamp, smoothstep, fmtNumber, TAU, RNG } from '../core/utils.js';
import { ICONS, toast, openSettings, openCodex, withCurtain, confirmDialog, wait } from '../ui/ui.js';
import { TerrainWorld, CHUNK_SIZE } from '../planet/terrain.js';
import { SkySystem } from '../planet/sky.js';
import { SurfaceEcosystem } from '../planet/entities.js';
import { createStarship, animateStarship } from '../render/ship.js';

const EYE_HEIGHT = 1.72;
const PLAYER_HEIGHT = 1.78;
const PLAYER_RADIUS = 0.32;

const CARDINALS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
const WEATHER_ICONS = { clear: '☀', cloudy: '◒', rain: '☂', storm: 'ϟ', snow: '❄', fog: '≋', dust: '◌', ash: '▲', overcast: '☁' };
const HOTBAR_TOOLS = TOOL_ORDER;
const TOOL_ITEM = { cutter: null, stonePick: 'stonePick', ironPick: 'ironPick', plasmaDrill: 'plasmaDrill', terraformer: 'terraformer', pulseRifle: 'pulseRifle', starblade: 'starblade', annihilator: 'annihilator' };
const TOOL_GLYPH = { cutter: 'weapon', stonePick: 'tool', ironPick: 'tool', plasmaDrill: 'tool', terraformer: 'tool', pulseRifle: 'weapon', starblade: 'weapon', annihilator: 'weapon' };

export class PlanetScreen {
  constructor(app) {
    this.app = app;
    this.root = null;
    this.scene = null;
    this.terrain = null;
    this.ecosystem = null;
    this.sky = null;
    this.renderer = null;
    this.camera = null;
    this.player = null;
    this.started = false;
    this.menuOpen = false;
    this.menuTab = 'inventory';
    this.dead = false;
    this.keys = new Set();
    this.velocity = new THREE.Vector3();
    this.lastAction = 0;
    this.lastSecondary = 0;
    this.lastGround = null;
    this.onGround = false;
    this.fly = false;
    this.startTime = performance.now();
    this.lastSave = performance.now();
    this.lastHud = 0;
    this.lastMinimap = 0;
    this.lastInteract = 0;
    this.shipGroup = null;
    this.shipSummoned = false;
    this.shipAnim = null;
    this.particles = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 11;
    this.aimHit = null;
    this.mouseButtons = new Set();
    this.hudRefs = {};
    this._handlers = [];
    this.disposed = false;
    this.everStarted = false;
    this.saveTimer = 0;
    this.weatherChangedNotify = null;
  }

  mount(parent, options = {}) {
    const galaxy = state.findGalaxy(options.galaxyId || state.data.universe.activeGalaxyId);
    if (!galaxy) { this.app.navigate('universe'); return; }
    this.galaxy = galaxy;
    const systems = this.app.getGalaxySystems(galaxy);
    const meta = systems.find((s) => s.id === (options.systemId || state.data.universe.lastSystemId)) || systems[0];
    this.systemMeta = meta;
    this.system = generateSystem(galaxy, meta);
    for (const p of this.system.planets || []) if (p.phase == null) p.phase = phaseFor(meta.seed, p.id);
    this.planet = this.system.planets.find((p) => p.id === options.planetId) || this.system.planets.find((p) => p.habitable) || this.system.planets[0];
    if (!this.planet) { this.app.navigate('system', { galaxyId: galaxy.id, systemId: meta.id }); return; }
    this.planetKey = `${galaxy.id}:${meta.id}:${this.planet.id}`;
    this.initialDays = this.app.tickSimulation(performance.now());
    this.resolveSite();
    this.terrainSeed = `${this.planet.seed || this.planetKey}:${this.site.lat.toFixed(2)}:${this.site.lon.toFixed(2)}`;
    this.timeDays = this.initialDays;
    state.setLast({ galaxyId: galaxy.id, systemId: meta.id, planetId: this.planet.id });
    this.buildUI(parent);
    this.buildScene();
    this.bindEvents();
    this.updateHotbar();
    this.updateHud(true);
    this.loop();
    requestAnimationFrame(() => this.root.classList.add('active'));
    setTimeout(() => this.root.querySelector('.arrival-kicker')?.classList.add('ready'), 100);
    if (options.firstEntry) {
      state.landPlanet(this.planetKey);
      const bonus = 180 + state.player.level * 30;
      setTimeout(() => {
        const result = state.addXp(bonus);
        toast(`导航协议完成 · 初次进入已同步至母星「${this.planet.name}」· 修为 +${bonus}`, 'gold', 5200);
        if (result.levels > 0) setTimeout(() => toast(`境界突破 · ${realmForLevel(state.player.level).name}（LV.${state.player.level}）`, 'gold', 4000), 1200);
        this.updateHud(true);
      }, 1100);
    }
  }

  resolveSite() {
    const sites = state.data.progress.sites || (state.data.progress.sites = {});
    let site = sites[this.planetKey];
    if (!site) {
      const rng = new RNG(`${this.planetKey}:site`);
      let preferred = this.planet.id === 'earth' ? 31.5 : rng.float(-36, 46);
      if (this.planet.biome === 'ice' || this.planet.biome === 'frozen') preferred = rng.float(48, 66);
      if (this.planet.biome === 'desert') preferred = rng.float(8, 28);
      site = chooseLandingSite(this.system, this.planet, this.initialDays, preferred);
      site.lon = ((site.lon % 360) + 360) % 360;
      site.pickedAt = Date.now();
      site.key = this.planetKey;
      site.seed = `${this.planetKey}:${site.lat.toFixed(2)}:${site.lon.toFixed(2)}`;
      site.cold = this.planet.tempC < 0 || this.planet.biome === 'ice' || this.planet.biome === 'frozen';
      sites[this.planetKey] = site;
      state.queueSave();
    }
    site.cold = site.cold ?? (this.planet.tempC < 0 || this.planet.biome === 'ice');
    site.lon = ((site.lon % 360) + 360) % 360;
    this.site = site;
  }

  buildUI(parent) {
    const p = this.planet;
    const mode = state.creative ? '造物模式' : '生存模式';
    const biomeName = p.biomeName || (p.id === 'earth' ? '温带海洋性气候 · 大陆海岸' : p.habitable ? '温带大陆' : p.biome === 'ice' ? '冰封荒原' : p.biome === 'desert' ? '荒漠高原' : '异星地貌');
    const root = document.createElement('section');
    root.className = 'screen planet-screen';
    const isHome = p.id === 'earth' || p.home;
    root.innerHTML = `
      <div class="planet-canvas-wrap" id="planet-canvas-wrap"></div>
      <div class="planet-ui" id="planet-ui">
        <div class="hud-top">
          <div class="hud-loc">
            <div class="loc-name">${escapeHtml(isHome ? '地球 · 人类母星' : `${this.system.name} · ${p.name}`)}</div>
            <div class="loc-coord" id="hud-coord">LAT ${this.site.lat.toFixed(2)}° · LON ${this.site.lon.toFixed(2)}°</div>
          </div>
          <div class="hud-clock">
            <div class="clock-time" id="hud-time">--:--</div>
            <div class="clock-date" id="hud-date">星历 2187 · 第 087 日</div>
            <div class="weather" id="hud-weather">☀ 晴朗 · 体感 18°C</div>
          </div>
        </div>
        <div class="hud-left">
          <div class="realm-panel">
            <div class="realm-line"><span class="realm-name" id="hud-realm">凡人</span><span class="realm-level" id="hud-level">LV.01</span></div>
            <div class="realm-desc" id="hud-realm-desc">肉体凡胎，初识星尘。</div>
            <div class="xp-bar"><i id="hud-xp"></i></div>
            <div class="xp-meta"><span id="hud-xp-text">0 / 120 XP</span><span>突破以指数需求递增</span></div>
          </div>
          <div class="vitals">
            <div class="vital hp"><span class="vital-label">生命</span><div class="vital-track"><i id="bar-hp"></i></div><span class="vital-val" id="val-hp">100 / 100</span></div>
            <div class="vital mp"><span class="vital-label">法力</span><div class="vital-track"><i id="bar-mp"></i></div><span class="vital-val" id="val-mp">60 / 60</span></div>
            <div class="vital sp"><span class="vital-label">体力</span><div class="vital-track"><i id="bar-sp"></i></div><span class="vital-val" id="val-sp">100 / 100</span></div>
          </div>
        </div>
        <div class="hud-right">
          <div class="compass"><span>NW</span><span>N</span><span>NE</span><span>E</span><span>SE</span><span>S</span><span>SW</span><span>W</span></div>
          <div class="minimap-box"><canvas id="minimap"></canvas><div class="mini-ring"></div><div class="mini-label">LOCAL SURVEY</div></div>
          <div class="coords" id="hud-alt">ALT 0.0 M · LOCAL GRID 0 / 0</div>
        </div>
        <div class="quest-card">
          <div class="q-label"><span>DIRECTIVE / 当前指引</span><span id="quest-progress">01</span></div>
          <div class="q-title" id="quest-title">采集星球样本</div>
          <div class="q-desc" id="quest-desc">用拓荒切割器破坏地形，获取 10 份资源，感受这片土地。</div>
        </div>
        <div class="crosshair" id="crosshair"><i class="ch-ring"></i></div>
        <div class="ship-panel" id="ship-panel">
          <div class="ship-status"><span>ORBITAL ASSET</span><b id="ship-state">LOCKED</b></div>
          <h4 id="ship-title">星舰 SR-01 · 未召唤</h4>
          <p id="ship-desc">筑基之后可召唤个人星舰。星舰将进行无缝大气层穿越。</p>
          <button class="btn primary sm" id="ship-action">${ICONS.ship} 召唤星舰 <span style="opacity:.5">V</span></button>
        </div>
        <div class="control-overlay" id="control-overlay">
          <b>WASD</b> 移动 · <b>SHIFT</b> 疾跑 · <b>SPACE</b> 跳跃 · <b>F</b> 飞行<br>
          <b>LMB</b> 采掘 · <b>RMB</b> 凝铸 · <b>Q</b> 灵能脉冲 · <b>E</b> 交互<br>
          <b>C</b> 合成 · <b>K</b> 修炼 · <b>TAB</b> 背包 · <b>M</b> 星图 · <b>ESC</b> 菜单 · <b>~</b> 指令
        </div>
        <div class="hud-bottom">
          <div class="interaction-hint" id="interact-hint"></div>
          <div class="hotbar" id="hotbar"></div>
          <div class="hud-hotbar-label"><b id="equipped-name">拓荒切割器</b><span>·</span><span id="mode-label">${mode}</span><span>·</span><span>1–8 切换装备</span></div>
        </div>
        <div class="power-panel">
          <div class="power-label"><span>武器破坏力 · 随境界指数增长</span><b id="power-value">×1.00</b></div>
          <div class="weapon-box"><div class="weapon-icon">${ICONS.warning}</div><div><div class="weapon-name" id="weapon-name">拓荒切割器</div><small id="weapon-desc">初始多功能切割器 · 半径 1.05 m</small></div><div class="weapon-dmg" id="weapon-dmg">DMG 5</div></div>
        </div>
        <div class="planet-toast" id="planet-toast"></div>
        <div class="system-map-link" id="starmap-hint">M · 银河星图 &nbsp;|&nbsp; ESC · 地表终端</div>
        <div class="ship-summon-pulse" id="ship-pulse"></div>
      </div>
      <div class="arrival-overlay" id="arrival-overlay">
        <div class="arrival-frame">
          <div class="arrival-kicker">${isHome ? '<span class="gold">CRADLE WORLD</span> · 首次接触' : 'PLANETARY INSERTION'} · ${escapeHtml(p.typeLabel || biomeName).toUpperCase()}</div>
          <h1 class="arrival-title">${escapeHtml(isHome ? '母星 · 地球' : p.name)}<span>${escapeHtml(this.system.name.toUpperCase())} / ${this.site.lat.toFixed(1)}°${this.site.lat >= 0 ? 'N' : 'S'}</span></h1>
          <div class="arrival-line"></div>
          <p class="arrival-sub">${escapeHtml(p.habitable ? '可呼吸大气 · 生态圈活跃 · 昼夜由真实星历驱动' : '外部环境极端 · 建议保持在星舰防护范围内')}<br>${escapeHtml(biomeName)} · 星历 ${this.initialDays.toFixed(2)}</p>
          <div class="arrival-stats">
            <div><b>${p.radiusKm ? fmtNumber(p.radiusKm, 0) : '—'}<small style="font-size:7px"> km</small></b><span>行星半径</span></div>
            <div><b>${p.gravity ? p.gravity.toFixed(2) : ((p.radiusKm / 6371) * 1.0).toFixed(2)} G</b><span>表面重力</span></div>
            <div><b>${p.tempC != null ? `${p.tempC > 0 ? '+' : ''}${p.tempC}°C` : '—'}</b><span>基础气温</span></div>
            <div><b>${escapeHtml(p.biomeName || (isHome ? '温带海岸' : '异星地表'))}</b><span>生物群系</span></div>
          </div>
          <button class="btn primary lg" id="begin-exploration">开始勘探 · 点击以锁定视角</button>
          <div class="mini-note" style="margin-top:13px">WASD 移动 · 鼠标观察 · 左键采掘 · 右键凝铸 · ESC 菜单 · M 银河星图 · ~ 指令终端</div>
        </div>
      </div>
      <div class="planet-menu" id="planet-menu">
        <div class="planet-menu-inner">
          <div class="planet-menu-head">
            <div>
              <div class="eyebrow">SURFACE TERMINAL / 地表终端</div>
              <h2 id="menu-title">背包与合成</h2>
              <div class="menu-title-meta"><span>${escapeHtml(p.name)}</span><span>${mode}</span><span id="menu-seed">SEED ${escapeHtml(this.terrainSeed.slice(-18))}</span></div>
            </div>
            <button class="icon-btn" id="menu-close">${ICONS.close}</button>
          </div>
          <div class="planet-menu-tabs" id="menu-tabs">
            <button data-tab="inventory">背包 / INVENTORY</button>
            <button data-tab="craft">合成 / FABRICATE</button>
            <button data-tab="cultivate">修炼 / CULTIVATION</button>
            <button data-tab="system">系统 / SYSTEM</button>
          </div>
          <div class="menu-body" id="menu-body"></div>
          <div class="menu-foot"><span><span class="kbd">TAB</span> 背包 <span class="kbd">C</span> 合成 <span class="kbd">K</span> 修炼 <span class="kbd">ESC</span> 关闭</span><span class="save-state"><i></i> 自动存档 · 本地星历</span></div>
        </div>
      </div>
      <div class="death-overlay" id="death-overlay">
        <div><div class="eyebrow" style="justify-content:center">SIGNAL LOST</div><h2>意识中断</h2><p>行星环境突破了你的生命极限。星舰救援信标已记录你的着陆点。</p><button class="btn primary lg" id="respawn">在着陆点重生</button></div>
      </div>
      <div class="launch-sequence" id="launch-sequence">
        <div class="launch-inner">
          <div class="l-kicker">ATMOSPHERIC EGRESS / 星舰升空</div>
          <h2>脱离行星引力井</h2>
          <p id="launch-sub">反重力阵列已锁定 · 正在穿越对流层</p>
          <div class="launch-engines"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="altimeter"><i></i></div>
          <p style="margin-top:14px">无缝切换至近地轨道 · 无加载停顿</p>
        </div>
      </div>
      <div class="pointer-lock-prompt" id="pointer-prompt"><div>点击画面继续勘探 · 鼠标锁定</div></div>
    `;
    parent.appendChild(root);
    this.root = root;
    root.classList.add('pre-arrival');
    this.hudRefs = {
      time: root.querySelector('#hud-time'), date: root.querySelector('#hud-date'), weather: root.querySelector('#hud-weather'),
      realm: root.querySelector('#hud-realm'), level: root.querySelector('#hud-level'), realmDesc: root.querySelector('#hud-realm-desc'),
      xp: root.querySelector('#hud-xp'), xpText: root.querySelector('#hud-xp-text'),
      hp: root.querySelector('#bar-hp'), mp: root.querySelector('#bar-mp'), sp: root.querySelector('#bar-sp'),
      hpV: root.querySelector('#val-hp'), mpV: root.querySelector('#val-mp'), spV: root.querySelector('#val-sp'),
      coord: root.querySelector('#hud-coord'), alt: root.querySelector('#hud-alt'), questTitle: root.querySelector('#quest-title'),
      questDesc: root.querySelector('#quest-desc'), questProgress: root.querySelector('#quest-progress'),
      interact: root.querySelector('#interact-hint'), hotbar: root.querySelector('#hotbar'), power: root.querySelector('#power-value'),
      weaponName: root.querySelector('#weapon-name'), weaponDesc: root.querySelector('#weapon-desc'), weaponDmg: root.querySelector('#weapon-dmg'),
      equippedName: root.querySelector('#equipped-name'), shipPanel: root.querySelector('#ship-panel'),
      shipState: root.querySelector('#ship-state'), shipTitle: root.querySelector('#ship-title'), shipDesc: root.querySelector('#ship-desc'), shipAction: root.querySelector('#ship-action'),
      menu: root.querySelector('#planet-menu'), menuBody: root.querySelector('#menu-body'), menuTitle: root.querySelector('#menu-title'),
      pointerPrompt: root.querySelector('#pointer-prompt'), arrival: root.querySelector('#arrival-overlay'),
      crosshair: root.querySelector('#crosshair'), launch: root.querySelector('#launch-sequence'), minimap: root.querySelector('#minimap'),
      modeLabel: root.querySelector('#mode-label'),
    };
    this.hudRefs.shipAction.addEventListener('click', () => this.summonShip());
    root.querySelector('#begin-exploration').addEventListener('click', () => this.beginExploration());
    root.querySelector('#menu-close').addEventListener('click', () => this.closeMenu());
    root.querySelector('#respawn').addEventListener('click', () => this.respawn());
    root.querySelectorAll('#menu-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => this.openMenu(b.dataset.tab)));
    this.bindSurfaceClicks();
  }

  buildScene() {
    const wrap = this.root.querySelector('#planet-canvas-wrap');
    const renderer = new THREE.WebGLRenderer({ antialias: state.settings.quality !== 'low', powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(state.settings.quality === 'low' ? 1 : 1.65, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = state.settings.quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    wrap.appendChild(renderer.domElement);
    this.renderer = renderer;
    const scene = new THREE.Scene();
    this.scene = scene;
    const camera = new THREE.PerspectiveCamera(70, 1, 0.08, 5200);
    camera.rotation.order = 'YXZ';
    scene.add(camera);
    this.camera = camera;

    const edits = state.getEdits(this.planetKey);
    const chopped = new Set(state.data.progress.chopped?.[this.planetKey] || []);
    const terrain = new TerrainWorld(this.planet, this.terrainSeed, { edits, chopped });
    this.terrain = terrain;
    terrain.buildInitial(0, 0);
    scene.add(terrain.group);

    this.sky = new SkySystem(scene, this.planet, this.system, this.site, { palette: terrain.palette });
    this.ecosystem = new SurfaceEcosystem(scene, terrain, this.planet, this.system, this.site);
    terrain.chopped = this.ecosystem.chopped;

    const spawnGround = terrain.findGround(0, 0, 200, 220) ?? terrain.heightAt(0, 0);
    this.playerPos = new THREE.Vector3(0, spawnGround + 0.05, 0);
    this.spawnPoint = this.playerPos.clone();
    this.velocity.set(0, 0, 0);
    this.onGround = true;
    this.fly = false;
    this.gravityScale = this.planet.gravity ?? 1;
    this.yaw = Math.PI * 0.75;
    this.pitch = -0.035;
    this.camera.position.copy(this.playerPos).add(new THREE.Vector3(0, EYE_HEIGHT, 0));
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.toolRig = this.buildToolRig();
    this.toolRig.visible = false;
    this.camera.add(this.toolRig);
    const heldLight = new THREE.PointLight('#ffe1b6', 8, 9, 1.6);
    heldLight.position.set(0.26, -0.22, -0.45);
    this.camera.add(heldLight);
    this.heldLight = heldLight;

    this.resize();
    this.addResize();
    this.sky.update(this.initialDays, camera, 0);
    if (this.planet.id === 'earth') {
      const w = this.sky.weather;
      w.type = 'clear'; w.label = '晴朗'; w.targetCover = 0.28; w.cover = 0.25;
      w.targetPrecipitation = 0; w.precipitation = 0; w.targetStorm = 0; w.storm = 0;
      w.lastPeriod = Math.floor(this.initialDays * 3.5);
    }
    this.updateCamera(0);
  }

  buildToolRig() {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#536a71', metalness: 0.9, roughness: 0.34, emissive: '#0d2026', emissiveIntensity: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1b2b30', metalness: 0.6, roughness: 0.5 });
    const gold = new THREE.MeshStandardMaterial({ color: '#b99a5d', metalness: 0.92, roughness: 0.24 });
    const glow = new THREE.MeshBasicMaterial({ color: '#8af1ff', toneMapped: false });
    // Compact wrist-mounted field gauntlet, seen from the upper right of the view.
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.42), new THREE.MeshStandardMaterial({ color: '#33474d', roughness: 0.65, metalness: 0.45 }));
    forearm.position.set(0, -0.06, 0.09);
    forearm.rotation.x = -0.1;
    group.add(forearm);
    const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.09, 0.14, 8), metal);
    bracer.rotation.x = Math.PI / 2;
    bracer.position.set(0, 0.01, -0.11);
    group.add(bracer);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095 - i * 0.008, 0.0075, 4, 18), i === 1 ? gold : glow);
      ring.position.set(0, 0.01, -0.09 + i * 0.035);
      group.add(ring);
    }
    // Short projector prism and glowing muzzle.
    const projector = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.062, 0.23, 8), metal);
    projector.rotation.x = Math.PI / 2;
    projector.position.set(0, 0.035, -0.3);
    group.add(projector);
    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.044, 0.06, 10), gold);
    emitter.rotation.x = Math.PI / 2;
    emitter.position.set(0, 0.035, -0.44);
    group.add(emitter);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.032, 14), glow);
    lens.position.set(0, 0.035, -0.472);
    lens.rotation.y = Math.PI;
    group.add(lens);
    // Floating energy ring and palm display.
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.003, 4, 24), glow);
    halo.position.set(0, 0.032, -0.52);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.034, 0), glow);
    core.position.set(0.08, 0.095, -0.1);
    group.add(core);
    const screenMat = new THREE.MeshBasicMaterial({ color: '#70e9ff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.135, 0.062), screenMat);
    screen.position.set(0, 0.082, 0.08);
    screen.rotation.x = -1.0;
    group.add(screen);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.1, 0.14), dark);
    hand.position.set(-0.015, -0.11, 0.22);
    hand.rotation.x = 0.1;
    group.add(hand);
    for (let i = 0; i < 3; i++) {
      const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.048, 0.05), dark);
      knuckle.position.set(-0.035 + i * 0.035, -0.155, 0.26);
      group.add(knuckle);
    }
    group.position.set(0.49, -0.5, -0.82);
    group.rotation.set(0.14, -0.16, 0.02);
    group.scale.setScalar(0.58);
    group.userData = { core, ring: halo, glow, lens, screenMat, halo };
    return group;
  }

  bindSurfaceClicks() {
    const wrap = this.root.querySelector('#planet-canvas-wrap');
    wrap.addEventListener('click', () => {
      if (!this.started || this.menuOpen || this.dead) return;
      if (!document.pointerLockElement) this.requestLook();
    });
    wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLook() {
    if (this.menuOpen || this.dead) return;
    try {
      const promise = this.renderer.domElement.requestPointerLock?.();
      if (promise?.catch) promise.catch(() => toast('浏览器阻止了鼠标锁定，点击画面重试', 'error'));
    } catch { /* optional */ }
  }

  beginExploration() {
    this.started = true;
    this.everStarted = true;
    this.root.classList.remove('pre-arrival');
    if (this.toolRig) this.toolRig.visible = true;
    this.hudRefs.arrival.classList.add('hidden-arrival');
    setTimeout(() => { if (this.hudRefs.arrival) this.hudRefs.arrival.style.display = 'none'; }, 700);
    this.requestLook();
    toast(`已着陆 · ${this.planet.name} / ${this.site.lat.toFixed(1)}°${this.site.lat >= 0 ? 'N' : 'S'}`, 'success', 2800);
    const controls = this.root.querySelector('#control-overlay');
    controls.classList.remove('hidden-controls');
    setTimeout(() => controls.classList.add('hidden-controls'), 11000);
    this.handleDirectiveXp(120, '初抵地表');
  }

  bindEvents() {
    const add = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this._handlers.push([target, type, fn, opts]);
    };
    add(window, 'resize', () => this.resize());
    add(window, 'keydown', (e) => this.onKeyDown(e));
    add(window, 'keyup', (e) => this.keys.delete(e.code));
    add(document, 'mousemove', (e) => this.onMouseMove(e));
    add(document, 'mousedown', (e) => { if (!document.pointerLockElement) return; this.mouseButtons.add(e.button); if (e.button === 0) this.tryPrimaryAction(); });
    add(document, 'mouseup', (e) => this.mouseButtons.delete(e.button));
    add(document, 'pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer?.domElement;
      this.hudRefs.pointerPrompt?.classList.toggle('show', !locked && this.started && !this.menuOpen && !this.dead);
    });
    add(document, 'wheel', (e) => {
      if (!document.pointerLockElement) return;
      this.cycleTool(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    add(window, 'blur', () => { this.keys.clear(); this.mouseButtons.clear(); });
    this._onOpenCommands = () => this.releaseInput();
    window.addEventListener('spacerealm:open-commands', this._onOpenCommands);
    this._handlers.push([window, 'spacerealm:open-commands', this._onOpenCommands]);
    this._onNav = () => { this.saveProgress(); };
    window.addEventListener('beforeunload', this._onNav);
    this._handlers.push([window, 'beforeunload', this._onNav]);
  }

  releaseInput() {
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.menuOpen = true;
    this.keys.clear();
  }

  resumeInput() {
    this.menuOpen = false;
    if (!this.dead && this.started) this.requestLook();
  }

  onKeyDown(e) {
    if (isTyping(e)) return;
    const code = e.code;
    if (!this.started) {
      if (code === 'Enter' || code === 'Space') this.beginExploration();
      return;
    }
    if (code === 'Escape') {
      e.preventDefault();
      if (this.menuOpen) this.closeMenu();
      else this.openMenu('system');
      return;
    }
    if (this.menuOpen) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'KeyF'].includes(code)) {
      this.keys.add(code);
      if (code === 'Space') e.preventDefault();
      if (code === 'KeyF') this.toggleFlight();
    }
    if (code === 'KeyC') { e.preventDefault(); this.openMenu('craft'); }
    else if (code === 'KeyK') { e.preventDefault(); this.openMenu('cultivate'); }
    else if (code === 'Tab') { e.preventDefault(); this.openMenu('inventory'); }
    else if (code === 'KeyE') this.interact();
    else if (code === 'KeyV') this.summonShip();
    else if (code === 'KeyM') this.openGalaxyMap();
    else if (code === 'KeyQ') { e.preventDefault(); this.psychicPulse(); }
    else if (code === 'KeyH') { this.root.querySelector('#control-overlay')?.classList.toggle('hidden-controls'); }
    else if (/^Digit[1-8]$/.test(code)) this.selectToolByIndex(Number(code.slice(5)) - 1);
    else if (code === 'KeyT') this.cycleTime();
  }

  onMouseMove(e) {
    if (!document.pointerLockElement || this.menuOpen || this.dead) return;
    const sens = (state.settings.sensitivity || 1) * 0.0017;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens * (state.settings.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.45, 1.45);
  }

  addResize() {
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.root.querySelector('#planet-canvas-wrap'));
  }

  resize() {
    if (!this.renderer) return;
    const wrap = this.root?.querySelector('#planet-canvas-wrap');
    if (!wrap) return;
    const w = wrap.clientWidth || window.innerWidth;
    const h = wrap.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loop() {
    let prev = performance.now();
    const tick = (now) => {
      if (this.disposed) return;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      this.timeDays = this.app.tickSimulation(now);
      this.dt = dt;
      this.update(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  update(dt) {
    if (this.started && !this.menuOpen && !this.dead) this.updatePlayer(dt);
    this.updateCamera(dt);
    this.updateAim();
    if (this.started && !this.menuOpen && !this.dead) this.handleHeldActions(dt);
    const skyData = this.sky.update(this.timeDays, this.camera, dt);
    this.ecosystem.update(dt, this.playerPos, skyData.daylight, this.sky.weather.cover);
    this.updateEffects(dt);
    this.updateShip(dt);
    if (this.started) this.updateHud(false);
    this.updateTimeDisplay();
    this.saveTimer += dt;
    if (this.saveTimer > 20) {
      this.saveTimer = 0;
      state.player.playSeconds = (state.player.playSeconds || 0) + 20;
      state.data.simTimeDays = this.timeDays;
      state.player.lastPlanetKey = this.planetKey;
      state.saveNow();
    }
    this.renderer.render(this.scene, this.camera);
  }

  updatePlayer(dt) {
    const p = state.player;
    const keys = this.keys;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let moveX = 0, moveZ = 0;
    if (keys.has('KeyW')) moveZ += 1;
    if (keys.has('KeyS')) moveZ -= 1;
    if (keys.has('KeyD')) moveX += 1;
    if (keys.has('KeyA')) moveX -= 1;
    const moving = moveX !== 0 || moveZ !== 0;
    const dir = new THREE.Vector3().addScaledVector(forward, moveZ).addScaledVector(right, moveX);
    if (dir.lengthSq() > 0) dir.normalize();
    const sprintKey = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const canSprint = state.creative || p.stamina > 1;
    const sprinting = moving && sprintKey && canSprint && !this.fly;
    let speed = (sprinting ? 8.2 : 4.4) * (this.speedMultiplier || 1);
    if (!state.creative && p.hp < p.maxHp * 0.3) speed *= 0.86;
    const inWater = this.playerPos.y < this.terrain.seaLevel + 0.35;
    if (inWater) speed *= 0.55;

    if (this.fly) {
      speed = (sprinting ? 28 : 14) * (this.speedMultiplier || 1);
      const forward3 = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const right3 = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const flyDir = new THREE.Vector3();
      if (keys.has('KeyW')) flyDir.add(forward3);
      if (keys.has('KeyS')) flyDir.sub(forward3);
      if (keys.has('KeyD')) flyDir.add(right3);
      if (keys.has('KeyA')) flyDir.sub(right3);
      if (keys.has('Space')) flyDir.y += 1;
      if (keys.has('ControlLeft') || keys.has('KeyC')) flyDir.y -= 1;
      if (flyDir.lengthSq() > 0) flyDir.normalize();
      const desired = flyDir.multiplyScalar(speed);
      this.velocity.lerp(desired, 1 - Math.pow(0.001, dt));
      if (!state.creative) {
        p.mana -= 2.4 * dt;
        if (p.mana <= 0) { p.mana = 0; this.fly = false; toast('法力耗尽，飞行中断', 'error'); }
      }
    } else {
      const desired = dir.clone().multiplyScalar(speed);
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, desired.x, 1 - Math.pow(0.0001, dt));
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, desired.z, 1 - Math.pow(0.0001, dt));
    }
    if (!this.fly) {
      // Stamina: sustained movement costs a little, sprinting costs a lot;
      // it keeps recovering whenever the traveller is not exerting themselves.
      if (!state.creative) {
        if (moving) p.stamina = Math.max(0, p.stamina - (sprinting ? 14 : 1.5) * dt);
        p.stamina = Math.min(p.maxStamina, p.stamina + (moving ? (sprinting ? 0.2 : 0.9) : 12) * dt);
      }
      // Jump.
      if (keys.has('Space') && this.onGround && !inWater && !this._spaceLatch) {
        this.velocity.y = 8.0;
        this.onGround = false;
        this._spaceLatch = true;
        if (!state.creative) p.stamina = Math.max(0, p.stamina - 5);
      }
      if (!keys.has('Space')) this._spaceLatch = false;
      if (inWater) {
        this.velocity.y = 0;
        this.playerPos.y = this.terrain.seaLevel + 0.28;
        this.onGround = false;
      } else {
        this.velocity.y -= 23 * (this.gravityScale ?? 1) * dt;
      }
    } else {
      this.velocity.y = 0;
    }

    // Horizontal collision with wall-sliding and step-up.
    const stepX = this.velocity.x * dt;
    const stepZ = this.velocity.z * dt;
    const tryMove = (dx, dz) => {
      const nx = this.playerPos.x + dx, nz = this.playerPos.z + dz;
      if (!this.isBlocked(nx, this.playerPos.y, nz)) {
        this.playerPos.x = nx; this.playerPos.z = nz; return true;
      }
      if (this.onGround && !this.fly) {
        const support = this.terrain.findGround(nx, nz, this.playerPos.y + 1.15, 1.6);
        if (support != null && support - this.playerPos.y <= 1.1 && !this.isBlocked(nx, support + 0.05, nz)) {
          this.playerPos.x = nx; this.playerPos.z = nz; this.playerPos.y = support + 0.02;
          return true;
        }
      }
      return false;
    };
    if (!tryMove(stepX, 0)) this.velocity.x *= 0.1;
    if (!tryMove(0, stepZ)) this.velocity.z *= 0.1;

    if (!this.fly) {
      this.playerPos.y += this.velocity.y * dt;
      const support = this.terrain.findGround(this.playerPos.x, this.playerPos.z, this.playerPos.y + 0.45, 36);
      if (support != null) {
        if (this.playerPos.y <= support + 0.04) {
          if (this.velocity.y < -17 && !state.creative) {
            const dmg = Math.min(85, Math.round((-this.velocity.y - 17) * 4.2));
            this.damage(dmg, '坠落冲击');
          }
          this.playerPos.y = support;
          this.velocity.y = 0;
          this.onGround = true;
        } else {
          this.onGround = false;
        }
      } else {
        this.onGround = false;
      }
      if (this.playerPos.y < -80) this.damage(999, '坠入深渊');
    } else {
      const headBlocked = this.isBlocked(this.playerPos.x, this.playerPos.y + this.velocity.y * dt + 0.2, this.playerPos.z);
      if (!headBlocked) this.playerPos.y += this.velocity.y * dt;
    }

    // Mana is replenished only from star-essence resources, never passively.
    if (!state.creative) {
      if (now_minus(this.lastDamageAt, 5000)) p.hp = Math.min(p.maxHp, p.hp + 0.45 * dt);
      p.stamina = clamp(p.stamina, 0, p.maxStamina);
      if (p.hp <= 0) this.die();
    } else {
      p.mana = Infinity;
      p.stamina = p.maxStamina;
    }
    if (state.creative) p.hp = p.maxHp;
  }

  isBlocked(x, feetY, z) {
    if (this.noclip) return false;
    if (this.terrain.solidAt(x, feetY + 0.45, z)) return true;
    if (this.terrain.solidAt(x, feetY + 1.25, z)) return true;
    const r = PLAYER_RADIUS * 0.8;
    return this.terrain.solidAt(x + r, feetY + 0.55, z) || this.terrain.solidAt(x - r, feetY + 0.55, z) ||
      this.terrain.solidAt(x, feetY + 0.55, z + r) || this.terrain.solidAt(x, feetY + 0.55, z - r);
  }

  updateCamera(dt) {
    if (!this.camera) return;
    let bob = 0;
    if (this.onGround && !this.fly && !this.menuOpen) {
      const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
      if (horizontal > 0.2) {
        this.walkPhase = (this.walkPhase || 0) + dt * (horizontal > 5 ? 10 : 7);
        bob = Math.sin(this.walkPhase) * 0.045 + Math.sin(this.walkPhase * 2) * 0.012;
      }
    }
    this.camera.position.set(this.playerPos.x, this.playerPos.y + EYE_HEIGHT + bob, this.playerPos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    if (this.toolRig) {
      const targetX = 0.49 + (this.fly ? 0.02 : 0) + Math.sin((this.walkPhase || 0)) * 0.004;
      this.toolRig.position.x += (targetX - this.toolRig.position.x) * 0.08;
      this.toolRig.position.y += (-0.5 + bob * 0.5 - this.toolRig.position.y) * 0.1;
    }
  }

  updateAim(force = false) {
    if (!this.camera || !this.started || this.menuOpen) { this.aimHit = null; return; }
    const now = performance.now();
    if (!force && now - (this.lastAimAt || 0) < 100) return;
    this.lastAimAt = now;
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    const objects = [...this.terrain.meshes, ...this.ecosystem.interactables];
    const hits = this.raycaster.intersectObjects(objects, true);
    if (!hits.length) { this.aimHit = null; return; }
    const hit = hits.find((h) => !(h.object.userData?.terrainChunk && h.object.name === 'terrain-far')) || hits[0];
    this.aimHit = hit;
    const hint = this.hudRefs.interact;
    if (!hint) return;
    if (this.nearShip()) {
      hint.innerHTML = `<b style="color:var(--cyan)">E</b> 登舰 · 星舰 SR-01 已就绪`;
      hint.classList.add('show');
    } else if (hit.object.userData?.treeKind) {
      hint.innerHTML = `<b style="color:var(--cyan)">左键</b> 采伐 ${this.ecosystem.chopped.has(hit.instanceId) ? '林木' : '林木'}`;
      hint.classList.add('show');
    } else if (hit.object.userData?.creatureRoot || hit.object.parent?.userData?.creature) {
      hint.innerHTML = `<b style="color:var(--cyan)">左键</b> 攻击 · 星鹿（中性生物）`;
      hint.classList.add('show');
    } else if (hit.object.userData?.terrainChunk) {
      const far = hit.object.name === 'terrain-far';
      const depth = this.terrain.heightAt(hit.point.x, hit.point.z) - hit.point.y;
      hint.innerHTML = far
        ? `<b style="color:var(--muted)">远景地形</b> · 超出可编辑网格，靠近后可采掘`
        : `<b style="color:var(--cyan)">左键</b> 采掘${depth > 1.5 ? '深层岩层' : '表层'} · <b style="color:var(--cyan)">右键</b> 凝铸`;
      hint.classList.add('show');
    } else if (this.nearShip()) {
      hint.classList.add('show');
    } else {
      hint.classList.remove('show');
    }
  }

  handleHeldActions(dt) {
    if (this.mouseButtons.has(0) && performance.now() - this.lastAction > (this.currentWeapon().cooldown || 260)) {
      this.tryPrimaryAction();
    }
    if (this.mouseButtons.has(2) && performance.now() - this.lastSecondary > 300) {
      this.trySecondaryAction();
    }
  }

  currentWeapon() { return WEAPONS[state.player.equippedTool] || WEAPONS.cutter; }

  tryPrimaryAction() {
    if (this.menuOpen || !this.started || this.dead) return;
    const tool = this.currentWeapon();
    const now = performance.now();
    if (now - this.lastAction < (tool.cooldown || 250)) return;
    this.lastAction = now;
    this.updateAim(true);
    const hit = this.aimHit;
    if (!hit) return;
    this.animateToolFire();
    if (hit.object.userData?.treeKind) {
      const result = this.ecosystem.chopTreeAt(hit.object, hit.instanceId, hit.point, tool);
      this.spawnBeam(hit.point, '#89eeff');
      if (result?.fell) {
        const amount = result.wood;
        state.addItem('wood', amount);
        state.addItem('fiber', Math.ceil(amount * 0.4));
        this.gainXp(Math.round(amount * 4 + 12), '采伐林木');
        this.flashPickup(`木质纤维 +${amount} · 植物纤维 +${Math.ceil(amount * 0.4)}`);
        this.saveChopped();
        this.spawnDebris(hit.point, new THREE.Color('#9b744c'));
      } else {
        this.spawnDebris(hit.point, new THREE.Color('#8d6e4a'), 8);
      }
      return;
    }
    const creatureRoot = hit.object.userData?.creatureRoot || hit.object.parent?.userData?.creatureRoot || (hit.object.parent?.parent?.userData?.creatureRoot);
    if (creatureRoot) {
      const dmg = this.damagePower(tool.damage);
      const result = this.ecosystem.damageAnimal(creatureRoot, dmg);
      this.spawnBeam(hit.point, '#ffd57c');
      this.spawnDebris(hit.point, new THREE.Color('#c6a176'), 10);
      if (result) {
        if (result.killed) {
          state.addItem('bio', result.bio);
          this.gainXp(40, '生态样本');
          this.flashPickup(`异星孢子 +${result.bio}`);
          this.hudRefs.crosshair?.classList.add('hit');
          setTimeout(() => this.hudRefs.crosshair?.classList.remove('hit'), 190);
        } else {
          this.flashPickup('造成伤害 · 星鹿正在逃离');
        }
      }
      return;
    }
    if (!hit.object.userData?.terrainChunk) return;
    if (hit.object.name === 'terrain-far') { this.flashPickup('远景地形无法直接编辑 · 请靠近'); return; }
    this.mineTerrain(hit.point, hit.face?.normal, tool);
  }

  trySecondaryAction() {
    if (this.menuOpen || !this.started || this.dead) return;
    const now = performance.now();
    if (now - this.lastSecondary < 280) return;
    this.lastSecondary = now;
    this.updateAim(true);
    const hit = this.aimHit;
    if (!hit || !hit.object.userData?.terrainChunk) return;
    const cost = state.creative ? 0 : 1;
    const material = this.pickBuildMaterial();
    if (!material) { toast('没有可凝铸的地形材料（需要沃土或岩石）', 'error'); return; }
    if (!state.creative && !(state.player.inventory[material] > 0)) { toast('材料不足', 'error'); return; }
    if (!state.creative) state.removeItem(material, cost);
    const n = this.surfaceNormal(hit.point);
    const point = hit.point.clone().addScaledVector(n, 0.7);
    const radius = 0.9 + (this.currentWeapon().radius || 1) * 0.18;
    const edit = { x: point.x, y: point.y, z: point.z, r: radius, t: 'add', mat: material };
    this.applyTerrainEdit(edit);
    this.spawnBeam(hit.point, '#ffd57c');
    this.gainXp(4, '物质凝铸');
    this.animateToolFire();
  }

  pickBuildMaterial() {
    const inv = state.player.inventory;
    if (inv.dirt > 0) return 'dirt';
    if (inv.stone > 0) return 'stone';
    return state.creative ? 'stone' : null;
  }

  surfaceNormal(point) {
    const e = 0.5;
    const gx = this.terrain.sdfAt(point.x + e, point.y, point.z) - this.terrain.sdfAt(point.x - e, point.y, point.z);
    const gy = this.terrain.sdfAt(point.x, point.y + e, point.z) - this.terrain.sdfAt(point.x, point.y - e, point.z);
    const gz = this.terrain.sdfAt(point.x, point.y, point.z + e) - this.terrain.sdfAt(point.x, point.y, point.z - e);
    return new THREE.Vector3(gx, gy, gz).normalize();
  }

  applyTerrainEdit(edit) {
    this.terrain.addEdit(edit);
    state.addEdit(this.planetKey, edit);
    const hiddenTrees = this.ecosystem?.reactToEdit(edit) || 0;
    if (hiddenTrees) this.saveChopped();
  }

  mineTerrain(point, faceNormal, tool) {
    if (this.terrain.edits.length > 4200) { toast('本区域地形编辑记录已达上限', 'error'); return; }
    const n = this.surfaceNormal(point);
    const power = this.damagePower(1);
    const radius = Math.min(8.5, tool.radius * (1 + Math.log10(power + 1) * 0.16));
    const center = point.clone().addScaledVector(n, -radius * 0.38);
    const edit = { x: center.x, y: center.y, z: center.z, r: radius, t: 'dig' };
    this.applyTerrainEdit(edit);
    state.player.blocksMined++;
    const resource = this.rollResource(center, n);
    const count = Math.max(1, Math.round((tool.yield || 1) * (1 + Math.random() * 1.3)));
    if (resource) {
      state.addItem(resource, count);
      const item = ITEMS[resource];
      this.flashPickup(`${item?.name || resource} +${count}`);
      const xp = Math.round((15 + (item?.value || 1) * 5 + tool.damage * 1.2) * (1 + state.player.level * 0.018));
      this.gainXp(xp, '采掘');
    }
    this.spawnBeam(point, '#7fe9ff');
    this.spawnDebris(point, new THREE.Color(this.terrain.palette.rockDark), 16);
    this.hudRefs.crosshair?.classList.add('hit');
    setTimeout(() => this.hudRefs.crosshair?.classList.remove('hit'), 150);
    this.cameraShake = 0.08;
  }

  rollResource(point, normal) {
    const depth = this.terrain.heightAt(point.x, point.z) - point.y;
    const rng = new RNG(`${this.planetKey}:${Math.floor(point.x * 3)}:${Math.floor(point.y * 3)}:${Math.floor(point.z * 3)}`);
    const biome = this.terrain.biome;
    if (depth < 0.8) {
      if (biome === 'ice') return rng.chance(0.4) ? 'ice' : 'stone';
      if (biome === 'desert') return rng.chance(0.4) ? 'stone' : 'dirt';
      if (rng.chance(0.52)) return 'dirt';
      if (rng.chance(0.5)) return 'stone';
      if (rng.chance(0.4)) return 'fiber';
      return 'wood';
    }
    if (depth > 16) {
      if (rng.chance(0.02)) return 'exotic';
      if (rng.chance(0.09)) return 'crystal';
      if (rng.chance(0.14)) return 'titanium';
      if (rng.chance(0.3)) return 'iron';
      return 'stone';
    }
    if (rng.chance(biome === 'volcanic' ? 0.18 : 0.06)) return 'iron';
    if (rng.chance(0.025)) return 'crystal';
    if (rng.chance(0.035)) return 'titanium';
    if (biome === 'ice' && rng.chance(0.24)) return 'ice';
    return 'stone';
  }

  psychicPulse() {
    if (this.menuOpen || !this.started || this.dead) return;
    const p = state.player;
    if (!state.creative && p.mana < 20) { toast('法力不足 · 需要 20 点法力', 'error'); return; }
    const now = performance.now();
    if (now - (this.lastPulse || 0) < 900) return;
    this.lastPulse = now;
    this.updateAim(true);
    const hit = this.aimHit;
    if (!hit) { this.flashPickup('灵能脉冲已凝聚 · 未命中地形'); return; }
    if (!state.creative) p.mana -= 20;
    const point = hit.point;
    const radius = 3.2 + Math.min(5, Math.log10(this.damagePower(1)) * 1.6);
    const edit = { x: point.x, y: point.y - radius * 0.3, z: point.z, r: radius, t: 'dig' };
    this.applyTerrainEdit(edit);
    state.player.blocksMined++;
    if (hit.object.userData?.treeKind) this.ecosystem.chopTreeAt(hit.object, hit.instanceId, point, { damage: 40 });
    const resource = this.rollResource(point, new THREE.Vector3(0, 1, 0));
    if (resource) {
      const amount = 2 + Math.floor(Math.random() * 3);
      state.addItem(resource, amount);
      this.flashPickup(`${ITEMS[resource]?.name || resource} +${amount} · 灵能脉冲`);
    }
    this.gainXp(16, '灵能脉冲');
    this.spawnPulse(point, radius);
    this.spawnDebris(point, new THREE.Color('#9beaff'), 30);
    this.cameraShake = 0.2;
  }

  gainXp(amount, reason) {
    const p = state.player;
    const before = p.level;
    const res = state.addXp(amount);
    if (res.levels > 0) {
      this.handleLevelUp(res.levels);
    }
    this.updateHud(true);
    return res;
  }

  handleDirectiveXp(amount, reason) {
    const res = this.gainXp(amount, reason);
    if (res.levels > 0) toast(`境界提升 · ${realmForLevel(state.player.level).name}（LV.${state.player.level}）`, 'gold', 4500);
  }

  handleLevelUp(levels) {
    const p = state.player;
    const realm = realmForLevel(p.level);
    toast(`突破成功 · ${realm.name} · LV.${p.level} · 破坏力 ×${this.damagePower(1).toFixed(2)}`, 'gold', 5200);
    this.spawnPulse(this.playerPos.clone().add(new THREE.Vector3(0, 1, 0)), 4);
    if (!state.creative) {
      p.hp = p.maxHp;
      p.mana = p.maxMana;
      p.stamina = p.maxStamina;
    }
    this.updateHotbar();
  }

  damagePower(base) {
    return base * powerMultiplier(state.player.level);
  }

  animateToolFire() {
    if (!this.toolRig) return;
    this.toolRecoil = 1;
  }

  updateEffects(dt) {
    if (this.toolRecoil) {
      this.toolRecoil = Math.max(0, this.toolRecoil - dt * 5);
      this.toolRig.position.z = -0.82 - this.toolRecoil * 0.05;
      this.toolRig.rotation.x = 0.04 + this.toolRecoil * 0.09;
    }
    if (this.cameraShake) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 2);
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShake;
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShake * 0.5;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i];
      part.life -= dt;
      if (part.life <= 0) {
        this.scene.remove(part.mesh);
        part.mesh.geometry.dispose();
        part.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      part.mesh.position.addScaledVector(part.vel, dt);
      part.vel.y -= part.gravity * dt;
      const s = Math.max(0.01, part.life / part.maxLife);
      part.mesh.material.opacity = s;
      part.mesh.scale.setScalar(part.scale * (0.5 + s * 0.7));
    }
    if (this.beam) {
      this.beam.life -= dt;
      const mat = this.beam.line.material;
      mat.opacity = Math.max(0, this.beam.life / 0.16) * 0.9;
      if (this.beam.life <= 0) {
        this.scene.remove(this.beam.line);
        this.beam.line.geometry.dispose();
        mat.dispose();
        this.beam = null;
      }
    }
    if (this.pulses) {
      for (let i = this.pulses.length - 1; i >= 0; i--) {
        const pulse = this.pulses[i];
        pulse.life -= dt;
        pulse.mesh.scale.addScalar(dt * pulse.expand);
        pulse.mesh.material.opacity = Math.max(0, pulse.life / pulse.maxLife) * 0.55;
        if (pulse.life <= 0) {
          this.scene.remove(pulse.mesh);
          pulse.mesh.geometry.dispose();
          pulse.mesh.material.dispose();
          this.pulses.splice(i, 1);
        }
      }
    }
  }

  spawnBeam(point, color = '#7fe9ff') {
    if (this.beam) {
      this.scene.remove(this.beam.line);
      this.beam.line.geometry.dispose();
      this.beam.line.material.dispose();
      this.beam = null;
    }
    const start = this.camera.position.clone().add(new THREE.Vector3(0.28, -0.2, -0.6).applyQuaternion(this.camera.quaternion));
    const geo = new THREE.BufferGeometry().setFromPoints([start, point]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.scene.add(line);
    this.beam = { line, life: 0.16 };
  }

  spawnDebris(point, color, count = 12) {
    const geo = new THREE.IcosahedronGeometry(0.055, 0);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo.clone(), mat.clone());
      mesh.position.copy(point);
      this.scene.add(mesh);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3.5 + 1, (Math.random() - 0.5) * 4);
      const s = 0.5 + Math.random() * 1.6;
      mesh.scale.setScalar(s);
      this.particles.push({ mesh, vel, gravity: 8, life: 0.5 + Math.random() * 0.6, maxLife: 1.1, scale: s });
    }
  }

  spawnPulse(point, radius) {
    const geo = new THREE.SphereGeometry(1, 20, 12);
    const mat = new THREE.MeshBasicMaterial({ color: '#93f5ff', transparent: true, opacity: 0.55, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    mesh.scale.setScalar(0.3);
    this.scene.add(mesh);
    if (!this.pulses) this.pulses = [];
    this.pulses.push({ mesh, life: 0.7, maxLife: 0.7, expand: radius * 3.2 });
  }

  flashPickup(text) {
    const node = this.hudRefs.interact;
    if (!node) return;
    const toastEl = this.root.querySelector('#planet-toast');
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(this._pickupTimer);
    this._pickupTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
  }

  updateTimeDisplay() {
    if (!this.hudRefs.date) return;
    const days = this.timeDays;
    const year = 2187;
    const dayOfYear = Math.floor(days % 365.25);
    const dateText = `星历 ${year} · 第 ${String(dayOfYear + 1).padStart(3, '0')} 日`;
    if (this.hudRefs.date.textContent !== dateText) this.hudRefs.date.textContent = dateText;
  }

  updateHud(force = false) {
    const now = performance.now();
    if (!force && now - this.lastHud < 150) return;
    this.lastHud = now;
    const p = state.player;
    const realm = realmForLevel(p.level);
    const xp = xpProgress(p);
    const refs = this.hudRefs;
    if (!refs.time) return;
    this.root?.classList.toggle('creative-mode', state.creative);
    const sky = this.sky?.lastSky;
    const sunAlt = sky?.sun.altitude ?? 20;
    // Local clock derived from the real sun azimuth.
    let az = sky ? Math.atan2(sky.sun.direction.x, -sky.sun.direction.z) : 0;
    if (az < 0) az += TAU;
    let hour = az / TAU * 24;
    const hh = Math.floor(hour % 24), mm = Math.floor((hour % 1) * 60);
    refs.time.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const weather = this.sky?.weather;
    const temp = Math.round((this.planet.tempC ?? 15) + (sunAlt > 0 ? sunAlt * 0.18 : sunAlt * 0.12) + (weather?.cover || 0) * 2);
    refs.weather.textContent = `${WEATHER_ICONS[weather?.type] || '☀'} ${weather?.label || '晴朗'} · 体感 ${temp}°C`;
    refs.realm.textContent = realm.name;
    refs.level.textContent = `LV.${String(p.level).padStart(2, '0')}`;
    refs.realmDesc.textContent = realm.desc;
    refs.xp.style.width = `${xp.percent}%`;
    refs.xpText.textContent = `${fmtNumber(p.xp)} / ${fmtNumber(xp.need)} XP`;
    const hpVal = Math.ceil(p.hp), mpVal = state.creative ? '∞' : Math.ceil(p.mana), spVal = state.creative ? p.maxStamina : Math.ceil(p.stamina);
    refs.hp.style.width = `${state.creative ? 100 : clamp(p.hp / p.maxHp * 100, 0, 100)}%`;
    refs.mp.style.width = state.creative ? '100%' : `${clamp(p.mana / p.maxMana * 100, 0, 100)}%`;
    refs.sp.style.width = state.creative ? '100%' : `${clamp(p.stamina / p.maxStamina * 100, 0, 100)}%`;
    refs.hpV.textContent = `${hpVal} / ${p.maxHp}`;
    refs.mpV.textContent = `${mpVal} / ${state.creative ? '∞' : p.maxMana}`;
    refs.spV.textContent = `${spVal} / ${p.maxStamina}`;
    refs.coord.textContent = `LAT ${this.site.lat.toFixed(2)}° · LON ${this.site.lon.toFixed(2)}° · ${this.terrain.biome.toUpperCase()}`;
    const alt = this.playerPos.y - this.terrain.seaLevel;
    refs.alt.textContent = `ALT ${alt.toFixed(1)} M · GRID ${Math.floor(this.playerPos.x / CHUNK_SIZE)} / ${Math.floor(this.playerPos.z / CHUNK_SIZE)}`;
    const compass = this.compassHeading();
    const compassEl = this.root.querySelector('.compass');
    if (compassEl) {
      const cardinal = CARDINALS[Math.round(compass / 45) % 8];
      compassEl.innerHTML = `<span>${Math.round(compass).toString().padStart(3, '0')}°</span><span class="n">${cardinal}</span><span>ALT ${Math.round(alt)}M</span>`;
    }
    refs.power.textContent = `×${this.damagePower(1).toFixed(2)}`;
    const tool = this.currentWeapon();
    refs.weaponName.textContent = tool.name;
    refs.weaponDesc.textContent = `${tool.desc} · 半径 ${(tool.radius * (1 + Math.log10(this.damagePower(1) + 1) * 0.16)).toFixed(2)} m`;
    refs.weaponDmg.textContent = `DMG ${fmtNumber(this.damagePower(tool.damage), 0)}`;
    refs.equippedName.textContent = tool.name;
    refs.modeLabel.textContent = state.creative ? '造物模式 · 法力无限' : '生存模式';
    this.updateQuest();
    this.updateShipPanel();
    if (force) this.updateHotbar();
    if (force || now - this.lastMinimap > 950) {
      this.lastMinimap = now;
      this.drawMinimap();
    }
  }

  compassHeading() {
    let heading = (-this.yaw * 180 / Math.PI) % 360;
    if (heading < 0) heading += 360;
    return heading;
  }

  updateQuest() {
    const refs = this.hudRefs;
    if (!refs.questTitle) return;
    const p = state.player;
    if (p.blocksMined < 10) {
      refs.questProgress.textContent = `${String(Math.min(10, p.blocksMined)).padStart(2, '0')} / 10`;
      refs.questTitle.textContent = '采集星球样本';
      refs.questDesc.textContent = `用拓荒切割器破坏地形，获取资源。当前进度 ${p.blocksMined} / 10。法力脉冲（Q）可以更快地撕开岩层。`;
    } else if (p.level < 8) {
      refs.questProgress.textContent = `LV.${p.level} / 8`;
      refs.questTitle.textContent = '筑基 · 感应星舰信标';
      refs.questDesc.textContent = '继续采掘、合成与探索以积攒修为。达到炼气圆满（筑基 LV.8）后即可召唤个人星舰。';
    } else if (!this.shipGroup) {
      refs.questProgress.textContent = 'READY';
      refs.questTitle.textContent = '召唤星舰 SR-01';
      refs.questDesc.textContent = '你已踏入筑基。按 V 或点击右下角按钮，让星舰穿过云层降落在你面前。';
    } else {
      refs.questProgress.textContent = 'ORBIT';
      refs.questTitle.textContent = '登舰 · 进入近地轨道';
      refs.questDesc.textContent = '靠近星舰并按 E 登舰。起飞过程将无缝切至恒星系轨道，无需加载新场景。';
    }
  }

  updateShipPanel() {
    const refs = this.hudRefs;
    if (!refs.shipPanel) return;
    const unlocked = canSummonShip(state.player) || state.data.progress.shipUnlocked;
    refs.shipPanel.style.display = 'block';
    if (this.shipGroup) {
      refs.shipState.textContent = 'DOCKED';
      refs.shipTitle.textContent = '星舰 SR-01 · 已停靠';
      refs.shipDesc.textContent = '反重力阵列待命。靠近按 E 登舰，或点击按钮直接进入发射程序。';
      refs.shipAction.innerHTML = `${ICONS.ship} 登舰升空 <span style="opacity:.5">E</span>`;
      refs.shipAction.disabled = false;
    } else if (unlocked) {
      refs.shipState.textContent = 'READY';
      refs.shipTitle.textContent = '星舰 SR-01 · 待命轨道';
      refs.shipDesc.textContent = '坐标已同步。召唤后星舰将穿过云层降落在你面前。';
      refs.shipAction.innerHTML = `${ICONS.ship} 召唤星舰 <span style="opacity:.5">V</span>`;
      refs.shipAction.disabled = false;
    } else {
      refs.shipState.textContent = `LV.${state.player.level} / 8`;
      refs.shipTitle.textContent = '星舰 SR-01 · 筑基解锁';
      refs.shipDesc.textContent = '达到筑基境界方可召唤星舰。也可以使用 ~ 指令终端调用 /summonship 进行调试。';
      refs.shipAction.innerHTML = `未满足境界要求`;
      refs.shipAction.disabled = true;
    }
  }

  updateHotbar() {
    const hotbar = this.hudRefs.hotbar;
    if (!hotbar) return;
    hotbar.innerHTML = '';
    HOTBAR_TOOLS.forEach((id, i) => {
      const itemId = TOOL_ITEM[id];
      const owned = id === 'cutter' || (itemId && state.player.inventory[itemId] > 0);
      const slot = document.createElement('div');
      slot.className = `hotbar-slot ${state.player.equippedTool === id ? 'active' : ''}`;
      slot.innerHTML = `<span class="slot-num">${i + 1}</span><span class="item-glyph ${TOOL_GLYPH[id]}"></span>${owned ? '' : '<span class="slot-count" style="color:var(--muted-2);font-size:8px">×</span>'}`;
      if (!owned) slot.style.opacity = '0.38';
      slot.title = id === 'cutter' ? '拓荒切割器' : owned ? (ITEMS[itemId]?.name || id) : '未解锁 · 在合成终端制造';
      hotbar.appendChild(slot);
    });
  }

  selectToolByIndex(index) {
    const id = HOTBAR_TOOLS[index];
    if (!id) return;
    const itemId = TOOL_ITEM[id];
    const owned = id === 'cutter' || (itemId && state.player.inventory[itemId] > 0);
    if (!owned) { toast(`尚未拥有 ${ITEMS[itemId]?.name || id} · 打开合成终端（C）制造`, 'error'); return; }
    state.player.equippedTool = id;
    this.updateHotbar();
    this.updateHud(true);
    this.flashPickup(`已装备 · ${this.currentWeapon().name}`);
    this.updateToolRigColor();
    state.queueSave();
  }

  cycleTool(dir) {
    const owned = HOTBAR_TOOLS.filter((id) => id === 'cutter' || state.player.inventory[TOOL_ITEM[id]] > 0);
    if (!owned.length) return;
    let idx = owned.indexOf(state.player.equippedTool);
    idx = (idx + dir + owned.length) % owned.length;
    state.player.equippedTool = owned[idx];
    this.updateHotbar();
    this.updateHud(true);
    this.flashPickup(`已装备 · ${this.currentWeapon().name}`);
    state.queueSave();
  }

  updateToolRigColor() {
    if (!this.toolRig) return;
    const colors = { cutter: '#7fe9ff', stonePick: '#c9b183', ironPick: '#cfe8f0', plasmaDrill: '#5fdcff', pulseRifle: '#8fbaff', starblade: '#ffd27a', annihilator: '#dc9cff', terraformer: '#ffc76b' };
    this.toolRig.traverse((c) => {
      if (c.material?.toneMapped === false) c.material.color.set(colors[state.player.equippedTool] || '#7fe9ff');
    });
  }

  toggleFlight() {
    if (state.creative) {
      this.fly = !this.fly;
      this.velocity.y = 0;
      toast(this.fly ? '造物模式 · 反重力飞行已启用' : '反重力飞行已关闭', 'success', 1800);
      return;
    }
    if (!this.fly && state.player.mana < 8) { toast('法力不足，无法维持飞行', 'error'); return; }
    this.fly = !this.fly;
    this.velocity.y = 0;
    toast(this.fly ? '反重力飞行 · 持续消耗法力' : '反重力飞行已关闭', this.fly ? 'success' : '', 1800);
  }

  cycleTime() {
    const speeds = [0, 60, 600, 6000];
    const idx = speeds.indexOf(this.app.simSpeed);
    const next = speeds[(idx + 1) % speeds.length];
    this.app.setSimSpeed(next);
    toast(next === 0 ? '星历已暂停' : `星历流速 ×${next}`, 'success', 1800);
  }

  interact() {
    if (this.menuOpen) return;
    if (this.nearShip()) {
      this.launchToOrbit();
    } else {
      this.flashPickup('附近没有可交互的装置');
    }
  }

  nearShip() {
    return this.shipGroup && this.shipGroup.position.distanceTo(this.playerPos) < 7.5;
  }

  summonShip(force = false) {
    if (this.shipGroup) {
      if (this.nearShip()) this.launchToOrbit();
      else {
        toast('星舰已在附近待命，靠近后按 E 登舰', 'success');
        this.focusShipMarker = true;
      }
      return;
    }
    if (!canSummonShip(state.player) && !state.data.progress.shipUnlocked && !force) {
      const realm = realmForLevel(state.player.level);
      toast(`需要筑基境界方可召唤星舰 · 当前 ${realm.name}（LV.${state.player.level}）`, 'error', 4300);
      return;
    }
    if (force) state.data.progress.shipUnlocked = true;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const pos = this.playerPos.clone().addScaledVector(forward, 10.5);
    const ground = this.terrain.findGround(pos.x, pos.z, this.playerPos.y + 40, 80) ?? this.terrain.heightAt(pos.x, pos.z);
    const ship = createStarship({ scale: 0.92, landed: true });
    ship.position.set(pos.x, ground + 1.0 + 36, pos.z);
    ship.rotation.y = this.yaw + Math.PI * 0.65;
    ship.traverse((c) => { if (c.isMesh) c.castShadow = true; });
    this.scene.add(ship);
    this.shipGroup = ship;
    this.shipLanding = { start: performance.now(), dur: 2700, fromY: ground + 1.0 + 36, toY: ground + 1.0 };
    this.shipGround = ground;
    this.shipSummoned = true;
    this.shipTargetPos = new THREE.Vector3(pos.x, ground, pos.z);
    state.data.progress.shipUnlocked = true;
    state.stats.shipsSummoned++;
    state.queueSave();
    this.updateShipPanel();
    this.updateQuest();
    this.flashPickup('星舰 SR-01 正在穿越云层');
    const pulse = this.root.querySelector('#ship-pulse');
    pulse.classList.remove('active'); void pulse.offsetWidth; pulse.classList.add('active');
    toast('星舰信标已响应 · 反重力下降程序启动', 'success', 3500);
    // Point camera toward the descent if not in a menu.
    const dx = pos.x - this.playerPos.x, dz = pos.z - this.playerPos.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = 0.16;
  }

  updateShip(dt) {
    if (!this.shipGroup) return;
    if (this.shipLanding) {
      const s = this.shipLanding;
      const t = clamp((performance.now() - s.start) / s.dur, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.shipGroup.position.y = s.fromY + (s.toY - s.fromY) * ease;
      this.shipGroup.rotation.y += dt * (1 - t) * 0.2;
      if (t >= 1) {
        this.shipLanding = null;
        toast('星舰已降落 · 按 E 登舰', 'success', 3500);
      }
    }
    animateStarship(this.shipGroup, dt, this.shipLanding ? 0.9 : 0.12);
  }

  launchToOrbit() {
    if (!this.shipGroup) return;
    if (!this.started) return;
    if (document.pointerLockElement) document.exitPointerLock?.();
    const sequence = this.root.querySelector('#launch-sequence');
    sequence.classList.add('show');
    this.dead = false;
    this.menuOpen = true;
    this.updateShipPanel();
    const start = this.shipGroup.position.y;
    const startTime = performance.now();
    const animate = () => {
      const t = Math.min(1, (performance.now() - startTime) / 3600);
      const ease = t * t;
      this.shipGroup.position.y = start + ease * 46;
      this.shipGroup.rotation.x = Math.sin(t * Math.PI) * 0.25;
      if (t < 1) requestAnimationFrame(animate);
    };
    animate();
    const sub = this.root.querySelector('#launch-sub');
    setTimeout(() => { if (sub) sub.textContent = '穿越平流层 · 大气密度下降 · 轨道参数同步中'; }, 1500);
    setTimeout(() => {
      state.data.simTimeDays = this.timeDays;
      state.saveNow();
      this.app.navigate('system', {
        galaxyId: this.galaxy.id,
        systemId: this.systemMeta.id,
        takeoff: true,
        fromPlanetId: this.planet.id,
      });
    }, 2900);
  }

  openMenu(tab = this.menuTab) {
    if (!this.root) return;
    this.menuOpen = true;
    this.menuTab = tab;
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.keys.clear();
    this.hudRefs.menu.classList.add('open');
    this.root.querySelectorAll('#menu-tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    this.renderMenu(tab);
  }

  closeMenu() {
    this.menuOpen = false;
    this.hudRefs.menu.classList.remove('open');
    if (this.started && !this.dead) this.requestLook();
  }

  renderMenu(tab) {
    const titles = { inventory: '背包与装备', craft: '便携式合成终端', cultivate: '境界修炼矩阵', system: '系统与航行' };
    this.hudRefs.menuTitle.textContent = titles[tab] || '地表终端';
    const body = this.hudRefs.menuBody;
    if (tab === 'inventory') body.innerHTML = this.inventoryHtml();
    else if (tab === 'craft') body.innerHTML = this.craftHtml();
    else if (tab === 'cultivate') body.innerHTML = this.cultivationHtml();
    else body.innerHTML = this.systemHtml();
    this.bindMenuActions();
  }

  inventoryHtml() {
    const inv = state.player.inventory;
    const items = Object.entries(inv).filter(([, count]) => count > 0);
    const cats = {
      resources: ['dirt', 'stone', 'wood', 'fiber', 'iron', 'titanium', 'crystal', 'ice', 'bio', 'exotic', 'scrap'],
      tools: ['stonePick', 'ironPick', 'plasmaDrill', 'terraformer', 'pulseRifle', 'starblade', 'annihilator', 'beacon', 'singularityCore', 'shipDrive'],
      consumables: ['medkit', 'manaVial', 'ration'],
    };
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div class="equip-note">当前装备：<b style="color:var(--cyan)">${this.currentWeapon().name}</b> · 破坏力 ×${this.damagePower(1).toFixed(2)}</div><div class="tag">${state.creative ? '造物模式' : '生存模式'}</div></div>`;
    for (const [cat, ids] of Object.entries(cats)) {
      const list = ids.filter((id) => (inv[id] || 0) > 0);
      html += `<div class="inv-cat-title">${cat === 'resources' ? '资源 / RESOURCES' : cat === 'tools' ? '工具与科技 / EQUIPMENT' : '消耗品 / CONSUMABLES'}</div>`;
      if (!list.length) {
        html += `<div class="inv-empty">暂无${cat === 'tools' ? '工具，前往合成终端制造' : '物品'}</div>`;
        continue;
      }
      html += '<div class="menu-grid">';
      for (const id of list) {
        const item = ITEMS[id];
        if (!item) continue;
        const tool = item.tool || item.weapon;
        const canUse = item.usable;
        const equipped = state.player.equippedTool === (tool || item.weapon);
        html += `<div class="inv-node">
          <span class="item-glyph ${item.icon}"></span>
          <div class="inv-info"><div class="inv-name">${escapeHtml(item.name)} ${equipped ? '<span style="color:var(--cyan);font-size:7px">已装备</span>' : ''}</div><div class="inv-desc">${escapeHtml(item.desc)}</div></div>
          <div class="inv-count">${state.creative && item.craftable ? '∞' : inv[id]}</div>
          ${tool ? `<button class="use-item" data-equip="${id}">${equipped ? '已装备' : '装备'}</button>` : canUse ? `<button class="use-item" data-use="${id}">使用</button>` : ''}
        </div>`;
      }
      html += '</div>';
    }
    return html;
  }

  craftHtml() {
    const p = state.player;
    let html = '<div class="recipe-grid">';
    for (const r of RECIPES) {
      const locked = p.level < r.level;
      const costHtml = Object.entries(r.cost).map(([id, n]) => {
        const has = p.inventory[id] || 0;
        return `<span class="cost-chip ${has >= n ? 'ok' : 'bad'}">${ITEMS[id]?.name || id} ${has}/${n}</span>`;
      }).join('');
      const can = !locked && Object.entries(r.cost).every(([id, n]) => (p.inventory[id] || 0) >= n);
      html += `<div class="recipe-node ${locked ? 'locked' : ''}">
        <div class="recipe-top"><div><div class="recipe-name">${escapeHtml(r.name)}</div><div class="recipe-cat">${r.cat} · LV.${r.level}</div></div><span class="item-glyph ${ITEMS[r.out]?.icon || 'metal'}"></span></div>
        <div class="mini-note">${escapeHtml(ITEMS[r.out]?.desc || '')}</div>
        <div class="recipe-cost">${costHtml}</div>
        <button class="btn ${can ? 'primary' : 'ghost'} sm" data-craft="${r.id}" ${can ? '' : 'disabled'}>${locked ? `需 LV.${r.level}` : can ? '制造' : '材料不足'}</button>
      </div>`;
    }
    html += '</div><div class="craft-msg" id="craft-msg">合成终端可直接调用背包内资源，不需要工作台。</div>';
    return html;
  }

  cultivationHtml() {
    const p = state.player;
    const realm = realmForLevel(p.level);
    const xp = xpProgress(p);
    const next = nextRealm(p.level);
    return `<div class="cultivation-body">
      <div class="realm-tree">
        ${REALMS.map((r) => `
          <div class="realm-node ${p.level >= r.level ? 'unlocked' : ''} ${realm.name === r.name ? 'current' : ''}" style="color:${r.color}">
            <i class="realm-dot"></i>
            <div class="rn-info"><div class="rn-name">${r.name}</div><div class="rn-desc">${r.desc}</div></div>
            <span class="rn-level">LV.${r.level}</span>
          </div>
        `).join('')}
      </div>
      <div class="cultivation-stats">
        <div class="cult-hero">
          <div class="cult-realm">${realm.name}</div>
          <div class="cult-level">TRAVELER LEVEL ${p.level} · 修为 ${fmtNumber(p.xp)} / ${fmtNumber(xp.need)}</div>
          <div class="cult-power">当前破坏力倍率 ×${this.damagePower(1).toFixed(2)} · 破坏力仅通过武器释放</div>
          <div class="xp-bar" style="margin-top:13px"><i style="width:${xp.percent}%"></i></div>
        </div>
        <div class="cult-data">
          <div><span>生命上限</span><b>${p.maxHp}</b></div>
          <div><span>法力上限</span><b>${state.creative ? '∞' : p.maxMana}</b></div>
          <div><span>体力上限</span><b>${Math.round(p.maxStamina)}</b></div>
          <div><span>下一境界</span><b>${next ? `${next.name} · LV.${next.level}` : '宇宙主宰'}</b></div>
        </div>
        <div class="cult-note">
          境界每提升一级，所需修为以指数级增长，破坏力也以指数级增长。<br>
          修为来自采掘地形、采集生物样本、首次着陆与探索发现。<br>
          ${p.level < 8 ? '达到筑基境界（LV.8）后即可召唤星舰。' : '你已突破筑基，星舰信标已永久解锁。'}
        </div>
        ${state.creative ? '<div class="tag green">造物模式 · 法力无限 · 体力常满 · 不受伤害</div>' : ''}
      </div>
    </div>`;
  }

  systemHtml() {
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div>
        <div class="inv-cat-title">航行 / NAVIGATION</div>
        <div class="cult-note" style="margin-bottom:10px">${escapeHtml(this.system.name)} · ${escapeHtml(this.planet.name)}<br>着陆点 ${this.site.lat.toFixed(2)}° / ${this.site.lon.toFixed(2)}° · 种子 ${escapeHtml(this.terrainSeed.slice(-16))}</div>
        <button class="btn primary wide" id="menu-return-orbit" style="margin-bottom:8px">返回近地轨道</button>
        <button class="btn ghost wide" id="menu-open-galaxy" style="margin-bottom:8px">打开银河星图</button>
        <button class="btn ghost wide" id="menu-open-universe" style="margin-bottom:8px">返回宇宙索引</button>
        <button class="btn ghost wide" id="menu-open-settings" style="margin-bottom:8px">终端设置 / 游戏模式</button>
        <button class="btn ghost wide" id="menu-open-codex" style="margin-bottom:8px">星海档案</button>
        <button class="btn ghost wide" id="menu-open-commands">指令终端</button>
      </div>
      <div>
        <div class="inv-cat-title">地表数据 / SURFACE DATA</div>
        <div class="cult-data">
          <div><span>生物群系</span><b style="font-family:var(--font-cn);font-size:10px">${escapeHtml(this.terrain.biome)}</b></div>
          <div><span>天气</span><b style="font-family:var(--font-cn);font-size:10px">${escapeHtml(this.sky.weather.label)}</b></div>
          <div><span>海拔</span><b>${(this.playerPos.y - this.terrain.seaLevel).toFixed(1)} m</b></div>
          <div><span>地形改动</span><b>${this.terrain.edits.length}</b></div>
          <div><span>生态样本</span><b>${this.ecosystem.animals.length} 只大型生物</b></div>
          <div><span>星历流速</span><b>×${this.app.simSpeed}</b></div>
        </div>
        <div class="inv-cat-title" style="margin-top:17px">操作 / CONTROLS</div>
        <div class="settings-controls">
          <span class="kbd">WASD</span> 移动 · <span class="kbd">F</span> 反重力飞行<br>
          <span class="kbd">LMB</span> 采掘 · <span class="kbd">RMB</span> 凝铸 · <span class="kbd">Q</span> 灵能脉冲<br>
          <span class="kbd">V</span> 星舰 · <span class="kbd">E</span> 交互 · <span class="kbd">~</span> 指令
        </div>
      </div>
    </div>`;
  }

  bindMenuActions() {
    const body = this.hudRefs.menuBody;
    body.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => {
      const item = ITEMS[b.dataset.equip];
      const tool = item?.tool || item?.weapon;
      if (!tool) return;
      state.player.equippedTool = tool;
      state.queueSave();
      this.updateHotbar();
      this.updateHud(true);
      this.updateToolRigColor();
      this.renderMenu('inventory');
      toast(`已装备 ${item.name}`, 'success', 1800);
    }));
    body.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => this.useConsumable(b.dataset.use)));
    body.querySelectorAll('[data-craft]').forEach((b) => b.addEventListener('click', () => this.craft(b.dataset.craft)));
    body.querySelector('#menu-return-orbit')?.addEventListener('click', () => this.returnToOrbit());
    body.querySelector('#menu-open-galaxy')?.addEventListener('click', () => {
      state.data.simTimeDays = this.timeDays;
      state.saveNow();
      this.app.navigate('galaxy', { galaxyId: this.galaxy.id });
    });
    body.querySelector('#menu-open-universe')?.addEventListener('click', () => {
      state.data.simTimeDays = this.timeDays;
      state.saveNow();
      this.app.navigate('universe');
    });
    body.querySelector('#menu-open-settings')?.addEventListener('click', () => openSettings({ onModeChange: () => { this.updateHud(true); this.updateHotbar(); } }));
    body.querySelector('#menu-open-codex')?.addEventListener('click', openCodex);
    body.querySelector('#menu-open-commands')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('spacerealm:open-commands')));
  }

  useConsumable(id) {
    const p = state.player;
    if (!(p.inventory[id] > 0)) return;
    let msg = '';
    if (id === 'medkit') {
      if (p.hp >= p.maxHp) { toast('生命值已满', ''); return; }
      p.hp = Math.min(p.maxHp, p.hp + 45); state.removeItem(id, 1); msg = '生命 +45';
    } else if (id === 'manaVial') {
      if (state.creative) { toast('造物模式法力无限', ''); return; }
      p.mana = Math.min(p.maxMana, p.mana + 40); state.removeItem(id, 1); msg = '法力 +40';
    } else if (id === 'crystal') {
      if (state.creative) { toast('造物模式法力无限', ''); return; }
      p.mana = Math.min(p.maxMana, p.mana + 22);
      state.removeItem(id, 1);
      msg = '汲取星髓 · 法力 +22';
    } else if (id === 'ration') {
      p.stamina = Math.min(p.maxStamina, p.stamina + 35); p.hp = Math.min(p.maxHp, p.hp + 8); state.removeItem(id, 1); msg = '体力 +35';
    }
    if (msg) { this.flashPickup(msg); this.updateHud(true); this.renderMenu('inventory'); toast(msg, 'success', 1600); }
  }

  craft(id) {
    const recipe = RECIPES.find((r) => r.id === id);
    if (!recipe) return;
    const p = state.player;
    if (p.level < recipe.level) { toast(`需要达到 LV.${recipe.level}`, 'error'); return; }
    for (const [item, n] of Object.entries(recipe.cost)) {
      if ((p.inventory[item] || 0) < n) { toast('材料不足', 'error'); return; }
    }
    for (const [item, n] of Object.entries(recipe.cost)) state.removeItem(item, n);
    state.addItem(recipe.out, recipe.count);
    this.gainXp(12 + recipe.level * 4, '合成');
    const item = ITEMS[recipe.out];
    if (item?.tool || item?.weapon) state.player.equippedTool = item.tool || item.weapon;
    this.flashPickup(`合成完成 · ${item?.name || recipe.out}`);
    toast(`已制造 ${item?.name || recipe.out} ×${recipe.count}`, 'success', 2200);
    this.renderMenu('craft');
    this.updateHotbar();
    this.updateHud(true);
  }

  returnToOrbit() {
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.menuOpen = true;
    withCurtain('上升至近地轨道 · 同步恒星系', async () => {
      state.data.simTimeDays = this.timeDays;
      state.saveNow();
      this.app.navigate('system', { galaxyId: this.galaxy.id, systemId: this.systemMeta.id, fromSurface: true });
    }, 500);
  }

  drawMinimap() {
    const canvas = this.hudRefs.minimap;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.floor(130 * dpr);
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#071118';
    ctx.fillRect(0, 0, size, size);
    const radius = 96;
    const steps = 34;
    const px = this.playerPos.x, pz = this.playerPos.z;
    for (let j = 0; j < steps; j++) {
      for (let i = 0; i < steps; i++) {
        const x = px + (i / (steps - 1) - 0.5) * radius * 2;
        const z = pz + (j / (steps - 1) - 0.5) * radius * 2;
        const h = this.terrain.heightAt(x, z);
        const sea = this.terrain.seaLevel;
        let c;
        if (h < sea) c = `rgb(${18 + h * 0.2},${54 + h * 0.2},${68 + h * 0.2})`;
        else {
          const t = clamp((h - sea) / (this.terrain.snowLine + 20), 0, 1);
          const green = this.terrain.palette.grass;
          c = t > 0.7 ? '#c5d2d3' : t > 0.35 ? '#5a6155' : green;
        }
        ctx.fillStyle = c;
        ctx.fillRect((i / steps) * size, (j / steps) * size, size / steps + 1, size / steps + 1);
      }
    }
    // water and hills countour glints
    ctx.strokeStyle = 'rgba(127,233,255,.14)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.12 * i, 0, TAU); ctx.stroke();
    }
    // ship marker
    if (this.shipGroup) {
      const dx = (this.shipGroup.position.x - px) / (radius * 2) * size;
      const dz = (this.shipGroup.position.z - pz) / (radius * 2) * size;
      ctx.fillStyle = '#7fe9ff';
      ctx.beginPath();
      ctx.arc(size / 2 + dx, size / 2 + dz, 2.5 * dpr, 0, TAU);
      ctx.fill();
    }
    // player arrow (north-up, yaw rotates the view)
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-this.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7 * dpr);
    ctx.lineTo(4.2 * dpr, 5 * dpr);
    ctx.lineTo(0, 3 * dpr);
    ctx.lineTo(-4.2 * dpr, 5 * dpr);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,233,255,.5)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -12 * dpr); ctx.stroke();
    ctx.restore();
    // frame corners
    ctx.strokeStyle = 'rgba(127,233,255,.18)';
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }

  saveChopped() {
    if (!state.data.progress.chopped) state.data.progress.chopped = {};
    state.data.progress.chopped[this.planetKey] = [...this.ecosystem.chopped];
    state.queueSave();
  }

  openGalaxyMap() {
    if (document.pointerLockElement) document.exitPointerLock?.();
    state.data.simTimeDays = this.timeDays;
    state.saveNow();
    this.app.navigate('galaxy', { galaxyId: this.galaxy.id });
  }

  setWeather(type) {
    if (!this.planet.habitable && ['cloudy', 'overcast', 'rain', 'storm', 'snow'].includes(type)) {
      toast('该星球没有生命与云层，无法形成云雨天气', 'error');
      return false;
    }
    const map = {
      clear: ['晴朗', 0.16, 0.0, 0], cloudy: ['多云', 0.6, 0.04, 0], overcast: ['阴天', 0.82, 0.08, 0],
      rain: ['降雨', 0.72, 0.45, 0], storm: ['雷暴', 0.96, 0.82, 0.9], snow: ['降雪', 0.62, 0.5, 0],
      fog: ['浓雾', 0.7, 0.04, 0], dust: ['沙尘暴', 0.88, 0.5, 0.25], ash: ['火山灰', 0.84, 0.4, 0.3],
    };
    if (!map[type]) return false;
    const [label, cover, precip, storm] = map[type];
    const w = this.sky.weather;
    w.type = type; w.label = label; w.targetCover = cover; w.targetPrecipitation = precip; w.targetStorm = storm;
    w.lastPeriod = Math.floor(this.timeDays * 3.5);
    this.flashPickup(`天气控制 · ${label}`);
    return { label };
  }

  setTimeOfDay(mode) {
    const targetDay = mode === 'day';
    let bestDay = this.timeDays;
    let bestScore = Infinity;
    for (let i = 0; i < 160; i++) {
      const test = this.timeDays + i * 0.02;
      const data = computeSky(this.system, this.planet, test, this.site.lat, this.site.lon);
      const alt = data.sun.altitude;
      const score = targetDay ? Math.abs(alt - 38) : Math.abs(alt + (this.planet.id === 'earth' ? 20 : 8));
      if (score < bestScore) { bestScore = score; bestDay = test; }
      if (score < 1.5) break;
    }
    this.app.setSimDays(bestDay);
    this.timeDays = bestDay;
    this.sky.update(bestDay, this.camera, 0.016);
    this.updateHud(true);
  }

  teleportTo(x, y, z) {
    this.playerPos.set(x, y, z);
    this.velocity.set(0, 0, 0);
    const ground = this.terrain.findGround(x, z, y + 2, 30);
    if (ground != null) this.playerPos.y = ground + 0.1;
    this.terrain.buildInitial(x, z, 2);
    this.ecosystem.group.position.set(0, 0, 0);
    this.updateHud(true);
  }

  commandDig(radius = 3) {
    this.updateAim(true);
    let point, object = this.aimHit?.object;
    if (this.aimHit) point = this.aimHit.point.clone();
    else {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      point = this.camera.position.clone().addScaledVector(forward, 6);
    }
    if (object?.userData?.treeKind) this.ecosystem.chopTreeAt(object, this.aimHit.instanceId, point, { damage: 99 });
    const edit = { x: point.x, y: point.y - radius * 0.2, z: point.z, r: clamp(radius, 0.5, 12), t: 'dig' };
    this.applyTerrainEdit(edit);
    this.spawnPulse(point, radius);
    this.spawnDebris(point, new THREE.Color('#9beaff'), 26);
    state.player.blocksMined++;
    this.gainXp(8, '即时开掘');
    this.updateHud(true);
  }

  commandPlace(radius = 1.2) {
    this.updateAim(true);
    let point;
    if (this.aimHit) point = this.aimHit.point.clone().addScaledVector(this.aimHit.face?.normal || new THREE.Vector3(0, 1, 0), radius * 0.45);
    else {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      point = this.camera.position.clone().addScaledVector(forward, 6);
    }
    const edit = { x: point.x, y: point.y, z: point.z, r: clamp(radius, 0.3, 6), t: 'add', mat: 'stone' };
    this.applyTerrainEdit(edit);
    this.spawnPulse(point, radius * 0.6);
    this.gainXp(2, '凝铸');
    this.updateHud(true);
  }

  spawnCreatureNear() {
    const animal = this.ecosystem.animals.find((a) => a.userData.creature.alive);
    if (!animal) { toast('附近没有可召唤的生态样本', 'error'); return; }
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const pos = this.playerPos.clone().addScaledVector(forward, 8);
    const ground = this.terrain.findGround(pos.x, pos.z, this.playerPos.y + 20, 30) ?? this.terrain.heightAt(pos.x, pos.z);
    animal.position.set(pos.x, ground, pos.z);
    animal.userData.creature.timer = 2;
    toast('一只星鹿被信标吸引而来', 'success', 2000);
  }

  clearCreatures() {
    for (const a of this.ecosystem.animals) {
      a.userData.creature.alive = false;
      this.ecosystem.group.remove(a);
    }
    this.flashPickup('附近生物已静默');
  }

  onCommandOpen() {
    this.keys.clear();
    this.mouseButtons.clear();
    this.menuOpen = true;
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  onCommandClose() {
    this.menuOpen = false;
    this.hudRefs?.pointerPrompt?.classList.add('show');
  }

  saveProgress() {
    state.player.lastPlanetKey = this.planetKey;
    state.data.simTimeDays = this.timeDays;
    state.saveNow();
  }

  damage(amount, source = '环境') {
    if (state.creative || this.dead || this.god) return;
    const p = state.player;
    p.hp = Math.max(0, p.hp - amount);
    this.lastDamageAt = performance.now();
    if (amount > 5) {
      this.flashPickup(`受到 ${source} 伤害 -${Math.round(amount)}`);
      document.body.animate?.([{ filter: 'brightness(1)' }, { filter: 'brightness(.6)' }, { filter: 'brightness(1)' }], { duration: 180 });
    }
    if (p.hp <= 0) this.die();
    this.updateHud(true);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.menuOpen = true;
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.root.querySelector('#death-overlay').classList.add('show');
    this.keys.clear();
    this.mouseButtons.clear();
  }

  respawn() {
    const p = state.player;
    this.dead = false;
    this.menuOpen = false;
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    p.stamina = p.maxStamina;
    this.playerPos.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.sky.weather.lightning = 0;
    this.root.querySelector('#death-overlay').classList.remove('show');
    this.updateHud(true);
    this.requestLook();
    toast('着陆点重生 · 属性已恢复', 'success', 2600);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.saveProgress();
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._handlers.forEach(([t, type, fn, opts]) => t.removeEventListener(type, fn, opts));
    window.removeEventListener('spacerealm:open-commands', this._onOpenCommands);
    window.removeEventListener('beforeunload', this._onNav);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.sky?.dispose();
    this.ecosystem?.dispose();
    this.terrain?.dispose();
    this.renderer?.forceContextLoss?.();
    this.renderer?.dispose();
    this.root?.remove();
    clearTimeout(this._pickupTimer);
  }
}

function isTyping(e) {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable;
}

function now_minus(ts, ms) {
  return !ts || performance.now() - ts > ms;
}
