import { state } from '../core/state.js';
import { escapeHtml } from '../core/utils.js';

export const ICONS = {
  close: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.2"/></svg>',
  plus: '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v11M1 6.5h11" stroke="currentColor" stroke-width="1.2"/></svg>',
  list: '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 2h11M1 6.5h11M1 11h11" stroke="currentColor" stroke-width="1.1"/></svg>',
  cosmos: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke="currentColor"/><ellipse cx="8" cy="8" rx="7" ry="3" stroke="currentColor" opacity=".7"/><circle cx="13.5" cy="6" r="1" fill="currentColor"/></svg>',
  settings: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.1"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" stroke="currentColor" stroke-width="1.1"/></svg>',
  fullscreen: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" stroke="currentColor" stroke-width="1.2"/></svg>',
  archive: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4h12v10H2zM1 1h14v3H1zM6 8h4" stroke="currentColor" stroke-width="1.1"/></svg>',
  chevron: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.2"/></svg>',
  ship: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 1l4.5 10-4.5 3-4.5-3L10 1zM10 9.5v7M7 11l-3 5M13 11l3 5" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor"/><path d="M9.3 9.3L13 13" stroke="currentColor"/></svg>',
  dice: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor"/><circle cx="5.5" cy="5.5" r=".8" fill="currentColor"/><circle cx="10.5" cy="5.5" r=".8" fill="currentColor"/><circle cx="8" cy="8" r=".8" fill="currentColor"/><circle cx="5.5" cy="10.5" r=".8" fill="currentColor"/><circle cx="10.5" cy="10.5" r=".8" fill="currentColor"/></svg>',
  warning: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1l7 13H1L8 1z" stroke="currentColor"/><path d="M8 5v4M8 11v1" stroke="currentColor"/></svg>',
};

export const modalLayer = () => document.getElementById('modal-layer');
export const toastLayer = () => document.getElementById('toast-layer');

