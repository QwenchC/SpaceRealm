import { TAU, hashString, clamp, smoothstep } from '../core/utils.js';
import { AU_KM } from '../data/solar.js';

/**
 * Solar-system ephemeris shared by the orbital chart, the sky and the command
 * system. All angles are derived from one simulation day counter.
 */

export function phaseFor(systemKey, bodyId, salt = 0) {
  const h = hashString(`${systemKey}:${bodyId}:${salt}`);
  return ((h % 100000) / 100000) * TAU;
}

export function planetOrbitPositionAU(planet, days) {
  const phase = planet.phase ?? phaseFor(planet.seed || planet.id, planet.id);
  const e = planet.eccentricity || 0;
  const M = (days / planet.periodDays) * TAU + phase;
  // Solve Kepler's equation once; this keeps eccentric orbits physically honest.
  let E = M;
  for (let i = 0; i < 5; i++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const trueAnomaly = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const r = planet.aAU * (1 - e * Math.cos(E));
  const inc = (planet.inclination || 0) * Math.PI / 180;
  const omega = phase * 0.37;
  const x = r * (Math.cos(omega) * Math.cos(trueAnomaly) - Math.sin(omega) * Math.sin(trueAnomaly) * Math.cos(inc));
  const z = r * (Math.sin(omega) * Math.cos(trueAnomaly) + Math.cos(omega) * Math.sin(trueAnomaly) * Math.cos(inc));
  const y = r * Math.sin(trueAnomaly) * Math.sin(inc);
  return { x, y, z, r, angle: trueAnomaly, M };
}

export function starPositionAU(system, starIndex, days) {
  if ((system.stars?.length || 1) <= 1 || starIndex === 0) return { x: 0, y: 0, z: 0 };
  const sep = 0.08 + starIndex * 0.14;
  const a = days / (7.4 * starIndex) * TAU + starIndex * 2.1;
  return { x: Math.cos(a) * sep, y: Math.sin(a) * sep * 0.2, z: Math.sin(a) * sep };
}

function mulberryStep(seed) {
  let t = seed >>> 0;
  t = Math.imul(t ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  t ^= t >>> 13;
  return t >>> 0;
}

/** Planet axial orientation in the inertial ecliptic frame. */
export function planetBasis(planet, days) {
  const tilt = (planet.tilt ?? 23.4) * Math.PI / 180;
  const spinPeriodDays = Math.abs(planet.rotationHours || 24) / 24;
  const direction = Math.sign(planet.rotationHours || 24);
  const spin = (days / spinPeriodDays) * TAU * direction + phaseFor(planet.seed || planet.id, planet.id, 7);
  const N = { x: Math.sin(tilt), y: Math.cos(tilt), z: 0 };
  const E1 = { x: Math.cos(tilt), y: -Math.sin(tilt), z: 0 };
  const E2 = { x: 0, y: 0, z: 1 };
  const M = {
    x: E1.x * Math.cos(spin) + E2.x * Math.sin(spin),
    y: E1.y * Math.cos(spin) + E2.y * Math.sin(spin),
    z: E1.z * Math.cos(spin) + E2.z * Math.sin(spin),
  };
  const V = {
    x: -E1.x * Math.sin(spin) + E2.x * Math.cos(spin),
    y: -E1.y * Math.sin(spin) + E2.y * Math.cos(spin),
    z: -E1.z * Math.sin(spin) + E2.z * Math.cos(spin),
  };
  return { N, E1, E2, M, V, spin, tilt };
}

export function surfacePoint(basis, latDeg, lonDeg) {
  const lat = latDeg * Math.PI / 180;
  const lon = lonDeg * Math.PI / 180;
  const { N, V, M } = basis;
  const up = {
    x: N.x * Math.sin(lat) + M.x * Math.cos(lat) * Math.cos(lon) + V.x * Math.cos(lat) * Math.sin(lon),
    y: N.y * Math.sin(lat) + M.y * Math.cos(lat) * Math.cos(lon) + V.y * Math.cos(lat) * Math.sin(lon),
    z: N.z * Math.sin(lat) + M.z * Math.cos(lat) * Math.cos(lon) + V.z * Math.cos(lat) * Math.sin(lon),
  };
  const east = {
    x: -M.x * Math.sin(lon) + V.x * Math.cos(lon),
    y: -M.y * Math.sin(lon) + V.y * Math.cos(lon),
    z: -M.z * Math.sin(lon) + V.z * Math.cos(lon),
  };
  const north = {
    x: east.y * up.z - east.z * up.y,
    y: east.z * up.x - east.x * up.z,
    z: east.x * up.y - east.y * up.x,
  };
  return { up, east, north };
}

export function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
export function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
export function normalize(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Convert an inertial direction into local (east, up, -north) surface coords. */
export function toLocalSurface(dir, frame) {
  return {
    x: dot(dir, frame.east),
    y: dot(dir, frame.up),
    z: -dot(dir, frame.north),
  };
}

/**
 * Determine a landing longitude that places the primary sun ~28-40 degrees above
 * the horizon, so first contact is always readable and beautifully lit.
 */
export function chooseLandingSite(system, planet, days, preferredLat = 31.5) {
  const basis = planetBasis(planet, days);
  const planetPos = planetOrbitPositionAU(planet, days);
  const star = system.stars?.[0];
  const sunPos = system.isHome ? { x: 0, y: 0, z: 0 } : starPositionAU(system, 0, days);
  const sunDir = normalize(sub(sunPos, planetPos));
  let best = { lat: preferredLat, lon: 0, altitude: -1 };
  for (let i = 0; i < 360; i += 2) {
    const lon = i;
    const frame = surfacePoint(basis, preferredLat, lon);
    const alt = Math.asin(clamp(dot(sunDir, frame.up), -1, 1)) * 180 / Math.PI;
    if (Math.abs(alt - 32) < Math.abs(best.altitude - 32)) best = { lat: preferredLat, lon, altitude: alt };
  }
  // Prefer a gentle later-afternoon sun and vary the local seed by longitude.
  return { lat: best.lat, lon: best.lon, sunAltitude: best.altitude };
}

export function sunDirection(system, planet, days) {
  const planetPos = planetOrbitPositionAU(planet, days);
  const sunPos = starPositionAU(system, 0, days);
  return normalize(sub(sunPos, planetPos));
}

export function angularDiameter(radiusKm, distanceKm) {
  return 2 * Math.atan(radiusKm / Math.max(1, distanceKm)) * 180 / Math.PI;
}

/**
 * Everything the surface sky needs to orient the sun, moons, planets and all
 * other system bodies. Returns directions in local surface coordinate space
 * (x = east, y = up, z = south) plus true angular diameters in degrees.
 */
export function computeSky(system, planet, days, lat, lon) {
  const basis = planetBasis(planet, days);
  const frame = surfacePoint(basis, lat, lon);
  const planetPos = planetOrbitPositionAU(planet, days);
  const sunPos = system.isHome ? { x: 0, y: 0, z: 0 } : starPositionAU(system, 0, days);
  const sunInertial = normalize(sub(sunPos, planetPos));
  const sunLocal = toLocalSurface(sunInertial, frame);
  const sunAltitude = Math.asin(clamp(sunLocal.y, -1, 1)) * 180 / Math.PI;
  const sunAzimuth = Math.atan2(sunLocal.x, -sunLocal.z);
  const starDirKm = Math.hypot(sunPos.x - planetPos.x, sunPos.y - planetPos.y, sunPos.z - planetPos.z) * AU_KM;
  const primary = system.stars?.[0] || { radiusKm: 696340, color: '#ffe3a0' };
  const sunAngular = angularDiameter(primary.radiusKm, starDirKm);
  const bodies = [];

  for (const star of system.stars || [primary]) {
    const idx = system.stars.indexOf(star);
    const sPos = starPositionAU(system, idx, days);
    const dir = normalize(sub(sPos, planetPos));
    if (idx !== 0) {
      const local = toLocalSurface(dir, frame);
      const distKm = Math.hypot(sPos.x - planetPos.x, sPos.y - planetPos.y, sPos.z - planetPos.z) * AU_KM;
      bodies.push({
        kind: 'star', id: `star-${idx}`, name: star.name, color: star.color,
        direction: local, angularDiameter: angularDiameter(star.radiusKm, distKm),
        light: 1,
      });
    }
  }
  // Moons of the current planet.
  for (const moon of (Array.isArray(planet.moons) ? planet.moons : [])) {
    const aAU = (moon.aKm || 384400) / AU_KM;
    const angle = days / (moon.periodDays || 27.3) * TAU + phaseFor(planet.seed || planet.id, moon.name, 3);
    const inc = 5.1 * Math.PI / 180;
    const rel = {
      x: Math.cos(angle) * aAU,
      y: Math.sin(angle) * aAU * Math.sin(inc),
      z: Math.sin(angle) * aAU * Math.cos(inc),
    };
    const dir = normalize(rel);
    bodies.push({
      kind: 'moon', id: `moon-${moon.name}`, name: moon.name, color: moon.color || '#b7b3aa',
      direction: toLocalSurface(dir, frame),
      angularDiameter: angularDiameter(moon.radiusKm, moon.aKm),
      radiusKm: moon.radiusKm, distanceKm: moon.aKm,
      phaseAngle: moonPhaseAngle(rel, sunInertial),
    });
  }
  // Sibling planets and their angular positions as seen from here.
  for (const other of system.planets || []) {
    if (other.id === planet.id) continue;
    const pos = planetOrbitPositionAU(other, days);
    const rel = sub(pos, planetPos);
    const distAU = Math.hypot(rel.x, rel.y, rel.z);
    if (distAU < 1e-6) continue;
    bodies.push({
      kind: 'planet', id: other.id, name: other.name, color: other.color,
      direction: toLocalSurface(normalize(rel), frame),
      angularDiameter: Math.min(4.5, angularDiameter(other.radiusKm, distAU * AU_KM)),
      distanceKm: distAU * AU_KM, radiusKm: other.radiusKm, planet: other,
    });
  }
  return {
    sun: { direction: sunLocal, altitude: sunAltitude, azimuth: sunAzimuth, color: primary.color, angularDiameter: sunAngular },
    bodies,
    frame,
    basis,
    planetPos,
    daylight: smoothstep(-8, 8, sunAltitude),
  };
}

function moonPhaseAngle(rel, sunDir) {
  // Angle between moon->sun and moon->observer.
  const toSun = normalize(rel);
  return Math.acos(clamp(dot(toSun, sunDir), -1, 1));
}

/**
 * Local sidereal clock approximation used by the HUD and night sky.
 */
export function localHourAngle(planet, days, lon) {
  const spinPeriodDays = Math.abs(planet.rotationHours || 24) / 24;
  const spin = (days / spinPeriodDays) * TAU + phaseFor(planet.seed || planet.id, planet.id, 7);
  const subsolar = 0.5; // approximate; visual sky is computed from the full basis
  const hour = ((spin - subsolar + lon * Math.PI / 180) % TAU + TAU) % TAU / TAU * 24;
  return hour;
}
