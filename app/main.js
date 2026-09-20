import { AU_KM, DAY_S, SOLAR_KG, EARTH_MASS, G, TAU, clamp } from '@orbitarium/math';
import { length, sub, cross, normalize, scale, orbitalElements, kmPerSecond, auPerDay } from '@orbitarium/math';
import { CommandHistory } from '@orbitarium/core';
import { CATALOG, SCENARIOS, createScenario, getTemplate, addOrbit } from '@orbitarium/celestial';
import { Simulation } from '@orbitarium/simulation';
import { stableStep } from '@orbitarium/gravity';
import { materialRadius, surfaceState } from '@orbitarium/thermal';
import { createGPUDevice, GPUGravity } from '@orbitarium/gpu';
import { UniverseRenderer } from '@orbitarium/renderer';
import { ProjectLibrary, parseProject, stringifyProject, validateProject, downloadBlob } from '@orbitarium/persistence';
import { $, $$, el, icon, hydrateIcons, number, toast, openDialog, bindTabs, VirtualList, CommandPalette } from '@orbitarium/ui';
const KIND_NAMES = { star: 'Star', earth: 'Terrestrial planet', rocky: 'Rocky planet', gas: 'Gas giant', ice: 'Ice giant', moon: 'Natural satellite', asteroid: 'Asteroid', comet: 'Comet', blackhole: 'Black hole', fragment: 'Fragment' };
const MATERIAL_COLORS = { iron: '#9795a8', rock: '#ac9278', water: '#769ec7', hydrogen: '#c1a5dc' };
const history = new CommandHistory(24), library = new ProjectLibrary();
let scenario = createScenario('solar'), sim = new Simulation(scenario.store), selected = scenario.selected, speed = scenario.speed, paused = false, title = scenario.title, scenarioKey = 'solar';
let renderer, inflight = null, ready = false, tool = 'select', launchTemplate = null, addingTemplate = getTemplate('earth'), lastUI = 0, lastMetrics = 0, lastRecord = 0, lastAutosave = 0, lastWall = performance.now(), fps = 60, frames = 0;
let records = [], observations = [], eventLog = [], metrics = sim.diagnostics(), lastListSignature = '', lastDetailId = null, autoSaveFailed = false, dirty = true, editing = false;
let storageReady = false, actualRate = 0, initialSpan = scenario.span;
const safe = fn => (...args) => { try {
    return Promise.resolve(fn(...args)).catch(reportError);
}
catch (error) {
    reportError(error);
} };
function reportError(error) { console.error(error); toast(error?.message || String(error), { type: 'error', duration: 6000 }); }
function setText(selector, text) { const n = $(selector); if (n && n.textContent !== String(text))
    n.textContent = String(text); }
function setValue(selector, value) { const n = $(selector); if (n && document.activeElement !== n && n.value !== String(value))
    n.value = String(value); }
function formatElapsed(days) { return days >= 36525 ? `${number(days / 365.25, 2)} years` : days >= 365.25 ? `${number(days / 365.25, 3)} years` : `${number(days, 3)} days`; }
function snapshot() { return { ...sim.snapshot(), metadata: { title, scenario: scenarioKey, speed, selected }, camera: renderer?.camera.toJSON() }; }
async function idle() { if (inflight)
    await inflight; }
function invalidate() { dirty = true; lastListSignature = ''; lastDetailId = null; renderer?.reset(); sim.resetBaseline(); metrics = sim.diagnostics(); updateUI(true); }
async function edit(label, action) { const wasPaused = paused; paused = true; editing = true; await idle(); const before = snapshot(); try {
    await action();
    const after = snapshot();
    history.record(label, before, after);
    records = [];
    recordState();
    invalidate();
}
catch (e) {
    await restoreProject(before, { record: false, keepPaused: true });
    throw e;
}
finally {
    editing = false;
    paused = wasPaused;
    updateTransport();
} }
async function restoreProject(project, { record = false, keepPaused = false } = {}) { const data = validateProject(project); paused = true; await idle(); sim.restore(data); selected = data.metadata?.selected; title = data.metadata?.title || 'Untitled universe'; scenarioKey = data.metadata?.scenario || 'custom'; speed = data.metadata?.speed || 10; renderer.camera.restore(data.camera); renderer.focusEase = null; initialSpan = renderer.camera.span; eventLog = []; if (!record) {
    records = [];
    observations = [];
} invalidate(); if (!keepPaused)
    paused = false; updateTransport(); recordState(); }
async function loadScenario(key) { paused = true; await idle(); scenario = createScenario(key); sim.store = scenario.store; sim.time = 0; sim.settings = { gravity: 1, softening: key === 'impact' || key === 'saturn' ? 1e-9 : 1e-7, collisions: 'merge', thermal: true, maxStep: 1, maxSubsteps: 12, theta: .55 }; selected = scenario.selected; speed = scenario.speed; title = scenario.title; scenarioKey = key; initialSpan = scenario.span; renderer.camera.target = [0, 0, 0]; renderer.camera.span = scenario.span; renderer.camera.yaw = -.30; renderer.camera.pitch = .62; renderer.camera.follow = null; renderer.focusEase = null; eventLog = []; records = []; observations = []; history.clear(); setTool('select'); invalidate(); paused = false; recordState(); updateTransport(); $$('dialog').forEach(d => d.close()); document.body.classList.remove('explorer-open', 'inspector-open'); toast(`${title} loaded`, { duration: 2500 }); }
function selectBody(id) { selected = sim.store.index(id) >= 0 ? id : null; lastDetailId = null; lastListSignature = ''; updateUI(true); if (innerWidth <= 620 && selected != null)
    document.body.classList.add('inspector-open'); }
function focusSelected() { const b = sim.store.body(selected); if (b) {
    renderer.focus(b);
    toast(`Following ${b.name} · H to frame the system`, { duration: 2200 });
    document.body.classList.remove('inspector-open');
} }
function homeView() { renderer.camera.follow = null; renderer.focusEase = null; renderer.camera.target = [0, 0, 0]; renderer.camera.span = initialSpan; renderer.camera.pitch = .62; renderer.camera.yaw = -.30; renderer.measurement = null; }
function setTool(value) { tool = value; $('#stage').dataset.tool = value; for (const b of $$('[data-tool]')) {
    const active = b.dataset.tool === value;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
} if (value !== 'measure')
    renderer.measurement = null; if (value !== 'launch')
    launchTemplate = null; const hints = { move: 'Drag a body to reposition · Release to apply', measure: 'Click two bodies or points to measure distance', launch: 'Drag from a launch point to set initial velocity' }; if (hints[value])
    $('#viewport-hint').replaceChildren(el('span', { text: hints[value] }));
else
    $('#viewport-hint').replaceChildren(el('span', { text: 'Drag to orbit' }), el('i', { text: '·' }), el('span', { text: 'Scroll to explore' }), el('i', { text: '·' }), el('span', { text: 'Double-click to follow' })); }
