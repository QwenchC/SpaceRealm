import * as THREE from 'three';
import { makeGlowTexture } from './planet-visuals.js';

function hullGeometry() {
  const sections = [
    { z: 2.4, w: 0.24, h: 0.19, y: 0.02 },
    { z: 1.9, w: 0.34, h: 0.24, y: 0.02 },
    { z: 1.1, w: 0.56, h: 0.29, y: 0.02 },
    { z: 0.25, w: 0.65, h: 0.33, y: 0 },
    { z: -0.65, w: 0.55, h: 0.3, y: -0.015 },
    { z: -1.5, w: 0.4, h: 0.23, y: -0.03 },
    { z: -2.15, w: 0.23, h: 0.14, y: -0.035 },
    { z: -2.55, w: 0.025, h: 0.025, y: -0.03 },
  ];
  const N = 12;
  const positions = [];
  const indices = [];
  const uvs = [];
  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      // flattened, slightly faceted superellipse fuselage
      const cx = Math.cos(a), sy = Math.sin(a);
      const x = Math.sign(cx) * Math.pow(Math.abs(cx), 0.72) * sec.w;
      const y = Math.sign(sy) * Math.pow(Math.abs(sy), 0.72) * sec.h + sec.y;
      positions.push(x, y, sec.z);
      uvs.push(i / N, 1 - s / (sections.length - 1));
    }
  }
  for (let s = 0; s < sections.length - 1; s++) {
    for (let i = 0; i < N; i++) {
      const a = s * N + i;
      const b = s * N + ((i + 1) % N);
      const c = (s + 1) * N + ((i + 1) % N);
      const d = (s + 1) * N + i;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function wingGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.24, -0.6);
  shape.lineTo(-2.25, 0.45);
  shape.lineTo(-2.05, 1.04);
  shape.lineTo(-0.8, 1.25);
  shape.lineTo(-0.2, 1.0);
  shape.lineTo(-0.24, -0.6);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.075, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.04, bevelSegments: 2, steps: 1 });
  // shape is in XY; map X to X, Y to Z, extrusion to Y.
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0.03, 0);
  return geo;
}

function finGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0.3, 0);
  shape.lineTo(1.45, 0);
  shape.lineTo(1.82, 0.78);
  shape.lineTo(1.28, 0.92);
  shape.lineTo(0.5, 0.34);
  shape.lineTo(0.3, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.013, bevelSize: 0.018, bevelSegments: 1 });
  geo.rotateY(Math.PI / 2);
  geo.translate(0, 0.17, 0);
  return geo;
}

function decalTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 96);
  ctx.fillStyle = 'rgba(127,233,255,.8)';
  ctx.font = '30px Orbitron, sans-serif';
  ctx.fillText('SR-01 / 星槎', 12, 45);
  ctx.fillStyle = 'rgba(215,243,250,.36)';
  ctx.font = '15px monospace';
  ctx.fillText('SPACE REALM · DEEP VOID EXPEDITION', 12, 72);
  ctx.strokeStyle = 'rgba(127,233,255,.5)';
  ctx.beginPath(); ctx.moveTo(330, 32); ctx.lineTo(484, 32); ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A detailed, fully procedural long-range starship. Nose points towards -Z.
 */
