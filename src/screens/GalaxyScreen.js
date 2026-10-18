import { state } from '../core/state.js';
import { generateGalaxySystems } from '../data/generator.js';
import { escapeHtml } from '../core/utils.js';
import { ICONS, toast, openSettings, openCodex, withCurtain, openModal } from '../ui/ui.js';
import { drawGalaxy, drawGalaxyMap } from '../ui/visuals.js';

export class GalaxyScreen {
  constructor(app) {
    this.app = app;
    this.root = null;
    this.galaxy = null;
    this.systems = [];
    this.view = { zoom: 1, offsetX: 0, offsetY: 0 };
    this.selectedId = null;
    this.hoveredId = null;
    this.dragging = false;
    this.dragStart = null;
    this.dirty = true;
    this.raf = 0;
  }

  mount(parent, options = {}) {
    this.galaxy = state.findGalaxy(options.galaxyId || state.data.universe.activeGalaxyId);
    if (!this.galaxy) {
      this.app.navigate('universe');
      return;
    }
    state.setLast({ galaxyId: this.galaxy.id });
    this.systems = generateGalaxySystems(this.galaxy);
    // Home is always available and always near the camera's opening frame.
    this.selectedId = this.systems[0].id;
    this.view.zoom = 1.03;
    this.build(parent);
    setTimeout(() => {
      if (options.greeting && !state.data.progress.visitedSystems.length) {
        this.showArrival();
      }
    }, 1100);
    this.resize();
    this.loop();
    requestAnimationFrame(() => this.root.classList.add('active'));
    this._keyHandler = (e) => {
      if (e.key === '+' || e.key === '=') this.zoomBy(1.2);
      if (e.key === '-') this.zoomBy(0.82);
      if (e.key === 'Escape') this.app.navigate('universe');
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  build(parent) {
    const g = this.galaxy;
    const root = document.createElement('section');
    root.className = 'screen galaxy-screen';
    root.innerHTML = `
      <canvas class="galaxy-canvas" id="galaxy-canvas"></canvas>
      <header class="site-header">
        <div class="brand" id="brand-home">
          <div class="brand-mark"></div>
          <div class="brand-text"><span class="brand-name">SPACE REALM</span><span class="brand-sub">星 海 境 界</span></div>
        </div>
        <nav class="site-nav">
          <button class="nav-link" id="nav-universe">宇宙</button>
          <button class="nav-link active">${escapeHtml(g.name)}</button>
          <button class="nav-link" data-nav="commands">指令</button>
        </nav>
        <div class="header-right">
          <div class="header-meta"><span class="signal"><i></i><i></i><i></i></span><span>FTL MAPPING · ${g.systemCount} STARS</span></div>
          <button class="icon-btn" data-action="settings" title="设置">${ICONS.settings}</button>
          <button class="icon-btn" data-action="fullscreen" title="全屏">${ICONS.fullscreen}</button>
        </div>
      </header>
      <div class="page-route">
        <span class="crumb" id="route-universe">宇宙</span><span class="sep">/</span><span class="current">${escapeHtml(g.name)}</span>
      </div>
      <div class="galaxy-main">
        <div class="galaxy-head">
          <div class="eyebrow gold">GALACTIC CARTOGRAPHY / 螺旋星图</div>
          <h1 class="galaxy-title">${escapeHtml(g.name)} <span class="seed-small">SEED · ${escapeHtml(g.seed)}</span></h1>
          <div class="galaxy-head-meta">
            <span><b>${g.systemCount}</b> 恒星系</span>
            <span><b>${g.lifeRate}%</b> 生命概率</span>
            <span><b>${g.modeLabel || '螺旋星系'}</b></span>
            <span>局部坐标 · <b>ORION ARM</b></span>
          </div>
        </div>
        <div class="system-finder">
          <div class="finder-search">${ICONS.search}<input id="system-search" placeholder="搜索恒星系…" autocomplete="off"></div>
          <div class="system-result hidden" id="system-results"></div>
        </div>
        <div class="galaxy-zoom">
          <button class="zoom-btn" id="zoom-in" title="放大">+</button>
          <button class="zoom-btn" id="zoom-out" title="缩小">−</button>
          <button class="zoom-btn" id="zoom-fit" title="居中">◎</button>
        </div>
        <div class="galaxy-legend">
          <div class="legend-item"><i class="legend-dot home"></i>母星系</div>
          <div class="legend-item"><i class="legend-dot life"></i>生命信号</div>
          <div class="legend-item"><i class="legend-dot rare"></i>双星 / 三体</div>
          <div class="legend-item" style="opacity:.55">拖拽平移 · 滚轮缩放</div>
        </div>
        <div class="galaxy-scale"><div class="bar"></div><span id="scale-label">5,000 LY / DIV</span></div>
        <div class="galaxy-hint"><span class="line"></span><span>双击星点进入恒星系 · 点击获取轨道数据</span><span class="line"></span></div>
        <aside class="galaxy-selected-panel" id="selected-panel"></aside>
      </div>
    `;
    parent.appendChild(root);
    this.root = root;
    this.canvas = root.querySelector('#galaxy-canvas');
    this.ctx = this.canvas.getContext('2d');

    root.querySelector('#brand-home').addEventListener('click', () => this.app.navigate('home'));
    root.querySelector('#nav-universe').addEventListener('click', () => this.app.navigate('universe'));
    root.querySelector('#route-universe').addEventListener('click', () => this.app.navigate('universe'));
    root.querySelector('[data-nav="commands"]').addEventListener('click', () => window.dispatchEvent(new CustomEvent('spacerealm:open-commands')));
    root.querySelector('[data-action="settings"]').addEventListener('click', () => openSettings({}));
    root.querySelector('[data-action="fullscreen"]').addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
    root.querySelector('#zoom-in').addEventListener('click', () => this.zoomBy(1.25));
    root.querySelector('#zoom-out').addEventListener('click', () => this.zoomBy(0.8));
    root.querySelector('#zoom-fit').addEventListener('click', () => { this.view = { zoom: 1.03, offsetX: 0, offsetY: 0 }; this.dirty = true; });
    this.bindCanvas();
    this.bindSearch();
    this.updateSelectedPanel();

    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  bindCanvas() {
    const canvas = this.canvas;
    const toGalaxy = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const cx = rect.width / 2 + this.view.offsetX;
      const cy = rect.height / 2 + this.view.offsetY;
      const scale = Math.min(rect.width, rect.height) * 0.41 * this.view.zoom;
      const x = (mx - cx) / scale;
      const z = (my - cy) / scale;
      let best = null, bestD = Infinity;
      for (const s of this.systems) {
        const d = (s.x - x) ** 2 + (s.z - z) ** 2;
        if (d < bestD) { bestD = d; best = s; }
      }
      const px = (best ? Math.hypot(best.x - x, best.z - z) * scale : Infinity);
      return { mx, my, system: px < 13 ? best : null, best, distPx: px };
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragging = false;
      this.dragStart = { x: e.clientX, y: e.clientY, ox: this.view.offsetX, oy: this.view.offsetY, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.dragStart) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) {
          this.dragStart.moved = true;
          this.dragging = true;
          canvas.classList.add('dragging');
          this.view.offsetX = this.dragStart.ox + dx;
          this.view.offsetY = this.dragStart.oy + dy;
          this.dirty = true;
        }
      } else {
        const hit = toGalaxy(e);
        const next = hit.system?.id || null;
        if (next !== this.hoveredId) {
          this.hoveredId = next;
          canvas.style.cursor = next ? 'pointer' : 'grab';
          this.dirty = true;
        }
      }
    });
    const finish = (e) => {
      if (!this.dragStart) return;
      const wasDrag = this.dragStart.moved;
      this.dragStart = null;
      this.dragging = false;
      canvas.classList.remove('dragging');
      if (!wasDrag) {
        const hit = toGalaxy(e);
        if (hit.system) this.selectSystem(hit.system);
      }
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', () => { this.dragStart = null; this.dragging = false; canvas.classList.remove('dragging'); });
    canvas.addEventListener('dblclick', (e) => {
      const hit = toGalaxy(e);
      if (hit.system) this.enterSystem(hit.system);
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(e.deltaY > 0 ? 0.88 : 1.14, e.clientX, e.clientY);
    }, { passive: false });
  }

