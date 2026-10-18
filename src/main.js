import './styles/fonts.js';
import './style.css';
import { state } from './core/state.js';
import { generateGalaxySystems } from './data/generator.js';
import { startGlobalStars } from './ui/visuals.js';
import { toast, withCurtain } from './ui/ui.js';
import { CommandConsole } from './commands.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { UniverseScreen } from './screens/UniverseScreen.js';
import { GalaxyScreen } from './screens/GalaxyScreen.js';
import { SystemScreen } from './screens/SystemScreen.js';
import { PlanetScreen } from './screens/PlanetScreen.js';

class SpaceRealmApp {
  constructor() {
    this.screenRoot = document.getElementById('screen-root');
    this.activeScreen = null;
    this.currentView = null;
    this.systemCache = new Map();
    this.simDays = state.data.simTimeDays ?? 87.42;
    this.simSpeed = 60;
    this.lastTick = performance.now();
    this.commands = new CommandConsole(this);
    this.screens = {
      home: HomeScreen,
      universe: UniverseScreen,
      galaxy: GalaxyScreen,
      system: SystemScreen,
      planet: PlanetScreen,
    };
  }

  init() {
    startGlobalStars(document.getElementById('global-stars'));
    window.addEventListener('spacerealm:open-galaxy', (e) => {
      if (!e.detail || !state.findGalaxy(e.detail)) return;
      withCurtain('建立量子链接', () => this.navigate('galaxy', { galaxyId: e.detail }), 420);
    });
    window.addEventListener('beforeunload', () => this.persist());
    document.addEventListener('fullscreenchange', () => {
      document.body.classList.toggle('is-fullscreen', !!document.fullscreenElement);
    });
    setInterval(() => this.persist(), 25000);
    this.showScreen('home');
    setTimeout(() => {
      document.getElementById('boot')?.classList.add('done');
    }, 900);
    document.getElementById('boot')?.addEventListener('click', () => document.getElementById('boot')?.classList.add('done'));
    // Restore the last simulation epoch immediately.
    state.data.simTimeDays = this.simDays;
    if (window.location.search.includes('autoplay=1') && state.hasSave) {
      // Optional quick loader for development / demos.
      setTimeout(() => this.navigate('universe'), 1000);
    }
  }

  showScreen(name, options = {}) {
    const ScreenClass = this.screens[name];
    if (!ScreenClass) throw new Error(`Unknown screen: ${name}`);
    if (this.activeScreen?.dispose) {
      try { this.activeScreen.dispose(); } catch (e) { console.warn('Screen dispose error', e); }
    }
    this.screenRoot.innerHTML = '';
    this.activeScreen = new ScreenClass(this);
    this.currentView = name;
    document.body.dataset.screen = name;
    try {
      this.activeScreen.mount(this.screenRoot, options);
      const mounted = this.screenRoot.querySelector('.screen');
      if (mounted) {
        setTimeout(() => {
          if (mounted.isConnected) {
            mounted.style.transition = 'none';
            mounted.style.opacity = '1';
            mounted.style.visibility = 'visible';
          }
        }, 1250);
      }
    } catch (e) {
      console.error(e);
      toast(`场景加载失败：${e.message}`, 'error', 5000);
      this.activeScreen = null;
    }
  }

  navigate(name, options = {}) {
    if (this.currentView === name && name === 'planet') {
      return;
    }
    this.simulateClockTick(performance.now());
    this.showScreen(name, options);
  }

  simulateClockTick(now = performance.now()) {
    const dt = Math.min(0.4, (now - this.lastTick) / 1000);
    this.simDays += dt * this.simSpeed / 86400;
    this.lastTick = now;
    return this.simDays;
  }

  tickSimulation(now = performance.now()) {
    return this.simulateClockTick(now);
  }

  setSimSpeed(speed) {
    this.simulateClockTick(performance.now());
    this.simSpeed = Math.max(0, Number(speed) || 0);
    state.data.simSpeed = this.simSpeed;
  }

  setSimDays(days) {
    this.simDays = Number(days) || this.simDays;
    this.lastTick = performance.now();
    state.data.simTimeDays = this.simDays;
    state.queueSave();
  }

  getGalaxySystems(galaxy) {
    if (!galaxy) return [];
    const key = `${galaxy.id}:${galaxy.seed}:${galaxy.systemCount}:${galaxy.lifeRate}`;
    if (!this.systemCache.has(key)) {
      this.systemCache.set(key, generateGalaxySystems(galaxy));
    }
    return this.systemCache.get(key);
  }

  persist() {
    try {
      this.simulateClockTick(performance.now());
      state.data.simTimeDays = this.simDays;
      if (this.activeScreen?.planetKey) state.player.lastPlanetKey = this.activeScreen.planetKey;
      state.saveNow();
    } catch (e) { console.warn('Persist error', e); }
  }
}

const app = new SpaceRealmApp();
window.__SPACEREALM__ = app;
window.spacerealm = { app, state };
app.init();

window.addEventListener('error', (event) => {
  console.error('[SpaceRealm]', event.error || event.message);
  if (event.error?.message?.includes('memory') || event.error?.message?.includes('WebGL')) {
    toast('渲染核心出现异常，请在设置中降低画质', 'error', 5000);
  }
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[SpaceRealm] unhandled', event.reason);
});
