// Actual inline functions/listeners with fictional DOM and deferred transport only.
// No Browser, real fetch, timers, persistence, application writes or child processes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => new vm.Script(match[1]));
const user = { id: '10000000-0000-4000-8000-000000000011', sessionVersion: 1, authorizationRevision: 'fixture', roles: ['ADMIN'] };
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const plain = value => JSON.parse(JSON.stringify(value));
const response = (status = 200, reason = '') => ({ ok: status === 200, status,
    json: async () => status === 200 ? { status: 'success' } : { status: 'error', reason } });
const event = (properties = {}) => ({ ...properties, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; } });

function element() {
    const listeners = new Map(), attributes = new Map(), classes = new Set();
    return {
        listeners, attributes, hidden: false, open: false, disabled: false, dataset: {}, style: {}, value: '', textContent: '',
        innerHTML: '', focusCount: 0, closeCount: 0,
        classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
            remove(name) { classes.delete(name); }, contains: name => classes.has(name) },
        addEventListener(name, listener) { listeners.set(name, [...(listeners.get(name) || []), listener]); },
        emit(name, value) { const results = (listeners.get(name) || []).map(listener => listener(value)); return results.at(-1); },
        setAttribute(name, value) { attributes.set(name, String(value)); },
        getAttribute: name => attributes.get(name) ?? null,
        removeAttribute(name) { attributes.delete(name); },
        showModal() { this.open = true; }, close() { this.open = false; this.closeCount++; },
        focus() { this.focusCount++; }, querySelector() { return null; }, querySelectorAll() { return []; }
    };
}

function previewElement() {
    const preview = element();
    let markup = '', pages = [];
    Object.defineProperty(preview, 'innerHTML', { get: () => markup, set(value) {
        markup = value;
        pages = [...value.matchAll(/<section\b[^>]*data-reader-page="(\d+)"[^>]*>([\s\S]*?)<\/section>/g)].map(match => {
            const page = element(), image = element(), button = element(), content = element();
            page.dataset.readerPage = match[1];
            const tag = match[2].match(/<img\b([^>]*)>/);
            if (tag) for (const attr of tag[1].matchAll(/([\w-]+)="([^"]*)"/g)) image.setAttribute(attr[1], attr[2]);
            image.complete = false;
            Object.defineProperty(image, 'src', { get: () => image.getAttribute('src'), set: value => image.setAttribute('src', value) });
            page.querySelector = selector => selector === 'img' ? (tag ? image : null)
                : selector === '[data-modal-image-toggle]' ? button : selector === '.reader-page__content' ? content : null;
            page.scrollIntoView = options => { page.scrolled = options; };
            return page;
        });
    } });
    preview.querySelectorAll = selector => selector === '[data-reader-page]' ? pages : [];
    preview.querySelector = selector => {
        const match = selector.match(/^\[data-reader-page="(\d+)"\]$/);
        return match ? pages[Number(match[1])] || null : selector === '[data-reader-page]' ? pages[0] || null : null;
    };
    return preview;
}

function guide(remote = false) {
    return { id: 'fixture-guide', title: 'Fictional guide', assets: ['a', 'b', 'c'].map((id, index) => ({
        id, kind: 'image', remote, label: 'Display ' + id, fileName: 'original-' + id + '.png',
        displayName: 'Page ' + id, sortOrder: index, path: 'https://fixture.invalid/original-' + id + '.png',
        previewPath: 'https://fixture.invalid/preview-' + id + '.webp', expiresAt: Date.now() + 3600000
    })) };
}