function toggleView(name) { renderer.options[name] = !renderer.options[name]; updateViewControls(); }
function updateViewControls() { for (const b of $$('[data-view]')) {
    const enabled = renderer.options[b.dataset.view];
    b.classList.toggle('active', enabled);
    b.setAttribute('aria-pressed', String(enabled));
} for (const input of $$('[data-setting-view]'))
    input.checked = !!renderer.options[input.dataset.settingView]; setText('#scale-chip', renderer.options.trueScale ? 'Physical radii · minimum point markers' : 'Sizes exaggerated'); }
function updateTransport() { const play = $('#play-pause'); play.innerHTML = icon(paused ? 'play' : 'pause', 20); play.setAttribute('aria-label', paused ? 'Play simulation' : 'Pause simulation'); setText('#live-label', paused ? 'SIMULATION PAUSED' : 'LIVE SIMULATION'); $('#live-dot').style.background = paused ? '#a891c6' : '#81c3a7'; setText('#speed-label', speed < 1 ? `${number(speed * 24, 2)} hrs / sec` : `${number(speed, 1)} days / sec`); setValue('#speed', Math.log10(speed)); $('#step-sim').disabled = editing; }
function refreshList() { const query = $('#body-search').value.trim().toLowerCase(), all = $('#show-particles').checked, s = sim.store, signature = [s.version, selected, query, all, s.count].join('|'); if (signature === lastListSignature)
    return; lastListSignature = signature; const bodies = s.toJSON().filter(b => (all || !b.tracer) && (!query || b.name.toLowerCase().includes(query))).sort((a, b) => a.id - b.id); bodyList.setItems(bodies, selected); setText('#body-count', s.count); setText('#particle-count', `${s.meta.filter(b => b.tracer).length} particles`); setText('#system-label', title.toUpperCase().slice(0, 22)); }
