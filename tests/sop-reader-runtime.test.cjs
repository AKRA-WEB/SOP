const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => new vm.Script(m[1]));

function rig(roles = [], status = 200) {
  const calls = [];
  const store = new Map();
  const context = vm.createContext({ URL, URLSearchParams, console,
    document: { readyState: 'loading', addEventListener() {} },
    window: { location: { hostname: 'example.com', search: '?sso=test-only', pathname: '/SOP/', hash: '', origin: 'https://example.com' }, history: { replaceState() {} }, localStorage: { getItem: k => store.get(k), setItem: (k,v) => store.set(k,v) } },
    fetch: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return { ok: status === 200, status, json: async () => status === 200 ? { status: 'success', user: { roles }, documents: [{ id:'one', title:'คู่มือ', assets:[], status:'published' }] } : { status:'error', reason:'invalid_or_expired_token' } };
    }
  });
  scripts.forEach(s => s.runInContext(context));
  vm.runInContext("dom.adminOpen = { hidden: true }; dom.adminConsole = { hidden: true }; dom.runtimeStatus = {}; dom.resultStatus = {}; render = () => {}; openSharedGuide = () => {};", context);
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
