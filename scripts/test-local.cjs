const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {loadEnvConfig}=require('@next/env');const {Redis}=require('@upstash/redis');
loadEnvConfig(path.resolve(__dirname,'..'),true);
const cfg=JSON.parse(fs.readFileSync(process.env.DPX_SANDBOX_CONFIG||path.join(process.env.TEMP,'dragonpixel-sandbox-config.json'),'utf8'));
const base='http://127.0.0.1:3101',account='acct:'+crypto.randomBytes(24).toString('base64url');
const sig=crypto.createHmac('sha256',cfg.walletSecret).update(account).digest('hex').slice(0,20);
const cookie='dpx_test_uid='+account+'.'+sig,redis=Redis.fromEnv(),prefix='dpx:sandbox:v1:';
const ids=Array.from({length:5},()=>crypto.randomUUID());
const keys=[prefix+'bal:'+account,prefix+'ledger:'+account,prefix+'pending:'+account,...ids.map(id=>prefix+'op:'+account+':'+id)];
const testIp='192.0.2.'+crypto.randomInt(1,255);
const orderId=crypto.randomUUID(),paymentId='fixture_'+crypto.randomUUID(),refundIds=[crypto.randomUUID(),crypto.randomUUID()];
keys.push(prefix+'order:'+orderId,prefix+'payment:'+paymentId,...refundIds.map(id=>prefix+'refund:'+id));
const body={assetType:'capsule',gameName:'Local QA',gamePitch:'A fox explores an ancient forest',formatId:'steam-header'};
async function request(url,extra={}){return fetch(base+url,{...extra,headers:{origin:base,cookie,'Content-Type':'application/json','x-forwarded-for':testIp,...extra.headers}});}
async function webhook(payload){const raw=JSON.stringify(payload),stamp=String(Math.floor(Date.now()/1000)),id='fixture_'+crypto.randomUUID();const sig=crypto.createHmac('sha256',Buffer.from(cfg.webhookSecret.slice(6),'base64')).update(`${id}.${stamp}.${raw}`).digest('base64');return request('/api/webhooks/dodo',{method:'POST',headers:{'webhook-id':id,'webhook-timestamp':stamp,'webhook-signature':`v1,${sig}`},body:raw});}
async function generate(id,extra={}){const response=await request('/api/studio/generate',{method:'POST',headers:{'idempotency-key':id,...extra},body:JSON.stringify(body)});return{status:response.status,data:await response.json()};}
(async()=>{
 const page=await fetch(base);assert((await page.text()).includes('LOCAL TEST MODE'),'Refusing to test a server without the local sandbox banner');
 await redis.set(keys[0],3);
 try {
  const fail=await generate(ids[0],{'x-qa-fail':'1'});assert.equal(fail.status,502);assert.equal(await redis.get(keys[0]),3);console.log('PASS: failed generation restores its credit');
  const replay=await generate(ids[0]);assert.equal(replay.status,409);assert.equal(await redis.get(keys[0]),3);console.log('PASS: repeated generation ID cannot execute twice');
  const ok=await generate(ids[1]);assert.equal(ok.status,200);assert.equal(ok.data.credits.charged,1);assert.equal(ok.data.image.width,920);assert.equal(ok.data.image.height,430);assert.equal(await redis.get(keys[0]),2);console.log('PASS: sample image delivers 920x430 and costs exactly 1 test credit');
  const concurrent=await Promise.all([generate(ids[2]),generate(ids[3])]);assert(concurrent.every(x=>x.status===200));assert.equal(await redis.get(keys[0]),0);
  const empty=await generate(ids[4]);assert.equal(empty.status,402);console.log('PASS: concurrent requests cannot overspend; empty wallet gets HTTP 402');
  const cross=await request('/api/studio/generate',{method:'POST',headers:{origin:'https://attacker.example'},body:JSON.stringify(body)});assert.equal(cross.status,403);console.log('PASS: cross-site generation rejected');
  const forged=await request('/api/webhooks/dodo',{method:'POST',body:JSON.stringify({type:'payment.succeeded',data:{total_amount:500}})});assert.equal(forged.status,401);console.log('PASS: unsigned payment event rejected');
  await redis.set(prefix+'order:'+orderId,{id:orderId,accountKey:account,productId:cfg.quickfix,productKey:'quickfix',credits:6,cents:500,currency:'USD',state:'pending',createdAt:new Date().toISOString()});
  const payment={type:'payment.succeeded',data:{payment_id:paymentId,total_amount:500,currency:'USD',product_cart:[{product_id:cfg.quickfix,quantity:1}],metadata:{dpx_account_key:account,dpx_order_id:orderId,dpx_source:'credit_wallet'}}};
  const grants=await Promise.all([webhook(payment),webhook(payment),webhook(payment)]);assert(grants.every(r=>r.status===200));assert.equal(await redis.get(keys[0]),6);console.log('PASS: concurrent signed payment deliveries grant six credits only once');
  const unauthorized=await request('/api/checkout/status?order='+orderId,{headers:{cookie:''}});assert.equal(unauthorized.status,404);console.log('PASS: another wallet cannot read this order');
  const refund={type:'refund.succeeded',data:{payment_id:paymentId,refund_id:refundIds[0],amount:250,currency:'USD'}};
  assert.equal((await webhook(refund)).status,200);assert.equal(await redis.get(keys[0]),3);
  assert.equal((await webhook(refund)).status,200);assert.equal(await redis.get(keys[0]),3);
  refund.data.refund_id=refundIds[1];assert.equal((await webhook(refund)).status,200);assert.equal(await redis.get(keys[0]),0);
  assert.equal((await webhook(payment)).status,200);assert.equal(await redis.get(keys[0]),0);console.log('PASS: partial refunds, duplicate refunds and payment replay after refund reconcile correctly');
  console.log('Local HTTP checks passed. Only disposable test-wallet keys were used; no model calls or real payments.');
 }finally{await redis.del(...keys);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
