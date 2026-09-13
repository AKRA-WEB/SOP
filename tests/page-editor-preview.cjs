// Isolated UI fixture: no production requests or persistent writes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const document = {id:'00000000-0000-0000-0000-000000000010',code:'TEST',title:'คู่มือทดสอบการจัดลำดับ — Workflow การเบิกเติมสต๊อกสินค้าและส่งระหว่างคลัง AKRA',summary:'ตัวอย่างสำหรับทดสอบชื่อหัวข้อยาวบนโทรศัพท์และคอมพิวเตอร์ ไม่มีการแก้ไขคู่มือจริง',description:'ข้อมูลทดสอบเท่านั้น: ตรวจสอบรายการสินค้า จำนวนที่ต้องการ และคลังปลายทางก่อนยืนยันการเบิก จากนั้นอ่านขั้นตอนการจัดสินค้าและตรวจรับให้ครบทุกส่วน',type:'workflow',roles:['warehouse'],status:'published',assets:[
  {id:'00000000-0000-0000-0000-000000000021',name:'Workflow.png',displayName:'ภาพรวมการเบิกเติมสต๊อกสินค้าและการส่งสินค้าระหว่างคลัง',sortOrder:0,type:'image/png',url:'http://127.0.0.1:4173/SOP/Workflow_การเบิกเติมสต๊อกสินค้า_akra/Workflow.png'},
  {id:'00000000-0000-0000-0000-000000000022',name:'การจัด.png',displayName:null,sortOrder:1,type:'image/png',url:'http://127.0.0.1:4173/SOP/Workflow_การเบิกเติมสต๊อกสินค้า_akra/การจัด.png'},
  {id:'00000000-0000-0000-0000-000000000023',name:'Lalamove.pdf',displayName:null,sortOrder:2,type:'application/pdf',url:'http://127.0.0.1:4173/SOP/SOP_lalamove/TRD_SOP_Lalamove_Large.pdf'}
]};
const server = http.createServer(async (req,res)=>{
  if (req.method==='POST' && req.url==='/api') {
    let text=''; for await(const chunk of req) text+=chunk;
    const body=JSON.parse(text);
    if(body.action==='updatePages') document.assets=body.pages.map((page,index)=>({...document.assets.find(asset=>asset.id===page.id),displayName:page.displayName,sortOrder:index}));
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({status:'success',user:{roles:['ADMIN']},documents:[document]}));
    return;
  }
  if (req.url==='/favicon.ico') {res.writeHead(204);res.end();return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(root,'index.html'),'utf8').replace("apiUrl: 'https://hgxrrskztbpejirrdpbq.supabase.co/functions/v1/sop-api'", "apiUrl: 'http://127.0.0.1:4174/api'"));
});
server.listen(4174,'127.0.0.1',()=>console.log('SOP editor fixture: http://127.0.0.1:4174/?sso=fixture-only'));