export function el(tag, className = '', html = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

export function toast(message, type = '', duration = 2800) {
  const layer = toastLayer();
  if (!layer) return;
  const node = el('div', `toast ${type}`, escapeHtml(message));
  layer.appendChild(node);
  clearTimeout(node._timer);
  node._timer = setTimeout(() => {
    node.classList.add('fade');
    setTimeout(() => node.remove(), 420);
  }, duration);
  return node;
}

export function openModal(html, { className = '', onMount } = {}) {
  const layer = modalLayer();
  const backdrop = el('div', 'modal-backdrop');
  backdrop.innerHTML = `<div class="modal ${className}" role="dialog" aria-modal="true">${html}</div>`;
  layer.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  const close = () => closeModal(backdrop);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', close));
  if (onMount) onMount(backdrop.querySelector('.modal'), close);
  return { backdrop, close };
}

export function closeModal(backdrop) {
  if (!backdrop) return;
  backdrop.classList.remove('open');
  setTimeout(() => backdrop.remove(), 350);
}

export function closeAllModals() {
  modalLayer().querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
}

export function confirmDialog({ title, message, confirmText = '确认', danger = false, onConfirm }) {
  const { close } = openModal(`
    <div class="modal-head">
      <div>
        <div class="eyebrow">CONFIRM OPERATION</div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
      </div>
      <button class="modal-close" data-close-modal>${ICONS.close}</button>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" data-close-modal>取消</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" id="confirm-action">${escapeHtml(confirmText)}</button>
    </div>
  `, {
    onMount(modal, closeFn) {
      modal.querySelector('#confirm-action').addEventListener('click', () => { closeFn(); onConfirm?.(); });
    },
  });
  return close;
}

export async function withCurtain(text, callback, duration = 520) {
  const curtain = document.getElementById('transition-curtain');
  if (!curtain) return callback();
  curtain.querySelector('.curtain-text').textContent = text || '';
  curtain.style.display = 'grid';
  curtain.style.visibility = 'visible';
  curtain.style.opacity = '1';
  curtain.classList.add('show');
  await wait(duration);
  try {
    const result = await callback();
    await wait(Math.max(180, duration * 0.65));
    return result;
  } finally {
    curtain.classList.remove('show');
    setTimeout(() => {
      if (!curtain.classList.contains('show')) {
        curtain.style.opacity = '0';
        curtain.style.visibility = 'hidden';
        curtain.style.display = 'none';
      }
    }, 600);
  }
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function openSettings({ onModeChange } = {}) {
  const p = state.player;
  const s = state.settings;
  const { backdrop, close } = openModal(`
    <div class="modal-head">
      <div>
        <div class="eyebrow">SYSTEM CONFIGURATION</div>
        <h2>终端设置</h2>
        <p>调整游戏模式、显示与控制系统。所有改动即时生效并自动保存。</p>
      </div>
      <button class="modal-close" data-close-modal>${ICONS.close}</button>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">GAME MODE / 游戏模式</div>
      <div class="mode-cards">
        <button class="mode-card ${s.mode === 'survival' ? 'active' : ''}" data-mode="survival">
          <div class="mode-icon">${ICONS.warning}</div>
          <h4>生存模式</h4>
          <p>有限生命、法力与体力。受伤会死亡，探索需要补给与谨慎。</p>
        </button>
        <button class="mode-card ${s.mode === 'creative' ? 'active' : ''}" data-mode="creative">
          <div class="mode-icon">${ICONS.plus}</div>
          <h4>造物模式</h4>
          <p>无生命值限制，法力无限，体力常满。适合自由建造与地形实验。</p>
        </button>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">DISPLAY & AUDIO / 显示与声音</div>
      <div class="switch-row"><span class="cn-label">全屏模式</span><button class="switch ${document.fullscreenElement ? 'on' : ''}" id="fullscreen-switch"></button></div>
      <div class="switch-row"><span class="cn-label">高画质体积云与环境细节</span><button class="switch ${s.quality === 'high' ? 'on' : ''}" id="quality-switch"></button></div>
      <div class="switch-row"><span class="cn-label">界面音量</span><div style="width:150px"><input type="range" id="volume-range" min="0" max="100" value="${Math.round(s.volume * 100)}"></div></div>
      <div class="switch-row"><span class="cn-label">鼠标灵敏度</span><div style="width:150px"><input type="range" id="sens-range" min="40" max="220" value="${Math.round(s.sensitivity * 100)}"></div></div>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">CONTROLS / 操作速查</div>
      <div class="settings-controls">
        <span class="kbd">WASD</span> 移动 · <span class="kbd">SPACE</span> 跳跃 · <span class="kbd">SHIFT</span> 疾跑 · <span class="kbd">F</span> 飞行<br>
        <span class="kbd">LMB</span> 采掘/攻击 · <span class="kbd">RMB</span> 凝铸地形 · <span class="kbd">Q</span> 灵能脉冲 · <span class="kbd">E</span> 舰船交互<br>
        <span class="kbd">V</span> 召唤星舰 · <span class="kbd">C</span> 合成 · <span class="kbd">K</span> 修炼 · <span class="kbd">TAB</span> 背包 · <span class="kbd">M</span> 银河星图 · <span class="kbd">~</span> 指令
      </div>
    </div>
    <div class="settings-section danger-zone">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div><div class="cn-label" style="font-size:11px">重置宇宙档案</div><div class="mini-note">清除全部星系、玩家与地形改动。此操作无法撤销。</div></div>
        <button class="btn danger sm" id="reset-save">重置</button>
      </div>
    </div>
    <div class="modal-actions" style="justify-content:space-between">
      <div class="save-state"><i></i> 本地星历已同步 · LV.${p.level}</div>
      <button class="btn primary" data-close-modal>完成</button>
    </div>
  `, {
    className: 'wide',
    onMount(modal, closeFn) {
      modal.querySelectorAll('[data-mode]').forEach((button) => {
        button.addEventListener('click', () => {
          modal.querySelectorAll('[data-mode]').forEach((b) => b.classList.remove('active'));
          button.classList.add('active');
          state.setMode(button.dataset.mode);
          onModeChange?.(button.dataset.mode);
          toast(button.dataset.mode === 'creative' ? '已切换至造物模式 · 法力无限、体力常满' : '已切换至生存模式 · 请注意生命与法力', 'success');
        });
      });
      modal.querySelector('#fullscreen-switch').addEventListener('click', (e) => {
        toggleFullscreen();
        e.currentTarget.classList.toggle('on');
      });
      modal.querySelector('#quality-switch').addEventListener('click', (e) => {
        const high = e.currentTarget.classList.toggle('on');
        state.updateSettings({ quality: high ? 'high' : 'low' });
      });
      const vol = modal.querySelector('#volume-range');
      const sens = modal.querySelector('#sens-range');
      const paintRange = (input) => input.style.setProperty('--pct', `${(input.value - input.min) / (input.max - input.min) * 100}%`);
      paintRange(vol); paintRange(sens);
      vol.addEventListener('input', () => { paintRange(vol); state.updateSettings({ volume: Number(vol.value) / 100 }); });
      sens.addEventListener('input', () => { paintRange(sens); state.updateSettings({ sensitivity: Number(sens.value) / 100 }); });
      modal.querySelector('#reset-save').addEventListener('click', () => {
        closeFn();
        confirmDialog({
          title: '重置宇宙档案',
          message: '这将永久删除所有星系、地形改动与玩家进度。确定继续吗？',
          confirmText: '永久删除',
          danger: true,
          onConfirm: () => { state.reset(); location.reload(); },
        });
      });
    },
  });
  return { backdrop, close };
}

export function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => toast('浏览器拒绝了全屏请求', 'error'));
  } else {
    document.exitFullscreen?.();
  }
}

