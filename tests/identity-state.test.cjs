const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>new vm.Script(m[1]));
const original={id:'10000000-0000-4000-8000-000000000011',name:'Fixture',roles:['ADMIN'],sessionVersion:1,authorizationRevision:'revision-one',canManageDocuments:true};
const replacement={...original,id:'10000000-0000-4000-8000-000000000012'};
const tick=()=>new Promise(setImmediate);
const manifest=()=>({assets:[{id:'a',url:'https://fixture.invalid/original',expiresAt:Date.now()+3600000}]});
const guide=()=>({id:'g',revision:'r',status:'published',assets:[{id:'a',remote:true,path:'',label:'page.png'}]});
function rig(){
 const local=new Map(),tab=new Map(),events={},nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,innerHTML:'private',textContent:'private',dataset:{},style:{},classList:{remove(){},toggle(){}},close(){this.open=false;},reset(){this.resetCount=(this.resetCount||0)+1;},setAttribute(){},removeAttribute(){},querySelectorAll:()=>[]});return nodes.get(id);};
 const c=vm.createContext({URL,URLSearchParams,FormData,console,document:{readyState:'loading',title:'SOP',addEventListener(){},querySelector:node,querySelectorAll:()=>[],body:{classList:{remove(){}}}},
  window:{location:{hostname:'example.com',search:'?sso=fixture-token',pathname:'/SOP/',hash:''},history:{replaceState(){}},addEventListener:(name,fn)=>events[name]=fn,
   localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},sessionStorage:{getItem:k=>tab.get(k)||null,setItem:(k,v)=>tab.set(k,v)}},
  fetch:async()=>({ok:true,status:200,json:async()=>({status:'success',user:{...original},documents:[{id:'g',title:'Private',status:'published',assets:[]}]})})});
 scripts.forEach(s=>s.runInContext(c));const run=s=>vm.runInContext(s,c);
 c.fixtureUser=original;c.fixtureNode=node;
 run("Object.assign(dom,Object.fromEntries(['adminOpen','adminConsole','adminModal','adminForm','adminList','adminExistingAssets','runtimeStatus','resultStatus','modal','modalPreview','modalAssets','modalDownload','modalMessage','adminSubmit','adminFormMessage','announcer','searchInput','authMain'].map(k=>[k,fixtureNode(k)]))); render=()=>{}; openSharedGuide=()=>{};");
 const user=(u=original,token='fixture-token')=>{c.fixtureUser={...u};c.fixtureToken=token;run('runtime.user=fixtureUser;runtime.token=fixtureToken;runtime.connected=true;runtime.isAdmin=true;');};
 return{c,run,node,local,tab,events,user};
}
test('SOP pending bootstrap cannot overwrite a newly stored login or display its old catalog',async()=>{
 const f=rig();let finish;f.c.fetch=()=>new Promise(resolve=>finish=resolve);
 const pending=f.run('bootstrapSession()');await tick();assert.equal(f.run('runtime.user'),null);
 f.local.set('akra_sop_session','replacement-login');
 finish({ok:true,status:200,json:async()=>({status:'success',user:original,documents:[{id:'g',assets:[]}]})});await pending;
 assert.equal(f.local.get('akra_sop_session'),'replacement-login');assert.equal(f.run('guides.length'),0);assert.equal(f.run('runtime.user'),null);
});

