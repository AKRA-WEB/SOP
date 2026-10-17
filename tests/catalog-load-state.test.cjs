// Actual catalog bootstrap/render/retry with synthetic DOM, storage and fetch only.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>new vm.Script(m[1]));
const user={id:'10000000-0000-4000-8000-000000000011',name:'Fixture',roles:[],sessionVersion:1,authorizationRevision:'one'};
function fixture(){
 const nodes=new Map(),storage=new Map(),requests=[],events={};const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false,value:'',dataset:{},style:{},classList:{toggle(){},remove(){}},setAttribute(){},removeAttribute(){},reset(){},addEventListener(){},querySelector:()=>node('child'),querySelectorAll:()=>[]});return nodes.get(id);};
 const c=vm.createContext({console,URL,URLSearchParams,FormData,window:{location:{hostname:'fixture.invalid',search:'?sso=fixture-token',pathname:'/SOP/',hash:''},history:{replaceState(){c.window.location.search='';}},addEventListener(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},sessionStorage:{getItem:()=>null,setItem(){}},setTimeout(){}},
  document:{readyState:'loading',title:'SOP',querySelector:node,querySelectorAll:()=>[],body:{classList:{remove(){}}},addEventListener:(name,fn)=>events[name]=fn},fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({resolve,reject,body:JSON.parse(options.body)}))});
 scripts.forEach(s=>s.runInContext(c));const run=s=>vm.runInContext(s,c);
 run('cacheDom(); guides=[]; state.selectedId=""; render();');const reply=(index,documents=[],status=200)=>requests[index].resolve({ok:status<400,status,json:async()=>({status:status<400?'success':'error',reason:status===500?'internal_error':status===403?'permission_denied':status===401?'invalid_or_expired_token':undefined,user,documents})});
 return{c,run,node,requests,reply,events,storage};
}
test('pending and failed bootstrap never show no-match, and catalog retry uses the read to recover',async()=>{
 const f=fixture();const pending=f.run('bootstrapSession()');assert.match(f.node('[data-guide-list]').innerHTML,/กำลังโหลดคู่มือ/);assert.doesNotMatch(f.node('[data-guide-list]').innerHTML,/ยังไม่พบคู่มือ/);
 f.reply(0,[],500);await pending;assert.match(f.node('[data-guide-list]').innerHTML,/ระบบขัดข้องชั่วคราว/);assert.match(f.node('[data-guide-list]').innerHTML,/data-catalog-retry/);assert.doesNotMatch(f.node('[data-guide-list]').innerHTML,/ยังไม่พบคู่มือ/);
 const retry=f.run('retryCatalog()');assert.equal(f.requests.length,2);f.reply(1);await retry;assert.match(f.node('[data-guide-list]').innerHTML,/ยังไม่มีคู่มือในหมวดนี้/);
 assert.doesNotMatch(f.node('[data-guide-list]').innerHTML,/ยังไม่พบคู่มือที่ตรงกัน/);
});
test('successful empty category and no search match use distinct messages',async()=>{
 const f=fixture();const pending=f.run('bootstrapSession()');f.reply(0,[{id:'g',title:'คู่มือ',status:'published',assets:[]}]);await pending;
 f.run('state.query="คำที่ไม่มี";render()');assert.match(f.node('[data-guide-list]').innerHTML,/ยังไม่พบคู่มือที่ตรงกัน/);
 f.run('state.query="";state.view="onboarding";render()');assert.match(f.node('[data-guide-list]').innerHTML,/ยังไม่มีคู่มือในหมวดนี้/);
});
test('timeout is recoverable; denied or expired catalog has no read retry',async()=>{
 for(const status of [403,401]){const f=fixture();const pending=f.run('bootstrapSession()');f.reply(0,[],status);await pending;assert.doesNotMatch(f.node('[data-guide-list]').innerHTML,/data-catalog-retry|ยังไม่พบคู่มือ/);assert.match(f.node('[data-guide-list]').innerHTML,status===403?/ไม่มีสิทธิ์ใช้ส่วนนี้/:/เซสชันหมดอายุหรือเปลี่ยนแล้ว/);}
 const f=fixture();const pending=f.run('bootstrapSession()');f.requests[0].reject(Object.assign(new Error('deadline'),{name:'AbortError'}));await pending;assert.match(f.node('[data-guide-list]').innerHTML,/เชื่อมต่อไม่ได้/);
});
test('retry is single flight and never reuses a failed SSO token after a stored login changes',async()=>{
 const f=fixture();const pending=f.run('bootstrapSession()');f.requests[0].reject(new TypeError('offline'));await pending;
 const retry=f.run('retryCatalog()');await f.run('retryCatalog()');assert.equal(f.requests.length,2);f.reply(1);await retry;
 const fresh=fixture();const old=fresh.run('bootstrapSession()');fresh.requests[0].reject(new TypeError('offline'));await old;
 fresh.storage.set('akra_sop_session',JSON.stringify({token:'replacement-login'}));const next=fresh.run('retryCatalog()');assert.equal(fresh.run('runtime.token'),'replacement-login');fresh.reply(1);await next;
});
test('admin catalog read failure uses read wording and successful retry clears its status',async()=>{
 const f=fixture();const first=f.run('bootstrapSession()');f.reply(0,[{id:'g',title:'คู่มือเดิม',status:'published',assets:[]}]);await first;
 f.run('runtime.isAdmin=true');const refresh=f.run('refreshAdminCatalog()');f.reply(1,[],500);await refresh;
 assert.match(f.node('[data-admin-message]').textContent,/ระบบขัดข้องชั่วคราว/);assert.doesNotMatch(f.node('[data-admin-message]').textContent,/ยังยืนยันผลการบันทึกไม่ได้/);
 const retry=f.run('retryCatalog()');f.reply(2,[{id:'g',title:'คู่มือเดิม',status:'published',assets:[]}]);await retry;
 assert.equal(f.node('[data-admin-message]').textContent,'โหลดรายการคู่มือแล้ว');
 assert.equal(f.run('formErrorMessage(new Error("offline"))'),'ยังยืนยันผลการบันทึกไม่ได้ กรุณาตรวจรายการล่าสุดก่อนส่งซ้ำ','mutation uncertainty wording remains unchanged');
});
test('current refresh session change clears loading and retires the old guide surface',async()=>{
 const f=fixture();const initial=f.run('bootstrapSession()');f.reply(0,[{id:'g',title:'คู่มือเดิม',status:'published',assets:[]}]);await initial;
 const refresh=f.run('loadRemoteGuides()');f.reply(1);f.run('runtime.token="replacement-token"');await assert.rejects(refresh,/session_changed/);
 assert.equal(f.run('runtime.catalogLoading'),false);assert.doesNotMatch(f.node('[data-guide-list]').innerHTML,/กำลังโหลดคู่มือ|คู่มือเดิม/);
});
test('mismatched catalog identity clears loading with no private catalog publication',async()=>{
 const f=fixture();const initial=f.run('bootstrapSession()');f.reply(0,[{id:'g',title:'คู่มือเดิม',status:'published',assets:[]}]);await initial;
 const refresh=f.run('loadRemoteGuides()');f.requests[1].resolve({ok:true,status:200,json:async()=>({status:'success',user:{...user,id:'10000000-0000-4000-8000-000000000012'},documents:[{id:'other',title:'ข้อมูลอื่น',assets:[]}]})});await assert.rejects(refresh,/session_changed/);
 assert.equal(f.run('runtime.catalogLoading'),false);assert.equal(f.run('guides.length'),0);assert.doesNotMatch(f.node('[data-guide-list]').innerHTML,/กำลังโหลดคู่มือ|คู่มือเดิม|ข้อมูลอื่น/);
});
test('older refresh cannot clear the spinner of a newer pending catalog request',async()=>{
 const f=fixture();const initial=f.run('bootstrapSession()');f.reply(0);await initial;
 const old=f.run('loadRemoteGuides()'),newer=f.run('loadRemoteGuides()');f.reply(1);await assert.rejects(old,/session_changed/);assert.equal(f.run('runtime.catalogLoading'),true);
 f.reply(2,[{id:'new',title:'คู่มือใหม่',status:'published',assets:[]}]);await newer;assert.equal(f.run('runtime.catalogLoading'),false);assert.match(f.node('[data-guide-list]').innerHTML,/คู่มือใหม่/);
});

