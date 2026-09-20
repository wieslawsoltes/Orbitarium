import { AU_KM, EARTH_MASS, G, TAU, keplerState, seededRandom } from '@orbitarium/math';
import { BodyStore } from '@orbitarium/core';
/** Rounded physical parameters. Initial conditions are illustrative, not dated ephemerides. */
export const CATALOG = [
    { key: 'sun', name: 'Sun', kind: 'star', mass: 1, radius: 695700 / AU_KM, temperature: 5772, luminosity: 1, color: '#ffd38b', composition: { hydrogen: 0.99, iron: 0.001, rock: 0.009, water: 0 } },
    { key: 'mercury', name: 'Mercury', kind: 'rocky', mass: 0.0553 * EARTH_MASS, radius: 2439.7 / AU_KM, temperature: 440, color: '#b1aaa1', a: 0.387, e: 0.2056, inclination: 7, albedo: 0.088 },
    { key: 'venus', name: 'Venus', kind: 'rocky', mass: 0.815 * EARTH_MASS, radius: 6051.8 / AU_KM, temperature: 737, color: '#dcb884', a: 0.723, e: 0.0068, inclination: 3.39, albedo: 0.76, greenhouse: 500 },
    { key: 'earth', name: 'Earth', kind: 'earth', mass: EARTH_MASS, radius: 6371 / AU_KM, temperature: 288, color: '#65a9f5', a: 1, e: 0.0167, inclination: 0, albedo: 0.3, greenhouse: 33, composition: { iron: 0.32, rock: 0.6798, water: 0.0002, hydrogen: 0 } },
    { key: 'mars', name: 'Mars', kind: 'rocky', mass: 0.1074 * EARTH_MASS, radius: 3389.5 / AU_KM, temperature: 210, color: '#d28262', a: 1.524, e: 0.0934, inclination: 1.85, albedo: 0.25, greenhouse: 5 },
    { key: 'jupiter', name: 'Jupiter', kind: 'gas', mass: 317.83 * EARTH_MASS, radius: 69911 / AU_KM, temperature: 165, color: '#d7b79a', a: 5.203, e: 0.0489, inclination: 1.303, albedo: 0.503, composition: { hydrogen: 0.95, iron: 0.02, rock: 0.03, water: 0 } },
    { key: 'saturn', name: 'Saturn', kind: 'gas', mass: 95.16 * EARTH_MASS, radius: 58232 / AU_KM, temperature: 134, color: '#d9c39b', a: 9.537, e: 0.0565, inclination: 2.485, rings: true, albedo: 0.342, composition: { hydrogen: 0.95, iron: 0.02, rock: 0.03, water: 0 } },
    { key: 'uranus', name: 'Uranus', kind: 'ice', mass: 14.536 * EARTH_MASS, radius: 25362 / AU_KM, temperature: 76, color: '#96dadd', a: 19.19, e: 0.046, inclination: 0.773, albedo: 0.3 },
    { key: 'neptune', name: 'Neptune', kind: 'ice', mass: 17.147 * EARTH_MASS, radius: 24622 / AU_KM, temperature: 72, color: '#648bde', a: 30.07, e: 0.0086, inclination: 1.77, albedo: 0.29 },
    { key: 'moon', name: 'Moon', kind: 'moon', mass: 0.0123 * EARTH_MASS, radius: 1737.4 / AU_KM, temperature: 220, color: '#bfc5d0', albedo: 0.12 },
    { key: 'comet', name: 'Comet', kind: 'comet', mass: 1e-14, radius: 8 / AU_KM, temperature: 80, color: '#93e4f2', composition: { water: 0.7, rock: 0.29, iron: 0.01, hydrogen: 0 } },
    { key: 'asteroid', name: 'Asteroid', kind: 'asteroid', mass: 1e-13, radius: 100 / AU_KM, temperature: 160, color: '#a19489' },
    { key: 'blackhole', name: 'Black hole', kind: 'blackhole', mass: 10, radius: 29.53 / AU_KM, temperature: 0, color: '#c0a1fa' },
    { key: 'redstar', name: 'Red dwarf', kind: 'star', mass: 0.2, radius: 150000 / AU_KM, temperature: 3200, luminosity: 0.008, color: '#ff906d', composition: { hydrogen: 0.99, iron: 0.001, rock: 0.009, water: 0 } },
    { key: 'bluestar', name: 'Blue giant', kind: 'star', mass: 8, radius: 2800000 / AU_KM, temperature: 18000, luminosity: 4000, color: '#a3ceff', composition: { hydrogen: 0.99, iron: 0.001, rock: 0.009, water: 0 } },
];
export const getTemplate = key => structuredClone(CATALOG.find(b => b.key === key) || CATALOG[3]);
export function addOrbit(store, template, parentId, { radius = 1, eccentricity = 0, inclination = 0, angle = 0, node = 0 } = {}) { const parent = store.body(parentId); if (!parent)
    throw new Error('Choose an existing primary'); const state = keplerState({ a: radius, e: eccentricity, inclination: inclination * Math.PI / 180, node: node * Math.PI / 180, anomaly: angle, mu: G * (parent.mass + template.mass) }); return store.add({ ...template, id: 0, position: state.position.map((v, k) => v + parent.position[k]), velocity: state.velocity.map((v, k) => v + parent.velocity[k]), seed: Math.floor((((angle % TAU) + TAU) % TAU) * 12345) }); }
