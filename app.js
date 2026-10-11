/* MX Notes — local-first rich-text workspace, Cloudflare D1 owner sync. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const icon=name=>'<svg aria-hidden="true"><use href="#i-'+name+'"/></svg>';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uuid=()=>crypto?.randomUUID?.()||'note-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const stamp=()=>new Date().toISOString();
  const STORE='mxnotes.workspace.v1',VIEW='mxnotes.ui.v3',THEME='mxnotes.appearance.theme',FONT='mxnotes.appearance.font',FONT_SIZE='mxnotes.appearance.fontSize',AUTOCORRECT='mxnotes.writing.autocorrect',VERIFIED='mxnotes.d1.lastVerified';
  const SWAP_DELAY=1450;
  const seeded=()=>({
    version:3,updatedAt:'2025-01-01T00:00:00.000Z',foldersUpdatedAt:'2025-01-01T00:00:00.000Z',
    folders:['Personal','Work','Ideas','Writing','Design','Reading','Life'],
    notes:[
      {id:'welcome',title:'A calmer mind',folder:'Life',html:'<h2>Thoughts on a simpler life</h2><p>Lately I’ve been thinking a lot about how much calmer life feels when things are simple. Not easier, but simpler. Fewer tabs, fewer commitments, fewer things fighting for my attention.</p><p>It’s not about doing less, but about making space for what actually matters.</p><ul><li>More time for deep work</li><li>A cleaner headspace</li><li>People who feel like home</li><li>A life that feels intentional</li></ul><blockquote>Simplicity is not the absence of things, but the presence of what matters.</blockquote><h2>Related</h2><p>Keep the ideas connected: <a data-note-id="habits">Habits</a> · <a data-note-id="focus">Focus</a> · <a data-note-id="morning">A better morning</a></p>',updatedAt:'2025-01-01T00:00:00.000Z'},
      {id:'habits',title:'Habits',folder:'Life',html:'<h2>Small things, often</h2><p>Good habits create space for a calmer mind.</p><ul><li>Read every day</li><li>Move my body</li><li>Protect the morning</li></ul><p><a data-note-id="welcome">A calmer mind</a></p>',updatedAt:'2025-01-01T00:00:00.000Z'},
      {id:'focus',title:'Focus',folder:'Work',html:'<h2>Give it your attention</h2><p>Do one thing beautifully.</p><p><a data-note-id="welcome">A calmer mind</a></p>',updatedAt:'2025-01-01T00:00:00.000Z'},
      {id:'morning',title:'A better morning',folder:'Personal',html:'<h2>Start with intention</h2><p>Water, a walk, one written page.</p><p><a data-note-id="welcome">A calmer mind</a></p>',updatedAt:'2025-01-01T00:00:00.000Z'}
    ]
  });
  const textColors=['#eb6577','#ed9555','#e7b852','#e2d767','#66c88d','#4bc7ba','#64b5f2','#9b8cf2','#e684bd','#a9b8c7'];
  const markerColors=['#653440','#624027','#615622','#505d32','#285944','#235b57','#294f6e','#453e77','#64385b','#50555e'];
  const inkLabels=['Red','Orange','Gold','Yellow','Green','Teal','Blue','Violet','Pink','Silver'];
  const allowed=new Set(['DIV','P','BR','B','STRONG','I','EM','U','S','H1','H2','H3','UL','OL','LI','BLOCKQUOTE','A','SPAN','FONT','CODE','HR']);
  const safePaint=(value,palette)=>{
    const v=String(value||'').trim().toLowerCase();
    let hex=v;
    const rgb=/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:1|1\.0))?\s*\)$/.exec(v);
    if(rgb){const x=rgb.slice(1,4).map(Number);if(x.some(n=>n>255))return null;hex='#'+x.map(n=>n.toString(16).padStart(2,'0')).join('');}
    return palette.includes(hex)?hex:null;
  };
  function safeHtml(raw) {
    const doc=new DOMParser().parseFromString('<div>'+String(raw||'')+'</div>','text/html');
    function walk(node){
      if(node.nodeType===3)return esc(node.nodeValue);
      if(node.nodeType!==1)return '';
      if(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','SVG','MATH','TEMPLATE','LINK','META'].includes(node.tagName))return '';
      const children=Array.from(node.childNodes).map(walk).join('');
      if(!allowed.has(node.tagName))return children;
      const t=node.tagName.toLowerCase();
      if(t==='br'||t==='hr')return '<'+t+'>';
      let attrs='';
      if(t==='a'){
        const noteId=node.getAttribute('data-note-id');
        const href=node.getAttribute('href');
        if(noteId&&/^[\w.-]{1,120}$/.test(noteId))attrs=' data-note-id="'+esc(noteId)+'"';
        else if(href&&/^https?:\/\//i.test(href)){
          try{const u=new URL(href);attrs=' href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer"';}catch(e){}
        }
      }
      if(t==='p'&&node.getAttribute('data-checklist')==='1')attrs=' data-checklist="1"';
      if(t==='span'||t==='font'){
        const ink=safePaint(node.style?.color||node.getAttribute('color'),textColors);
        const mark=safePaint(node.style?.backgroundColor||node.getAttribute('bgcolor'),markerColors);
        const style=[ink?'color:'+ink:'',mark?'background-color:'+mark:''].filter(Boolean).join(';');
        if(style)attrs=' style="'+style+'"';
      }
      if(t==='span'&&['0','1'].includes(node.getAttribute('data-checkbox'))){
        const checked=node.getAttribute('data-checkbox')==='1';
        attrs=' data-checkbox="'+(checked?'1':'0')+'" contenteditable="false" role="checkbox" tabindex="0" aria-label="Checklist item" aria-checked="'+checked+'"';
      }
      const safeTag=t==='font'?'span':t;
      return '<'+safeTag+attrs+'>'+children+'</'+safeTag+'>';
    }
    return Array.from(doc.body.firstElementChild?.childNodes||[]).map(walk).join('');
  }
  function oldMarkdownToHtml(source,lookup={}) {
    let out='',list=false;
    const inline=s=>esc(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g,'<em>$1</em>')
      .replace(/\[\[([^\]]+)\]\]/g,(_,t)=>{
        const id=lookup[t.trim().toLocaleLowerCase()];
        return id?'<a data-note-id="'+esc(id)+'">'+esc(t)+'</a>':'<span>'+esc(t)+'</span>';
      });
    String(source||'').split(/\r?\n/).forEach(line=>{
      const bullet=/^\s*[-*] (.*)$/.exec(line);
      if(bullet){if(!list){out+='<ul>';list=true;}out+='<li>'+inline(bullet[1])+'</li>';return;}
      if(list){out+='</ul>';list=false;}
      if(!line.trim()){out+='<p><br></p>';return;}
      if(/^#{1,3} /.test(line)){const h=Math.min(3,(line.match(/^#+/)||['#'])[0].length+1);out+='<h'+h+'>'+inline(line.replace(/^#+ /,''))+'</h'+h+'>';return;}
      if(/^> /.test(line)){out+='<blockquote>'+inline(line.slice(2))+'</blockquote>';return;}
      out+='<p>'+inline(line)+'</p>';
    });
    if(list)out+='</ul>';return out;
  }
  function normalize(x) {
    if(!x||!Array.isArray(x.notes))throw Error('Invalid backup');
    const lookup={};
    for(const n of x.notes){if(n?.title && typeof n.id==='string')lookup[String(n.title).trim().toLocaleLowerCase()]=n.id;}
    return {version:3,updatedAt:typeof x.updatedAt==='string'?x.updatedAt:stamp(),foldersUpdatedAt:typeof x.foldersUpdatedAt==='string'?x.foldersUpdatedAt:(x.updatedAt||stamp()),
      folders:[...new Set((Array.isArray(x.folders)?x.folders:[]).filter(v=>typeof v==='string'&&v.length<100))],
      notes:x.notes.filter(n=>n&&typeof n.id==='string').slice(0,15000).map(n=>({
        id:n.id,title:String(n.title||'Untitled').slice(0,400),
        folder:String(n.folder||'Inbox').slice(0,100),
        html:safeHtml(typeof n.html==='string'?n.html:oldMarkdownToHtml(n.body,lookup)),
        updatedAt:typeof n.updatedAt==='string'?n.updatedAt:stamp(),
        starred:!!n.starred,archived:!!n.archived,deleted:!!n.deleted,purged:!!n.purged
      }))
    };
  }
  let state;
  let pristine=!localStorage.getItem(STORE);
  try{state=localStorage.getItem(STORE)?normalize(JSON.parse(localStorage.getItem(STORE))):normalize(seeded());}
  catch(e){console.warn('Local notes backup issue',e);state=normalize(seeded());}
  let ui;
  try{ui=JSON.parse(localStorage.getItem(VIEW)||'{}')||{};}catch(e){ui={};}
  const folderKey=folder=>'folder:'+folder;
  const isFolderTab=id=>typeof id==='string'&&id.startsWith('folder:');
  const tabExists=id=>isFolderTab(id)?(id==='folder:Inbox'||state.folders.includes(id.slice(7))):!!state.notes.find(n=>n.id===id&&!n.purged);
  let tabs=(Array.isArray(ui.tabs)?ui.tabs:[]).filter(tabExists);
  let selected=state.notes.some(n=>n.id===ui.selected&&!n.purged)?ui.selected:(state.notes.find(n=>!n.deleted&&!n.archived)||state.notes[0])?.id||null;
  let activeTab=tabExists(ui.activeTab)?ui.activeTab:selected;
  if(activeTab&&!tabs.includes(activeTab))tabs.push(activeTab);
  let filter='all',search='',theme=localStorage.getItem(THEME)==='light'?'light':'dark';
  let focusMode=false,isEditing=false,cloudReady=false,ownerActive=false;
  const sidebarUpgradeKey='mxnotes.ui.organized-2026-10';
  let notesCollapsed=localStorage.getItem(sidebarUpgradeKey)!=='1'?true:!!ui.notesCollapsed;
  if(localStorage.getItem(sidebarUpgradeKey)!=='1')localStorage.setItem(sidebarUpgradeKey,'1');
  let collapsedGroups=new Set(Array.isArray(ui.collapsedGroups)?ui.collapsedGroups:[]);
  let expandedNotes=new Set(Array.isArray(ui.expandedNotes)?ui.expandedNotes:[]);
  let showAllGroups=new Set(Array.isArray(ui.showAllGroups)?ui.showAllGroups:[]);
  let autoCorrect=localStorage.getItem(AUTOCORRECT)!=='off';
  let lastClosedTab=typeof ui.lastClosedTab==='string'?ui.lastClosedTab:null;
  const fontChoices=['system','obsidian','arial','calibri','reading','times','courier','mono','cairo','naskh'];
  let writingFont=fontChoices.includes(localStorage.getItem(FONT))?localStorage.getItem(FONT):'system';
  let writingSize=Math.max(12,Math.min(28,Number(localStorage.getItem(FONT_SIZE))||16));
  let cloudStatus='Saved on this device',syncTimer=null,maxSyncTimer=null,syncing=false,requestedSync=false,dirty=false,revision=0,lastConfirmed=null;
  try{lastConfirmed=JSON.parse(localStorage.getItem(VERIFIED)||'null');}catch(e){}
  let pendingDialog=null,savedSelection=null,menuContext=null,toastTimer=null,longTimer=null,uiRenderTimer=null,skipClickUntil=0;
  const current=()=>state.notes.find(n=>n.id===selected)||null;
  const visible=()=>state.notes.filter(n=>!n.deleted&&!n.archived&&!n.purged);
  const findNote=id=>state.notes.find(n=>n.id===id);
  const folderLabel=name=>name==='Inbox'?'Notes':name;
  const timeAgo=date=>{
    const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(date||stamp()))/1000));
    if(seconds<45)return 'just now';if(seconds<3600)return Math.floor(seconds/60)+'m ago';
    if(seconds<86400)return Math.floor(seconds/3600)+'h ago';return new Date(date).toLocaleDateString();
  };
  const plain=html=>{const d=document.createElement('div');d.innerHTML=safeHtml(html);return d.innerText||d.textContent||'';};
  const linkIds=n=>n?[...new Set(Array.from((()=>{const div=document.createElement('div');div.innerHTML=safeHtml(n.html);return div;})().querySelectorAll('a[data-note-id]')).map(a=>a.dataset.noteId).filter(id=>findNote(id)&&!findNote(id).deleted))]:[];
  const backlinks=n=>n?visible().filter(other=>other.id!==n.id&&linkIds(other).includes(n.id)):[];
  function saveUi(){localStorage.setItem(VIEW,JSON.stringify({tabs,selected,activeTab,notesCollapsed,collapsedGroups:[...collapsedGroups],expandedNotes:[...expandedNotes],showAllGroups:[...showAllGroups],lastClosedTab}));}
  function persist(remote=true){
    pristine=false;
    state.updatedAt=stamp();
    try{localStorage.setItem(STORE,JSON.stringify(state));}
    catch(e){showToast('Storage is full. Export a backup from Settings.');return;}
    if(remote){dirty=true;scheduleSync();}
    updateCloudUI();
  }
  function showToast(message){
    const el=$('toast');el.textContent=message;el.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
  }
  function applyTheme(){
    document.documentElement.dataset.theme=theme;
    $('theme-toggle').innerHTML=icon(theme==='light'?'moon':'sun');
    $('settings-theme-toggle').innerHTML=icon(theme==='light'?'moon':'sun')+(theme==='light'?' Switch to dark':' Switch to light');
    $('theme-mode').textContent=theme==='light'?'Light mode':'Dark mode';
    document.documentElement.dataset.writingFont=writingFont;
    $('writing-font').value=writingFont;
    document.documentElement.style.setProperty('--editor-font-size',writingSize+'px');
    $('font-size-label').textContent=writingSize;
    $('auto-correct').checked=autoCorrect;
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.content=theme==='light'?'#f8fafb':'#101214';
  }
  function toggleTheme(){theme=theme==='dark'?'light':'dark';localStorage.setItem(THEME,theme);applyTheme();showToast(theme==='dark'?'Dark mode':'Light mode');}
  function changeFontSize(delta){writingSize=Math.max(12,Math.min(28,writingSize+delta));localStorage.setItem(FONT_SIZE,String(writingSize));applyTheme();}
  function noteTabs(){
    const wrapper=$('open-tabs');
    wrapper.innerHTML=tabs.filter(tabExists).map(id=>{
      const folder=isFolderTab(id),n=folder?null:findNote(id);
      const name=folder?folderLabel(id.slice(7)):n?.title||'Untitled';
      return '<div class="note-tab '+(id===activeTab?'active':'')+'" role="tab" aria-selected="'+(id===activeTab)+'" data-tab="'+esc(id)+'">'+icon(folder?'folder':'file')+
        '<span class="note-tab-title" dir="auto">'+esc(name)+'</span><button class="tab-close" data-close-tab="'+esc(id)+'" title="Close tab" aria-label="Close '+esc(name)+'">'+icon('x')+'</button></div>';
    }).join('');
    wrapper.querySelector('.note-tab.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function openTab(id){
    if(isFolderTab(id)){openFolder(id.slice(7));return;}
    openNote(id);
  }
  function openFolder(folder){
    if(folder!=='Inbox'&&!state.folders.includes(folder))return;
    if(isEditing)commitEditor();
    const id=folderKey(folder);
    if(!tabs.includes(id))tabs.push(id);
    activeTab=id;filter='folder:'+folder;search='';$('search').value='';
    saveUi();renderAll();closePanels();
  }
  function openNote(id){
    if(!findNote(id))return;
    if(isEditing)commitEditor();
    selected=id;activeTab=id;
    if(!tabs.includes(id))tabs.push(id);
    saveUi();renderAll();closePanels();
  }
  function closeTab(id){
    const i=tabs.indexOf(id);if(i<0)return;
    lastClosedTab=id;tabs.splice(i,1);
    if(activeTab===id){
      activeTab=tabs[Math.min(i,tabs.length-1)]||visible()[0]?.id||null;
      if(activeTab&&!tabs.includes(activeTab))tabs.push(activeTab);
      if(activeTab&&!isFolderTab(activeTab))selected=activeTab;
    }
    saveUi();renderAll();
  }
  function newNote(folder='Inbox'){
    commitEditor();
    const n={id:uuid(),title:'Untitled',folder,html:'',updatedAt:stamp(),starred:false,archived:false,deleted:false};
    state.notes.push(n);selected=n.id;activeTab=n.id;if(!tabs.includes(n.id))tabs.push(n.id);filter='all';search='';$('search').value='';
    persist();saveUi();renderAll();closePanels();$('note-title').focus();$('note-title').select();
  }
  function touchNote(n){n.updatedAt=stamp();persist();renderSidebar();noteTabs();updateSummary();}
  function closePanels(){
    $('sidebar').classList.remove('open');$('overlay').hidden=true;
    hideContext();$('style-menu').hidden=true;hidePaintMenu();
  }
  function openSidebar(searchFocus=false){
    if(innerWidth<761){$('sidebar').classList.add('open');$('overlay').hidden=false;}
    if(searchFocus)setTimeout(()=>$('search').focus(),60);
  }
  function renderSidebar(){
    const folders=state.folders,live=visible();
    const quick=[['inbox','Notes','folder',live.filter(n=>n.folder==='Inbox').length],
      ['today','Today','calendar',live.filter(n=>new Date(n.updatedAt).toDateString()===new Date().toDateString()).length],
      ['star','Starred','star',live.filter(n=>n.starred).length],
      ['all','All notes','file',live.length],['trash','Trash','trash',state.notes.filter(n=>n.deleted&&!n.purged).length],
      ['archive','Archive','archive',state.notes.filter(n=>n.archived&&!n.deleted).length]];
    $('quick-links').innerHTML=quick.map(([id,title,ico,count])=>'<button class="quick-link '+(filter===id?'active':'')+'" data-filter="'+id+'">'+icon(ico)+
      '<span>'+esc(title)+'</span>'+(count?'<span class="count">'+count+'</span>':'')+'</button>').join('');
    $('folder-list').innerHTML=folders.map(f=>'<div class="pinned-folder-row '+(activeTab===folderKey(f)?'active':'')+'"><button class="folder-item '+(activeTab===folderKey(f)?'active':'')+'" data-folder="'+esc(f)+'" title="Open folder as tab">'+icon('folder')+'<span class="folder-name" dir="auto">'+esc(f)+'</span><span class="count">'+live.filter(n=>n.folder===f).length+'</span></button><button class="folder-rename-btn" data-rename-folder="'+esc(f)+'" title="Rename folder" aria-label="Rename '+esc(f)+'">'+icon('edit')+'</button></div>').join('');
    let notes=filter==='trash'?state.notes.filter(n=>n.deleted&&!n.purged):filter==='archive'?state.notes.filter(n=>n.archived&&!n.deleted&&!n.purged):live;
    if(filter==='star')notes=notes.filter(n=>n.starred);
    if(filter==='today')notes=notes.filter(n=>new Date(n.updatedAt).toDateString()===new Date().toDateString());
    if(filter==='inbox')notes=notes.filter(n=>n.folder==='Inbox');
    if(filter.startsWith('folder:'))notes=notes.filter(n=>n.folder===filter.slice(7));
    if(search.trim()){
      const q=search.toLocaleLowerCase();
      notes=state.notes.filter(n=>!n.deleted&&!n.purged&&(n.title+' '+plain(n.html)).toLocaleLowerCase().includes(q));
    }
    notes.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
    $('notes-total').textContent=notes.length;
    $('toggle-notes-list').setAttribute('aria-expanded',String(!notesCollapsed));
    $('toggle-notes-list').classList.toggle('collapsed',notesCollapsed);
    if(notesCollapsed){$('note-list').innerHTML='';return;}
    const renderNote=n=>'<div class="note-row"><button class="note-item '+(n.id===selected?'active':'')+'" data-note-id="'+esc(n.id)+'" title="Open note · right-click for actions">'+icon('file')+
      '<span class="note-name" dir="auto">'+esc(n.title)+'</span>'+(n.starred?'<span class="note-star">★</span>':'')+'</button></div>';
    const groupMap=new Map();
    for(const n of notes){const folder=n.folder||'Inbox';if(!groupMap.has(folder))groupMap.set(folder,[]);groupMap.get(folder).push(n);}
    const ordered=[...groupMap.entries()].sort((a,b)=>{
      const ai=['Inbox',...folders].indexOf(a[0]),bi=['Inbox',...folders].indexOf(b[0]);
      return (ai<0?999:ai)-(bi<0?999:bi);
    });
    $('note-list').innerHTML=ordered.length?ordered.map(([folder,items])=>{
      const folded=collapsedGroups.has(folder);
      return '<section class="note-group"><button class="note-group-toggle '+(folded?'collapsed':'')+'" data-group-toggle="'+esc(folder)+'" aria-expanded="'+(!folded)+'">'+icon('chevron')+
        '<span dir="auto">'+esc(folderLabel(folder))+'</span><span class="count">'+items.length+'</span></button>'+
        (folded?'':'<div class="note-group-items">'+items.slice(0,showAllGroups.has(folder)?items.length:4).map(renderNote).join('')+
          (items.length>4?'<button class="notes-show-more" data-show-group="'+esc(folder)+'">'+(showAllGroups.has(folder)?'Show fewer':'Show all '+items.length+' notes')+'</button>':'')+'</div>')+'</section>';
    }).join(''):'<div class="empty-state">No notes here yet.<br>Press + to begin.</div>';
  }
  function updateSummary(){
    const n=current();if(!n){$('word-count').textContent='0 words';$('character-count').textContent='0 characters';return;}
    const text=plain(n.html).trim(),words=text?text.split(/\s+/u).length:0;
    $('word-count').textContent=words.toLocaleString()+' words';
    $('character-count').textContent=text.length.toLocaleString()+' characters';
    $('note-updated').textContent='Edited '+timeAgo(n.updatedAt);
  }
  function renderFolderView(folder){
    const all=visible().filter(n=>n.folder===folder).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
    const titled=all.filter(n=>n.title.trim().toLocaleLowerCase()!=='untitled');
    const drafts=all.filter(n=>n.title.trim().toLocaleLowerCase()==='untitled');
    const card=n=>'<button class="folder-note-card" data-folder-note="'+esc(n.id)+'"><span class="folder-card-icon">'+icon('file')+'</span><span class="folder-card-detail"><strong dir="auto">'+esc(n.title)+'</strong><small dir="auto">'+esc(plain(n.html).trim().slice(0,100)||'Empty note')+'</small></span><time>'+esc(timeAgo(n.updatedAt))+'</time></button>';
    $('folder-view').innerHTML='<div class="folder-view-head"><div class="editor-eyebrow">FOLDER · '+all.length+' NOTES</div><h1 dir="auto">'+esc(folderLabel(folder))+'</h1><button class="folder-create" data-new-in-folder="'+esc(folder)+'">'+icon('plus')+' New note</button></div>'+
      (titled.length?'<div class="folder-view-list">'+titled.map(card).join('')+'</div>':'')+
      (drafts.length?'<details class="folder-drafts"><summary>'+icon('chevron')+' Untitled drafts <span>'+drafts.length+'</span></summary><div class="folder-view-list">'+drafts.map(card).join('')+'</div></details>':'')+
      (!all.length?'<div class="folder-empty">This folder is empty. Create a note to get started.</div>':'');
  }
  function renderEditor(){
    const isFolder=isFolderTab(activeTab);
    $('folder-view').hidden=!isFolder;
    document.querySelector('.editor-content').hidden=isFolder;
    document.body.classList.toggle('folder-tab-active',isFolder);
    if(isFolder){const name=activeTab.slice(7);renderFolderView(name);
      $('breadcrumb').textContent='Folders / '+folderLabel(name);
      $('mobile-title').innerHTML=esc(folderLabel(name))+' '+icon('chevron');
      $('editor-scroll').scrollTop=0;return;}
    const n=current();
    $('note-title').disabled=!n;
    $('rich-editor').contentEditable=n?'true':'false';
    $('note-title').value=n?.title||'';
    $('rich-editor').innerHTML=n?.html||'';
    $('mobile-title').innerHTML=esc(n?.title||'All notes')+' '+icon('chevron');
    $('breadcrumb').innerHTML=n?esc(folderLabel(n.folder))+' <span> / </span> '+esc(n.title):'Your notes';
    $('editor-eyebrow').textContent=n?('YOUR NOTES  —  '+folderLabel(n.folder).toUpperCase()):'YOUR WORKSPACE';
    updateSummary();
    $('editor-scroll').scrollTop=0;
  }
  function renderAll(){
    tabs=tabs.filter(tabExists);
    if(!tabExists(activeTab)){
      activeTab=tabs.at(-1)||visible()[0]?.id||null;
      if(activeTab&&!tabs.includes(activeTab))tabs.push(activeTab);
    }
    if(!state.notes.some(n=>n.id===selected&&!n.purged))selected=visible()[0]?.id||null;
    if(activeTab&&!isFolderTab(activeTab))selected=activeTab;
    renderSidebar();noteTabs();renderEditor();updateCloudUI();
  }
  function commitEditor(){
    const n=current();if(!n)return;
    const html=safeHtml($('rich-editor').innerHTML);
    if(n.html!==html){n.html=html;n.updatedAt=stamp();persist();}
  }
  function onEditorInput(){
    const n=current();if(!n)return;
    n.html=safeHtml($('rich-editor').innerHTML);
    n.updatedAt=stamp();persist();updateSummary();
    // Keep the editor and cursor completely untouched while typing.
    clearTimeout(uiRenderTimer);
    uiRenderTimer=setTimeout(()=>{renderSidebar();},350);
  }
  function onTitleInput(){
    const n=current();if(!n)return;
    n.title=$('note-title').value||'Untitled';touchNote(n);
    $('mobile-title').innerHTML=esc(n.title)+' '+icon('chevron');
    $('breadcrumb').innerHTML=esc(folderLabel(n.folder))+' <span> / </span> '+esc(n.title);
  }
  function saveSelection(){
    const sel=window.getSelection();
    if(sel?.rangeCount && $('rich-editor').contains(sel.anchorNode))savedSelection=sel.getRangeAt(0).cloneRange();
  }
  function restoreSelection(){
    if(!savedSelection)return;
    try{const sel=window.getSelection();sel.removeAllRanges();sel.addRange(savedSelection);}catch(e){}
  }
  function moveCaretAfterCheckbox(block){
    if(!block)return;
    const checkbox=block.querySelector('[data-checkbox]');
    let tail=checkbox?.nextSibling;
    if(!tail||tail.nodeType!==3){tail=document.createTextNode('\u00a0');checkbox?.after(tail);}
    const range=document.createRange();
    range.setStart(tail,Math.min(tail.textContent.length,1));
    range.collapse(true);
    const selection=window.getSelection();
    selection.removeAllRanges();selection.addRange(range);
    $('rich-editor').focus({preventScroll:true});
    savedSelection=range.cloneRange();
  }
  function toggleCheckbox(checkbox){
    if(!checkbox)return;
    const next=checkbox.dataset.checkbox==='1'?'0':'1';
    checkbox.dataset.checkbox=next;
    checkbox.setAttribute('aria-checked',String(next==='1'));
    checkbox.textContent=next==='1'?'☑':'☐';
    onEditorInput();
  }
  function checklistEnter(event){
    if(event.key!=='Enter'||event.shiftKey||event.ctrlKey||event.metaKey)return;
    const selection=window.getSelection();
    const anchor=selection?.anchorNode;
    const root=anchor?.nodeType===1?anchor:anchor?.parentElement;
    const block=root?.closest('p[data-checklist="1"]');
    if(!block||!selection?.rangeCount)return;
    event.preventDefault();
    const range=selection.getRangeAt(0).cloneRange();
    if(!range.collapsed)range.deleteContents();
    const filled=block.textContent.replace(/[☐☑\u00a0\u200b]/gu,'').trim();
    if(!filled){
      const paragraph=document.createElement('p');
      paragraph.appendChild(document.createElement('br'));
      block.replaceWith(paragraph);
      const caret=document.createRange();caret.setStart(paragraph,0);caret.collapse(true);
      selection.removeAllRanges();selection.addRange(caret);savedSelection=caret.cloneRange();
    }else{
      const remaining=range.cloneRange();
      remaining.setEnd(block,block.childNodes.length);
      const suffix=remaining.extractContents();
      const next=document.createElement('p');next.dataset.checklist='1';
      next.innerHTML='<span data-checkbox="0" contenteditable="false" role="checkbox" aria-label="Checklist item" aria-checked="false" tabindex="0">☐</span>&nbsp;';
      next.appendChild(suffix);
      block.after(next);
      moveCaretAfterCheckbox(next);
    }
    onEditorInput();
  }
  function hidePaintMenu(){
    const menu=$('paint-menu');
    if(menu)menu.hidden=true;
    $('text-color-picker')?.setAttribute('aria-expanded','false');
    $('highlight-picker')?.setAttribute('aria-expanded','false');
  }
  function openPaintMenu(kind,trigger){
    const menu=$('paint-menu'),same=!menu.hidden&&menu.dataset.kind===kind;
    hidePaintMenu();
    if(same)return;
    menu.dataset.kind=kind;
    const ink=kind==='ink',colors=ink?textColors:markerColors;
    menu.innerHTML='<div class="paint-title">'+(ink?'Text color':'Highlight')+'<span>10 colors</span></div><div class="paint-grid">'+
      colors.map((color,i)=>'<button type="button" class="paint-swatch" style="--swatch:'+color+'" data-paint-index="'+i+'" title="'+esc(inkLabels[i])+'" aria-label="'+esc(inkLabels[i])+' '+(ink?'text':'highlight')+'"><span></span></button>').join('')+
      '</div>'+(ink?'':'<button type="button" class="paint-clear" data-paint-clear="true">No highlight</button>');
    menu.hidden=false;trigger.setAttribute('aria-expanded','true');
    const rect=trigger.getBoundingClientRect();
    const width=Math.max(190,menu.offsetWidth);
    menu.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';
    const top=rect.top-menu.offsetHeight-8;
    menu.style.top=(top>8?top:Math.min(rect.bottom+8,innerHeight-menu.offsetHeight-8))+'px';
  }
  function format(cmd,val=null){
    const editor=$('rich-editor');
    editor.focus({preventScroll:true});restoreSelection();
    if(cmd==='foreColor'||cmd==='hiliteColor')document.execCommand('styleWithCSS',false,true);
    if(cmd==='checklist'){
      const before=new Set(editor.querySelectorAll('p[data-checklist="1"]'));
      document.execCommand('insertHTML',false,'<p data-checklist="1"><span data-checkbox="0" contenteditable="false" role="checkbox" aria-label="Checklist item" aria-checked="false" tabindex="0">☐</span>&nbsp;</p>');
      const newBlock=[...editor.querySelectorAll('p[data-checklist="1"]')].find(p=>!before.has(p));
      if(newBlock)moveCaretAfterCheckbox(newBlock);
      else editor.focus({preventScroll:true});
    }else if(cmd==='createLink'){
      ask('Insert a link','Existing note title or https:// URL','').then(target=>{
        if(!target?.trim())return;
        const value=target.trim();
        const linked=visible().find(n=>n.title.toLocaleLowerCase()===value.toLocaleLowerCase());
        editor.focus();restoreSelection();
        if(linked)document.execCommand('insertHTML',false,'<a data-note-id="'+esc(linked.id)+'">'+esc(linked.title)+'</a>');
        else if(/^https?:\/\//i.test(value)){
          const sel=window.getSelection();
          if(sel?.toString())document.execCommand('createLink',false,value);
          else document.execCommand('insertHTML',false,'<a href="'+esc(value)+'" target="_blank" rel="noopener noreferrer">'+esc(value)+'</a>');
        }else{showToast('Enter an existing note title or a valid web URL');return;}
        onEditorInput();
      });return;
    }else if(cmd==='style'){
      document.execCommand('formatBlock',false,val||'p');
    }else document.execCommand(cmd,false,val);
    onEditorInput();saveSelection();
  }
  function ask(title,label,defaultValue=''){
    return new Promise(resolve=>{
      if(pendingDialog)pendingDialog(null);
      const modal=$('action-dialog');
      $('action-heading').textContent=title;$('action-label').textContent=label;
      $('action-input').value=defaultValue;
      pendingDialog=resolve;modal.showModal();$('action-input').focus();$('action-input').select();
    });
  }
  function finishAsk(confirmed){
    if(!pendingDialog)return;
    const fn=pendingDialog;pendingDialog=null;
    const value=confirmed?$('action-input').value:null;$('action-dialog').close();fn(value);
  }
  function confirmAction(title,message){
    return new Promise(resolve=>{
      if(pendingDialog)pendingDialog(null);
      const modal=$('confirm-dialog');$('confirm-heading').textContent=title;$('confirm-text').textContent=message;
      pendingDialog=resolve;modal.showModal();
    });
  }
  function finishConfirm(ok){
    if(!pendingDialog)return;const fn=pendingDialog;pendingDialog=null;$('confirm-dialog').close();fn(!!ok);
  }
  function showMenu(x,y,items,context={}){
    hideContext();
    const menu=$('context-menu');menuContext=context;
    menu.innerHTML=items.map(item=>item.divider?'<div class="context-divider"></div>':
      '<button role="menuitem" data-menu-action="'+esc(item.action)+'" class="'+(item.danger?'danger-action':'')+'">'+icon(item.ico||'file')+
        '<span>'+esc(item.label)+'</span></button>').join('');
    menu.hidden=false;
    requestAnimationFrame(()=>{
      menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-12))+'px';
      menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-12))+'px';
      menu.classList.add('visible');
    });
  }
  function hideContext(){$('context-menu').hidden=true;$('context-menu').classList.remove('visible');menuContext=null;}
  const noteOptions=n=>[
    {ico:'edit',label:'Rename',action:'rename-note'},
    {ico:'file',label:'Open in tab',action:'open-note'},
    {ico:'star',label:n.starred?'Remove favorite':'Add to favorites',action:'star-note'},
    {ico:'folder',label:'Move to folder',action:'move-note'},
    {ico:'file',label:'Duplicate',action:'duplicate-note'},
    {ico:'link',label:'Copy note link',action:'copy-note-link'},
    {divider:true},
    {ico:'archive',label:n.archived?'Unarchive':'Archive',action:'archive-note'},
    {ico:'download',label:'Export HTML',action:'export-note'},
    {ico:'trash',label:n.deleted?'Delete permanently':'Move to trash',action:'delete-note',danger:true},
    ...(n.deleted?[{ico:'refresh',label:'Restore',action:'restore-note'}]:[])
  ];
  const trashOptions=()=>[{ico:'trash',label:'Empty Trash permanently…',action:'empty-trash',danger:true},{ico:'file',label:'Open Trash',action:'open-trash'}];
  const folderOptions=folder=>[
    {ico:'plus',label:'New note here',action:'folder-new'},
    {ico:'edit',label:'Rename folder',action:'folder-rename'},
    {ico:'folder',label:'Open folder',action:'folder-open'},
    {divider:true},
    {ico:'trash',label:'Delete folder',action:'folder-delete',danger:true}
  ];
  const appOptions=()=>isFolderTab(activeTab)?[
    {ico:'plus',label:'New note in this folder',action:'active-folder-new'},
    {ico:'edit',label:'Rename this folder',action:'active-folder-rename'},
    {ico:'x',label:'Close folder tab',action:'close-tab'},
    {divider:true},
    {ico:'refresh',label:'Sync now',action:'sync'}
  ]:[
    {ico:'plus',label:'New note',action:'new-note'},
    {ico:'folder',label:'New folder',action:'new-folder'},
    {divider:true},
    {ico:'star',label:'Favorite current note',action:'star-note'},
    {ico:'file',label:'Duplicate note',action:'duplicate-note'},
    {ico:'download',label:'Export note',action:'export-note'},
    {divider:true},
    {ico:'palette',label:'Appearance & settings',action:'settings'},
    {ico:'refresh',label:'Sync now',action:'sync'},
    {ico:'trash',label:'Move note to trash',action:'delete-note',danger:true}
  ];
  const tabBlankOptions=()=>[
    {ico:'plus',label:'New note in tab',action:'new-note'},
    ...(lastClosedTab&&tabExists(lastClosedTab)?[{ico:'refresh',label:'Reopen closed tab',action:'restore-tab'}]:[]),
    {ico:'file',label:'Close active tab',action:'close-tab'},
    {ico:'x',label:'Close other tabs',action:'close-other-tabs'},
    {divider:true},
    {ico:'folder',label:'New folder',action:'new-folder'},
    {ico:'palette',label:'Appearance & settings',action:'settings'}
  ];

  // Fast, private offline spelling hints. Built-in browser spellcheck remains
  // available with Shift + right-click for its full installed dictionaries.
  // This list is deliberately conservative. Only explicit, unambiguous typos
  // are automatically replaced on Space; other candidates remain suggestions.
  const autoFixPairs={
    teh:'the',adn:'and',thier:'their',recieve:'receive',recieved:'received',
    acheive:'achieve',beleive:'believe',becuase:'because',becouse:'because',
    definetly:'definitely',definately:'definitely',seperate:'separate',
    adress:'address',addres:'address',enviroment:'environment',
    goverment:'government',occurence:'occurrence',occured:'occurred',
    succesful:'successful',sucess:'success',freind:'friend',
    freinds:'friends',wierd:'weird',untill:'until',wich:'which',
    langauge:'language',mesage:'message',messege:'message',
    tommorow:'tomorrow',tommorrow:'tomorrow',immediatly:'immediately',
    begining:'beginning',writting:'writing',comming:'coming',
    beleif:'belief',seperately:'separately',grammer:'grammar',
    neccessary:'necessary',necesary:'necessary',expierence:'experience',
    calender:'calendar',resturant:'restaurant',privat:'private',
    notees:'notes',sycn:'sync',cluod:'cloud',becasue:'because',
    woud:'would',shoud:'should',coud:'could',qick:'quick',
    هاذا:'هذا',هاذه:'هذه',لاكن:'لكن',الكن:'لكن',
    اللغه:'اللغة',مدرسه:'مدرسة',تجربه:'تجربة',
    كتابه:'كتابة',ملاحظه:'ملاحظة',ملاخظة:'ملاحظة',
    الملاحضات:'الملاحظات',الملاحضه:'الملاحظة',
    حتي:'حتى',اليومم:'اليوم',سوال:'سؤال',
    شيئ:'شيء',بالتاكيد:'بالتأكيد',
    الضاهر:'الظاهر',الظابط:'الضابط',الغه:'اللغة',
    الاخطااء:'الأخطاء',الكلماات:'الكلمات'
  };
  Object.assign(autoFixPairs,{
    transportationn:'transportation',transportaion:'transportation',transportaton:'transportation',
    achivement:'achievement',acheivement:'achievement',acheivment:'achievement',
    acess:'access',acesss:'access',accomodate:'accommodate',
    acommodate:'accommodate',arguement:'argument',arguements:'arguments',
    basicly:'basically',beutiful:'beautiful',beautifull:'beautiful',
    commited:'committed',committment:'commitment',conection:'connection',
    conected:'connected',conected:'connected',curiousity:'curiosity',
    decison:'decision',developement:'development',diffrent:'different',
    differnt:'different',dissapear:'disappear',embarass:'embarrass',
    embarassing:'embarrassing',existance:'existence',experiance:'experience',
    exellent:'excellent',explaination:'explanation',extention:'extension',
    febuary:'february',finaly:'finally',foriegn:'foreign',
    fourty:'forty',gramatically:'grammatically',happend:'happened',
    happendd:'happened',heigth:'height',improvment:'improvement',
    intresting:'interesting',intrested:'interested',knowlege:'knowledge',
    learing:'learning',lisence:'license',maintainance:'maintenance',
    managment:'management',neccesary:'necessary',noticable:'noticeable',
    occassion:'occasion',ocassion:'occasion',oppurtunity:'opportunity',
    oportunity:'opportunity',paralell:'parallel',perfomance:'performance',
    persistant:'persistent',personnal:'personal',privelege:'privilege',
    profesion:'profession',profesional:'professional',pronounciation:'pronunciation',
    recomend:'recommend',reccomend:'recommend',relevent:'relevant',
    remmember:'remember',responsiblity:'responsibility',restaraunt:'restaurant',
    securty:'security',similiar:'similar',sincerly:'sincerely',
    succesfully:'successfully',sucessfully:'successfully',surpise:'surprise',
    throught:'through',transfered:'transferred',truely:'truly',
    unfortunatly:'unfortunately',unneccessary:'unnecessary',usefull:'useful',
    vaccum:'vacuum',wether:'whether',writter:'writer',
    الإملائيه:'الإملائية',المجموعه:'المجموعة',الكومبيوتر:'الكمبيوتر',
    المعلوماتت:'المعلومات',الرساله:'الرسالة',الصفحه:'الصفحة',التطبيقق:'التطبيق'
  });
  const correctionPairs={
    teh:'the',adn:'and',thier:'their',recieve:'receive',recieved:'received',
    acheive:'achieve',beleive:'believe',becuase:'because',becouse:'because',
    definetly:'definitely',definately:'definitely',seperate:'separate',
    adress:'address',addres:'address',enviroment:'environment',
    goverment:'government',occurence:'occurrence',occured:'occurred',
    succesful:'successful',sucess:'success',freind:'friend',
    freinds:'friends',wierd:'weird',untill:'until',wich:'which',
    langauge:'language',mesage:'message',messege:'message',
    tommorow:'tomorrow',tommorrow:'tomorrow',tommorow:'tomorrow',
    accross:'across',alot:'a lot',immediatly:'immediately',
    begining:'beginning',writting:'writing',comming:'coming',
    beleif:'belief',seperately:'separately',grammer:'grammar',
    neccessary:'necessary',necesary:'necessary',expierence:'experience',
    calender:'calendar',resturant:'restaurant',privat:'private',
    notees:'notes',sycn:'sync',cluod:'cloud',becasue:'because',
    woud:'would',shoud:'should',coud:'could',qick:'quick',
    هاذا:'هذا',هاذه:'هذه',هاذي:'هذه',هاذين:'هذين',
    هية:'هي',لاكن:'لكن',الكن:'لكن',الان:'الآن',
    اللغه:'اللغة',مدرسه:'مدرسة',تجربه:'تجربة',
    كتابه:'كتابة',ملاحظه:'ملاحظة',ملاخظة:'ملاحظة',
    الملاحضات:'الملاحظات',الملاحضه:'الملاحظة',
    حتي:'حتى',اليومم:'اليوم',سوال:'سؤال',
    اساله:'أسئلة',شيئ:'شيء',مشاءالله:'ما شاء الله',
    انشاءالله:'إن شاء الله',بالتاكيد:'بالتأكيد',
    الضاهر:'الظاهر',الظابط:'الضابط',خطا:'خطأ',
    مساله:'مسألة',الغه:'اللغة',الاخطاء:'الأخطاء',
    لوحه:'لوحة',الكلمه:'الكلمة',الكلماات:'الكلمات',
    ايميل:'إيميل',الانكليزيه:'الإنكليزية'
  };
  // Extra frequent-word vocabulary for offline right-click candidates.
  const extraWords=(`
    address addresses addressing accepted access accurate accuracy action active actual add added adding admin advice affect again against airplane album align all already always amazing analysis android anniversary another answer answered answers apartment apparent appearance apple approach apps april arabic archive archived article artificial assistant atmosphere auto automatic automatically available aware background backup basic beautiful beauty become beginning believe beyond browser business button calendar cancel category celebration center century certain change changed changes changing chart check checking checklist checked child children choice choose cloud code collection comfortable communication compare complete completed computer connection connections connect connected continue continued conversation correct corrected correction correctly country create created creating creative creativity customer customers dashboard database data date daughter decision decorative delay delete deleted deleting design designer desktop determine development device dictionary difference different digital direct directly disable discover discovery display displays document documents download downloaded drag dynamic easily education effective efficiently electric electronic electricity elegant email emails enable enabled encouragement english enormous enough enter entered environment especially essential example exactly excellent exception excitement exercise experience explain explanation extension favorite favorites feature features February financial finally finished flight focus folder folders follow following font fonts formatting forward frequent frequently friends future geography github global government grammar great group groups guidance hamburger helpful history holiday home hours hover human idea ideas identity illustration image images improve improved improvements information input insert inside instagram installation installed integration interaction internet intuitive invitation issue javascript journey language languages latest layout leading learning leave leaving left letter lightweight limits link linked links listen location login long look looking lovely lunch manual march media medical medium memory menu menus message messages microsoft miles millions minute minutes mobile model month months morning moving music native navigation network news night note notes notice november number numbers obvious office offline official online open opened option options ordered organization organise organize original output outside paragraph paragraphs partner password passwords performance personal phone phrase picture pictures pinned platform please plugin polish possible practical prefer preference preferences prepare present previous privacy private product project publish punctuation quick quiet reach reading ready receive recent recommend recommendation reconnect reconnecting recover recovery redirect reduced reference refresh regular relevant reliable remember reminder remove removed repeat replace replaced report request requested reserve response responsive result restore restored retry review right risk romance romantic routine save saved saving schedule search secure security select selected selection sentences september session settings sharing shopping should side sidebar signup similar simple simplify skill small smooth solution solve source space special spelling standard start started state status stay sticky storage store strong structure style successful suggestions summary support supported sure syntax system table tab tabs tag tagalog task technical technology test tested testing text textarea theme themes third thought thoughtful thread time title today tomorrow tonight tool tools translate translated translation travel travel time trash tricky trust tutorial type typing uncle under underline undone undo unique unlock updated upload user users useful utility vacation value verify version video view visitor visible voice warm weather web website welcome window windows word words work working workspace would writing written wrong year yesterday`).split(/\s+/u);
  const commonWords=new Set((
    'the and that this these those what when where which while whether with within without '+
    'note notes writing written writer word words writing correction spell spelling suggestions '+
    'english arabic language languages character characters letter letters title text typed type '+
    'editing editor edit delete enter keyboard number numbers copy paste save saved '+
    'hello world friend friends again because tomorrow today evening morning night '+
    'work house family from your you are were was been have has had their there they '+
    'some something anything available beautiful different important interesting '+
    'please thank thanks welcome good great very better best well now then before after '+
    'right left click button buttons font fonts zoom size small large change changes '+
    'check checklist cloud secure private session synced sync settings clean smooth '+
    'computer mobile phone screen screen keyboard software application application '+
    'في من على الى إلى عن هذا هذه هذين هكذا هو هي نحن أن أنا أنت نعم لا لو لكن '+
    'العربية العربي الانكليزية الإنجليزية اللغة لغات كلمة الكلمات كتابة كتابات '+
    'الكتابة ملاحظة الملاحظة الملاحظات الصحيح تصحيح صحيحة صحيح خطأ أخطاء عند '+
    'هنا هناك هناك الآن اليوم غدا غداً أمس ماذا لماذا كيف وين شنو شلون شكد '+
    'الموقع التطبيق الإعدادات الإختيار الاختيار الحروف الخطوط الخط حجم الشاشة '+
    'مربع مربعات علامة علامات الصح الاختيار خيار الخيارات تلفون تليفون جوال '+
    'الكمبيوتر الحاسوب العربية العراق بغداد الحياة العمل البيت الصديق الوقت '+
    'رسالة الرسالة النص الكلمات كتاب العربية هاي هسه بعد ويا عليها عليها تمام'
  ).split(/\s+/u).filter(Boolean).map(w=>w.toLocaleLowerCase()));
  for(const w of extraWords)commonWords.add(w.toLocaleLowerCase());
  function wordDistance(a,b){
    const row=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      let prev=row[0];row[0]=i;
      for(let j=1;j<=b.length;j++){
        const old=row[j];
        row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));
        prev=old;
      }
    }
    return row[b.length];
  }
  function spellingSuggestions(word){
    if(!word||word.length<3||word.length>30)return [];
    const lower=word.toLocaleLowerCase(),direct=correctionPairs[lower];
    const upperFirst=w=>word[0]===word[0].toUpperCase()&&word[0]!==word[0].toLowerCase()?w[0].toUpperCase()+w.slice(1):w;
    if(direct)return [upperFirst(direct)];
    if(autoFixPairs[lower])return [upperFirst(autoFixPairs[lower])];
    if(commonWords.has(lower))return [];
    const max=lower.length>8?2:1;
    const scored=[];
    for(const candidate of commonWords){
      if(Math.abs(candidate.length-lower.length)>max||candidate[0]!==lower[0])continue;
      const distance=wordDistance(lower,candidate);
      if(distance>0&&distance<=max)scored.push({candidate,distance});
    }
    return scored.sort((a,b)=>a.distance-b.distance||a.candidate.length-b.candidate.length).slice(0,3).map(x=>upperFirst(x.candidate));
  }

  function autoCorrectOnSpace(e,editor){
    if(!autoCorrect||e.inputType!=='insertText'||e.data!==' '||e.isComposing)return;
    const selection=window.getSelection();
    if(!selection?.rangeCount||!selection.isCollapsed||!editor.contains(selection.anchorNode))return;
    const node=selection.anchorNode,offset=selection.anchorOffset;
    if(node?.nodeType!==3)return;
    const left=node.nodeValue.slice(0,offset);
    const match=/([\p{L}][\p{L}\p{M}’'-]{2,})$/u.exec(left);
    if(!match)return;
    const word=match[1],lower=word.toLocaleLowerCase();
    if(word===word.toLocaleUpperCase()||word.includes('@'))return;
    const correction=autoFixPairs[lower];
    if(!correction||correction.toLocaleLowerCase()===lower)return;
    let result=correction;
    if(word[0]===word[0].toUpperCase()&&word[0]!==word[0].toLowerCase())
      result=correction[0].toLocaleUpperCase()+correction.slice(1);
    e.preventDefault();
    const range=document.createRange();
    range.setStart(node,offset-word.length);
    range.setEnd(node,offset);
    selection.removeAllRanges();selection.addRange(range);
    // execCommand preserves native undo history in Chromium and Safari.
    const done=document.execCommand('insertText',false,result+' ');
    if(!done){
      range.deleteContents();
      const inserted=document.createTextNode(result+' ');
      range.insertNode(inserted);
      range.setStartAfter(inserted);range.collapse(true);
      selection.removeAllRanges();selection.addRange(range);
    }
    onEditorInput();
    showToast(word+' → '+result+' · Ctrl+Z to undo');
  }
  function findPointWord(event,editor){
    const selected=window.getSelection();
    let textNode=null,offset=0,range=null,title=editor.id==='note-title';
    if(title){
      const pos=editor.selectionStart??0;
      const text=editor.value;
      const re=/[\p{L}\p{M}][\p{L}\p{M}\p{N}'’-]*/gu;
      for(const match of text.matchAll(re)){
        if(match.index<=pos&&pos<=match.index+match[0].length)
          return {spellWord:match[0],spellStart:match.index,spellEnd:match.index+match[0].length,spellInput:true};
      }
      return {};
    }
    if(selected?.rangeCount&&!selected.isCollapsed&&editor.contains(selected.anchorNode)){
      const rangeSelected=selected.getRangeAt(0);
      const selText=selected.toString().trim();
      if(/^[\p{L}\p{M}'’-]{2,30}$/u.test(selText)){
        return {spellWord:selText,spellRange:rangeSelected.cloneRange(),spellInput:false};
      }
    }
    if(document.caretRangeFromPoint)range=document.caretRangeFromPoint(event.clientX,event.clientY);
    else if(document.caretPositionFromPoint){
      const caret=document.caretPositionFromPoint(event.clientX,event.clientY);
      if(caret){range=document.createRange();range.setStart(caret.offsetNode,caret.offset);range.collapse(true);}
    }
    if(!range||!editor.contains(range.startContainer))return {};
    textNode=range.startContainer;offset=range.startOffset;
    if(textNode.nodeType!==3)return {};
    const value=textNode.nodeValue;
    const re=/[\p{L}\p{M}][\p{L}\p{M}\p{N}'’-]*/gu;
    for(const match of value.matchAll(re)){
      if(match.index<=offset&&offset<=match.index+match[0].length){
        const wordRange=document.createRange();
        wordRange.setStart(textNode,match.index);
        wordRange.setEnd(textNode,match.index+match[0].length);
        return {spellWord:match[0],spellRange:wordRange,spellInput:false};
      }
    }
    return {};
  }
  function applyCorrection(ctx,index){
    const replacement=ctx?.suggestions?.[index];if(!replacement)return;
    if(ctx.spellInput){
      const input=$('note-title');input.focus({preventScroll:true});
      input.setRangeText(replacement,ctx.spellStart,ctx.spellEnd,'end');
      onTitleInput();showToast('Corrected');return;
    }
    const range=ctx.spellRange;
    if(!range||!$('rich-editor').contains(range.startContainer)){showToast('Text changed. Try again.');return;}
    const node=document.createTextNode(replacement);range.deleteContents();range.insertNode(node);
    range.setStartAfter(node);range.collapse(true);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    $('rich-editor').focus({preventScroll:true});savedSelection=range.cloneRange();
    onEditorInput();showToast('Corrected');
  }
  const editorOptions=(hasText,suggestions=[],word='')=>[
    ...(suggestions.length?suggestions.map((text,i)=>({ico:'check',label:'✓ '+text,action:'spell-apply-'+i})):
       word?[{ico:'check',label:'Spelling suggestions · browser',action:'spellcheck-help'}]:[]),
    ...(word?[{divider:true}]:[]),
    ...(hasText?[{ico:'file',label:'Copy',action:'edit-copy'},{ico:'edit',label:'Cut',action:'edit-cut'}]:[]),
    {ico:'file',label:'Paste',action:'edit-paste'},
    {ico:'list',label:'Select all',action:'edit-select-all'},
    {divider:true},
    ...(hasText?[
      {ico:'edit',label:'Replace selection…',action:'edit-replace'},
      {ico:'file',label:'Bold selection',action:'edit-bold'},
      {ico:'file',label:'Italic selection',action:'edit-italic'},
      {divider:true},
      {ico:'arrow',label:'Translate to Arabic ↗',action:'translate-ar'},
      {ico:'arrow',label:'Translate to English ↗',action:'translate-en'}
    ]:[]),
    {ico:'check',label:'Spelling & suggestions',action:'spellcheck-help'},
    {ico:'search',label:'Find in this note',action:'find-note'}
  ];
  function selectFolder(folder){openFolder(folder);}
  function setFilter(next){filter=next;search='';$('search').value='';renderSidebar();closePanels();}
  function folderRename(old,newName){
    if(!newName||['inbox','notes'].includes(newName.toLocaleLowerCase())||state.folders.some(f=>f.toLocaleLowerCase()===newName.toLocaleLowerCase())){showToast('Choose a unique folder name');return;}
    state.folders=state.folders.map(f=>f===old?newName:f);state.foldersUpdatedAt=stamp();
    state.notes.forEach(n=>{if(n.folder===old){n.folder=newName;n.updatedAt=stamp();}});
    if(filter==='folder:'+old)filter='folder:'+newName;
    tabs=tabs.map(id=>id===folderKey(old)?folderKey(newName):id);
    if(activeTab===folderKey(old))activeTab=folderKey(newName);
    if(lastClosedTab===folderKey(old))lastClosedTab=folderKey(newName);
    if(collapsedGroups.delete(old))collapsedGroups.add(newName);
    if(showAllGroups.delete(old))showAllGroups.add(newName);
    persist();saveUi();renderAll();showToast('Folder renamed');
  }
  function removeFolder(folder){
    state.folders=state.folders.filter(f=>f!==folder);state.foldersUpdatedAt=stamp();
    state.notes.forEach(n=>{if(n.folder===folder){n.folder='Inbox';n.updatedAt=stamp();}});
    if(filter==='folder:'+folder)filter='inbox';tabs=tabs.filter(id=>id!==folderKey(folder));if(activeTab===folderKey(folder))activeTab=selected;persist();saveUi();renderAll();showToast('Notes moved to Notes');
  }
  async function runAction(action,context) {
    const n=findNote(context?.id)||current(), folder=context?.folder;
    hideContext();
    if(action.startsWith('spell-apply-')){applyCorrection(context,Number(action.slice(12)));return;}
    switch(action){
      case 'open-note':if(n)openNote(n.id);break;
      case 'open-trash':setFilter('trash');break;
      case 'empty-trash':{
        const pending=state.notes.filter(item=>item.deleted&&!item.purged);
        if(!pending.length){showToast('Trash is already empty');break;}
        const ok=await confirmAction('Empty Trash?','Permanently delete '+pending.length+' notes? You cannot undo this. Consider exporting a backup first.');
        if(!ok)break;
        const now=stamp();
        pending.forEach(item=>{item.purged=true;item.deleted=true;item.html='';item.title='Deleted note';item.starred=false;item.archived=false;item.updatedAt=now;});
        const removed=new Set(pending.map(item=>item.id));
        tabs=tabs.filter(id=>!removed.has(id));
        if(removed.has(selected))selected=visible()[0]?.id||null;
        if(removed.has(activeTab))activeTab=tabs.at(-1)||selected;
        persist();saveUi();renderAll();showToast(pending.length+' notes permanently deleted');
      }break;
      case 'new-note':newNote();break;
      case 'new-folder':$('new-folder').click();break;
      case 'active-folder-new':if(isFolderTab(activeTab))newNote(activeTab.slice(7));break;
      case 'active-folder-rename':if(isFolderTab(activeTab)){
        const old=activeTab.slice(7);
        if(old==='Inbox'){showToast('Inbox cannot be renamed');break;}
        const name=await ask('Rename folder','Folder name',old);
        if(name!==null)folderRename(old,name.trim());
      }break;
      case 'settings':settingsOpen();break;
      case 'close-tab':if(activeTab)closeTab(activeTab);break;
      case 'close-other-tabs':if(activeTab){tabs=[activeTab];saveUi();noteTabs();}break;
      case 'restore-tab':if(lastClosedTab&&tabExists(lastClosedTab)){openTab(lastClosedTab);lastClosedTab=null;saveUi();}break;
      case 'rename-note':if(n){openNote(n.id);$('note-title').focus();$('note-title').select();}break;
      case 'star-note':if(n){n.starred=!n.starred;touchNote(n);showToast(n.starred?'Added to favorites':'Removed from favorites');}break;
      case 'duplicate-note':if(n){const copy={...n,id:uuid(),title:n.title+' copy',updatedAt:stamp(),deleted:false};state.notes.push(copy);persist();openNote(copy.id);showToast('Note duplicated');}break;
      case 'move-note':if(n){const name=await ask('Move note','Folder: '+['Notes',...state.folders].join(' · '),folderLabel(n.folder));if(name===null)return;const chosen=name.trim(),f=['notes','inbox'].includes(chosen.toLocaleLowerCase())?'Inbox':state.folders.find(x=>x.toLocaleLowerCase()===chosen.toLocaleLowerCase());if(!f){showToast('Choose an existing folder');return;}n.folder=f;touchNote(n);renderEditor();}break;
      case 'copy-note-link':if(n){await navigator.clipboard.writeText('[['+n.title+']]');showToast('Note link copied');}break;
      case 'archive-note':if(n){n.archived=!n.archived;touchNote(n);showToast(n.archived?'Archived':'Restored from archive');}break;
      case 'restore-note':if(n){n.deleted=false;n.archived=false;touchNote(n);showToast('Note restored');}break;
      case 'delete-note':if(n){
        if(n.deleted){
          if(!await confirmAction('Permanently delete?','This note cannot be restored.'))return;
          n.purged=true;n.deleted=true;n.html='';n.title='Deleted note';n.updatedAt=stamp();
        }else{n.deleted=true;n.updatedAt=stamp();}
        tabs=tabs.filter(id=>id!==n.id);
        if(selected===n.id)selected=visible()[0]?.id||null;
        if(activeTab===n.id)activeTab=tabs.at(-1)||selected;
        if(activeTab&&!tabs.includes(activeTab))tabs.push(activeTab);
        persist();saveUi();renderAll();showToast('Note removed');
      }break;
      case 'export-note':if(n)exportNote(n);break;
      case 'folder-new':newNote(folder);break;
      case 'folder-open':selectFolder(folder);break;
      case 'folder-rename':{
        const name=await ask('Rename folder','New folder name',folder);
        if(name!==null)folderRename(folder,name.trim());
      }break;
      case 'folder-delete':if(await confirmAction('Delete folder?','Notes in this folder will move to Inbox.'))removeFolder(folder);break;
      case 'focus':toggleFocus();break;
      case 'edit-copy':case 'edit-cut':case 'edit-paste':case 'edit-replace':case 'edit-select-all':case 'edit-bold':case 'edit-italic':case 'translate-ar':case 'translate-en':case 'spellcheck-help':case 'find-note':await runEditAction(action,context);break;
      case 'sync':await syncNow();break;
    }
  }
  async function runEditAction(action,ctx={}){
    const input=ctx.input?$('note-title'):$('rich-editor');
    const restore=()=>{input.focus({preventScroll:true});if(!ctx.input)restoreSelection();else if(Number.isInteger(ctx.start))input.setSelectionRange(ctx.start,ctx.end);};
    const text=ctx.selectionText||'';
    if(action==='spellcheck-help'){
      input.spellcheck=true;
      showToast('Spelling underlines are on. Use Shift + right-click for browser suggestions.');
      return;
    }
    if(action==='find-note'){
      const needle=await ask('Find in note','Text to find',text);if(!needle)return;
      const found=(ctx.input?input.value:input.innerText).toLocaleLowerCase().includes(needle.toLocaleLowerCase());
      showToast(found?'Found in this note':'No matching text');return;
    }
    if(action.startsWith('translate-')){
      if(!text){showToast('Select text to translate first');return;}
      const lang=action==='translate-ar'?'ar':'en';
      window.open('https://translate.google.com/?sl=auto&tl='+lang+'&text='+encodeURIComponent(text),'_blank','noopener,noreferrer');
      return;
    }
    if(action==='edit-copy'||action==='edit-cut'){
      if(!text){showToast('Select some text first');return;}
      try{await navigator.clipboard.writeText(text);}catch(e){showToast('Copy permission unavailable');return;}
      if(action==='edit-cut'){
        restore();if(ctx.input){input.setRangeText('',ctx.start,ctx.end,'start');onTitleInput();}
        else{document.execCommand('delete');onEditorInput();}
      }else showToast('Copied');
      return;
    }
    if(action==='edit-select-all'){
      restore();if(ctx.input)input.select();else{
        const range=document.createRange();range.selectNodeContents(input);
        const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);saveSelection();
      }return;
    }
    if(action==='edit-paste'){
      try{
        const value=await navigator.clipboard.readText();restore();
        if(ctx.input){input.setRangeText(value,ctx.start,ctx.end,'end');onTitleInput();}
        else{document.execCommand('insertText',false,value);onEditorInput();}
      }catch(e){showToast('Allow clipboard access, or use Ctrl+V');}return;
    }
    if(action==='edit-replace'){
      if(!text){showToast('Select text first');return;}
      const value=await ask('Replace selection','Replacement text',text);if(value===null)return;
      restore();if(ctx.input){input.setRangeText(value,ctx.start,ctx.end,'end');onTitleInput();}
      else{document.execCommand('insertText',false,value);onEditorInput();}
      return;
    }
    if(['edit-bold','edit-italic'].includes(action)){
      if(ctx.input){showToast('Formatting is available inside the note body');return;}
      restore();format(action==='edit-bold'?'bold':'italic');
    }
  }
  function exportFile(name,content,type){
    const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportNote(n){
    exportFile((n.title.replace(/[^\p{L}\p{N} _.-]/gu,'')||'note')+'.html',
      '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(n.title)+'</title></head><body><h1>'+esc(n.title)+'</h1>'+safeHtml(n.html)+'</body></html>',
      'text/html;charset=utf-8');showToast('Note exported');
  }
  function exportAll(){exportFile('MXNotes-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(state,null,2),'application/json');showToast('Backup downloaded');}
  async function importAll(file){
    if(!file)return;
    try{
      const obj=normalize(JSON.parse(await file.text()));
      const yes=await confirmAction('Import backup?','This replaces local notes with '+obj.notes.length+' imported notes.');
      if(!yes)return;state=obj;selected=state.notes[0]?.id||null;tabs=selected?[selected]:[];
      persist();saveUi();renderAll();showToast('Backup restored');
    }catch(e){showToast('Backup could not be opened');}
  }
  function toggleFocus(){
    focusMode=!focusMode;document.body.classList.toggle('focus-mode',focusMode);
    $('focus-button').innerHTML=icon(focusMode?'minimize':'maximize');
    if(focusMode)closePanels();
    showToast(focusMode?'Focus mode enabled':'Focus mode disabled');
  }
  function makeSavedStatus(message){cloudStatus=message;updateCloudUI();}
  function updateCloudUI(){
    const confirmed=lastConfirmed&&ownerActive&&lastConfirmed.owner===true;
    $('sync-text').textContent=cloudStatus;
    $('sync-time').textContent=confirmed&&cloudStatus==='Saved to cloud'?'· '+timeAgo(lastConfirmed.at):'';
    $('sidebar-status').textContent=cloudStatus;
    $('sync-connection').textContent=ownerActive?(cloudStatus==='Saved to cloud'?'Connected · verified':cloudStatus):cloudReady?'Sign-in required':'Not configured';
    $('last-sync-confirmed').textContent=confirmed?new Date(lastConfirmed.at).toLocaleString():'Never verified';
    $('sync-now').disabled=syncing;$('sign-in').hidden=ownerActive;$('sign-out').hidden=!ownerActive;
    $('cloud-login-fields').hidden=ownerActive;
  }
  async function api(url,options={}){
    const response=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});
    const data=await response.json().catch(()=>({error:'Unexpected server response'}));
    if(!response.ok)throw Object.assign(new Error(data.error||('HTTP '+response.status)),{status:response.status,remote:data});
    return data;
  }
  async function checkSession(){
    try{
      const result=await api('/api/session');
      cloudReady=!!result.configured;ownerActive=!!result.authenticated;
      if(!cloudReady)makeSavedStatus('Saved locally · Cloud not configured');
      else if(ownerActive){makeSavedStatus('Connecting…');await pullCloud();}
      else makeSavedStatus('Saved locally · Unlock cloud');
    }catch(e){cloudReady=false;ownerActive=false;makeSavedStatus('Saved locally · Cloud unavailable');}
    updateCloudUI();
  }
  async function unlock(){
    const password=$('owner-password').value;
    if(!password){$('auth-feedback').textContent='Enter your owner password.';return;}
    $('sign-in').disabled=true;$('auth-feedback').textContent='Unlocking private vault…';
    try{
      const data=await api('/api/session',{method:'POST',body:JSON.stringify({password})});
      ownerActive=!!data.authenticated;cloudReady=true;$('owner-password').value='';
      const ok=await pullCloud();
      if(ok){$('settings-modal').close();showToast('Private cloud connected');}
      else $('auth-feedback').textContent='Unlocked, but database sync could not be confirmed.';
    }catch(e){$('auth-feedback').textContent=e.message;showToast('Cloud login failed');}
    finally{$('sign-in').disabled=false;updateCloudUI();}
  }
  async function signOut(){
    clearTimeout(syncTimer);clearTimeout(maxSyncTimer);maxSyncTimer=null;
    try{await api('/api/session',{method:'DELETE'});}catch(e){}
    ownerActive=false;revision=0;lastConfirmed=null;localStorage.removeItem(VERIFIED);
    makeSavedStatus('Saved locally · Signed out');showToast('Cloud locked');
  }
  function mergeWorkspaces(local,remote){
    if(!remote||!Array.isArray(remote.notes))return normalize(local);
    const r=normalize(remote),merged=new Map();
    for(const n of r.notes)merged.set(n.id,n);
    for(const n of local.notes){
      const found=merged.get(n.id);
      if(!found || Date.parse(n.updatedAt)>=Date.parse(found.updatedAt))merged.set(n.id,n);
    }
    const folders=Date.parse(local.foldersUpdatedAt)>=Date.parse(r.foldersUpdatedAt)?local.folders:r.folders;
    const foldersUpdatedAt=Date.parse(local.foldersUpdatedAt)>=Date.parse(r.foldersUpdatedAt)?local.foldersUpdatedAt:r.foldersUpdatedAt;
    return {version:3,notes:[...merged.values()],folders,foldersUpdatedAt,updatedAt:
      Date.parse(local.updatedAt)>Date.parse(r.updatedAt)?local.updatedAt:r.updatedAt};
  }
  function scheduleSync(){
    if(!ownerActive){makeSavedStatus('Saved locally · Unlock cloud');return;}
    makeSavedStatus('Saving…');clearTimeout(syncTimer);
    // Debounce ordinary keystrokes; bound delay also saves during uninterrupted typing.
    syncTimer=setTimeout(()=>pushCloud(),SWAP_DELAY);
    if(!maxSyncTimer)maxSyncTimer=setTimeout(()=>{
      maxSyncTimer=null;clearTimeout(syncTimer);pushCloud();
    },6500);
  }
  async function pushCloud(){
    if(!ownerActive)return false;
    if(syncing){requestedSync=true;return false;}
    syncing=true;clearTimeout(syncTimer);clearTimeout(maxSyncTimer);maxSyncTimer=null;makeSavedStatus('Syncing…');let ok=false;
    try{
      for(let attempt=0;attempt<3;attempt++){
        const remote=await api('/api/vault');
        revision=remote.revision||0;
        const snapshot=mergeWorkspaces(state,remote.workspace);
        const payload={revision,workspace:snapshot};
        try{
          const uploaded=await api('/api/vault',{method:'PUT',body:JSON.stringify(payload)});
          const verified=await api('/api/vault');
          if(verified.revision!==uploaded.revision || JSON.stringify(verified.workspace)!==JSON.stringify(snapshot))
            throw Error('Cloud read-back did not match the saved workspace');
          const changedWhileSaving=state.updatedAt!==snapshot.updatedAt;
          state=mergeWorkspaces(state,snapshot);
          try{localStorage.setItem(STORE,JSON.stringify(state));}catch(e){}
          revision=uploaded.revision;
          dirty=changedWhileSaving;
          lastConfirmed={owner:true,at:stamp(),revision};
          localStorage.setItem(VERIFIED,JSON.stringify(lastConfirmed));
          makeSavedStatus(dirty?'Saving…':'Saved to cloud');ok=true;
          if(!isEditing)renderAll();break;
        }catch(e){if(e.status!==409||attempt===2)throw e;}
      }
    }catch(e){
      makeSavedStatus('Offline · saved locally');
      console.warn('Cloud sync not verified',e);
    }finally{
      syncing=false;
      if(requestedSync || (ok&&dirty)){requestedSync=false;scheduleSync();}
      updateCloudUI();
    }
    return ok;
  }
  async function pullCloud(){
    if(!ownerActive)return false;
    if(dirty)return pushCloud();
    if(syncing){requestedSync=true;return false;}
    syncing=true;makeSavedStatus('Checking cloud…');
    try{
      const response=await api('/api/vault');
      revision=response.revision||0;
      if(response.workspace){
        const merged=pristine?normalize(response.workspace):mergeWorkspaces(state,response.workspace);
        if(JSON.stringify(merged.notes)!==JSON.stringify(state.notes)||JSON.stringify(merged.folders)!==JSON.stringify(state.folders)){
          state=merged;pristine=false;localStorage.setItem(STORE,JSON.stringify(state));
          if(!isEditing)renderAll();
          dirty=JSON.stringify(merged)!==JSON.stringify(response.workspace);
        }
      }else dirty=true;
      if(!dirty){
        lastConfirmed={owner:true,at:stamp(),revision};
        localStorage.setItem(VERIFIED,JSON.stringify(lastConfirmed));
      }
      makeSavedStatus(dirty?'Saving…':'Saved to cloud');
      return true;
    }catch(e){makeSavedStatus('Offline · saved locally');console.warn(e);return false;}
    finally{
      syncing=false;if(dirty||requestedSync){requestedSync=false;scheduleSync();}
      updateCloudUI();
    }
  }
  async function syncNow(){
    if(!ownerActive){settingsOpen();$('auth-feedback').textContent='Unlock your private vault to sync.';return;}
    clearTimeout(syncTimer);
    const ok=dirty?await pushCloud():await pullCloud();
    $('auth-feedback').textContent=ok?'Cloud checked successfully.':'Cloud not verified. Your notes are saved on this device.';
    showToast(ok?'Cloud sync complete':'Saved locally · Cloud unavailable');
  }
  function settingsOpen(){
    closePanels();$('auth-feedback').textContent='';
    updateCloudUI();$('settings-modal').showModal();
  }
  function bindDelegation(){
    $('quick-links').addEventListener('click',e=>{
      const b=e.target.closest('[data-filter]');if(b){if(b.dataset.filter==='inbox')openFolder('Inbox');else setFilter(b.dataset.filter);}
    });
    $('folder-list').addEventListener('click',async e=>{
      if(Date.now()<skipClickUntil)return;
      const rename=e.target.closest('[data-rename-folder]');
      if(rename){
        const folder=rename.dataset.renameFolder;
        const result=await ask('Rename folder','Folder name',folder);
        if(result!==null)folderRename(folder,result.trim());return;
      }
      const b=e.target.closest('[data-folder]');if(b)openFolder(b.dataset.folder);
    });
    $('folder-view').addEventListener('click',e=>{
      const card=e.target.closest('[data-folder-note]');
      if(card){openNote(card.dataset.folderNote);return;}
      const add=e.target.closest('[data-new-in-folder]');
      if(add)newNote(add.dataset.newInFolder);
    });
    $('note-list').addEventListener('click',e=>{
      if(Date.now()<skipClickUntil)return;
      const group=e.target.closest('[data-group-toggle]');
      if(group){const name=group.dataset.groupToggle;
        if(collapsedGroups.has(name))collapsedGroups.delete(name);else collapsedGroups.add(name);
        saveUi();renderSidebar();return;
      }
      const showAll=e.target.closest('[data-show-group]');
      if(showAll){const folder=showAll.dataset.showGroup;
        if(showAllGroups.has(folder))showAllGroups.delete(folder);else showAllGroups.add(folder);
        saveUi();renderSidebar();return;
      }
      const b=e.target.closest('[data-note-id]');if(b)openNote(b.dataset.noteId);
    });
    $('toggle-notes-list').addEventListener('click',()=>{
      notesCollapsed=!notesCollapsed;saveUi();renderSidebar();
    });
    $('open-tabs').addEventListener('click',e=>{
      const close=e.target.closest('[data-close-tab]');if(close){closeTab(close.dataset.closeTab);return;}
      const tab=e.target.closest('[data-tab]');if(tab)openTab(tab.dataset.tab);
    });
    // A custom in-app context menu replaces the browser menu throughout the workspace.
    // Shift + right-click remains available for native browser spelling suggestions.
    document.addEventListener('contextmenu',e=>{
      if(e.shiftKey)return;
      if(e.target.closest('.modal,.menu-popover,.style-popover'))return;
      if(!e.target.closest('.app-shell'))return;
      e.preventDefault();
      const folder=e.target.closest('[data-folder],[data-rename-folder]');
      const trash=e.target.closest('[data-filter="trash"]');
      const editor=e.target.closest('#rich-editor,#note-title');
      const note=editor?null:e.target.closest('[data-note-id],[data-tab],[data-folder-note]');
      if(trash){showMenu(e.clientX,e.clientY,trashOptions(),{});return;}
      if(folder){const name=folder.dataset.folder||folder.dataset.renameFolder;
        showMenu(e.clientX,e.clientY,folderOptions(name),{folder:name});return;}
      if(note){const id=note.dataset.noteId||note.dataset.tab||note.dataset.folderNote;
        if(isFolderTab(id)){showMenu(e.clientX,e.clientY,folderOptions(id.slice(7)),{folder:id.slice(7)});return;}
        const n=findNote(id);if(n)showMenu(e.clientX,e.clientY,noteOptions(n),{id});return;}
      if(editor){
        const input=editor.id==='note-title',start=input?editor.selectionStart:null,end=input?editor.selectionEnd:null;
        if(!input)saveSelection();
        const sel=window.getSelection(),hasRange=!!(sel?.rangeCount&&editor.contains(sel.anchorNode)&&editor.contains(sel.focusNode));
        const selectionText=input?editor.value.slice(start,end):(hasRange?sel.toString():'');
        const point=findPointWord(e,editor);
        const suggestions=spellingSuggestions(point.spellWord||'');
        showMenu(e.clientX,e.clientY,editorOptions(!!selectionText,suggestions,point.spellWord||''),{id:selected,input,start,end,selectionText,...point,suggestions});return;
      }
      if(e.target.closest('.desktop-tabbar')){showMenu(e.clientX,e.clientY,tabBlankOptions(),{id:selected});return;}
      showMenu(e.clientX,e.clientY,appOptions(),{id:selected});
    });
    const pressStart=e=>{
      if(e.pointerType==='mouse')return;
      const target=e.target.closest('[data-folder],[data-note-id],[data-tab],[data-filter="trash"]');
      if(!target)return;
      clearTimeout(longTimer);
      longTimer=setTimeout(()=>{
        if(target.dataset.filter==='trash')showMenu(e.clientX,e.clientY,trashOptions(),{});
        else if(target.dataset.folder)showMenu(e.clientX,e.clientY,folderOptions(target.dataset.folder),{folder:target.dataset.folder});
        else if(target.dataset.noteId||target.dataset.tab){
          const id=target.dataset.noteId||target.dataset.tab,n=findNote(id);
          if(isFolderTab(id))showMenu(e.clientX,e.clientY,folderOptions(id.slice(7)),{folder:id.slice(7)});
          else if(n)showMenu(e.clientX,e.clientY,noteOptions(n),{id});
        }
        skipClickUntil=Date.now()+650;navigator.vibrate?.(12);
      },520);
    };
    document.addEventListener('pointerdown',pressStart);
    ['pointerup','pointercancel','pointermove','scroll'].forEach(type=>document.addEventListener(type,()=>clearTimeout(longTimer),{passive:true}));
    $('context-menu').addEventListener('click',e=>{
      const b=e.target.closest('[data-menu-action]');if(b)runAction(b.dataset.menuAction,menuContext);
    });
    document.addEventListener('pointerdown',e=>{
      if(!e.target.closest('#context-menu')&&!e.target.closest('#more-button'))hideContext();
      if(!e.target.closest('#style-menu')&&!e.target.closest('#style-picker'))$('style-menu').hidden=true;
      if(!e.target.closest('#paint-menu,#text-color-picker,#highlight-picker'))hidePaintMenu();
    });
  }
  function bindRichText(){
    const editor=$('rich-editor');
    editor.addEventListener('beforeinput',e=>autoCorrectOnSpace(e,editor));
    editor.addEventListener('input',onEditorInput);
    editor.addEventListener('focus',()=>{isEditing=true;document.body.classList.add('editing');});
    editor.addEventListener('blur',()=>{isEditing=false;document.body.classList.remove('editing');commitEditor();});
    editor.addEventListener('paste',e=>{
      // Paste as plain text; rich formatting must be intentionally applied.
      e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));onEditorInput();
    });
    // Pointer events are the reliable activation path on desktop and touch.
    // Stop the contenteditable caret jumping onto a non-editable checkbox.
    let lastCheckboxPointer=null,lastCheckboxPointerTime=0;
    editor.addEventListener('pointerdown',e=>{
      if(e.target.closest('[data-checkbox]'))e.preventDefault();
    });
    editor.addEventListener('pointerup',e=>{
      const box=e.target.closest('[data-checkbox]');
      if(box){
        e.preventDefault();
        lastCheckboxPointer=box;lastCheckboxPointerTime=Date.now();
        toggleCheckbox(box);
      }
    });
    editor.addEventListener('keydown',e=>{
      if(e.target.closest('[data-checkbox]')){
        if(e.key===' '||e.key==='Enter'){e.preventDefault();toggleCheckbox(e.target.closest('[data-checkbox]'));}
        return;
      }
      checklistEnter(e);
    });
    editor.addEventListener('click',e=>{
      const checkbox=e.target.closest('[data-checkbox]');
      if(checkbox){
        e.preventDefault();e.stopPropagation();
        if(checkbox!==lastCheckboxPointer||Date.now()-lastCheckboxPointerTime>550)toggleCheckbox(checkbox);
        return;
      }
      const link=e.target.closest('a[data-note-id]');
      if(link && (e.metaKey||e.ctrlKey)){openNote(link.dataset.noteId);}
    });
    document.addEventListener('selectionchange',saveSelection);
    document.querySelectorAll('[data-command]').forEach(button=>{
      button.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')e.preventDefault();saveSelection();});
      button.addEventListener('click',()=>format(button.dataset.command));
    });
    $('style-picker').addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')e.preventDefault();saveSelection();});
    $('style-picker').addEventListener('click',()=>{
      hidePaintMenu();
      const r=$('style-picker').getBoundingClientRect(),el=$('style-menu');
      el.hidden=!el.hidden;el.style.left=Math.max(8,Math.min(r.left,innerWidth-185))+'px';
      el.style.top=Math.min(r.top-194,innerHeight-230)+'px';
    });
    $('style-menu').addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')e.preventDefault();});
    $('style-menu').addEventListener('click',e=>{
      const b=e.target.closest('[data-style]');if(!b)return;
      $('style-menu').hidden=true;format('style',b.dataset.style);
    });
    [['text-color-picker','ink'],['highlight-picker','mark']].forEach(([id,kind])=>{
      const button=$(id);
      button.addEventListener('pointerdown',e=>{
        if(e.pointerType!=='touch')e.preventDefault();
        saveSelection();
      });
      button.addEventListener('click',()=>openPaintMenu(kind,button));
    });
    $('paint-menu').addEventListener('pointerdown',e=>{
      if(e.pointerType!=='touch')e.preventDefault();
    });
    $('paint-menu').addEventListener('click',e=>{
      const swatch=e.target.closest('[data-paint-index]'),clear=e.target.closest('[data-paint-clear]');
      if(!swatch&&!clear)return;
      const kind=$('paint-menu').dataset.kind;
      if(kind==='ink'&&swatch)format('foreColor',textColors[Number(swatch.dataset.paintIndex)]);
      if(kind==='mark')format('hiliteColor',clear?'transparent':markerColors[Number(swatch.dataset.paintIndex)]);
      hidePaintMenu();
    });
  }
  function init(){
    applyTheme();renderAll();
    bindDelegation();bindRichText();
    $('new-note').addEventListener('click',()=>newNote());
    $('tab-new').addEventListener('click',()=>newNote());
    $('mobile-new').addEventListener('click',()=>newNote());
    $('new-folder').addEventListener('click',async()=>{
      const name=await ask('New folder','Folder name');
      if(!name?.trim())return;
      const f=name.trim().slice(0,90);
      if(['notes','inbox'].includes(f.toLocaleLowerCase())||state.folders.some(x=>x.toLocaleLowerCase()===f.toLocaleLowerCase())){showToast('That folder already exists');return;}
      state.folders.push(f);state.foldersUpdatedAt=stamp();persist();selectFolder(f);
    });
    $('search').addEventListener('input',e=>{search=e.target.value;renderSidebar();});
    $('note-title').addEventListener('input',onTitleInput);
    $('open-sidebar').addEventListener('click',()=>openSidebar());
    $('mobile-title').addEventListener('click',()=>openSidebar());
    $('close-sidebar').addEventListener('click',closePanels);
    $('overlay').addEventListener('click',closePanels);
    $('more-button').addEventListener('click',e=>{
      const r=$('more-button').getBoundingClientRect();
      showMenu(r.right-240,r.bottom+7,appOptions(),{id:selected});
    });
    $('rail-notes').addEventListener('click',()=>{setFilter('all');openSidebar();});
    $('rail-star').addEventListener('click',()=>{setFilter('star');openSidebar();});
    document.querySelectorAll('[data-mobile]').forEach(b=>b.addEventListener('click',()=>{
      const action=b.dataset.mobile;
      if(action==='notes')openSidebar();
      else if(action==='star'){setFilter('star');openSidebar();}
      else if(action==='search')openSidebar(true);
      else if(action==='settings')settingsOpen();
    }));
    $('focus-button').addEventListener('click',toggleFocus);
    $('theme-toggle').addEventListener('click',toggleTheme);
    $('settings-theme-toggle').addEventListener('click',toggleTheme);
    $('writing-font').addEventListener('change',e=>{writingFont=fontChoices.includes(e.target.value)?e.target.value:'system';localStorage.setItem(FONT,writingFont);applyTheme();showToast('Font updated');});
    $('font-size-down').addEventListener('click',()=>changeFontSize(-1));
    $('font-size-up').addEventListener('click',()=>changeFontSize(1));
    $('auto-correct').addEventListener('change',e=>{autoCorrect=e.target.checked;localStorage.setItem(AUTOCORRECT,autoCorrect?'on':'off');showToast(autoCorrect?'Auto-correct on':'Auto-correct off');});
    $('cloud-button').addEventListener('click',settingsOpen);
    $('sidebar-cloud').addEventListener('click',settingsOpen);
    $('settings-close').addEventListener('click',()=>$('settings-modal').close());
    $('sign-in').addEventListener('click',unlock);
    $('sign-out').addEventListener('click',signOut);
    $('sync-now').addEventListener('click',syncNow);
    $('export-all').addEventListener('click',exportAll);
    $('import-all').addEventListener('click',()=>$('import-file').click());
    $('import-file').addEventListener('change',e=>importAll(e.target.files?.[0]));
    $('action-ok').addEventListener('click',()=>finishAsk(true));
    $('action-cancel').addEventListener('click',()=>finishAsk(false));
    $('action-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finishAsk(true);}});
    $('confirm-ok').addEventListener('click',()=>finishConfirm(true));
    $('confirm-cancel').addEventListener('click',()=>finishConfirm(false));
    $('action-dialog').addEventListener('cancel',e=>{e.preventDefault();finishAsk(false);});
    $('confirm-dialog').addEventListener('cancel',e=>{e.preventDefault();finishConfirm(false);});
    document.addEventListener('keydown',e=>{
      const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
      if(e.key==='Escape')hidePaintMenu();
      if(mod&&k==='n'){e.preventDefault();newNote();}
      if(mod&&k==='k'){e.preventDefault();openSidebar(true);}
      if(mod&&k==='s'){e.preventDefault();commitEditor();scheduleSync();showToast('Saved locally');}
      if(mod&&e.shiftKey&&k==='l'){e.preventDefault();toggleTheme();}
      if(e.key==='Escape'){closePanels();if(focusMode)toggleFocus();}
    });
    window.addEventListener('focus',()=>{if(ownerActive&&!dirty&&!isEditing)pullCloud();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ownerActive&&!dirty&&!isEditing)pullCloud();});
    setInterval(()=>{if(ownerActive&&!document.hidden&&!isEditing){if(dirty)pushCloud();else pullCloud();}},12000);
    setInterval(()=>{if(current())updateSummary();updateCloudUI();},30000);
    checkSession();
  }
  init();
})();