const bodyList = new VirtualList($('#body-list'), { rowHeight: 40, onSelect: b => selectBody(b.id), renderRow: (b, isSelected) => { const row = el('div', { class: `body-row${isSelected ? ' selected' : ''}`, 'data-body-id': b.id, title: `${b.name} · ${KIND_NAMES[b.kind]}` }); row.append(el('span', { class: `body-dot ${b.kind}`, style: { background: b.color } }), el('div', { class: 'body-info' }, el('span', { class: 'body-name', text: b.name }), el('span', { class: 'body-type', text: KIND_NAMES[b.kind] })), el('span', { class: 'row-distance', text: b.kind === 'star' ? '★' : b.rings ? '◯' : '' })); return row; } });
function fillVectorFields() { for (const [selector, property, unit] of [['#position-fields', 'position', 'AU'], ['#velocity-fields', 'velocity', 'km/s']]) {
    for (let k = 0; k < 3; k++) {
        const input = el('input', { type: 'number', step: 'any', id: `edit-${property}-${k}`, 'aria-label': `${property} ${'XYZ'[k]} in ${unit}` });
        input.addEventListener('change', safe(() => edit(`Edit ${property}`, () => { const b = sim.store.body(selected); if (!b)
            return; const val = Number(input.value); if (!Number.isFinite(val))
            throw new Error('Enter a finite value'); b[property][k] = property === 'velocity' ? auPerDay(val) : val; sim.store.update(selected, { [property]: b[property] }); })));
        $(selector).append(el('label', { class: 'property-field' }, el('span', { text: 'XYZ'[k] }), el('div', {}, input, el('span', { text: unit }))));
    }
} }
function updateInspector() {
    const b = sim.store.body(selected);
    $('#object-detail').hidden = !b;
    $('#no-selection').hidden = !!b;
    for (const id of ['#explode', '#inspector-focus', '#focus-object', '#delete-body', '#duplicate'])
        $(id).disabled = !b;
    if (!b)
        return;
    const primary = renderer.primary(sim.store, b), relative = primary ? sub(b.position, primary.position) : null;
    const forceRefresh = lastDetailId !== b.id;
    if (forceRefresh) {
        lastDetailId = b.id;
        const preview = $('#planet-preview');
        preview.className = `planet-preview ${b.kind}`;
        preview.style.setProperty('--planet-color', b.color);
        setText('#object-kind', KIND_NAMES[b.kind].toUpperCase());
        setText('#object-id', `OBJECT ${String(b.id).padStart(3, '0')}`);
    }
    setValue('#object-name', b.name);
    setValue('#edit-mass', Number((b.mass / EARTH_MASS).toPrecision(7)));
    setValue('#edit-radius', Number((b.radius * AU_KM).toPrecision(7)));
    setValue('#edit-temperature', Number(b.temperature.toFixed(b.temperature > 10000 ? 0 : 1)));
    setValue('#edit-albedo', b.albedo);
    setText('#albedo-output', b.albedo.toFixed(2));
    setValue('#edit-greenhouse', b.greenhouse);
    setValue('#edit-luminosity', b.luminosity);
    $('#luminosity-field').hidden = b.kind !== 'star';
    setValue('#edit-color', b.color);
    setValue('#edit-spin', b.spin);
    if (document.activeElement !== $('#edit-rings'))
        $('#edit-rings').checked = b.rings;
    if (document.activeElement !== $('#edit-visible'))
        $('#edit-visible').checked = b.visible;
    const density = b.mass * SOLAR_KG / (4 / 3 * Math.PI * (b.radius * AU_KM * 1000) ** 3) / 1000, surfaceG = G * b.mass / b.radius ** 2 * AU_KM * 1000 / (DAY_S ** 2);
    readout('#stat-density', number(density, 3), 'g/cm³');
    readout('#stat-gravity', number(surfaceG, 3), 'm/s²');
    readout('#stat-speed', number(kmPerSecond(length(b.velocity)), 3), 'km/s');
    readout('#stat-distance', relative ? number(length(relative), 5) : '—', relative ? 'AU' : '');
    setText('#stat-primary', primary?.name || 'None');
    $('#temperature-marker').style.left = `${clamp((b.temperature - 100) / 600, 0, 1) * 100}%`;
    $('#surface-state span:last-child').textContent = surfaceState(b.temperature, b.kind === 'earth' ? 0.01 : b.composition.water);
    const elements = primary ? orbitalElements(relative, sub(b.velocity, primary.velocity), G * sim.settings.gravity * (primary.mass + b.mass)) : null;
    if (!$('#orbit-panel').hidden || forceRefresh) {
        const rows = elements ? [['Semi-major axis', number(elements.semiMajor, 6), 'AU'], ['Eccentricity', number(elements.eccentricity, 5), ''], ['Period', Number.isFinite(elements.period) ? number(elements.period, 2) : 'Unbound', Number.isFinite(elements.period) ? 'days' : ''], ['Inclination', number(elements.inclination, 3), '°'], ['Periapsis', number(elements.periapsis, 6), 'AU'], ['Apoapsis', number(elements.apoapsis, 6), 'AU'], ['Escape speed', number(kmPerSecond(elements.escapeSpeed), 3), 'km/s']] : [['Primary', 'No orbit reference', '']];
        $('#orbit-stats').replaceChildren(...rows.map(([name, value, unit]) => el('div', { class: 'readout-row' }, el('span', { text: name }), el('strong', {}, value, el('small', { text: unit })))));
        for (let k = 0; k < 3; k++) {
            setValue(`#edit-position-${k}`, Number(b.position[k].toPrecision(8)));
            setValue(`#edit-velocity-${k}`, Number(kmPerSecond(b.velocity[k]).toPrecision(8)));
        }
    }
    for (const material of Object.keys(MATERIAL_COLORS)) {
        setValue(`#material-${material}`, b.composition[material] * 100);
        setText(`#material-output-${material}`, `${number(b.composition[material] * 100, 2)}%`);
    }
    $('#composition-bar').replaceChildren(...Object.keys(MATERIAL_COLORS).map(k => el('span', { style: { width: `${b.composition[k] * 100}%`, background: MATERIAL_COLORS[k] }, title: `${k}: ${number(b.composition[k] * 100, 2)}%` })));
}
function readout(selector, value, unit) { $(selector).replaceChildren(document.createTextNode(value), el('small', { text: unit })); }
function updateUI(force = false) { if (!renderer)
    return; refreshList(); updateInspector(); setText('#project-name', title); setText('#scene-title', title); setText('#scene-subtitle', SCENARIOS.find(p => p.id === scenarioKey)?.subtitle || 'Your rules. A universe of possibilities.'); const elapsed = formatElapsed(sim.time), lastSpace = elapsed.lastIndexOf(' '); $('#elapsed').replaceChildren(el('span', { text: elapsed.slice(0, lastSpace) }), document.createTextNode(' '), el('small', { text: elapsed.slice(lastSpace + 1) })); setText('#status-body-count', `${sim.store.count} bodies`); setText('#status-solver', sim.last.backend); setText('#status-time', `Δt ${number(sim.last.steps ? sim.last.advanced / sim.last.steps : 0, 5)} d`); setText('#status-energy', `ΔE ${number(metrics.relativeEnergyError * 100, 5)}%`); setText('#fps', `${Math.round(fps)} FPS`); setText('#effective-speed', sim.last.capped ? `Accuracy limited · ${number(actualRate, 2)} d/s actual` : 'Real-time N-body integration'); $('#effective-speed').classList.toggle('limited', sim.last.capped); const b = sim.store.body(renderer.camera.follow); $('#follow-chip').hidden = !b; if (b)
    setText('#follow-name', b.name); $('#save-dot').style.background = dirty ? '#b7a074' : '#8fc3a9'; if (force) {
    updateTransport();
    updateViewControls();
    renderLog();
} }
function recordState() { if (!renderer)
    return; const project = snapshot(); records.push(project); if (records.length > 90)
    records.shift(); const range = $('#history-scrub'); range.max = String(records.length - 1); range.value = range.max; setText('#history-range', `${formatElapsed(records[0].time)} → ${formatElapsed(sim.time)}`); setText('#history-mid', formatElapsed(records[Math.floor((records.length - 1) / 2)].time)); }
async function scrubHistory(index) { const state = records[index]; if (!state)
    return; paused = true; await idle(); sim.restore(state); selected = state.metadata.selected; renderer.reset(); records = records.slice(0, index + 1); $('#history-scrub').max = String(records.length - 1); $('#history-scrub').value = String(records.length - 1); metrics = sim.diagnostics(); lastListSignature = ''; dirty = true; updateUI(true); toast(`Restored ${formatElapsed(sim.time)} · paused`, { duration: 2200 }); }
function renderLog() { setText('#event-count', eventLog.length); const box = $('#event-log'); if (!eventLog.length) {
    box.replaceChildren(el('div', { class: 'empty-log' }, el('span', { class: 'pulse-dot' }), 'Watching the universe unfold.'));
    return;
} box.replaceChildren(...eventLog.slice(-30).reverse().map(e => el('div', { class: 'log-entry' }, el('time', { text: formatElapsed(e.time) }), el('span', { text: e.type === 'collision' ? `${e.names.join(' + ')} merged` : e.type === 'bounce' ? `${e.names.join(' + ')} bounced` : `${e.names[0]} fragmented` })))); }
sim.events.subscribe(event => { renderer?.burst(event); eventLog.push(event); if (eventLog.length > 100)
    eventLog.shift(); if (event.removed === selected)
    selected = event.survivor; lastListSignature = ''; renderLog(); });
