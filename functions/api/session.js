import {configured,json,originMatches,signSession,validSession,setCookie,removeCookie,fingerprint,passwordsMatch,readBody} from '../_lib/owner.js';

export async function onRequestGet({request,env}) {
  if(!configured(env))return json({configured:false,authenticated:false});
  const authenticated=await validSession(request,env);
  return json({configured:true,authenticated});
}
export async function onRequestPost({request,env}) {
  if(!configured(env))return json({error:'Cloudflare D1 binding or private secrets are not configured'},503);
  if(!originMatches(request))return json({error:'Cross-origin login blocked'},403);
  let body;
  try{body=await readBody(request);}catch(e){return json({error:'Invalid login request'},400);}
  if(typeof body?.password!=='string'||body.password.length>1024)return json({error:'Invalid password'},400);
  try{
    const key=await fingerprint(request,env),now=Math.floor(Date.now()/1000);
    const old=await env.DB.prepare('SELECT attempts,window_start FROM login_attempts WHERE fingerprint=?').bind(key).first();
    if(old && old.attempts>=8 && now-old.window_start<900)
      return json({error:'Too many attempts. Try again in 15 minutes.'},429);
    const correct=await passwordsMatch(body.password,env.NOTES_PASSWORD);
    if(!correct){
      await env.DB.prepare(\`INSERT INTO login_attempts (fingerprint,attempts,window_start) VALUES (?,1,?)
      ON CONFLICT(fingerprint) DO UPDATE SET
      attempts=CASE WHEN excluded.window_start-login_attempts.window_start>=900 THEN 1 ELSE login_attempts.attempts+1 END,
      window_start=CASE WHEN excluded.window_start-login_attempts.window_start>=900 THEN excluded.window_start ELSE login_attempts.window_start END\`)
      .bind(key,now).run();
      return json({error:'Incorrect owner password'},401);
    }
    await env.DB.prepare('DELETE FROM login_attempts WHERE fingerprint=?').bind(key).run();
    const token=await signSession(env);
    return json({authenticated:true},200, {'Set-Cookie':setCookie(token)});
  }catch(e){
    console.error('Owner login failure',e);
    return json({error:'Cloud database is not initialized; apply cloudflare/schema.sql'},503);
  }
}
export async function onRequestDelete({request,env}) {
  if(!originMatches(request))return json({error:'Cross-origin sign-out blocked'},403);
  return json({authenticated:false},200,{'Set-Cookie':removeCookie()});
}