export function openCodex() {
  const galaxies = state.galaxies;
  const found = state.data.progress.visitedSystems.length;
  openModal(`
    <div class="modal-head">
      <div><div class="eyebrow">CODEX ARCHIVE</div><h2>星海档案</h2><p>旅行者日志与当前纪元统计。</p></div>
      <button class="modal-close" data-close-modal>${ICONS.close}</button>
    </div>
    <div class="cult-data" style="margin-bottom:18px">
      <div><span>已创造星系</span><b>${galaxies.length}</b></div>
      <div><span>造访恒星系</span><b>${found}</b></div>
      <div><span>已登陆星球</span><b>${state.data.progress.landedPlanets.length}</b></div>
      <div><span>境界等级</span><b>LV.${state.player.level}</b></div>
      <div><span>开采地形</span><b>${state.player.blocksMined}</b></div>
      <div><span>星际造物</span><b>${state.stats.galaxiesCreated}</b></div>
    </div>
    <div class="settings-section-title">GALACTIC RECORDS / 星系记录</div>
    <div style="max-height:240px;overflow:auto;border:1px solid var(--line)">
      ${galaxies.length ? galaxies.map((g) => `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:11px 13px;border-bottom:1px solid rgba(127,233,255,.07);align-items:center">
          <div><div class="cn-label" style="font-size:11px">${escapeHtml(g.name)}</div><div class="mini-note">SEED ${escapeHtml(g.seed)}</div></div>
          <div class="mono" style="font-size:8px;color:var(--muted)">${g.systemCount} 恒星系</div>
          <button class="btn sm ghost" data-open-galaxy="${g.id}">进入</button>
        </div>`).join('') : '<div class="mini-note" style="padding:17px">档案为空。创造你的第一个星系。</div>'}
    </div>
    <div class="modal-actions"><button class="btn ghost" data-close-modal>关闭</button><button class="btn primary" id="codex-cmd">查看指令手册</button></div>
  `, {
    className: 'wide',
    onMount(modal, close) {
      modal.querySelectorAll('[data-open-galaxy]').forEach((b) => b.addEventListener('click', () => {
        close();
        window.dispatchEvent(new CustomEvent('spacerealm:open-galaxy', { detail: b.dataset.openGalaxy }));
      }));
      modal.querySelector('#codex-cmd').addEventListener('click', () => {
        close();
        window.dispatchEvent(new CustomEvent('spacerealm:open-commands'));
      });
    },
  });
}

export function animateNumber(node, from, to, duration = 500) {
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
