import { RNG, TAU } from '../core/utils.js';

/**
 * Procedural pseudo-3D spiral galaxy drawn with additive star sprites.
 * Used for cards, the cosmic superstructure view and the galaxy chart canvas.
 */
export function drawGalaxy(canvas, seed, options = {}) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(64, Math.floor((options.width || rect.width || 320) * dpr));
  const height = Math.max(64, Math.floor((options.height || rect.height || 280) * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  const rng = new RNG(`${seed}:galaxy-visual`);
  const cx = width / 2;
  const cy = height / 2;
  const tilt = options.tilt ?? rng.float(0.38, 0.7);
  const rotation = options.rotation ?? rng.float(0, TAU);
  const baseR = Math.min(width, height) * (options.zoom || 0.41);
  const arms = options.arms || rng.int(2, 3);
  const hue = rng.pick([
    ['#c9f6ff', '#65cdff', '#3a7bd8'],
    ['#ffe5bd', '#ffb36f', '#bc6b5f'],
    ['#e0c7ff', '#b38aff', '#6e67d6'],
    ['#bcffe9', '#55d3be', '#3f77a8'],
  ]);
  const satelliteHue = ['#ffe3b8', '#bfeaff', '#e3c8ff'];

  ctx.clearRect(0, 0, width, height);
  if (options.background !== false) {
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.8);
    bg.addColorStop(0, 'rgba(7,17,26,.25)');
    bg.addColorStop(1, 'rgba(2,4,7,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }

  // Distant field stars.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < (options.fieldStars ?? 130); i++) {
    const x = rng.float(0, width), y = rng.float(0, height);
    const r = rng.float(0.3, 1.3) * dpr;
    ctx.fillStyle = `rgba(${rng.chance(0.76) ? '185,220,255' : '255,230,190'},${rng.float(0.1, 0.55)})`;
    ctx.fillRect(x, y, r, r);
  }
  ctx.restore();

  const project = (r, theta) => {
    const px = Math.cos(theta) * r;
    const py = Math.sin(theta) * r * tilt;
    const rotX = px * Math.cos(rotation) - (py / tilt) * tilt * Math.sin(rotation);
    const rotY = px * Math.sin(rotation) + (py / tilt) * tilt * Math.cos(rotation);
    return [cx + rotX, cy + rotY];
  };

  // Nebular dust.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const dustColors = [
    `rgba(74,145,180,${0.08})`,
    `rgba(117,89,177,${0.055})`,
    `rgba(211,160,109,${0.04})`,
  ];
  for (let i = 0; i < 26; i++) {
    const radius = baseR * rng.float(0.08, 1.05);
    const theta = rng.float(0, TAU);
    const [x, y] = project(radius, theta);
    const rr = baseR * rng.float(0.08, 0.3);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rr);
    grad.addColorStop(0, rng.pick(dustColors));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }

  // Spiral arms: stars stream outward with exponential fall-off and scatter.
  const starCount = options.stars ?? Math.min(2100, Math.max(400, Math.floor(baseR * 7)));
  for (let arm = 0; arm < arms; arm++) {
    const armOffset = (arm / arms) * TAU;
    for (let i = 0; i < starCount / arms; i++) {
      const t = Math.pow(rng.next(), 0.64);
      const spread = (1 - t) * 0.11 + 0.035;
      const theta = armOffset + t * TAU * 1.55 + rng.gaussian(0, spread);
      const radius = baseR * (0.055 + t * 0.94) * rng.float(0.9, 1.04);
      const [x, y] = project(radius, theta);
      const size = rng.float(0.25, 1.55) * dpr * (1 - t * 0.25);
      const alpha = rng.float(0.16, 0.9) * (0.8 - t * 0.3);
      const color = rng.chance(0.12) ? satelliteHue[0] : rng.chance(0.18) ? satelliteHue[1] : hue[rng.chance(0.3) ? 1 : 0];
      ctx.fillStyle = hexToRgba(color, alpha);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
      if (rng.chance(0.012)) {
        ctx.fillStyle = hexToRgba('#eefcff', 0.5);
        ctx.fillRect(x - 2 * dpr, y, 4 * dpr, 0.7 * dpr);
        ctx.fillRect(x, y - 2 * dpr, 0.7 * dpr, 4 * dpr);
      }
    }
  }

  // Core glow.
  const coreR = baseR * 0.23;
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.4);
  core.addColorStop(0, hexToRgba('#fffdf2', 0.98));
  core.addColorStop(0.1, hexToRgba(hue[0], 0.85));
  core.addColorStop(0.32, hexToRgba(hue[1], 0.28));
  core.addColorStop(1, hexToRgba(hue[2], 0));
  ctx.fillStyle = core;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, Math.max(0.5, tilt));
  ctx.beginPath(); ctx.arc(0, 0, coreR * 2.4, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.restore();

  if (options.bar !== false) {
    const barW = baseR * 1.1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    const bar = ctx.createLinearGradient(-barW / 2, 0, barW / 2, 0);
    bar.addColorStop(0, 'rgba(100,170,220,0)');
    bar.addColorStop(0.36, hexToRgba(hue[1], 0.26));
    bar.addColorStop(0.5, hexToRgba('#fff6d8', 0.7));
    bar.addColorStop(0.64, hexToRgba(hue[1], 0.26));
    bar.addColorStop(1, 'rgba(100,170,220,0)');
    ctx.fillStyle = bar;
    ctx.fillRect(-barW / 2, -1.4 * dpr, barW, 2.8 * dpr);
    ctx.restore();
  }

  if (options.grid) {
    ctx.strokeStyle = 'rgba(127,233,255,.04)';
    ctx.lineWidth = dpr;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, baseR * (0.3 + i * 0.24), baseR * (0.3 + i * 0.24) * tilt, rotation, 0, TAU);
      ctx.stroke();
    }
  }
}