function rig() {
    const nodes = new Map(), documentListeners = new Map(), requests = [], prefetched = [], scheduled = [];
    const counts = { saved: 0, reload: 0, clicked: 0, objectUrls: 0, revoked: 0 };
    const node = selector => { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); };
    const document = {
        readyState: 'loading', querySelector: selector => selector === '[data-page-name="-1"]' ? null : node(selector), querySelectorAll: () => [],
        addEventListener(name, listener) { documentListeners.set(name, [...(documentListeners.get(name) || []), listener]); },
        body: { classList: { remove() {} }, appendChild() {} },
        createElement() { return { click() { counts.clicked++; }, remove() {} }; }
    };
    const context = vm.createContext({ URL, URLSearchParams, Blob, console, document,
        navigator: { connection: { effectiveType: '4g' } },
        Image: class { set src(value) { prefetched.push({ src: value, decoding: this.decoding, fetchPriority: this.fetchPriority }); } },
        window: { location: { hostname: 'example.com', search: '', pathname: '/SOP/', hash: '', origin: 'https://example.com' },
            history: { replaceState() {} }, addEventListener() {},
            localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null, setItem() {} },
            setTimeout(callback, delay) { scheduled.push({ callback, delay }); },
            AkraModule: { markSaved() { counts.saved++; } } },
        fetch: async (_url, options) => {
            assert.equal(options.method, 'POST');
            const body = JSON.parse(options.body);
            assert.equal(body.action, 'updatePages', 'Only the isolated editor save can use fixture transport');
            requests.push(body);
            return context.transport();
        }
    });
    scripts.forEach(script => script.runInContext(context));
    const run = source => vm.runInContext(source, context), read = source => plain(run(source));
    const preview = previewElement();
    context.fixtureNode = node;
    context.fixturePreview = preview;
    context.fixtureGuide = guide();
    context.fixtureUser = { ...user };
    context.reloadFixture = async () => { counts.reload++; };
    run("runtime.user=fixtureUser;runtime.token='fictional-token';runtime.isAdmin=true;runtime.connected=true;runtime.adminGuides=[fixtureGuide];guides=[fixtureGuide];loadRemoteGuides=reloadFixture;");
    run("Object.assign(dom,Object.fromEntries(['modalDownload','searchForm','searchInput','adminForm','adminRefresh','modal','modalAssets','modalMessage','modalZoom','modalZoomLabel','adminModal','adminMessage','announcer'].map(key=>[key,fixtureNode(key)])));dom.modalPreview=fixturePreview;dom.modal.hidden=true;dom.adminModal.hidden=true;bindEvents();");
    const dispatch = (name, value) => { for (const listener of documentListeners.get(name) || []) listener(value); };
    const click = (selector, dataset = {}) => dispatch('click', event({ target: { dataset,
        closest: requested => requested === selector ? { dataset } : null } }));
    const open = () => click('[data-admin-pages]', { adminPages: 'fixture-guide' });
    const rename = (index, value) => node('[data-page-list]').emit('input', { target: { dataset: { pageName: String(index) }, value } });
    const escape = () => {
        dispatch('keydown', event({ key: 'Escape' }));
        const cancelled = event();
        node('[data-page-editor]').emit('cancel', cancelled);
        // Model the native dialog default only after the actual listener permits it.
        if (!cancelled.defaultPrevented) node('[data-page-editor]').close();
        return cancelled;
    };
    const submit = () => node('[data-page-form]').emit('submit', event());
    const renderReader = () => {
        context.readerFixture = guide(true);
        run("guides=[readerFixture];dom.modal.hidden=false;dom.modal.dataset.guideId=readerFixture.id;state.readerIndex=0;renderReaderPages(readerFixture);");
        return preview.querySelectorAll('[data-reader-page]');
    };
    const replaceOwner = () => {
        context.nextUser = { ...user, id: '10000000-0000-4000-8000-000000000012' };
        run("runtime.user=nextUser;runtime.token='replacement-token';runtime.generation++;");
    };
    return { context, run, read, node, counts, requests, prefetched, scheduled, preview,
        click, open, rename, escape, submit, renderReader, replaceOwner };
}

for (const nativeEscape of [false, true]) test(`actual editor ${nativeEscape ? 'native Escape/cancel listener' : 'Cancel button'} discards only the local draft and reopens original pages`, async () => {
    const f = rig(), original = plain(f.context.fixtureGuide);
    f.open(); await tick();
    f.rename(0, 'Changed locally');
    f.click('[data-page-move]', { pageMove: '0', direction: '1' });
    f.click('[data-page-remove]', { pageRemove: '2' });
    assert.deepEqual(f.read('pageEditor.pages.map(page=>[page.id,page.displayName])'), [['b', 'Page b'], ['a', 'Changed locally']]);
    assert.deepEqual(f.read('pageEditor.removed'), ['c']);
    assert.equal(f.node('[data-page-editor]').open, true);
    if (nativeEscape) assert.equal(f.escape().defaultPrevented, false);
    else f.click('[data-page-cancel]');
    assert.equal(f.node('[data-page-editor]').open, false);
    assert.deepEqual(plain(f.context.fixtureGuide), original);
    assert.equal(f.requests.length, 0); assert.equal(f.counts.saved, 0);
    f.open(); await tick();
    assert.deepEqual(f.read('pageEditor.pages.map(page=>[page.id,page.displayName])'), original.assets.map(page => [page.id, page.displayName]));
    assert.deepEqual(f.read('pageEditor.removed'), []);
    assert.deepEqual(f.read('pageEditor.expected'), original.assets.map(({ id, displayName, sortOrder }) => ({ id, displayName, sortOrder })));
});

