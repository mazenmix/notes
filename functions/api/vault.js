import {configured,json,originMatches,validSession,readBody} from '../_lib/owner.js';

const MAX_JSON=1100000;
function unready(env) {
  return !configured(env);
}
async function current(env) {
  return env.DB.prepare('SELECT revision,body,updated_at FROM vault WHERE id=1').first();
}
export async function onRequestGet({request,env}) {
  if(unready(env))return json({error:'D1 / owner secrets are not configured'},503);
  if(!await validSession(request,env))return json({error:'Unlock your private vault first'},401);
  try{
    const row=await current(env);
    return json({revision:row?.revision||0,workspace:row?JSON.parse(row.body):null,updatedAt:row?.updated_at||null});
  }catch(e){console.error('D1 read error',e);return json({error:'D1 table missing. Run cloudflare/schema.sql'},503);}
}
export async function onRequestPut({request,env}) {
  if(unready(env))return json({error:'D1 / owner secrets are not configured'},503);
  if(!originMatches(request))return json({error:'Cross-origin write blocked'},403);
  if(!await validSession(request,env))return json({error:'Unlock your private vault first'},401);
  let data;
  try{data=await readBody(request);}catch(e){return json({error:'Bad request or payload too large'},400);}
  if(!Number.isInteger(data.revision)||data.revision<0||!data.workspace||!Array.isArray(data.workspace.notes)||
      !Array.isArray(data.workspace.folders))return json({error:'Invalid notes workspace/revision'},400);
  const serialized=JSON.stringify(data.workspace);
  if(serialized.length>MAX_JSON)return json({error:'Vault exceeds the maximum size; export a backup'},413);
  try{
    const updatedAt=new Date().toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO vault (id,revision,body,updated_at) VALUES (1,0,'null','')").run();
    const result=await env.DB.prepare('UPDATE vault SET body=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?')
      .bind(serialized,updatedAt,data.revision).run();
    if(!result.meta?.changes){
      const row=await current(env);
      return json({error:'Vault changed on another device; reload then merge',revision:row?.revision||0},409);
    }
    return json({saved:true,revision:data.revision+1,updatedAt});
  }catch(e){console.error('D1 write error',e);return json({error:'D1 table missing or write failed'},503);}
}
