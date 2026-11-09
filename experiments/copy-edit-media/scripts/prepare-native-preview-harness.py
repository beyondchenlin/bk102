"""仅把当前播放器源码和自制页面送入指定独立模拟器。"""
import pathlib,subprocess,hashlib,json
from android_evidence import write
root=pathlib.Path(__file__).resolve().parents[3];out=root/'build/copy-edit-mobile/20261109/stability23'
adb=['D:/demo2/rakazo/android-toolchain/sdk/platform-tools/adb.exe','-s','emulator-5580']
assert subprocess.check_output(adb+['shell','getprop','ro.kernel.qemu']).strip()==b'1'
client=(root/'plugins/dsh-copy-edit/src/native-client.mjs').read_text(encoding='utf8').replace('export async function ','async function ').replace('export function ','function ')
player=(root/'plugins/dsh-copy-edit/src/native-preview.mjs').read_text(encoding='utf8').replace('export function ','function ')
html='''<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:12px;font:14px sans-serif}video{display:block;width:240px;height:420px;background:#111}button{height:44px;min-width:100px}</style><video></video><button id=play>播放</button><script>'''+client+'\n'+player+'''
const seconds=__SECONDS__,video=document.querySelector('video'),nextId=()=>crypto.randomUUID();
const client=createNativeMediaClient(window.DshaCopyEdit,{newId:nextId});window.report={errors:[],ended:0,ends:[]};window.failure=null;window.ready=false;
window.start=async(t=0)=>{try{await player.playFrom(t);PlaybackProbe.postMessage('started')}catch(e){window.failure=e.message;report.errors.push(e.message);PlaybackProbe.postMessage('failed')}};
document.querySelector('#play').onclick=()=>start(0);
(async()=>{const job=await client.call('start',{projectId:'native-fixture-'+seconds,revision:1,profile:'preview'});window.job=job;
 for(let i=0;i<240;i++){const value=await client.call('job',{jobId:job.jobId});if(value.status==='complete'){window.player=createNativePreviewPlayer(video,{client,jobId:job.jobId,newId:nextId,onPreparing:x=>window.preparing=x,onRunning:x=>window.running=x,onPosition:x=>report.position=x,onError:e=>report.errors.push(e.message),onEnded:()=>{report.ended++;report.ends.push(report.position);PlaybackProbe.postMessage('ended:'+report.ended)}});window.ready=true;return;}if(value.status!=='running')throw Error(value.error||value.status);await new Promise(r=>setTimeout(r,500));}throw Error('Render deadline');})().catch(e=>window.failure=e.message);
</script>'''
data=html.encode();(out/'native-preview-harness.html').write_bytes(data)
subprocess.run(adb+['reverse','tcp:61329','tcp:61329'],check=True)
write(adb,'native-preview-harness.html',data)
print(json.dumps({'harnessSha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}))