export function centerBarycenter(s) { let mass = 0, p = [0, 0, 0], v = [0, 0, 0]; for (let i = 0; i < s.count; i++) {
    mass += s.mass[i];
    for (let k = 0; k < 3; k++) {
        p[k] += s.position[i * 3 + k] * s.mass[i];
        v[k] += s.velocity[i * 3 + k] * s.mass[i];
    }
} if (!mass)
    return; for (let i = 0; i < s.count; i++)
    for (let k = 0; k < 3; k++) {
        s.position[i * 3 + k] -= p[k] / mass;
        s.velocity[i * 3 + k] -= v[k] / mass;
    } }
export function addBelt(s, parentId, { count = 180, inner = 2.1, outer = 3.3, seed = 7, mass = 1e-16 } = {}) { const rng = seededRandom(seed), ids = []; for (let i = 0; i < count; i++)
    ids.push(addOrbit(s, { ...getTemplate('asteroid'), name: `Belt ${i + 1}`, mass, radius: (2 + rng() * 15) / AU_KM, tracer: true, color: ['#b1a19d', '#8d878d', '#c9b5a4'][i % 3] }, parentId, { radius: inner + (outer - inner) * rng(), eccentricity: rng() * 0.07, inclination: (rng() - 0.5) * 8, angle: rng() * TAU })); return ids; }
