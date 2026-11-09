// 仅启动本任务的独立 DSH_HOME；不读取生产配置或 API Key。
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../../..');
const base=path.join(root,'build/copy-edit-spike'),runtime=path.join(base,'runtime');
const home=path.join(base,'home'),workspace=path.join(base,'workspace');
fs.mkdirSync(home,{recursive:true});fs.mkdirSync(workspace,{recursive:true});
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(API_KEY|TOKEN|SECRET|PASSWORD|DSH_HOME|NODE_OPTIONS)/i.test(k)));
Object.assign(env,{DSH_HOME:home,NARB_DISABLE_NATIVE_CACHE:'1',DSH_TELEMETRY_DISABLED:'1',BROWSER:'true',COPY_EDIT_FFMPEG:'E:/ffmpeg/bin/ffmpeg.exe',COPY_EDIT_FFPROBE:'E:/ffmpeg/bin/ffprobe.exe'});
const cli=path.join(runtime,'node_modules/@deepseek-ai/dsh/lib/bin.js');
const redact=s=>s.replace(/token=[\w-]+/g,'token=[REDACTED]');
async function command(args){
  const child=spawn(process.execPath,[cli,...args],{cwd:workspace,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{log=(log+chunk).slice(-100000);});
  const code=await new Promise(resolve=>child.on('exit',resolve));fs.writeFileSync(path.join(base,'install.log'),redact(log));
  assert.equal(code,0,redact(log.slice(-3000)));
}
const version=JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'../package.json'),'utf8')).version;
await command(['plugin','--profile','web','add',path.join(base,'dsh-copy-edit-'+version+'.tgz'),'--ignore-scripts','--reporter=append-only']);
const hook=path.join(base,'normal-stop.mjs');
fs.writeFileSync(hook,"process.on('message',m=>{if(m?.type==='copy-edit-stop'){process.emit('SIGTERM');if(process.connected)process.disconnect();}});\n");
const child=spawn(process.execPath,['--import',pathToFileURL(hook).href,cli,'web','--no-open','--host','127.0.0.1','--port','0'],{cwd:workspace,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
let log='',exited=false;child.on('exit',()=>{exited=true});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{log=(log+chunk).slice(-500000)});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try {
  let auth;for(let i=0;i<400&&!exited;i++){auth=log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]{43}/)?.[0];if(auth)break;await delay(150);}
  assert(auth,redact(log.slice(-6000)));
  const origin=new URL(auth).origin;
  const exchange=await fetch(auth,{redirect:'manual'});assert.equal(exchange.status,303);
  const cookie=exchange.headers.get('set-cookie').split(';')[0];
  const rpc=async(method,args={})=>{
    const response=await fetch(origin+'/api/'+method,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method,payload:{args}})});
    assert.equal(response.status,200);return (await response.json()).result;
  };
  const project=await rpc('copyEdit/project',{projectId:'copy-edit-example'});
  assert.equal(project.ok,true,JSON.stringify(project));assert.equal(project.value.revision,1);
  const describe=await rpc('copyEdit/describe',{projectId:project.value.projectId});assert.equal(describe.ok,true);
  const inventory=await rpc('pluginInventory/list');assert.equal(inventory.ok,true);
  const entries=inventory.value.entries.filter(row=>row.moduleName==='dsh-copy-edit');assert.equal(entries.length,1);assert.equal(entries[0].fiberPhase,'active');
  const noauth=await fetch(origin+'/api/copyEdit/project',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});assert([401,403].includes(noauth.status));
  const report={status:'PASS',runtime:'0.2.1-rc.2',project:describe.value,inventory:entries,unauthenticatedStatus:noauth.status,origin};
  fs.writeFileSync(path.join(base,'host-report.json'),JSON.stringify(report,null,2));
  // 仅供本次真实浏览器检查使用；令牌不写入公开证据。
  fs.writeFileSync(path.join(base,'browser-auth.json'),JSON.stringify({origin,cookie}));
  console.log(JSON.stringify(report));
  if(process.argv.includes('--hold')){
    console.log('READY_FOR_BROWSER; create build/copy-edit-spike/stop.request to finish');
    for(let i=0;i<2400&&!exited&&!fs.existsSync(path.join(base,'stop.request'));i++)await delay(500);
  }
} finally {
  if(!exited)child.send({type:'copy-edit-stop'});
  for(let i=0;i<100&&!exited;i++)await delay(100);
  fs.writeFileSync(path.join(base,'host.log'),redact(log));
  if(!exited){child.kill();throw Error('Owned CLI failed graceful stop');}
  if(fs.existsSync(path.join(base,'browser-auth.json')))fs.unlinkSync(path.join(base,'browser-auth.json'));
  console.log('Owned DSH host stopped');
}
