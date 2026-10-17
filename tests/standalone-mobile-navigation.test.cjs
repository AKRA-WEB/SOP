const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/akra-shell-bridge.js'),'utf8');
function fixture(embedded=false){
 const events={},storage=new Map(),navigations=[],alerts=[];
 function element(tag='div'){
  const attrs={},listeners={},classes=new Set();
  const e={tagName:tag.toUpperCase(),children:[],hidden:false,open:false,attrs,listeners,style:{},dataset:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},
   appendChild(child){this.children.push(child);child.parentNode=this;return child;},insertBefore(child){return this.appendChild(child);},replaceChildren(){this.children=[];},
   setAttribute(k,v){attrs[k]=v;},getAttribute:k=>attrs[k]??null,addEventListener(k,fn){listeners[k]=fn;},focus(){this.focused=true;},click(){listeners.click?.({});},querySelectorAll(){return [];},
   querySelector(selector){return descendants(this).find(x=>selector==='[data-akra-global-switcher]'?Object.hasOwn(x.attrs,'data-akra-global-switcher'):selector==='summary'?x.tagName==='SUMMARY':false)||null;}};
  Object.defineProperty(e,'textContent',{get(){return (this.ownText||'')+this.children.map(x=>x.textContent).join('');},set(value){this.ownText=value;}});return e;
 }
 const descendants=e=>e.children.flatMap(c=>[c,...descendants(c)]);
 const body=element('body'),head=element('head'),actions=element();body.appendChild(actions);
 const document={body,head,documentElement:body,readyState:'complete',createElement:element,createElementNS:(_ns,tag)=>element(tag),
  getElementById:id=>[body,head,...descendants(body),...descendants(head)].find(x=>x.id===id)||null,
  querySelector:s=>s==='.topbar-actions'?actions:null,querySelectorAll:()=>[],addEventListener:(k,fn)=>events[k]=fn};
 const location={origin:'https://fixture.invalid',hostname:'fixture.invalid',pathname:'/SOP/',search:'',assign:target=>navigations.push(target),replace:target=>navigations.push(target)};
 const window={location,addEventListener:(k,fn)=>events[k]=fn,getComputedStyle:()=>({display:'block'}),alert:text=>alerts.push(text),confirm:()=>true,
  localStorage:{getItem:k=>storage.get(k)||null}};
 window.parent=embedded?{location:{origin:location.origin,pathname:'/Main/'},postMessage(){},AkraShell:{tokenFor:()=> 'synthetic',}}:window;
 vm.runInNewContext(source,{window,document,URL,URLSearchParams,console,fetch:()=>{throw Error('No fixture network');}});
 const user={identityId:'10000000-0000-4000-8000-000000000011',sessionVersion:1,authorizationRevision:'one',roles:['ADMIN']};
 storage.set('akra_user_data',JSON.stringify(user));storage.set('akra_app_config',JSON.stringify([{id:'app-manual',isActive:true,roles:['ADMIN']},{id:'app-gr',isActive:true,roles:['ADMIN']},{id:'app-pick',isActive:false,roles:['ADMIN']},{id:'app-evaluation',isActive:false,roles:['ADMIN']}]));
 window.AkraModule.watchSession({appId:'app-manual',user,token:'synthetic',refreshed(){},invalidated(){}});
 const mobile=()=>document.getElementById('sop-mobile-app-menu');
 const button=name=>descendants(mobile()).find(x=>x.tagName==='BUTTON'&&x.attrs['aria-label']===name);
 return {window,document,mobile,button,descendants,navigations,alerts};
}
test('standalone verified SOP mounts an accessible mobile disclosure with only configured app routes',()=>{
 const f=fixture(),menu=f.mobile();assert.ok(menu,'standalone phone must have an app menu independent of hidden desktop sidebar');
 assert.equal(menu.tagName,'DETAILS');assert.equal(menu.querySelector('summary').textContent,'แอป');
 assert.ok(f.button('กลับหน้าหลัก'));assert.ok(f.button('เปิด GR • รับเข้าสินค้า'));
 const labels=f.descendants(menu).filter(x=>x.tagName==='BUTTON').map(x=>x.attrs['aria-label']);assert.ok(!labels.some(x=>/PICK|EVAL/.test(x||'')));
});
test('mobile home and app leave preserve busy and dirty cancellation guards; confirmed app changes navigate once',()=>{
 const f=fixture();assert.ok(f.mobile());f.window.AkraModule.startWork();f.button('กลับหน้าหลัก').click();assert.equal(f.navigations.length,0);assert.equal(f.alerts.length,1);f.window.AkraModule.endWork();
 f.window.AkraModule.markDirty();f.window.confirm=()=>false;f.button('เปิด GR • รับเข้าสินค้า').click();assert.equal(f.navigations.length,0);
 f.window.confirm=()=>true;f.button('เปิด GR • รับเข้าสินค้า').click();assert.deepEqual(f.navigations,['https://fixture.invalid/GR/']);
});
test('mobile Escape closes disclosure and returns summary focus',()=>{const f=fixture();assert.ok(f.mobile());f.mobile().open=true;f.mobile().listeners.keydown({key:'Escape',preventDefault(){}});assert.equal(f.mobile().open,false);assert.equal(f.mobile().querySelector('summary').focused,true);});
test('embedded SOP never mounts standalone app navigation',()=>{const f=fixture(true);assert.equal(f.mobile(),null);});