  zoomBy(factor, clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const oldZoom = this.view.zoom;
    const next = Math.max(0.48, Math.min(6, oldZoom * factor));
    if (Math.abs(next - oldZoom) < 0.0001) return;
    if (clientX != null) {
      const mx = clientX - rect.left - rect.width / 2;
      const my = clientY - rect.top - rect.height / 2;
      this.view.offsetX = mx - (mx - this.view.offsetX) * (next / oldZoom);
      this.view.offsetY = my - (my - this.view.offsetY) * (next / oldZoom);
    }
    this.view.zoom = next;
    this.dirty = true;
    const scaleLabel = this.root?.querySelector('#scale-label');
    if (scaleLabel) scaleLabel.textContent = `${(5 / next).toFixed(1)}K LY / DIV`;
  }

  bindSearch() {
    const input = this.root.querySelector('#system-search');
    const results = this.root.querySelector('#system-results');
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { results.classList.add('hidden'); return; }
      const found = this.systems.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)).slice(0, 24);
      results.innerHTML = found.length ? found.map((s) => `
        <button data-sys="${s.id}"><i class="sys-dot" style="background:${s.starColor};box-shadow:0 0 6px ${s.starColor}"></i>
          <span>${escapeHtml(s.name)}</span><span class="sys-result-meta">${s.home ? 'HOME' : s.hasLife ? 'LIFE' : s.starCount > 1 ? 'MULTI' : s.spectral}</span>
        </button>`).join('') : '<div class="mini-note" style="padding:10px">未发现匹配的恒星系</div>';
      results.classList.remove('hidden');
      results.querySelectorAll('[data-sys]').forEach((b) => b.addEventListener('click', () => {
        const sys = this.systems.find((s) => s.id === b.dataset.sys);
        this.focusSystem(sys);
        input.value = '';
        results.classList.add('hidden');
      }));
    });
    input.addEventListener('blur', () => setTimeout(() => results.classList.add('hidden'), 180));
    input.addEventListener('focus', () => { if (input.value.trim()) results.classList.remove('hidden'); });
  }

  focusSystem(sys) {
    this.view.zoom = 2.1;
    this.view.offsetX = -sys.x * Math.min(this.canvas.clientWidth, this.canvas.clientHeight) * 0.41 * this.view.zoom;
    this.view.offsetY = -sys.z * Math.min(this.canvas.clientWidth, this.canvas.clientHeight) * 0.41 * this.view.zoom;
    this.selectSystem(sys);
    this.dirty = true;
  }

  selectSystem(sys) {
    this.selectedId = sys.id;
    this.updateSelectedPanel();
    this.dirty = true;
  }

  updateSelectedPanel() {
    const panel = this.root?.querySelector('#selected-panel');
    if (!panel) return;
    const sys = this.systems.find((s) => s.id === this.selectedId);
    if (!sys) { panel.classList.remove('show'); return; }
    const status = sys.home ? '母星系 · 人类摇篮' : sys.hasLife ? '检测到生命信号' : '无生命信号';
    panel.innerHTML = `
      <div class="selected-kicker"><span>${sys.id.toUpperCase()} · ${sys.spectral}${sys.starCount > 1 ? ` ×${sys.starCount}` : ''}</span><span class="status">${sys.home ? 'HOME' : sys.hasLife ? 'BIO' : 'SCAN OK'}</span></div>
      <h3>${escapeHtml(sys.name)}</h3>
      <div class="sel-sub">STELLAR SYSTEM / ${sys.spectral}${sys.starCount > 1 ? ' MULTIPLE' : ''} · LAT ${(sys.y * 100).toFixed(1)}°</div>
      <div class="sel-data-grid">
        <div class="sel-data"><span>行星数量</span><b>${sys.planetCount}</b></div>
        <div class="sel-data"><span>星系距离</span><b>${(sys.radius * 26).toFixed(2)} KLY</b></div>
        <div class="sel-data"><span>恒星数量</span><b>${sys.starCount} ${sys.starCount > 1 ? '多体' : '单星'}</b></div>
        <div class="sel-data"><span>生命状态</span><b style="color:${sys.hasLife ? 'var(--teal)' : 'var(--muted)'}">${sys.hasLife ? '存在' : '未探测'}</b></div>
      </div>
      <div class="sel-tags">
        <span class="tag ${sys.home ? 'gold' : sys.hasLife ? 'green' : ''}">${status}</span>
        ${sys.rare ? '<span class="tag" style="color:var(--purple);border-color:rgba(184,154,255,.25)">稀有引力复合体</span>' : ''}
      </div>
      <div class="sel-note">${sys.home ? '所有坐标原点。行星轨道参数与现实太阳系 1:1 等比例，母星地球等待你的降落。' : sys.hasLife ? '该恒星系内存在可供生命存续的行星。进入后将实时生成轨道与行星数据。' : '进入恒星系以生成其轨道力学与行星细节。生成过程不读取行星地表，进入后才构建局部地形。'}</div>
      <button class="btn primary wide" id="enter-system">进入恒星系 ${ICONS.chevron}</button>
    `;
    panel.classList.add('show');
    panel.querySelector('#enter-system').addEventListener('click', () => this.enterSystem(sys));
  }

  showArrival() {
    const sys = this.systems[0];
    this.focusSystem(sys);
    setTimeout(() => {
      if (!this.root) return;
      const hint = document.createElement('div');
      hint.className = 'toast gold';
      hint.style.cssText = 'position:absolute;left:50%;bottom:110px;transform:translateX(-50%);z-index:9;pointer-events:auto';
      hint.innerHTML = `母星系「${sys.name}」已锁定 · 点击「进入恒星系」前往太阳系`;
      this.root.appendChild(hint);
      setTimeout(() => hint.remove(), 5200);
    }, 600);
  }

  enterSystem(sys) {
    const key = `${this.galaxy.id}:${sys.id}`;
    const firstVisit = state.visitSystem(key);
    state.setLast({ galaxyId: this.galaxy.id, systemId: sys.id, planetId: null });
    withCurtain(firstVisit ? '首次跃迁 · 实时构建恒星系' : '同步恒星系星历', async () => {
      this.app.navigate('system', { galaxyId: this.galaxy.id, systemId: sys.id, firstVisit });
    }, 550);
  }

  resize() {
    if (!this.canvas) return;
    this.dirty = true;
  }

  loop() {
    const draw = () => {
      if (!this.root) return;
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (this.canvas.width !== Math.floor(rect.width * dpr) || this.canvas.height !== Math.floor(rect.height * dpr)) {
        this.canvas.width = Math.floor(rect.width * dpr);
        this.canvas.height = Math.floor(rect.height * dpr);
        this.dirty = true;
      }
      if (this.dirty) {
        this.dirty = false;
        const ctx = this.canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // faint galactic disk background
        const cx = this.canvas.width / 2 + this.view.offsetX * dpr;
        const cy = this.canvas.height / 2 + this.view.offsetY * dpr;
        const scale = Math.min(this.canvas.width, this.canvas.height) * 0.41 * this.view.zoom;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.2);
        grad.addColorStop(0, 'rgba(51,88,108,.18)');
        grad.addColorStop(0.35, 'rgba(27,55,69,.1)');
        grad.addColorStop(1, 'rgba(2,5,8,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, scale * 1.34, scale * 0.94, -0.12, 0, Math.PI * 2);
        ctx.fill();
        // dust lanes
        for (let arm = 0; arm < 2; arm++) {
          ctx.beginPath();
          for (let i = 0; i <= 150; i++) {
            const t = i / 150;
            const theta = arm * Math.PI + t * Math.PI * 2.4 - 0.5;
            const r = scale * (0.08 + t * 1.02);
            const x = cx + Math.cos(theta) * r;
            const y = cy + Math.sin(theta) * r * 0.72;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = 'rgba(90,158,183,.035)';
          ctx.lineWidth = 10 * dpr;
          ctx.stroke();
        }
        ctx.restore();
        drawGalaxyMap(this.canvas, this.systems, this.view, this.selectedId, this.hoveredId);
        // home label always visible
        const home = this.systems[0];
        const sx = cx + home.x * scale;
        const sy = cy + home.z * scale;
        ctx.font = `${Math.max(7, 8 * dpr)}px Orbitron, sans-serif`;
        ctx.fillStyle = 'rgba(255,225,166,.86)';
        ctx.textAlign = 'left';
        ctx.fillText('SOL · 母星系', sx + 8 * dpr, sy - 8 * dpr);
        const sel = this.systems.find((s) => s.id === this.selectedId);
        if (sel && sel.id !== home.id) {
          const x = cx + sel.x * scale;
          const y = cy + sel.z * scale;
          ctx.fillStyle = 'rgba(183,241,255,.9)';
          ctx.fillText(sel.name, x + 11 * dpr, y - 9 * dpr);
        }
      }
      this.raf = requestAnimationFrame(draw);
    };
    this.raf = requestAnimationFrame(draw);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._resizeHandler || (() => {}));
    window.removeEventListener('keydown', this._keyHandler || (() => {}));
    this.root?.remove();
  }
}
