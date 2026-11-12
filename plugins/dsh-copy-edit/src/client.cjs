// 共用 DSH 的 React、认证通道和工程；所有样式只作用于本插件。
const React=require('react');
const {createElement:h,useState,useEffect,useRef}=React;
const ID='dsh-copy-edit';
__COPY_EDIT_CLIENT_MEMORY__
__COPY_EDIT_COPY_LABEL__
__COPY_EDIT_NATIVE_CLIENT__
__COPY_EDIT_NATIVE_PREVIEW__
const PanelNavigation=React.createContext(null);
function usePanelLayer(active,back,priority=10){
  const navigation=React.useContext(PanelNavigation),latest=useRef(back);latest.current=back;
  useEffect(()=>active&&navigation?navigation.register(()=>latest.current(),priority):undefined,[active,navigation?.register,priority]);
}
function watchAdditionalPointer(pointerId,cancel){const down=e=>{if(e.pointerId!==pointerId)cancel();};window.addEventListener('pointerdown',down,true);return()=>window.removeEventListener('pointerdown',down,true);}
__COPY_EDIT_TIMELINE__
__COPY_EDIT_LAYOUT_LOGIC__
__COPY_EDIT_LAYOUT_UI__
__COPY_EDIT_REORDER_LOGIC__
__COPY_EDIT_REORDER_UI__
const {dragTrim,trimBounds,durationFrames}=__COPY_EDIT_TRIM__;
const {createPreviewPlayer}=__COPY_EDIT_PREVIEW__;
const uid=()=>globalThis.crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
const paths={back:'m14 5-7 7 7 7',chevron:'m9 5 7 7-7 7',plus:'M12 5v14M5 12h14',copy:'M9 8h11v13H9zM15 8V3H4v13h5',doc:'M5 3h10l4 4v14H5zM9 10h6M9 14h6M9 18h4',film:'M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4',search:'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',play:'m8 5 11 7-11 7z',pause:'M8 5v14M16 5v14',music:'M9 17V5l11-2v12M9 17a3 3 0 1 1-3-3h3M20 15a3 3 0 1 1-3-3h3',layers:'m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5',text:'M4 5h16M12 5v15M8 20h8',mic:'M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0zM5 10v2a7 7 0 0 0 14 0v-2M12 19v3',swap:'M3 7h17l-4-4M21 17H4l4 4',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',save:'M4 3h13l4 4v14H3V3zM7 3v6h9V3M7 21v-8h10v8'};
const icon=(name,size=20)=>h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.75,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:paths[name]||paths.doc}));
paths.previousFrame='M5 5v14M19 5 9 12l10 7z';paths.nextFrame='M19 5v14M5 5l10 7-10 7z';
paths.grid='M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z';paths.list='M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1';
const button=(label,onClick,props={})=>h('button',{type:'button',onClick,...props},label);
const action=(symbol,label,onClick,props={})=>button(h(React.Fragment,null,icon(symbol,18),h('span',null,label)),onClick,props);
const row=(...children)=>h('div',{className:'dce-actions'},...children);
paths.undo='M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12';paths.redo='m15 4 5 5-5 5M20 9H10a6 6 0 0 0 0 12';paths.cut='M9 9 20 20M9 15 20 4M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0';paths.trash='M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7';paths.more='M4 12h1M11 12h1M18 12h1';
function EditorMore({children}){
  const [open,setOpen]=useState(false),ref=useRef(null);
  usePanelLayer(open,()=>setOpen(false),15);
  useEffect(()=>{if(!open)return;const close=e=>{if(!ref.current?.contains(e.target))setOpen(false);},key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);ref.current?.querySelector('button')?.focus();}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key,true);};},[open]);
  return h('div',{className:'dce-editor-more',ref},action('more','更多',()=>setOpen(!open),{'aria-expanded':open,'aria-label':'更多剪辑操作'}),open&&h('div',{className:'dce-editor-more-panel',role:'group','aria-label':'更多剪辑操作',onClick:e=>{if(e.target.closest('button'))setOpen(false);}},children));
}
const stamp=seconds=>{const f=Math.max(0,Math.floor(seconds*30+.001));return [Math.floor(f/1800),Math.floor(f/30)%60,f%30].map(n=>String(n).padStart(2,'0')).join(':');};
const shortTime=seconds=>[Math.floor(seconds/60),Math.floor(seconds)%60].map(n=>String(n).padStart(2,'0')).join(':');
function sections(p,assets){return timelineClips(p,assets);}

