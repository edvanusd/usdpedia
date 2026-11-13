import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createApp,paymentState,verifySignature} from './server.mjs';
import {quote} from './catalog.mjs';

const env={MIDTRANS_SERVER_KEY:'SB-Mid-server-test-only',ORDER_TOKEN_SECRET:'a-test-secret-with-more-than-32-characters',ALLOWED_ORIGINS:'https://edvanusd.github.io'};
const buyer={name:'Test Customer',email:'test@example.com',phone:'081234567890',address:'Jalan Contoh 1, Jakarta',postalCode:'10110',consent:true};
test('Harga, ongkir, dan kuantitas dihitung server; harga dari client diabaikan',()=>{
  assert.equal(quote([{id:1,quantity:2,price:1}]).total,9511200);
  assert.throws(()=>quote([{id:1,quantity:-1}]));
  assert.throws(()=>quote([{id:1,quantity:1},{id:1,quantity:1}]));
  assert.throws(()=>quote([{id:999,quantity:1}]));
});
test('Signature notifikasi dan fraud status',()=>{
  const data={order_id:'USD-test',status_code:'200',gross_amount:'10000.00'};
  data.signature_key=createHash('sha512').update(data.order_id+data.status_code+data.gross_amount+env.MIDTRANS_SERVER_KEY).digest('hex');
  assert.equal(verifySignature(data,env.MIDTRANS_SERVER_KEY),true);
  assert.equal(verifySignature({...data,gross_amount:'1'},env.MIDTRANS_SERVER_KEY),false);
  assert.equal(verifySignature({...data,signature_key:'oops'},env.MIDTRANS_SERVER_KEY),false);
  assert.equal(paymentState({transaction_status:'capture',fraud_status:'challenge'}),'review');
  assert.equal(paymentState({transaction_status:'capture',fraud_status:'accept'}),'paid');
});
test('Backend fail closed tanpa credentials',async t=>{
  const server=createApp({env:{},database:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const root='http://127.0.0.1:'+server.address().port;
  assert.equal((await (await fetch(root+'/api/health')).json()).paymentReady,false);
  assert.equal((await fetch(root+'/api/checkout',{method:'POST',body:'{}'})).status,503);
  assert.equal((await fetch(root+'/backend/.env.example')).status,404);
});
test('Checkout, idempotensi, token akses, webhook, dan status gateway',async t=>{
  let snapCalls=0;const states=new Map();let mismatch=false;
  const server=createApp({env,database:':memory:',gateway:async(path,payload)=>{
    if(path==='snap'){snapCalls++;states.set(payload.transaction_details.order_id,{order_id:payload.transaction_details.order_id,gross_amount:String(payload.transaction_details.gross_amount)+'.00',status_code:'200',transaction_status:'pending'});return {token:'sandbox-token',redirect_url:'https://app.sandbox.midtrans.com/snap/v2/vtweb/test-token'};}
    return {...states.get(path),...(mismatch?{gross_amount:'1.00'}:{})};
  }});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const root='http://127.0.0.1:'+server.address().port;
  const post=(path,data,origin='https://edvanusd.github.io')=>fetch(root+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)});
  const payload={items:[{id:6,quantity:2,price:1}],customer:buyer,idempotencyKey:'a'.repeat(48)};
  assert.equal((await post('/api/checkout',payload,'https://malicious.example')).status,403);
  assert.equal((await post('/api/checkout',{...payload,customer:{...buyer,consent:false}})).status,400);
  const response=await post('/api/checkout',payload);assert.equal(response.status,201);const order=await response.json();assert.equal(order.total,40840);assert.equal(order.status,'pending');
  const repeat=await (await post('/api/checkout',payload)).json();assert.equal(repeat.id,order.id);assert.equal(snapCalls,1);
  assert.equal((await post('/api/checkout',{...payload,items:[{id:6,quantity:3}]})).status,409);
  assert.equal((await fetch(root+'/api/orders/'+order.id)).status,404);
  const status=()=>fetch(root+'/api/orders/'+order.id,{headers:{Authorization:'Bearer '+order.accessToken}});
  assert.equal((await (await status()).json()).status,'pending');
  const data={...states.get(order.id),transaction_status:'settlement'};
  data.signature_key=createHash('sha512').update(data.order_id+data.status_code+data.gross_amount+env.MIDTRANS_SERVER_KEY).digest('hex');
  assert.equal((await post('/api/midtrans/notification',{...data,signature_key:'f'.repeat(128)})).status,403);
  states.set(order.id,data);
  assert.equal((await post('/api/midtrans/notification',data)).status,200);
  const paid=await (await status()).json();assert.equal(paid.status,'paid');assert.equal(paid.customer,undefined);
  states.set(order.id,{...data,transaction_status:'pending'});
  assert.equal((await (await status()).json()).status,'paid');
  states.set(order.id,{...data,transaction_status:'refund'});
  assert.equal((await (await status()).json()).status,'refunded');
  states.set(order.id,data);
  assert.equal((await (await status()).json()).status,'refunded');
  mismatch=true;assert.equal((await status()).status,502);
});