export function createStarship({ scale = 1, landed = false } = {}) {
  const group = new THREE.Group();
  group.name = '星槎 SR-01';
  const hullMat = new THREE.MeshStandardMaterial({ color: '#2c3b42', metalness: 0.82, roughness: 0.33 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#111b20', metalness: 0.7, roughness: 0.42 });
  const accentMat = new THREE.MeshStandardMaterial({ color: '#c3a86d', metalness: 0.9, roughness: 0.26 });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#9af6ff', toneMapped: false });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#2b7997', metalness: 0.1, roughness: 0.08, transmission: 0.62, transparent: true,
    opacity: 0.82, ior: 1.45, emissive: '#0b3241', emissiveIntensity: 0.8, side: THREE.DoubleSide,
  });

  const hull = new THREE.Mesh(hullGeometry(), hullMat);
  hull.castShadow = true;
  group.add(hull);

  // dorsal spine and layered armor plates
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 2.5), accentMat);
  spine.position.set(0, 0.36, 0.25);
  group.add(spine);
  const armor = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.06, 1.5), darkMat);
  armor.position.set(0, -0.3, 0.2);
  group.add(armor);

  // swept wings
  const wingR = new THREE.Mesh(wingGeometry(), hullMat);
  wingR.position.set(0.36, 0, 0);
  group.add(wingR);
  const wingL = wingR.clone();
  wingL.scale.x = -1;
  wingL.position.x = -0.36;
  group.add(wingL);
  const wingStripeGeo = new THREE.BoxGeometry(0.035, 0.035, 1.45);
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(wingStripeGeo, glowMat);
    stripe.position.set(side * 1.55, 0.14, 0.72);
    stripe.rotation.y = side * -0.45;
    stripe.rotation.x = 0.03;
    group.add(stripe);
  }

  // cockpit
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.33, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), glassMat);
  cockpit.scale.set(1, 0.7, 1.75);
  cockpit.position.set(0, 0.18, -0.95);
  group.add(cockpit);
  const cockpitFrame = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 24, Math.PI), accentMat);
  cockpitFrame.rotation.x = Math.PI / 2;
  cockpitFrame.rotation.z = 0;
  cockpitFrame.position.set(0, 0.18, -0.7);
  group.add(cockpitFrame);

  // engine block and nozzles
  const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.34, 0.6), darkMat);
  engineBlock.position.set(0, -0.01, 2.15);
  group.add(engineBlock);
  const engines = [];
  for (const [x, y] of [[-0.32, 0.08], [0.32, 0.08], [-0.32, -0.18], [0.32, -0.18]]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.75, 16), hullMat);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(x, y, 2.25);
    group.add(nacelle);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 6, 20), accentMat);
    ring.position.set(x, y, 2.56);
    group.add(ring);
    const coreMat = new THREE.MeshBasicMaterial({ color: '#79eaff', toneMapped: false, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), coreMat);
    core.position.set(x, y, 2.59);
    group.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture('#75eaff'), color: '#9af6ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
    glow.scale.setScalar(0.85);
    glow.position.set(x, y, 2.62);
    group.add(glow);
    engines.push({ core, glow });
  }

  // tail fins
  const fin = new THREE.Mesh(finGeometry(), hullMat);
  fin.position.set(0, -0.25, 1.0);
  group.add(fin);
  const finL = fin.clone();
  finL.scale.x = -1;
  finL.position.x = 0;
  group.add(finL);
  const tailFin = new THREE.Mesh(finGeometry(), hullMat);
  tailFin.rotation.z = Math.PI / 2;
  tailFin.rotation.y = Math.PI / 2;
  tailFin.scale.set(0.75, 0.75, 1);
  tailFin.position.set(0, 0.32, 1.8);
  group.add(tailFin);

  // weapon pods
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.15, 8), darkMat);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 0.6, -0.1, -0.2);
    group.add(pod);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 0.3, 8), glowMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(side * 0.6, -0.1, -0.92);
    group.add(tip);
  }

  // greebles and panel seams
  const boxGeo = new THREE.BoxGeometry(0.08, 0.04, 0.18);
  for (let i = 0; i < 20; i++) {
    const side = i % 2 ? 1 : -1;
    const greeble = new THREE.Mesh(boxGeo, i % 5 === 0 ? accentMat : darkMat);
    greeble.position.set(side * (0.25 + (i % 3) * 0.09), -0.27 + (i % 4) * 0.045, -0.8 + i * 0.12);
    greeble.scale.setScalar(0.7 + (i % 3) * 0.25);
    group.add(greeble);
  }
  const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 2.5), new THREE.MeshBasicMaterial({ color: '#66e5ff', toneMapped: false }));
  lightStrip.position.set(0.64, -0.01, 0.2);
  group.add(lightStrip);
  const lightStrip2 = lightStrip.clone();
  lightStrip2.position.x = -0.64;
  group.add(lightStrip2);

  // decal panels
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.23), new THREE.MeshBasicMaterial({ map: decalTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  decal.position.set(0.64, 0.09, 0.35);
  decal.rotation.y = -Math.PI / 2;
  group.add(decal);
  const decal2 = decal.clone();
  decal2.position.x = -0.64;
  decal2.rotation.y = Math.PI / 2;
  group.add(decal2);

  // running lights
  const redLight = new THREE.PointLight('#ff5d72', 0.5, 3);
  redLight.position.set(-1.9, 0.12, 1.05);
  group.add(redLight);
  const greenLight = new THREE.PointLight('#4dffbf', 0.5, 3);
  greenLight.position.set(1.9, 0.12, 1.05);
  group.add(greenLight);

  if (landed) {
    const gearMat = new THREE.MeshStandardMaterial({ color: '#718086', metalness: 0.8, roughness: 0.5 });
    for (const [x, z] of [[-0.55, -0.3], [0.55, -0.3], [0, 1.4]]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.52, 6), gearMat);
      strut.position.set(x, -0.57, z);
      group.add(strut);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.07, 8), gearMat);
      foot.position.set(x, -0.83, z);
      group.add(foot);
    }
  }

  group.scale.setScalar(scale);
  group.userData.engines = engines;
  group.userData.thrust = 0.2;
  return group;
}

export function animateStarship(ship, dt, thrust = 0.3) {
  if (!ship) return;
  ship.userData.thrust = thrust;
  const time = performance.now() * 0.001;
  for (let i = 0; i < ship.userData.engines.length; i++) {
    const e = ship.userData.engines[i];
    const flicker = 0.65 + Math.sin(time * 17 + i * 1.8) * 0.18 + thrust * 0.2;
    e.glow.material.opacity = 0.35 + flicker * 0.65;
    e.glow.scale.setScalar(0.6 + thrust * 1.25 + Math.sin(time * 9 + i) * 0.08);
    e.core.material.opacity = 0.55 + thrust * 0.4;
  }
}
