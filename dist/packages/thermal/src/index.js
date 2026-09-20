import { AU_KM, SOLAR_KG, clamp } from '@orbitarium/math';
export const MATERIAL_DENSITY = { iron: 7874, rock: 3300, water: 1000, hydrogen: 100 };
/** Zero-dimensional, gray-body radiative equilibrium, with a user-defined greenhouse offset. */
export function equilibriumTemperature(body, stars) { let flux = 0; for (const star of stars) {
    if (star.id === body.id)
        continue;
    const d = Math.hypot(...body.position.map((v, k) => v - star.position[k]));
    flux += star.luminosity / Math.max(d * d, star.radius ** 2, 1e-20);
} return Math.pow(2.725 ** 4 + 278.329 ** 4 * Math.max(0, 1 - body.albedo) * flux, 0.25) + body.greenhouse; }
export function materialRadius(mass, composition) { let invDensity = 0; for (const [material, fraction] of Object.entries(composition))
    invDensity += fraction / (MATERIAL_DENSITY[material] || 3300); const volume = mass * SOLAR_KG * invDensity; return Math.cbrt(volume * 3 / (4 * Math.PI)) / (AU_KM * 1000); }
export function surfaceState(temperature, water = 0) { if (temperature > 1800)
    return 'Molten surface'; if (temperature < 150)
    return 'Deep freeze'; if (water > 0.001) {
    if (temperature < 273.15)
        return 'Surface ice';
    if (temperature < 373.15)
        return 'Liquid-water temperature range';
    return 'Steam / vapor';
} return 'Dry surface'; }
export function stellarLuminosity(mass) { return mass < 0.43 ? 0.23 * mass ** 2.3 : mass < 2 ? mass ** 4 : mass < 55 ? 1.4 * mass ** 3.5 : 32000 * mass; }
export class ThermalEngine {
    step(s, dt) { const stars = []; for (let i = 0; i < s.count; i++)
        if (s.meta[i].luminosity > 0)
            stars.push(s.at(i)); for (let i = 0; i < s.count; i++) {
        const b = s.meta[i];
        if (b.kind === 'star' || b.kind === 'blackhole')
            continue;
        const target = equilibriumTemperature(s.at(i), stars);
        const t = 1 - Math.exp(-Math.abs(dt) / b.thermalDays);
        s.temperature[i] = clamp(s.temperature[i] + (target - s.temperature[i]) * t, 0, 1e9);
    } }
}