test('actual bound Save sends ordered trimmed pages/removals with the original snapshot, locks cancellation and settles once', async () => {
    const f = rig(), pending = deferred();
    f.context.fixtureGuide.assets[2].displayName = null;
    const original = plain(f.context.fixtureGuide);
    f.context.transport = () => pending.promise;
    f.open(); await tick(); f.rename(0, '  Renamed  ');
    f.click('[data-page-move]', { pageMove: '0', direction: '1' });
    f.click('[data-page-remove]', { pageRemove: '2' });
    const saving = f.submit();
    assert.equal(f.requests.length, 1);
    assert.deepEqual(f.requests[0], { action: 'updatePages', documentId: 'fixture-guide',
        expectedPages: original.assets.map(({ id, displayName, sortOrder }) => ({ id, displayName, sortOrder })),
        removedPageIds: ['c'], pages: [{ id: 'b', displayName: 'Page b' }, { id: 'a', displayName: 'Renamed' }], token: 'fictional-token' });
    for (const selector of ['[data-page-fields]', '[data-page-save]', '[data-page-cancel]']) assert.equal(f.node(selector).disabled, true);
    f.rename(0, 'Ignored during save');
    f.click('[data-page-move]', { pageMove: '0', direction: '1' });
    f.click('[data-page-remove]', { pageRemove: '0' });
    f.click('[data-page-cancel]');
    assert.equal(f.escape().defaultPrevented, true);
    assert.equal(f.node('[data-page-editor]').open, true);
    await f.submit(); assert.equal(f.requests.length, 1);
    assert.deepEqual(f.read('pageEditor.pages.map(page=>page.id)'), ['b', 'a']);
    pending.resolve(response()); await saving;
    assert.equal(f.counts.saved, 1); assert.equal(f.counts.reload, 1);
    assert.equal(f.node('[data-page-editor]').open, false);
    assert.equal(f.run('pageEditor.saving'), false);
    for (const selector of ['[data-page-fields]', '[data-page-save]', '[data-page-cancel]']) assert.equal(f.node(selector).disabled, false);
    assert.equal(f.node('adminMessage').textContent, 'บันทึกการเปลี่ยนแปลงแล้ว');
});

test('actual editor Save blocks non-admin and blank names before transport', async () => {
    const f = rig(); f.open(); await tick();
    f.run('runtime.isAdmin=false'); await f.submit(); assert.equal(f.requests.length, 0);
    f.run('runtime.isAdmin=true'); f.rename(0, '   '); await f.submit();
    assert.equal(f.requests.length, 0); assert.equal(f.run('pageEditor.saving'), false);
    assert.equal(f.node('[data-page-editor]').open, true);
    assert.equal(f.node('[data-page-message]').textContent, 'กรุณากรอกชื่อที่แสดงให้ครบทุกส่วน');
});

test('removing all pages preserves the original on Cancel and sends an explicit empty list only on Save', async () => {
    const f = rig(), original = plain(f.context.fixtureGuide);
    const removeAll = () => { for (let index = 0; index < 3; index++) f.click('[data-page-remove]', { pageRemove: '0' }); };
    f.open(); await tick(); removeAll();
    assert.match(f.node('[data-page-list]').innerHTML, /ไม่มีภาพหรือ PDF เหลือในคู่มือ/);
    assert.equal(f.node('[data-page-save]').focusCount, 1);
    assert.equal(f.requests.length, 0); f.click('[data-page-cancel]');
    assert.deepEqual(plain(f.context.fixtureGuide), original);
    f.open(); await tick(); assert.equal(f.run('pageEditor.pages.length'), 3); removeAll();
    f.context.transport = async () => response(); await f.submit();
    assert.equal(f.requests.length, 1); assert.deepEqual(f.requests[0].pages, []);
    assert.deepEqual(f.requests[0].removedPageIds, ['a', 'b', 'c']);
    assert.deepEqual(f.requests[0].expectedPages, original.assets.map(({ id, displayName, sortOrder }) => ({ id, displayName, sortOrder })));
    assert.equal(f.counts.saved, 1); assert.equal(f.node('[data-page-editor]').open, false);
});

