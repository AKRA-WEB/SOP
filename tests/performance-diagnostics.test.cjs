// Isolated aggregate timing behavior; no live network, browser or persistent data.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => new vm.Script(match[1]));
const user = { id: '10000000-0000-4000-8000-000000000011', sessionVersion: 1, authorizationRevision: 'fixture-revision' };
const tick = () => new Promise(setImmediate);
function rig(search = '?akra_perf=1') {
  const nodes = new Map(), storage = new Map(), frames = []; let clock = 10;
  const context = vm.createContext({ URL, URLSearchParams, console, performance: { now: () => clock }, navigator: {},
    requestAnimationFrame: fn => frames.push(fn),
    document: { readyState: 'loading', addEventListener() {}, getElementById: id => nodes.get(id), querySelector: () => null,
      createElement: () => ({ setAttribute() {} }), body: { appendChild: node => nodes.set(node.id, node), classList: { remove() {} } } },
    window: { location: { search, hostname: 'example.com' }, addEventListener() {},
      sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } }
  });
  scripts.forEach(script => script.runInContext(context));
  const run = source => vm.runInContext(source, context);
  context.fixtureUser = user;
  run("runtime.user=fixtureUser; runtime.token='fixture-only'; dom.modal={hidden:false,dataset:{guideId:'fixture-guide'}}; dom.modalMessage={}; state.readerIndex=0;");
  const begin = () => run('sopReaderPerf={trial:window.AkraPerf.nextTrial(),start:window.AkraPerf.now(),pages:1,session:captureSopSession(),imageSequence:1,loadedSequence:-1,imageStartedAt:window.AkraPerf.now()};');
  const events = () => JSON.parse(nodes.get('akra-perf-diagnostics')?.textContent || '{"events":[]}').events;
  const frame = () => { clock += 16; frames.shift()?.(); };
  return { context, run, begin, events, frame, frames, nodes, advance: ms => { clock += ms; } };
}
function image({ complete = false, decode = () => Promise.resolve() } = {}) {
  const handlers = {}, asset = { remote: true, path: 'https://fixture.invalid/original?private=fixture', previewPath: 'https://fixture.invalid/preview?private=fixture' };
  const img = { isConnected: true, naturalWidth: 800, naturalHeight: 600, complete, decode,
    attributes: { src: asset.previewPath }, getAttribute: key => img.attributes[key],
    set src(value) { img.attributes.src = value; }, addEventListener: (name, fn) => (handlers[name] ||= []).push(fn) };
  return { img, asset, fire: name => handlers[name]?.forEach(fn => fn()) };
}

