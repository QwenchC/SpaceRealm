import * as THREE from 'three';
import { state } from '../core/state.js';
import { fmtNumber } from '../core/utils.js';
import { ICONS, openSettings, openCodex, toggleFullscreen, withCurtain, toast } from '../ui/ui.js';
import { createPlanetMesh, loadEarthTextures } from '../render/planet-visuals.js';

const EARTH_LOOK = {
  id: 'earth', name: '地球', type: 'terrestrial', biome: 'temperate', atmosphere: 1,
  habitable: true, radiusKm: 6371, paint: ['#1e4b78', '#38744e', '#849c55', '#b7c9b4'],
  seed: 'sol-earth',
};

export class HomeScreen {
  constructor(app) {
    this.app = app;
    this.root = null;
    this.disposers = [];
  }

  mount(parent) {
    const saved = state.hasSave;
    const latest = state.galaxies[0];
    const root = document.createElement('section');
    root.className = 'screen home-screen';
    root.innerHTML = `
      <header class="site-header">
        <div class="brand">
          <div class="brand-mark"></div>
          <div class="brand-text"><span class="brand-name">SPACE REALM</span><span class="brand-sub">星 海 境 界</span></div>
        </div>
        <nav class="site-nav">
          <button class="nav-link active" data-nav="universe">宇宙</button>
          <button class="nav-link" data-nav="codex">档案</button>
          <button class="nav-link" data-nav="commands">指令</button>
        </nav>
        <div class="header-right">
          <div class="header-meta"><span class="signal"><i></i><i></i><i></i></span><span>QUANTUM LINK · STABLE</span></div>
          <button class="icon-btn" id="home-settings" title="设置">${ICONS.settings}</button>
          <button class="icon-btn" id="home-fullscreen" title="全屏">${ICONS.fullscreen}</button>
        </div>
      </header>
      <div class="home-nebula"></div>
      <div class="home-grid"></div>
      <div class="home-orb-wrap"><canvas id="home-orb-canvas"></canvas></div>
      <div class="home-orb-lines"><i></i></div>
      <div class="home-orb-info">
        <span class="oi-kicker">ORBITAL RELAY / TERRA</span>
        <span class="oi-name">盖亚 · 母星轨道</span>
        <span class="oi-data">ALT 358,000 KM · 实时昼夜映射</span>
      </div>
      <div class="home-side-index">
        <span class="active">01 · 母星地平线</span>
        <span>02 · 太阳系</span>
        <span>03 · 螺旋星图</span>
        <div class="rule"></div>
        <span>EPOCH 2187</span>
      </div>
      <div class="home-content">
        <div class="home-hero">
          <div class="home-kicker"><span class="line"></span><span>PROCEDURAL CELESTIAL SANDBOX · EPOCH 2187</span></div>
          <h1 class="home-title">SPACE<span class="outline">REALM</span></h1>
          <div class="home-title-cn">星 海 境 界</div>
          <p class="home-desc">在程序化生成的螺旋星系中醒来。以<em>修行</em>丈量星海，以<em>武器</em>重塑大地，<br class="desktop-br">驾驶星舰穿越无缝宇宙，让每一次昼夜更替都来自真实的星历计算。</p>
          <div class="home-actions">
            <button class="btn primary lg" id="start-game"><span>开始游戏</span>${ICONS.chevron}</button>
            ${saved ? `<button class="btn gold lg" id="continue-game">继续旅程</button>` : ''}
            <span class="corner-note">${saved ? `检测到 ${state.galaxies.length} 个已存星系<br>最新纪元 · ${latest ? latest.name : '未命名'}` : '无存档 · 将创建新的宇宙纪元<br>你的第一个星系将成为一切的起点'}</span>
          </div>
        </div>
        <footer class="home-footer">
          <div class="home-stats">
            <div class="home-stat"><b>${fmtNumber(state.galaxies.length, 0)}</b><span>已创造星系</span></div>
            <div class="home-stat"><b>${fmtNumber(state.data.progress.visitedSystems.length, 0)}</b><span>造访恒星系</span></div>
            <div class="home-stat"><b>${fmtNumber(state.player.level, 0)}</b><span>旅行者等级</span></div>
            <div class="home-stat"><b>1 : 1</b><span>太阳系比例</span></div>
            <div class="home-stat"><b>60×</b><span>星历加速</span></div>
          </div>
          <div class="home-build"><i></i><span>CORE BUILD 0.9.7 · 实时天体物理引擎</span></div>
        </footer>
      </div>
    `;
    parent.appendChild(root);
    this.root = root;

    root.querySelector('#start-game').addEventListener('click', () => this.start(false));
    root.querySelector('#continue-game')?.addEventListener('click', () => this.start(true));
    root.querySelector('#home-settings').addEventListener('click', () => openSettings({}));
    root.querySelector('#home-fullscreen').addEventListener('click', toggleFullscreen);
    root.querySelector('[data-nav="universe"]').addEventListener('click', () => this.start(false));
    root.querySelector('[data-nav="codex"]').addEventListener('click', openCodex);
    root.querySelector('[data-nav="commands"]').addEventListener('click', () => window.dispatchEvent(new CustomEvent('spacerealm:open-commands')));

    this.initOrb();
    requestAnimationFrame(() => root.classList.add('active'));
    setTimeout(() => document.getElementById('boot')?.classList.add('done'), 500);
  }

