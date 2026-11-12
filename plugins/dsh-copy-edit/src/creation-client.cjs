let creationWorker=null,creationObserved={jobs:[]},creationDestination=null;
let nativeLease=null,nativeRetirement=Promise.resolve();
async function acquireNativeRuntime(){
 await nativeRetirement;
 if(!window.DshaCopyEdit)return {provider:null,release(){}};
 if(!nativeLease){const client=createNativeMediaClient(window.DshaCopyEdit,{newId:uid}),item={client,users:0,promise:null};item.promise=client.capabilities().then(caps=>{const provider=caps?{client,caps}:null;if(nativeLease===item)nativeMediaRuntime=provider;return provider;});nativeLease=item;}
 const item=nativeLease;item.users++;let released=false;
 const provider=await item.promise;
 return {provider,release(){if(released)return;released=true;item.users--;if(!item.users){if(nativeLease===item){nativeLease=null;nativeMediaRuntime=null;}if(window.DshaCopyEdit)nativeRetirement=item.client.call('release').catch(()=>{}).finally(()=>item.client.close());else item.client.close();}}};
}
function publishCreationState(state){creationObserved=state;window.dispatchEvent(new CustomEvent('bk-creation-state',{detail:state}));}
async function creationAdapter(){
 const acquired=await acquireNativeRuntime();
 try{if(!acquired.provider?.caps.assetImport){const state=await rpc('workspace');if(!state.capabilities.available){acquired.release();return null;}}}catch(e){acquired.release();throw e;}
 return {release:acquired.release,maxImportBytes:acquired.provider?256*1024**2:512*1024**2,uploadFile:(file,signal)=>upload(file,signal,acquired.provider),stickerFile:async text=>{
  // 固定首句标题预制，可进入剪辑继续改文字、位置和样式。
  const title={...stickerDefaults,text};const blob=await new Promise(resolve=>stickerCanvas(title).toBlob(resolve,'image/png'));
  if(!blob)throw Error('文字贴片生成失败');return new File([blob],'文字贴片.png',{type:'image/png'});
 }};
}
function useCreationState(){
 const [state,setState]=useState(creationObserved);
 useEffect(()=>{const change=e=>setState(e.detail);window.addEventListener('bk-creation-state',change);return()=>window.removeEventListener('bk-creation-state',change);},[]);return state;
}
function CreationChoices({job,workspace,perform,refresh}){
 const [narration,setNarration]=useState('default'),[music,setMusic]=useState('default'),[voice,setVoice]=useState(''),[remember,setRemember]=useState(false);
 const voices=Object.values(workspace.voiceSettings.providers).flatMap(p=>p.voices);
 return h('div',{className:'dce-creation-choices'},
  h('label',null,'旁白',h('select',{value:narration,onChange:e=>setNarration(e.target.value)},h('option',{value:'default'},'沿用当前设置'),h('option',{value:'yes'},'生成旁白'),h('option',{value:'no'},'不加旁白'))),
  voices.length>0&&h('label',null,'声音',h('select',{value:voice,onChange:e=>setVoice(e.target.value)},h('option',{value:''},'沿用当前声音'),...voices.map(v=>h('option',{key:v.voiceId,value:v.voiceId},v.name)))),
  h('label',null,'音乐',h('select',{value:music,onChange:e=>setMusic(e.target.value)},h('option',{value:'default'},'沿用当前音乐'),h('option',{value:'none'},'不加音乐'),...workspace.assets.filter(a=>a.kind==='audio').map(a=>h('option',{key:a.assetId,value:a.assetId},a.name||'音频')))),
  h('label',null,h('input',{type:'checkbox',checked:remember,onChange:e=>setRemember(e.target.checked)}),'记住为默认设置'),
  button('继续生成',()=>perform(async()=>{const options={...(narration!=='default'?{narration:narration==='yes'}:{}),...(music!=='default'?{musicAssetId:music==='none'?null:music}:{}),...(voice?{voiceId:voice}:{})};await rpc('creationControl',{jobId:job.jobId,action:'resume',settings:{...(Object.keys(options).length?{options}:{}),remember}});creationWorker?.wake();await refresh();})));
}
function CreationTasks({workspace,perform,refresh,open}){
 const state=useCreationState(),jobs=state.workspaceId===workspace.workspaceId?state.jobs:workspace.creationJobs;
 if(!jobs?.length)return null;
 return h('section',{className:'dce-creations','aria-label':'视频生成任务'},...jobs.slice(-5).reverse().map(j=>h('article',{key:j.jobId,className:'dce-creation'},
  h('span',{role:'status'},'文案 V'+j.copyVersion+' · '+j.message),j.question&&h('p',null,j.question),...(j.warnings||[]).map((w,i)=>h('p',{key:i},w.message)),
  j.status==='complete'?button('打开剪辑',()=>open(j.projectId)):['queued','running'].includes(j.status)?button('暂停',()=>perform(async()=>{await rpc('creationControl',{jobId:j.jobId,action:'pause'});creationWorker?.abortCurrent(j.jobId);publishCreationState(await rpc('creationState'));})):
  j.status==='needs_input'?h(CreationChoices,{job:j,workspace,perform,refresh}):button('继续',()=>perform(async()=>{await rpc('creationControl',{jobId:j.jobId,action:'resume'});creationWorker?.wake();await refresh();})))));
}
function mountCreationController(ctx){
 let lastSignature='';
 const aside=document.createElement('aside');aside.className='dce-creation-notice';aside.setAttribute('aria-label','视频生成进度');aside.hidden=true;document.body.appendChild(aside);
 const open=job=>{aside.hidden=true;creationDestination=job;ctx.layout.selectPanel(ID);window.dispatchEvent(new CustomEvent('bk-open-creation',{detail:job}));};
 const update=state=>{
  publishCreationState(state);const j=state.jobs.at(-1),signature=JSON.stringify(j);if(signature===lastSignature)return;lastSignature=signature;aside.replaceChildren();aside.hidden=!j;if(!j)return;
  const status=document.createElement('span');status.setAttribute('role','status');status.textContent=j.message;aside.appendChild(status);
  const button=document.createElement('button');button.textContent=j.status==='complete'?'打开剪辑':'查看生成';button.onclick=()=>open(j);aside.appendChild(button);
  const dismiss=document.createElement('button');dismiss.textContent='×';dismiss.setAttribute('aria-label','收起生成提示');dismiss.onclick=()=>{aside.hidden=true;};aside.appendChild(dismiss);
 };
 creationWorker=startCreationWorker({rpc,fetcher:fetch,adapter:creationAdapter,onState:update});
 const hash=()=>{const m=location.hash.match(/^#bk-creation=([-a-f0-9]{36})$/i);if(m)void rpc('creationState').then(state=>{const job=state.jobs.find(j=>j.jobId===m[1]);if(job)open(job);}).catch(()=>{});};
 window.addEventListener('hashchange',hash);hash();
 return()=>{creationWorker?.close();creationWorker=null;window.removeEventListener('hashchange',hash);aside.remove();};
}
