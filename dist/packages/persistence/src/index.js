import { BodyStore, MAX_BODIES } from '@orbitarium/core';
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export function validateProject(project) { if (!project || project.format !== 'orbitarium' || project.version !== 1)
    throw new TypeError('This is not an Orbitarium v1 project'); if (project.units?.length !== 'AU' || project.units?.time !== 'day' || project.units?.mass !== 'solar')
    throw new Error('Project units must be AU / day / solar'); if (!Number.isFinite(project.time) || project.time < 0 || project.time > 1e12)
    throw new Error('Invalid simulation time'); const store = BodyStore.fromJSON(project.bodies); const settings = project.settings || {}; for (const [key, min, max] of [['gravity', 0, 100], ['softening', 1e-12, 1e6], ['maxStep', 1e-8, 1e6], ['maxSubsteps', 1, 128], ['theta', .1, 1.5]])
    if (settings[key] !== undefined && (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max))
        throw new Error(`Invalid setting: ${key}`); if (settings.maxSubsteps !== undefined && !Number.isInteger(settings.maxSubsteps))
    throw new Error('Substeps must be an integer'); if (settings.collisions && !['off', 'merge', 'elastic'].includes(settings.collisions))
    throw new Error('Invalid collision mode'); if (settings.thermal !== undefined && typeof settings.thermal !== 'boolean')
    throw new Error('Invalid thermal setting'); const cleanSettings = {}; for (const k of ['gravity', 'softening', 'maxStep', 'maxSubsteps', 'theta', 'collisions', 'thermal'])
    if (settings[k] !== undefined)
        cleanSettings[k] = settings[k]; const metadata = { title: String(project.metadata?.title || 'Imported universe').slice(0, 150), scenario: String(project.metadata?.scenario || 'custom').slice(0, 40), speed: Number.isFinite(project.metadata?.speed) ? Math.max(.0001, Math.min(1000, project.metadata.speed)) : 10, selected: Number.isSafeInteger(project.metadata?.selected) ? project.metadata.selected : null }; return { format: 'orbitarium', version: 1, units: { length: 'AU', time: 'day', mass: 'solar' }, time: project.time, settings: cleanSettings, bodies: store.toJSON(), metadata, camera: project.camera || null }; }
export function parseProject(text) { if (typeof text !== 'string' || text.length > MAX_FILE_BYTES)
    throw new Error('Project exceeds the 20 MB import limit'); return validateProject(JSON.parse(text)); }
export function stringifyProject(project) { return JSON.stringify(validateProject(project), null, 2); }
export function downloadBlob(blob, name) { const a = document.createElement('a'), url = URL.createObjectURL(blob); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
export class ProjectLibrary {
    constructor(name = 'orbitarium') { this.name = name; this.db = null; }
    async open() { if (this.db)
        return this; this.db = await new Promise((resolve, reject) => { const request = indexedDB.open(this.name, 1); request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('Close other Orbitarium tabs to upgrade storage')); }); return this; }
    async transaction(mode, work) { await this.open(); return new Promise((resolve, reject) => { const tx = this.db.transaction('projects', mode); let result; try {
        result = work(tx.objectStore('projects'));
    }
    catch (error) {
        tx.abort();
        reject(error);
        return;
    } tx.oncomplete = () => resolve(result?.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted')); }); }
    async save(project, id = 'autosave') { const clean = validateProject(project); return this.transaction('readwrite', store => store.put({ id, title: clean.metadata.title, savedAt: new Date().toISOString(), project: clean })); }
    async get(id = 'autosave') { return this.transaction('readonly', store => store.get(id)); }
    async list() { return this.transaction('readonly', store => store.getAll()); }
    async remove(id) { return this.transaction('readwrite', store => store.delete(id)); }
    close() { this.db?.close(); this.db = null; }
}