function buildScenarioCards() { for (const scenario of SCENARIOS) {
    const thumbnail = el('div', { class: `scenario-thumbnail ${scenario.id}` });
    thumbnail.innerHTML = icon(scenario.icon, 65);
    const card = el('button', { class: 'scenario-card', 'data-scenario': scenario.id, title: scenario.description, onclick: safe(() => loadScenario(scenario.id)) }, thumbnail, el('div', { class: 'scenario-meta' }, el('span', { class: 'tag', text: scenario.tag }), el('h3', { text: scenario.name }), el('p', { text: scenario.subtitle })));
    $('#scenario-grid').append(card);
} }
function buildCatalog() { for (const template of CATALOG) {
    const option = el('button', { class: 'template-option', 'data-template': template.key, type: 'button', onclick: () => chooseTemplate(template.key) }, el('span', { class: `body-dot ${template.kind}`, style: { background: template.color } }), template.name);
    $('#add-catalog').append(option);
    const card = el('button', { class: 'catalog-card', onclick: () => openAdd(template.key) }, el('span', { class: `body-dot ${template.kind}`, style: { background: template.color } }), el('div', {}, el('strong', { text: template.name }), el('small', { text: KIND_NAMES[template.kind] })), el('span', { class: 'plus-mark', text: '+' }));
    $('#catalog-list').append(card);
} }
function chooseTemplate(key) { addingTemplate = getTemplate(key); for (const button of $$('[data-template]'))
    button.classList.toggle('selected', button.dataset.template === key); setValue('#add-name', sim.store.meta.some(b => b.name === addingTemplate.name) ? `New ${addingTemplate.name}` : addingTemplate.name); setValue('#add-mass', Number((addingTemplate.mass / EARTH_MASS).toPrecision(8))); setValue('#add-radius', Number((addingTemplate.radius * AU_KM).toPrecision(8))); setText('#add-template-title', addingTemplate.name); setText('#add-template-type', KIND_NAMES[addingTemplate.kind]); const preview = $('#add-preview'); preview.className = `planet-preview ${addingTemplate.kind}`; preview.style.setProperty('--planet-color', addingTemplate.color); if (key === 'moon' && selected) {
    setValue('#add-primary', selected);
    setValue('#add-orbit-radius', .003);
}
else
    setValue('#add-orbit-radius', addingTemplate.a || 2); }
function openAdd(key = 'earth') { const primary = $('#add-primary'); const list = sim.store.toJSON().filter(b => !b.tracer).sort((a, b) => b.mass - a.mass); primary.replaceChildren(...list.map(b => el('option', { value: b.id, text: b.name }))); $('#add-mode option[value=orbit]').disabled = !list.length; $('#add-mode').value = list.length ? 'orbit' : 'origin'; chooseTemplate(key); placementModeChanged(); openDialog($('#add-dialog')); }
function placementModeChanged() { const mode = $('#add-mode').value; $('#orbital-placement').hidden = mode !== 'orbit'; setText('#placement-note', mode === 'orbit' ? 'Initial velocity is calculated from the selected primary’s mass.' : mode === 'launch' ? 'After adding, drag in the viewport from the launch point toward the desired velocity.' : 'The object will be placed at the camera center with zero velocity.'); }
async function submitAdd(event) {
    event.preventDefault();
    const b = { ...addingTemplate, name: $('#add-name').value, mass: Number($('#add-mass').value) * EARTH_MASS, radius: Number($('#add-radius').value) / AU_KM, id: 0 }, mode = $('#add-mode').value;
    if (mode === 'launch') {
        launchTemplate = b;
        tool = 'launch';
        $('#stage').dataset.tool = 'launch';
        $('#add-dialog').close();
        $('#viewport-hint').replaceChildren(el('span', { text: `Drag in space to launch ${b.name} · Esc cancels` }));
        document.body.classList.remove('inspector-open', 'explorer-open');
        return;
    }
    await edit('Add object', () => { if (mode === 'orbit') {
        const radius = Number($('#add-orbit-radius').value), parent = Number($('#add-primary').value);
        const id = addOrbit(sim.store, b, parent, { radius, eccentricity: Number($('#add-eccentricity').value), inclination: Number($('#add-inclination').value), angle: Number($('#add-angle').value) * Math.PI / 180 });
        selected = id;
        const added = sim.store.body(id), p = sim.store.body(parent);
        if (sim.settings.gravity !== 1 && p)
            sim.store.update(id, { velocity: added.velocity.map((v, k) => p.velocity[k] + (v - p.velocity[k]) * Math.sqrt(sim.settings.gravity)) });
    }
    else
        selected = sim.store.add({ ...b, position: [...renderer.camera.target], velocity: [0, 0, 0] }); });
    $('#add-dialog').close();
    toast(`${b.name} added`, { type: 'success' });
}
function bindProperty(id, property, convert = v => Number(v)) { const input = $(id); input.addEventListener('change', safe(() => edit(`Edit ${property}`, () => { if (selected != null)
    sim.store.update(selected, { [property]: convert(input.type === 'checkbox' ? input.checked : input.value) }); }))); }
function buildComposition() { for (const [material, color] of Object.entries(MATERIAL_COLORS)) {
    const input = el('input', { type: 'range', min: 0, max: 100, step: .1, id: `material-${material}`, 'aria-label': `${material} mass fraction` });
    input.addEventListener('input', () => setText(`#material-output-${material}`, `${input.value}%`));
    input.addEventListener('change', safe(() => edit('Edit composition', () => { const b = sim.store.body(selected); if (!b)
        return; const target = Number(input.value) / 100, composition = { ...b.composition }, other = 1 - composition[material], keys = Object.keys(composition).filter(k => k !== material); for (const k of keys)
        composition[k] = other > 1e-8 ? composition[k] / other * (1 - target) : (1 - target) / 3; composition[material] = target; sim.store.update(selected, { composition }); })));
    $('#composition-fields').append(el('label', { class: 'range-field' }, el('span', {}, el('span', { class: 'material-label', text: material, style: { color } }), el('output', { id: `material-output-${material}`, text: '0%' })), input));
} }
function openSettings() { setValue('#setting-solver', sim.backend); setValue('#setting-gravity', sim.settings.gravity); setValue('#setting-softening', sim.settings.softening); setValue('#setting-max-step', sim.settings.maxStep); setValue('#setting-substeps', sim.settings.maxSubsteps); setValue('#setting-collisions', sim.settings.collisions); $('#setting-thermal').checked = sim.settings.thermal; updateViewControls(); openDialog($('#settings-dialog')); }
function buildSettings() {
    const choices = [['grid', 'Reference grid'], ['habitable', 'Illustrative habitable zone'], ['vectors', 'Velocity vectors'], ['trueScale', 'Physical body radii'], ['heatmap', 'Temperature colors']];
    for (const [key, label] of choices) {
        const input = el('input', { type: 'checkbox', 'data-setting-view': key });
        input.addEventListener('change', () => { renderer.options[key] = input.checked; updateViewControls(); });
        $('#view-settings').append(el('label', { class: 'check-row' }, el('span', { text: label }), input));
    }
    const settingIds = { '#setting-gravity': 'gravity', '#setting-softening': 'softening', '#setting-max-step': 'maxStep', '#setting-substeps': 'maxSubsteps', '#setting-collisions': 'collisions', '#setting-thermal': 'thermal' };
    for (const [id, key] of Object.entries(settingIds)) {
        const input = $(id);
        input.addEventListener('change', safe(() => edit(`Change ${key}`, () => { const value = input.type === 'checkbox' ? input.checked : key === 'collisions' ? input.value : Number(input.value); if (input.type === 'number' && !input.checkValidity())
            throw new Error(`Invalid ${key} setting`); sim.settings[key] = value; })));
    }
    $('#setting-solver').addEventListener('change', safe(async () => { await idle(); const value = $('#setting-solver').value; if (value === 'gpu' && !sim.gpu?.available)
        throw new Error('GPU compute is unavailable on this device'); sim.backend = value; sim.resetBaseline(); toast(`Solver: ${$('#setting-solver').selectedOptions[0].textContent}`); }));
    $('#setting-exposure').addEventListener('input', () => { renderer.options.exposure = Number($('#setting-exposure').value); setText('#exposure-output', renderer.options.exposure.toFixed(2)); });
}
function addObservation() { const b = sim.store.body(selected); observations.push({ time: sim.time, energy: metrics.relativeEnergyError, temperature: b?.temperature ?? 0, speed: b ? kmPerSecond(length(b.velocity)) : 0, bodies: sim.store.count, selected: b?.name || '' }); if (observations.length > 1200)
    observations.shift(); if ($('#analytics-dialog').open)
    renderAnalytics(); }