export const SCENARIOS = [
    { id: 'solar', name: 'The Solar System', subtitle: 'A familiar place. Infinite possibilities.', tag: 'EXPLORE', icon: 'sun', description: 'Eight planets, our Moon, and an asteroid belt. Rounded real masses and radii; illustrative orbital phases.' },
    { id: 'binary', name: 'Two suns', subtitle: 'A gravitational duet.', tag: 'DYNAMICS', icon: 'binary', description: 'A barycentric binary star system with circumbinary planets.' },
    { id: 'impact', name: 'Worlds collide', subtitle: 'One small nudge. A different world.', tag: 'COLLISION', icon: 'impact', description: 'A near head-on planetary collision. Watch mass and momentum combine, then inspect impact heating.' },
    { id: 'saturn', name: 'The ring laboratory', subtitle: 'A thousand paths around one giant.', tag: 'PARTICLES', icon: 'rings', description: 'Saturn surrounded by 900 dynamically simulated ring particles. Barnes–Hut activates automatically.' },
    { id: 'chaos', name: 'Three-body problem', subtitle: 'Simple rules. Unpredictable futures.', tag: 'CHAOS', icon: 'chaos', description: 'Three mutually interacting stars. Change a mass or velocity to discover sensitive dependence.' },
    { id: 'galaxy', name: 'Island universes', subtitle: 'A dance across deep space.', tag: 'GALAXIES', icon: 'galaxy', description: 'Two stylized stellar disks around massive central bodies. Newtonian toy model, not a cosmological simulation.' },
    { id: 'rogue', name: 'The visitor', subtitle: 'Something is entering the system.', tag: 'EXPERIMENT', icon: 'comet', description: 'An eccentric comet and a passing star perturb an inner planetary system.' },
    { id: 'empty', name: 'A blank universe', subtitle: 'Make something extraordinary.', tag: 'CREATE', icon: 'plus', description: 'Empty space, ready for your first star.' }
];
export function createScenario(key = 'solar') {
    const s = new BodyStore(256);
    let selected = null, span = 7, speed = 10;
    const rng = seededRandom(17);
    const sun = () => s.add({ ...getTemplate('sun'), position: [0, 0, 0], velocity: [0, 0, 0] });
    if (key === 'solar' || key === 'rogue') {
        const primary = sun();
        for (let i = 1; i <= 8; i++) {
            const b = getTemplate(CATALOG[i].key);
            const id = addOrbit(s, b, primary, { radius: b.a, eccentricity: b.e, inclination: b.inclination, angle: [0, 1.6, 3.8, 4.65, 0.4, 2.5, 5.4, 1.4, 4.3][i], node: i * 24 });
            if (b.key === 'earth') {
                selected = id;
                addOrbit(s, getTemplate('moon'), id, { radius: 384400 / AU_KM, angle: 0.4, inclination: 5.145 });
            }
        }
        addBelt(s, primary, { count: 180 });
        if (key === 'rogue') {
            addOrbit(s, getTemplate('comet'), primary, { radius: 6, eccentricity: 0.87, inclination: 20, angle: 2.8 });
            s.add({ ...getTemplate('redstar'), position: [-9, 2, 1], velocity: [0.004, -0.001, 0] });
            span = 12;
            speed = 20;
        }
    }
    else if (key === 'binary') {
        const a = s.add({ ...getTemplate('sun'), name: 'Aster A', position: [-0.5, 0, 0], velocity: [0, -Math.sqrt(G * 2) / 2, 0] }), b = s.add({ ...getTemplate('redstar'), name: 'Aster B', mass: 1, luminosity: 0.6, position: [0.5, 0, 0], velocity: [0, Math.sqrt(G * 2) / 2, 0] });
        for (let i = 0; i < 4; i++) {
            const t = getTemplate(['earth', 'jupiter', 'mars', 'neptune'][i]);
            const r = 3.5 + i * 2;
            s.add({ ...t, position: [r * Math.cos(i * 1.5), r * Math.sin(i * 1.5), 0], velocity: [-Math.sin(i * 1.5) * Math.sqrt(G * 2 / r), Math.cos(i * 1.5) * Math.sqrt(G * 2 / r), 0] });
        }
        selected = a;
        span = 7;
        speed = 15;
    }
    else if (key === 'impact') {
        const earth = getTemplate('earth');
        selected = s.add({ ...earth, position: [-0.00035, 0, 0], velocity: [0.0003, 0, 0] });
        s.add({ ...getTemplate('mars'), mass: 0.5 * EARTH_MASS, radius: 5300 / AU_KM, name: 'Theia', position: [0.00035, 0.00002, 0], velocity: [-0.0006, 0, 0] });
        span = 0.0012;
        speed = 0.08;
    }
    else if (key === 'saturn') {
        selected = s.add({ ...getTemplate('saturn'), position: [0, 0, 0], velocity: [0, 0, 0] });
        addBelt(s, selected, { count: 900, inner: 90000 / AU_KM, outer: 260000 / AU_KM, mass: 1e-20 });
        span = 0.0028;
        speed = 0.03;
    }
    else if (key === 'chaos') {
        const setup = [[-1, 0, 0], [1, 0, 0], [0, 1.4, 0.1]];
        for (let i = 0; i < 3; i++)
            s.add({ ...getTemplate(['sun', 'redstar', 'bluestar'][i]), mass: [1, 0.8, 1.2][i], luminosity: [1, 0.3, 1.8][i], name: `Star ${String.fromCharCode(65 + i)}`, position: setup[i], velocity: [[0, -0.004, 0], [0, 0.008, 0], [-0.006, 0, 0]][i] });
        selected = 1;
        span = 4;
        speed = 10;
    }
    else if (key === 'galaxy') {
        for (let disk = 0; disk < 2; disk++) {
            const center = [disk ? 25 : -25, disk ? 8 : -8, 0], vel = [disk ? -0.04 : 0.04, disk ? -0.009 : 0.009, 0];
            const id = s.add({ ...getTemplate('blackhole'), name: disk ? 'Andromeda analogue' : 'Milky Way analogue', mass: 1200, radius: 0.001, position: center, velocity: vel });
            for (let i = 0; i < 450; i++) {
                const r = 1 + Math.sqrt(rng()) * 17, angle = rng() * TAU, orb = keplerState({ a: r, e: rng() * 0.08, anomaly: angle, inclination: disk ? 0.6 : 0.02, mu: G * 1200 });
                s.add({ ...getTemplate('asteroid'), kind: 'fragment', name: `Star particle ${disk * 450 + i + 1}`, tracer: true, mass: 0.1, radius: 0.00001, color: disk ? '#c2a7f5' : '#8ecce9', temperature: 4000, position: orb.position.map((v, k) => v + center[k]), velocity: orb.velocity.map((v, k) => v + vel[k]) });
            }
            selected = id;
        }
        span = 42;
        speed = 20;
    }
    centerBarycenter(s);
    return { store: s, selected: selected ?? s.meta[0]?.id ?? null, span, speed, title: SCENARIOS.find(p => p.id === key)?.name || 'Untitled universe', key };
}
