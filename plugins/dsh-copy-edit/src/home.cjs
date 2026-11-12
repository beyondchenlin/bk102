// 构建时并入客户端，复用宿主 React 和工作台已有的按钮、缩略图与导航。
function homeViewPreferences(){
  try{const v=JSON.parse(localStorage.getItem('dsh-copy-edit.home.views.v1'))||{};return {copy:v.copy==='list'?'list':'cards',edit:v.edit==='list'?'list':'cards'};}
  catch{return {copy:'cards',edit:'cards'};}
}
function homeDate(value){
  if(!value||!Number.isFinite(Date.parse(value)))return '—';
  const d=new Date(value),now=new Date(),today=d.toDateString()===now.toDateString();
  return today?'今天 '+d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):d.toLocaleDateString('zh-CN',{...(d.getFullYear()!==now.getFullYear()?{year:'numeric'}:{}),month:'numeric',day:'numeric'});
}
function HomeWorkspace({workspace,open,create,busy,views,setViews,memory,perform,notice,categoryAction,refresh,drafts,generate}){
  const [selectionImport,setSelectionImport]=useState(false);
  const [query,setQuery]=useState(memory.current.query||''),scroll=useRef(null);
  const library=workspace.library,[filters,setFilters]=useState(categoryFilters),[categoryDialog,setCategoryDialog]=useState(null);
  const [selection,setSelection]=useState({copy:null,edit:null});
  useEffect(()=>{setFilters(current=>{const next={...current};for(const kind of ['copy','edit'])if(!['all','uncategorized'].includes(current[kind])&&!library.categories[kind].some(c=>c.categoryId===current[kind]))next[kind]='all';return next.copy===current.copy&&next.edit===current.edit?current:next;});},[library]);
  useEffect(()=>{try{localStorage.setItem(CATEGORY_FILTER_KEY,JSON.stringify(filters));}catch{}},[filters]);
  const categoryFor=(p,kind)=>library.categories[kind].find(c=>c.categoryId===library.assignments[kind][p.projectId]);
  const chooseCategory=(kind,value)=>{if(filters[kind]!==value)setSelection(current=>({...current,[kind]:current[kind]===null?null:[]}));setFilters(current=>({...current,[kind]:value}));};
  const selectItem=(kind,id)=>setSelection(current=>current[kind]===null?current:{...current,[kind]:current[kind].includes(id)?current[kind].filter(x=>x!==id):[...current[kind],id]});
  useEffect(()=>{scroll.current.scrollTop=memory.current.scrollTop||0;
    const close=e=>{for(const node of scroll.current?.querySelectorAll('.dce-home-menu[open]')||[]){if(e.type==='keydown'){if(e.key==='Escape'){node.open=false;node.querySelector('summary').focus();}}else if(!node.contains(e.target))node.open=false;}};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};
  },[]);
  const search=value=>{setQuery(value);setSelection(current=>Object.fromEntries(Object.entries(current).map(([kind,ids])=>[kind,ids===null?null:[]])));memory.current.query=value;memory.current.scrollTop=0;scroll.current.scrollTop=0;};
  const content=p=>copyDisplayText(p,drafts.current),name=p=>copySummary(content(p)).name;
  const matches=workspace.projects.filter(p=>content(p).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const entriesFor=kind=>matches.filter(p=>kind==='copy'?!p.creationSource:!workspace.creationJobs?.some(j=>j.sourceProjectId===p.projectId)||p.clips.length>0).filter(p=>filters[kind]==='all'||(filters[kind]==='uncategorized'?!categoryFor(p,kind):library.assignments[kind][p.projectId]===filters[kind]));
  // 刷新后不保留已经离开当前结果集的隐藏选择。
  useEffect(()=>{setSelection(current=>{const next={...current};let changed=false;for(const kind of ['copy','edit'])if(current[kind]!==null){const visible=new Set(entriesFor(kind).map(p=>p.projectId)),ids=current[kind].filter(id=>visible.has(id));if(ids.length!==current[kind].length){next[kind]=ids;changed=true;}}return changed?next:current;});},[workspace,filters,query]);
  const dateFor=(p,kind)=>kind==='copy'?(p.versions.at(-1)?.savedAt||p.updatedAt):p.updatedAt;
  const menu=(p,kind)=>h('details',{className:'dce-home-menu'},h('summary',{'aria-label':name(p)+'更多操作',title:'更多操作'},'⋯'),
    h('div',{className:'dce-home-menu-items'},kind==='copy'&&button('生成视频',e=>{e.currentTarget.closest('details').open=false;perform(()=>generate(p,content(p)));},{disabled:busy||!content(p).trim()}),button('设置分类',e=>{e.currentTarget.closest('details').open=false;setCategoryDialog({kind,project:{...p,text:content(p)}});},{disabled:busy}),button(kind==='copy'?'打开剪辑':'查看文案',()=>open(p.projectId,kind==='copy'?'edit':'copy')),
      button('复制文案',e=>{e.currentTarget.closest('details').open=false;perform(async()=>{await navigator.clipboard.writeText(content(p));notice('已复制');});},{disabled:busy||!content(p)})));
  const item=(p,kind,mode)=>{
    const selecting=selection[kind]!==null,selected=selection[kind]?.includes(p.projectId)||false,label=kind==='copy'?'文案':'剪辑';
    const isCopy=kind==='copy',version=p.versions.at(-1)?.version,clips=isCopy?[]:sections(p,workspace.assets),duration=isCopy?0:timelineLength(p,workspace.assets).totalFrames/30,date=dateFor(p,kind);
    const cover=!isCopy&&h('span',{className:'dce-home-cover'+(!clips.length?' is-empty':'')},h(Thumb,{asset:clips[0]?.asset,frame:clips[0]?.inFrame||0}),!!clips.length&&h('span',{className:'dce-home-play','aria-hidden':true},icon('play',21)),mode==='cards'&&h('span',{className:'dce-home-duration'},clips.length?shortTime(duration):'未添加素材'));
    const category=categoryFor(p,kind),tag=category&&h('span',{className:'dce-category-tag',title:category.name},category.name);
    const summary=copySummary(content(p));
    const title=h('span',{className:'dce-home-item-title'},isCopy&&mode==='list'&&icon('doc',18),h('strong',null,summary.name),mode==='list'&&tag);
    const meta=h('span',{className:'dce-home-version'},version?'V'+version:'草稿');
    const updated=h('time',{className:'dce-home-updated',dateTime:date||undefined,title:date?new Date(date).toLocaleString('zh-CN'):undefined},homeDate(date));
    return h('article',{key:p.projectId,className:'dce-home-item '+(isCopy?'is-copy':'is-edit')+(selected?' is-selected':''),'data-project-id':p.projectId},
      selecting&&h('label',{className:'dce-home-check'},h('input',{type:'checkbox',checked:selected,'aria-label':'勾选'+label+'：'+summary.name,onChange:()=>selectItem(kind,p.projectId)})),
      button(h(React.Fragment,null,cover,title,isCopy&&h('span',{className:'dce-home-excerpt'},summary.rest),!isCopy&&mode==='cards'&&h('span',{className:'dce-home-card-meta'},updated,tag),mode==='list'?(isCopy?meta:h('span',{className:'dce-home-length'},clips.length?shortTime(duration):'—')):null,mode==='list'&&updated),()=>selecting?selectItem(kind,p.projectId):open(p.projectId,kind),{className:'dce-home-open','aria-label':(selecting?'选择':'打开')+label+'：'+summary.name,'aria-pressed':selecting?selected:undefined}),
      mode==='cards'&&h('div',{className:'dce-home-item-footer'},date?updated:null,tag,isCopy&&!selecting&&button('生成视频',()=>perform(()=>generate(p,content(p))),{disabled:busy||!content(p).trim()})),!selecting&&menu(p,kind));
  };
  const section=kind=>{
    const label=kind==='copy'?'文案':'剪辑',mode=views[kind],entries=entriesFor(kind).sort((a,b)=>(Date.parse(dateFor(b,kind))||0)-(Date.parse(dateFor(a,kind))||0)),selecting=selection[kind]!==null,selected=selection[kind]||[],all=entries.length>0&&selected.length===entries.length;
    return h('section',{className:'dce-home-section'+(selecting?' is-selecting':''),'aria-label':label,'data-kind':kind,'data-view':mode},
      h('div',{className:'dce-home-section-heading'},h('div',{className:'dce-home-title-filters'},h('h2',null,label),h('div',{className:'dce-home-categories',role:'group','aria-label':label+'分类筛选'},...[{categoryId:'all',name:'全部'},{categoryId:'uncategorized',name:'未分类'},...library.categories[kind]].map(c=>button(c.name,()=>chooseCategory(kind,c.categoryId),{key:c.categoryId,'aria-label':label+'分类：'+c.name,'aria-pressed':filters[kind]===c.categoryId})),button('管理分类',()=>setCategoryDialog({kind}),{className:'dce-category-manage','aria-label':'管理'+label+'分类',disabled:busy}))),h('div',{className:'dce-home-section-actions'},
        button('多选',()=>setSelection(current=>({...current,[kind]:current[kind]===null?[]:null})),{'aria-label':'多选'+label,'aria-pressed':selecting,className:'dce-home-select-mode',disabled:busy}),
        h('div',{className:'dce-home-view-switch',role:'group','aria-label':label+'显示方式'},...['cards','list'].map(view=>action(view==='cards'?'grid':'list',view==='cards'?'卡片':'列表',()=>setViews(current=>({...current,[kind]:view})),{key:view,'aria-label':label+(view==='cards'?'卡片视图':'列表视图'),'aria-pressed':mode===view}))),
        action('plus',h(React.Fragment,null,h('span',{className:'dce-home-create-full'},kind==='copy'?'新建文案':'新建工程'),h('span',{className:'dce-home-create-short'},'新建')),()=>create(kind,!['all','uncategorized'].includes(filters[kind])?{kind,categoryId:filters[kind]}:undefined),{className:'primary dce-home-create','aria-label':kind==='copy'?'新建文案':'新建工程',disabled:busy||selecting}))),
      selecting&&h('div',{className:'dce-home-bulk',role:'group','aria-label':label+'批量操作'},h('label',null,h('input',{type:'checkbox',checked:all,ref:el=>{if(el)el.indeterminate=selected.length>0&&!all;},disabled:!entries.length,'aria-label':'全选当前'+label+'结果',onChange:()=>setSelection(current=>({...current,[kind]:all?[]:entries.map(p=>p.projectId)}))}),'全选当前结果'),h('span',{className:'dce-home-selected-count',role:'status'},'已选 '+selected.length+' 项'),button('设置分类',()=>setCategoryDialog({kind,projectIds:[...selected]}),{className:'primary','aria-label':'批量设置'+label+'分类',disabled:busy||!selected.length}),button('取消',()=>setSelection(current=>({...current,[kind]:null})),{'aria-label':'取消'+label+'多选',className:'quiet'})),
      !entries.length?h('p',{className:'dce-home-empty'},query?'没有匹配的'+label:filters[kind]!=='all'?'这个分类还没有'+label:kind==='copy'?'还没有文案':'还没有工程'):
      h('div',{className:'dce-home-items is-'+mode},mode==='list'&&h('div',{className:'dce-home-list-heading '+(kind==='copy'?'is-copy':'is-edit'),'aria-hidden':true},h('span',null,'文案首句'),kind==='copy'&&h('span',null,'后续内容'),h('span',null,kind==='copy'?'版本':'时长'),h('span',null,'更新')), ...entries.map(p=>item(p,kind,mode))));
  };
  return h('div',{className:'dce-home',ref:scroll,onScroll:e=>{memory.current.scrollTop=e.currentTarget.scrollTop;}},
    h('div',{className:'dce-home-topline'},h('h1',null,'文案剪辑'),h('label',{className:'dce-search'},icon('search',18),h('input',{type:'search','aria-label':'搜索文案或工程',placeholder:'搜索文案或工程',value:query,onChange:e=>search(e.target.value)})),h('details',{className:'dce-home-menu'},h('summary',{'aria-label':'更多创作操作'},'更多'),h('div',{className:'dce-home-menu-items'},button('高级导入选片',e=>{e.currentTarget.closest('details').open=false;setSelectionImport(true);},{disabled:busy})))),section('copy'),section('edit'),selectionImport&&h(SelectionImport,{workspace,onClose:()=>setSelectionImport(false),onImported:async receipt=>{await refresh();setSelectionImport(false);open(receipt.projectId,'edit');}}),categoryDialog&&h(CategoryDialog,{...categoryDialog,library,onAction:categoryAction,onRefresh:refresh,onClose:()=>setCategoryDialog(null),onAssigned:()=>{if(categoryDialog.projectIds){setSelection(current=>({...current,[categoryDialog.kind]:null}));notice('已更新 '+categoryDialog.projectIds.length+' 项分类');}}}));
}
