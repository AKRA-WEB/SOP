const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const verifiedUser = {id:'10000000-0000-4000-8000-000000000011',sessionVersion:1,authorizationRevision:'fixture-revision'};
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => new vm.Script(m[1]));

test('file URLs load on demand with single flight, expiry refresh and retry after failure', async () => {
  const {context} = rig();
  let calls=0, fail=false;
  context.manifest=async()=>{ calls++; if(fail) throw new Error('storage_error'); return {assets:[{id:'a',url:'https://example.com/original',previewUrl:'https://example.com/preview',expiresAt:Date.now()+3600000}]}; };
  vm.runInContext("runtime.token='test'; apiRequest=manifest; testGuide={id:'g',assets:[{id:'a',remote:true,path:''}]}",context);
  await vm.runInContext('Promise.all([ensureGuideFiles(testGuide),ensureGuideFiles(testGuide)])',context);
  assert.equal(calls,1);
  assert.equal(vm.runInContext('testGuide.assets[0].previewPath',context),'https://example.com/preview');
  await vm.runInContext('ensureGuideFiles(testGuide)',context);
  assert.equal(calls,1);
  vm.runInContext('testGuide.assets[0].expiresAt=1',context);
  fail=true;
  await assert.rejects(vm.runInContext('ensureGuideFiles(testGuide)',context),/storage_error/);
  fail=false;
  await vm.runInContext('ensureGuideFiles(testGuide)',context);
  assert.equal(calls,3);
});

test('tab cache requires current identity and matching metadata, and expires without offline access', async () => {
  const {context}=rig();
  const store=new Map();
  context.window.sessionStorage={getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)};
  let calls=0;
  context.manifest=async()=>{calls++;return {assets:[{id:'a',url:'https://example.com/original',expiresAt:Date.now()+3600000}]};};
  vm.runInContext("runtime.token='test'; runtime.user={...verifiedUser}; apiRequest=manifest; testGuide={id:'g',assets:[{id:'a',remote:true,path:''}]}",context);
  await vm.runInContext('ensureGuideFiles(testGuide)',context);
  vm.runInContext("testGuide={id:'g',assets:[{id:'a',remote:true,path:''}]}",context);
  await vm.runInContext('ensureGuideFiles(testGuide)',context);
  assert.equal(calls,1,'same authorized tab can reuse a signed URL after metadata reload');
  vm.runInContext("runtime.user={...verifiedUser,id:'10000000-0000-4000-8000-000000000012'}; testGuide.assets[0].path='';",context);
  await vm.runInContext('ensureGuideFiles(testGuide)',context);
  assert.equal(calls,2,'another identity must request its own manifest');
  vm.runInContext("runtime.token=''; testGuide.assets[0].path='';",context);
  await assert.rejects(vm.runInContext('ensureGuideFiles(testGuide)',context),/missing_token/);
  assert.equal(calls,2);
  vm.runInContext("runtime.token='test'; testGuide.revision='new';",context);
  await vm.runInContext('ensureGuideFiles(testGuide)',context);
  assert.equal(calls,3,'changed metadata invalidates persistent cache');
  for (const [key,value] of store) {const cache=JSON.parse(value);cache.entries.forEach(entry=>entry.assets.forEach(file=>{file.expiresAt=1;}));store.set(key,JSON.stringify(cache));}
  vm.runInContext("testGuide.assets[0].path=''",context);
  await vm.runInContext('ensureGuideFiles(testGuide)',context);
  assert.equal(calls,4,'expired tab cache requests a fresh manifest');
});

