const CATEGORY_FILTER_KEY='dsh-copy-edit.home.categories.v1';
function categoryFilters(){try{const p=JSON.parse(localStorage.getItem(CATEGORY_FILTER_KEY));return {copy:typeof p?.copy==='string'?p.copy:'all',edit:typeof p?.edit==='string'?p.edit:'all'};}catch{return {copy:'all',edit:'all'};}}
function CategoryDialog({kind,library,project,projectIds,onAction,onClose,onRefresh,onAssigned}){
  usePanelLayer(true,()=>{if(!pending)onClose();},30);
  const bulk=!!projectIds,assigning=!!project||bulk,initial=bulk?[...new Set(projectIds.map(id=>library.assignments[kind][id]||''))]:[];
  const dialog=useRef(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[name,setName]=useState(''),[names,setNames]=useState({}),[chosen,setChosen]=useState(bulk?(initial.length===1?initial[0]:'__mixed__'):project?library.assignments[kind][project.projectId]||'':'');
  const label=kind==='copy'?'文案':'剪辑',list=library.categories[kind];
  useEffect(()=>{if(chosen&&chosen!=='__mixed__'&&!list.some(c=>c.categoryId===chosen))setChosen(bulk?'__mixed__':'');},[list,chosen,bulk]);
  useEffect(()=>{const el=dialog.current,previous=document.activeElement;el.showModal();return()=>{el.close();if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
  const run=async(command,done)=>{if(pending)return;setPending(true);setError('');try{await onAction({...command,kind});done?.();}catch(e){setError(e.message);}finally{setPending(false);}};
  const submit=e=>{e.preventDefault();void run({type:'createCategory',name},()=>setName(''));};
  return h('dialog',{ref:dialog,className:'dce-category-dialog','aria-label':(bulk?'批量':'')+label+(assigning?'分类':'分类管理'),onCancel:e=>{e.preventDefault();if(!pending)onClose();}},
    h('div',{className:'dce-category-dialog-heading'},h('h2',null,assigning?(bulk?'批量设置':'设置')+label+'分类':label+'分类'),button('关闭',onClose,{disabled:pending,className:'quiet'})),
    assigning?h('form',{onSubmit:e=>{e.preventDefault();if(chosen==='__mixed__')return;void run(bulk?{type:'assignCategories',projectIds,categoryId:chosen||null}:{type:'assignCategory',projectId:project.projectId,categoryId:chosen||null},()=>{onAssigned?.();onClose();});}},h('p',{className:'dce-category-project'},bulk?'已选 '+projectIds.length+' 个'+label:copySummary(project.text).name),h('label',null,'分类',h('select',{'aria-label':label+'所属分类',value:chosen,disabled:pending,onChange:e=>setChosen(e.target.value)},bulk&&h('option',{value:'__mixed__',disabled:true},'选择分类'),h('option',{value:''},'未分类'),...list.map(c=>h('option',{key:c.categoryId,value:c.categoryId},c.name)))),h('div',{className:'dce-category-dialog-footer'},button('保存',null,{type:'submit',className:'primary',disabled:pending||chosen==='__mixed__'}))):
    h(React.Fragment,null,h('form',{className:'dce-category-add',onSubmit:submit},h('input',{'aria-label':'新分类名称',placeholder:'新分类名称',maxLength:24,value:name,disabled:pending,onChange:e=>setName(e.target.value)}),button('新建',null,{type:'submit',className:'primary',disabled:pending||!name.trim()})),
      h('div',{className:'dce-category-rows'},...list.map(c=>h('form',{key:c.categoryId,className:'dce-category-row',onSubmit:e=>{e.preventDefault();void run({type:'renameCategory',categoryId:c.categoryId,name:names[c.categoryId]??c.name});}},
        h('input',{'aria-label':'分类名称：'+c.name,maxLength:24,value:names[c.categoryId]??c.name,disabled:pending,onChange:e=>setNames(v=>({...v,[c.categoryId]:e.target.value}))}),
        button('保存',null,{type:'submit',disabled:pending||(names[c.categoryId]??c.name)===c.name,'aria-label':'保存分类：'+c.name}),button('删除',()=>run({type:'deleteCategory',categoryId:c.categoryId}),{disabled:pending,'aria-label':'删除分类：'+c.name,title:'仅删除分类，内容移入未分类',className:'quiet'}))))),
    error&&h('div',{className:'dce-category-error',role:'alert'},h('span',null,error),button('刷新分类',async()=>{setPending(true);try{await onRefresh();setError('');}catch(e){setError(e.message);}finally{setPending(false);}},{disabled:pending})));
}
