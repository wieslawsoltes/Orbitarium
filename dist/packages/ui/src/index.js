export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export function el(tag, attrs = {}, ...children) { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class')
        n.className = v;
    else if (k === 'text')
        n.textContent = v;
    else if (k === 'style')
        Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function')
        n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null)
        n.setAttribute(k, v === true ? '' : String(v));
} for (const c of children.flat())
    if (c != null)
        n.append(c instanceof Node ? c : document.createTextNode(String(c))); return n; }
export function number(value, digits = 3) { if (!Number.isFinite(value))
    return '—'; const a = Math.abs(value); return a !== 0 && (a < .001 || a >= 1e7) ? value.toExponential(digits - 1) : new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(value); }
export const ICONS = {
    orbit: '<ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="2"/><circle cx="20" cy="6" r="1.4" fill="currentColor"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    play: '<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>', pause: '<path d="M8 5v14m8-14v14" stroke-width="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', chevron: '<path d="m9 5 7 7-7 7"/>', down: '<path d="m6 9 6 6 6-6"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>', select: '<path d="m5 3 14 10-7 1-4 7Z"/>', move: '<path d="M12 2v20M2 12h20m-13-7 3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/>',
    measure: '<path d="m3 16 13-13 5 5L8 21Zm8-8 3 3m-6 0 2 2m4-7 2 2"/>', focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>', grid: '<path d="M3 3h18v18H3Zm6 0v18m6-18v18M3 9h18M3 15h18"/>',
    trails: '<path d="M3 19c1-8 9-1 10-9s5-7 8-7"/><circle cx="4" cy="19" r="2"/>', label: '<path d="M3 5h10l8 7-8 7H3Z"/><circle cx="7" cy="12" r="1"/>',
    folder: '<path d="M3 6h7l2 3h9v11H3Z"/>', save: '<path d="M4 3h13l4 4v14H3V3Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>', download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    settings: '<path d="M5 3v18M12 3v18M19 3v18M2 8h6m1 8h6m1-10h6"/>', chart: '<path d="M4 3v17h17M8 15l4-5 4 2 5-7"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/>', step: '<path d="m5 5 10 7-10 7Z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>', rewind: '<path d="m12 5-9 7 9 7Zm9 0-9 7 9 7Z"/>',
    explode: '<path d="m12 2 2 6 6-4-3 7 5 2-7 2 3 7-6-5-5 5 1-7-6-3 6-2-2-6 5 3Z"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>', copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>', camera: '<path d="M3 7h5l2-3h4l2 3h5v14H3Z"/><circle cx="12" cy="13" r="4"/>',
    fullscreen: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7v4"/>', redo: '<path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0-7 7v4"/>',
    check: '<path d="m4 12 5 5L20 6"/>', moon: '<path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/>', binary: '<circle cx="7" cy="12" r="4"/><circle cx="18" cy="12" r="3"/><path d="M5 4c8-4 17 7 15 14"/>', impact: '<circle cx="7" cy="16" r="5"/><path d="m10 10 6-6m-2 8 7-7m-5 11 5-5"/>', rings: '<circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="11" ry="3" transform="rotate(-25 12 12)"/>', chaos: '<circle cx="12" cy="5" r="3"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="M11 8 6 15m8-7 4 7m-10 3h8"/>', galaxy: '<path d="M12 12c7-12 15 7 0 7-15 0-9-16 0-16s12 12 3 12-8-8-3-8"/>', comet: '<circle cx="7" cy="17" r="4"/><path d="m8 12 8-8m-4 12 9-9m-7 12 6-6"/>',
};
export function icon(name, size = 18) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.orbit}</svg>`; }
export function hydrateIcons(root = document) { for (const node of $$('[data-icon]', root))
    node.innerHTML = icon(node.dataset.icon, Number(node.dataset.size) || 18); }
export function toast(message, { type = 'info', duration = 4200 } = {}) { let host = $('#toasts'); if (!host) {
    host = el('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(host);
} const node = el('div', { class: `toast ${type}` }, el('span', { text: message })); host.append(node); setTimeout(() => node.remove(), duration); }
export function openDialog(dialog) { if (!dialog.open)
    dialog.showModal(); const close = e => { if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        dialog.close();
} }; if (!dialog.dataset.dismiss) {
    dialog.addEventListener('click', close);
    dialog.dataset.dismiss = 'true';
} setTimeout(() => dialog.querySelector('input,button,select')?.focus(), 20); }
export function bindTabs(root, onChange) { for (const button of $$('[role=tab]', root)) {
    button.addEventListener('click', () => { for (const b of $$('[role=tab]', root)) {
        const active = b === button;
        b.setAttribute('aria-selected', String(active));
        b.tabIndex = active ? 0 : -1;
        const panel = document.getElementById(b.getAttribute('aria-controls'));
        if (panel)
            panel.hidden = !active;
    } onChange?.(button.dataset.tab); });
    button.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key))
        return; event.preventDefault(); const tabs = $$('[role=tab]', root), index = tabs.indexOf(button); const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; next.click(); next.focus(); });
} }
/** DOM virtualization with fixed-height rows and explicit list item semantics. */
export class VirtualList {
    constructor(container, { rowHeight = 40, renderRow, onSelect } = {}) { this.container = container; this.rowHeight = rowHeight; this.renderRow = renderRow; this.onSelect = onSelect; this.items = []; this.selected = null; this.inner = el('div', { class: 'virtual-inner' }); container.append(this.inner); container.addEventListener('scroll', () => this.render()); this.resize = new ResizeObserver(() => this.render()); this.resize.observe(container); container.setAttribute('role', 'listbox'); container.tabIndex = 0; container.addEventListener('keydown', e => { if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key))
        return; e.preventDefault(); const current = this.items.findIndex(b => b.id === this.selected); const index = e.key === 'Home' ? 0 : e.key === 'End' ? this.items.length - 1 : Math.max(0, Math.min(this.items.length - 1, current + (e.key === 'ArrowDown' ? 1 : -1))); const b = this.items[index]; if (b) {
        this.onSelect?.(b);
        this.container.scrollTop = Math.max(0, index * this.rowHeight - this.container.clientHeight / 2);
    } }); }
    setItems(items, selected = this.selected) { this.items = items; this.selected = selected; this.inner.style.height = `${items.length * this.rowHeight}px`; this.render(); }
    render() { const start = Math.max(0, Math.floor(this.container.scrollTop / this.rowHeight) - 3), end = Math.min(this.items.length, Math.ceil((this.container.scrollTop + this.container.clientHeight) / this.rowHeight) + 3); this.inner.replaceChildren(); for (let i = start; i < end; i++) {
        const b = this.items[i], row = this.renderRow(b, b.id === this.selected);
        row.style.position = 'absolute';
        row.style.insetInline = '0';
        row.style.top = `${i * this.rowHeight}px`;
        row.style.height = `${this.rowHeight}px`;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(b.id === this.selected));
        row.addEventListener('click', () => this.onSelect?.(b));
        this.inner.append(row);
    } }
    destroy() { this.resize.disconnect(); }
}
export class CommandPalette {
    constructor(commands) { this.commands = commands; this.dialog = el('dialog', { class: 'command-dialog', 'aria-label': 'Command palette' }); this.input = el('input', { placeholder: 'What would you like to do?', 'aria-label': 'Search commands' }); this.list = el('div', { class: 'command-results' }); this.dialog.append(this.input, this.list); document.body.append(this.dialog); this.index = 0; this.input.addEventListener('input', () => { this.index = 0; this.render(); }); this.input.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.index = Math.max(0, Math.min(this.filtered.length - 1, this.index + (e.key === 'ArrowDown' ? 1 : -1)));
        this.render();
    } if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.choose(this.filtered[this.index]);
    } }); }
    show() { this.input.value = ''; this.index = 0; this.render(); openDialog(this.dialog); this.input.focus(); }
    choose(c) { if (c) {
        this.dialog.close();
        c.action();
    } }
    render() { this.filtered = this.commands.filter(c => c.label.toLowerCase().includes(this.input.value.toLowerCase())); this.list.replaceChildren(...this.filtered.map((c, i) => el('button', { class: i === this.index ? 'selected' : '', onclick: () => this.choose(c) }, el('span', { text: c.label }), el('kbd', { text: c.key || '' })))); }
}