for(const mainRecord of [false,true])test(`SOP incoming B retry outranks saved A without persisting before verification; Main B=${mainRecord}`,async()=>{
 const f=fixture(),savedA=JSON.stringify({token:'account-A',user:{...user,id:'10000000-0000-4000-8000-000000000012'}});
 f.storage.set('akra_sop_session',savedA);f.c.window.location.search='?sso=account-B';
 if(mainRecord){f.c.window.AkraModule={getToken:()=>'',sessionStamp:()=> 'Main-account-B',watchSession:options=>{
   if(options.user.id!==user.id){options.invalidated();throw new Error('session_changed');}
 }};}
 const first=f.run('bootstrapSession()');assert.equal(f.requests[0].body.token,'account-B');
 f.reply(0,[],500);await first;assert.equal(f.storage.get('akra_sop_session'),savedA);assert.equal(f.run('runtime.user'),null);
 const retry=f.run('retryCatalog()');assert.deepEqual(f.requests.map(r=>r.body.token),['account-B','account-B']);assert.equal(f.storage.get('akra_sop_session'),savedA);
 const requested=f.requests[1].body.token,owner=requested==='account-B'?user:{...user,id:'10000000-0000-4000-8000-000000000012'};
 f.requests[1].resolve({ok:true,status:200,json:async()=>({status:'success',user:owner,documents:[{id:requested,title:requested,status:'published',assets:[]}]})});await retry;
 assert.equal(f.run('runtime.user.id'),user.id);assert.equal(f.run('runtime.connected'),true);assert.equal(JSON.parse(f.storage.get('akra_sop_session')).token,'account-B');
 assert.match(f.node('[data-guide-list]').innerHTML,/account-B/);assert.doesNotMatch(f.node('[data-guide-list]').innerHTML,/account-A/);
});