test('a closed reader ignores a late manifest and prefetch respects data-saving connections', async () => {
  const {context}=rig();
  let resolveManifest, renders=0;
  context.manifest=()=>new Promise(resolve=>{resolveManifest=resolve;});
  context.renderSpy=()=>{renders++;};
  const nodes={};
  context.document.querySelector=selector=>nodes[selector] ||= {};
  context.document.body={classList:{remove(){}}};
  vm.runInContext("runtime.token='test'; apiRequest=manifest; announce=()=>{}; renderModalPreview=renderSpy; dom.modal={hidden:false,dataset:{guideId:'g'},classList:{toggle(){}}}; dom.modalAssets={querySelectorAll:()=>[]}; dom.modalMessage={}; dom.modalDownload={}; dom.modalZoom={hidden:true,setAttribute(){}}; dom.modalZoomLabel={}; dom.modalPreview={querySelector:()=>null,querySelectorAll:()=>[]}; guides=[{id:'g',assets:[{id:'a',remote:true,path:'',label:'A'}]}]",context);
  const pending=vm.runInContext('previewModalAsset(0)',context);
  vm.runInContext('closeModal()',context);
  resolveManifest({assets:[{id:'a',url:'https://example.com/a',expiresAt:Date.now()+3600000}]});
  await pending;
  assert.equal(renders,0);
  const requested=[];
  context.Image=class {set src(url){requested.push(url);}};
  context.navigator={connection:{saveData:true}};
  vm.runInContext("guides[0].assets.push({kind:'image',remote:true,path:'original',previewPath:'preview',expiresAt:Date.now()+3600000}); prefetchNextPage()",context);
  assert.equal(requested.length,0);
  context.navigator.connection={effectiveType:'slow-2g'};
  vm.runInContext('prefetchNextPage()',context);
  assert.equal(requested.length,0);
  context.navigator.connection={effectiveType:'4g'};
  vm.runInContext('prefetchNextPage()',context);
  assert.deepEqual(requested,['preview']);
});

test('upload reading copy falls back safely and releases decoded images', async () => {
  const {context}=rig();
  let closed=0;
  context.createImageBitmap=async()=>({width:3200,height:2000,close(){closed++;}});
  const canvas={getContext:()=>({drawImage(){}}),toBlob(callback){callback({type:'image/webp',size:100});}};
  context.document.createElement=()=>canvas;
  assert.equal((await vm.runInContext("readingPreview({type:'image/png',size:1000})",context)).size,100);
  assert.equal(canvas.width,1600);
  assert.equal(canvas.height,1000);
  assert.equal(await vm.runInContext("readingPreview({type:'image/png',size:50})",context),null);
  context.createImageBitmap=async()=>{throw new Error('unsupported');};
  assert.equal(await vm.runInContext("readingPreview({type:'image/png',size:1000})",context),null);
  assert.equal(closed,2);
});

function rig(roles = [], status = 200) {
  const calls = [];
  const store = new Map();
  const context = vm.createContext({ URL, URLSearchParams, console, verifiedUser,
    document: { readyState: 'loading', addEventListener() {}, querySelector:()=>null, body:{classList:{remove(){}}} },
    window: { addEventListener(){}, location: { hostname: 'example.com', search: '?sso=test-only', pathname: '/SOP/', hash: '', origin: 'https://example.com' }, history: { replaceState() {} }, localStorage: { getItem: k => store.get(k), setItem: (k,v) => store.set(k,v) } },
    fetch: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return { ok: status === 200, status, json: async () => status === 200 ? { status: 'success', user: { ...verifiedUser, roles }, documents: [{ id:'one', title:'คู่มือ', assets:[], status:'published' }] } : { status:'error', reason:'invalid_or_expired_token' } };
    }
  });
  scripts.forEach(s => s.runInContext(context));
  vm.runInContext("runtime.user={...verifiedUser}; runtime.token='test'; dom.adminOpen = { hidden: true }; dom.adminConsole = { hidden: true }; dom.runtimeStatus = {}; dom.resultStatus = {}; render = () => {}; openSharedGuide = () => {};", context);
  return { context, calls };
}
test('all inline scripts compile and declared version matches version.json', () => {
  const {context} = rig();
  assert.equal(vm.runInContext('CURRENT_VERSION', context), JSON.parse(fs.readFileSync(path.join(root,'version.json'))).version);
});
for (const roles of [[], ['ADMIN']]) test(`startup uses one list request and keeps management closed (${roles})`, async () => {
  const {context,calls} = rig(roles);
  await vm.runInContext('bootstrapSession()', context);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'list');
  assert.equal(calls[0].includeUrls, false);
  assert.equal(vm.runInContext('guides.length', context), 1);
  assert.equal(vm.runInContext('dom.adminConsole.hidden', context), true);
  assert.equal(vm.runInContext('dom.adminOpen.hidden', context), !roles.includes('ADMIN'));
});
test('expired session leaves no catalog visible', async () => {
  const {context} = rig(['ADMIN'], 401);
  await vm.runInContext('bootstrapSession()', context);
  assert.equal(vm.runInContext('guides.length', context), 0);
  assert.equal(vm.runInContext('dom.adminOpen.hidden', context), true);
});