  start(continueJourney) {
    const last = state.data.universe;
    const galaxyId = last.activeGalaxyId;
    let target = { screen: 'universe' };
    if (continueJourney && galaxyId) {
      if (last.lastPlanetId) target = { screen: 'planet', options: { galaxyId, systemId: last.lastSystemId || 'sys-0', planetId: last.lastPlanetId } };
      else if (last.lastSystemId) target = { screen: 'system', options: { galaxyId, systemId: last.lastSystemId } };
      else target = { screen: 'galaxy', options: { galaxyId } };
    }
    withCurtain(continueJourney ? '载入旅行者航迹' : '正在展开宇宙', () => {
      if (target.screen === 'universe') this.app.navigate('universe', { openGalaxyId: continueJourney ? galaxyId : null });
      else this.app.navigate(target.screen, target.options);
    });
  }

  initOrb() {
    const container = this.root.querySelector('.home-orb-wrap');
    const canvas = this.root.querySelector('#home-orb-canvas');
    if (!container || !canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.15, 3.28);
    const pivot = new THREE.Group();
    pivot.rotation.z = THREE.MathUtils.degToRad(-23.4);
    pivot.rotation.y = -0.55;
    const planet = createPlanetMesh(EARTH_LOOK, { radius: 1 });
    pivot.add(planet);
    scene.add(pivot);

    const sunDir = new THREE.Vector3(-0.72, 0.48, 1.55).normalize();
    const sun = new THREE.DirectionalLight('#fff4dc', 5.2);
    sun.position.copy(sunDir).multiplyScalar(12);
    scene.add(sun);
    scene.add(new THREE.AmbientLight('#53718a', 0.42));
    const rim = new THREE.DirectionalLight('#78d8ff', 1.25);
    rim.position.set(-5, -2, -4);
    scene.add(rim);

    planet.traverse((obj) => {
      if (obj.userData.atmosphere) obj.userData.atmosphere.uniforms.uSunDirection.value.copy(sunDir);
      if (obj.userData.nightLights) obj.userData.nightLights.uniforms.uSunDirection.value.copy(sunDir);
    });
    loadEarthTextures();

    const resize = () => {
      const w = container.clientWidth || 600;
      const h = container.clientHeight || 600;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    this.orb = { renderer, scene, camera, planet, pivot, raf: 0 };
    let last = performance.now();
    const animate = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      pivot.rotation.y += dt * 0.018;
      planet.traverse((c) => { if (c.userData.cloudShell) c.rotation.y += dt * 0.007; });
      renderer.render(scene, camera);
      this.orb.raf = requestAnimationFrame(animate);
    };
    this.orb.raf = requestAnimationFrame(animate);
    this.disposers.push(() => {
      cancelAnimationFrame(this.orb.raf);
      observer.disconnect();
      renderer.forceContextLoss?.();
      renderer.dispose();
    });
  }

  dispose() {
    this.disposers.forEach((fn) => fn());
    this.disposers = [];
    this.root?.remove();
  }
}
