// Cloudflare Pages Functions authentication helpers. No client-side secrets.
const enc = new TextEncoder();
const COOKIE='mxnote_owner_session';
const TTL=7*24*60*60;

export function configured(env) {
  return Boolean(env.DB && typeof env.NOTES_PASSWORD==='string' && env.NOTES_PASSWORD.length>=12 &&
    typeof env.SESSION_SECRET==='string' && env.SESSION_SECRET.length>=32);
}
export function json(data,status=200,headers={}) {
  return new Response(JSON.stringify(data),{
    status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
      'x-content-type-options':'nosniff',...headers}
  });
}
export function originMatches(request) {
  const origin=request.headers.get('Origin');
  return origin===new URL(request.url).origin;
}
export function base64url(bytes) {
  let binary='';for(const x of bytes)binary+=String.fromCharCode(x);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
function unbase64(str) {
  const raw=atob(str.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-str.length%4)%4));
  return Uint8Array.from(raw,ch=>ch.charCodeAt(0));
}
async function hmacKey(env){
  return crypto.subtle.importKey('raw',enc.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function signSession(env) {
  const payload=base64url(enc.encode(JSON.stringify({v:1,exp:Math.floor(Date.now()/1000)+TTL})));
  const mac=base64url(new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(env),enc.encode(payload))));
  return payload+'.'+mac;
}
export async function validSession(request,env) {
  if(!configured(env))return false;
  const cookie=request.headers.get('Cookie')||'';
  const raw=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!raw)return false;
  const parts=raw.split('.');if(parts.length!==2||parts[0].length>600||parts[1].length>100)return false;
  try {
    const payload=JSON.parse(new TextDecoder().decode(unbase64(parts[0])));
    if(payload.v!==1 || !Number.isFinite(payload.exp) || payload.exp<=Date.now()/1000)return false;
    return crypto.subtle.verify('HMAC',await hmacKey(env),unbase64(parts[1]),enc.encode(parts[0]));
  }catch(e){return false;}
}
export function setCookie(token) {
  return COOKIE+'='+token+'; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age='+TTL;
}
export function removeCookie() {
  return COOKIE+'=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
}
export async function fingerprint(request,env) {
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const bytes=await crypto.subtle.digest('SHA-256',enc.encode(ip+'|'+env.SESSION_SECRET));
  return base64url(new Uint8Array(bytes));
}
export async function passwordsMatch(a,b) {
  const [x,y]=await Promise.all([
    crypto.subtle.digest('SHA-256',enc.encode(String(a))),
    crypto.subtle.digest('SHA-256',enc.encode(String(b)))
  ]);
  const one=new Uint8Array(x),two=new Uint8Array(y);
  let diff=0;for(let i=0;i<one.length;i++)diff|=one[i]^two[i];
  return diff===0;
}
export async function readBody(request) {
  const contentLength=Number(request.headers.get('content-length')||0);
  if(contentLength>1500000)throw Error('Request too large');
  const raw=await request.text();
  if(raw.length>1200000)throw Error('Request too large');
  return JSON.parse(raw);
}
