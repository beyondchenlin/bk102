import {createHash} from 'node:crypto';
// 原生桥只接收冻结计划和已授权资产ID，文件授权由宿主单独完成。
export function freezeNativePlan(plan){
  const {planHash,profile,...value}=plan;
  if(![1,2].includes(value.schemaVersion)||!['preview','export'].includes(profile))throw Error('不支持的原生媒体请求');
  const planJson=JSON.stringify(value);
  if(Buffer.byteLength(planJson)>512*1024||createHash('sha256').update(planJson).digest('hex')!==planHash)throw Error('冻结计划摘要不匹配');
  return Object.freeze({protocol:1,projectId:value.projectId,revision:value.revision,planJson,planHash,profile});
}
export function nativeMediaCapability(provider){
  // 无明确协议/本地执行承诺时保持桌面提供方，不误报手机本地导出。
  return !!provider&&provider.protocol===1&&provider.available===true&&provider.executionLocation==='android-local';
}