test('mobile selects and desktop buttons share filter state and reset together', () => {
  const {context}=rig();
  const selects=[{dataset:{filterSelect:'view'}},{dataset:{filterSelect:'role'}}];
  const view={dataset:{view:'workflow'},setAttribute(_key,value){this.pressed=value;}};
  const role={dataset:{role:'warehouse'},setAttribute(_key,value){this.pressed=value;}};
  context.document.querySelectorAll=selector=>({'[data-filter-select]':selects,'[data-view]':[view],'[data-role]':[role]}[selector]||[]);
  vm.runInContext("announce=()=>{}; render=updatePressedStates; dom.searchInput={value:'ค้นหา'}; setFilter('view','workflow'); setFilter('role','warehouse')",context);
  assert.deepEqual(selects.map(select=>select.value),['workflow','warehouse']);
  assert.equal(view.pressed,'true');
  assert.equal(role.pressed,'true');
  vm.runInContext('resetFilters()',context);
  assert.deepEqual(selects.map(select=>select.value),['all','all']);
  assert.equal(view.pressed,'false');
  assert.equal(role.pressed,'false');
  assert.equal(vm.runInContext('dom.searchInput.value',context),'');
});

test('reader navigation synchronizes the mobile selector and ignores out-of-range pages', () => {
  const {context}=rig();
  const nodes={'[data-reader-select]':{},'[data-reader-position]':{},'[data-reader-prev]':{},'[data-reader-next]':{},'[data-reader-scroll]':{scrollTop:300}};
  context.document.querySelector=selector=>nodes[selector];
  vm.runInContext("announce=()=>{}; dom.modal={dataset:{guideId:'g'},classList:{toggle(){}}}; dom.modalAssets={querySelectorAll:()=>[]}; dom.modalPreview={querySelector:()=>null,querySelectorAll:()=>[]}; dom.modalMessage={}; dom.modalDownload={}; dom.modalZoom={hidden:true,setAttribute(){}}; dom.modalZoomLabel={}; guides=[{id:'g',assets:[{label:'แรก',kind:'image',path:'a'},{label:'สอง',kind:'image',path:'b'}]}]; renderReaderPages=()=>{}; previewModalAsset(1)",context);
  assert.equal(nodes['[data-reader-select]'].value,'1');
  assert.equal(nodes['[data-reader-position]'].textContent,'ส่วนที่ 2 / 2');
  assert.equal(nodes['[data-reader-prev]'].disabled,false);
  assert.equal(nodes['[data-reader-next]'].disabled,true);
  assert.equal(nodes['[data-reader-scroll]'].scrollTop,300,'selecting a page does not reset the continuous reading position');
  vm.runInContext('previewModalAsset(-1); previewModalAsset(2)',context);
  assert.equal(nodes['[data-reader-select]'].value,'1');
  vm.runInContext('previewModalAsset(0)',context);
  assert.equal(nodes['[data-reader-select]'].value,'0');
  assert.equal(nodes['[data-reader-prev]'].disabled,true);
  assert.equal(nodes['[data-reader-next]'].disabled,false);
});

test('continuous reader jumps to a page without replacing the shared scroll surface', () => {
  const {context}=rig();
  const nodes={'[data-reader-select]':{},'[data-reader-position]':{},'[data-reader-prev]':{},'[data-reader-next]':{}};
  const pages=[0,1,2].map(index=>({dataset:{readerPage:String(index)},scrollIntoView(){this.jumped=true;}}));
  context.document.querySelector=selector=>nodes[selector];
  const preview={querySelector(selector){const match=selector.match(/"(\d+)"/);return match ? pages[Number(match[1])] : pages[0];},querySelectorAll(selector){return selector==='[data-reader-page]' ? pages : [];}};
  context.readerPreview=preview;
  vm.runInContext("announce=()=>{}; dom.modal={dataset:{guideId:'g',hidden:false},classList:{toggle(){}}}; dom.modalAssets={querySelectorAll:()=>[]}; dom.modalPreview=readerPreview; dom.modalDownload={}; dom.modalZoom={hidden:true,setAttribute(){}}; dom.modalZoomLabel={}; dom.modalMessage={}; guides=[{id:'g',assets:[{label:'หนึ่ง',kind:'image',path:'a'},{label:'สอง',kind:'image',path:'b'},{label:'สาม',kind:'image',path:'c'}]}]; renderReaderPages=()=>{throw new Error('must not rerender on jump')}; previewModalAsset(2)",context);
  assert.equal(vm.runInContext('state.readerIndex',context),2);
  assert.equal(pages[2].jumped,true);
});

