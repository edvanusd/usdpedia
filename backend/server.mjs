import http from 'node:http';
import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync,readFileSync,existsSync} from 'node:fs';
import {dirname,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalog,quote} from './catalog.mjs';

const base=dirname(fileURLToPath(import.meta.url));
const configured=(value)=>Boolean(value)&&!value.includes('replace-')&&!value.includes('your-');
export function verifySignature(body,key){
  if(!key||typeof body.signature_key!=='string'||!/^[a-f\d]{128}$/i.test(body.signature_key))return false;
  const expected=createHash('sha512').update(String(body.order_id)+String(body.status_code)+String(body.gross_amount)+key).digest();
  return timingSafeEqual(expected,Buffer.from(body.signature_key,'hex'));
}
export function paymentState(data){
  if(data.transaction_status==='settlement')return 'paid';
  if(data.transaction_status==='capture')return data.fraud_status==='accept'?'paid':data.fraud_status==='deny'?'failed':'review';
  return {pending:'pending',deny:'failed',cancel:'cancelled',expire:'expired',refund:'refunded',partial_refund:'partially_refunded',authorize:'review'}[data.transaction_status]||'pending';
}
export function createApp(options={}){
  const env=options.env||process.env;
  const key=env.MIDTRANS_SERVER_KEY||'';
  const secret=env.ORDER_TOKEN_SECRET||'';
  const ready=configured(key)&&key.startsWith('SB-Mid-server-')&&configured(secret)&&secret.length>=32;
  const origins=(env.ALLOWED_ORIGINS||'https://edvanusd.github.io').split(',').map(s=>s.trim());
  const gateway=options.gateway||(async (path,payload)=>{
    const url=path==='snap'?'https://app.sandbox.midtrans.com/snap/v1/transactions':`https://api.sandbox.midtrans.com/v2/${encodeURIComponent(path)}/status`;
    const response=await fetch(url,{method:payload?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(key+':').toString('base64'),'Content-Type':'application/json',Accept:'application/json'},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    if(!response.ok&&data.status_code!=='404')throw new Error('Gateway tidak dapat memproses permintaan.');
    return data;
  });
  const file=options.database||env.DATABASE_PATH||resolve(base,'data/orders.sqlite');
  if(file!==':memory:'){mkdirSync(dirname(file),{recursive:true,mode:0o700});}
  const db=new DatabaseSync(file);
  if(file!==':memory:')chmodSync(file,0o600);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, idem TEXT UNIQUE NOT NULL, payload_hash TEXT NOT NULL, total INTEGER NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL, snap TEXT, created TEXT NOT NULL, updated TEXT NOT NULL);');
  const get=id=>db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  const token=id=>createHmac('sha256',secret).update(id).digest('hex');
  const rates=new Map();
  function limit(req,res,max=40){
    const ip=req.socket.remoteAddress;const now=Date.now();let v=rates.get(ip);
    if(!v||v.start<now-60000)v={start:now,count:0};v.count++;rates.set(ip,v);
    if(rates.size>10000)for(const [k,r]of rates)if(r.start<now-60000)rates.delete(k);
    if(v.count>max){send(res,429,{error:'Terlalu banyak permintaan. Coba lagi dalam satu menit.'});return false;}return true;
  }
  function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
  async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16000){const e=new Error('Permintaan terlalu besar.');e.status=413;throw e;}}try{return JSON.parse(raw);}catch{throw new Error('JSON tidak valid.');}}
  function customer(value){
    if(!value||typeof value.name!=='string'||value.name.trim().length<2||value.name.length>80||typeof value.email!=='string'||!/^\S+@\S+\.\S+$/.test(value.email)||value.email.length>120||typeof value.phone!=='string'||!/^\+?\d{9,15}$/.test(value.phone)||typeof value.address!=='string'||value.address.trim().length<10||value.address.length>400||!/^\d{5}$/.test(value.postalCode||'')||!value.consent)throw new Error('Isi nama, email, telepon, alamat, kode pos 5 digit, dan persetujuan dengan benar.');
    return {name:value.name.trim(),email:value.email.trim(),phone:value.phone,address:value.address.trim(),postalCode:value.postalCode};
  }
  function responseOrder(row,includeSnap=false){const payload=JSON.parse(row.payload);return {id:row.id,status:row.state,total:row.total,currency:'IDR',environment:'sandbox',items:payload.items,shipping:payload.shipping,createdAt:row.created,...(includeSnap?{accessToken:token(row.id),paymentUrl:row.snap}: {})};}
  async function syncOrder(row){
    const result=await gateway(row.id);
    if(result.status_code==='404')return row;
    if(result.order_id!==row.id||Number(result.gross_amount)!==row.total)throw new Error('Jumlah pembayaran gateway tidak sesuai pesanan.');
    const state=paymentState(result);
    const permitted=row.state==='refunded'?state==='refunded':row.state==='partially_refunded'?['refunded','partially_refunded'].includes(state):row.state==='paid'?['paid','refunded','partially_refunded'].includes(state):true;
    if(permitted)db.prepare('UPDATE orders SET state=?,updated=? WHERE id=?').run(state,new Date().toISOString(),row.id);
    return get(row.id);
  }
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://server');const origin=req.headers.origin;
      if(origin&&origins.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');}
      if(url.pathname.startsWith('/api/')&&url.pathname!=='/api/midtrans/notification'&&origin&&!origins.includes(origin))return send(res,403,{error:'Origin tidak diizinkan.'});
      if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
      if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{service:'USDpedia',environment:'sandbox',paymentReady:ready,checkoutEnabled:ready});
      if(req.method==='GET'&&url.pathname==='/api/catalog')return send(res,200,{items:catalog,shipping:15000,environment:'sandbox'});
      if(req.method==='POST'&&url.pathname==='/api/quote'){if(!limit(req,res))return;return send(res,200,quote((await body(req)).items));}
      if(req.method==='POST'&&url.pathname==='/api/checkout'){
        if(!limit(req,res,20))return;
        if(!ready)return send(res,503,{error:'Midtrans Sandbox belum diaktifkan. Merchant perlu mengatur Server Key dan rahasia token pada backend.'});
        const input=await body(req);const summary=quote(input.items);const buyer=customer(input.customer);
        if(typeof input.idempotencyKey!=='string'||!/^[a-f\d]{32,64}$/.test(input.idempotencyKey))throw new Error('Kunci permintaan checkout tidak valid.');
        const hash=createHash('sha256').update(JSON.stringify({summary,buyer})).digest('hex');
        let existing=db.prepare('SELECT * FROM orders WHERE idem=?').get(input.idempotencyKey);
        if(existing){if(existing.payload_hash!==hash)return send(res,409,{error:'Keranjang berubah. Mulai checkout baru.'});return send(res,existing.snap?200:409,existing.snap?responseOrder(existing,true):{error:'Transaksi sebelumnya belum selesai dibuat. Periksa status atau buat checkout baru setelah kegagalan dikonfirmasi.',id:existing.id});}
        const id='USD-'+randomUUID();const now=new Date().toISOString();
        db.prepare('INSERT INTO orders (id,idem,payload_hash,total,payload,state,created,updated) VALUES (?,?,?,?,?,?,?,?)').run(id,input.idempotencyKey,hash,summary.total,JSON.stringify({...summary,customer:buyer}),'creating',now,now);
        try{
          const snap=await gateway('snap',{transaction_details:{order_id:id,gross_amount:summary.total},item_details:[...summary.items.map(p=>({id:String(p.id),name:p.name,price:p.price,quantity:p.quantity})),{id:'shipping',name:'Pengiriman sandbox',price:summary.shipping,quantity:1}],customer_details:{first_name:buyer.name,email:buyer.email,phone:buyer.phone,shipping_address:{first_name:buyer.name,phone:buyer.phone,address:buyer.address,postal_code:buyer.postalCode,country_code:'IDN'}},credit_card:{secure:true},expiry:{unit:'hours',duration:24}});
          const paymentUrl=new URL(snap.redirect_url);
          if(!snap.token||paymentUrl.origin!=='https://app.sandbox.midtrans.com')throw new Error('Respons pembayaran sandbox tidak valid.');
          db.prepare('UPDATE orders SET snap=?,state=?,updated=? WHERE id=?').run(paymentUrl.href,'pending',new Date().toISOString(),id);
          return send(res,201,responseOrder(get(id),true));
        }catch{db.prepare('UPDATE orders SET state=?,updated=? WHERE id=?').run('creation_failed',new Date().toISOString(),id);return send(res,502,{error:'Transaksi sandbox belum dapat dibuat. Periksa konfigurasi merchant atau coba lagi nanti.'});}
      }
      if(req.method==='GET'&&/^\/api\/orders\/USD-[a-f\d-]+$/.test(url.pathname)){
        if(!limit(req,res,60))return;
        const id=url.pathname.split('/').pop();const row=get(id);const bearer=(req.headers.authorization||'').replace(/^Bearer /,'');
        if(!ready||!row||!/^[a-f\d]{64}$/.test(bearer)||!timingSafeEqual(Buffer.from(bearer,'hex'),Buffer.from(token(id),'hex')))return send(res,404,{error:'Pesanan tidak ditemukan atau akses tidak valid.'});
        try{return send(res,200,responseOrder(await syncOrder(row),true));}catch{return send(res,502,{error:'Status belum dapat diverifikasi dengan Midtrans. Coba lagi; jangan membayar ulang.'});}
      }
      if(req.method==='POST'&&url.pathname==='/api/midtrans/notification'){
        if(!ready)return send(res,503,{error:'Gateway belum dikonfigurasi.'});
        const data=await body(req);if(!verifySignature(data,key))return send(res,403,{error:'Signature tidak valid.'});
        const row=get(data.order_id);if(!row)return send(res,404,{error:'Pesanan tidak ditemukan.'});
        if(Number(data.gross_amount)!==row.total)return send(res,400,{error:'Jumlah pembayaran tidak sesuai.'});
        try{await syncOrder(row);return send(res,200,{received:true});}catch{return send(res,502,{error:'Verifikasi gateway belum berhasil. Retry notification diperlukan.'});}
      }
      if(url.pathname.startsWith('/api/'))return send(res,404,{error:'Endpoint tidak ditemukan.'});
      if(req.method!=='GET')return send(res,405,{error:'Metode tidak diizinkan.'});
      const path=decodeURIComponent(url.pathname);const root=resolve(base,'..');const target=resolve(root,'.'+(path==='/'?'/index.html':path));
      const relative=target.slice(root.length+1);
      if(!target.startsWith(root+'/')||relative.startsWith('backend/')||relative.startsWith('.')||!['.html','.js','.css','.png','.svg'].includes(extname(target))||!existsSync(target))return send(res,404,{error:'Halaman tidak ditemukan.'});
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
      res.writeHead(200,{'Content-Type':types[extname(target)],'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store'});res.end(readFileSync(target));
    }catch(error){send(res,error.status||400,{error:error.message||'Permintaan tidak dapat diproses.'});}
  });
  server.on('close',()=>db.close());
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))createApp().listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('USDpedia sandbox backend ready'));