function renderAnalytics() { const values = [['TOTAL MASS', number(metrics.mass, 6), 'solar masses'], ['BODIES', String(sim.store.count), `${sim.store.meta.filter(b => !b.tracer).length} major objects`], ['ENERGY CHANGE', `${number(metrics.relativeEnergyError * 100, 6)}%`, 'relative to reference'], ['SOLVER TIME', `${number(sim.last.ms, 2)} ms`, `${sim.last.steps} integration steps`]]; $('#diagnostic-cards').replaceChildren(...values.map(([label, value, unit]) => el('div', { class: 'diagnostic-card' }, el('span', { text: label }), el('strong', { text: value }), el('small', { text: unit })))); const canvas = $('#diagnostic-chart'), ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, key = $('#chart-metric').value, data = observations.filter(p => Number.isFinite(p[key])); ctx.fillStyle = '#0b111c'; ctx.fillRect(0, 0, w, h); const left = 80, right = 24, top = 30, bottom = 30; let min = Math.min(...data.map(d => d[key])), max = Math.max(...data.map(d => d[key])); if (!data.length) {
    min = 0;
    max = 1;
} if (min === max) {
    max += Math.abs(max) * .05 || 1;
    min -= Math.abs(min) * .05 || 1;
} const x0 = data[0]?.time || 0, x1 = data.at(-1)?.time || 1; ctx.font = '10px monospace'; ctx.fillStyle = '#7c8ea8'; ctx.strokeStyle = '#1e2b3f'; ctx.lineWidth = 1; for (let i = 0; i < 5; i++) {
    const y = top + (h - top - bottom) * i / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(w - right, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(number(max - (max - min) * i / 4, 5), left - 10, y + 4);
} ctx.textAlign = 'left'; ctx.fillText(`${number(x0, 3)} d`, left, h - 9); ctx.textAlign = 'right'; ctx.fillText(`${number(x1, 3)} d`, w - right, h - 9); if (data.length < 2) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8a769f';
    ctx.fillText('Observations accumulate while the simulation runs.', w / 2, h / 2);
    return;
} ctx.strokeStyle = '#b59bdf'; ctx.lineWidth = 2; ctx.beginPath(); data.forEach((d, i) => { const x = left + (d.time - x0) / (x1 - x0 || 1) * (w - left - right), y = top + (max - d[key]) / (max - min) * (h - top - bottom); if (i)
    ctx.lineTo(x, y);
else
    ctx.moveTo(x, y); }); ctx.stroke(); }
async function saveProject() { await idle(); const id = `project-${Date.now()}`; await library.save(snapshot(), id); dirty = false; setText('#storage-status', 'Saved on this device'); toast(`Saved “${title}” to this device`, { type: 'success' }); }
async function exportProject() { await idle(); downloadBlob(new Blob([stringifyProject(snapshot())], { type: 'application/json' }), `${slug(title)}.orbitarium.json`); toast('Project exported', { type: 'success' }); }
function slug(name) { return name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 70) || 'universe'; }
async function openSaved() { openDialog($('#open-dialog')); $('#saved-projects').replaceChildren(el('p', { class: 'panel-note', text: 'Reading local library…' })); try {
    const projects = await library.list();
    projects.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    $('#saved-projects').replaceChildren(...projects.map(p => { const load = el('button', { onclick: safe(async () => { await restoreProject(p.project); history.clear(); $('#open-dialog').close(); toast(`Opened ${p.title}`); }) }, el('strong', { text: p.id === 'autosave' ? `${p.title} · autosave` : p.title }), el('small', { text: `${new Date(p.savedAt).toLocaleString()} · ${p.project.bodies.length} bodies` })); const remove = el('button', { class: 'icon-button', title: 'Delete saved project', 'aria-label': 'Delete saved project', onclick: safe(async () => { await library.remove(p.id); await openSaved(); }) }); remove.innerHTML = icon('trash', 15); return el('div', { class: 'saved-project' }, load, remove); }));
    if (!projects.length)
        $('#saved-projects').append(el('p', { class: 'panel-note', text: 'No saved universes yet. Save your discoveries from the toolbar.' }));
}
catch (e) {
    $('#saved-projects').replaceChildren(el('p', { class: 'panel-note', text: `Local storage unavailable: ${e.message}. JSON import and export still work.` }));
} }
async function undo() { const project = history.undo(); if (project) {
    await restoreProject(project, { keepPaused: true });
    toast('Undo · restored edit snapshot');
} }
async function redo() { const project = history.redo(); if (project) {
    await restoreProject(project, { keepPaused: true });
    toast('Redo · restored edit snapshot');
} }
async function removeSelected() { if (selected == null)
    return; await edit('Remove object', () => { const b = sim.store.body(selected); sim.store.remove(selected); selected = null; if (renderer.camera.follow === b?.id)
    renderer.camera.follow = null; }); }
async function duplicateSelected() { const b = sim.store.body(selected); if (!b)
    return; await edit('Duplicate object', () => { selected = sim.store.add({ ...b, id: 0, name: `${b.name} copy`, position: [b.position[0] + b.radius * 4, b.position[1], b.position[2]] }); }); toast(`Duplicated ${b.name}`); }
