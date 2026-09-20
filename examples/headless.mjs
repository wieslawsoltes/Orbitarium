/** Run after npm install: node examples/headless.mjs */
import { createScenario } from '@orbitarium/celestial';
import { Simulation } from '@orbitarium/simulation';
import { stringifyProject } from '@orbitarium/persistence';
import { writeFile } from 'node:fs/promises';

const scenario = createScenario('impact');
const simulation = new Simulation(scenario.store);
simulation.settings.softening = 1e-9;
simulation.events.subscribe(event => console.log(event.type, event.names, event.time));

for (let i = 0; i < 1000 && simulation.store.count > 1; i++) {
  // Always use the actual time returned; requested speed may be accuracy-limited.
  await simulation.advance(0.005);
}

console.log({ days: simulation.time, bodies: simulation.store.count,
  mass: simulation.diagnostics().mass, temperature: simulation.store.temperature[0] });
await writeFile('impact-result.orbitarium.json', stringifyProject(simulation.snapshot()));
