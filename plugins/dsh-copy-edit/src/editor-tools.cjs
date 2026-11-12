// 桌面属性与画布编辑。与文案页复用同一 PNG 生成函数，变换独立持久化。
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function placement(s){const width=clamp(Math.round(Number(s.width??1080)),216,1080),height=400*width/1080;
  return {width,x:clamp(Math.round(Number(s.x??0)),Math.ceil(-width/2),Math.floor(1080-width/2)),y:clamp(Math.round(Number(s.y??230)),Math.ceil(-height/2),Math.floor(1920-height/2))};}
function StickerLayer({p,s,selected,onSelect,disabled,commit,onMoving}){
  const [draft,setDraft]=useState(null),gesture=useRef(null),node=useRef(null);
  const latest=useRef(null);latest.current={p,disabled,commit,onMoving};
  const stop=()=>{const g=gesture.current;if(!g)return;gesture.current=null;g.clean();latest.current.onMoving(false);setDraft(null);};
  useEffect(()=>()=>{const g=gesture.current;if(g){gesture.current=null;g.clean();}},[]);
  useEffect(()=>{stop();},[p.revision,disabled]);
  if(!s)return null;
  function begin(e,mode='move'){
    if(e.button!==0||!e.isPrimary||disabled||gesture.current)return;e.preventDefault();e.stopPropagation();
    onSelect(s.stickerId);const el=e.currentTarget,rect=node.current.parentElement.getBoundingClientRect(),origin=placement(s),g={origin,value:origin,pointer:e.pointerId,revision:p.revision,startX:e.clientX,startY:e.clientY};
    const move=ev=>{if(ev.pointerId!==g.pointer)return;ev.preventDefault();const dx=(ev.clientX-g.startX)*1080/rect.width,dy=(ev.clientY-g.startY)*1920/rect.height;g.value=placement(mode==='resize'?{...origin,width:origin.width+dx}:{...origin,x:origin.x+dx,y:origin.y+dy});setDraft(g.value);};
    const cancel=()=>stop(),key=ev=>{if(ev.key==='Escape'){ev.preventDefault();cancel();}},hide=()=>{if(document.hidden)cancel();};
    const up=ev=>{if(ev.pointerId!==g.pointer)return;move(ev);const value=g.value;stop();if(JSON.stringify(value)!==JSON.stringify(origin))void latest.current.commit(s.stickerId,value,g.revision);};
    const extra=watchAdditionalPointer(g.pointer,cancel);
    g.clean=()=>{extra();window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key,true);document.removeEventListener('visibilitychange',hide);el.removeEventListener('lostpointercapture',cancel);if(el.hasPointerCapture(g.pointer))el.releasePointerCapture(g.pointer);};
    gesture.current=g;el.setPointerCapture(g.pointer);el.addEventListener('lostpointercapture',cancel);window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',key,true);document.addEventListener('visibilitychange',hide);onMoving(true);el.focus();
  }
  const q=draft||placement(s);
  return h('div',{ref:node,className:'dce-sticker-handle',role:'button',tabIndex:disabled?-1:0,'data-sticker-id':s.stickerId,'data-selected':selected,'aria-label':'拖动贴片：'+s.text,'aria-disabled':disabled,onFocus:()=>onSelect(s.stickerId),
    style:{left:q.x/1080*100+'%',top:q.y/1920*100+'%',width:q.width/1080*100+'%'},onPointerDown:begin,
    onKeyDown:e=>{if(disabled||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?10:1;void commit(s.stickerId,placement({...q,x:q.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),y:q.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)}),p.revision);}},
    h('img',{src:'/api/copy-edit/media?assetId='+s.assetId,alt:'工程文字贴片',draggable:false}),selected&&h('span',{className:'dce-sticker-size',role:'slider',tabIndex:disabled?-1:0,'aria-label':'贴片宽度','aria-valuemin':216,'aria-valuemax':1080,'aria-valuenow':q.width,onPointerDown:e=>begin(e,'resize'),onKeyDown:e=>{if(disabled||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();void commit(s.stickerId,placement({...q,width:q.width+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?10:1)}),p.revision);}}));
}
function StickerProperties({p,sticker,stickers,clips,clipId,defaultRange,totalFrames,onSelect,onNew,edit,perform,disabled,available,onEdit,forceOpen=false}){
  const [s,setS]=useState(sticker||stickerDefaults),[pos,setPos]=useState(placement(sticker||stickerDefaults));
  const [bindTo,setBindTo]=useState(sticker?.binding?.clipId||(sticker?'':clipId||''));
  useEffect(()=>{setBindTo(sticker?.binding?.clipId||(sticker?'':clipId||''));},[sticker?.binding?.clipId,clipId]);
  const [range,setRange]=useState(sticker?stickerRange(sticker,totalFrames):defaultRange);
  useEffect(()=>{setS(sticker||stickerDefaults);},[sticker?.assetId]);
  useEffect(()=>{setPos(placement(sticker||stickerDefaults));},[sticker?.x,sticker?.y,sticker?.width]);
  useEffect(()=>{setRange(sticker?stickerRange(sticker,totalFrames):defaultRange);},[sticker?.startFrame,sticker?.endFrame,totalFrames,defaultRange.startFrame,defaultRange.endFrame]);
  const changed=(key,value)=>setS({...s,[key]:value});
  const save=()=>perform(async()=>{
    if(!s.text.trim())throw Error('请填写贴片文字');if(s.text.split('\n').length>4)throw Error('贴片最多 4 行');
    const transform=placement(pos);if(Object.values(transform).some(v=>!Number.isFinite(v)))throw Error('贴片位置不符合要求');
    const blob=await new Promise(resolve=>stickerCanvas(s).toBlob(resolve,'image/png'));
    const a=await upload(new File([blob],'贴片.png',{type:'image/png'}));const value={...s,...transform,assetId:a.assetId};
    const c=clips.find(c=>c.clipId===bindTo);if(!sticker&&c&&(range.startFrame<c.startFrame||range.endFrame>c.startFrame+c.frames))throw Error('绑定文字的时间需在对应镜头内');
    const result=await edit(sticker?{type:'updateSticker',stickerId:sticker.stickerId,sticker:value}:{type:'addSticker',sticker:{...value,...range,...(c?{binding:{clipId:c.clipId,startFrame:range.startFrame-c.startFrame,endFrame:range.endFrame===c.startFrame+c.frames?null:range.endFrame-c.startFrame}}:{})}});
    if(!sticker)onSelect(projectStickers(result).at(-1).stickerId);onEdit();
  });
  return h('details',{className:'dce-sticker-properties',open:forceOpen||!matchMedia('(max-width:760px), (pointer:coarse) and (max-width:1023px)').matches},h('summary',null,'文字贴片'),
    h('div',{className:'dce-sticker-picker'},h('select',{'aria-label':'选择文字贴片',value:sticker?.stickerId||'',disabled,onChange:e=>onSelect(e.target.value)},!sticker&&h('option',{value:''},'新文字'),...stickers.map((s,i)=>h('option',{key:s.stickerId,value:s.stickerId},(i+1)+'. '+(s.text||'未命名文字')))),button('新增',onNew,{disabled:disabled||stickers.length>=120||!totalFrames,'aria-label':'新增文字贴片'})),
    h('label',{className:'dce-field'},h('span',null,'绑定分镜'),h('select',{'aria-label':'文字绑定分镜',value:bindTo,disabled,onChange:e=>{const id=e.target.value;if(sticker)perform(()=>edit({type:'bindSticker',stickerId:sticker.stickerId,clipId:id||null}));else{setBindTo(id);const c=clips.find(c=>c.clipId===id);if(c)setRange({startFrame:c.startFrame,endFrame:c.startFrame+c.frames});}}},h('option',{value:''},'固定在时间轴'),...clips.map((c,i)=>h('option',{key:c.clipId,value:c.clipId},'镜头 '+(i+1))))),
    h('textarea',{'aria-label':'剪辑贴片文字',maxLength:500,value:s.text,placeholder:'输入文字，支持多行',onChange:e=>changed('text',e.target.value)}),
    h('div',{className:'dce-color-fields'},...[['color','文字颜色'],['stroke','描边颜色'],['background','背景颜色']].map(([k,l])=>h('label',{key:k},h('input',{type:'color','aria-label':'剪辑'+l,value:s[k],onChange:e=>changed(k,e.target.value)}),l))),
    h('label',{className:'dce-check'},h('input',{type:'checkbox',checked:s.transparent,onChange:e=>changed('transparent',e.target.checked)}),'透明背景'),
    ...[['x','横向'],['y','纵向'],['width','宽度']].map(([key,label])=>h('label',{className:'dce-field',key},h('span',null,label),h('input',{type:'number','aria-label':'贴片'+label,value:pos[key],step:1,onChange:e=>setPos({...pos,[key]:e.target.value})}))),
    row(button(sticker?'保存文字':'添加文字',save,{disabled:disabled||!available||!totalFrames,className:'primary'}),sticker&&button('应用位置',()=>perform(async()=>{await edit({type:'moveSticker',stickerId:sticker.stickerId,...placement(pos)});onEdit();}),{disabled})),
    ...[['startFrame','开始帧'],['endFrame','结束帧']].map(([key,label])=>h('label',{className:'dce-field',key},h('span',null,label),h('input',{type:'number','aria-label':'贴片'+label,min:1,max:18000,step:1,value:key==='startFrame'?range[key]+1:range[key],onChange:e=>setRange({...range,[key]:Number(e.target.value)-(key==='startFrame'?1:0)})}))),
    h('output',{className:'dce-binding-info'},stamp(range.startFrame/30)+' → '+stamp(range.endFrame/30)),
    sticker&&row(button('应用时间',()=>perform(()=>edit({type:'trimSticker',stickerId:sticker.stickerId,...range})),{disabled}),button('覆盖当前镜头',()=>perform(()=>edit({type:'bindSticker',stickerId:sticker.stickerId,clipId,cover:true})),{disabled:disabled||!clipId})),
    sticker&&row(button('复位位置',()=>perform(async()=>{await edit({type:'moveSticker',stickerId:sticker.stickerId,x:0,y:230,width:1080});onEdit();}),{disabled}),button('删除此文字',()=>perform(async()=>{const next=await edit({type:'removeSticker',stickerId:sticker.stickerId});onSelect(projectStickers(next)[0]?.stickerId||'new');}),{disabled,className:'quiet'})),
    sticker&&sticker.startFrame>=totalFrames&&h('p',{className:'dce-binding-info'},'显示时间在当前片尾之后'));
}
function VoiceTimelineProperties({voices,selected,onSelect,edit,perform,disabled}){
  const v=voices.find(v=>v.voiceId===selected)||voices[0];
  const [range,setRange]=useState({});useEffect(()=>{setRange(v?{startFrame:v.startFrame,inUs:v.inUs,outUs:v.outUs,volume:v.volume}:{});},[JSON.stringify(v)]);
  return h('details',{className:'dce-independent-voice dce-narration-properties',open:true},h('summary',null,'独立配音'),!v?h('p',{className:'dce-muted'},'在镜头文案中添加配音'):h(React.Fragment,null,
    h('select',{'aria-label':'选择独立配音',value:v.voiceId,disabled,onChange:e=>onSelect(e.target.value)},...voices.map((x,i)=>h('option',{key:x.voiceId,value:x.voiceId},(i+1)+'. '+x.text))),
    ...[['startFrame','配音工程开始帧',1,1],['inUs','配音源起点秒',1e6,0],['outUs','配音源终点秒',1e6,0],['volume','配音音量',1,0]].map(([key,label,scale,add])=>h('label',{className:'dce-field',key},h('span',null,label),h('input',{'aria-label':label,type:'number',min:key==='startFrame'?1:0,max:key==='volume'?1:undefined,step:key==='startFrame'?1:.001,value:range[key]===undefined?'':range[key]/scale+add,onChange:e=>setRange({...range,[key]:(Number(e.target.value)-add)*scale})}))),
    v.clipIds?.length>1&&h('p',{className:'dce-binding-info'},'这段配音对应 '+v.clipIds.length+' 个画面片段'),
    row(button('保存配音时间',()=>perform(()=>edit({type:'editVoice',voiceId:v.voiceId,...range,inUs:Math.round(range.inUs),outUs:Math.round(range.outUs)})),{disabled,className:'primary'}),button('删除这段配音',()=>perform(()=>edit({type:'removeVoice',voiceId:v.voiceId})),{disabled}))));
}
function MusicTimelineProperties({music,totalFrames,edit,perform,disabled}){
  const [range,setRange]=useState({startFrame:music.startFrame,endFrame:Math.min(music.endFrame??totalFrames,totalFrames),volume:music.volume});
  return h('section',{className:'dce-narration-properties'},h('h3',null,'音乐片段'),
    ...[['startFrame','开始帧',1],['endFrame','结束帧',0],['volume','音量',0]].map(([key,label,add])=>h('label',{className:'dce-field',key},h('span',null,label),h('input',{'aria-label':'音乐'+label,type:'number',min:key==='volume'?0:1,max:key==='volume'?1:totalFrames,step:key==='volume'?.05:1,value:range[key]+add,disabled,onChange:e=>setRange({...range,[key]:Number(e.target.value)-add})}))),
    row(button('保存',()=>perform(()=>edit({type:'editMusic',musicId:music.musicId,...range})),{disabled,className:'primary'}),button('删除此段',()=>perform(()=>edit({type:'removeMusic',musicId:music.musicId})),{disabled})));
}
function NarrationProperties({p,clip,assets,disabled,edit,perform,playing,onListen}){
  const n=clip.narration,v=n?.voice;
  const [text,setText]=useState(n?.text||''),[copyVersion,setCopyVersion]=useState(n?.copyVersion??null),[assetId,setAssetId]=useState(v?.assetId||''),[start,setStart]=useState((v?.inUs||0)/1e6),[end,setEnd]=useState((v?.outUs||0)/1e6);
  const audio=useRef(null),chosen=assets.find(a=>a.assetId===assetId),[listening,setListening]=useState(false);
  useEffect(()=>{setText(n?.text||'');setCopyVersion(n?.copyVersion??null);setAssetId(v?.assetId||'');setStart((v?.inUs||0)/1e6);setEnd((v?.outUs||0)/1e6);},[JSON.stringify(n)]);
  const stop=()=>{audio.current?.pause();setListening(false);};
  useEffect(()=>{if(playing)stop();},[playing]);
  useEffect(()=>{stop();},[assetId,start,end]);
  useEffect(()=>()=>{audio.current?.pause();},[]);
  const sentences=(p.text.match(/[^。！？!?\n]+[。！？!?]?/g)||[]).map(s=>s.trim()).filter(Boolean);
  const save=()=>perform(()=>edit({type:'setNarration',clipId:clip.clipId,narration:{text,copyVersion,voice:assetId?{assetId,inUs:Math.round(Number(start)*1e6),outUs:Math.round(Number(end)*1e6),volume:v?.volume??1}:null}}));
  const listen=()=>perform(async()=>{if(listening){stop();return;}if(!chosen||!Number.isFinite(Number(start))||Number(start)<0||Number(end)<=Number(start)||Number(end)*1e6>chosen.durationUs)throw Error('请检查配音起止时间');onListen();audio.current.currentTime=Number(start);await audio.current.play();setListening(true);});
  return h('details',{className:'dce-narration-properties',open:true},h('summary',null,'镜头文案与配音'),
    h('select',{'aria-label':'选择文案句子',value:'',disabled,onChange:e=>{setText(e.target.value);setCopyVersion(p.versions.at(-1)?.version??null);}},h('option',{value:''},'从已保存文案选择'),...sentences.map((s,i)=>h('option',{key:i,value:s},s))),
    h('textarea',{'aria-label':'镜头文案句子',value:text,maxLength:2000,placeholder:'这一镜头的文案',onChange:e=>{setText(e.target.value);setCopyVersion(null);}}),
    h('label',null,'配音',h('select',{'aria-label':'镜头配音素材',value:assetId,disabled,onChange:e=>{const a=assets.find(a=>a.assetId===e.target.value);setAssetId(e.target.value);setStart(0);setEnd((a?.durationUs||0)/1e6);}},h('option',{value:''},'无'),...assets.filter(a=>a.kind==='audio').map(a=>h('option',{key:a.assetId,value:a.assetId},a.name)))),
    chosen&&h(React.Fragment,null,...[['配音起点',start,setStart],['配音终点',end,setEnd]].map(([label,value,set])=>h('label',{className:'dce-field',key:label},h('span',null,label+' / 秒'),h('input',{'aria-label':label,type:'number',step:.001,min:0,max:chosen.durationUs/1e6,value,onChange:e=>set(e.target.value)}))),
      h('audio',{ref:audio,src:'/api/copy-edit/media?assetId='+assetId,preload:'metadata',onTimeUpdate:()=>{if(audio.current.currentTime>=Number(end))stop();},onEnded:stop,'aria-label':'镜头配音试听'}),button(listening?'停止试听':'试听此句',listen,{disabled})),
    row(button('保存绑定',save,{disabled,className:'primary'}),n&&button('解除绑定',()=>perform(()=>edit({type:'setNarration',clipId:clip.clipId,narration:null})),{disabled})),
    n?.voice&&h('div',{className:'dce-binding-info'},'配音 '+((n.voice.outUs-n.voice.inUs)/1e6).toFixed(3)+' 秒'+(n.copyVersion?' · V'+n.copyVersion:'')));
}
