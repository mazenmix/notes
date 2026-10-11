/* MX Notes — dependency-free, local-first note taking. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const icon = (name) => '<svg aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const STORAGE = 'mxnotes.workspace.v1';
  const CONFIG_KEY = 'mxnotes.cloud.config';
  const SESSION_KEY = 'mxnotes.cloud.session';
  const THEME_KEY = 'mxnotes.appearance.theme';
  const LAST_SYNC_KEY = 'mxnotes.cloud.lastVerified';
  const newId = () => window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const now = () => new Date().toISOString();
  const clampText = (s,n) => String(s || '').length > n ? String(s).slice(0,n-1) + '…' : String(s || '');
  const day = (d) => new Date(d).toDateString();
  const timeAgo = (d) => {
    const seconds = Math.max(0,Math.floor((Date.now() - Date.parse(d || now()))/1000));
    if(seconds < 50) return 'just now';
    if(seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
    if(seconds < 86400) return Math.floor(seconds / 3600) + ' h ago';
    return new Date(d).toLocaleDateString();
  };
  const starterBody = [
    '## Thoughts on a simpler life',
    '',
    'Lately I’ve been thinking a lot about how much calmer life feels when things are simple. Not easier, but simpler. Fewer tabs, fewer commitments, fewer things fighting for my attention.',
    '',
    'It’s not about doing less, but about making space for what actually matters.',
    '',
    '- More time for deep work',
    '- A cleaner headspace',
    '- People who feel like home',
    '- A life that feels intentional',
    '',
    '> Simplicity is not the absence of things, but the presence of what matters.',
    '',
    '## Related',
    '- [[Habits]]',
    '- [[Digital minimalism]]',
    '- [[Focus]]',
    '- [[A better morning]]'
  ].join('\n');
  function starter(){
    return {
      version:1, updatedAt:'2025-01-01T00:00:00.000Z',
      folders:['Personal','Work','Ideas','Writing','Design','Reading','Life'],
      selected:'welcome', filter:'all',
      notes:[
        {id:'welcome',title:'A calmer mind',body:starterBody,folder:'Life',starred:false,archived:false,deleted:false,tags:['mindset','simplicity','life','focus'],updatedAt:'2025-01-01T00:00:00.000Z'},
        {id:'habits',title:'Habits',body:'## Small steps, repeated\n\nGood habits are an investment in a calmer mind.\n\n- Read every day\n- Move my body\n- Protect my mornings\n\nRelated: [[A calmer mind]]',folder:'Life',starred:false,archived:false,deleted:false,tags:['habits'],updatedAt:'2025-01-01T00:00:00.000Z'},
        {id:'minimalism',title:'Digital minimalism',body:'## Less noise, more meaning\n\nA calmer mind comes from owning less attention, not just fewer things.\n\n[[A calmer mind]] · [[Focus]]',folder:'Ideas',starred:false,archived:false,deleted:false,tags:['focus'],updatedAt:'2025-01-01T00:00:00.000Z'},
        {id:'morning',title:'A better morning',body:'## Morning ritual\n\nThe first hour sets the tone for a calmer mind.\n\n- Water\n- A walk\n- Write one page\n\n[[A calmer mind]]',folder:'Personal',starred:false,archived:false,deleted:false,tags:['life'],updatedAt:'2025-01-01T00:00:00.000Z'},
        {id:'focus',title:'Focus',body:'## Make room to think\n\nGive one thing your whole attention.\n\n[[A calmer mind]] · [[Digital minimalism]]',folder:'Work',starred:false,archived:false,deleted:false,tags:['focus'],updatedAt:'2025-01-01T00:00:00.000Z'},
        {id:'travel',title:'Travel ideas',body:'## Places to see\n\n- A slow morning in a new city\n- Bring a notebook\n\nEvery journey is a story waiting to be written.',folder:'Personal',starred:false,archived:false,deleted:false,tags:['travel'],updatedAt:'2025-01-01T00:00:00.000Z'}
      ]
    };
  }
  function sanitizeWorkspace(x) {
    if (!x || !Array.isArray(x.notes)) throw Error('Invalid workspace backup');
    return {
      version:1,
      updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : now(),
      folders: Array.isArray(x.folders) ? x.folders.filter(f => typeof f==='string').slice(0,200) : [],
      selected:typeof x.selected==='string' ? x.selected : null,
      filter:'all',
      notes:x.notes.slice(0,10000).filter(n => n && typeof n==='object' && typeof n.id==='string').map(n => ({
        id:n.id, title:String(n.title || 'Untitled').slice(0,500),
        body:String(n.body || '').slice(0,2000000),folder:String(n.folder || 'Inbox').slice(0,120),
        starred:!!n.starred,archived:!!n.archived,deleted:!!n.deleted,
        tags:Array.isArray(n.tags) ? n.tags.filter(t=>typeof t==='string').slice(0,50) : [],
        updatedAt:typeof n.updatedAt==='string' ? n.updatedAt : now()
      }))
    };
  }
  let state;
  try {state = localStorage.getItem(STORAGE) ? sanitizeWorkspace(JSON.parse(localStorage.getItem(STORAGE))) : starter();}
  catch(e){console.warn('Backup recovery:',e);state=starter();}
  let cloudConfig = null, session = null;
  try {cloudConfig = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');}
  catch(e){ cloudConfig=null;session=null; }
  let filter = 'all', search = '', insightPanel = 'graph', preview = false, syncTimer = null, syncBusy = false, syncPending = false, toastTimer, cloudStatus = session ? 'Connecting…' : 'Saved locally', dirty = false;
  let themeMode = localStorage.getItem(THEME_KEY)==='light' ? 'light' : 'dark';
  let lastVerified = null;
  try {lastVerified = JSON.parse(localStorage.getItem(LAST_SYNC_KEY)||'null');} catch(e) {lastVerified=null;}
  const noteById = (id) => state.notes.find(n=>n.id===id);
  const current = () => noteById(state.selected) || null;
  const visibleNotes = () => state.notes.filter(n=>!n.deleted&&!n.archived);
  const count = (x) => visibleNotes().filter(x).length;
  const containsRef = (body,title) => {
    const normalized = title.trim().toLocaleLowerCase();
    return [...String(body || '').matchAll(/\[\[([^\]]+)\]\]/g)].some(m=>m[1].trim().toLocaleLowerCase()===normalized);
  };
  const backlinksTo = (n) => n ? visibleNotes().filter(x=>x.id!==n.id && containsRef(x.body,n.title)) : [];
  const linksFrom = (n) => n ? [...String(n.body).matchAll(/\[\[([^\]]+)\]\]/g)].map(m=>visibleNotes().find(x=>x.title.toLocaleLowerCase()===m[1].trim().toLocaleLowerCase())).filter(Boolean).filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i) : [];
  function persist(touch=true) {
    if(touch) state.updatedAt=now();
    try{localStorage.setItem(STORAGE,JSON.stringify(state));}
    catch(e){toast('Device storage is full. Export a backup now.');console.error(e);return;}
    if(touch){dirty=true;queueSync();}
    updateStatus();
  }
  function isVerifiedForUser(){
    return !!(lastVerified && session?.user?.id && cloudConfig?.url &&
      lastVerified.userId===session.user.id && lastVerified.project===cloudConfig.url);
  }
  function markVerified(snapshot){
    if(!cloudReady())return;
    lastVerified={userId:session.user.id,project:cloudConfig.url,verifiedAt:now(),workspaceUpdatedAt:snapshot};
    localStorage.setItem(LAST_SYNC_KEY,JSON.stringify(lastVerified));
    dirty=(snapshot!==state.updatedAt);
    setCloudStatus(dirty?'Saving…':'Saved to cloud');
  }
  function applyTheme(){
    document.documentElement.setAttribute('data-theme',themeMode);
    const light=themeMode==='light';
    $('theme-toggle').innerHTML=icon(light?'moon':'sun');
    $('theme-toggle').setAttribute('aria-label',light?'Switch to dark theme':'Switch to light theme');
    $('theme-toggle').setAttribute('title',light?'Switch to dark theme':'Switch to light theme');
    $('theme-toggle').setAttribute('aria-pressed',String(light));
    $('theme-mode').textContent=light?'Light mode':'Dark mode';
    $('settings-theme-toggle').innerHTML=icon(light?'moon':'sun')+(light?' Switch to dark':' Switch to light');
    const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=light?'#f4f3ef':'#101214';
    const menu=$('note-menu').querySelector('[data-action="theme"]');
    if(menu)menu.innerHTML=icon(light?'moon':'sun')+'<span>'+(light?'Dark theme':'Light theme')+'</span>';
  }
  function toggleTheme(){
    themeMode=themeMode==='dark'?'light':'dark';
    localStorage.setItem(THEME_KEY,themeMode);
    applyTheme();
    toast(themeMode==='dark'?'Dark theme enabled':'Light theme enabled');
  }
  function updateStatus() {
    const connected=cloudReady(),verified=connected&&isVerifiedForUser();
    $('sync-text').textContent=cloudStatus;
    $('sync-time').textContent=verified && cloudStatus==='Saved to cloud' ? '· '+timeAgo(lastVerified.verifiedAt) : '';
    $('sidebar-status').textContent=cloudStatus==='Saved to cloud' ? 'Cloud verified' : cloudStatus;
    $('cloud-state').textContent=connected ? ('Signed in as '+session.user.email+' · '+cloudStatus) : 'Local-only mode · cloud not connected';
    $('sync-connection').textContent=connected ? (cloudStatus==='Saved to cloud'?'Connected · verified':'Signed in · '+cloudStatus) : 'Not connected';
    $('last-sync-confirmed').textContent=verified ? new Date(lastVerified.verifiedAt).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : 'Never verified';
    const pending=connected && (dirty||!verified||lastVerified.workspaceUpdatedAt!==state.updatedAt);
    $('unsynced-count').textContent=!connected?'Local device only':pending?'Pending verification':'None · verified';
    $('sync-explanation').textContent=!connected ?
      'Your notes are saved on this device. Sign in below to enable cloud confirmation.' :
      cloudStatus.startsWith('Offline') ?
      'Cloud verification failed. Notes are still saved on this device. Check your network and press Sync now & verify.' :
      pending ? 'The latest local changes have not yet been confirmed on the cloud server.' :
      'Verified: the server returned the same saved workspace revision.';
    $('sync-now').disabled=!connected||syncBusy;
    $('sign-out').hidden=!session;
  }
  function toast(message) {
    const el=$('toast');
    el.textContent=message; el.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3400);
  }
  function sorted(list) {return list.slice().sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));}
  function folderCount(name){return count(n=>n.folder===name);}
  function setFilter(next){
    filter=next; renderSidebar();
  }
  function renderSidebar(){
    const quick=[
      ['inbox','Inbox','folder',folderCount('Inbox')],
      ['today','Today','calendar',count(n=>day(n.updatedAt)===new Date().toDateString())],
      ['star','Starred','star',count(n=>n.starred)],
      ['graph','Graph','graph',null],
      ['all','All notes','file',null],
      ['trash','Trash','trash',state.notes.filter(n=>n.deleted).length],
      ['archive','Archive','archive',null]
    ];
    $('quick-links').innerHTML=quick.map(x=>'<button class="quick-link '+(filter===x[0]?'active':'')+'" data-filter="'+x[0]+'">'+icon(x[2])+'<span>'+escapeHtml(x[1])+'</span>'+(x[3]?'<span class="count">'+x[3]+'</span>':'')+'</button>').join('');
    $('folder-list').innerHTML=state.folders.map(f=>'<button class="folder-item '+(filter==='folder:'+f?'active':'')+'" data-folder="'+escapeHtml(f)+'">'+icon('folder')+'<span class="folder-name">'+escapeHtml(f)+'</span>'+(folderCount(f)?'<span class="count">'+folderCount(f)+'</span>':'')+'</button>').join('');
    let notes=state.notes.filter(n => filter==='trash' ? n.deleted : filter==='archive' ? n.archived&&!n.deleted : !n.deleted&&!n.archived);
    if(filter==='star')notes=notes.filter(n=>n.starred);
    if(filter==='today')notes=notes.filter(n=>day(n.updatedAt)===new Date().toDateString());
    if(filter==='inbox')notes=notes.filter(n=>n.folder==='Inbox');
    if(filter.startsWith('folder:'))notes=notes.filter(n=>n.folder===filter.slice(7));
    if(search.trim()) {const q=search.toLocaleLowerCase();notes=state.notes.filter(n=>!n.deleted && (n.title+' '+n.body+' '+n.tags.join(' ')).toLocaleLowerCase().includes(q));}
    notes=sorted(notes);
    $('notes-total').textContent=notes.length;
    $('note-list').innerHTML=notes.length ? notes.map(n=>'<button class="note-item '+(n.id===state.selected?'active ':'')+(n.deleted?'deleted-note':'')+'" data-note-id="'+escapeHtml(n.id)+'">'+icon('file')+'<span class="note-name">'+escapeHtml(n.title)+'</span>'+(n.starred?'★':'')+'</button>').join('') : '<p class="empty-state" style="padding:10px 12px">No notes here yet.</p>';
  }
  function autoHeight(){
    const body=$('note-body');
    body.style.height='auto';
    body.style.height=Math.max(490,body.scrollHeight+12)+'px';
  }
  function tagsFor(n){
    if(!n)return [];
    const hash=[...String(n.body).matchAll(/(?:^|\s)#([\p{L}\d_-]+)/gu)].map(m=>m[1]);
    return [...new Set([...(n.tags||[]),...hash].map(t=>String(t).toLowerCase()))].slice(0,24);
  }
  function renderTags(){
    const n=current();if(!n){$('note-tags').innerHTML='';return;}
    $('note-tags').innerHTML=tagsFor(n).map(t=>'<button class="tag" data-tag="'+escapeHtml(t)+'">#'+escapeHtml(t)+'</button>').join('')+'<button class="tag tag-add" id="add-tag" title="Add tag">+</button>';
  }
  function renderNote(){
    const n=current();
    if(!n){
      $('note-title').value='';$('note-body').value='';$('note-title').disabled=true;$('note-body').disabled=true;
      $('editor-eyebrow').textContent='YOUR WORKSPACE';$('note-updated').textContent='Create a note to begin.';
      $('tab-title').textContent='No note selected';$('mobile-title').innerHTML='No note selected '+icon('chevron');
      $('breadcrumb').textContent='All notes';$('date-display').textContent='';
    } else {
      $('note-title').disabled=false;$('note-body').disabled=false;
      $('note-title').value=n.title;$('note-body').value=n.body;
      $('editor-eyebrow').innerHTML=escapeHtml(n.folder.toUpperCase()+' / NOTE')+' <span>—</span> <span id="date-display">'+escapeHtml(new Date(n.updatedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))+'</span>';
      $('note-updated').textContent='Edited '+timeAgo(n.updatedAt);
      $('tab-title').textContent=n.title;
      $('mobile-title').innerHTML=escapeHtml(clampText(n.title,22))+' '+icon('chevron');
      $('breadcrumb').innerHTML=escapeHtml(n.folder)+' <span> / </span> '+escapeHtml(n.title);
    }
    $('editor-scroll').scrollTop=0;
    renderTags();updateStats();autoHeight();
    if(preview)renderPreview();
    renderInsights();
  }
  function updateStats(){
    const s=$('note-body').value;
    const words=s.trim() ? s.trim().split(/\s+/u).length : 0;
    $('word-count').textContent=words.toLocaleString()+' words';
    $('character-count').textContent=s.length.toLocaleString()+' characters';
  }
  function selectNote(id){
    if(!noteById(id))return;
    state.selected=id;
    persist(false);
    renderNote();renderSidebar();closePanels();
  }
  function createNote(){
    let folder=filter.startsWith('folder:') ? filter.slice(7) : filter==='inbox' ? 'Inbox' : 'Personal';
    const n={id:newId(),title:'Untitled',body:'',folder,starred:false,archived:false,deleted:false,tags:[],updatedAt:now()};
    state.notes.push(n);state.selected=n.id;filter='all';search='';$('search').value='';
    persist();renderSidebar();renderNote();closePanels();$('note-title').focus();$('note-title').select();
  }
  function mutateNote(key,value,rerender=true){
    const n=current();if(!n)return;
    n[key]=value;n.updatedAt=now();persist();
    if(rerender) {renderSidebar();renderTags();renderInsights();}
  }
  function addFolder(){
    const raw=prompt('Folder name');
    if(raw===null)return;const name=raw.trim().slice(0,80);
    if(!name)return;
    if(state.folders.some(f=>f.toLowerCase()===name.toLowerCase())||name.toLowerCase()==='inbox'){toast('Folder already exists');return;}
    state.folders.push(name);persist();setFilter('folder:'+name);toast('Folder created');
  }
  function readInline(raw) {
    // Only escaped text enters the rendered HTML. Wiki-link IDs are resolved separately.
    let s=escapeHtml(raw);
    s=s.replace(/\[\[([^\]]+)\]\]/g,(_,title)=>{
      const found=visibleNotes().find(n=>n.title.toLowerCase()===title.trim().toLowerCase());
      return '<span class="wiki-link" tabindex="0" role="link" data-wiki="'+escapeHtml(title)+'">'+escapeHtml(title)+'</span>';
    });
    s=s.replace(/(\*\*|__)(.+?)\1/g,'<strong>$2</strong>');
    s=s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g,'<em>$1</em>');
    s=s.replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>');
    return s;
  }
  function renderPreview() {
    const n=current();if(!n)return;
    const lines=n.body.replace(/\r\n/g,'\n').split('\n');
    let html='';
    lines.forEach(line=>{
      const match=/^(#{1,3})\s+(.+)$/.exec(line);
      if(match){const level=Math.min(match[1].length+1,3);html+='<h'+level+'>'+readInline(match[2])+'</h'+level+'>';return;}
      if(line.startsWith('> ')){html+='<blockquote>'+readInline(line.slice(2))+'</blockquote>';return;}
      if(/^\s*[-*] /.test(line)){html+='<div class="md-line">• '+readInline(line.replace(/^\s*[-*] /,''))+'</div>';return;}
      html+='<div class="md-line">'+(line ? readInline(line) : '&nbsp;')+'</div>';
    });
    $('preview-body').innerHTML=html;
  }
  function setPreview(on){
    preview=on;$('note-body').classList.toggle('hidden',on);$('preview-body').classList.toggle('hidden',!on);
    $('preview-toggle').classList.toggle('preview-on',on);
    $('preview-toggle').innerHTML=icon(on?'edit':'eye')+'<span>'+(on?'Edit':'Preview')+'</span>';
    if(on)renderPreview();else autoHeight();
  }
  function insertText(text,wrap=false){
    if(preview)setPreview(false);
    const el=$('note-body');const a=el.selectionStart,b=el.selectionEnd;const selected=el.value.slice(a,b);
    const inserted=wrap ? text+selected+text : text;
    el.setRangeText(inserted,a,b,'end');el.focus();mutateNote('body',el.value,false);updateStats();autoHeight();renderSidebar();renderInsights();
  }
  function graphHtml(n) {
    if(!n)return '<p class="empty-state">Select a note to explore its connections.</p>';
    const related=[...linksFrom(n),...backlinksTo(n)].filter((item,i,a)=>a.findIndex(x=>x.id===item.id)===i).slice(0,7);
    if(!related.length)related.push(...visibleNotes().filter(x=>x.id!==n.id&&x.folder===n.folder).slice(0,5));
    const cx=135,cy=156,r=118;
    const pts=related.map((item,i)=>{
      const theta=-Math.PI/2+(Math.PI*2*i/Math.max(related.length,1));
      return {item,x:cx+Math.cos(theta)*r,y:cy+Math.sin(theta)*r};
    });
    const lines=pts.map(p=>'<line x1="'+cx+'" y1="'+cy+'" x2="'+p.x.toFixed(1)+'" y2="'+p.y.toFixed(1)+'"/>').join('');
    const nodes=pts.map(p=>{
      const y=p.y+21;const anchor=p.x>cx+35?'start':p.x<cx-35?'end':'middle';
      return '<g class="graph-node" data-graph-id="'+escapeHtml(p.item.id)+'"><circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="7.5"/><text x="'+p.x.toFixed(1)+'" y="'+y.toFixed(1)+'" text-anchor="'+anchor+'">'+escapeHtml(clampText(p.item.title,19))+'</text></g>';
    }).join('');
    return '<div class="graph-container"><svg class="graph-svg" viewBox="0 0 270 330" role="img" aria-label="Linked note graph">'+lines+'<circle class="center-halo" cx="'+cx+'" cy="'+cy+'" r="27"/><g class="graph-node current"><circle cx="'+cx+'" cy="'+cy+'" r="12"/><text x="'+cx+'" y="'+(cy+31)+'" text-anchor="middle">'+escapeHtml(clampText(n.title,22))+'</text></g>'+nodes+'</svg></div>';
  }
  function backlinkHtml(items,emptyText){
    return items.length?items.map(x=>'<button class="linked-item" data-jump="'+escapeHtml(x.id)+'">'+icon('file')+'<div>'+escapeHtml(x.title)+'<span class="link-sub">'+escapeHtml(clampText(x.body.replace(/\s+/g,' '),85))+'</span></div><span class="link-arrow">›</span></button>').join(''):'<p class="empty-state">'+escapeHtml(emptyText)+'</p>';
  }
  function renderInsights(){
    const n=current();const backlinks=backlinksTo(n),outgoing=linksFrom(n);
    let html='';
    if(insightPanel==='graph'){
      html='<section class="insight-section"><h3>Graph view</h3>'+graphHtml(n)+'</section>'+
        '<section class="insight-section"><h3>Backlinks ('+backlinks.length+')</h3>'+backlinkHtml(backlinks,'Notes linking here will appear here.')+'</section>'+
        '<section class="insight-section"><h3>Tags</h3><div class="tag-insights">'+(n?tagsFor(n).map(t=>'<span class="tag">#'+escapeHtml(t)+'</span>').join(''):'')+'</div></section>';
    } else if(insightPanel==='backlinks'){
      html='<section class="insight-section"><h3>Backlinks ('+backlinks.length+')</h3>'+backlinkHtml(backlinks,'No backlinks yet. Type [[Note title]] in another note to link here.')+'</section>'+
      '<section class="insight-section"><h3>Outgoing links ('+outgoing.length+')</h3>'+backlinkHtml(outgoing,'No outgoing links yet.')+'</section>';
    } else {
      html='<section class="insight-section"><h3>Note details</h3>'+
      (n ? [['Folder',n.folder],['Last edited',new Date(n.updatedAt).toLocaleString()],['Words',n.body.trim()?n.body.trim().split(/\s+/).length:0],['Characters',n.body.length],['Starred',n.starred?'Yes':'No']].map(x=>'<div class="detail-row"><span>'+escapeHtml(x[0])+'</span><span>'+escapeHtml(x[1])+'</span></div>').join(''):'<p class="empty-state">Choose a note first.</p>')+
      '<p class="side-tip">Everything saves automatically. Export a JSON backup from Cloud & settings whenever you want a portable copy.</p></section>';
    }
    $('insights-content').innerHTML=html;
    document.querySelectorAll('.insights-tab').forEach(el=>el.classList.toggle('active',el.dataset.panel===insightPanel));
  }
  function openInsights(tab){
    insightPanel=tab||'graph';renderInsights();$('insights').classList.add('open');
    if(innerWidth<=760)showOverlay(true);
    document.querySelectorAll('.mobile-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.mobile===tab));
  }
  function showOverlay(on){$('overlay').hidden=!on;}
  function closePanels(){
    $('sidebar').classList.remove('open');$('insights').classList.remove('open');$('note-menu').hidden=true;showOverlay(false);
    document.querySelectorAll('.mobile-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.mobile==='notes'));
  }
  function openSidebar(focusSearch=false){
    if(innerWidth<=760){$('insights').classList.remove('open');$('sidebar').classList.add('open');showOverlay(true);}
    if(focusSearch)setTimeout(()=>$('search').focus(),80);
  }
  function actionMenu(){
    const n=current();if(!n)return;
    const menu=$('note-menu'),open=menu.hidden;
    if(!open){menu.hidden=true;return;}
    const archive=menu.querySelector('[data-action="archive"]'),del=menu.querySelector('[data-action="delete"]');
    archive.dataset.action=n.deleted?'restore':'archive';
    archive.innerHTML=icon(n.deleted?'file':'archive')+(n.deleted?'Restore note':n.archived?'Unarchive note':'Archive note');
    del.innerHTML=icon('trash')+(n.deleted?'Delete permanently':'Move to trash');
    menu.querySelector('[data-action="star"]').innerHTML=icon('star')+(n.starred?'Remove star':'Add to starred');
    menu.hidden=false;
  }
  function download(name,content,mime){
    const blob=new Blob([content],{type:mime});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function actOnNote(action){
    const n=current();if(!n)return;
    $('note-menu').hidden=true;
    if(action==='focus'){toggleFocus();return;}
    if(action==='theme'){toggleTheme();return;}
    if(action==='sync'){syncNow();return;}
    if(action==='star'){mutateNote('starred',!n.starred);toast(n.starred?'Note starred':'Star removed');}
    if(action==='move'){
      const options=['Inbox',...state.folders];
      const next=prompt('Move to folder:\n'+options.join(' · '),n.folder);
      if(next===null)return;
      const found=options.find(x=>x.toLowerCase()===next.trim().toLowerCase());
      if(!found){toast('Choose an existing folder');return;}
      mutateNote('folder',found);renderNote();toast('Moved to '+found);
    }
    if(action==='archive'){n.archived=!n.archived;n.updatedAt=now();persist();renderSidebar();renderNote();toast(n.archived?'Note archived':'Note unarchived');}
    if(action==='restore'){n.deleted=false;n.archived=false;n.updatedAt=now();persist();filter='all';renderSidebar();renderNote();toast('Note restored');}
    if(action==='delete'){
      if(n.deleted){
        if(!confirm('Delete this note permanently? This cannot be undone.'))return;
        state.notes=state.notes.filter(x=>x.id!==n.id);
        state.selected=visibleNotes()[0]?.id || state.notes[0]?.id || null;persist();renderSidebar();renderNote();toast('Permanently deleted');
      } else {
        n.deleted=true;n.updatedAt=now();state.selected=visibleNotes()[0]?.id||null;persist();renderSidebar();renderNote();toast('Moved to trash');
      }
    }
    if(action==='export')download((n.title.replace(/[^\p{L}\p{N} ._-]/gu,'')||'note')+'.md','# '+n.title+'\n\n'+n.body,'text/markdown;charset=utf-8');
  }
  // Supabase access uses only the publishable/anon key. Row-level security ties vaults to auth.uid().
  function cloudReady(){return !!(cloudConfig?.url && cloudConfig?.key && session?.access_token);}
  function setCloudStatus(status){cloudStatus=status;updateStatus();}
  function cleanUrl(value) {
    const u=new URL(value.trim());
    if(u.protocol!=='https:')throw Error('The Supabase URL must start with https://');
    if(u.username||u.password||u.search||u.hash)throw Error('Enter a project URL only');
    return u.origin;
  }
  function settingsOpen(){
    $('supabase-url').value=cloudConfig?.url||'';
    $('supabase-key').value=cloudConfig?.key||'';
    $('auth-email').value=session?.user?.email||'';
    $('auth-password').value='';
    $('auth-feedback').textContent='';
    updateStatus();$('settings-modal').showModal();
  }
  async function api(path,options={},useSession=true){
    if(!cloudConfig?.url||!cloudConfig?.key)throw Error('Enter Supabase project URL and publishable key');
    const headers=Object.assign({
      apikey:cloudConfig.key,
      'Content-Type':'application/json'
    },options.headers||{});
    if(useSession&&session?.access_token)headers.Authorization='Bearer '+session.access_token;
    const response=await fetch(cloudConfig.url+path,{...options,headers});
    let data;
    try{data=await response.json();}catch(e){data=null;}
    if(!response.ok){
      const msg=data?.msg||data?.error_description||data?.message||data?.error||('Server returned '+response.status);
      throw Error(typeof msg==='string'?msg:JSON.stringify(msg));
    }
    return data;
  }
  function storeCloud(){
    localStorage.setItem(CONFIG_KEY,JSON.stringify(cloudConfig));
    if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY);
  }
  async function login(){
    try{
      const url=cleanUrl($('supabase-url').value),key=$('supabase-key').value.trim();
      if(!key)throw Error('Enter a Supabase publishable/anon key');
      const email=$('auth-email').value.trim(),password=$('auth-password').value;
      if(!email||!password)throw Error('Enter email and password');
      $('auth-feedback').textContent='Authenticating…';
      cloudConfig={url,key};storeCloud();
      const result=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})},false);
      if(!result.access_token||!result.user)throw Error('Authentication did not return a session');
      session={access_token:result.access_token,refresh_token:result.refresh_token,expires_at:Date.now()+result.expires_in*1000,user:{id:result.user.id,email:result.user.email}};
      $('auth-password').value='';
      storeCloud();setCloudStatus('Syncing…');
      $('auth-feedback').textContent='Authenticated. Verifying cloud data…';
      const ok=await pullCloud(true);
      if(ok){$('auth-feedback').textContent='Cloud sync verified.';$('settings-modal').close();toast('Cloud sync verified successfully');}
      else $('auth-feedback').textContent='Signed in, but the cloud could not be verified. Check the Supabase SQL setup and tap Sync now & verify.';
    }catch(e){setCloudStatus('Offline · saved locally');$('auth-feedback').textContent=e.message;toast('Sign in failed: '+e.message);}
  }
  async function refreshSession(){
    if(!session||session.expires_at>Date.now()+90000)return;
    const result=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})},false);
    session.access_token=result.access_token;session.refresh_token=result.refresh_token;session.expires_at=Date.now()+result.expires_in*1000;
    if(result.user)session.user={id:result.user.id,email:result.user.email};
    storeCloud();
  }
  async function remoteRead(){
    await refreshSession();
    return api('/rest/v1/vault?select=payload,updated_at&user_id=eq.'+encodeURIComponent(session.user.id)+'&limit=1',{method:'GET'});
  }
  async function remoteWrite(snapshot=state){
    await refreshSession();
    await api('/rest/v1/vault?on_conflict=user_id',{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({user_id:session.user.id,payload:snapshot,updated_at:snapshot.updatedAt})
    });
  }
  async function verifyRemote(expected){
    const rows=await remoteRead(),row=Array.isArray(rows)?rows[0]:null;
    if(!row?.payload||row.payload.updatedAt!==expected)throw Error('Cloud confirmation does not match the latest saved revision');
    markVerified(expected);
    return true;
  }
  function queueSync(){
    if(!cloudReady()){setCloudStatus('Saved locally');return;}
    setCloudStatus('Saving…');
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>pushCloud(),1400);
  }
  async function pushCloud(){
    if(!cloudReady())return false;
    if(syncBusy){syncPending=true;return false;}
    syncBusy=true;setCloudStatus('Syncing…');
    let success=false;
    try {
      const snapshot=JSON.parse(JSON.stringify(state));
      await remoteWrite(snapshot);
      await verifyRemote(snapshot.updatedAt);
      success=true;
    } catch(e){setCloudStatus('Offline · saved locally');console.warn('Cloud save/verify failed:',e);}
    finally{
      syncBusy=false;
      if(dirty||syncPending){syncPending=false;queueSync();}
      updateStatus();
    }
    return success;
  }
  async function pullCloud(first=false){
    if(!cloudReady())return false;
    if(syncBusy){syncPending=true;return false;}
    if(!first&&dirty)return false;
    syncBusy=true;setCloudStatus('Syncing…');
    let success=false;
    try {
      const initialStamp=state.updatedAt;
      const rows=await remoteRead();
      const row=Array.isArray(rows)?rows[0]:null;
      if(row?.payload && Date.parse(row.payload.updatedAt)>Date.parse(state.updatedAt) && !dirty){
        state=sanitizeWorkspace(row.payload);
        state.selected=state.notes.some(n=>n.id===state.selected)?state.selected:(state.notes[0]?.id||null);
        localStorage.setItem(STORAGE,JSON.stringify(state));
        renderSidebar();renderNote();
        toast('Notes updated from cloud');
        markVerified(state.updatedAt);
      }else if(!row||Date.parse(state.updatedAt)>Date.parse(row.payload?.updatedAt||0)){
        const snapshot=JSON.parse(JSON.stringify(state));
        await remoteWrite(snapshot);
        await verifyRemote(snapshot.updatedAt);
      }else{
        if(initialStamp===state.updatedAt)markVerified(state.updatedAt);
        else {dirty=true;syncPending=true;}
      }
      success=true;
    } catch(e) {
      setCloudStatus('Offline · saved locally');
      console.warn('Cloud pull/verify failed:',e);
      if(first)toast('Cloud verification failed: '+e.message);
    } finally{
      syncBusy=false;
      if(dirty||syncPending){syncPending=false;queueSync();}
      updateStatus();
    }
    return success;
  }
  async function syncNow(){
    if(!cloudReady()){settingsOpen();$('auth-feedback').textContent='Sign in to your cloud account before syncing.';return;}
    if(syncBusy){toast('Sync already in progress');return;}
    clearTimeout(syncTimer);
    $('auth-feedback').textContent='Checking cloud sync…';
    const ok=dirty||!isVerifiedForUser()||lastVerified.workspaceUpdatedAt!==state.updatedAt ? await pushCloud() : await pullCloud(true);
    $('auth-feedback').textContent=ok?'Last sync confirmed by the cloud server.':'Could not verify cloud sync. Local notes are safe; check your network and setup.';
    toast(ok?'Last sync confirmed ✓':'Sync not confirmed · saved locally');
  }
  function signOut(){
    clearTimeout(syncTimer);syncPending=false;session=null;storeCloud();
    setCloudStatus('Saved locally');
    $('auth-feedback').textContent='Signed out. Notes remain saved on this device.';
    toast('Signed out');
  }
  function downloadBackup(){download('mx-notes-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(state,null,2),'application/json;charset=utf-8');toast('Backup exported');}
  async function importBackup(file){
    if(!file)return;
    try {
      const raw=await file.text();const incoming=sanitizeWorkspace(JSON.parse(raw));
      if(!confirm('Replace notes on this device with '+incoming.notes.length+' notes from the backup?'))return;
      incoming.updatedAt=now();state=incoming;state.selected=state.notes.find(n=>!n.deleted)?.id||null;
      persist();filter='all';renderSidebar();renderNote();toast('Backup imported');
    } catch(e){toast('Import failed: '+e.message);}
    $('import-file').value='';
  }
  function toggleFocus(){
    document.body.classList.toggle('focus-mode');
    const isOn=document.body.classList.contains('focus-mode');
    $('focus-button').innerHTML=icon(isOn?'minimize':'maximize');
    $('focus-button').title=isOn?'Exit focus mode':'Focus mode';
    if(isOn)closePanels();
  }
  function handleKeyboard(e){
    const mod=e.ctrlKey||e.metaKey;
    if(mod&&e.key.toLowerCase()==='k'){e.preventDefault();openSidebar(true);}
    if(mod&&e.key.toLowerCase()==='n'){e.preventDefault();createNote();}
    if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();persist(false);queueSync();toast('Saved locally'+(cloudReady()?' · syncing…':''));}
    if(mod&&e.shiftKey&&e.key.toLowerCase()==='l'){e.preventDefault();toggleTheme();}
    if(e.key==='Escape'){closePanels();if(document.body.classList.contains('focus-mode'))toggleFocus();}
    if(e.key==='Tab' && e.target===$('note-body') && !e.shiftKey){e.preventDefault();insertText('  ');}
  }
  function init() {
    if(!current())state.selected=visibleNotes()[0]?.id || state.notes[0]?.id || null;
    applyTheme();renderSidebar();renderNote();updateStatus();
    $('new-note').addEventListener('click',createNote);$('tab-new').addEventListener('click',createNote);$('mobile-new').addEventListener('click',createNote);
    $('new-folder').addEventListener('click',addFolder);
    $('search').addEventListener('input',e=>{search=e.target.value;renderSidebar();});
    $('quick-links').addEventListener('click',e=>{
      const button=e.target.closest('[data-filter]');if(!button)return;
      if(button.dataset.filter==='graph'){openInsights('graph');return;}
      search='';$('search').value='';setFilter(button.dataset.filter);
    });
    $('folder-list').addEventListener('click',e=>{const b=e.target.closest('[data-folder]');if(b){search='';$('search').value='';setFilter('folder:'+b.dataset.folder);}});
    $('note-list').addEventListener('click',e=>{const b=e.target.closest('[data-note-id]');if(b)selectNote(b.dataset.noteId);});
    $('note-title').addEventListener('input',e=>{
      const n=current();if(!n)return;
      mutateNote('title',e.target.value||'Untitled',false);
      $('tab-title').textContent=n.title;
      $('mobile-title').innerHTML=escapeHtml(clampText(n.title,22))+' '+icon('chevron');
      renderSidebar();renderInsights();
    });
    $('note-body').addEventListener('input',e=>{mutateNote('body',e.target.value,false);updateStats();autoHeight();renderSidebar();renderTags();renderInsights();});
    $('note-body').addEventListener('focus',()=>document.body.classList.add('editing'));
    $('note-body').addEventListener('blur',()=>document.body.classList.remove('editing'));
    $('note-tags').addEventListener('click',e=>{
      const b=e.target.closest('[data-tag]');
      if(b){search=b.dataset.tag;$('search').value=search;openSidebar(true);return;}
      if(e.target.closest('#add-tag')){
        const n=current(),next=prompt('Add a tag (without #)');if(!n||next===null)return;
        const tag=next.trim().replace(/^#/,'').slice(0,40);
        if(tag&&!n.tags.includes(tag)){mutateNote('tags',[...n.tags,tag]);renderTags();}
      }
    });
    $('preview-toggle').addEventListener('click',()=>setPreview(!preview));
    document.querySelectorAll('.format-btn').forEach(b=>b.addEventListener('click',()=>insertText(b.dataset.wrap||b.dataset.insert,!!b.dataset.wrap)));
    $('preview-body').addEventListener('click',e=>{
      const link=e.target.closest('[data-wiki]');if(!link)return;
      const n=visibleNotes().find(n=>n.title.toLowerCase()===link.dataset.wiki.trim().toLowerCase());
      if(n)selectNote(n.id);else toast('No note titled '+link.dataset.wiki);
    });
    $('insights-content').addEventListener('click',e=>{
      const b=e.target.closest('[data-jump],[data-graph-id]');
      if(b)selectNote(b.dataset.jump||b.dataset.graphId);
    });
    document.querySelectorAll('.insights-tab').forEach(b=>b.addEventListener('click',()=>openInsights(b.dataset.panel)));
    $('rail-notes').addEventListener('click',()=>{setFilter('all');openSidebar();});
    $('rail-star').addEventListener('click',()=>{setFilter('star');openSidebar();});
    $('rail-graph').addEventListener('click',()=>openInsights('graph'));
    $('rail-settings').addEventListener('click',settingsOpen);
    $('sidebar-cloud').addEventListener('click',settingsOpen);$('cloud-button').addEventListener('click',settingsOpen);
    $('open-sidebar').addEventListener('click',()=>openSidebar());
    $('mobile-title').addEventListener('click',()=>openSidebar());
    $('close-sidebar').addEventListener('click',closePanels);
    $('close-insights').addEventListener('click',closePanels);
    $('overlay').addEventListener('click',closePanels);
    $('focus-button').addEventListener('click',toggleFocus);
    $('more-button').addEventListener('click',actionMenu);
    $('note-menu').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)actOnNote(b.dataset.action);});
    document.addEventListener('pointerdown',e=>{if(!e.target.closest('#note-menu')&&!e.target.closest('#more-button'))$('note-menu').hidden=true;});
    document.querySelectorAll('[data-mobile]').forEach(b=>b.addEventListener('click',()=>{
      const action=b.dataset.mobile;
      if(action==='notes')openSidebar();
      if(action==='search')openSidebar(true);
      if(action==='graph'||action==='backlinks')openInsights(action);
    }));
    $('settings-close').addEventListener('click',()=>$('settings-modal').close());
    $('sign-in').addEventListener('click',login);
    $('sync-now').addEventListener('click',syncNow);
    $('theme-toggle').addEventListener('click',toggleTheme);
    $('settings-theme-toggle').addEventListener('click',toggleTheme);
    $('sign-out').addEventListener('click',signOut);
    $('export-all').addEventListener('click',downloadBackup);
    $('import-all').addEventListener('click',()=>$('import-file').click());
    $('import-file').addEventListener('change',e=>importBackup(e.target.files[0]));
    document.addEventListener('keydown',handleKeyboard);
    window.addEventListener('focus',()=>{if(cloudReady()&&!dirty)pullCloud();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&cloudReady()&&!dirty)pullCloud();});
    setInterval(()=>{if(cloudReady()&&!document.hidden&&!dirty)pullCloud();},60000);
    setInterval(()=>{if(current())$('note-updated').textContent='Edited '+timeAgo(current().updatedAt);updateStatus();},30000);
    if(cloudReady())pullCloud(true);
  }
  init();
})();