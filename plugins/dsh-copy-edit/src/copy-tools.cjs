// 仅负责文案页交互展示；预览画幅不修改工程 canvas 或导出参数。
function CopyAction({text,perform,busy}){
  const [copied,setCopied]=useState(false),timer=useRef(null);
  useEffect(()=>{setCopied(false);clearTimeout(timer.current);return()=>clearTimeout(timer.current);},[text]);
  return action('copy',copied?'已复制':'复制文案',()=>perform(async()=>{
    await navigator.clipboard.writeText(text);setCopied(true);clearTimeout(timer.current);
    timer.current=setTimeout(()=>setCopied(false),2000);
  }),{disabled:busy,className:'dce-copy-main','aria-label':'复制文案','aria-live':'polite'});
}
function CopyStickerFrame({sticker,image,aspect}){
  const landscape=aspect==='16:9',width=landscape?1920:1080,height=landscape?1080:1920,q=placement(sticker);
  return h('span',{className:'dce-copy-frame',style:{'--copy-aspect':width+'/'+height},'data-aspect':aspect},
    sticker.text&&h('img',{src:image,alt:'透明文字贴片在 '+aspect+' 画布中的位置',style:{left:q.x/width*100+'%',top:q.y/height*100+'%',width:q.width/width*100+'%'}}));
}
function CopyMusic({p,projects,assets,edit,perform,busy,available,notice,navigate}){
  const input=useRef(null);
  const music=projectMusic(p),segmented=p.audio.bgmMode==='segments',selected=segmented?(music.length?'segments':''):(p.audio.bgm?.assetId||(p.audio.bgmConfigured?'':'default'));
  const uses=new Map();for(const project of projects)for(const id of new Set(projectMusic(project).map(m=>m.assetId)))uses.set(id,(uses.get(id)||0)+1);
  const audio=assets.filter(a=>a.kind==='audio'),used=audio.filter(a=>uses.has(a.assetId)),frequent=[...(used.length?used:audio)].sort((a,b)=>(uses.get(b.assetId)||0)-(uses.get(a.assetId)||0)).slice(0,3);
  const importMusic=file=>{if(!file)return;void perform(async()=>{
    const asset=await upload(file);if(asset.kind!=='audio')throw Error('请选择音频文件');
    await edit({type:'setAudio',role:'bgm',assetId:asset.assetId,volume:.2});notice('音乐已添加');
  });};
  return h('section',{className:'dce-copy-music','aria-label':'背景音乐'},
    h('div',{className:'dce-attachment-heading'},h('label',{htmlFor:'dce-copy-bgm'},'背景音乐'),action('plus','上传',()=>input.current.click(),{disabled:busy||!available,className:'quiet','aria-label':'上传音乐'})),
    segmented&&music.length>0&&button('调整片段',()=>navigate('edit'),{disabled:busy,'aria-label':'在剪辑中调整音乐片段'}),
    h('div',{className:'dce-copy-music-body'},
      h('div',{className:'dce-copy-frequent','aria-label':'常用背景音乐'},...frequent.map(a=>h('div',{key:a.assetId,className:'dce-music-row','data-selected':selected===a.assetId},h(AudioPreviewButton,{assetId:a.assetId,label:'背景音乐：'+a.name,perform,disabled:busy}),button(h(React.Fragment,null,h('span',{className:'dce-music-name',title:a.name},a.name),h('span',{className:'dce-music-duration'},shortTime(a.durationUs/1e6))),()=>perform(()=>edit({type:'setAudio',role:'bgm',assetId:a.assetId,volume:.2})),{disabled:busy,'aria-label':'使用背景音乐：'+a.name,'aria-pressed':selected===a.assetId}))),!frequent.length&&button('上传音乐',()=>input.current.click(),{disabled:busy||!available})),
      h('div',{className:'dce-copy-music-select'},h('select',{id:'dce-copy-bgm',value:selected,disabled:busy,'aria-label':'全部背景音乐',onChange:e=>perform(()=>edit({type:'setAudio',role:'bgm',assetId:e.target.value||null,volume:.2}))},selected==='default'&&h('option',{value:'default',disabled:true},'生成时使用默认音乐'),h('option',{value:''},'不使用音乐'),segmented&&music.length>0&&h('option',{value:'segments'},music.length+' 个音乐片段'),...audio.map(a=>h('option',{key:a.assetId,value:a.assetId},a.name))))),
    h('input',{ref:input,type:'file',accept:'audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg',hidden:true,'aria-label':'上传背景音乐文件',onChange:e=>{const file=e.target.files[0];e.target.value='';importMusic(file);}}),
    );
}