// 尾部保留拖动空间，最后一个镜头也能向右延长，不把手柄顶在视口边缘。
const timelineSeconds=total=>Math.max(total*1.2,total+1);
__COPY_EDIT_WORKSPACE_LOAD__
async function rpc(name,args={},options={}){
  const method='copyEdit/'+name;
  const response=await fetch('/api/'+method,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:uid(),method,payload:{args}}),signal:options.signal});
  if(response.status===401||response.status===403)throw Error('工作台登录已失效，请重新打开 dsh web 的完整链接。');
  if(!response.ok)throw Error('工作台连接失败（'+response.status+'）');
  const body=await response.json();if(!body.result?.ok)throw Error(body.result?.error?.message||'操作未完成，请重新载入');return body.result.value;
}
let nativeMediaRuntime=null,sourceFrameQueue=Promise.resolve();
async function upload(file,signal){
  if(nativeMediaRuntime?.caps.assetImport){const provider=nativeMediaRuntime;const response=await fetch('/api/copy-edit/native-upload?name='+encodeURIComponent(file.name||'贴片.png'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream'},body:file,signal});const body=await response.json();if(!response.ok||!body.ok)throw Error(body.error||'素材导入失败');try{if(signal?.aborted)throw Error('素材导入已取消');return await provider.client.call('import',{importId:body.pending.assetId});}finally{await rpc('nativeImportDrop',{importId:body.pending.assetId}).catch(()=>{});}}
  const response=await fetch('/api/copy-edit/upload?name='+encodeURIComponent(file.name||'贴片.png'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream'},body:file,signal});
  const body=await response.json();if(!response.ok||!body.ok)throw Error(body.error||'素材导入失败');return body.asset;
}
// 缩略图串行请求，给逐帧预览保留解码槽；最多保留 64 张小图。
const thumbnailCache=new Map();let thumbnailQueue=Promise.resolve();
function thumbnail(url){
  const key=(nativeMediaRuntime?.caps.exactFrames?'native:':'host:')+url;
  if(thumbnailCache.has(key))return thumbnailCache.get(key);
  const pending=thumbnailQueue.then(async()=>{if(nativeMediaRuntime?.caps.exactFrames){const query=new URL(url,location.href).searchParams;url=(await nativeMediaRuntime.client.call('frame',{assetId:query.get('assetId'),frame:Number(query.get('frame'))})).url;}const r=await fetch(url);if(!r.ok)throw Error('缩略图暂不可用');return r.blob();});
  thumbnailQueue=pending.catch(()=>{});thumbnailCache.set(key,pending);
  if(thumbnailCache.size>64)thumbnailCache.delete(thumbnailCache.keys().next().value);
  pending.catch(()=>thumbnailCache.delete(key));return pending;
}
function SourceFrame({asset,frame,alt,className='dce-source-frame'}){
  const provider=nativeMediaRuntime?.caps.exactFrames?nativeMediaRuntime:null,[url,setUrl]=useState(''),[error,setError]=useState('');
  useEffect(()=>{setUrl('');setError('');if(provider){const pending=scheduleNativeFrame(provider.client,{assetId:asset.assetId,frame},sourceFrameQueue,value=>setUrl(value.url),e=>setError('取帧失败：'+e.message));sourceFrameQueue=pending.done;return()=>pending.cancel();}},[provider?.client,asset.assetId,frame]);
  return error?h('span',{role:'alert',className:'dce-frame-error'},error):h('img',{className,src:provider?(url||undefined):'/api/copy-edit/frame?assetId='+asset.assetId+'&frame='+frame,alt});
}
function Thumb({asset,frame=0}){
  const [url,setUrl]=useState('');const ref=useRef(null);
  useEffect(()=>{let disposed=false,objectUrl;setUrl('');if(!asset)return;
    const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))return;observer.disconnect();thumbnail('/api/copy-edit/frame?assetId='+asset.assetId+'&frame='+frame+'&thumbnail=1').then(blob=>{if(!disposed){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(()=>{});},{rootMargin:'80px'});
    observer.observe(ref.current);return()=>{disposed=true;observer.disconnect();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[asset?.assetId,frame,nativeMediaRuntime?.client]);
  return h('div',{className:'dce-thumb',ref},url?h('img',{src:url,alt:''}):icon('film',26));
}
__COPY_EDIT_CATEGORIES__
__COPY_EDIT_SELECTION_IMPORT__
__COPY_EDIT_HOME__
__COPY_EDIT_STICKER_TIME__
__COPY_EDIT_AUDIO_TIMING__
const stickerDefaults={text:'',color:'#ffffff',stroke:'#202124',background:'#202124',transparent:true,y:230};
__COPY_EDIT_EDITOR_TOOLS__
__COPY_EDIT_STICKER_GESTURE__
function stickerCanvas(s){
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=400;const c=canvas.getContext('2d');
  if(!s.transparent){c.fillStyle=s.background;c.fillRect(0,0,1080,400);}
  const lines=s.text.split('\n').slice(0,4);c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';c.font='600 64px system-ui,"Microsoft YaHei",sans-serif';c.lineWidth=6;c.strokeStyle=s.stroke;c.fillStyle=s.color;
  lines.forEach((line,i)=>{const y=200+(i-(lines.length-1)/2)*82;c.strokeText(line,540,y,1000);c.fillText(line,540,y,1000);});return canvas;
}
__COPY_EDIT_COPY_LAYOUT__
__COPY_EDIT_COPY_RESIZE_LOGIC__
__COPY_EDIT_COPY_RESIZE_UI__
__COPY_EDIT_COPY_TOOLS__
__COPY_EDIT_COPY_VOICE__
__COPY_EDIT_COPY_COMPOSITION__
function CopyPage({p,assets,workspace,edit,perform,busy,notice,navigate,openExample,available,drafts,voiceAction,refresh,job,startRender,reportError,persist,forkRecovery,onDraftText}){
  const draft=drafts.current[p.projectId],copyStickers=projectStickers(p);
  const [copyStickerId,setCopyStickerId]=useState(draft?.stickerId||'');
  const existingSticker=copyStickerId==='new'?null:(copyStickers.find(s=>s.stickerId===copyStickerId)||copyStickers[0]);
  // 旧草稿的title仅兼容保留，界面与新版本保存均不从它取展示名。
  const [legacyTitle,setLegacyTitle]=useState(draft?.title??p.title),[text,setText]=useState(draft?.text??p.text),[version,setVersion]=useState(draft?.version??p.versions.at(-1)?.version);
  const textRef=useCopyTextHeight(text);
  const [mobileTool,setMobileTool]=useState(null);
  const mobileQuery='(max-width:760px), (pointer:coarse) and (max-width:1023px)';
  const documentRef=useRef(null);
  usePanelLayer(!!mobileTool&&matchMedia(mobileQuery).matches,()=>setMobileTool(null));
  useEffect(()=>{if(!mobileTool||!matchMedia(mobileQuery).matches)return;const frame=requestAnimationFrame(()=>documentRef.current?.querySelector(mobileTool==='composition'?'.dce-copy-composition':mobileTool==='voice'?'.dce-copy-voice':'.dce-copy-music')?.scrollIntoView({block:'nearest',behavior:'instant'}));return()=>cancelAnimationFrame(frame);},[mobileTool]);
  const [sticker,setSticker]=useState(draft?.sticker&&JSON.stringify(draft.stickerBase)===JSON.stringify(existingSticker)?draft.sticker:(existingSticker??stickerDefaults)),[image,setImage]=useState('');
  const copyBase=useRef(draft?.copyBase||{title:p.title,text:p.text});
  useEffect(()=>{drafts.current[p.projectId]={title:legacyTitle,text,version,sticker,stickerId:copyStickerId,stickerBase:existingSticker,copyBase:copyBase.current};persist();},[legacyTitle,text,version,sticker,copyStickerId,p.projectId,existingSticker]);
  useEffect(()=>{onDraftText(p.projectId,text);},[p.projectId,text,onDraftText]);
  const [draftCopies,setDraftCopies]=useState([]);
  useEffect(()=>{const update=()=>{try{setDraftCopies(panelDraftCopies(()=>window.localStorage,workspace.workspaceId,p.projectId));}catch{setDraftCopies([]);}};update();window.addEventListener('storage',update);return()=>window.removeEventListener('storage',update);},[workspace.workspaceId,p.projectId,legacyTitle,text,version,sticker]);
  const otherDrafts=draftCopies.filter(c=>JSON.stringify(c.draft)!==JSON.stringify(normalizePanelMemory({format:1,drafts:{[p.projectId]:drafts.current[p.projectId]}}).drafts[p.projectId]));
  const recoverDraft=key=>{const saved=draftCopies.find(c=>c.key===key)?.draft;if(!saved||!persist())return;forkRecovery();copyBase.current=saved.copyBase||{title:p.title,text:p.text};setLegacyTitle(saved.title??p.title);setText(saved.text??p.text);setVersion(saved.version);setCopyStickerId(saved.stickerId||'');setSticker(saved.sticker||stickerDefaults);notice('草稿已恢复，其他副本仍保留');};
  const displayedVersion=p.versions.find(v=>v.version===version),copyChanged=!displayedVersion||text!==displayedVersion.text;
  const selectVersion=value=>{
    if(value.startsWith('recover:')){recoverDraft(value.slice(8));return;}
    const saved=p.versions.find(v=>v.version===Number(value));if(!saved||!persist())return;
    // 有修改时分叉保护；只浏览已保存版本复用查看副本，避免按点击次数耗尽额度。
    if(copyChanged||legacyTitle!==displayedVersion?.title)forkRecovery();
    copyBase.current={title:p.title,text:p.text};setLegacyTitle(saved.title);setText(saved.text);setVersion(saved.version);
  };
  useEffect(()=>{setImage(stickerCanvas(sticker).toDataURL('image/png'));},[sticker]);
  const save=()=>perform(async()=>{if(p.title!==copyBase.current.title||p.text!==copyBase.current.text)throw Error('此文案已在别处更新。草稿已保留，请先复制草稿并重新选择最新版本。');const result=await edit({type:'saveCopy',title:p.title,text});copyBase.current={title:result.title,text:result.text};setLegacyTitle(result.title);setVersion(result.versions.length);notice('已保存 V'+result.versions.length);});
  const saveSticker=()=>perform(async()=>{if(sticker.text.split('\n').length>4)throw Error('贴片最多 4 行');const blob=await new Promise(resolve=>stickerCanvas(sticker).toBlob(resolve,'image/png'));const a=await upload(new File([blob],'贴片.png',{type:'image/png'}));const value={...sticker,...placement(existingSticker||stickerDefaults),assetId:a.assetId};const next=await edit(existingSticker?{type:'updateSticker',stickerId:existingSticker.stickerId,sticker:value}:{type:'addSticker',sticker:{...value,startFrame:0,endFrame:null}});if(!existingSticker)setCopyStickerId(projectStickers(next).at(-1).stickerId);notice('贴片已保存');});
  const toolEntry=(key,symbol,label)=>action(symbol,h(React.Fragment,null,h('span',{className:'dce-tool-label'},label),icon('chevron',18)),()=>setMobileTool(mobileTool===key?null:key),{'aria-expanded':mobileTool===key,'aria-label':label+'设置',className:'dce-copy-tool-entry','data-tool':key});
  return h('article',{ref:documentRef,className:'dce-document','data-mobile-tool':mobileTool||'none'},
    h('div',{className:'dce-document-scroll'},
    h('div',{className:'dce-document-toolbar'},
      h('select',{'aria-label':'文案版本',title:'切换版本或恢复未保存草稿',className:'dce-copy-version',value:copyChanged?'draft':String(version),onChange:e=>selectVersion(e.target.value)},copyChanged&&h('option',{value:'draft'},'草稿'),h('optgroup',{label:'已保存版本'},...p.versions.map(v=>h('option',{key:v.version,value:v.version},'V'+v.version))),otherDrafts.length>0&&h('optgroup',{label:'未保存草稿（'+otherDrafts.length+'）'},...otherDrafts.map((c,i)=>h('option',{key:c.key,value:'recover:'+c.key},'草稿 '+(i+1)+'：'+copySummary(c.draft.text).name)))),
      h('div',{className:'dce-copy-tools'},h(CopyAction,{text,perform,busy}),button('保存版本',save,{disabled:busy,className:'quiet dce-save-copy'}),action('film','打开剪辑',()=>navigate('edit'),{className:'dce-desktop-edit'}))),
    h('div',{className:'dce-document-body'},h('div',{className:'dce-copy-writing'},
      h('textarea',{id:'dce-copy','aria-label':'文案正文',className:'copy-text',ref:textRef,rows:3,value:text,placeholder:'写下你的文案…',maxLength:20000,onChange:e=>setText(e.target.value)}),
      copyChanged&&h('div',{className:'dce-mobile-copy-meta',role:'status'},'未保存'),
      h('div',{className:'dce-copy-audio'},
        toolEntry('voice','mic','配音'),h(CopyVoice,{p,workspace,perform,busy,voiceAction,refresh,available}),
        toolEntry('music','music','背景音乐'),h(CopyMusic,{p,projects:workspace.projects,assets,edit,perform,busy,available,notice,navigate})),
      toolEntry('composition','layers','画面与贴片')),
      h(CopyComposition,{p,assets,results:workspace.results.filter(r=>r.executionLocation==='android-local'||!workspace.capabilities.renderVersion||r.renderVersion===workspace.capabilities.renderVersion),job,startRender,perform,busy,available,renderAvailable:workspace.renderAvailable,navigate,openExample,sticker,image,reportError},
        h('section',{className:'dce-copy-stickers','aria-label':'文字贴片设置'},
          h('div',{className:'dce-attachment-heading'},h('label',{htmlFor:'dce-copy-sticker-choice'},'文字贴片'),h('select',{id:'dce-copy-sticker-choice','aria-label':'文案文字贴片',value:existingSticker?.stickerId||'',onChange:e=>{setCopyStickerId(e.target.value||'new');setSticker(copyStickers.find(s=>s.stickerId===e.target.value)||stickerDefaults);}},h('option',{value:''},'新文字'),...copyStickers.map((s,i)=>h('option',{key:s.stickerId,value:s.stickerId},(i+1)+'. '+s.text)))),
          h('div',{className:'dce-copy-sticker-fields'},h('label',{htmlFor:'dce-sticker-text'},'文字内容'),h('textarea',{id:'dce-sticker-text',className:'sticker-text',maxLength:500,value:sticker.text,placeholder:'支持多行文字',onChange:e=>setSticker({...sticker,text:e.target.value})}),
            h('div',{className:'dce-color-fields'},...[['color','文字颜色'],['stroke','描边颜色'],['background','背景颜色']].map(([key,label])=>h('label',{key},h('input',{type:'color','aria-label':label,value:sticker[key],onChange:e=>setSticker({...sticker,[key]:e.target.value})}),label))),
            h('label',{className:'dce-check'},h('input',{type:'checkbox',checked:sticker.transparent,onChange:e=>setSticker({...sticker,transparent:e.target.checked})}),'透明背景'),
            row(button('保存贴片',saveSticker,{disabled:busy||!available,className:'primary'}),existingSticker&&button('移除贴片',()=>perform(async()=>{await edit({type:'removeSticker',stickerId:existingSticker.stickerId});setCopyStickerId('new');setSticker({...stickerDefaults});}),{disabled:busy}))))))),
    h('div',{className:'dce-copy-next'},action('film','进入剪辑',()=>navigate('edit'),{className:'primary'})));
}
function CopyWorkspace(props){
  const resized=useCopySidebarResize();
  const memory=props.copyMemory,items=useRef(null);
  const [draftText,setDraftText]=useState(()=>Object.fromEntries(Object.entries(props.drafts.current).filter(([,v])=>typeof v.text==='string').map(([id,v])=>[id,v.text])));
  const onDraftText=React.useCallback((id,text)=>setDraftText(current=>current[id]===text?current:{...current,[id]:text}),[]);
  const content=p=>draftText[p.projectId]??p.text;
  const [search,setSearch]=useState(memory.current.search||''),[showList,setShowList]=useState(memory.current.showList||false);const matches=props.workspace.projects.filter(p=>content(p).toLowerCase().includes(search.toLowerCase()));
  usePanelLayer(!resized.desktop&&showList,()=>setShowList(false));
  useEffect(()=>{memory.current={...memory.current,search,showList};props.persist();},[search,showList]);
  useEffect(()=>{if(items.current)items.current.scrollTop=memory.current.scrollTop||0;},[showList]);
  return h('div',{ref:resized.root,style:resized.style,className:'dce-copy-workspace'+(showList?' is-list-open':'')},
    h('aside',{className:'dce-copy-list','aria-label':'文案列表'},h('div',{className:'dce-list-heading'},h('h2',null,'文案'),action('plus','新建',()=>props.create('copy'),{disabled:props.busy,className:'quiet'})),
      h('label',{className:'dce-search'},icon('search',18),h('input',{type:'search','aria-label':'搜索文案',placeholder:'搜索文案',value:search,onChange:e=>setSearch(e.target.value)})),
      h('div',{ref:items,className:'dce-list-items',onScroll:e=>{memory.current.scrollTop=e.currentTarget.scrollTop;props.persist();}},...matches.map(p=>{const summary=copySummary(content(p));return button(h(React.Fragment,null,h('strong',null,summary.name),summary.rest&&h('span',null,summary.rest)),()=>{props.setProjectId(p.projectId);setShowList(false);},{key:p.projectId,'data-project-id':p.projectId,'aria-pressed':p.projectId===props.p.projectId,className:'dce-copy-item'});}),!matches.length&&h('p',{className:'dce-empty-text'},'没有找到文案'))),
    resized.divider,h('div',{className:'dce-copy-detail'},action('list',showList?'返回正文':'文案列表',()=>setShowList(!showList),{className:'dce-mobile-list quiet','aria-label':showList?'返回正文':'文案列表'}),h(CopyPage,{...props,onDraftText,key:props.p.projectId,assets:props.workspace.assets})));
}
// 一次拖动固定比例尺和起始修订，只在松手时提交一个命令。
function useTrimGesture({p,assets,disabled,selectClip,onBoundary,onCommit}){
  const [draft,setDraft]=useState(null),session=useRef(null),hold=useRef(false),mounted=useRef(true),latest=useRef(null);
  latest.current={p,assets,disabled,selectClip,onBoundary,onCommit};
  function context(c,edge){
    const current=latest.current,asset=current.assets.find(a=>a.assetId===c.assetId);
    const total=sections(current.p,current.assets).reduce((s,c)=>s+Math.round(c.duration*30),0);
    const minFrames=1;
    return {clip:{...c},asset,edge,revision:current.p.revision,projectId:current.p.projectId,operationId:uid(),minFrames,maxFrames:18000-total+Math.round(c.duration*30),axisSeconds:timelineSeconds(timelineLength(current.p,current.assets).totalFrames/30),range:{inFrame:c.inFrame,outFrame:c.outFrame}};
  }
  function stop(g){
    if(session.current!==g)return;session.current=null;cancelAnimationFrame(g.raf);
    g.extra?.();
    window.removeEventListener('pointermove',g.move);window.removeEventListener('pointerup',g.up);window.removeEventListener('pointercancel',g.cancel);
    window.removeEventListener('keydown',g.key,true);window.removeEventListener('blur',g.cancel);document.removeEventListener('visibilitychange',g.hide);
    g.element.removeEventListener('lostpointercapture',g.cancel);
    if(g.element.hasPointerCapture(g.pointerId))g.element.releasePointerCapture(g.pointerId);
  }
  function cancel(){const g=session.current;if(!g)return;stop(g);if(mounted.current){setDraft(null);latest.current.onBoundary(g.clip,g.edge);}}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const g=session.current;if(g)stop(g);};},[]);
  useEffect(()=>{const g=session.current;if(g&&g.revision!==p.revision)cancel();},[p.revision]);
  async function commit(g){
    hold.current=true;
    try{await latest.current.onCommit(g.range,g);}finally{hold.current=false;if(mounted.current)setDraft(null);}
  }
  function begin(e,c,edge){
    if(e.button!==0||!e.isPrimary||latest.current.disabled||session.current||hold.current)return;
    e.preventDefault();e.stopPropagation();
    const element=e.currentTarget,scroller=element.closest('.dce-timeline-scroll'),content=element.closest('.dce-timeline-content');
    const g={...context(c,edge),element,scroller,pointerId:e.pointerId,startX:e.clientX,lastX:e.clientX,startScroll:scroller.scrollLeft};
    g.pixelsPerSecond=content.getBoundingClientRect().width/g.axisSeconds;
    if(g.pixelsPerSecond<=0)return;
    latest.current.selectClip(c);latest.current.onBoundary(g.range,edge);session.current=g;
    const publish=()=>{if(session.current!==g)return;const delta=(g.lastX-g.startX+scroller.scrollLeft-g.startScroll)/g.pixelsPerSecond;
      const range=dragTrim(g.asset,g.clip,edge,delta,g.maxFrames,g.minFrames);
      if(range.inFrame===g.range.inFrame&&range.outFrame===g.range.outFrame&&range.limited===g.range.limited)return;
      g.range=range;setDraft({...g,range});latest.current.onBoundary(range,edge);
    };
    g.move=event=>{if(event.pointerId!==g.pointerId)return;if(event.cancelable)event.preventDefault();g.lastX=event.clientX;publish();};
    g.up=event=>{if(event.pointerId!==g.pointerId)return;g.lastX=event.clientX;publish();stop(g);
      if(g.range.inFrame===g.clip.inFrame&&g.range.outFrame===g.clip.outFrame){setDraft(null);return;}
      void commit(g);
    };
    g.cancel=()=>cancel();g.hide=()=>{if(document.hidden)cancel();};
    g.extra=watchAdditionalPointer(g.pointerId,cancel);
    g.key=event=>{if(event.key==='Escape'||event.key==='Tab'){if(event.key==='Escape')event.preventDefault();cancel();}};
    const scroll=()=>{if(session.current!==g)return;const r=scroller.getBoundingClientRect(),before=scroller.scrollLeft;
      if(Math.abs(g.lastX-g.startX)>3){if(g.lastX<r.left+24)scroller.scrollLeft-=Math.min(16,(r.left+24-g.lastX)/2);else if(g.lastX>r.right-24)scroller.scrollLeft+=Math.min(16,(g.lastX-r.right+24)/2);}
      if(scroller.scrollLeft!==before)publish();g.raf=requestAnimationFrame(scroll);
    };
    element.setPointerCapture(e.pointerId);element.addEventListener('lostpointercapture',g.cancel);
    window.addEventListener('pointermove',g.move,{passive:false});window.addEventListener('pointerup',g.up);window.addEventListener('pointercancel',g.cancel);
    window.addEventListener('keydown',g.key,true);window.addEventListener('blur',g.cancel);document.addEventListener('visibilitychange',g.hide);
    setDraft({...g});g.raf=requestAnimationFrame(scroll);
  }
  function key(e,c,edge){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();
    if(latest.current.disabled||session.current||hold.current)return;
    const g=context(c,edge),bounds=trimBounds(g.asset,c,edge,g.maxFrames,g.minFrames),field=edge==='in'?'inFrame':'outFrame',n=c[field];
    const value=e.key==='Home'?bounds.min:e.key==='End'?bounds.max:Math.max(bounds.min,Math.min(bounds.max,n+(e.key==='ArrowLeft'?-1:1)));
    if(value===n)return;g.range={inFrame:c.inFrame,outFrame:c.outFrame,[field]:value};latest.current.selectClip(c);latest.current.onBoundary(g.range,edge);setDraft({...g});void commit(g);
  }
  return {draft,begin,key};
}
function EditPage({p,displayName,assets,results,history,edit,perform,busy,job,startRender,shareResult,navigate,refresh,available,renderAvailable,reportError,editorMemory,persist}){
  const initial=useRef(editorMemory.current[p.projectId]?.revision===p.revision?editorMemory.current[p.projectId]:{}).current;
  const [selected,setSelected]=useState(initial.selected||null),[frame,setFrame]=useState(initial.frame||0),[displayFrame,setDisplayFrame]=useState(initial.frame||0),[trimIn,setTrimIn]=useState(0),[trimOut,setTrimOut]=useState(1);
  const [playing,setPlaying]=useState(false),[running,setRunning]=useState(false),[playhead,setPlayhead]=useState(initial.position||0),[zoom,setZoom]=useState(initial.zoom||1),[libraryTab,setLibraryTab]=useState('video'),[replaceMode,setReplaceMode]=useState(false),[selectedAsset,setSelectedAsset]=useState(null);
  const [mobilePanel,setMobilePanel]=useState(null),[touchReorder,setTouchReorder]=useState(false);
  const spaceHeld=useRef(false);
  const [reorderActive,setReorderActive]=useState(false);
  const video=useRef(null),input=useRef(null),from=useRef(0),mediaScroll=useRef(null),pendingFrame=useRef(initial.frame??null);
  const playback=useRef(null),[preparing,setPreparing]=useState(false);
  const [stickerMoving,setStickerMoving]=useState(false),stickerPanel=useRef(null);
  const [stillTime,setStillTime]=useState(initial.position??null),pendingTime=useRef(initial.position??null);
  const [selectedSticker,setSelectedSticker]=useState(initial.selectedSticker||null),[selectedVoice,setSelectedVoice]=useState(initial.selectedVoice||null);
  const [selectedTrack,setSelectedTrack]=useState('video'),[selectedMusic,setSelectedMusic]=useState(null);
  const savedList=sections(p,assets),savedClip=savedList.find(c=>c.clipId===selected)||savedList[0];
  const selectClip=(c,keepTrack=false)=>{if(!keepTrack)setSelectedTrack('video');playback.current?.pause();setSelected(c.clipId);setPlaying(false);setRunning(false);setFrame(c.inFrame);setStillTime(null);};
  const trim=useTrimGesture({p,assets,disabled:busy||job?.status==='running'||stickerMoving||reorderActive,selectClip,
    onBoundary:(range,edge)=>{setTrimIn(range.inFrame);setTrimOut(range.outFrame);setFrame(edge==='in'?range.inFrame:range.outFrame-1);},
    onCommit:async(range,g)=>{
      pendingFrame.current=g.edge==='in'?range.inFrame:range.outFrame-1;
      const result=await perform(()=>edit({type:'trimClip',clipId:g.clip.clipId,inFrame:range.inFrame,outFrame:range.outFrame},{projectId:g.projectId,expectedRevision:g.revision,operationId:g.operationId}));
      if(!result){pendingFrame.current=null;setTrimIn(g.clip.inFrame);setTrimOut(g.clip.outFrame);setFrame(g.clip.inFrame);}
    }
  });
  const draft=trim.draft?.revision===p.revision?trim.draft:null;
  const displayed=draft?{...p,clips:p.clips.map(c=>c.clipId===draft.clip.clipId?trimmedClip(c,draft.asset,draft.range.inFrame,draft.range.outFrame):c)}:p;
  const list=sections(displayed,assets),clip=list.find(c=>c.clipId===selected)||list[0],asset=clip?.asset,clipIndex=list.indexOf(clip),total=timelineLength(displayed,assets).totalFrames/30;
  const totalFrames=Math.round(total*30),videoFrames=list.reduce((n,c)=>n+c.frames,0),stickers=resolvedStickers(p,list),activeSticker=selectedSticker==='new'?null:(stickers.find(s=>s.stickerId===selectedSticker)||stickers[0]);
  const stickerTrim=useStickerTrim({p,totalFrames,clips:list,disabled:busy||job?.status==='running'||!!draft||stickerMoving||reorderActive,onSelect:id=>{setSelectedTrack('sticker');setSelectedSticker(id);editSticker();},onCommit:g=>perform(()=>edit({type:'trimSticker',stickerId:g.stickerId,...g.range},{projectId:g.projectId,expectedRevision:g.revision,operationId:g.operationId}))});
  const timedStickers=stickerTrim.draft?stickers.map(s=>s.stickerId===stickerTrim.draft.stickerId?{...s,...stickerTrim.draft.range}:s):stickers;
  const lanes=stickerRows(timedStickers,totalFrames),stickerHeight=`calc(var(--dce-track-row,38px) * ${lanes.count})`,voices=independentVoices(p,assets),voiceRows=stickerRows(voices.map(v=>({stickerId:v.voiceId,startFrame:v.startFrame,endFrame:v.startFrame+voiceFrames(v)})),totalFrames),voiceHeight=`calc(var(--dce-track-row,38px) * ${voiceRows.count})`,music=projectMusic(p),musicRows=stickerRows(music.map(m=>({...m,stickerId:m.musicId})),totalFrames),musicHeight=`calc(var(--dce-track-row,38px) * ${musicRows.count})`;
  const preview=results.filter(r=>r.projectId===p.projectId&&r.revision===p.revision&&r.profile==='preview').at(-1),exported=results.filter(r=>r.projectId===p.projectId&&r.revision===p.revision&&r.profile==='export').at(-1);
  const nativePreview=preview?.executionLocation==='android-local'&&nativeMediaRuntime?.caps.nativePreview===true;
  const reorder=useClipReorder({p,clips:savedList,touchEnabled:touchReorder,disabled:busy||job?.status==='running'||!!draft||stickerMoving||!!stickerTrim.draft,onStart:selectClip,onDragging:setReorderActive,onCommit:(to,g)=>perform(()=>edit({type:'moveClip',clipId:g.clipId,to},{projectId:g.projectId,expectedRevision:g.revision,operationId:g.operationId}))});
  const disabled=busy||job?.status==='running'||!!draft||stickerMoving||!!stickerTrim.draft||reorderActive;
  const editSticker=()=>{playback.current?.pause();setPlaying(false);setRunning(false);};
  const showSticker=()=>{setSelectedTrack('sticker');editSticker();setMobilePanel('properties');const panel=stickerPanel.current;if(panel){panel.querySelector('details').open=true;if(panel.getBoundingClientRect().width){panel.scrollIntoView({block:'nearest'});panel.querySelector('textarea')?.focus();}}};
  const newSticker=()=>{setSelectedTrack('sticker');setSelectedSticker('new');showSticker();};
  const moveSticker=(stickerId,value,revision)=>perform(()=>edit({type:'moveSticker',stickerId,...value},{projectId:p.projectId,expectedRevision:revision,operationId:uid()}));
  const previewError=e=>{if(e.name!=='AbortError'){if(nativePreview){setPlaying(false);setRunning(false);setPreparing(false);}reportError(e.message);}};
  useEffect(()=>{if(!playing||!preview||!video.current)return;const options={duration:total,onPreparing:setPreparing,onRunning:setRunning,onPosition:setPlayhead,onError:previewError};const player=nativePreview?createNativePreviewPlayer(video.current,{...options,client:nativeMediaRuntime.client,jobId:preview.jobId,newId:uid}):createPreviewPlayer(video.current,options);playback.current=player;void player.playFrom(from.current).catch(previewError);return()=>{player.dispose();if(playback.current===player)playback.current=null;};},[playing,preview?.jobId,nativePreview]);
  useEffect(()=>{if(savedClip){setSelected(savedClip.clipId);setFrame(pendingFrame.current??savedClip.inFrame);pendingFrame.current=null;setStillTime(pendingTime.current);pendingTime.current=null;setTrimIn(savedClip.inFrame);setTrimOut(savedClip.outFrame);}setPlaying(false);setRunning(false);},[savedClip?.clipId,savedClip?.assetId,savedClip?.inFrame,savedClip?.outFrame,savedClip?.start]);
  useEffect(()=>{setPlaying(false);setRunning(false);},[p.revision]);
  useEffect(()=>{const t=setTimeout(()=>setDisplayFrame(frame),90);return()=>clearTimeout(t);},[frame]);
  // 时间轴定位保留工程帧；25fps 源帧不能替代 30fps 文字显示边界。
  const sourcePosition=stillTime??(clip?clip.start+Math.max(0,Math.min(clip.duration-1/30,(asset.ptsUs[Math.max(clip.inFrame,Math.min(frame,clip.outFrame-1))]-asset.ptsUs[clipWindow(clip,asset).inFrame])/1000000-clipWindow(clip,asset).offset/30)):0);
  const position=draft?Math.max(0,draft.clip.start+(draft.edge==='in'?draft.clip.duration-clip.duration:clip.duration)):(playing?playhead:sourcePosition);
  const observedClip=playing?(list.find(c=>position<c.start+c.duration)||list.at(-1)):clip,observedAsset=observedClip?.asset;
  const observedFrame=playing&&observedClip?sourceFrameAt(observedClip,observedAsset,Math.min(observedClip.frames-1,Math.max(0,Math.floor((position-observedClip.start)*30+.001)))):frame;
  // 播放头只更新内存；暂停/结束时落盘，避免每次timeupdate同步序列化整个草稿库。
  useEffect(()=>{editorMemory.current[p.projectId]={revision:p.revision,selected,frame,position,zoom,selectedSticker,selectedVoice};if(!running)persist();},[p.projectId,p.revision,selected,frame,position,zoom,selectedSticker,selectedVoice,running]);
  useEffect(()=>{const hide=()=>{if(document.hidden){playback.current?.pause();setRunning(false);setPreparing(false);persist();}};document.addEventListener('visibilitychange',hide);return()=>{document.removeEventListener('visibilitychange',hide);persist();};},[]);
  const step=n=>{if(!observedClip)return;const next=Math.max(0,Math.min(observedAsset.ptsUs.length-1,n));pendingFrame.current=observedClip.clipId!==clip?.clipId?next:null;selectClip(observedClip,true);setFrame(next);};
  const play=async()=>{try{if(running||preparing){playback.current?.pause();return;}const current=playback.current?.readPosition?await playback.current.readPosition():video.current?.currentTime??playhead;from.current=playing?(current>=total-.001?0:current):sourcePosition;setPlayhead(from.current);setPlaying(true);if(preview&&playback.current)void playback.current.playFrom(from.current).catch(previewError);else if(!preview)void perform(()=>startRender('preview'));}catch(error){previewError(error);}};
  const scrub=(seconds,staticFrame=false)=>{const t=Math.max(0,Math.min(seconds,Math.max(0,total-1/30)));if(!staticFrame&&playing&&preview&&playback.current){void playback.current.seek(t,running||preparing).catch(previewError);setPlayhead(t);return;}const target=list.find(c=>t<c.start+c.duration)||list.at(-1);if(!target)return;const n=sourceFrameAt(target,target.asset,Math.min(target.frames-1,Math.max(0,Math.floor((t-target.start)*30+.001))));pendingFrame.current=target.clipId!==clip?.clipId?n:null;pendingTime.current=target.clipId!==clip?.clipId?t:null;selectClip(target,true);setFrame(n);setStillTime(t);};
  const chosenVoice=voices.find(v=>v.voiceId===selectedVoice)||voices[0],chosenMusic=music.find(m=>m.musicId===selectedMusic)||music[0];
  const split=()=>perform(async()=>{
    const current=playing&&playback.current?.readPosition?await playback.current.readPosition():video.current?.currentTime??position;
    const at=Math.round((playing?current:position)*30);editSticker();
    if(selectedTrack==='sticker'){if(!activeSticker)throw Error('请选择贴片');const next=await edit({type:'splitSticker',stickerId:activeSticker.stickerId,frame:at});setSelectedSticker(next.stickers[next.stickers.findIndex(s=>s.stickerId===activeSticker.stickerId)+1].stickerId);}
    else if(selectedTrack==='voice'){if(!chosenVoice)throw Error('请选择配音片段');const next=await edit({type:'splitVoice',voiceId:chosenVoice.voiceId,frame:at});setSelectedVoice(next.voiceClips[next.voiceClips.findIndex(v=>v.voiceId===chosenVoice.voiceId)+1].voiceId);}
    else if(selectedTrack==='bgm'){if(!chosenMusic)throw Error('请选择音乐片段');const next=await edit({type:'splitMusic',musicId:chosenMusic.musicId,frame:at});setSelectedMusic(next.musicClips[next.musicClips.findIndex(m=>m.musicId===chosenMusic.musicId)+1].musicId);}
    else {const c=clip;if(!c)throw Error('请选择镜头');const n=at-c.startFrame;if(n<=0||n>=c.frames)throw Error('请把播放头放在选中片段内部');const next=await edit({type:'splitClip',clipId:c.clipId,offsetFrame:n});setSelected(next.clips[next.clips.findIndex(x=>x.clipId===c.clipId)+1].clipId);}
  });
  const remove=()=>perform(()=>{if(selectedTrack==='sticker'&&activeSticker)return edit({type:'removeSticker',stickerId:activeSticker.stickerId});if(selectedTrack==='voice'&&chosenVoice)return edit({type:'removeVoice',voiceId:chosenVoice.voiceId});if(selectedTrack==='bgm'&&chosenMusic)return edit({type:'removeMusic',musicId:chosenMusic.musicId});if(selectedTrack==='video'&&clip)return edit({type:'removeClip',clipId:clip.clipId});});
  const historyAction=type=>perform(()=>edit({type}));
  useEffect(()=>{const key=e=>{if(!e.target.closest?.('.dce-page-edit')||e.isComposing||e.keyCode===229)return;const typing=e.target.isContentEditable||e.target.closest('textarea,select,input:not([type=range]),[role=textbox],[contenteditable=true]');
    if((e.code==='Space'||e.key===' ')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!typing&&!e.target.closest('summary')){e.preventDefault();e.stopPropagation();if(e.repeat||spaceHeld.current)return;spaceHeld.current=true;if(!disabled&&clip)play();return;}
    if(disabled||typing)return;const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();if(e.shiftKey?history?.canRedo:history?.canUndo)historyAction(e.shiftKey?'redo':'undo');}else if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();e.stopPropagation();if(history?.canRedo)historyAction('redo');}else if(mod&&e.key.toLowerCase()==='b'){e.preventDefault();e.stopPropagation();split();}else if(e.key==='Delete'&&e.target.closest('.dce-clip,.dce-sticker-clip,.dce-audio-clip')){e.preventDefault();e.stopPropagation();remove();}};const up=e=>{if((e.code==='Space'||e.key===' ')&&spaceHeld.current){spaceHeld.current=false;e.preventDefault();e.stopPropagation();}},blur=()=>{spaceHeld.current=false;};document.addEventListener('keydown',key,true);document.addEventListener('keyup',up,true);window.addEventListener('blur',blur);return()=>{document.removeEventListener('keydown',key,true);document.removeEventListener('keyup',up,true);window.removeEventListener('blur',blur);};});

  const importFiles=files=>perform(async()=>{for(const file of files)await upload(file);await refresh();});
  const importButton=action('plus','导入素材',()=>input.current.click(),{disabled:busy||!available,className:'dce-import'});
  const libraryAsset=assets.find(a=>a.assetId===selectedAsset&&a.kind===libraryTab);
  const addAsset=a=>perform(async()=>{const next=await edit({type:'addClip',assetId:a.assetId});setSelected(next.clips.at(-1).clipId);setMobilePanel(null);});
  const replaceAsset=a=>perform(async()=>{await edit({type:'replaceClip',clipId:clip.clipId,assetId:a.assetId});setReplaceMode(false);setMobilePanel(null);});
  const mediaItems=assets.filter(a=>a.kind===libraryTab).map(a=>h('article',{className:'dce-media-item',key:a.assetId},
    button(h(React.Fragment,null,libraryTab==='video'?h(Thumb,{asset:a}):icon('music',18),h('span',{className:'dce-asset-name'},a.name)),()=>setSelectedAsset(a.assetId),{className:'dce-media-choice','aria-label':'选择素材：'+a.name,'aria-pressed':selectedAsset===a.assetId,disabled}),
    libraryTab==='video'?h('div',{className:'dce-media-desktop-actions'},row(button('添加',()=>addAsset(a),{disabled}),clip&&button('替换',()=>replaceAsset(a),{disabled,className:replaceMode?'primary':''}))):h('span',{className:'dce-muted'},shortTime((a.durationUs||a.endUs||0)/1000000))));
  const library=h('aside',{className:'dce-media-library','aria-label':'素材库'},h('div',{className:'dce-pane-heading'},h('h2',null,'素材库'),importButton),
    h('input',{ref:input,type:'file',hidden:true,multiple:true,accept:'video/mp4,video/webm,video/x-matroska,audio/*',onChange:e=>{const files=Array.from(e.target.files);e.target.value='';importFiles(files);}}),
    h('div',{className:'dce-library-tabs'},...['video','audio'].map(type=>button(type==='video'?'视频':'音频',()=>{setLibraryTab(type);setSelectedAsset(null);},{'aria-pressed':libraryTab===type,key:type}))),
    replaceMode&&h('div',{className:'dce-replace-banner',role:'status'},h('span',null,'选择要替换的素材'),button('取消',()=>setReplaceMode(false),{className:'quiet'})),
    h('div',{className:'dce-media-scroll',ref:mediaScroll},h('div',{className:libraryTab==='video'?'dce-media-grid':'dce-audio-list'},...mediaItems),!mediaItems.length&&h('div',{className:'dce-library-empty'},icon(libraryTab==='video'?'film':'music',32),h('p',null,libraryTab==='video'?'导入视频开始剪辑':'导入配音或背景音乐'))),
    h('div',{className:'dce-library-selection'},h('span',{role:'status'},libraryAsset?'已选 1 项':'未选择'),libraryTab==='video'?row(button('替换',()=>replaceAsset(libraryAsset),{disabled:disabled||!libraryAsset||!clip}),button('添加',()=>addAsset(libraryAsset),{disabled:disabled||!libraryAsset,className:'primary'})):libraryAsset&&row(button('用作配音',()=>perform(()=>edit({type:'setAudio',role:'voice',assetId:libraryAsset.assetId,volume:1})),{disabled}),button('用作 BGM',()=>perform(()=>edit({type:'setAudio',role:'bgm',assetId:libraryAsset.assetId,volume:.2})),{disabled}))));
  const player=h('div',{className:'dce-preview-pane'},h('div',{className:'dce-preview-stage'},playing&&preview?
    h('video',{key:preview.jobId,ref:video,src:nativePreview?undefined:preview.url,controls:false,playsInline:true,preload:'auto','aria-label':'工程连续预览','aria-busy':preparing}):
    asset?h('div',{className:'dce-preview-canvas'},sourcePosition<videoFrames/30&&h(SourceFrame,{asset,frame:Math.min(displayFrame,asset.ptsUs.length-1),alt:'源素材第 '+(frame+1)+' 帧'}),...timedStickers.filter(s=>stickerVisible(s,Math.round(sourcePosition*30),totalFrames)).map(s=>h(StickerLayer,{key:s.stickerId,p,s,selected:selectedTrack==='sticker'&&s.stickerId===activeSticker?.stickerId,onSelect:id=>{setSelectedTrack('sticker');setSelectedSticker(id);},disabled:busy||job?.status==='running'||!!draft||!!stickerTrim.draft,commit:moveSticker,onMoving:setStickerMoving}))):h('div',{className:'dce-preview-empty'},icon('film',40),h('span',null,'添加镜头后预览'))),
    h('div',{className:'dce-playback'},
      button(icon('previousFrame'),()=>step(observedFrame-1),{disabled:disabled||!observedAsset||observedFrame<=0,className:'dce-transport','aria-label':'前一帧',title:'前一帧（←）'}),
      button(icon(running||preparing?'pause':'play'),play,{disabled:disabled||!clip||!renderAvailable,className:'dce-transport dce-play','aria-label':preparing?'取消预览准备':running?'暂停':'从此处预览',title:'播放 / 暂停（空格）'}),
      button(icon('nextFrame'),()=>step(observedFrame+1),{disabled:disabled||!observedAsset||observedFrame>=observedAsset.ptsUs.length-1,className:'dce-transport','aria-label':'后一帧',title:'后一帧（→）'}),
      h('output',{className:'dce-timecode'},stamp(position),h('span',null,' / '+stamp(total)))),
    observedAsset&&h('div',{className:'dce-source-scrub'},h('span',null,'源帧'),h('input',{type:'range','aria-label':'源素材帧位置',min:0,max:observedAsset.ptsUs.length-1,step:1,value:observedFrame,disabled,onChange:e=>step(Number(e.target.value))}),h('output',{'aria-live':running?'off':'polite'},(observedFrame+1)+' / '+observedAsset.ptsUs.length)));
  const videoProperties=h('aside',{className:'dce-properties','aria-label':'镜头属性'},h('h2',null,clip?'镜头 '+(clipIndex+1):'镜头'),clip?h(React.Fragment,null,
    h('div',{className:'dce-trim-fields'},h('label',{className:'dce-field'},h('span',null,'首帧'),h('input',{type:'number','aria-label':'首帧',min:1,max:asset.ptsUs.length,value:trimIn+1,onChange:e=>setTrimIn(Number(e.target.value)-1)})),
    h('label',{className:'dce-field'},h('span',null,'末帧'),h('input',{type:'number','aria-label':'末帧',min:1,max:asset.ptsUs.length,value:trimOut,onChange:e=>setTrimOut(Number(e.target.value))}))),
    button('应用裁切',()=>perform(()=>edit({type:'trimClip',clipId:clip.clipId,inFrame:trimIn,outFrame:trimOut})),{disabled,className:'primary dce-apply-trim'}),
    button('使用完整素材',()=>perform(()=>edit({type:'restoreClip',clipId:clip.clipId})),{disabled:disabled||(!clip.window&&clip.inFrame===0&&clip.outFrame===asset.ptsUs.length),className:'dce-full'}),
    h('label',{className:'dce-field'},h('span',null,'视频原声'),h('select',{'aria-label':'视频原声音量',value:clip.sourceVolume??1,disabled,onChange:e=>perform(()=>edit({type:'setSourceVolume',clipId:clip.clipId,volume:Number(e.target.value)}))},...[0,.25,.5,.75,1].map(v=>h('option',{key:v,value:v},v===0?'静音':Math.round(v*100)+'%')))),
    h('div',{className:'dce-property-group'},action('swap','替换素材',()=>{setLibraryTab('video');setReplaceMode(true);setMobilePanel('library');mediaScroll.current?.scrollTo({top:0});},{className:'dce-full',disabled}),row(button('前移',()=>perform(()=>edit({type:'moveClip',clipId:clip.clipId,to:clipIndex-1})),{disabled:disabled||clipIndex===0}),button('后移',()=>perform(()=>edit({type:'moveClip',clipId:clip.clipId,to:clipIndex+1})),{disabled:disabled||clipIndex===list.length-1})),button('删除镜头',()=>perform(()=>edit({type:'removeClip',clipId:clip.clipId})),{disabled,className:'quiet dce-danger'}))):h('p',{className:'dce-muted'},'从素材库添加镜头'),
    h('div',{ref:stickerPanel},h(StickerProperties,{key:activeSticker?.stickerId||'new',p,sticker:activeSticker,stickers,clips:list,clipId:clip?.clipId,defaultRange:{startFrame:Math.round((clip?.start||0)*30),endFrame:Math.round(((clip?.start||0)+(clip?.duration||0))*30)},totalFrames,onSelect:setSelectedSticker,onNew:newSticker,edit,perform,disabled,available,onEdit:editSticker,forceOpen:selectedTrack==='sticker'})),
    h('details',{className:'dce-audio-properties',open:!matchMedia('(max-width:760px), (pointer:coarse) and (max-width:1023px)').matches},h('summary',null,'声音'),
      h('label',null,'配音方式',h('select',{'aria-label':'配音方式',value:p.audio.voiceMode||'global',disabled,onChange:e=>perform(()=>edit({type:'setVoiceMode',mode:e.target.value}))},h('option',{value:'global'},'整段配音'),h('option',{value:'clips'},'逐镜头配音'),h('option',{value:'independent'},'独立保留配音'))),
      ...[['voice','配音'],['bgm','BGM']].filter(([role])=>(role!=='voice'||!['clips','independent'].includes(p.audio.voiceMode))&&(role!=='bgm'||p.audio.bgmMode!=='segments')).map(([role,label])=>h('label',{key:role},label,h('select',{'aria-label':label+'素材',value:p.audio[role]?.assetId||'',disabled,onChange:e=>perform(()=>edit({type:'setAudio',role,assetId:e.target.value||null,volume:role==='bgm'?.2:1}))},h('option',{value:''},'无'),...assets.filter(a=>a.kind==='audio').map(a=>h('option',{key:a.assetId,value:a.assetId},a.name)))))),
    selectedTrack==='voice'&&h(VoiceTimelineProperties,{voices,selected:selectedVoice,onSelect:id=>{setSelectedTrack('voice');setSelectedVoice(id);},edit,perform,disabled}),
    selectedTrack==='bgm'&&chosenMusic&&h(MusicTimelineProperties,{key:chosenMusic.musicId+':'+p.revision,music:chosenMusic,totalFrames,edit,perform,disabled}),
    clip&&['clips','independent'].includes(p.audio.voiceMode)&&h(NarrationProperties,{key:clip.clipId,p,clip,assets,disabled,edit,perform,playing:running,onListen:()=>{playback.current?.pause();},}));
  const properties=selectedTrack==='bgm'?h('aside',{className:'dce-properties','aria-label':'音乐属性'},chosenMusic?h(MusicTimelineProperties,{key:chosenMusic.musicId+':'+p.revision,music:chosenMusic,totalFrames,edit,perform,disabled}):h('h2',null,'音乐')):selectedTrack==='voice'?h('aside',{className:'dce-properties','aria-label':'配音属性'},h(VoiceTimelineProperties,{voices,selected:chosenVoice?.voiceId,onSelect:setSelectedVoice,edit,perform,disabled})):videoProperties;
  const duration=draft?.axisSeconds||timelineSeconds(total),width=100*zoom,head=Math.min(100,position/duration*100);
  const timeline=h('div',{className:'dce-timeline'+(reorder.draft?' is-reordering':''),'aria-label':'工程轨道','data-touch-reorder':touchReorder},
    !!(p.draftImport?.warnings?.length||p.draftImport?.pendingGaps?.length)&&h('details',{className:'dce-import-warnings'},h('summary',null,'选片提醒 '+((p.draftImport.warnings?.length||0)+(p.draftImport.pendingGaps?.length||0))),h('p',null,'以下为导入时的提示；替换画面后请重新核对。'),...(p.draftImport.warnings||[]).map((w,i)=>h('p',{key:'w'+i},w.message)),...(p.draftImport.pendingGaps||[]).map((g,i)=>h('p',{key:'g'+i},'待补画面：'+g.text+'（'+(g.frames/30).toFixed(2)+' 秒）'))),
    h('div',{className:'dce-timeline-tools'},
      h('div',{className:'dce-mobile-commands'},
        action('undo','撤销',()=>historyAction('undo'),{disabled:disabled||!history?.canUndo}),action('redo','重做',()=>historyAction('redo'),{disabled:disabled||!history?.canRedo}),
        action('cut','分割',split,{disabled:disabled||!(selectedTrack==='video'?clip:selectedTrack==='sticker'?activeSticker:selectedTrack==='voice'?chosenVoice:chosenMusic)}),action('trash','删除',remove,{disabled:disabled||!(selectedTrack==='video'?clip:selectedTrack==='sticker'?activeSticker:selectedTrack==='voice'?chosenVoice:chosenMusic)}),
        h(EditorMore,null,button(touchReorder?'完成调序':'调序',()=>setTouchReorder(!touchReorder),{'aria-pressed':touchReorder,disabled:disabled||list.length<2}),button('设为首帧',()=>setTrimIn(frame),{disabled:disabled||!clip}),button('设为末帧',()=>setTrimOut(frame+1),{disabled:disabled||!clip}),action('text','添加文字',newSticker,{disabled:disabled||!clip||stickers.length>=120}),stickers.length>0&&button('调整贴片',showSticker,{disabled}))),
      h('div',{className:'dce-timeline-command-groups'},
      row(button('撤销',()=>historyAction('undo'),{disabled:disabled||!history?.canUndo,title:'Ctrl+Z'}),button('重做',()=>historyAction('redo'),{disabled:disabled||!history?.canRedo,title:'Ctrl+Shift+Z'})),
      row(button('分割',split,{disabled:disabled||!clip,title:'Ctrl+B'}),button('删除片段',remove,{disabled:disabled||!clip}),button(touchReorder?'完成调序':'调序',()=>setTouchReorder(!touchReorder),{className:'dce-touch-reorder','aria-pressed':touchReorder,disabled:disabled||list.length<2})),
      row(button('设为首帧',()=>setTrimIn(frame),{disabled:disabled||!clip}),button('设为末帧',()=>setTrimOut(frame+1),{disabled:disabled||!clip})),
      row(action('text','添加文字',newSticker,{disabled:disabled||!clip||stickers.length>=120}),stickers.length>0&&button('调整贴片',showSticker,{disabled}))),
      h('label',{className:'dce-zoom'},icon('search',16),h('input',{type:'range','aria-label':'时间轴缩放',min:1,max:64,step:.25,value:zoom,disabled:!!draft||!!stickerTrim.draft||reorderActive,onChange:e=>setZoom(Number(e.target.value))}))),
    h('div',{className:'dce-timeline-body'},h('div',{className:'dce-track-labels'},h('div',{className:'dce-ruler-label'},'30 fps'),...['贴片','主视频','配音','BGM'].map((name,i)=>h('div',{key:name,className:'dce-track-label '+(i===1?'is-video':''),style:i===0?{height:stickerHeight}:i===2?{height:voiceHeight}:i===3?{height:musicHeight}:undefined},icon(['layers','film','mic','music'][i],18),name))),
      h('div',{className:'dce-timeline-scroll'},h('div',{className:'dce-timeline-content','data-axis-seconds':duration,style:{width:width+'%'}},
        h('div',{className:'dce-ruler'},...Array.from({length:9},(_,i)=>h('span',{key:i,style:{left:i*12.5+'%'}},duration<8?stamp(duration*i/8):shortTime(duration*i/8))),h('input',{type:'range','aria-label':'工程播放位置',min:0,max:duration,step:1/30,value:Math.min(position,Math.max(0,total-1/30)),disabled:disabled||!clip,onChange:e=>scrub(Number(e.target.value))})),
        ...['sticker','video','voice','bgm'].map(name=>h('div',{className:'dce-lane '+(name==='video'?'is-video':''),key:name,style:name==='sticker'?{height:stickerHeight}:name==='voice'?{height:voiceHeight}:name==='bgm'?{height:musicHeight}:undefined},
          name==='video'?[...list.map((c,n)=>{
            const picked=selectedTrack==='video'&&clip?.clipId===c.clipId,original=savedList[n];
            // 左端拖动先显示剪去的空白，松手后主轨吸合；比例尺在整个手势中不变。
            const shift=draft?.edge==='in'&&n>=clipIndex?draft.clip.duration-clip.duration:0;
            return h('div',{key:c.clipId,'data-selected':picked,'data-clip-id':c.clipId,className:'dce-clip'+(draft&&picked?' is-trimming':'')+(reorder.draft?.clipId===c.clipId?' is-reordering':''),style:{left:(c.start+shift)/duration*100+'%',width:c.duration/duration*100+'%'}},
              button(h(React.Fragment,null,h(Thumb,{asset:c.asset,frame:original.inFrame}),h('span',null,'镜头 '+(n+1))),e=>reorder.click(e,original),{'aria-label':'镜头 '+(n+1),'aria-pressed':picked,className:'dce-clip-body',disabled:disabled&&!reorderActive,title:'拖动调整顺序',onPointerDown:e=>reorder.begin(e,original),onDragStart:e=>e.preventDefault()}),
              ...['in','out'].map(edge=>button(h('span',{'aria-hidden':true}),null,{key:edge,className:'dce-trim-handle '+edge,'data-edge':edge,'aria-label':'镜头 '+(n+1)+(edge==='in'?' 首帧裁切':' 末帧裁切'),title:edge==='in'?'拖动调整首帧':'拖动调整末帧',role:'slider','aria-valuemin':edge==='in'?1:c.inFrame+1,'aria-valuemax':edge==='in'?c.outFrame:c.asset.ptsUs.length,'aria-valuenow':edge==='in'?c.inFrame+1:c.outFrame,tabIndex:picked?0:-1,disabled:busy||job?.status==='running'||stickerMoving||!!stickerTrim.draft||reorderActive,onPointerDown:e=>trim.begin(e,original,edge),onKeyDown:e=>trim.key(e,original,edge),onClick:e=>{e.preventDefault();e.stopPropagation();}})),
              draft&&picked&&h('div',{className:'dce-trim-readout',role:'status'},(draft.edge==='in'?'首帧 ':'末帧 ')+(draft.edge==='in'?c.inFrame+1:c.outFrame)+' · '+stamp(c.duration)+(draft.range.limited?' · 已到边界':'')));
          }),reorder.draft&&h(React.Fragment,{key:'reorder-feedback'},reorder.draft.valid&&h('div',{className:'dce-reorder-marker',style:{left:reorder.draft.marker/duration*100+'%'},'aria-hidden':true}),h('div',{className:'dce-reorder-ghost','data-valid':reorder.draft.valid,style:{left:reorder.draft.ghost/duration*100+'%',width:reorder.draft.duration/duration*100+'%'},role:'status'},icon('film',16),reorder.draft.valid?'镜头 '+(reorder.draft.from+1)+' → 第 '+(reorder.draft.to+1)+' 位':'移回时间轴以放置'))]:
          name==='sticker'?timedStickers.filter(s=>s.startFrame<totalFrames&&(s.endFrame??totalFrames)>s.startFrame).map((s,n)=>{
            const r=stickerRange(s,totalFrames),original=stickers.find(x=>x.stickerId===s.stickerId),picked=selectedTrack==='sticker'&&s.stickerId===activeSticker?.stickerId;
            return h('div',{key:s.stickerId,className:'dce-sticker-clip','data-sticker-id':s.stickerId,'data-selected':picked,style:{left:r.startFrame/30/duration*100+'%',width:(Math.min(totalFrames,r.endFrame)-r.startFrame)/30/duration*100+'%',top:`calc(var(--dce-track-row,38px) * ${lanes.rows.get(s.stickerId)||0} + 4px)`}},
              button(s.text,()=>{setSelectedTrack('sticker');setSelectedSticker(s.stickerId);editSticker();},{className:'dce-sticker-body','aria-label':'文字 '+(n+1)+'：'+s.text,disabled}),
              ...['in','out'].map(edge=>button(h('span',{'aria-hidden':true}),null,{key:edge,className:'dce-sticker-trim '+edge,'aria-label':'文字 '+(n+1)+(edge==='in'?' 开始时间':' 结束时间'),role:'slider','aria-valuenow':edge==='in'?r.startFrame:r.endFrame,'aria-valuemin':edge==='in'?0:r.startFrame+1,'aria-valuemax':edge==='in'?r.endFrame-1:totalFrames,tabIndex:picked?0:-1,disabled:busy||job?.status==='running'||!!draft||stickerMoving||reorderActive,onPointerDown:e=>stickerTrim.begin(e,original,edge),onKeyDown:e=>stickerTrim.key(e,original,edge),onClick:e=>e.stopPropagation()})),
              stickerTrim.draft?.stickerId===s.stickerId&&h('output',{className:'dce-sticker-time'},stamp(r.startFrame/30)+' → '+stamp(r.endFrame/30)));
          }):
          name==='voice'?voices.map((v,n)=>button(v.text||assets.find(a=>a.assetId===v.assetId)?.name||'配音',()=>{setSelectedTrack('voice');setSelectedVoice(v.voiceId);editSticker();},{key:v.voiceId,className:'dce-track-block dce-audio-clip voice','data-audio-id':v.voiceId,'aria-label':'配音片段 '+(n+1),'aria-pressed':selectedTrack==='voice'&&chosenVoice?.voiceId===v.voiceId,style:{left:v.startFrame/30/duration*100+'%',width:voiceFrames(v)/30/duration*100+'%',top:`calc(var(--dce-track-row,38px) * ${voiceRows.rows.get(v.voiceId)||0} + 4px)`,height:'calc(var(--dce-track-row,38px) - 8px)',bottom:'auto'},disabled})):
          name==='bgm'?music.filter(m=>m.startFrame<totalFrames).map((m,n)=>button(assets.find(a=>a.assetId===m.assetId)?.name||'BGM',()=>{setSelectedTrack('bgm');setSelectedMusic(m.musicId);editSticker();},{key:m.musicId,className:'dce-track-block dce-audio-clip bgm','data-audio-id':m.musicId,'aria-label':'BGM片段 '+(n+1),'aria-pressed':selectedTrack==='bgm'&&chosenMusic?.musicId===m.musicId,style:{left:m.startFrame/30/duration*100+'%',width:(Math.min(m.endFrame??totalFrames,totalFrames)-m.startFrame)/30/duration*100+'%',top:`calc(var(--dce-track-row,38px) * ${musicRows.rows.get(m.musicId)||0} + 4px)`,height:'calc(var(--dce-track-row,38px) - 8px)',bottom:'auto'},disabled})):
          null)),
        !!clip&&h('div',{className:'dce-playhead',style:{left:head+'%'}},h('span',null))))));
  const resultAction=!exported?action('download','成片',()=>{},{disabled:true,'aria-label':'成片，尚未导出'}):(exported.executionLocation==='android-local'?action('download','成片',()=>perform(()=>shareResult(exported)),{disabled:busy,'aria-label':'分享或保存成片'}):h('a',{href:exported.url+'&download=1',download:'文案剪辑.mp4',className:'dce-download','aria-label':'下载成片'},icon('download',19),h('span',null,'成片')));
  return h(EditorLayout,{library,libraryAction:importButton,player,properties,timeline,mobilePanel,setMobilePanel,mobileActions:h(React.Fragment,null,action('doc','文案',()=>navigate('copy'),{'aria-label':'查看文案'}),resultAction),header:h('div',{className:'dce-editor-topline'},h('span',{className:'dce-editor-title'},displayName),totalFrames>videoFrames&&h('span',{className:'dce-audio-tail',role:'status'},'末尾 '+((totalFrames-videoFrames)/30).toFixed(2)+' 秒只有声音，需补充画面'),row(button('查看文案',()=>navigate('copy')),exported&&(exported.executionLocation==='android-local'?button('分享或保存',()=>perform(()=>shareResult(exported)),{disabled:busy,className:'dce-download'}):h('a',{href:exported.url+'&download=1',download:'文案剪辑.mp4',className:'dce-download'},icon('download',17),'下载视频')),button(h(React.Fragment,null,h('span',{className:'dce-export-full'},'导出 1080P'),h('span',{className:'dce-export-short'},'导出')),()=>perform(()=>startRender('export')),{className:'primary dce-export','aria-label':'导出 1080P',disabled:disabled||!clip||!renderAvailable})))});
}
function Panel({close}){
  const memory=useRef(null);if(!memory.current)memory.current=readPanelMemory(()=>window.sessionStorage);
  const restored=useRef(false),root=useRef(null),layers=useRef(new Map()),durableWritten=useRef({});
  const [route,setRoute]=useState(memory.current.route),[storedWorkspace,setWorkspace]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[job,updateJob]=useState(null),[layerCount,setLayerCount]=useState(0);
  const native=useRef(null),[nativeCapability,setNativeCapability]=useState(null),[nativeResults,setNativeResults]=useState([]);
  const workspace=storedWorkspace?{...storedWorkspace,results:[...storedWorkspace.results,...nativeResults],renderAvailable:!!nativeCapability||storedWorkspace.capabilities.available,importAvailable:!!nativeCapability?.assetImport||storedWorkspace.capabilities.available}:null;
  const {page,projectId}=route;
  const [homeViews,setHomeViews]=useState(homeViewPreferences),homeMemory=useRef(memory.current.home),copyMemory=useRef(memory.current.copy),editors=useRef(memory.current.editors);
  useEffect(()=>{try{localStorage.setItem('dsh-copy-edit.home.views.v1',JSON.stringify(homeViews));}catch{/* 浏览器禁用持久存储时仍可切换。 */}},[homeViews]);
  const alive=useRef(true),drafts=useRef(memory.current.drafts),busyRef=useRef(false);const p=workspace?.projects.find(p=>p.projectId===projectId)||workspace?.projects[0];
  const persist=()=>{if(!restored.current)return;Object.assign(memory.current,{drafts:drafts.current,editors:editors.current,home:homeMemory.current,copy:copyMemory.current});try{writePanelMemory(sessionStorage,memory.current);}catch{/* 独立尝试持久存储；二者均不承载待重放业务。 */}try{writePersistentPanelMemory(()=>window.localStorage,memory.current,durableWritten.current);return true;}catch{if(alive.current)setError('浏览器未能持久保存草稿，请先复制正文并保存版本。');return false;}};
  const setProjectId=id=>{const next={...memory.current.route,projectId:id};memory.current.route=next;setRoute(next);persist();};
  const setJob=value=>{memory.current.job=value?{jobId:value.jobId,status:value.status,projectId:value.projectId,revision:value.revision,profile:value.profile,executionLocation:value.executionLocation}:null;persist();if(alive.current)updateJob(value);};
  const registration=useRef(null);if(!registration.current)registration.current=(handler,priority)=>{const token=Symbol();layers.current.set(token,{handler,priority});setLayerCount(layers.current.size);return()=>{layers.current.delete(token);setLayerCount(layers.current.size);};};
  const reads=useRef(new Set()),readSequence=useRef(0);
  const refresh=async()=>{const controller=new AbortController(),sequence=++readSequence.current;reads.current.add(controller);try{const v=await boundedWorkspaceRead(signal=>rpc('workspace',{}, {signal}),{signal:controller.signal});if(alive.current&&sequence===readSequence.current){if(!restored.current){const persistent=readPersistentPanelMemory(()=>window.localStorage,v),m=memory.current.scope===v.workspaceId?restorePanelMemory(memory.current,v):persistent;memory.current=m;drafts.current=m.drafts;homeMemory.current=m.home;copyMemory.current=m.copy;editors.current=m.editors;durableWritten.current=panelRecoveryBaseline(m,persistent);restored.current=true;setRoute(m.route);updateJob(m.job?.executionLocation==='android-local'?{...m.job,status:'running'}:m.job);}setWorkspace(v);setError('');}return v;}finally{reads.current.delete(controller);}};
  const perform=async fn=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setNotice('');try{return await fn();}catch(e){if(alive.current)setError(e.message);}finally{busyRef.current=false;if(alive.current)setBusy(false);}};
  const edit=async(command,identity)=>{const v=await rpc('mutate',{request:{...(identity||{projectId:p.projectId,expectedRevision:p.revision,operationId:uid()}),command}});await refresh();return v;};
  const navigate=(to,id=memory.current.route.projectId||p?.projectId)=>{const next=navigatePanel(memory.current.route,memory.current.trail,{page:to,projectId:id});Object.assign(memory.current,next);setRoute(next.route);setError('');setNotice('');persist();};
  const back=()=>{const layer=[...layers.current.values()].sort((a,b)=>b.priority-a.priority)[0];if(layer){layer.handler();return;}const previous=memory.current.trail.pop();if(previous){memory.current.route=previous;setRoute(previous);persist();}else if(page!=='home')navigate('home');else{persist();close();}};
  const categoryAction=async command=>{const result=await rpc('library',{request:{expectedRevision:workspace.library.revision,operationId:uid(),command}});await refresh();return result;};
  const voiceAction=async(command,revision)=>{const result=await rpc('voiceSettings',{request:{expectedRevision:revision??workspace.voiceSettings.revision,operationId:uid(),command}});await refresh();return result;};
  const create=(to,category)=>perform(async()=>{const v=await rpc('create',{request:{title:to==='edit'?'未命名工程':'未命名文案',operationId:uid(),...(category?{category}:{})}});await refresh();navigate(to,v.projectId);});
  const startRender=async profile=>{
    if(nativeCapability&&p.audio.timelineVersion===2&&!nativeCapability.segmentedAudio)throw Error('当前原生媒体版本不支持分段音轨，请更新预览 APK');
    const request={projectId:p.projectId,revision:p.revision,profile};
    const v=nativeCapability?await startNativeRender(native.current,request,setJob,uid):await rpc('render',request);setJob(v);return v;
  };
  const jobAction=(action,value,signal)=>value.executionLocation==='android-local'?(native.current&&window.DshaCopyEdit?native.current.call(action,{jobId:value.jobId}):Promise.resolve({status:'retired',error:'原生任务已退出，请重新发起'})):rpc(action,{jobId:value.jobId},{signal});
  const shareResult=async result=>{if(!native.current)throw Error('原生页面已退出');const accepted=await native.current.call('share',{jobId:result.jobId});if(!accepted.accepted)throw Error('分享未受理');for(let n=0;n<60;n++){await new Promise(resolve=>setTimeout(resolve,500));if(!alive.current)return;const state=await native.current.call('shareStatus',{jobId:result.jobId});if(state.status==='opened')return;if(state.status!=='pending')throw Error(state.error||'分享未完成');}throw Error('分享仍在准备，请稍后重试查询');};
  useEffect(()=>{const client=createNativeMediaClient(window.DshaCopyEdit,{newId:uid});native.current=client;let disposed=false;client.capabilities().then(value=>{if(!disposed){setNativeCapability(value);nativeMediaRuntime=value?{client,caps:value}:null;}});return()=>{disposed=true;if(nativeMediaRuntime?.client===client)nativeMediaRuntime=null;if(window.DshaCopyEdit)void client.call('release').catch(()=>{});client.close();if(native.current===client)native.current=null;};},[]);
  useEffect(()=>{alive.current=true;refresh().catch(e=>{if(alive.current&&e.name!=='AbortError')setError(e.message);});const save=()=>persist();window.addEventListener('pagehide',save);return()=>{persist();alive.current=false;window.removeEventListener('pagehide',save);readSequence.current++;for(const controller of reads.current)controller.abort();reads.current.clear();};},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),3500);return()=>clearTimeout(t);},[notice]);
  useEffect(()=>{if(!job||job.status!=='running')return;let disposed=false,inFlight=false;const controller=new AbortController();const t=setInterval(async()=>{if(inFlight)return;inFlight=true;try{const v=await boundedWorkspaceRead(signal=>jobAction('job',job,signal),{signal:controller.signal});if(disposed)return;setJob({...job,...v});if(v.status==='complete'){if(job.executionLocation==='android-local')setNativeResults(previous=>[...previous.filter(r=>r.jobId!==job.jobId),{...job,...v}]);await refresh();}if(v.status==='failed'||v.status==='retired')setError(v.error);}catch(e){if(!disposed)setError(e.message);}finally{inFlight=false;}},700);return()=>{disposed=true;controller.abort();clearInterval(t);};},[job?.jobId,job?.status]);
  const openExample=()=>perform(async()=>{const source={...stickerDefaults,text:'暖色开场\n冷色收尾'};const blob=await new Promise(resolve=>stickerCanvas(source).toBlob(resolve,'image/png'));const asset=await upload(new File([blob],'示例贴片.png',{type:'image/png'}));const sample=await rpc('example',{sticker:{...source,assetId:asset.assetId}});await refresh();navigate('edit',sample.projectId);});
  const labels={home:'文案剪辑',copy:'文案',projects:'剪辑',edit:'剪辑'};
  const depth=memory.current.trail.length+layerCount;
  const header=h('header',{className:'dce-header'},h('div',{className:'dce-breadcrumb'},action('back',page==='home'?'返回对话':'返回',back,{className:'quiet','data-dsh-panel-back':true,'data-dsh-panel-depth':depth,'aria-label':page==='home'?'返回对话':'返回上一级'}),page==='home'?h('strong',{className:'dce-mobile-home-title'},labels.home):h(React.Fragment,null,h('span',{'aria-hidden':true},'/'),h('strong',null,labels[page]))),page==='edit'&&workspace&&h('select',{'aria-label':'选择工程',value:p?.projectId,onChange:e=>setProjectId(e.target.value)},...workspace.projects.map(x=>h('option',{key:x.projectId,value:x.projectId},copySummary(copyDisplayText(x,drafts.current)).name))));
  let body;
  if(!workspace)body=h('div',{className:'dce-loading',role:error?'alert':'status'},error?h(React.Fragment,null,h('p',null,error),button('重新载入',()=>perform(refresh),{disabled:busy})): '正在载入');
  else if(page==='home')body=h(HomeWorkspace,{workspace,drafts,views:homeViews,setViews:setHomeViews,memory:homeMemory,busy,create,perform,categoryAction,refresh,notice:setNotice,open:(id,to)=>navigate(to,id)});
  else if(page==='projects')body=h('div',{className:'dce-projects'},h('div',{className:'dce-page-title'},h('h1',null,'剪辑'),action('plus','新建工程',()=>create('edit'),{className:'primary',disabled:busy})),h('div',{className:'dce-project-grid'},...workspace.projects.map(x=>{const s=sections(x,workspace.assets),total=s.reduce((n,c)=>n+c.duration,0);return button(h(React.Fragment,null,h(Thumb,{asset:s[0]?.asset,frame:s[0]?.inFrame||0}),h('span',{className:'dce-project-description'},h('strong',null,copySummary(copyDisplayText(x,drafts.current)).name),h('span',null,shortTime(total)))),()=>{setProjectId(x.projectId);navigate('edit');},{key:x.projectId,className:'dce-project-card'});}))) ;
  else if(page==='copy')body=h(CopyWorkspace,{p,workspace,setProjectId,create,edit,perform,busy,drafts,persist,forkRecovery:()=>forkPanelRecovery(durableWritten.current),copyMemory,notice:setNotice,navigate,available:workspace.importAvailable,openExample,voiceAction,refresh,job,startRender,reportError:setError});
  else body=h(EditPage,{key:p.projectId,p,displayName:copySummary(copyDisplayText(p,drafts.current)).name,editorMemory:editors,persist,history:workspace.history?.[p.projectId],assets:workspace.assets,results:workspace.results.filter(r=>r.executionLocation==='android-local'||!workspace.capabilities.renderVersion||r.renderVersion===workspace.capabilities.renderVersion),edit,perform,busy,job,startRender,shareResult,navigate,refresh,available:workspace.importAvailable,renderAvailable:workspace.renderAvailable,reportError:setError});
  return h(PanelNavigation.Provider,{value:{register:registration.current}},h('section',{ref:root,className:'dce dce-page-'+page,'aria-label':'文案剪辑工作台','data-dsh-panel-navigation':'v1','data-dsh-panel-depth':depth},header,body,
    workspace&&error&&h('div',{role:'alert',className:'dce-error'},h('span',null,error),button('重新载入',()=>perform(refresh)),button('关闭',()=>setError(''),{className:'quiet'})),
    notice&&h('div',{role:'status',className:'dce-notice'},notice),
    ((workspace&&busy)||job?.status==='running')&&h('div',{className:'dce-pending'},h('span',{role:'status'},job?.status==='running'?(job.profile==='preview'?'正在准备预览':'正在导出'):'处理中'),job?.status==='running'&&h('progress',{'aria-label':job.profile==='preview'?'预览准备进度':'导出进度'}),job?.status==='running'&&button('取消',()=>perform(async()=>setJob({...job,...await jobAction('cancel',job)}))))));
}
exports.inject=['slots','layout'];
exports.apply=function(ctx){
  ctx.effect(()=>{const style=document.createElement('style');style.dataset.plugin=ID;style.textContent=__COPY_EDIT_CSS__;document.head.appendChild(style);return()=>{style.remove();thumbnailCache.clear();};});
  ctx.effect(()=>ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:ID,inject:()=>({close:()=>ctx.layout.selectPanel(null)})},Panel)));
  ctx.effect(()=>ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:ID,order:10,label:()=> '文案剪辑'},()=>icon('film'))));
};
