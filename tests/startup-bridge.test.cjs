// Actual verify bridge, synthetic storage/transport only; no real network or Main records.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/akra-shell-bridge.js'),'utf8');
function fixture(response){
 const requests=[],window={location:{origin:'https://fixture.invalid',hostname:'fixture.invalid',search:''},addEventListener(){},localStorage:{getItem:()=>null}};window.parent=window;
 const c=vm.createContext({window,console,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch:async(_url,options)=>{requests.push(JSON.parse(options.body));return response;}});
 vm.runInContext(source,c);return{bridge:window.AkraModule,requests};
}
test('SOP reasonless verify maps permission/rate/session/server without any automatic retry',async()=>{
 for(const [status,reason]of [[403,'permission_denied'],[429,'rate_limited'],[401,'invalid_session'],[400,'invalid_session'],[200,'invalid_session'],[500,'internal_error']]){
  const f=fixture({ok:status<400,status,json:async()=>({valid:false})});
  await assert.rejects(f.bridge.verifySession('app-manual','fictional-token'),error=>error.reason===reason&&error.code===reason&&error.status===status);assert.equal(f.requests.length,1);
 }
});
test('SOP verify preserves explicit reason before HTTP fallback and safely classifies malformed server JSON',async()=>{
 const f=fixture({ok:false,status:403,json:async()=>({reason:'session_changed'})});
 await assert.rejects(f.bridge.verifySession('app-manual','fictional-token'),e=>e.message==='session_changed'&&e.reason==='session_changed'&&e.status===403);
 for(const json of [async()=>null,async()=>{throw new SyntaxError('fictional non-JSON');}]){
  const next=fixture({ok:false,status:500,json});await assert.rejects(next.bridge.verifySession('app-manual','fictional-token'),e=>e.reason==='internal_error'&&e.status===500);
 }
});