test('API mapping retains display name, original filename and server page order', () => {
  const {context}=rig();
  const result=vm.runInContext("apiGuideToGuide({id:'g',assets:[{id:'b',name:'original.pdf',displayName:'เริ่มที่นี่',sortOrder:0,type:'application/pdf'},{id:'a',name:'image.png',sortOrder:1,type:'image/png'}]})",context);
  assert.deepEqual(Array.from(result.assets,a=>[a.id,a.label,a.fileName,a.kind]),[['b','เริ่มที่นี่','original.pdf','pdf'],['a','image.png','image.png','image']]);
});

test('moving a draft retains edited labels, enforces bounds and does not mutate source', () => {
  const {context}=rig();
  context.document.querySelector=()=>({focus(){},textContent:''});
  vm.runInContext("renderPageEditor=()=>{}; pageEditor={pages:[{id:'a',displayName:'ชื่อใหม่'},{id:'b',displayName:'ภาพสอง'}],saving:false}; moveEditorPage(0,1)",context);
  assert.deepEqual(Array.from(vm.runInContext('pageEditor.pages',context),a=>[a.id,a.displayName]),[['b','ภาพสอง'],['a','ชื่อใหม่']]);
  vm.runInContext('moveEditorPage(1,1); moveEditorPage(0,-1); pageEditor.saving=true; moveEditorPage(0,1)',context);
  assert.deepEqual(Array.from(vm.runInContext('pageEditor.pages',context),a=>a.id),['b','a']);
});

test('sharing uses a stable guide link without the session or signed file URL', async () => {
  const { context } = rig();
  let copied;
  context.navigator = { clipboard: { writeText: async value => { copied = value; } } };
  vm.runInContext("window.isSecureContext = true; announce = () => {}; dom.modal = {hidden:false}; dom.modalMessage = {}; guides = [{id:'guide-1', title:'Guide', description:'Read', assets:[{remote:true,path:'https://storage.example/file?token=private'}]}]", context);
  await vm.runInContext("shareGuide('guide-1')", context);
  assert.equal(copied, 'https://example.com/SOP/#guide=guide-1');
});

test('removal only stages explicit IDs and retains the expected snapshot', () => {
  const {context,calls}=rig();
  context.document.querySelector=()=>({focus(){},textContent:''});
  vm.runInContext("runtime.isAdmin=true; renderPageEditor=()=>{}; pageEditor={pages:[{id:'a'},{id:'b'}],expected:[{id:'a'},{id:'b'}],removed:[],saving:false}; removeEditorPage(0)",context);
  assert.deepEqual(Array.from(vm.runInContext('pageEditor.removed',context)),['a']);
  assert.equal(vm.runInContext('pageEditor.expected.length',context),2);
  assert.equal(calls.length,0);
  vm.runInContext('pageEditor.saving=true; removeEditorPage(0); pageEditor.saving=false; removeEditorPage(0)',context);
  assert.equal(vm.runInContext('pageEditor.pages.length',context),0);
  assert.deepEqual(Array.from(vm.runInContext('pageEditor.removed',context)),['a','b']);
});

for (const ok of [true, false]) test(`remote reader download handles HTTP success=${ok}`, async () => {
  const {context} = rig();
  let clicked = 0;
  let prevented = 0;
  const link = {click(){ clicked++; }, remove(){}};
  context.fetch = async () => ({ok, blob:async()=>new Blob(['image'])});
  context.URL = { createObjectURL:()=> 'blob:test', revokeObjectURL(){} };
  context.document.createElement = () => link;
  context.document.body = {appendChild(){}};
  context.event = {preventDefault(){ prevented++; }};
  context.window.setTimeout = () => {};
  vm.runInContext("dom.modal = {dataset:{guideId:'g'}}; dom.modalMessage = {}; state.readerIndex=0; guides=[{id:'g', assets:[{remote:true,path:'https://storage.example/image',label:'page.png'}]}]", context);
  await vm.runInContext('downloadReaderPage(event)', context);
  assert.equal(prevented, 1);
  assert.equal(clicked, ok ? 1 : 0);
  if (ok) assert.equal(link.download, 'page.png');
  assert.equal(vm.runInContext('dom.modalMessage.textContent',context), ok ? 'ดาวน์โหลดพร้อมแล้ว' : 'ดาวน์โหลดไม่สำเร็จ ลองเปิดคู่มือใหม่แล้วดาวน์โหลดอีกครั้ง');
});