test('SOP replacement URL token outranks an old retry token',async()=>{
 const f=fixture();const first=f.run('bootstrapSession()');f.reply(0,[],500);await first;
 f.c.window.location.search='?sso=latest-URL';const retry=f.run('retryCatalog()');assert.equal(f.requests[1].body.token,'latest-URL');f.reply(1);await retry;
});

test('SOP bootstrap token change clears the current spinner without publishing the old response',async()=>{
 const f=fixture();f.c.catalogResult={user,documents:[{id:'old',title:'OLD-PRIVATE',status:'published',assets:[]}]};
 f.run('apiRequest=async()=>{runtime.token="rotated-token";return catalogResult;}');await f.run('bootstrapSession()');
 assert.equal(f.run('runtime.catalogLoading'),false);assert.doesNotMatch(f.node('[data-guide-list]').innerHTML,/กำลังโหลดคู่มือ|OLD-PRIVATE/);
});

test('SOP old bootstrap completion leaves a newer bootstrap spinner and result alone',async()=>{
 const f=fixture();const old=f.run('bootstrapSession()'),newer=f.run('bootstrapSession("fixture-token")');
 f.reply(0,[{id:'old',title:'OLD-PRIVATE',status:'published',assets:[]}]);await old;assert.equal(f.run('runtime.catalogLoading'),true);
 f.reply(1,[{id:'new',title:'NEW-CURRENT',status:'published',assets:[]}]);await newer;
 assert.equal(f.run('runtime.catalogLoading'),false);assert.match(f.node('[data-guide-list]').innerHTML,/NEW-CURRENT/);assert.doesNotMatch(f.node('[data-guide-list]').innerHTML,/OLD-PRIVATE/);
});

test('SOP non-current failed refresh clears its spinner without reusing private guides',async()=>{
 const f=fixture();const first=f.run('bootstrapSession()');f.reply(0,[{id:'old',title:'OLD-PRIVATE',status:'published',assets:[]}]);await first;
 const refresh=f.run('loadRemoteGuides()');f.run('runtime.token="rotated-token"');f.requests[1].reject(new TypeError('offline'));
 await assert.rejects(refresh,/offline/);assert.equal(f.run('runtime.catalogLoading'),false);assert.doesNotMatch(f.node('[data-guide-list]').innerHTML,/กำลังโหลดคู่มือ|OLD-PRIVATE/);
});
