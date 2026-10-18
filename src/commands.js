import { state } from './core/state.js';
import { ITEMS, RECIPES, WEAPONS, TOOL_ORDER } from './core/items.js';
import { realmForLevel, xpToNext, powerMultiplier, maxHpFor } from './core/progression.js';
import { escapeHtml, fmtNumber, clamp } from './core/utils.js';
import { toast } from './ui/ui.js';
import { generateSystem } from './data/generator.js';

const CATEGORIES = {
  '核心': '帮助、存档与终端控制',
  '玩家': '修为、属性、模式与移动',
  '物品': '资源、装备与合成',
  '世界': '时间、天气、地形与环境',
  '航行': '星图、星球与星舰指令',
  '调试': '开发者与性能选项',
};

function normalize(str) { return String(str || '').trim().replace(/^\//, '').toLowerCase(); }

function findItem(token) {
  if (!token) return null;
  if (ITEMS[token]) return token;
  const t = token.toLowerCase();
  const byName = Object.entries(ITEMS).find(([, item]) => item.name.toLowerCase() === t || item.name === token);
  if (byName) return byName[0];
  const byPrefix = Object.keys(ITEMS).find((id) => id.toLowerCase().startsWith(t));
  return byPrefix || null;
}

export class CommandConsole {
  constructor(app) {
    this.app = app;
    this.root = null;
    this.log = null;
    this.input = null;
    this.history = [];
    this.historyIndex = 0;
    this.commands = [];
    this.open = false;
    this.registerCommands();
    this.build();
  }

  build() {
    const layer = document.getElementById('command-layer');
    const root = document.createElement('div');
    root.className = 'command-backdrop';
    root.innerHTML = `
      <div class="command-console">
        <div class="command-head"><span><b>SPACE REALM</b> · 星历指令终端 v2.4</span><span>输入 /help 查看全部指令 · ESC 关闭</span></div>
        <div class="command-log" id="command-log"></div>
        <div class="command-input-row"><span>❯</span><input class="command-input" id="command-input" autocomplete="off" spellcheck="false" placeholder="输入指令，例如 /help、/xp 500、/summonship"></div>
        <div class="command-hint"><span>↑↓ 历史 · TAB 补全 · ENTER 执行</span><span id="command-count">0 COMMANDS</span></div>
      </div>`;
    layer.appendChild(root);
    this.root = root;
    this.logEl = root.querySelector('#command-log');
    this.input = root.querySelector('#command-input');
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    root.addEventListener('mousedown', (e) => { if (e.target === root) this.close(); });
    window.addEventListener('keydown', (e) => this.onGlobalKey(e), true);
    window.addEventListener('spacerealm:open-commands', () => this.openConsole());
    this.print('星历终端已连接。权限等级：旅行者。', 'system');
    this.print('输入 <span class="cmd-echo">/help</span> 获取指令总览，或直接输入 <span class="cmd-echo">/commands</span>。', 'system');
  }

  onGlobalKey(e) {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (!this.open && (e.code === 'Backquote' || (e.key === '/' && !typing && !this.isGameTyping()))) {
      e.preventDefault();
      this.openConsole();
    } else if (this.open && e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  }

  isGameTyping() {
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  }

  openConsole() {
    if (this.open) return;
    this.open = true;
    this.root.classList.add('open');
    this.app.activeScreen?.releaseInput?.();
    this.app.activeScreen?.onCommandOpen?.();
    this.root.querySelector('.command-backdrop');
    setTimeout(() => this.input.focus(), 30);
  }

  close() {
    this.open = false;
    this.root.classList.remove('open');
    this.input.value = '';
    this.app.activeScreen?.onCommandClose?.();
  }

  onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const text = this.input.value;
      this.input.value = '';
      this.execute(text);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this.history.length) return;
      this.historyIndex = Math.max(0, this.historyIndex - 1);
      this.input.value = this.history[this.historyIndex] || '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.historyIndex = Math.min(this.history.length, this.historyIndex + 1);
      this.input.value = this.history[this.historyIndex] || '';
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this.complete();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  complete() {
    const raw = this.input.value.replace(/^\//, '');
    const parts = raw.split(/\s+/);
    if (parts.length <= 1) {
      const prefix = (parts[0] || '').toLowerCase();
      const match = this.commands.filter((c) => c.name.startsWith(prefix) || c.aliases.some((a) => a.startsWith(prefix)))[0];
      if (match) this.input.value = `/${match.name} `;
    }
  }

  print(html, type = '') {
    const line = document.createElement('div');
    if (type) line.className = `cmd-${type}`;
    line.innerHTML = html;
    this.logEl.appendChild(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
    while (this.logEl.children.length > 260) this.logEl.firstChild.remove();
  }

  execute(raw) {
    const text = raw.trim();
    if (!text) return;
    this.history.push(text);
    this.historyIndex = this.history.length;
    this.print(`<span class="cmd-echo">❯ ${escapeHtml(text)}</span>`);
    const input = text.replace(/^\//, '');
    const tokens = input.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((t) => t.replace(/^"|"$/g, '')) || [];
    const name = normalize(tokens.shift());
    if (!name) return;
    const cmd = this.commands.find((c) => c.name === name || c.aliases.includes(name));
    if (!cmd) {
      this.print(`未知指令：<span class="cmd-error">${escapeHtml(name)}</span> · 输入 /help 查看可用指令`, 'error');
      return;
    }
    try {
      const result = cmd.run(tokens, this.api());
      if (result instanceof Promise) {
        result.catch((e) => this.print(`指令执行失败：${escapeHtml(e.message || e)}`, 'error'));
      }
    } catch (e) {
      this.print(`指令执行失败：${escapeHtml(e.message || e)}`, 'error');
    }
  }

  api() {
    const screen = this.app.activeScreen;
    return {
      app: this.app,
      state,
      screen,
      print: (t, c) => this.print(t, c),
      toast,
      findItem,
      arg: (tokens, allowed = null, def = '') => {
        const value = String(tokens[0] || def || '').toLowerCase();
        return value;
      },
      requirePlanet: () => {
        if (!screen?.terrain) {
          this.print('该指令需要在地表场景中执行。先降落在一颗行星上。', 'error');
          return null;
        }
        return screen;
      },
      requireSystem: () => {
        if (!screen?.system || !screen?.systemMeta) {
          this.print('该指令需要在恒星系视图中执行。', 'error');
          return null;
        }
        return screen;
      },
    };
  }

  registerCommands() {
    const C = (name, aliases, desc, usage, category, run) => this.commands.push({ name, aliases, desc, usage, category, run });
    const here = (api) => api.screen;

    C('help', ['?', 'cmd'], '显示所有指令或某条指令的详细说明。', '/help [指令]', '核心', (args, api) => {
      if (args[0]) {
        const cmd = this.commands.find((c) => c.name === normalize(args[0]) || c.aliases.includes(normalize(args[0])));
        if (!cmd) return api.print(`未找到指令 ${escapeHtml(args[0])}`, 'error');
        api.print(`<b class="cmd-echo">/${cmd.name}</b> ${escapeHtml(cmd.desc)}<br><span class="cmd-system">用法：${escapeHtml(cmd.usage)} · 分类：${cmd.category}${cmd.aliases.length ? ` · 别名：/${cmd.aliases.join(' / /')}` : ''}</span>`);
        return;
      }
      api.print(`<b>SPACE REALM 指令总览</b> · 共 ${this.commands.length} 条 · 输入 /help <指令> 查看详情`);
      for (const [cat, desc] of Object.entries(CATEGORIES)) {
        const list = this.commands.filter((c) => c.category === cat);
        if (!list.length) continue;
        api.print(`<span class="cmd-ok">▸ ${cat}</span> <span class="cmd-system">${desc}</span>`);
        api.print(list.map((c) => `<span class="cmd-echo">/${c.name}</span>`).join(' · '));
      }
    });
    C('commands', ['cmds'], '打开完整的指令文档。', '/commands', '核心', (args, api) => {
      api.print('完整指令手册已写入项目文件 <span class="cmd-echo">docs/COMMANDS.md</span>，包含语法、示例与分类。');
      api.print('也可使用 <span class="cmd-echo">/help 分类</span> 查看游戏内简要列表。');
    });
    C('clear', ['cls'], '清空终端输出。', '/clear', '核心', (args) => { this.logEl.innerHTML = ''; });
    C('version', ['ver'], '显示当前版本与运行时信息。', '/version', '核心', (args, api) => {
      api.print(`SPACE REALM · 星海境界 v0.9.7 · 实时星历 60× · 用户代理 ${navigator.userAgent.slice(0, 80)}`);
    });
    C('save', ['store'], '立即写入本地存档。', '/save', '核心', (args, api) => {
      api.state.data.simTimeDays = api.app.simDays;
      api.state.saveNow();
      api.print('本地星历与地形改动已写入存档。', 'ok');
    });
    C('reload', ['restart'], '重新加载游戏页面。', '/reload', '核心', () => location.reload());
    C('reset', ['resetworld'], '清空所有存档并重新开始。', '/reset confirm', '核心', (args, api) => {
      if (args[0] !== 'confirm') return api.print('这会删除全部星系、玩家进度与地形改动。确认请输入 <span class="cmd-echo">/reset confirm</span>', 'error');
      api.state.reset();
      location.reload();
    });

    C('xp', ['exp'], '增加或设置修为经验。', '/xp <数量> [set]', '玩家', (args, api) => {
      const n = Number(args[0]);
      if (!Number.isFinite(n)) return api.print('用法：/xp 500 或 /xp 500 set', 'error');
      const before = state.player.level;
      if (args[1] === 'set') state.player.xp = Math.max(0, n);
      else state.player.xp += Math.max(0, n);
      const res = state.addXp(0);
      api.print(`修为已增加 ${fmtNumber(n)} · 当前 LV.${state.player.level} ${realmForLevel(state.player.level).name} · ${fmtNumber(state.player.xp)} / ${fmtNumber(xpToNext(state.player.level))}`, 'ok');
      if (res.levels > 0) {
        api.print(`境界突破至 ${realmForLevel(state.player.level).name} · 破坏力 ×${powerMultiplier(state.player.level).toFixed(2)}`, 'ok');
        api.screen?.handleLevelUp?.(res.levels);
      }
      api.screen?.updateHud?.(true);
    });
    C('level', ['lvl'], '直接设置旅行者等级。', '/level <1-99>', '玩家', (args, api) => {
      const lv = clamp(Number(args[0]) || 1, 1, 99);
      const p = state.player;
      p.level = lv; p.xp = 0;
      p.maxHp = maxHpFor(lv); p.maxMana = 60 + (lv - 1) * 12; p.maxStamina = 100 + (lv - 1) * 2.2;
      p.hp = p.maxHp; p.mana = state.creative ? Infinity : p.maxMana; p.stamina = p.maxStamina;
      api.state.queueSave();
      api.print(`等级设为 LV.${lv} · ${realmForLevel(lv).name} · 破坏力 ×${powerMultiplier(lv).toFixed(2)}`, 'ok');
      api.screen?.updateHud?.(true);
      api.screen?.updateHotbar?.();
    });
    C('heal', ['hp'], '恢复全部生命值。', '/heal', '玩家', (args, api) => {
      api.state.player.hp = api.state.player.maxHp;
      api.print('生命值已恢复。', 'ok');
      api.screen?.updateHud?.(true);
    });
    C('hurt', ['damage'], '对自己造成伤害（测试用）。', '/hurt <数值>', '玩家', (args, api) => {
      const n = Math.max(1, Number(args[0]) || 10);
      if (api.screen?.damage) api.screen.damage(n, '指令伤害'); else state.player.hp = Math.max(0, state.player.hp - n);
      api.print(`受到 ${n} 点伤害。`, 'ok');
    });
    C('mana', ['mp'], '补满法力。', '/mana', '玩家', (args, api) => {
      state.player.mana = state.player.maxMana;
      api.print('法力已补满。', 'ok');
      api.screen?.updateHud?.(true);
    });
    C('stamina', ['sp'], '补满体力。', '/stamina', '玩家', (args, api) => {
      state.player.stamina = state.player.maxStamina;
      api.print('体力已补满。', 'ok');
      api.screen?.updateHud?.(true);
    });
    C('god', ['invincible'], '切换无敌状态（仅当前地表会话）。', '/god', '玩家', (args, api) => {
      if (!api.screen?.terrain) return api.print('该指令需要在地表场景中执行。', 'error');
      api.screen.god = !api.screen.god;
      api.print(`无敌模式 ${api.screen.god ? '开启' : '关闭'}。`, 'ok');
    });
    C('kill', ['die'], '结束当前旅行者生命。', '/kill', '玩家', (args, api) => {
      if (api.screen?.die) api.screen.die(); else api.print('该指令需要在地表场景中执行。', 'error');
    });
    C('respawn', ['revive'], '在最近着陆点复活。', '/respawn', '玩家', (args, api) => {
      if (api.screen?.respawn) api.screen.respawn(); else api.print('当前没有可复活的地表会话。', 'error');
    });
    C('fly', ['flightmode'], '切换反重力飞行。', '/fly', '玩家', (args, api) => {
      if (api.screen?.toggleFlight) api.screen.toggleFlight(); else api.print('无地表会话。', 'error');
    });
    C('noclip', ['ghost'], '切换地形碰撞忽略。', '/noclip', '玩家', (args, api) => {
      if (!api.screen) return;
      if (!api.screen.terrain) return api.print('该指令需要在地表场景中执行。', 'error');
      api.screen.noclip = !api.screen.noclip;
      if (api.screen.noclip) api.screen.fly = true;
      api.print(`碰撞忽略 ${api.screen.noclip ? '开启' : '关闭'}。`, 'ok');
    });
    C('speed', ['movespeed'], '调整地表移动速度倍率。', '/speed <0.2-10>', '玩家', (args, api) => {
      if (!api.screen?.terrain) return api.print('该指令需要在地表执行。', 'error');
      api.screen.speedMultiplier = clamp(Number(args[0]) || 1, 0.2, 10);
      api.print(`移动速度倍率设为 ×${api.screen.speedMultiplier}。`, 'ok');
    });
    C('mode', ['gamemode'], '切换生存 / 造物模式。', '/mode <survival|creative>', '玩家', (args, api) => {
      const v = api.arg(args, ['survival', 'creative'], '');
      const mode = v.startsWith('c') ? 'creative' : v.startsWith('s') ? 'survival' : null;
      if (!mode) return api.print('用法：/mode survival 或 /mode creative', 'error');
      api.state.setMode(mode);
      api.print(`游戏模式切换为 ${mode === 'creative' ? '造物模式' : '生存模式'}。`, 'ok');
      api.screen?.updateHud?.(true);
      api.screen?.updateHotbar?.();
    });
    C('fov', ['fieldofview'], '设置摄像机视场角。', '/fov <40-110>', '玩家', (args, api) => {
      if (!api.screen?.camera) return api.print('无活动摄像机。', 'error');
      const fov = clamp(Number(args[0]) || 70, 40, 110);
      api.screen.camera.fov = fov;
      api.screen.camera.updateProjectionMatrix();
      api.print(`视场角设为 ${fov}°。`, 'ok');
    });

    C('give', ['item'], '获得物品。', '/give <物品ID|名称> [数量]', '物品', (args, api) => {
      const id = findItem(args[0]);
      if (!id) return api.print('未知物品。可用：' + Object.keys(ITEMS).join(', '), 'error');
      const count = Math.max(1, Number(args[1]) || 1);
      api.state.addItem(id, count);
      api.print(`获得 ${ITEMS[id].name} ×${count}。`, 'ok');
      api.screen?.updateHotbar?.();
    });
    C('giveall', ['allitems'], '获得所有物品各一组。', '/giveall [数量]', '物品', (args, api) => {
      const count = Math.max(1, Math.min(999, Number(args[0]) || 32));
      for (const id of Object.keys(ITEMS)) api.state.addItem(id, count);
      api.print(`已获得全部 ${Object.keys(ITEMS).length} 类物品 ×${count}。`, 'ok');
      api.screen?.updateHotbar?.();
      api.screen?.updateHud?.(true);
    });
    C('take', ['removeitem'], '移除物品。', '/take <物品ID> [数量]', '物品', (args, api) => {
      const id = findItem(args[0]);
      if (!id) return api.print('未知物品。', 'error');
      const n = Math.max(1, Number(args[1]) || 1);
      api.state.removeItem(id, Math.min(n, state.player.inventory[id] || 0));
      api.print(`已移除 ${ITEMS[id].name} ×${n}。`, 'ok');
    });
    C('craft', ['make'], '无需材料制造一个合成配方产物（调试）。', '/craft <配方ID>', '物品', (args, api) => {
      const recipe = RECIPES.find((r) => r.id === normalize(args[0])) || RECIPES.find((r) => normalize(r.name).includes(normalize(args[0])));
      if (!recipe) return api.print('未知配方。可用：' + RECIPES.map((r) => r.id).join(', '), 'error');
      api.state.addItem(recipe.out, recipe.count);
      api.print(`已制造 ${ITEMS[recipe.out]?.name || recipe.out} ×${recipe.count}。`, 'ok');
      api.screen?.updateHotbar?.();
    });
    C('equip', ['use'], '装备工具或武器。', '/equip <切割器|石镐|铁镐|等离子掘进器|脉冲步枪|星陨长剑|湮灭炮|物质凝铸器>', '物品', (args, api) => {
      const id = normalize(args[0]);
      const alias = { cutter: 'cutter', 镐: 'stonePick', 石镐: 'stonePick', 铁镐: 'ironPick', 钻头: 'plasmaDrill', 掘进器: 'plasmaDrill', 步枪: 'pulseRifle', 长剑: 'starblade', 星剑: 'starblade', 湮灭: 'annihilator', 凝铸: 'terraformer' };
      const key = TOOL_ORDER.includes(id) ? id : alias[args[0]] || TOOL_ORDER.find((t) => t.toLowerCase().startsWith(id));
      if (!key) return api.print('未知装备。可用：' + TOOL_ORDER.join(', '), 'error');
      state.player.equippedTool = key;
      api.print(`已装备 ${WEAPONS[key]?.name || key}。`, 'ok');
      api.screen?.updateHotbar?.();
      api.screen?.updateHud?.(true);
    });
    C('inventory', ['inv', 'bag'], '列出当前背包。', '/inventory', '物品', (args, api) => {
      const inv = state.player.inventory;
      api.print(Object.entries(inv).filter(([, c]) => c > 0).map(([id, c]) => `${ITEMS[id]?.name || id} ×${c}`).join(' · ') || '背包为空');
    });

    C('time', ['settime', 'stardate'], '读取或调整星历时间 / 流速。', '/time [set <天数> | speed <倍率> | day | night | pause]', '世界', (args, api) => {
      const a = api.arg(args, undefined, '');
      if (!a) { api.print(`当前星历：第 ${api.app.simDays.toFixed(4)} 日 · 流速 ×${api.app.simSpeed}`); return; }
      if (a === 'set') {
        const d = Number(args[1]);
        if (!Number.isFinite(d)) return api.print('用法：/time set 87.5', 'error');
        api.app.setSimDays(d);
        api.screen && (api.screen.timeDays = d);
        api.print(`星历已设为第 ${d.toFixed(3)} 日。`, 'ok');
        return;
      }
      if (a === 'speed' || a === 'timescale') {
        const n = clamp(Number(args[1]) || 60, 0, 36000);
        api.app.setSimSpeed(n);
        api.print(`星历流速设为 ×${n}。`, 'ok');
        return;
      }
      if (a === 'pause') { api.app.setSimSpeed(0); return api.print('星历已暂停。', 'ok'); }
      if (a === 'day' || a === 'night') {
        if (!api.screen?.terrain) return api.print('该选项需要在地表场景中执行。', 'error');
        api.screen.setTimeOfDay(a);
        api.print(`正在调整至当地${a === 'day' ? '白昼' : '夜晚'}…`, 'ok');
        return;
      }
      api.print('用法：/time [set <天数> | speed <倍率> | day | night | pause]', 'error');
    });
    C('weather', ['w'], '设置当前行星天气。', '/weather <clear|cloudy|rain|storm|snow|fog|dust|ash>', '世界', (args, api) => {
      if (!api.screen?.terrain) return api.print('该指令需要在地表场景中执行。', 'error');
      const type = api.arg(args, undefined, 'clear');
      const ok = api.screen.setWeather(type);
      if (ok) api.print(`天气已切换为「${ok.label}」。`, 'ok'); else api.print('未知天气类型。', 'error');
    });
    C('gravity', ['g'], '改变地表重力倍率。', '/gravity <0.1-4>', '世界', (args, api) => {
      if (!api.screen?.terrain) return api.print('该指令需要在地表执行。', 'error');
      api.screen.gravityScale = clamp(Number(args[0]) || 1, 0.1, 4);
      api.print(`重力倍率设为 ×${api.screen.gravityScale}。`, 'ok');
    });
    C('seed', ['seedinfo'], '显示当前星系与地形的种子。', '/seed', '世界', (args, api) => {
      const g = state.findGalaxy(state.data.universe.activeGalaxyId);
      api.print(`星系种子：<span class="cmd-echo">${escapeHtml(g?.seed || '—')}</span>${api.screen?.terrainSeed ? ` · 地表种子：<span class="cmd-echo">${escapeHtml(api.screen.terrainSeed)}</span>` : ''}`);
    });
    C('where', ['pos', 'coords'], '显示当前位置与天体坐标。', '/where', '世界', (args, api) => {
      const s = api.screen;
      if (s?.planet) api.print(`位于 ${s.system.name} / ${s.planet.name} · LAT ${s.site.lat.toFixed(3)}° LON ${s.site.lon.toFixed(3)}° · 海拔 ${(s.playerPos.y - s.terrain.seaLevel).toFixed(2)} m · 坐标 ${s.playerPos.x.toFixed(1)}, ${s.playerPos.y.toFixed(1)}, ${s.playerPos.z.toFixed(1)}`);
      else if (s?.system) api.print(`位于 ${s.system.name} · 恒星 ${s.system.stars?.length || 1} · 行星 ${s.system.planets?.length || 0}`);
      else api.print('位于星海终端。');
    });
    C('dig', ['excavate'], '以视线为目标瞬间挖出球状空腔。', '/dig [半径]', '世界', (args, api) => {
      const s = api.requirePlanet(); if (!s) return;
      s.commandDig(Number(args[0]) || 3);
      api.print('已释放即时开掘。', 'ok');
    });
    C('place', ['terraform'], '在视线落点凝铸一块地形。', '/place [半径]', '世界', (args, api) => {
      const s = api.requirePlanet(); if (!s) return;
      s.commandPlace(Number(args[0]) || 1.2);
      api.print('物质凝铸完成。', 'ok');
    });
    C('pulse', ['shock'], '释放灵能脉冲。', '/pulse', '世界', (args, api) => {
      const s = api.requirePlanet(); if (!s) return;
      s.psychicPulse();
    });
    C('spawn', ['summon'], '在附近生成一只生态生物。', '/spawn [星鹿]', '世界', (args, api) => {
      const s = api.requirePlanet(); if (!s) return;
      s.spawnCreatureNear?.();
      api.print('生态信标释放：一只星鹿出现在附近。', 'ok');
    });
    C('killall', ['clearcreatures'], '移除附近所有生物。', '/killall', '世界', (args, api) => {
      const s = api.requirePlanet(); if (!s) return;
      s.clearCreatures?.();
      api.print('附近生物已被生态静默场移除。', 'ok');
    });

    C('universe', ['u'], '返回宇宙星系列表。', '/universe', '航行', (args, api) => api.app.navigate('universe'));
    C('galaxy', ['gx'], '进入指定星系；无参数时返回当前星系。', '/galaxy [星系名称|ID]', '航行', (args, api) => {
      const q = args.join(' ').toLowerCase();
      const g = q ? state.galaxies.find((x) => x.name.toLowerCase().includes(q) || x.id.toLowerCase() === q) : state.findGalaxy(state.data.universe.activeGalaxyId);
      if (!g) return api.print('未找到星系。', 'error');
      api.app.navigate('galaxy', { galaxyId: g.id });
      api.print(`量子链接建立：${escapeHtml(g.name)}。`, 'ok');
    });
    C('system', ['sys'], '进入指定恒星系。', '/system <恒星系名称|编号>', '航行', (args, api) => {
      const galaxy = state.findGalaxy(state.data.universe.activeGalaxyId);
      if (!galaxy) return api.print('当前没有活动星系。', 'error');
      const systems = api.app.getGalaxySystems(galaxy);
      const q = normalize(args.join(' '));
      if (!q) {
        const idx = systems.findIndex((s) => s.id === state.data.universe.lastSystemId);
        api.print(`当前活动星系 ${galaxy.name} 有 ${systems.length} 个恒星系。用法 /system <名称或编号>`);
        return;
      }
      const sys = systems.find((s) => normalize(s.name) === q || s.id === q) || systems.find((s) => normalize(s.name).includes(q));
      if (!sys) return api.print('未找到恒星系。', 'error');
      api.app.navigate('system', { galaxyId: galaxy.id, systemId: sys.id });
      api.print(`正在同步 ${escapeHtml(sys.name)} 的轨道。`, 'ok');
    });
    C('orbit', ['leavesurface'], '从地表返回近地轨道。', '/orbit', '航行', (args, api) => {
      if (api.screen?.returnToOrbit) { api.screen.returnToOrbit(); api.print('开始升空程序。', 'ok'); }
      else if (api.screen?.stopFlight) { api.screen.stopFlight(); api.print('已退出星舰驾驶。', 'ok'); }
      else api.print('当前已在轨道或星图。', 'error');
    });
    C('land', ['descend'], '在恒星系视图中降落到选中的行星。', '/land', '航行', (args, api) => {
      const s = api.requireSystem(); if (!s) return;
      if (s.selected?.kind !== 'planet') return api.print('请先选择一个行星。', 'error');
      s.landOnPlanet(s.selected.data);
      api.print(`准备降落 ${s.selected.data.name}。`, 'ok');
    });
    C('home', ['spawnhome'], '返回母星地球的轨道或着陆点。', '/home', '航行', (args, api) => {
      const g = state.findGalaxy(state.data.universe.activeGalaxyId) || state.galaxies[0];
      if (!g) return api.print('宇宙中还没有星系。', 'error');
      if (api.screen?.terrain) {
        api.screen.playerPos.copy(api.screen.spawnPoint);
        api.screen.velocity.set(0, 0, 0);
        api.print('已传送至当前着陆点。', 'ok');
      } else {
        api.app.navigate('planet', { galaxyId: g.id, systemId: 'sys-0', planetId: 'earth' });
        api.print('量子跃迁：母星地球。', 'ok');
      }
    });
    C('tp', ['teleport'], '传送到当前地表坐标。', '/tp <x> <y> <z>', '航行', (args, api) => {
      const s = api.requirePlanet(); if (!s) return;
      const x = Number(args[0]), y = Number(args[1]), z = Number(args[2]);
      if (![x, y, z].every(Number.isFinite)) return api.print('用法：/tp 12 30 -8', 'error');
      s.teleportTo(x, y, z);
      api.print(`已传送至 ${x}, ${y}, ${z}。`, 'ok');
    });
    C('tpplanet', ['planet'], '跃迁至当前恒星系的指定行星。', '/tpplanet <行星名称>', '航行', (args, api) => {
      const galaxy = state.findGalaxy(state.data.universe.activeGalaxyId);
      const systemId = state.data.universe.lastSystemId || 'sys-0';
      if (!galaxy) return api.print('当前没有活动星系。', 'error');
      const meta = api.app.getGalaxySystems(galaxy).find((s) => s.id === systemId);
      if (!meta) return api.print('当前星系信息不可用。', 'error');
      const system = generateSystem(galaxy, meta);
      const q = normalize(args.join(' '));
      const planet = system.planets.find((x) => normalize(x.name) === q) || system.planets.find((x) => normalize(x.name).includes(q));
      if (!planet) return api.print(`该恒星系未找到行星「${escapeHtml(args.join(' '))}」。`, 'error');
      api.app.navigate('planet', { galaxyId: galaxy.id, systemId: meta.id, planetId: planet.id });
      api.print(`已建立前往 ${escapeHtml(planet.name)} 的量子通道。`, 'ok');
    });

    C('summonship', ['ship', 'callship'], '召唤星舰（调试可绕开境界限制）。', '/summonship', '航行', (args, api) => {
      const s = api.screen;
      if (s?.summonShip) { s.summonShip(true); api.print('星舰召唤信号已强制发送。', 'ok'); }
      else if (s?.startFlight) { s.startFlight(); api.print('星舰驾驶模式启动。', 'ok'); }
      else api.print('需要在地表或恒星系场景中调用星舰。', 'error');
    });
    C('launch', ['takeoff'], '立即从地表升空进入轨道。', '/launch', '航行', (args, api) => {
      const s = api.screen;
      if (!s?.launchToOrbit) return api.print('当前不在地表场景。', 'error');
      if (!s.shipGroup) s.summonShip(true);
      setTimeout(() => s.launchToOrbit(), 400);
      api.print('发射程序启动。', 'ok');
    });
    C('warp', ['ftl'], '在恒星系内跃迁至目标行星。', '/warp <行星名称>', '航行', (args, api) => {
      const s = api.requireSystem(); if (!s) return;
      const q = normalize(args.join(' '));
      const p = s.system.planets.find((x) => normalize(x.name) === q) || s.system.planets.find((x) => normalize(x.name).includes(q));
      if (!p) return api.print('未找到行星。', 'error');
      s.selectPlanet(p);
      if (!s.flight.active) s.startFlight();
      s.flight.target = p;
      setTimeout(() => s.warpToTarget(), 200);
      api.print(`曲率目标：${escapeHtml(p.name)}。`, 'ok');
    });
    C('unlock', ['unlockall'], '解锁星舰信标；带 all 时解锁全部工具与武器。', '/unlock [ship|all]', '航行', (args, api) => {
      state.data.progress.shipUnlocked = true;
      if ((args[0] || '').toLowerCase() === 'all') {
        for (const id of ['stonePick', 'ironPick', 'plasmaDrill', 'terraformer', 'pulseRifle', 'starblade', 'annihilator', 'beacon', 'shipDrive', 'singularityCore']) {
          state.addItem(id, Math.max(1, state.player.inventory[id] || 1));
        }
      }
      state.queueSave();
      api.print(`星舰信标与筑基层级权限已解锁${(args[0] || '').toLowerCase() === 'all' ? '，全部装备已写入背包' : ''}（调试）。`, 'ok');
      api.screen?.updateShipPanel?.();
      api.screen?.updateHotbar?.();
    });
    C('scan', ['sysinfo'], '分析当前恒星系或行星。', '/scan', '航行', (args, api) => {
      const s = api.screen;
      if (s?.system) {
        api.print(`恒星系 ${s.system.name}：${s.system.stars?.length || 1} 恒星 · ${s.system.planets?.length || 0} 行星 · ${s.system.multi ? '多星复合系统' : '单星系统'}`);
        api.print(s.system.planets?.map((p) => `${p.name}(${p.typeLabel || p.biome || p.type})`).join(' · ') || '无行星');
      } else api.print('当前没有可扫描的恒星系。', 'error');
    });

    C('quality', ['gfx'], '设置画质档位。', '/quality <high|low>', '调试', (args, api) => {
      const q = api.arg(args, ['high', 'low'], 'high');
      api.state.updateSettings({ quality: q === 'low' ? 'low' : 'high' });
      api.print(`画质设为 ${q === 'low' ? '低' : '高'}。部分渲染设置将在重新进入场景后生效。`, 'ok');
    });
    C('fullscreen', ['fs'], '切换全屏。', '/fullscreen', '调试', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });
    C('hud', ['togglehud'], '显示 / 隐藏地表 HUD。', '/hud', '调试', (args, api) => {
      const el = document.getElementById('planet-ui');
      if (!el) return api.print('当前没有 HUD。', 'error');
      el.style.display = el.style.display === 'none' ? '' : 'none';
    });
    C('fps', ['perf'], '在终端中报告性能信息。', '/fps', '调试', (args, api) => {
      const gpu = (() => {
        try { const gl = api.screen?.renderer?.getContext(); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'WebGL'; } catch { return 'WebGL'; }
      })();
      api.print(`设备像素比 ${devicePixelRatio.toFixed(2)} · 画质 ${state.settings.quality} · GPU ${escapeHtml(String(gpu).slice(0, 80))}`);
    });
    C('debug', ['dev'], '输出调试状态摘要。', '/debug', '调试', (args, api) => {
      const s = api.screen;
      api.print(`simDays=${api.app.simDays.toFixed(3)} speed=${api.app.simSpeed} screen=${s?.constructor?.name} level=${state.player.level} edits=${s?.terrain?.edits?.length ?? '—'} chunks=${s?.terrain?.chunks?.size ?? '—'}`);
    });
    C('helpcat', ['category'], '按分类显示指令。', '/helpcat <核心|玩家|物品|世界|航行|调试>', '核心', (args, api) => {
      const cat = args[0];
      const list = this.commands.filter((c) => c.category === cat);
      if (!list.length) return api.print('未知分类：' + escapeHtml(cat || ''), 'error');
      api.print(list.map((c) => `<span class="cmd-echo">/${c.name}</span> <span class="cmd-system">${escapeHtml(c.desc)}</span>`).join('<br>'));
    });
  }
}
