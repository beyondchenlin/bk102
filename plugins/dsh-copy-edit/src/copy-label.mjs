// 展示名从正文首句派生，不读写旧标题或工程身份。
export function copySummary(value){
  const body=typeof value==='string'?value.replace(/\r\n?/g,'\n').trim():'';
  if(!body)return {name:'空白文案',rest:''};
  const line=body.split('\n')[0];
  // 英文小数点不分句；保留句末引号及连续问号/感叹号。
  const end=/(?:[。！？!?]+|…{2,}|\.{3,}|\.(?=[”’"'）)\]】》」』]*(?:\s|$)))[”’"'）)\]】》」』]*/.exec(line);
  const length=end?end.index+end[0].length:line.length;
  const sentence=line.slice(0,length).trim(),letters=Array.from(sentence);
  return {name:letters.length>80?letters.slice(0,80).join('')+'…':sentence,rest:body.slice(length).trim()};
}
export function copyDisplayText(project,drafts){
  const draft=drafts?.[project.projectId];
  return typeof draft?.text==='string'?draft.text:typeof project.text==='string'?project.text:'';
}