test('disabled diagnostics create no endpoint, frame/decode work or requests', () => {
  for (const search of ['', '?akra_perf=true']) {
    const f = rig(search); const media = image({ decode: () => { throw Error('disabled decode'); } });
    assert.equal(f.context.window.AkraPerf, null);
    f.context.img = media.img; f.context.asset = media.asset; f.run('bindSopPerfImage(img,asset,0)');
    media.fire('load'); assert.equal(f.frames.length, 0); assert.equal(f.nodes.size, 0);
  }
});
test('DOM endpoint bounds records and allowlists metadata without signed URLs or identities', () => {
  const f = rig();
  f.run("for(let i=0;i<100;i++)window.AkraPerf.record('api_headers',0,{action:'getFiles',status:'success',actor:'private-person',url:'https://private.invalid',token:'private-secret',pages:NaN}); window.AkraPerf.record('private-stage',0,{});");
  const node = f.nodes.get('akra-perf-diagnostics'), result = JSON.parse(node.textContent);
  assert.equal(result.events.length, 80); assert.equal(result.app, 'SOP'); assert.equal(result.version, JSON.parse(fs.readFileSync(path.join(__dirname, '../version.json'))).version);
  assert.equal(node.hidden, true); assert(!/private|https|actor|token|url/.test(node.textContent));
  assert.deepEqual(Object.keys(result.events[0]).sort(), ['action', 'durationMs', 'sequence', 'stage', 'status', 'trial']);
});
test('first image ready waits for actual decode and two frames with unavailable byte sizes', async () => {
  const f = rig(); f.begin(); let finish;
  const media = image({ decode: () => new Promise(resolve => { finish = resolve; }) });
  f.context.img = media.img; f.context.asset = media.asset; f.run('bindSopPerfImage(img,asset,0)'); f.advance(40); media.fire('load');
  await tick(); assert.equal(f.events().filter(e => e.stage === 'image_ready').length, 0);
  finish(); await tick(); f.frame(); assert.equal(f.events().filter(e => e.stage === 'image_ready').length, 0); f.frame();
  const ready = f.events().find(e => e.stage === 'image_ready');
  assert.equal(ready.durationMs, 72); assert.equal(ready.sourceClass, 'preview'); assert.equal(ready.width, 800);
  assert.equal(ready.transferBytes, null); assert.equal(ready.bytesAvailable, false); assert.equal(ready.trial, 1);
});
test('already complete image uses the same once-only load/decode completion', async () => {
  const f = rig(); f.begin(); const media = image({ complete: true }); f.context.img = media.img; f.context.asset = media.asset;
  f.run('bindSopPerfImage(img,asset,0)'); await tick(); media.fire('load'); f.frame(); f.frame();
  assert.equal(f.events().filter(e => e.stage === 'image_load').length, 1); assert.equal(f.events().filter(e => e.stage === 'image_ready').length, 1);
});
for (const change of ['closed', 'session', 'reopened', 'source']) test(`pending decode cannot publish ready after ${change}`, async () => {
  const f = rig(); f.begin(); let finish; const media = image({ decode: () => new Promise(resolve => { finish = resolve; }) });
  f.context.img = media.img; f.context.asset = media.asset; f.run('bindSopPerfImage(img,asset,0)'); media.fire('load'); await tick();
  if (change === 'closed') f.run('sopReaderPerf=null; dom.modal.hidden=true');
  if (change === 'session') f.run("runtime.token='replaced-fixture'");
  if (change === 'reopened') f.begin();
  if (change === 'source') media.img.src = media.asset.path;
  finish(); await tick(); f.frame(); f.frame(); assert.equal(f.events().filter(e => e.stage === 'image_ready').length, 0);
});
test('preview failure resets source timing and ready marker identifies original fallback', async () => {
  const f = rig(); f.begin(); const media = image(), page = { querySelector: () => media.img };
  f.context.page = page; f.context.asset = media.asset; f.context.guide = { id: 'fixture-guide', assets: [media.asset] };
  f.run('guides=[guide]; bindReaderPageMedia(page,asset,0)'); f.advance(50); media.fire('error'); f.advance(20); media.fire('load');
  await tick(); f.frame(); f.frame();
  assert.equal(f.events().find(e => e.stage === 'image_load').durationMs, 20);
  assert.equal(f.events().find(e => e.stage === 'image_ready').sourceClass, 'original');
});
test('manifest classifications distinguish network, memory, tab and pending without extra API calls', async () => {
  const f = rig(); f.begin(); let calls = 0, finish;
  f.context.manifest = async () => { calls++; return { assets: [{ id: 'fixture-page', url: 'https://fixture.invalid/original', expiresAt: Date.now() + 3600000 }] }; };
  const guideSource = "({id:'fixture-guide',assets:[{id:'fixture-page',remote:true,path:''}]})";
  f.run(`apiRequest=manifest; fixtureGuide=${guideSource}`);
  await f.run('ensureGuideFiles(fixtureGuide)'); await f.run('ensureGuideFiles(fixtureGuide)');
  f.run(`fixtureGuide=${guideSource}`); await f.run('ensureGuideFiles(fixtureGuide)');
  assert.equal(calls, 1); assert.deepEqual(f.events().map(e => e.cacheClass), ['network', 'memory', 'tab']);
  f.context.manifest = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  f.run(`apiRequest=manifest; fixtureGuide=${guideSource}; fixtureGuide.revision='changed'`);
  const pending = f.run('Promise.all([ensureGuideFiles(fixtureGuide),ensureGuideFiles(fixtureGuide)])');
  finish({ assets: [{ id: 'fixture-page', url: 'https://fixture.invalid/original', expiresAt: Date.now() + 3600000 }] }); await pending;
  assert.equal(calls, 2); assert.deepEqual(f.events().slice(-2).map(e => e.cacheClass).sort(), ['network', 'pending']);
});
test('old manifest completion cannot annotate a newly opened reader trial', async () => {
  const f = rig(); f.begin(); let finish;
  f.context.manifest = () => new Promise(resolve => { finish = resolve; });
  f.run("apiRequest=manifest; fixtureGuide={id:'fixture-guide',assets:[{id:'fixture-page',remote:true,path:''}]}");
  const pending = f.run('ensureGuideFiles(fixtureGuide)'); f.begin();
  finish({ assets: [{ id: 'fixture-page', url: 'https://fixture.invalid/original', expiresAt: Date.now() + 3600000 }] }); await pending;
  assert.equal(f.events().filter(e => e.stage === 'files_ready').length, 0);
});