function hexToRgba(hex, alpha) {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function drawGalaxyMap(canvas, systems, view, selectedId, hoverId) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2 + view.offsetX * dpr;
  const cy = h / 2 + view.offsetY * dpr;
  const scale = Math.min(w, h) * 0.41 * view.zoom;
  const project = (s) => [cx + s.x * scale, cy + s.z * scale];

  // coordinate dust
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.35);
  bgGrad.addColorStop(0, 'rgba(47,91,116,.22)');
  bgGrad.addColorStop(0.23, 'rgba(26,57,74,.12)');
  bgGrad.addColorStop(1, 'rgba(2,6,10,0)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(cx - scale * 1.4, cy - scale * 1.4, scale * 2.8, scale * 2.8);
  for (let i = 0; i < 500; i++) {
    const a = (i * 2.39996) % TAU;
    const r = Math.sqrt((i / 500)) * scale * 1.22;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.72;
    ctx.fillStyle = `rgba(173,218,235,${0.03 + (1 - i / 500) * 0.12})`;
    ctx.fillRect(x, y, dpr, dpr);
  }
  ctx.restore();

  // reference circles
  ctx.strokeStyle = 'rgba(127,233,255,.065)';
  ctx.lineWidth = dpr;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, scale * 0.26 * i, scale * 0.26 * i * 0.72, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - scale * 1.2, cy); ctx.lineTo(cx + scale * 1.2, cy);
  ctx.moveTo(cx, cy - scale * .9); ctx.lineTo(cx, cy + scale * .9);
  ctx.strokeStyle = 'rgba(127,233,255,.035)';
  ctx.stroke();

  // star systems
  for (const s of systems) {
    const [x, y] = project(s);
    if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue;
    const isSel = s.id === selectedId;
    const isHover = s.id === hoverId;
    const isHome = s.home;
    const r = (isSel ? 6.2 : isHover ? 4 : isHome ? 3.4 : 1.25 + (s.planetCount > 5 ? 0.7 : 0)) * dpr;
    if (s.hasLife || isHome) {
      ctx.fillStyle = isHome ? 'rgba(216,189,133,.15)' : 'rgba(73,215,197,.12)';
      ctx.beginPath(); ctx.arc(x, y, r * 4.3, 0, TAU); ctx.fill();
    }
    if (s.rare) {
      ctx.strokeStyle = 'rgba(184,154,255,.4)';
      ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, TAU); ctx.stroke();
    }
    const col = isHome ? '#ffdda0' : isSel ? '#c6f8ff' : s.starColor;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    glow.addColorStop(0, hexToRgba(col, 0.9));
    glow.addColorStop(0.3, hexToRgba(col, 0.35));
    glow.addColorStop(1, hexToRgba(col, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, TAU); ctx.fill();
    ctx.fillStyle = isSel ? '#ffffff' : col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
    if (isSel) {
      ctx.strokeStyle = 'rgba(127,233,255,.85)';
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); ctx.arc(x, y, r * 4.2, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(127,233,255,.25)';
      ctx.beginPath(); ctx.arc(x, y, r * 6.4, 0, TAU); ctx.stroke();
    }
  }
  return { project, cx, cy, scale };
}

/**
 * Global screen background starfield with subtle parallax, twinkle and shooting stars.
 */
