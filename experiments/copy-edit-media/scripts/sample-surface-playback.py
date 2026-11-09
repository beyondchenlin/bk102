"""独立模拟器SurfaceFlinger逐帧证据；不把解码器排队通知当作实际显示。"""
import subprocess, pathlib, time, json, sys, hashlib, uuid
from android_evidence import read
root=pathlib.Path(__file__).resolve().parents[3]
out=root/'build/copy-edit-mobile/20261109/stability23'
adb=['D:/demo2/rakazo/android-toolchain/sdk/platform-tools/adb.exe','-s','emulator-5580']
def call(args):return subprocess.check_output(adb+args,timeout=15).decode('utf8',errors='replace')
assert call(['shell','getprop','ro.kernel.qemu']).strip()=='1'
label=sys.argv[1]
seconds=int(sys.argv[2]) if len(sys.argv)>2 else 4
assert seconds in (4,60)
apk=root/'experiments/copy-edit-media/app/build/outputs/apk/debug/app-debug.apk'
sha=hashlib.sha256(apk.read_bytes()).hexdigest()
installed=call(['shell','pm','path','dsh.copyedit.spike']).strip().removeprefix('package:')
assert installed.startswith('/data/app/') and installed.endswith('/base.apk')
assert hashlib.sha256(subprocess.check_output(adb+['exec-out','cat',installed])).hexdigest()==sha
test_apk=root/'experiments/copy-edit-media/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
test_sha=hashlib.sha256(test_apk.read_bytes()).hexdigest()
installed_test=call(['shell','pm','path','dsh.copyedit.spike.test']).strip().removeprefix('package:')
assert installed_test.startswith('/data/app/') and installed_test.endswith('/base.apk')
assert hashlib.sha256(subprocess.check_output(adb+['exec-out','cat',installed_test])).hexdigest()==test_sha
environment={'fingerprint':call(['shell','getprop','ro.build.fingerprint']).strip(),'gles':[line.strip() for line in call(['shell','dumpsys','SurfaceFlinger']).splitlines() if 'GLES:' in line],'size':call(['shell','wm','size']).strip(),'density':call(['shell','wm','density']).strip()}
environment['cpuOnline']=call(['shell','cat','/sys/devices/system/cpu/online']).strip()
environment['webview']=[line.strip() for line in call(['shell','dumpsys','webviewupdate']).splitlines() if 'Current WebView package' in line]
harness=hashlib.sha256((out/'native-preview-harness.html').read_bytes()).hexdigest()
if seconds==60:
 gate=json.loads((out/(sys.argv[3]+'-gate.json')).read_bytes())
 assert gate['passed'] and gate['seconds']==4 and gate['apkSha256']==sha and gate['harnessSha256']==harness
 assert gate['testApkSha256']==test_sha and gate['environment']==environment
method='hybridFour' if seconds==4 else 'hybridMinute'
run_id=str(uuid.uuid4())
with (out/(label+'.log')).open('wb') as log:
 p=subprocess.Popen(adb+['shell','am','instrument','-w','-r','-e','class','dsh.copyedit.spike.NativePreviewTest#'+method,'-e','hybridFourGate','true','-e','evidenceRunId',run_id,'dsh.copyedit.spike.test/dsh.copyedit.spike.EvidenceRunner'],stdout=log,stderr=subprocess.STDOUT)
 samples=[];deadline=time.monotonic()+seconds*3+200;names=[]
 try:
  while p.poll() is None and time.monotonic()<deadline:
   if not names:names=[x.strip() for x in call(['shell','dumpsys','SurfaceFlinger','--list']).splitlines() if x.startswith('SurfaceView - dsh.copyedit.spike/')]
   for name in names:
    assert "'" not in name
    samples.append({'at':time.monotonic(),'layer':name,'latency':call(['shell',"dumpsys SurfaceFlinger --latency '"+name+"'"])})
   # 128项环形证据覆盖约4秒，2秒读一次即可完整覆盖，减少合成器诊断锁开销。
   time.sleep(2 if names else .4)
 finally:
  (out/(label+'-surface.json')).write_text(json.dumps(samples),encoding='utf8')
  if p.poll() is None:p.terminate()
  p.wait(timeout=15)
print('samples',len(samples),'nonempty',sum(len(x['latency'].splitlines())>1 for x in samples))
print((out/(label+'.log')).read_text('utf8',errors='replace')[-1200:])
data=read(adb,'native-hybrid-'+str(seconds)+'.json')
(out/(label+'.json')).write_bytes(data)
receipt=json.loads(data)
assert receipt.get('runId')==run_id,'拒绝读取旧运行证据'
rows={tuple(map(int,l.split())) for x in samples for l in x['latency'].splitlines()[1:] if len(l.split())==3}
by_stamp={row[0]:row for row in rows if all(0<n<2**63-1 for n in row)}
frames=receipt['frames'];missing=[i for i,f in enumerate(frames) if f['releaseNs'] not in by_stamp]
max_gap=0
for i,f in enumerate(frames):
 # 首帧是准备时的静止画面；从第二帧起检查所有正在播放的实际呈现间隔。
 if i%(seconds*30)>1 and i not in missing and i-1 not in missing:
  max_gap=max(max_gap,by_stamp[f['releaseNs']][1]-by_stamp[frames[i-1]['releaseNs']][1])
passed=(b'OK (1 test)' in (out/(label+'.log')).read_bytes() and len(frames)==seconds*30*3 and not missing and receipt['dropped']==0 and receipt['errors']==[] and receipt['maxGapMs']<150 and 0<max_gap<150_000_000 and all(abs(f['ptsUs']-round((i%(seconds*30))*1e6/30))<=1 for i,f in enumerate(frames)))
spans=[];clock_spans=[];expected_span=(seconds*30-2)/30*1000
if len(frames)==seconds*30*3 and not missing:
 for start in range(0,len(frames),seconds*30):
  spans.append((by_stamp[frames[start+seconds*30-1]['releaseNs']][1]-by_stamp[frames[start+1]['releaseNs']][1])/1e6)
  clock_spans.append((frames[start+seconds*30-1]['releaseNs']-frames[start+1]['releaseNs'])/1e6)
# 1倍速由音频时钟安排的release跨度验证；actual跨度还包含首尾显示管线延迟差，单独保留。
# 实际呈现仍须逐帧匹配、零丢帧，冷起播也不豁免150ms活动间隔，不移除任何首尾帧。
passed=passed and len({f['releaseNs'] for f in frames})==len(frames) and len(clock_spans)==3 and all(abs(s-expected_span)<=1000/30 for s in clock_spans)
gate={'passed':passed,'criteriaVersion':'full-display-150ms-clock-span-v3','seconds':seconds,'apkSha256':sha,'testApkSha256':test_sha,'harnessSha256':harness,'environment':environment,'reportSha256':hashlib.sha256(data).hexdigest(),'surfaceSha256':hashlib.sha256((out/(label+'-surface.json')).read_bytes()).hexdigest(),'frames':len(frames),'matched':len(frames)-len(missing),'missingIndices':missing,'maxPresentGapMs':max_gap/1e6,'activeSpansMs':spans,'clockSpansMs':clock_spans,'expectedSpanMs':expected_span,'clockSpanToleranceMs':1000/30,'actualSpanWithinOneFrame':len(spans)==3 and all(abs(s-expected_span)<=1000/30 for s in spans)}
(out/(label+'-gate.json')).write_text(json.dumps(gate,indent=2),'utf8');print(json.dumps(gate),flush=True)
if not passed:sys.exit(1)