for (const reason of ['pages_conflict', 'storage_error']) test(`actual Save ${reason} retains the edited draft and original metadata, then unlocks controls`, async () => {
    const f = rig(), pending = deferred(), original = plain(f.context.fixtureGuide);
    f.context.transport = () => pending.promise; f.open(); await tick(); f.rename(0, 'Retained edit');
    f.click('[data-page-remove]', { pageRemove: '2' });
    const draft = f.read('pageEditor'), saving = f.submit();
    pending.resolve(response(reason === 'pages_conflict' ? 409 : 503, reason)); await saving;
    assert.equal(f.node('[data-page-editor]').open, true);
    assert.deepEqual(f.read('pageEditor.pages'), draft.pages); assert.deepEqual(f.read('pageEditor.expected'), draft.expected);
    assert.deepEqual(f.read('pageEditor.removed'), draft.removed); assert.deepEqual(plain(f.context.fixtureGuide), original);
    assert.equal(f.counts.saved, 0); assert.equal(f.counts.reload, 0); assert.equal(f.requests.length, 1);
    for (const selector of ['[data-page-fields]', '[data-page-save]', '[data-page-cancel]']) assert.equal(f.node(selector).disabled, false);
    assert.match(f.node('[data-page-message]').textContent, reason === 'pages_conflict' ? /รายการถูกแก้ไขจากที่อื่น/ : /ยังยืนยันผลการบันทึกไม่ได้/);
});

test('confirmed Save with a failed catalog refresh remains confirmed and reports the refresh failure separately', async () => {
    const f = rig(); f.context.transport = async () => response();
    f.context.reloadFixture = async () => { f.counts.reload++; throw new Error('fixture refresh failure'); };
    f.run('loadRemoteGuides=reloadFixture');
    f.open(); await tick(); await f.submit();
    assert.equal(f.counts.saved, 1); assert.equal(f.counts.reload, 1);
    assert.equal(f.node('[data-page-editor]').open, false); assert.equal(f.run('pageEditor.saving'), false);
    assert.match(f.node('adminMessage').textContent, /บันทึกแล้ว แต่โหลดรายการใหม่ไม่สำเร็จ/);
    assert.equal(f.node('adminMessage').style.color, '#b5472b');
});

for (const stage of ['headers', 'body']) test(`actual Save cannot settle replacement-owner UI after deferred ${stage}`, async () => {
    const f = rig(), pending = deferred();
    f.context.transport = stage === 'headers' ? () => pending.promise
        : async () => ({ ok: true, status: 200, json: () => pending.promise });
    f.open(); await tick(); const saving = f.submit(); await tick();
    f.replaceOwner();
    f.run("pageEditor={guideId:'replacement-guide',pages:[],expected:[],removed:[],saving:true}");
    f.node('[data-page-message]').textContent = 'Replacement editor';
    f.node('adminMessage').textContent = 'Replacement admin';
    pending.resolve(stage === 'headers' ? response() : { status: 'success' }); await saving;
    assert.equal(f.counts.saved, 0); assert.equal(f.counts.reload, 0);
    assert.equal(f.node('[data-page-editor]').open, true);
    assert.equal(f.node('[data-page-message]').textContent, 'Replacement editor');
    assert.equal(f.node('adminMessage').textContent, 'Replacement admin');
    assert.equal(f.run('pageEditor.saving'), true);
    for (const selector of ['[data-page-fields]', '[data-page-save]', '[data-page-cancel]']) assert.equal(f.node(selector).disabled, true);
});