async function explodeSelected() { const b = sim.store.body(selected); if (!b)
    return; await edit('Fragment object', () => sim.explode(selected, { count: 40, remnant: b.kind === 'star' ? .55 : .18, seed: Math.floor(sim.time * 100 + 42) })); toast(`${b.name} fragmented · mass and momentum retained`); }
async function circularize() { const b = sim.store.body(selected), p = b && renderer.primary(sim.store, b); if (!b || !p)
    throw new Error('This object needs a more massive primary'); await edit('Circularize orbit', () => { const r = sub(b.position, p.position), normal = normalize(cross(r, sub(b.velocity, p.velocity))); let tangent = normalize(cross(normal, r)); if (length(tangent) < .1)
    tangent = normalize(cross([0, 0, 1], r)); if (length(tangent) < .1)
    tangent = [1, 0, 0]; const v = Math.sqrt(G * sim.settings.gravity * (p.mass + b.mass) / length(r)); sim.store.update(b.id, { velocity: p.velocity.map((x, k) => x + tangent[k] * v) }); }); toast(`Circularized around ${p.name}`); }
async function screenshot() { const was = paused; paused = true; await idle(); renderer.render(sim.store, sim.time, selected); const blob = await renderer.screenshot(); paused = was; if (blob) {
    downloadBlob(blob, `${slug(title)}.png`);
    toast('Scene captured as PNG', { type: 'success' });
}
else
    throw new Error('Screenshot capture failed'); }