export function startGlobalStars(canvas) {
  const ctx = canvas.getContext('2d');
  const rng = new RNG('space-realm-background');
  let w = 0, h = 0, dpr = 1;
  let stars = [];
  let shooting = null;
  let nextShoot = performance.now() + 4000;
  let lastDraw = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  const resize = () => {
    dpr = Math.min(1.6, window.devicePixelRatio || 1);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    stars = [];
    const count = Math.floor((w * h) / 3400);
    for (let i = 0; i < count; i++) {
      const z = rng.float(0.2, 1);
      stars.push({
        x: rng.next() * w, y: rng.next() * h, z,
        r: rng.float(0.2, 1.45) * (0.4 + z), tw: rng.float(0, TAU),
        speed: rng.float(0.002, 0.015),
        warm: rng.chance(0.14), blue: rng.chance(0.1),
        bright: rng.chance(0.03),
      });
    }
  };
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / w - 0.5) * 2;
    mouse.ty = (e.clientY / h - 0.5) * 2;
  }, { passive: true });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(40, now - last); last = now;
    const onStarScreen = !document.body.dataset.screen || ['home', 'universe'].includes(document.body.dataset.screen);
    if (!onStarScreen) {
      lastDraw = now;
      requestAnimationFrame(frame);
      return;
    }
    if (now - lastDraw < 34) {
      requestAnimationFrame(frame);
      return;
    }
    lastDraw = now;
    mouse.x += (mouse.tx - mouse.x) * 0.013;
    mouse.y += (mouse.ty - mouse.y) * 0.013;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // faint nebula wash
    const neb = ctx.createRadialGradient(w * dpr * 0.7, h * dpr * 0.32, 0, w * dpr * 0.7, h * dpr * 0.32, w * dpr * 0.65);
    neb.addColorStop(0, 'rgba(21,59,80,.055)');
    neb.addColorStop(0.45, 'rgba(37,25,63,.035)');
    neb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of stars) {
      s.tw += s.speed * dt;
      const alpha = 0.18 + (Math.sin(s.tw) * 0.5 + 0.5) * 0.55 * s.z;
      const x = (s.x - mouse.x * 7 * s.z + w * 0.5) % w;
      const y = (s.y - mouse.y * 5 * s.z + h * 0.5) % h;
      const color = s.warm ? '255,223,183' : s.blue ? '176,214,255' : '219,237,248';
      ctx.fillStyle = `rgba(${color},${alpha})`;
      const r = s.r * dpr;
      ctx.fillRect(x * dpr, y * dpr, r, r);
      if (s.bright) {
        ctx.fillStyle = `rgba(${color},${alpha * 0.18})`;
        ctx.fillRect((x - 3) * dpr, y * dpr, 7 * dpr, 1.1 * dpr);
        ctx.fillRect(x * dpr, (y - 3) * dpr, 1.1 * dpr, 7 * dpr);
      }
      s.y += s.z * 0.0025 * dt;
      if (s.y > h) s.y = 0;
    }
    if (now > nextShoot && !shooting) {
      shooting = { x: rng.float(w * 0.25, w * 0.95), y: rng.float(0, h * 0.3), vx: rng.float(-0.6, -0.25), vy: rng.float(0.15, 0.3), life: 0, max: rng.float(700, 1200) };
      nextShoot = now + rng.float(6000, 13000);
    }
    if (shooting) {
      shooting.life += dt;
      shooting.x += shooting.vx * dt * 0.9;
      shooting.y += shooting.vy * dt * 0.9;
      const fade = Math.sin((shooting.life / shooting.max) * Math.PI);
      const tail = 90;
      const grad = ctx.createLinearGradient(shooting.x * dpr, shooting.y * dpr, (shooting.x - shooting.vx * tail) * dpr, (shooting.y - shooting.vy * tail) * dpr);
      grad.addColorStop(0, `rgba(210,245,255,${fade * 0.8})`);
      grad.addColorStop(1, 'rgba(160,220,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.1 * dpr;
      ctx.beginPath();
      ctx.moveTo(shooting.x * dpr, shooting.y * dpr);
      ctx.lineTo((shooting.x - shooting.vx * tail) * dpr, (shooting.y - shooting.vy * tail) * dpr);
      ctx.stroke();
      if (shooting.life > shooting.max) shooting = null;
    }
    ctx.restore();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return () => {
    window.removeEventListener('resize', resize);
  };
}

export function drawStarChartPreview(canvas, seed, count = 1024) {
  drawGalaxy(canvas, seed, { width: canvas.parentElement?.clientWidth || 300, height: canvas.parentElement?.clientHeight || 86, stars: Math.min(900, 160 + count / 2), fieldStars: 55, tilt: 0.62, bar: false, background: false, zoom: 0.43 });
}
