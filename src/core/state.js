import { addXp, maxHpFor, maxManaFor, maxStaminaFor, deriveLevelFromXp } from './progression.js';

const SAVE_KEY = 'spacerealm.save.v2';
const VERSION = 2;

export function newPlayer(mode = 'survival') {
  return {
    name: '旅行者',
    level: 1,
    xp: 0,
    hp: 100,
    maxHp: 100,
    mana: 60,
    maxMana: 60,
    stamina: 100,
    maxStamina: 100,
    equippedTool: 'cutter',
    inventory: {
      dirt: 8, stone: 12, wood: 6, fiber: 5, iron: 2, crystal: 1, ice: 0, titanium: 0, exotic: 0, bio: 2, scrap: 0,
      medkit: 1, manaVial: 1,
    },
    discovered: [],
    kills: 0,
    blocksMined: 0,
    playSeconds: 0,
    lastPlanetKey: null,
  };
}

export function defaultState() {
  return {
    version: VERSION,
    createdAt: Date.now(),
    settings: {
      mode: 'survival',
      quality: 'high',
      volume: 0.65,
      bloom: true,
      invertY: false,
      sensitivity: 1,
      subtitles: true,
    },
    universe: {
      galaxies: [],
      activeGalaxyId: null,
      lastSystemId: null,
      lastPlanetId: null,
      view: 'list',
    },
    player: newPlayer('survival'),
    progress: {
      visitedSystems: [],
      landedPlanets: [],
      codex: [],
      shipUnlocked: false,
      enteredGalaxies: [],
      sites: {},
      chopped: {},
    },
    planetEdits: {},
    simTimeDays: 87.42,
    stats: { galaxiesCreated: 0, lightYears: 0, shipsSummoned: 0, playSeconds: 0 },
    lastSavedAt: null,
  };
}

export class GameState {
  constructor() {
    this.data = this.load() || defaultState();
    this.listeners = new Set();
    this._saveTimer = null;
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== VERSION) return null;
      const base = defaultState();
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...(parsed.settings || {}) },
        universe: { ...base.universe, ...(parsed.universe || {}) },
        progress: { ...base.progress, ...(parsed.progress || {}) },
        player: { ...newPlayer(parsed.settings?.mode), ...(parsed.player || {}) },
        planetEdits: parsed.planetEdits || {},
        stats: { ...base.stats, ...(parsed.stats || {}) },
      };
    } catch (e) {
      console.warn('Save load failed', e);
      return null;
    }
  }

  get hasSave() { return this.data.universe.galaxies.length > 0; }
  get mode() { return this.data.settings.mode; }
  get settings() { return this.data.settings; }
  get stats() { return this.data.stats; }
  get progress() { return this.data.progress; }
  get creative() { return this.data.settings.mode === 'creative'; }
  get player() { return this.data.player; }
  get universe() { return this.data.universe; }
  get galaxies() { return this.data.universe.galaxies; }

  addGalaxy(galaxy) {
    this.data.universe.galaxies.unshift(galaxy);
    this.data.universe.activeGalaxyId = galaxy.id;
    this.data.stats.galaxiesCreated++;
    this.saveNow();
    this.emit('galaxies');
  }

  removeGalaxy(id) {
    this.data.universe.galaxies = this.data.universe.galaxies.filter((g) => g.id !== id);
    if (this.data.universe.activeGalaxyId === id) this.data.universe.activeGalaxyId = this.galaxies[0]?.id || null;
    this.saveNow();
    this.emit('galaxies');
  }

  findGalaxy(id) { return this.galaxies.find((g) => g.id === id) || null; }

  setMode(mode) {
    this.data.settings.mode = mode;
    const p = this.player;
    p.maxHp = maxHpFor(p.level);
    p.maxMana = maxManaFor(p.level);
    p.maxStamina = maxStaminaFor(p.level);
    if (mode === 'creative') {
      p.hp = p.maxHp;
      p.mana = Infinity;
      p.stamina = p.maxStamina;
    } else {
      if (!Number.isFinite(p.mana)) p.mana = p.maxMana;
      if (p.hp <= 0) p.hp = maxHpFor(p.level);
    }
    this.saveNow();
    this.emit('settings');
  }

  addXp(amount) {
    const result = addXp(this.player, amount);
    this.queueSave();
    return result;
  }

  addItem(id, count = 1) {
    this.player.inventory[id] = (this.player.inventory[id] || 0) + count;
    this.emit('inventory');
    this.queueSave();
  }

  removeItem(id, count = 1) {
    if ((this.player.inventory[id] || 0) < count) return false;
    this.player.inventory[id] -= count;
    if (this.player.inventory[id] <= 0) delete this.player.inventory[id];
    this.emit('inventory');
    this.queueSave();
    return true;
  }

  visitSystem(id) {
    if (!this.data.progress.visitedSystems.includes(id)) {
      this.data.progress.visitedSystems.push(id);
      this.emit('progress');
      this.queueSave();
      return true;
    }
    return false;
  }

  landPlanet(key) {
    if (!this.data.progress.landedPlanets.includes(key)) {
      this.data.progress.landedPlanets.push(key);
      this.emit('progress');
      this.queueSave();
      return true;
    }
    return false;
  }

  getEdits(key) { return this.data.planetEdits[key] || []; }

  addEdit(key, edit) {
    if (!this.data.planetEdits[key]) this.data.planetEdits[key] = [];
    const edits = this.data.planetEdits[key];
    edits.push(edit);
    if (edits.length > 5000) edits.splice(0, edits.length - 5000);
    this.queueSave();
  }

  updateSettings(patch) {
    Object.assign(this.data.settings, patch);
    this.emit('settings');
    this.saveNow();
  }

  setLast({ galaxyId, systemId, planetId } = {}) {
    if (galaxyId !== undefined) this.data.universe.activeGalaxyId = galaxyId;
    if (systemId !== undefined) this.data.universe.lastSystemId = systemId;
    if (planetId !== undefined) this.data.universe.lastPlanetId = planetId;
    this.queueSave();
  }

  queueSave(delay = 800) {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveNow(), delay);
  }

  saveNow() {
    clearTimeout(this._saveTimer);
    try {
      this.data.lastSavedAt = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('Save failed', e);
    }
  }

  reset() {
    localStorage.removeItem(SAVE_KEY);
    this.data = defaultState();
    this.emit('reset');
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  emit(type) { this.listeners.forEach((fn) => fn(type, this.data)); }
}

export const state = new GameState();

// Recompute derived resources if a save was written by an older balance pass.
(() => {
  const p = state.player;
  p.maxHp = maxHpFor(p.level);
  p.maxMana = maxManaFor(p.level);
  p.maxStamina = maxStaminaFor(p.level);
  if (p.hp <= 0) p.hp = p.maxHp;
  if (state.creative) { p.mana = Infinity; p.stamina = p.maxStamina; }
})();
