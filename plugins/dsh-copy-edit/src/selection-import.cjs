function SelectionImport({workspace,onClose,onImported}){
  const [info,setInfo]=useState(''),[token,setToken]=useState(''),[voice,setVoice]=useState(null),[music,setMusic]=useState(null),[working,setWorking]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const controller=useRef(null);useEffect(()=>()=>controller.current?.abort(),[]);
  usePanelLayer(true,()=>{if(working)controller.current?.abort();else onClose();},20);
  const run=async()=>{
    if(working)return;setWorking(true);setError('');controller.current=new AbortController();const signal=controller.current.signal;
    try{
      const data=JSON.parse(info),origin=selectionSourceOrigin(data.origin),revision=Number(data.revision);
      if(!navigator.locks)throw Error('当前浏览器不支持安全恢复导入，请使用支持 Web Locks 的浏览器');
      const receipt=await navigator.locks.request('dce-import:'+workspace.workspaceId+':'+origin+':'+data.planId+':'+revision,async()=>importSelection({
        origin,token,planId:data.planId,revision,workspaceId:workspace.workspaceId,voiceFile:voice,musicFile:music,
        stickerFile:async text=>{const blob=await new Promise(resolve=>stickerCanvas({...stickerDefaults,text}).toBlob(resolve,'image/png'));if(!blob)throw Error('无法生成文字贴片');return new File([blob],'文字贴片.png',{type:'image/png'});},
        storage:localStorage,fetcher:(url,options)=>fetch(url,{...options,signal}),uploadFile:file=>upload(file,signal),newId:uid,onProgress:setStatus
      }));
      setToken('');await onImported(receipt);
    }catch(e){setError(signal.aborted?'已停止，可再次导入以恢复同一操作。':e instanceof SyntaxError?'请粘贴素材库复制的选片信息':e.message);}
    finally{controller.current=null;setWorking(false);setStatus('');}
  };
  return h('div',{className:'dce-selection-import',role:'dialog','aria-modal':'true','aria-label':'导入素材库选片'},
    h('div',{className:'dce-selection-import-panel'},h('div',{className:'dce-selection-import-head'},h('strong',null,'导入选片'),button('关闭',onClose,{disabled:working,className:'quiet'})),
      h('label',null,'选片信息',h('textarea',{'aria-label':'素材库选片信息',value:info,onChange:e=>setInfo(e.target.value),placeholder:'粘贴素材库中复制的选片信息',disabled:working})),
      h('label',null,'素材库口令',h('input',{type:'password',autoComplete:'off','aria-label':'素材库口令',value:token,onChange:e=>setToken(e.target.value),disabled:working})),
      h('label',null,'配音',h('input',{type:'file',accept:'audio/*','aria-label':'选择配音',onChange:e=>setVoice(e.target.files?.[0]||null),disabled:working})),
      h('label',null,'背景音乐',h('input',{type:'file',accept:'audio/*','aria-label':'选择背景音乐',onChange:e=>setMusic(e.target.files?.[0]||null),disabled:working})),
      h('p',{className:'file-detail'},'未选择的音轨保持为空；导入后可继续添加。素材库口令不会保存。'),
      error&&h('p',{role:'alert',className:'dce-error'},error),status&&h('p',{role:'status'},status),
      button(working?'导入中':'生成可编辑工程',run,{className:'primary',disabled:working||!info||!token}),working&&button('停止',()=>controller.current?.abort())));
}