test('actual zoom listeners switch preview/original/preview and changing pages restores reading mode', async () => {
    const f = rig(), pages = f.renderReader(), image = pages[0].querySelector('img');
    const asset = f.context.readerFixture.assets[0];
    f.click('[data-modal-zoom]');
    assert.equal(image.src, asset.path); assert.equal(f.run('state.modalZoom'), true);
    assert.equal(f.node('modal').classList.contains('modal--zoomed'), true);
    assert.equal(f.node('modalZoom').getAttribute('aria-pressed'), 'true');
    assert.equal(pages[0].querySelector('[data-modal-image-toggle]').getAttribute('aria-label'), 'ย่อภาพกลับ');
    f.click('[data-modal-image-toggle]');
    assert.equal(image.src, asset.previewPath); assert.equal(f.run('state.modalZoom'), false);
    f.click('[data-modal-zoom]'); f.click('[data-reader-next]'); await tick();
    assert.equal(f.run('state.readerIndex'), 1); assert.equal(f.run('state.modalZoom'), false);
    assert.equal(image.src, asset.previewPath);
    assert.equal(pages[1].querySelector('img').src, f.context.readerFixture.assets[1].previewPath);
    assert.equal(f.node('modalZoom').getAttribute('aria-pressed'), 'false');
    assert.equal(f.node('modal').classList.contains('modal--zoomed'), false);
    assert.equal(pages[1].scrolled.block, 'start');
    assert.equal(f.requests.length, 0);
});

test('actual renderer/media bindings assign first eager/high and later lazy/low, prefetching only the active next preview', () => {
    const f = rig(), pages = f.renderReader();
    assert.equal(pages.length, 3);
    for (const [index, page] of pages.entries()) {
        const image = page.querySelector('img');
        assert.equal(image.getAttribute('loading'), index === 0 ? 'eager' : 'lazy');
        assert.equal(image.getAttribute('fetchpriority'), index === 0 ? 'high' : 'low');
        assert.equal(image.getAttribute('decoding'), 'async');
        assert.equal(image.src, f.context.readerFixture.assets[index].previewPath);
        assert.equal(image.listeners.get('load').length, 1); assert.equal(image.listeners.get('error').length, 1);
    }
    pages[1].querySelector('img').emit('load'); assert.equal(f.prefetched.length, 0);
    pages[0].querySelector('img').emit('load');
    assert.deepEqual(f.prefetched, [{ src: f.context.readerFixture.assets[1].previewPath, decoding: 'async', fetchPriority: 'low' }]);
    f.run('guides[0].assets[1].expiresAt=1'); pages[0].querySelector('img').emit('load');
    assert.equal(f.prefetched.length, 1); assert.equal(f.requests.length, 0);
});

test('actual bound download fetches the original source and original filename, then revokes its fixture object URL', async () => {
    const f = rig(); f.renderReader(); let downloaded;
    f.context.fetch = async url => { downloaded = url; return { ok: true, blob: async () => new Blob(['fictional image']) }; };
    f.context.URL = { createObjectURL() { f.counts.objectUrls++; return 'blob:fixture'; }, revokeObjectURL() { f.counts.revoked++; } };
    const link = { click() { f.counts.clicked++; }, remove() {} };
    f.context.document.createElement = () => link;
    const clicked = event(); await f.node('modalDownload').emit('click', clicked);
    assert.equal(clicked.defaultPrevented, true);
    assert.equal(downloaded, f.context.readerFixture.assets[0].path);
    assert.notEqual(downloaded, f.context.readerFixture.assets[0].previewPath);
    assert.equal(link.download, 'original-a.png'); assert.equal(f.counts.clicked, 1); assert.equal(f.counts.objectUrls, 1);
    const revoke = f.scheduled.find(item => item.delay === 60000); assert.ok(revoke); revoke.callback();
    assert.equal(f.counts.revoked, 1);
});

test('actual download cannot create an object URL or dispatch a download after identity replacement during blob loading', async () => {
    const f = rig(), body = deferred(); f.renderReader(); let decoding = false;
    f.context.fetch = async () => ({ ok: true, blob: () => { decoding = true; return body.promise; } });
    f.context.URL = { createObjectURL() { f.counts.objectUrls++; return 'blob:fixture'; }, revokeObjectURL() {} };
    const downloading = f.node('modalDownload').emit('click', event()); await tick(); assert.equal(decoding, true);
    f.replaceOwner(); f.node('modalMessage').textContent = 'Replacement reader';
    body.resolve(new Blob(['fictional image'])); await downloading;
    assert.equal(f.counts.objectUrls, 0); assert.equal(f.counts.clicked, 0);
    assert.equal(f.node('modalMessage').textContent, 'Replacement reader');
});
