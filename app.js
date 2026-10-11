/* MX Notes — local-first rich-text workspace, Cloudflare D1 owner sync. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const icon=name=>'<svg aria-hidden="true"><use href="#i-'+name+'"/></svg>';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uuid=()=>crypto?.randomUUID?.()||'note-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const stamp=()=>new Date().toISOString();
  const STORE='mxnotes.workspace.v1',VIEW='mxnotes.ui.v3',THEME='mxnotes.appearance.theme',FONT='mxnotes.appearance.font',VERIFIED='mxnotes.d1.lastVerified';
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
  const allowed=new Set(['DIV','P','BR','B','STRONG','I','EM','U','S','H1','H2','H3','UL','OL','LI','BLOCKQUOTE','A','SPAN','CODE','HR']);
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
      if(t==='span'&&['0','1'].includes(node.getAttribute('data-checkbox')))
        attrs=' data-checkbox="'+node.getAttribute('data-checkbox')+'" contenteditable="false"';
      return '<'+t+attrs+'>'+children+'</'+t+'>';
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
        starred:!!n.starred,archived:!!n.archived,deleted:!!n.deleted
      }))
    };
  }
  let state;
  let pristine=!localStorage.getItem(STORE);
  try{state=localStorage.getItem(STORE)?normalize(JSON.parse(localStorage.getItem(STORE))):normalize(seeded());}
  catch(e){console.warn('Local notes backup issue',e);state=normalize(seeded());}
  let ui;
  try{ui=JSON.parse(localStorage.getItem(VIEW)||'{}')||{};}catch(e){ui={};}
  let tabs=(Array.isArray(ui.tabs)?ui.tabs:[]).filter(id=>state.notes.some(n=>n.id===id));
  let selected=state.notes.some(n=>n.id===ui.selected)?ui.selected:(state.notes.find(n=>!n.deleted&&!n.archived)||state.notes[0])?.id||null;
  if(selected&&!tabs.includes(selected))tabs.push(selected);
  let filter='all',search='',theme=localStorage.getItem(THEME)==='light'?'light':'dark';
  let focusMode=false,isEditing=false,cloudReady=false,ownerActive=false;
  let notesCollapsed=!!ui.notesCollapsed,collapsedGroups=new Set(Array.isArray(ui.collapsedGroups)?ui.collapsedGroups:[]),expandedNotes=new Set(Array.isArray(ui.expandedNotes)?ui.expandedNotes:[]);
  let lastClosedTab=typeof ui.lastClosedTab==='string'?ui.lastClosedTab:null;
  let writingFont=['system','obsidian','reading'].includes(localStorage.getItem(FONT))?localStorage.getItem(FONT):'system';
  let cloudStatus='Saved on this device',syncTimer=null,maxSyncTimer=null,syncing=false,requestedSync=false,dirty=false,revision=0,lastConfirmed=null;
  try{lastConfirmed=JSON.parse(localStorage.getItem(VERIFIED)||'null');}catch(e){}
  let pendingDialog=null,savedSelection=null,menuContext=null,toastTimer=null,longTimer=null,uiRenderTimer=null,skipClickUntil=0;
  const current=()=>state.notes.find(n=>n.id===selected)||null;
  const visible=()=>state.notes.filter(n=>!n.deleted&&!n.archived);
  const findNote=id=>state.notes.find(n=>n.id===id);
  const timeAgo=date=>{
    const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(date||stamp()))/1000));
    if(seconds<45)return 'just now';if(seconds<3600)return Math.floor(seconds/60)+'m ago';
    if(seconds<86400)return Math.floor(seconds/3600)+'h ago';return new Date(date).toLocaleDateString();
  };
  const plain=html=>{const d=document.createElement('div');d.innerHTML=safeHtml(html);return d.innerText||d.textContent||'';};
  const linkIds=n=>n?[...new Set(Array.from((()=>{const div=document.createElement('div');div.innerHTML=safeHtml(n.html);return div;})().querySelectorAll('a[data-note-id]')).map(a=>a.dataset.noteId).filter(id=>findNote(id)&&!findNote(id).deleted))]:[];
  const backlinks=n=>n?visible().filter(other=>other.id!==n.id&&linkIds(other).includes(n.id)):[];
  function saveUi(){localStorage.setItem(VIEW,JSON.stringify({tabs,selected,notesCollapsed,collapsedGroups:[...collapsedGroups],expandedNotes:[...expandedNotes],lastClosedTab}));}
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
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.content=theme==='light'?'#f8fafb':'#101214';
  }
  function toggleTheme(){theme=theme==='dark'?'light':'dark';localStorage.setItem(THEME,theme);applyTheme();showToast(theme==='dark'?'Dark mode':'Light mode');}
  function noteTabs(){
    const wrapper=$('open-tabs');
    wrapper.innerHTML=tabs.map(id=>{
      const n=findNote(id);if(!n)return'';
      return '<div class="note-tab '+(id===selected?'active':'')+'" role="tab" aria-selected="'+(id===selected)+'" data-tab="'+esc(id)+'">'+icon('file')+
        '<span class="note-tab-title">'+esc(n.title)+'</span><button class="tab-close" data-close-tab="'+esc(id)+'" title="Close tab" aria-label="Close '+esc(n.title)+'">'+icon('x')+'</button></div>';
    }).join('');
    wrapper.querySelector('.note-tab.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function openNote(id){
    if(!findNote(id))return;
    if(isEditing)commitEditor();
    selected=id;if(!tabs.includes(id))tabs.push(id);
    saveUi();renderAll();closePanels();
  }
  function closeTab(id){
    const i=tabs.indexOf(id);if(i<0)return;
    lastClosedTab=id;tabs.splice(i,1);
    if(selected===id)selected=tabs[Math.min(i,tabs.length-1)]||visible()[0]?.id||null;
    if(selected&&!tabs.includes(selected))tabs.push(selected);
    saveUi();renderAll();
  }
  function newNote(folder=filter.startsWith('folder:')?filter.slice(7):'Personal'){
    commitEditor();
    const n={id:uuid(),title:'Untitled',folder,html:'',updatedAt:stamp(),starred:false,archived:false,deleted:false};
    state.notes.push(n);selected=n.id;tabs.push(n.id);filter='all';search='';$('search').value='';
    persist();saveUi();renderAll();closePanels();$('note-title').focus();$('note-title').select();
  }
  function touchNote(n){n.updatedAt=stamp();persist();renderSidebar();noteTabs();updateSummary();}
  function closePanels(){
    $('sidebar').classList.remove('open');$('overlay').hidden=true;
    hideContext();$('style-menu').hidden=true;
  }
  function openSidebar(searchFocus=false){
    if(innerWidth<761){$('sidebar').classList.add('open');$('overlay').hidden=false;}
    if(searchFocus)setTimeout(()=>$('search').focus(),60);
  }
  function renderSidebar(){
    const folders=state.folders,live=visible();
    const quick=[['inbox','Inbox','folder',live.filter(n=>n.folder==='Inbox').length],
      ['today','Today','calendar',live.filter(n=>new Date(n.updatedAt).toDateString()===new Date().toDateString()).length],
      ['star','Starred','star',live.filter(n=>n.starred).length],
      ['all','All notes','file',live.length],['trash','Trash','trash',state.notes.filter(n=>n.deleted).length],
      ['archive','Archive','archive',state.notes.filter(n=>n.archived&&!n.deleted).length]];
    $('quick-links').innerHTML=quick.map(([id,title,ico,count])=>'<button class="quick-link '+(filter===id?'active':'')+'" data-filter="'+id+'">'+icon(ico)+
      '<span>'+esc(title)+'</span>'+(count?'<span class="count">'+count+'</span>':'')+'</button>').join('');
    $('folder-list').innerHTML=folders.map(f=>'<button class="folder-item '+(filter==='folder:'+f?'active':'')+'" data-folder="'+esc(f)+'" title="Right-click for folder options">'+icon('folder')+'<span class="folder-name" dir="auto">'+esc(f)+'</span><span class="count">'+live.filter(n=>n.folder===f).length+'</span></button>').join('');
    let notes=filter==='trash'?state.notes.filter(n=>n.deleted):filter==='archive'?state.notes.filter(n=>n.archived&&!n.deleted):live;
    if(filter==='star')notes=notes.filter(n=>n.starred);
    if(filter==='today')notes=notes.filter(n=>new Date(n.updatedAt).toDateString()===new Date().toDateString());
    if(filter==='inbox')notes=notes.filter(n=>n.folder==='Inbox');
    if(filter.startsWith('folder:'))notes=notes.filter(n=>n.folder===filter.slice(7));
    if(search.trim()){
      const q=search.toLocaleLowerCase();
      notes=state.notes.filter(n=>!n.deleted&&(n.title+' '+plain(n.html)).toLocaleLowerCase().includes(q));
    }
    notes.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
    $('notes-total').textContent=notes.length;
    $('toggle-notes-list').setAttribute('aria-expanded',String(!notesCollapsed));
    $('toggle-notes-list').classList.toggle('collapsed',notesCollapsed);
    if(notesCollapsed){$('note-list').innerHTML='';return;}
    const renderNote=n=>'<div class="note-row"><div class="note-row-top"><button class="note-item '+(n.id===selected?'active':'')+'" data-note-id="'+esc(n.id)+'" title="Open note · right-click for actions">'+icon('file')+
      '<span class="note-name" dir="auto">'+esc(n.title)+'</span>'+(n.starred?'<span class="note-star">★</span>':'')+'</button>'+
      '<button class="note-expand '+(expandedNotes.has(n.id)?'expanded':'')+'" data-expand-note="'+esc(n.id)+'" aria-label="'+(expandedNotes.has(n.id)?'Collapse':'Expand')+' preview" title="Expand / collapse preview">'+icon('chevron')+'</button></div>'+
      (expandedNotes.has(n.id)?'<div class="note-preview" dir="auto">'+esc(plain(n.html).trim().slice(0,260)||'Empty note')+'</div>':'')+'</div>';
    const groupMap=new Map();
    for(const n of notes){const folder=n.folder||'Inbox';if(!groupMap.has(folder))groupMap.set(folder,[]);groupMap.get(folder).push(n);}
    const ordered=[...groupMap.entries()].sort((a,b)=>{
      const ai=['Inbox',...folders].indexOf(a[0]),bi=['Inbox',...folders].indexOf(b[0]);
      return (ai<0?999:ai)-(bi<0?999:bi);
    });
    $('note-list').innerHTML=ordered.length?ordered.map(([folder,items])=>{
      const folded=collapsedGroups.has(folder);
      return '<section class="note-group"><button class="note-group-toggle '+(folded?'collapsed':'')+'" data-group-toggle="'+esc(folder)+'" aria-expanded="'+(!folded)+'">'+icon('chevron')+
        '<span dir="auto">'+esc(folder)+'</span><span class="count">'+items.length+'</span></button>'+
        (folded?'':'<div class="note-group-items">'+items.map(renderNote).join('')+'</div>')+'</section>';
    }).join(''):'<div class="empty-state">No notes here yet.<br>Press + to begin.</div>';
  }
  function updateSummary(){
    const n=current();if(!n){$('word-count').textContent='0 words';$('character-count').textContent='0 characters';return;}
    const text=plain(n.html).trim(),words=text?text.split(/\s+/u).length:0;
    $('word-count').textContent=words.toLocaleString()+' words';
    $('character-count').textContent=text.length.toLocaleString()+' characters';
    $('note-updated').textContent='Edited '+timeAgo(n.updatedAt);
  }
  function renderEditor(){
    const n=current();
    $('note-title').disabled=!n;
    $('rich-editor').contentEditable=n?'true':'false';
    $('note-title').value=n?.title||'';
    $('rich-editor').innerHTML=n?.html||'';
    $('mobile-title').innerHTML=esc(n?.title||'All notes')+' '+icon('chevron');
    $('breadcrumb').innerHTML=n?esc(n.folder)+' <span> / </span> '+esc(n.title):'Your notes';
    $('editor-eyebrow').textContent=n?('YOUR NOTES  —  '+n.folder.toUpperCase()):'YOUR WORKSPACE';
    updateSummary();
    $('editor-scroll').scrollTop=0;
  }
  function renderAll(){renderSidebar();noteTabs();renderEditor();updateCloudUI();}
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
    $('breadcrumb').innerHTML=esc(n.folder)+' <span> / </span> '+esc(n.title);
  }
  function saveSelection(){
    const sel=window.getSelection();
    if(sel?.rangeCount && $('rich-editor').contains(sel.anchorNode))savedSelection=sel.getRangeAt(0).cloneRange();
  }
  function restoreSelection(){
    if(!savedSelection)return;
    try{const sel=window.getSelection();sel.removeAllRanges();sel.addRange(savedSelection);}catch(e){}
  }
  function format(cmd,val=null){
    const editor=$('rich-editor');
    editor.focus({preventScroll:true});restoreSelection();
    if(cmd==='checklist'){
      document.execCommand('insertHTML',false,'<p data-checklist="1"><span data-checkbox="0" contenteditable="false">☐</span>&nbsp;</p>');
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
  const folderOptions=folder=>[
    {ico:'plus',label:'New note here',action:'folder-new'},
    {ico:'edit',label:'Rename folder',action:'folder-rename'},
    {ico:'folder',label:'Open folder',action:'folder-open'},
    {divider:true},
    {ico:'trash',label:'Delete folder',action:'folder-delete',danger:true}
  ];
  const appOptions=()=>[
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
    ...(lastClosedTab&&findNote(lastClosedTab)?[{ico:'refresh',label:'Reopen closed tab',action:'restore-tab'}]:[]),
    {ico:'file',label:'Close active tab',action:'close-tab'},
    {ico:'x',label:'Close other tabs',action:'close-other-tabs'},
    {divider:true},
    {ico:'folder',label:'New folder',action:'new-folder'},
    {ico:'palette',label:'Appearance & settings',action:'settings'}
  ];
  const editorOptions=hasText=>[
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
  function selectFolder(folder){filter='folder:'+folder;search='';$('search').value='';renderSidebar();closePanels();}
  function setFilter(next){filter=next;search='';$('search').value='';renderSidebar();closePanels();}
  function folderRename(old,newName){
    if(!newName||newName==='Inbox'||state.folders.includes(newName)){showToast('Choose a unique folder name');return;}
    state.folders=state.folders.map(f=>f===old?newName:f);state.foldersUpdatedAt=stamp();
    state.notes.forEach(n=>{if(n.folder===old){n.folder=newName;n.updatedAt=stamp();}});
    if(filter==='folder:'+old)filter='folder:'+newName;
    persist();renderAll();showToast('Folder renamed');
  }
  function removeFolder(folder){
    state.folders=state.folders.filter(f=>f!==folder);state.foldersUpdatedAt=stamp();
    state.notes.forEach(n=>{if(n.folder===folder){n.folder='Inbox';n.updatedAt=stamp();}});
    if(filter==='folder:'+folder)filter='inbox';persist();renderAll();showToast('Notes moved to Inbox');
  }
  async function runAction(action,context) {
    const n=findNote(context?.id)||current(), folder=context?.folder;
    hideContext();
    switch(action){
      case 'open-note':if(n)openNote(n.id);break;
      case 'new-note':newNote();break;
      case 'new-folder':$('new-folder').click();break;
      case 'settings':settingsOpen();break;
      case 'close-tab':if(selected)closeTab(selected);break;
      case 'close-other-tabs':if(selected){tabs=[selected];saveUi();noteTabs();}break;
      case 'restore-tab':if(lastClosedTab&&findNote(lastClosedTab)){openNote(lastClosedTab);lastClosedTab=null;saveUi();}break;
      case 'rename-note':if(n){openNote(n.id);$('note-title').focus();$('note-title').select();}break;
      case 'star-note':if(n){n.starred=!n.starred;touchNote(n);showToast(n.starred?'Added to favorites':'Removed from favorites');}break;
      case 'duplicate-note':if(n){const copy={...n,id:uuid(),title:n.title+' copy',updatedAt:stamp(),deleted:false};state.notes.push(copy);persist();openNote(copy.id);showToast('Note duplicated');}break;
      case 'move-note':if(n){const name=await ask('Move note','Folder: '+['Inbox',...state.folders].join(' · '),n.folder);if(name===null)return;const f=['Inbox',...state.folders].find(x=>x.toLowerCase()===name.trim().toLowerCase());if(!f){showToast('Choose an existing folder');return;}n.folder=f;touchNote(n);renderEditor();}break;
      case 'copy-note-link':if(n){await navigator.clipboard.writeText('[['+n.title+']]');showToast('Note link copied');}break;
      case 'archive-note':if(n){n.archived=!n.archived;touchNote(n);showToast(n.archived?'Archived':'Restored from archive');}break;
      case 'restore-note':if(n){n.deleted=false;n.archived=false;touchNote(n);showToast('Note restored');}break;
      case 'delete-note':if(n){
        if(n.deleted){
          if(!await confirmAction('Permanently delete?','This note cannot be restored.'))return;
          state.notes=state.notes.filter(x=>x.id!==n.id);tabs=tabs.filter(id=>id!==n.id);
        }else{n.deleted=true;n.updatedAt=stamp();tabs=tabs.filter(id=>id!==n.id);}
        if(selected===n.id)selected=visible()[0]?.id||null;
        if(selected&&!tabs.includes(selected))tabs.push(selected);
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
    $('cloud-state').textContent=ownerActive?'Private Cloudflare vault · signed in':(cloudReady?'Cloud is ready · sign in':'Local only · Cloudflare D1 setup required');
    $('sync-connection').textContent=ownerActive?(cloudStatus==='Saved to cloud'?'Connected · verified':cloudStatus):cloudReady?'Sign-in required':'Not configured';
    $('last-sync-confirmed').textContent=confirmed?new Date(lastConfirmed.at).toLocaleString():'Never verified';
    $('unsynced-count').textContent=dirty?'Pending changes':ownerActive?(confirmed?'None':'Not verified'):'Local device only';
    $('sync-explanation').textContent=ownerActive?
      (dirty?'Recent edits are saved locally. Cloud upload and read-back verification are scheduled.':'Cloud sync checks new changes automatically every few seconds.'):
      'Connect a Cloudflare D1 database and owner-only password, then unlock your vault.';
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
      const b=e.target.closest('[data-filter]');if(b)setFilter(b.dataset.filter);
    });
    $('folder-list').addEventListener('click',e=>{
      if(Date.now()<skipClickUntil)return;
      const b=e.target.closest('[data-folder]');if(b)selectFolder(b.dataset.folder);
    });
    $('note-list').addEventListener('click',e=>{
      if(Date.now()<skipClickUntil)return;
      const group=e.target.closest('[data-group-toggle]');
      if(group){const name=group.dataset.groupToggle;
        if(collapsedGroups.has(name))collapsedGroups.delete(name);else collapsedGroups.add(name);
        saveUi();renderSidebar();return;
      }
      const expand=e.target.closest('[data-expand-note]');
      if(expand){const id=expand.dataset.expandNote;
        if(expandedNotes.has(id))expandedNotes.delete(id);else expandedNotes.add(id);
        saveUi();renderSidebar();return;
      }
      const b=e.target.closest('[data-note-id]');if(b)openNote(b.dataset.noteId);
    });
    $('toggle-notes-list').addEventListener('click',()=>{
      notesCollapsed=!notesCollapsed;saveUi();renderSidebar();
    });
    $('open-tabs').addEventListener('click',e=>{
      const close=e.target.closest('[data-close-tab]');if(close){closeTab(close.dataset.closeTab);return;}
      const tab=e.target.closest('[data-tab]');if(tab)openNote(tab.dataset.tab);
    });
    // A custom in-app context menu replaces the browser menu throughout the workspace.
    // Shift + right-click remains available for native browser spelling suggestions.
    document.addEventListener('contextmenu',e=>{
      if(e.shiftKey)return;
      if(e.target.closest('.modal,.menu-popover,.style-popover'))return;
      if(!e.target.closest('.app-shell'))return;
      e.preventDefault();
      const folder=e.target.closest('[data-folder]');
      const note=e.target.closest('[data-note-id],[data-tab]');
      const editor=e.target.closest('#rich-editor,#note-title');
      if(folder){showMenu(e.clientX,e.clientY,folderOptions(folder.dataset.folder),{folder:folder.dataset.folder});return;}
      if(note){const id=note.dataset.noteId||note.dataset.tab,n=findNote(id);
        if(n)showMenu(e.clientX,e.clientY,noteOptions(n),{id});return;}
      if(editor){
        const input=editor.id==='note-title',start=input?editor.selectionStart:null,end=input?editor.selectionEnd:null;
        if(!input)saveSelection();
        const sel=window.getSelection(),hasRange=!!(sel?.rangeCount&&editor.contains(sel.anchorNode)&&editor.contains(sel.focusNode));
        const selectionText=input?editor.value.slice(start,end):(hasRange?sel.toString():'');
        showMenu(e.clientX,e.clientY,editorOptions(!!selectionText),{id:selected,input,start,end,selectionText});return;
      }
      if(e.target.closest('.desktop-tabbar')){showMenu(e.clientX,e.clientY,tabBlankOptions(),{id:selected});return;}
      showMenu(e.clientX,e.clientY,appOptions(),{id:selected});
    });
    const pressStart=e=>{
      if(e.pointerType==='mouse')return;
      const target=e.target.closest('[data-folder],[data-note-id],[data-tab],[data-group-toggle]');
      if(!target)return;
      clearTimeout(longTimer);
      longTimer=setTimeout(()=>{
        if(target.dataset.folder)showMenu(e.clientX,e.clientY,folderOptions(target.dataset.folder),{folder:target.dataset.folder});
        else if(target.dataset.noteId||target.dataset.tab){
          const id=target.dataset.noteId||target.dataset.tab,n=findNote(id);
          if(n)showMenu(e.clientX,e.clientY,noteOptions(n),{id});
        }else if(target.dataset.groupToggle)showMenu(e.clientX,e.clientY,folderOptions(target.dataset.groupToggle),{folder:target.dataset.groupToggle});
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
    });
  }
  function bindRichText(){
    const editor=$('rich-editor');
    editor.addEventListener('input',onEditorInput);
    editor.addEventListener('focus',()=>{isEditing=true;document.body.classList.add('editing');});
    editor.addEventListener('blur',()=>{isEditing=false;document.body.classList.remove('editing');commitEditor();});
    editor.addEventListener('paste',e=>{
      // Paste as plain text; rich formatting must be intentionally applied.
      e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));onEditorInput();
    });
    editor.addEventListener('click',e=>{
      const checkbox=e.target.closest('[data-checkbox]');
      if(checkbox){const on=checkbox.dataset.checkbox==='1';checkbox.dataset.checkbox=on?'0':'1';checkbox.textContent=on?'☐':'☑';onEditorInput();return;}
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
      const r=$('style-picker').getBoundingClientRect(),el=$('style-menu');
      el.hidden=!el.hidden;el.style.left=Math.max(8,Math.min(r.left,innerWidth-185))+'px';
      el.style.top=Math.min(r.top-194,innerHeight-230)+'px';
    });
    $('style-menu').addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')e.preventDefault();});
    $('style-menu').addEventListener('click',e=>{
      const b=e.target.closest('[data-style]');if(!b)return;
      $('style-menu').hidden=true;format('style',b.dataset.style);
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
      if(f==='Inbox'||state.folders.includes(f)){showToast('That folder already exists');return;}
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
    $('writing-font').addEventListener('change',e=>{writingFont=e.target.value;localStorage.setItem(FONT,writingFont);applyTheme();showToast('Writing font updated');});
    $('cloud-button').addEventListener('click',settingsOpen);
    $('sidebar-cloud').addEventListener('click',settingsOpen);
    $('rail-settings').addEventListener('click',settingsOpen);
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