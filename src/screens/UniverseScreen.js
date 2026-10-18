import { state } from '../core/state.js';
import { escapeHtml, randomSeed, RNG, formatDate, fmtNumber } from '../core/utils.js';
import { ICONS, toast, openModal, openSettings, openCodex, confirmDialog, withCurtain, el } from '../ui/ui.js';
import { drawGalaxy } from '../ui/visuals.js';

const GALAXY_PREFIX = ['曦光', '归墟', '苍澜', '天璇', '烛龙', '太初', '玄弋', '白泽', '列宿', '坤舆'];

export class UniverseScreen {
  constructor(app) {
    this.app = app;
    this.root = null;
    this.drawHandles = [];
    this.view = state.universe.view || 'list';
    this.selectedGalaxyId = null;
  }

  mount(parent, options = {}) {
    this.build(parent);
    if (options.openGalaxyId) {
      const galaxy = state.findGalaxy(options.openGalaxyId);
      if (galaxy) setTimeout(() => this.openGalaxy(galaxy.id), 250);
    } else if (options.justCreated) {
      this.view = state.universe.view;
      this.updateView();
    }
  }

  build(parent) {
    const root = document.createElement('section');
    root.className = 'screen universe-screen';
    root.innerHTML = `
      <header class="site-header">
        <div class="brand" id="brand-home">
          <div class="brand-mark"></div>
          <div class="brand-text"><span class="brand-name">SPACE REALM</span><span class="brand-sub">星 海 境 界</span></div>
        </div>
        <nav class="site-nav">
          <button class="nav-link active">宇宙</button>
          <button class="nav-link" data-nav="codex">档案</button>
          <button class="nav-link" data-nav="commands">指令</button>
        </nav>
        <div class="header-right">
          <div class="header-meta"><span class="signal"><i></i><i></i><i></i></span><span>UNIVERSE INDEX · ${state.galaxies.length.toString().padStart(3, '0')}</span></div>
          <button class="icon-btn" data-action="settings" title="设置">${ICONS.settings}</button>
          <button class="icon-btn" data-action="fullscreen" title="全屏">${ICONS.fullscreen}</button>
        </div>
      </header>
      <div class="universe-main">
        <div class="universe-head">
          <div class="universe-head-left">
            <div class="eyebrow">THE OBSERVABLE COSMOS / EPOCH 2187</div>
            <h1 class="universe-title">宇宙 <span class="thin">/ UNIVERSE</span></h1>
            <div class="universe-sub">坐标之外仍有坐标。创造星系，让星海拥有新的引力中心。</div>
          </div>
          <div class="universe-tools">
            <div class="view-toggle" role="tablist">
              <button data-view="list" class="${this.view === 'list' ? 'active' : ''}">${ICONS.list}<span>列表呈现</span></button>
              <button data-view="cosmos" class="${this.view === 'cosmos' ? 'active' : ''}">${ICONS.cosmos}<span>宇宙呈现</span></button>
            </div>
            <button class="btn primary" id="create-galaxy">${ICONS.plus}<span>创造星系</span></button>
          </div>
        </div>
        <div class="universe-body" id="universe-body"></div>
      </div>
    `;
    parent.appendChild(root);
    this.root = root;

    root.querySelector('#brand-home').addEventListener('click', () => this.app.navigate('home'));
    root.querySelectorAll('[data-nav="codex"]').forEach((b) => b.addEventListener('click', openCodex));
    root.querySelectorAll('[data-nav="commands"]').forEach((b) => b.addEventListener('click', () => window.dispatchEvent(new CustomEvent('spacerealm:open-commands'))));
    root.querySelector('[data-action="settings"]').addEventListener('click', () => openSettings({}));
    root.querySelector('[data-action="fullscreen"]').addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
    root.querySelector('#create-galaxy').addEventListener('click', () => this.openCreateModal());
    root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      this.view = b.dataset.view;
      state.universe.view = this.view;
      state.queueSave();
      root.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('active', x === b));
      this.renderBody();
    }));
    this.renderBody();
    requestAnimationFrame(() => root.classList.add('active'));
    this.disposers = [];
    this._onResize = () => this.redrawVisuals();
    window.addEventListener('resize', this._onResize);
  }

  renderBody() {
    const body = this.root?.querySelector('#universe-body');
    if (!body) return;
    body.innerHTML = '';
    this.drawHandles = [];
    if (!state.galaxies.length) {
      body.innerHTML = `
        <div class="universe-empty">
          <div class="universe-empty-inner">
            <div class="star-glyph"></div>
            <div class="eyebrow" style="justify-content:center;margin-bottom:10px">NO GALACTIC SIGNAL</div>
            <h2>宇宙仍是空的</h2>
            <p>还没有任何星系回应你的扫描。输入一个种子，<br>让螺旋臂从虚空中结晶，成为你的第一片星海。</p>
            <button class="btn primary" id="empty-create">${ICONS.plus} <span>创造第一个星系</span></button>
          </div>
        </div>`;
      body.querySelector('#empty-create').addEventListener('click', () => this.openCreateModal());
      return;
    }
    if (this.view === 'cosmos') this.renderCosmos(body);
    else this.renderList(body);
  }

  renderList(body) {
    const list = el('div', 'galaxy-list');
    for (const galaxy of state.galaxies) {
      const card = el('button', 'galaxy-card');
      const active = galaxy.id === state.data.universe.activeGalaxyId;
      const entered = state.data.progress.enteredGalaxies?.includes(galaxy.id);
      card.innerHTML = `
        <div class="card-viz"><canvas></canvas></div>
        <div class="delete-galaxy" title="删除星系">${ICONS.close}</div>
        <div class="card-content">
          <div class="card-top">
            <span class="card-id">${galaxy.id.replace('gx-', 'GX-').toUpperCase()}</span>
            <span class="card-status">${active ? '当前纪元' : entered ? '可进入' : '母星同步'}</span>
          </div>
          <h3>${escapeHtml(galaxy.name)}</h3>
          <div class="card-en">SEED ${escapeHtml(galaxy.seed)} · ${formatDate(galaxy.createdAt)}</div>
          <div class="card-stats">
            <div><b>${galaxy.systemCount}</b><span>恒星系</span></div>
            <div><b>${galaxy.lifeRate}%</b><span>生命概率</span></div>
            <div><b>${galaxy.modeLabel || '螺旋星系'}</b><span>形态分类</span></div>
          </div>
        </div>`;
      const canvas = card.querySelector('canvas');
      card.dataset.seed = galaxy.seed;
      card.dataset.id = galaxy.id;
      requestAnimationFrame(() => drawGalaxy(canvas, galaxy.seed, { width: canvas.parentElement.clientWidth, height: canvas.parentElement.clientHeight, stars: 950, fieldStars: 90, tilt: 0.56, zoom: 0.46 }));
      card.addEventListener('click', (e) => {
        if (e.target.closest('.delete-galaxy')) return;
        this.openGalaxy(galaxy.id);
      });
      card.querySelector('.delete-galaxy').addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDialog({
          title: `删除星系「${galaxy.name}」`,
          message: '星系数以 10³ 计的恒星将被永久遗忘，包括所有造访记录。旅行者本体不会被删除。',
          confirmText: '确认删除',
          danger: true,
          onConfirm: () => {
            state.removeGalaxy(galaxy.id);
            toast(`星系「${galaxy.name}」已从宇宙索引中抹除`, '');
            this.renderBody();
            this.root.querySelector('.header-meta span:last-child').textContent = `UNIVERSE INDEX · ${String(state.galaxies.length).padStart(3, '0')}`;
          },
        });
      });
      list.appendChild(card);
    }
    const add = el('button', 'galaxy-card add-card', `
      <div class="add-galaxy-plus"><span>+</span></div>
      <b>创造新的星系</b>
      <small>SEED / PARAMETERS</small>
    `);
    add.addEventListener('click', () => this.openCreateModal());
    list.appendChild(add);
    body.appendChild(list);
    if (!this.disposers) this.disposers = [];
    window.setTimeout(() => this.redrawCards(), 50);
  }

  redrawCards() {
    if (!this.root) return;
    this.root.querySelectorAll('.galaxy-list .galaxy-card').forEach((card) => {
      if (!card.dataset.id) return;
      const canvas = card.querySelector('.card-viz canvas');
      const galaxy = state.findGalaxy(card.dataset.id);
      if (canvas && galaxy) {
        const w = canvas.parentElement.clientWidth;
        const h = card.clientHeight;
        drawGalaxy(canvas, galaxy.seed, { width: w, height: h, stars: 900, fieldStars: 70, tilt: 0.56, zoom: 0.46 });
      }
    });
  }

  redrawVisuals() {
    this.drawHandles.forEach((fn) => fn());
  }

  renderCosmos(body) {
    const cosmos = el('div', 'cosmos-view');
    cosmos.innerHTML = `<div class="cosmos-axis"></div>
      <div class="cosmos-note"><b>UNIVERSE SUPERSTRUCTURE</b><br>SELECT A GALAXY TO ESTABLISH A QUANTUM LINK<br>已记录星系 ${state.galaxies.length} / 本地宇宙</div>`;
    const rng = new RNG(`cosmos-layout:${state.galaxies.map((g) => g.id).join(',')}`);
    if (!state.galaxies.length) cosmos.innerHTML = '<div class="cosmos-empty"><div><div class="empty-symbol"></div><h3>NO GALACTIC SIGNAL</h3><p>黑暗中尚未浮现螺旋的辉光。</p><button class="btn primary" id="cosmos-create">创造星系</button></div></div>';
    const slots = [
      [27, 44, 258], [57, 61, 220], [75, 34, 250], [41, 23, 186], [86, 69, 196], [16, 72, 180],
    ];
    state.galaxies.slice(0, 8).forEach((galaxy, i) => {
      const slot = slots[i] || [rng.float(15, 85), rng.float(20, 75), rng.float(120, 180)];
      const wrap = document.createElement('button');
      wrap.className = `cosmic-galaxy ${this.selectedGalaxyId === galaxy.id ? 'selected' : ''}`;
      wrap.style.left = `${slot[0] + rng.float(-3, 3)}%`;
      wrap.style.top = `${slot[1] + rng.float(-2, 2)}%`;
      wrap.style.setProperty('--size', `${slot[2]}px`);
      wrap.innerHTML = `<div class="cosmic-orb"><canvas></canvas></div><div class="cosmic-label">${escapeHtml(galaxy.name)}<small>${galaxy.systemCount} SYSTEMS</small></div>`;
      cosmos.appendChild(wrap);
      requestAnimationFrame(() => drawGalaxy(wrap.querySelector('canvas'), galaxy.seed, { width: slot[2], height: slot[2], stars: 500, fieldStars: 0, tilt: 0.58, zoom: 0.47, background: false }));
      wrap.addEventListener('click', () => {
        this.selectedGalaxyId = galaxy.id;
        cosmos.querySelectorAll('.cosmic-galaxy').forEach((g) => g.classList.remove('selected'));
        wrap.classList.add('selected');
        this.showCosmosDetail(cosmos, galaxy);
      });
      wrap.addEventListener('dblclick', () => this.openGalaxy(galaxy.id));
    });
    if (!state.galaxies.length) {
      cosmos.querySelector('#cosmos-create')?.addEventListener('click', () => this.openCreateModal());
    }
    body.appendChild(cosmos);
    if (!this.selectedGalaxyId && state.galaxies.length) {
      this.selectedGalaxyId = state.galaxies[0].id;
      cosmos.querySelector('.cosmic-galaxy')?.classList.add('selected');
    }
    if (this.selectedGalaxyId) {
      const g = state.findGalaxy(this.selectedGalaxyId);
      if (g) this.showCosmosDetail(cosmos, g);
    }
    this._cosmosRedraw = () => {
      cosmos.querySelectorAll('.cosmic-galaxy').forEach((button) => {
        const name = button.querySelector('.cosmic-label')?.firstChild?.textContent;
        const g = state.galaxies.find((gx) => gx.name === name);
        const c = button.querySelector('canvas');
        if (g && c) drawGalaxy(c, g.seed, { width: c.clientWidth, height: c.clientHeight, stars: 500, fieldStars: 0, tilt: 0.58, zoom: 0.47, background: false });
      });
    };
    this.drawHandles.push(this._cosmosRedraw);
  }

  showCosmosDetail(cosmos, galaxy) {
    cosmos.querySelector('.cosmos-detail')?.remove();
    const detail = el('div', 'cosmos-detail');
    detail.innerHTML = `
      <div class="detail-label">QUANTUM LINK AVAILABLE · ${galaxy.id.toUpperCase()}</div>
      <h3>${escapeHtml(galaxy.name)}</h3>
      <div style="font-family:var(--font-display);font-size:7px;letter-spacing:.12em;color:var(--muted)">SEED ${escapeHtml(galaxy.seed)}</div>
      <div class="detail-stats">
        <div><b>${galaxy.systemCount}</b><span>恒星系</span></div>
        <div><b>${galaxy.lifeRate}%</b><span>生命概率</span></div>
        <div><b>${galaxy.systemCount > 600 ? 'SBc' : 'SAb'}</b><span>形态</span></div>
      </div>
      <button class="btn primary wide" id="cosmos-enter">建立量子链接 ${ICONS.chevron}</button>`;
    cosmos.appendChild(detail);
    detail.querySelector('#cosmos-enter').addEventListener('click', () => this.openGalaxy(galaxy.id));
  }

  openCreateModal() {
    const initialSeed = randomSeed();
    const screen = this;
    let previewSeed = initialSeed;
    let count = 256;
    let life = 3;
    const prefix = GALAXY_PREFIX[Math.floor(Math.random() * GALAXY_PREFIX.length)];
    const { close } = openModal(`
      <div class="modal-head">
        <div>
          <div class="eyebrow">GENESIS PROTOCOL / 创世协议</div>
          <h2>创造星系</h2>
          <p>输入种子与演化参数。恒星系与行星只在被观测时生成，<br>星系本身将立即加入你的宇宙索引。</p>
        </div>
        <button class="modal-close" data-close-modal>${ICONS.close}</button>
      </div>
      <div class="create-preview"><div class="preview-label">LIVE SPIRAL PROJECTION</div><canvas id="preview-canvas"></canvas><div class="preview-readout"><span id="preview-count">256 SPANS</span><span id="preview-life">LIFE 3%</span></div></div>
      <div class="form-row">
        <label for="galaxy-name">星系名称 <span class="value">DESIGNATION</span></label>
        <input class="input" id="galaxy-name" maxlength="20" value="${prefix}银河">
      </div>
      <div class="form-row">
        <label for="galaxy-seed">演化种子 <span class="value">SEED</span></label>
        <div class="seed-row">
          <input class="input" id="galaxy-seed" maxlength="42" value="${initialSeed}" spellcheck="false">
          <button class="seed-dice" id="seed-dice" title="随机生成种子">${ICONS.dice}</button>
        </div>
        <span class="hint">相同种子与参数将生成完全相同的星系。可用字母、数字或短句。</span>
      </div>
      <div class="form-grid">
        <div class="form-row">
          <label>恒星系数量 <span class="value" id="count-value">256</span></label>
          <input type="range" id="count-range" min="1" max="1024" step="1" value="256">
          <div class="range-labels"><span>1</span><span>1024 MAX</span></div>
          <input class="input" id="count-number" type="number" min="1" max="1024" value="256" style="height:34px;margin-top:4px">
        </div>
        <div class="form-row">
          <label>生命星球概率 <span class="value" id="life-value">3%</span></label>
          <input type="range" id="life-range" min="1" max="10" step="1" value="3">
          <div class="range-labels"><span>1% RARE</span><span>10% COMMON</span></div>
          <span class="hint" style="margin-top:15px">每个恒星系诞生生命行星的概率。母星系恒为 100%。</span>
        </div>
      </div>
      <div class="modal-actions">
        <div class="save-state"><i></i> 星系创建后立即写入本地宇宙</div>
        <button class="btn ghost" data-close-modal>取消</button>
        <button class="btn primary" id="create-confirm">${ICONS.plus} 初始化星系</button>
      </div>
    `, {
      className: 'wide',
      onMount(modal, closeFn) {
        const nameEl = modal.querySelector('#galaxy-name');
        const seedEl = modal.querySelector('#galaxy-seed');
        const countRange = modal.querySelector('#count-range');
        const countNumber = modal.querySelector('#count-number');
        const lifeRange = modal.querySelector('#life-range');
        const countValue = modal.querySelector('#count-value');
        const lifeValue = modal.querySelector('#life-value');
        const previewCount = modal.querySelector('#preview-count');
        const previewLife = modal.querySelector('#preview-life');
        const preview = modal.querySelector('#preview-canvas');
        const updatePreview = () => {
          drawGalaxy(preview, previewSeed, { width: preview.parentElement.clientWidth, height: preview.parentElement.clientHeight, stars: 520, fieldStars: 40, tilt: 0.55, zoom: 0.44 });
          previewCount.textContent = `${count} SPANS`;
          previewLife.textContent = `LIFE ${life}%`;
        };
        const sync = (source) => {
          count = Math.max(1, Math.min(1024, Number(countNumber.value) || 1));
          countRange.value = count;
          countValue.textContent = count;
          countRange.style.setProperty('--pct', `${((count - 1) / 1023) * 100}%`);
          life = Number(lifeRange.value);
          lifeValue.textContent = `${life}%`;
          lifeRange.style.setProperty('--pct', `${((life - 1) / 9) * 100}%`);
          if (source === 'range') countNumber.value = count;
          updatePreview();
        };
        countRange.addEventListener('input', () => { countNumber.value = countRange.value; sync('range'); });
        countNumber.addEventListener('input', () => sync('number'));
        lifeRange.addEventListener('input', () => sync('life'));
        seedEl.addEventListener('input', () => { previewSeed = seedEl.value || initialSeed; updatePreview(); });
        modal.querySelector('#seed-dice').addEventListener('click', () => {
          previewSeed = randomSeed();
          seedEl.value = previewSeed;
          updatePreview();
        });
        let dt;
        modal.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') i.blur(); }));
        const resize = () => updatePreview();
        window.addEventListener('resize', resize);
        modal._cleanup = () => window.removeEventListener('resize', resize);
        updatePreview();
        modal.querySelector('#create-confirm').addEventListener('click', () => {
          const name = nameEl.value.trim();
          const seed = seedEl.value.trim();
          if (!name) { toast('请为星系命名', 'error'); nameEl.focus(); return; }
          if (!seed) { toast('种子不可为空', 'error'); seedEl.focus(); return; }
          if (state.galaxies.some((g) => g.seed === seed && g.systemCount === count && g.lifeRate === life)) {
            toast('这个宇宙组合已经存在', 'error');
            return;
          }
          const id = `gx-${Date.now().toString(36)}-${Math.floor(Math.random() * 999).toString(36)}`;
          const galaxy = {
            id, name, seed, systemCount: count, lifeRate: life,
            createdAt: Date.now(),
            modeLabel: count > 700 ? '巨幅旋涡' : count > 300 ? '棒旋星系' : '致密旋臂',
          };
          state.addGalaxy(galaxy);
          closeFn();
          screen.view = state.universe.view || 'list';
          screen.selectedGalaxyId = id;
          screen.renderBody();
          const meta = screen.root.querySelector('.header-meta span:last-child');
          if (meta) meta.textContent = `UNIVERSE INDEX · ${String(state.galaxies.length).padStart(3, '0')}`;
          toast(`星系「${name}」已诞生 · ${count} 个恒星系等待观测`, 'gold', 3600);
        });
        modal.addEventListener('transitionend', () => {}, { once: true });
      },
    });
    return close;
  }

  openGalaxy(id, opts = {}) {
    const galaxy = state.findGalaxy(id);
    if (!galaxy) return;
    state.setLast({ galaxyId: id, systemId: null, planetId: null });
    const entered = state.data.progress.enteredGalaxies || (state.data.progress.enteredGalaxies = []);
    if (!entered.includes(id)) {
      entered.push(id);
      state.visitSystem(`${id}:sys-0`);
      state.saveNow();
      // Navigation protocol: a traveller's first jump into a galaxy ends on its
      // guaranteed habitable motherworld. The star charts are available via [M].
      withCurtain('初次进入 · 导航协议锁定母星', async () => {
        this.app.navigate('planet', { galaxyId: id, systemId: 'sys-0', planetId: 'earth', firstEntry: true });
      }, 620);
      return;
    }
    withCurtain('建立量子链接 · 展开螺旋星图', async () => {
      this.app.navigate('galaxy', { galaxyId: id, greeting: opts.greeting });
    }, 500);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize || (() => {}));
    this.drawHandles = [];
    this.root?.remove();
  }
}
