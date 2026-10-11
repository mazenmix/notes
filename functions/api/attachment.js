import {configured,json,originMatches,validSession} from '../_lib/owner.js';

// Private R2 bucket binding: ATTACHMENTS. No public bucket URL.
const MAX_BYTES=15*1024*1024;
const keyOf=id=>'assets/'+id;
const validId=id=>/^[a-f0-9-]{36}$/i.test(id||'');
async function authorize(request,env,write=false){
  if(!configured(env))return json({error:'Owner vault not configured'},503);
  if(!await validSession(request,env))return json({error:'Unlock your vault first'},401);
  if(write&&!originMatches(request))return json({error:'Cross-origin write blocked'},403);
  if(!env.ATTACHMENTS)return json({error:'Attach an R2 bucket as ATTACHMENTS in Cloudflare Pages Settings → Bindings'},503);
  return null;
}
export async function onRequestGet({request,env}){
  const error=await authorize(request,env);if(error)return error;
  const id=new URL(request.url).searchParams.get('id');
  if(!validId(id))return json({error:'Invalid attachment ID'},400);
  try{
    const file=await env.ATTACHMENTS.get(keyOf(id));
    if(!file)return json({error:'Attachment not found'},404);
    const mime=file.httpMetadata?.contentType||'application/octet-stream';
    const name=(file.customMetadata?.filename||'attachment').replace(/[\r\n"\\]/g,'_').slice(0,180);
    const inline=/^(image\/(png|jpeg|gif|webp|avif)|application\/pdf)$/i.test(mime);
    return new Response(file.body,{headers:{
      'content-type':mime,'cache-control':'private, no-store','x-content-type-options':'nosniff',
      'content-disposition':(inline?'inline':'attachment')+'; filename*=UTF-8\'\''+encodeURIComponent(name)
    }});
  }catch(e){console.error('R2 read failed',e);return json({error:'Attachment storage error'},503);}
}
export async function onRequestPost({request,env}){
  const error=await authorize(request,env,true);if(error)return error;
  const size=Number(request.headers.get('content-length')||0);
  if(size>MAX_BYTES)return json({error:'15 MB maximum per file'},413);
  let originalName='attachment';
  try{originalName=decodeURIComponent(request.headers.get('x-attachment-name')||'attachment')
    .replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180)||'attachment';}
  catch(e){return json({error:'Invalid attachment filename'},400);}
  const rawMime=(request.headers.get('content-type')||'application/octet-stream').split(';')[0].trim().toLowerCase();
  const mime=/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(rawMime)?rawMime:'application/octet-stream';
  try{
    const bytes=await request.arrayBuffer();
    if(!bytes.byteLength||bytes.byteLength>MAX_BYTES)return json({error:'File must be 1 byte to 15 MB'},413);
    const id=crypto.randomUUID();
    await env.ATTACHMENTS.put(keyOf(id),bytes,{httpMetadata:{contentType:mime},
      customMetadata:{filename:originalName}});
    return json({id,name:originalName,mime,size:bytes.byteLength},201);
  }catch(e){console.error('R2 upload failed',e);return json({error:'Attachment upload failed'},503);}
}