function attachPointerControls() {
    const canvas = $('#overlay'), pointers = new Map();
    let drag = null, lastTap = 0, lastTapId = null;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointerdown', e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); const xy = pos(e); pointers.set(e.pointerId, xy); if (pointers.size > 1) {
        drag = null;
        return;
    } const b = renderer.pick(...xy); drag = { id: e.pointerId, start: xy, last: xy, button: e.button, body: b, startCamera: renderer.camera.toJSON(), wasPaused: paused }; if (tool === 'move' && b) {
        selectBody(b.id);
        paused = true;
    } $('#stage').focus({ preventScroll: true }); });
    canvas.addEventListener('pointermove', e => { if (!pointers.has(e.pointerId))
        return; const xy = pos(e); if (pointers.size === 2) {
        const before = [...pointers.values()], oldDistance = Math.hypot(before[0][0] - before[1][0], before[0][1] - before[1][1]), oldCenter = [(before[0][0] + before[1][0]) / 2, (before[0][1] + before[1][1]) / 2];
        pointers.set(e.pointerId, xy);
        const after = [...pointers.values()], newDistance = Math.hypot(after[0][0] - after[1][0], after[0][1] - after[1][1]);
        if (oldDistance > 0 && newDistance > 0)
            renderer.camera.zoom(oldDistance / newDistance);
        renderer.camera.pan((after[0][0] + after[1][0]) / 2 - oldCenter[0], (after[0][1] + after[1][1]) / 2 - oldCenter[1]);
        return;
    } pointers.set(e.pointerId, xy); if (!drag)
        return; const dx = xy[0] - drag.last[0], dy = xy[1] - drag.last[1]; if (tool === 'launch' || tool === 'move' && drag.body) {
        renderer.launchPreview = { from: drag.start, to: xy };
    }
    else if (tool === 'select') {
        if (drag.button === 2 || e.shiftKey)
            renderer.camera.pan(dx, dy);
        else if (Math.hypot(xy[0] - drag.start[0], xy[1] - drag.start[1]) > 4)
            renderer.camera.orbit(dx, dy);
    } drag.last = xy; });
    canvas.addEventListener('pointerup', safe(async (e) => { const xy = pos(e), d = drag; pointers.delete(e.pointerId); if (!d || d.id !== e.pointerId)
        return; drag = null; renderer.launchPreview = null; const moved = Math.hypot(xy[0] - d.start[0], xy[1] - d.start[1]); if (tool === 'launch' && launchTemplate) {
        const b = launchTemplate, from = renderer.camera.unproject(...d.start), to = renderer.camera.unproject(...xy);
        await edit('Launch object', () => { selected = sim.store.add({ ...b, position: from, velocity: to.map((v, k) => (v - from[k]) / Math.max(renderer.camera.span * 20, .1)) }); });
        setTool('select');
        toast(`${b.name} launched`);
        return;
    } if (tool === 'move' && d.body) {
        const body = sim.store.body(d.body.id);
        if (body) {
            const a = renderer.camera.unproject(...d.start, body.position[2]), b = renderer.camera.unproject(...xy, body.position[2]);
            await edit('Move object', () => sim.store.update(body.id, { position: body.position.map((v, k) => v + b[k] - a[k]) }));
        }
        paused = d.wasPaused;
        updateTransport();
        return;
    } if (tool === 'measure' && moved < 5) {
        const picked = renderer.pick(...xy), point = picked?.position || renderer.camera.unproject(...xy);
        if (!renderer.measurement || renderer.measurement.length === 2)
            renderer.measurement = [point];
        else
            renderer.measurement.push(point);
        return;
    } if (tool === 'select' && moved < 5 && d.button === 0) {
        const b = renderer.pick(...xy);
        selectBody(b?.id ?? null);
        if (b && lastTapId === b.id && performance.now() - lastTap < 350)
            focusSelected();
        lastTap = performance.now();
        lastTapId = b?.id;
    } }));
    canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); if (drag && tool === 'move')
        paused = drag.wasPaused; drag = null; renderer.launchPreview = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); renderer.camera.zoom(Math.exp(clamp(e.deltaY, -160, 160) * .0015)); renderer.focusEase = null; }, { passive: false });
}
function attachControls() {
    const handlers = { '#brand-home': () => openDialog($('#scenarios-dialog')), '#open-scenarios': () => openDialog($('#scenarios-dialog')), '#add-body': () => openAdd(), '#explorer-add': () => openAdd(), '#empty-add': () => openAdd(), '#new-universe': () => loadScenario('empty'), '#home-view': homeView, '#top-view': () => { renderer.camera.pitch = Math.PI / 2; renderer.camera.yaw = 0; }, '#focus-object': focusSelected, '#inspector-focus': focusSelected, '#unfollow': () => { renderer.camera.follow = null; renderer.focusEase = null; }, '#play-pause': () => { paused = !paused; updateTransport(); }, '#reset-sim': () => loadScenario(scenarioKey === 'custom' ? 'solar' : scenarioKey), '#step-sim': async () => { paused = true; await idle(); await sim.advance(stableStep(sim.store, G * sim.settings.gravity, sim.settings.maxStep, sim.settings.softening)); updateTransport(); recordState(); }, '#rewind': () => scrubHistory(Math.max(0, records.length - 2)), '#faster': () => { speed = clamp(speed * 2, .0001, 1000); updateTransport(); }, '#slower': () => { speed = clamp(speed / 2, .0001, 1000); updateTransport(); }, '#settings': openSettings, '#analytics': () => { renderAnalytics(); openDialog($('#analytics-dialog')); }, '#help': () => openDialog($('#help-dialog')), '#capture': screenshot, '#focus-mode': () => document.body.classList.toggle('focus-mode'), '#toggle-explorer': () => { document.body.classList.toggle('explorer-open'); document.body.classList.remove('inspector-open'); }, '#save-project': saveProject, '#export-project': exportProject, '#open-project': openSaved, '#choose-file': () => $('#import-file').click(), '#explode': explodeSelected, '#delete-body': removeSelected, '#duplicate': duplicateSelected, '#circularize': circularize, '#zero-velocity': () => edit('Stop object', () => sim.store.update(selected, { velocity: [0, 0, 0] })), '#recompute-radius': () => edit('Derive material radius', () => { const b = sim.store.body(selected); if (b)
            sim.store.update(b.id, { radius: materialRadius(b.mass, b.composition) }); }), '#project-name': () => { const name = prompt('Universe name', title); if (name?.trim()) {
            title = name.trim().slice(0, 150);
            dirty = true;
            lastListSignature = '';
            updateUI(true);
        } }, '#export-csv': () => { const text = ['time_days,relative_energy_change,temperature_K,speed_km_s,body_count,selected_object', ...observations.map(p => `${p.time},${p.energy},${p.temperature},${p.speed},${p.bodies},"${p.selected.replaceAll('"', '""')}"`)].join('\n'); downloadBlob(new Blob([text], { type: 'text/csv' }), `${slug(title)}-observations.csv`); } };
    for (const [id, fn] of Object.entries(handlers))
        $(id).addEventListener('click', safe(fn));
    for (const b of $$('[data-close]'))
        b.addEventListener('click', () => b.closest('dialog').close());
    for (const b of $$('[data-tool]'))
        b.addEventListener('click', () => setTool(b.dataset.tool));
    for (const b of $$('[data-view]'))
        b.addEventListener('click', () => toggleView(b.dataset.view));
    $('#speed').addEventListener('input', () => { speed = 10 ** Number($('#speed').value); updateTransport(); });
    $('#body-search').addEventListener('input', () => refreshList());
    $('#show-particles').addEventListener('change', () => refreshList());
    $('#history-scrub').addEventListener('change', safe(() => scrubHistory(Number($('#history-scrub').value))));
    $('#chart-metric').addEventListener('change', renderAnalytics);
    $('#add-mode').addEventListener('change', placementModeChanged);
    $('#add-form').addEventListener('submit', safe(submitAdd));
    $('#import-file').addEventListener('change', safe(async () => { const file = $('#import-file').files?.[0]; if (!file)
        return; if (file.size > 20 * 1024 * 1024)
        throw new Error('Maximum project size is 20 MB'); const project = parseProject(await file.text()); await restoreProject(project); history.clear(); $('#open-dialog').close(); $('#import-file').value = ''; toast('Project imported', { type: 'success' }); }));
    bindProperty('#edit-mass', 'mass', v => Number(v) * EARTH_MASS);
    bindProperty('#edit-radius', 'radius', v => Number(v) / AU_KM);
    bindProperty('#edit-temperature', 'temperature');
    bindProperty('#edit-albedo', 'albedo');
    bindProperty('#edit-greenhouse', 'greenhouse');
    bindProperty('#edit-luminosity', 'luminosity');
    bindProperty('#object-name', 'name', v => String(v));
    bindProperty('#edit-color', 'color', v => v);
    bindProperty('#edit-spin', 'spin');
    bindProperty('#edit-rings', 'rings', v => v);
    bindProperty('#edit-visible', 'visible', v => v);
    $('#edit-albedo').addEventListener('input', () => setText('#albedo-output', Number($('#edit-albedo').value).toFixed(2)));
    const dismiss = el('button', { class: 'icon-button small mobile-only', title: 'Close inspector', 'aria-label': 'Close inspector', onclick: () => document.body.classList.remove('inspector-open') });
    dismiss.innerHTML = icon('close', 15);
    $('#inspector .panel-heading').append(dismiss);
    bindTabs($('#explorer-tabs'));
    bindTabs($('#inspector-tabs'), () => updateInspector());
    const shortcuts = [['Pause / play', 'Space'], ['Focus object', 'F'], ['Frame system', 'H'], ['Select / Move / Measure', 'V / M / R'], ['Add object', 'A'], ['Explode / remove', 'X / Delete'], ['Show / hide panels', 'Tab'], ['Undo / redo', '⌘ Z / ⇧ ⌘ Z'], ['Save / open', '⌘ S / ⌘ O'], ['Command palette', '⌘ K']];
    $('#keyboard-guide').replaceChildren(...shortcuts.map(([label, key]) => el('div', { class: 'shortcut-row' }, el('span', { text: label }), el('kbd', { text: key }))));
    const commands = [{ label: 'Open simulation library', key: '', action: () => openDialog($('#scenarios-dialog')) }, { label: 'Add an object', key: 'A', action: () => openAdd() }, { label: 'Pause / play simulation', key: 'Space', action: () => { paused = !paused; updateTransport(); } }, { label: 'Focus selected object', key: 'F', action: focusSelected }, { label: 'Frame the system', key: 'H', action: homeView }, { label: 'Explode selected object', key: 'X', action: safe(explodeSelected) }, { label: 'Duplicate selected object', action: safe(duplicateSelected) }, { label: 'Undo edit', key: '⌘ Z', action: safe(undo) }, { label: 'Redo edit', key: '⇧ ⌘ Z', action: safe(redo) }, { label: 'Save project locally', key: '⌘ S', action: safe(saveProject) }, { label: 'Export project JSON', action: safe(exportProject) }, { label: 'Open project', key: '⌘ O', action: safe(openSaved) }, { label: 'Capture scene PNG', action: safe(screenshot) }, { label: 'Simulation settings', action: openSettings }, { label: 'Simulation diagnostics', action: () => { renderAnalytics(); openDialog($('#analytics-dialog')); } }, { label: 'Toggle focus mode', key: 'Tab', action: () => document.body.classList.toggle('focus-mode') }, { label: 'Toggle reference grid', action: () => toggleView('grid') }, ...SCENARIOS.map(s => ({ label: `Load ${s.name}`, action: safe(() => loadScenario(s.id)) }))];
    const palette = new CommandPalette(commands);
    $('#command').addEventListener('click', () => palette.show());
    window.addEventListener('keydown', safe(async (e) => { const modifier = e.ctrlKey || e.metaKey, key = e.key.toLowerCase(); if (modifier && key === 'k') {
        e.preventDefault();
        palette.show();
        return;
    } if ($$('dialog[open]').length)
        return; const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable; if (typing)
        return; if (modifier) {
        if (['s', 'o', 'z', 'y'].includes(key))
            e.preventDefault();
        if (key === 's')
            await saveProject();
        if (key === 'o')
            await openSaved();
        if (key === 'z')
            await (e.shiftKey ? redo() : undo());
        if (key === 'y')
            await redo();
        return;
    } const map = { ' ': () => { paused = !paused; updateTransport(); }, f: focusSelected, h: homeView, v: () => setTool('select'), m: () => setTool('move'), r: () => setTool('measure'), a: () => openAdd(), x: explodeSelected, delete: removeSelected, backspace: removeSelected, '/': () => $('#body-search').focus(), escape: () => { setTool('select'); document.body.classList.remove('inspector-open', 'explorer-open'); }, tab: () => document.body.classList.toggle('focus-mode') }; if (map[key]) {
        e.preventDefault();
        await map[key]();
    } }));
    document.addEventListener('visibilitychange', () => { lastWall = performance.now(); });
}
function frame(now) {
    requestAnimationFrame(frame);
    if (!ready)
        return;
    const wall = clamp((now - lastWall) / 1000, 0, .075);
    lastWall = now;
    if (wall > 0)
        fps = fps * .93 + Math.min(240, 1 / wall) * .07;
    renderer.gravity = sim.settings.gravity;
    renderer.render(sim.store, sim.time, selected);
    frames++;
    if (now - lastMetrics > 1200 && !inflight) {
        lastMetrics = now;
        metrics = sim.diagnostics();
        addObservation();
    }
    if (now - lastRecord > 1100 && !paused && !inflight) {
        lastRecord = now;
        recordState();
    }
    if (now - lastAutosave > 12000 && !editing && storageReady && !autoSaveFailed && !inflight) {
        lastAutosave = now;
        library.save(snapshot()).then(() => { dirty = false; setText('#storage-status', 'Autosaved locally'); }).catch(error => { autoSaveFailed = true; setText('#storage-status', 'Export to preserve work'); toast(`Autosave unavailable: ${error.message}`, { type: 'error' }); });
    }
    if (!paused && !editing && !inflight && !document.hidden && wall > 0) {
        const requested = wall * speed;
        inflight = sim.advance(requested).then(advanced => { actualRate = actualRate * .8 + (advanced / wall) * .2; }).catch(error => { paused = true; if (sim.backend === 'gpu') {
            sim.backend = 'auto';
            toast(`GPU compute stopped: ${error.message}. Switched to Float64.`, { type: 'error' });
        }
        else
            reportError(error); updateTransport(); }).finally(() => { inflight = null; });
    }
    if (now - lastUI > 220) {
        lastUI = now;
        updateUI();
    }
}
async function initialize() {
    hydrateIcons();
    buildScenarioCards();
    buildCatalog();
    fillVectorFields();
    buildComposition();
    buildSettings();
    const gpu = await createGPUDevice();
    renderer = new UniverseRenderer($('#universe'), $('#overlay'), { device: gpu.device });
    await renderer.init();
    renderer.camera.span = scenario.span;
    if (gpu.device) {
        try {
            sim.gpu = await new GPUGravity(gpu.device).init();
            setText('#gpu-note', 'WebGPU compute available. Batched velocity Verlet with Float32 storage and one CPU readback per batch.');
        }
        catch (e) {
            console.warn('GPU compute unavailable', e);
            setText('#gpu-note', `GPU compute unavailable: ${e.message}`);
        }
        gpu.device.addEventListener('uncapturederror', event => { console.error('WebGPU validation', event.error.message); });
        gpu.device.lost.then(async (info) => { if (!ready)
            return; paused = true; sim.backend = 'auto'; sim.gpu?.destroy(); toast(`Graphics device lost: ${info.message || info.reason}. Reload to recreate the GPU device.`, { type: 'error', duration: 12000 }); updateTransport(); });
    }
    else
        setText('#gpu-note', gpu.reason || 'WebGPU unavailable. Float64 physics and Canvas rendering remain functional.');
    $('#setting-solver option[value=gpu]').disabled = !sim.gpu?.available;
    $('#renderer-chip').replaceChildren(el('i'), document.createTextNode(renderer.mode === 'WebGPU' ? 'WEBGPU RENDERER' : 'CANVAS FALLBACK'));
    attachControls();
    attachPointerControls();
    try {
        await library.open();
        storageReady = true;
    }
    catch (e) {
        setText('#storage-status', 'JSON export available');
        console.warn('Storage unavailable', e);
    }
    $('#loading').remove();
    ready = true;
    lastWall = performance.now();
    lastAutosave = lastWall;
    invalidate();
    recordState();
    requestAnimationFrame(frame);
    // Explicit testing/embedding API: no private state or bypass of validation is required.
    window.orbitarium = { get simulation() { return sim; }, get renderer() { return renderer; }, get selected() { return selected; }, get paused() { return paused; }, get observations() { return observations; }, get records() { return records; }, loadScenario, select: selectBody, openAdd, exportProject: snapshot, importProject: restoreProject, edit, undo, redo, saveProject, library, async pause(value = true) { paused = value; await idle(); updateTransport(); }, async step(days = .1) { paused = true; await idle(); const result = await sim.advance(days); updateUI(true); return result; }, get ready() { return ready; }, get frames() { return frames; } };
}
initialize().catch(error => { reportError(error); const loading = $('#loading'); if (loading)
    loading.replaceChildren(el('strong', { text: 'Could not start Orbitarium' }), el('span', { text: error.message }), el('p', { class: 'panel-note', text: 'Serve this folder over HTTP: npm start. Opening index.html directly is not supported.' })); });
