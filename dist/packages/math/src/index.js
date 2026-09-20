/** Units throughout the simulation: astronomical units, days, and solar masses. */
export const AU_KM = 149597870.7;
export const DAY_S = 86400;
export const SOLAR_KG = 1.98847e30;
export const EARTH_MASS = 5.9722e24 / SOLAR_KG;
export const G = 0.0002959122082855911;
export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = a => Math.hypot(...a);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const scale = (a, s) => a.map(v => v * s);
export const normalize = a => scale(a, 1 / (length(a) || 1));
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const kmPerSecond = auPerDay => auPerDay * AU_KM / DAY_S;
export const auPerDay = kmps => kmps * DAY_S / AU_KM;
export function seededRandom(seed = 1) {
    let t = seed >>> 0;
    return () => { t += 0x6D2B79F5; let x = t; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}
export function colorRGB(hex) {
    const s = hex.replace('#', '');
    return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255);
}
export function finiteNumber(value, name, min = -Infinity, max = Infinity) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
        throw new RangeError(`${name} must be finite and between ${min} and ${max}`);
    return value;
}
/** Osculating two-body elements. Orbit plane uses z as the angular momentum axis. */
export function orbitalElements(p, v, mu) {
    const r = length(p), speed = length(v);
    if (!(mu > 0 && r > 0))
        return null;
    const h = cross(p, v), hmag = length(h), energy = speed * speed / 2 - mu / r;
    const eVector = sub(scale(cross(v, h), 1 / mu), scale(p, 1 / r));
    const eccentricity = length(eVector), semiMajor = -mu / (2 * energy);
    return { eccentricity, semiMajor, periapsis: semiMajor * (1 - eccentricity), apoapsis: energy < 0 ? semiMajor * (1 + eccentricity) : Infinity, period: energy < 0 ? TAU * Math.sqrt(semiMajor ** 3 / mu) : Infinity, inclination: hmag ? Math.acos(clamp(h[2] / hmag, -1, 1)) * 180 / Math.PI : 0, energy, angularMomentum: hmag, escapeSpeed: Math.sqrt(2 * mu / r) };
}
/** Initial conditions at true anomaly, rotated into a plane with inclination and ascending node. */
export function keplerState({ a = 1, e = 0, inclination = 0, node = 0, anomaly = 0, mu = G }) {
    if (![a, e, inclination, node, anomaly, mu].every(Number.isFinite) || !(a > 0 && e >= 0 && e < 1 && mu > 0))
        throw new RangeError('Bound Kepler orbit requires a > 0, 0 <= e < 1, mu > 0');
    const r = a * (1 - e * e) / (1 + e * Math.cos(anomaly)), h = Math.sqrt(mu * a * (1 - e * e));
    const rotate = ([x, y]) => [Math.cos(node) * x - Math.sin(node) * Math.cos(inclination) * y, Math.sin(node) * x + Math.cos(node) * Math.cos(inclination) * y, Math.sin(inclination) * y];
    return { position: rotate([r * Math.cos(anomaly), r * Math.sin(anomaly)]), velocity: rotate([-mu / h * Math.sin(anomaly), mu / h * (e + Math.cos(anomaly))]) };
}