test('SOP shared Main sign-out blocks its trusted list bootstrap before any domain request',async()=>{
 const f=rig();let calls=0;f.c.fetch=async()=>{calls++;throw Error('must not fetch');};
 f.c.window.AkraModule={getToken:()=>'',isMainSignedOut:()=>true};
 await f.run('bootstrapSession()');assert.equal(calls,0);assert.equal(f.run('runtime.user'),null);assert.equal(f.run('guides.length'),0);
 assert.match(f.node('runtimeStatus').textContent,/Main/);
});
test('SOP signed-file cache isolates UUID, session version and authorization revision without importing legacy',async()=>{
 const f=rig();f.user();let calls=0;f.c.manifest=async()=>{calls++;return manifest();};f.run('apiRequest=manifest');
 f.tab.set('akra_sop_session_files',JSON.stringify({ownerId:original.id,entries:[{fingerprint:'old',assets:[]}]}));
 for(const u of [original,original,{...original,authorizationRevision:'revision-two'},{...original,sessionVersion:2},replacement]){
  f.user(u);f.c.testGuide=guide();await f.run('ensureGuideFiles(testGuide)');
 }
 assert.equal(calls,4);assert.equal(JSON.parse(f.tab.get('akra_sop_session_files')).entries[0].fingerprint,'old');
});
test('SOP in-memory manifests and late file replies cannot cross owners even if token text is reused',async()=>{
 const f=rig();f.user();f.c.testGuide=guide();let calls=0,finish;
 f.c.manifest=async()=>{calls++;return manifest();};f.run('apiRequest=manifest');await f.run('ensureGuideFiles(testGuide)');
 f.user(replacement);await f.run('ensureGuideFiles(testGuide)');assert.equal(calls,2);
 f.c.testGuide=guide();f.c.manifest=()=>new Promise(resolve=>finish=resolve);f.run('apiRequest=manifest');
 const pending=f.run('ensureGuideFiles(testGuide,true)');f.user(original);finish(manifest());
 await assert.rejects(pending,/session_changed/);assert.equal(f.c.testGuide.assets[0].path,'');
});
for(const mode of ['JSON','form'])test(`SOP late ${mode} transport rejects replaced credentials without retry`,async()=>{
 const f=rig();f.user();let finish,calls=0;f.c.fetch=()=>{calls++;return new Promise(resolve=>finish=resolve);};
 const pending=f.run(mode==='JSON'?"apiRequest('updatePages',{pages:[]})":"apiForm(new FormData())");
 f.user(replacement,'new-token');finish({ok:true,status:200,json:async()=>({status:'success'})});
 await assert.rejects(pending,/session_changed/);assert.equal(calls,1);
});
test('SOP own-session replacement clears reader, admin forms and native page editor without deleting the new login',async()=>{
 const f=rig();await f.run('bootstrapSession()');
 f.run("dom.modal.hidden=false;dom.adminModal.hidden=false;dom.adminConsole.hidden=false;pageEditor.pages=[{id:'private'}];runtime.adminGuides=[{id:'private'}];");
 f.node('[data-page-editor]').open=true;f.local.set('akra_sop_session','new-login');
 assert.equal(typeof f.events.storage,'function');f.events.storage({key:'akra_sop_session',oldValue:'old',newValue:'new-login'});
 assert.equal(f.run('runtime.user'),null);assert.equal(f.run('guides.length'),0);assert.equal(f.run('pageEditor.pages.length'),0);
 for(const id of ['modal','adminModal','adminConsole','adminOpen'])assert.equal(f.node(id).hidden,true,id);
 for(const id of ['modalPreview','adminList','adminExistingAssets','[data-page-list]'])assert.equal(f.node(id).innerHTML,'',id);
 assert.equal(f.node('[data-page-editor]').open,false);assert.equal(f.local.get('akra_sop_session'),'new-login');
 assert.equal(f.node('searchInput').value,'');assert.match(f.node('announcer').textContent,/Main/);assert.equal(f.node('authMain').hidden,false);
});
test('SOP late original download cannot dispatch a browser download after identity change',async()=>{
 const f=rig();f.user();let finish,clicked=0,objects=0;
 f.c.fetch=()=>new Promise(resolve=>finish=resolve);f.c.URL={createObjectURL(){objects++;return 'blob:fixture';},revokeObjectURL(){}};
 f.c.document.createElement=()=>({click(){clicked++;},remove(){}});f.c.document.body.appendChild=()=>{};f.c.window.setTimeout=()=>{};
 f.run("guides=[{id:'g',assets:[{remote:true,path:'https://fixture.invalid/image',label:'x'}]}];dom.modal.dataset.guideId='g';state.readerIndex=0");
 const pending=f.run('downloadReaderPage({preventDefault(){}})');await tick();f.user(replacement,'new-token');
 finish({ok:true,blob:async()=>new Blob(['synthetic'])});await pending;
 assert.equal(clicked,0);assert.equal(objects,0);
});
test('SOP image-preview preparation must not submit the former account form after replacement',async()=>{
 const f=rig();f.user();let finish,sends=0;
 f.c.FormData=class{delete(){}append(){}set(){}get(){return '';}};
 f.node('adminForm').querySelector=()=>({files:[{name:'synthetic.png',type:'image/png'}]});
 f.c.preview=()=>new Promise(resolve=>finish=resolve);f.c.submit=async()=>sends++;
 f.run('readingPreview=preview;apiForm=submit;loadRemoteGuides=async()=>{};announce=()=>{};');
 const pending=f.run('handleAdminSubmit({preventDefault(){}})');await tick();f.user(replacement,'new-token');finish(null);await pending;
 assert.equal(sends,0);
});
test('SOP overlapping catalog refreshes keep the newer list and deny old success messages',async()=>{
 const f=rig();f.user();const requests=[];f.c.fetch=()=>new Promise(resolve=>requests.push(resolve));
 const old=f.run('loadRemoteGuides()'),fresh=f.run('loadRemoteGuides()');
 const reply=id=>({ok:true,status:200,json:async()=>({status:'success',user:original,documents:[{id,title:id,status:'published',assets:[]}]})});
 requests[1](reply('newer'));await fresh;requests[0](reply('older'));await assert.rejects(old,/session_changed/);
 assert.equal(f.run('guides[0].id'),'newer');
});
test('SOP read denial clears private dialogs but management-only denial preserves the readable page',async()=>{
 for(const action of ['getFiles','updatePages']){
  const f=rig();f.user();f.c.fetch=async()=>({ok:false,status:403,json:async()=>({reason:'permission_denied'})});
  await assert.rejects(f.c.apiRequest(action),/permission_denied/);
  assert.equal(f.node('modal').hidden,action==='getFiles');
  assert.equal(f.run('runtime.user === null'),action==='getFiles');
 }
});
