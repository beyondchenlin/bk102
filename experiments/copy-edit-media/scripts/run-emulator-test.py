"""显式设备授权后调用；只允许指定 emulator-* 且只操作独立测试包。"""
import argparse, pathlib, subprocess, time, json, hashlib, uuid
from android_evidence import read
root=pathlib.Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--method',choices=['framePreviewExport','exportOnly','diagnose4','previewOnly','minute','rawSurface','cacheLifecycle','nativeContract'],default='framePreviewExport');parser.add_argument('--gate');parser.add_argument('--adb',default='D:/demo2/rakazo/android-toolchain/sdk/platform-tools/adb.exe');parser.add_argument('--software-preview',action='store_true',help='独立对照：仅播放使用系统软件解码器');args=parser.parse_args()
if not args.serial.startswith('emulator-'): raise SystemExit('此脚本只接受模拟器序列号')
out=root/'build/copy-edit-spike'/('android-'+time.strftime('%Y%m%d-%H%M%S'));out.mkdir(parents=True)
base=[args.adb,'-s',args.serial]
boot_deadline=time.monotonic()+120
while True:
    boot=subprocess.run(base+['shell','getprop','sys.boot_completed'],capture_output=True,timeout=10)
    if boot.returncode==0 and boot.stdout.strip()==b'1':break
    if time.monotonic()>=boot_deadline:raise SystemExit('模拟器尚未完成启动，未安装测试包')
    time.sleep(1)
fingerprint=subprocess.check_output(base+['shell','getprop','ro.build.fingerprint']).decode().strip()
apk=root/'experiments/copy-edit-media/app/build/outputs/apk/debug/app-debug.apk'
apk_hash=hashlib.sha256(apk.read_bytes()).hexdigest()
run_id=str(uuid.uuid4())
if args.method=='minute':
    if not args.gate:raise SystemExit('60 秒必须指定通过的 4 秒报告 --gate')
    gate=json.loads(pathlib.Path(args.gate).read_text(encoding='utf8'))
    if not (gate.get('passed') and gate.get('strictFourSecondGate') and gate.get('apkSha256')==apk_hash and gate.get('fingerprint')==fingerprint and gate.get('softwarePreview',False)==args.software_preview):raise SystemExit('4 秒门禁失败、APK/模拟器/播放解码器不一致')
(out/'device.json').write_text(json.dumps({'serial':args.serial,'fingerprint':fingerprint,'apkSha256':apk_hash,'method':args.method,'gate':args.gate,'runId':run_id,'softwarePreview':args.software_preview}),encoding='utf8')
for apk in ['debug/app-debug.apk','androidTest/debug/app-debug-androidTest.apk']:
    installed=subprocess.run(base+['install','-r',str(root/'experiments/copy-edit-media/app/build/outputs/apk'/apk)],capture_output=True,timeout=120)
    log=installed.stdout+installed.stderr
    with (out/'install.log').open('ab') as install_log:install_log.write(log[:1048576])
    print(log.decode('utf8',errors='replace'),flush=True)
    if installed.returncode:raise SystemExit('安装失败，见 install.log')
command=base+['shell','am','instrument','-w','-r','-e','class','dsh.copyedit.spike.MediaSpikeTest#'+args.method,'-e','evidenceRunId',run_id,'dsh.copyedit.spike.test/dsh.copyedit.spike.EvidenceRunner']
if args.method=='minute':command[-1:-1]=['-e','fourSecondGate','true']
if args.software_preview:command[-1:-1]=['-e','softwarePreview','true']
run=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
lines=[]
with (out/'instrumentation.log').open('wb') as log:
    for line in run.stdout:
        log.write(line);log.flush();lines.append(line.decode('utf8',errors='replace'));print(lines[-1],end='',flush=True)
code=run.wait()
produced=set()
evidence_current=False
for name in (['raw-surface.json'] if args.method=='rawSurface' else ['evidence.json','export-4s.mp4','export-60s.mp4','preview-4s.mp4','preview-60s.mp4','sticker.png']):
    if name.endswith('.mp4') and name not in produced:continue
    try:content=read(base,'media-spike/'+name)
    except (AssertionError,subprocess.SubprocessError):continue
    valid=(name.endswith('.json') and content.lstrip().startswith(b'[')) or (name.endswith('.mp4') and content[4:8]==b'ftyp') or (name.endswith('.png') and content.startswith(b'\x89PNG\r\n\x1a\n'))
    if valid:
        if name=='evidence.json' and not any(e.get('type')=='run-start' and e.get('id')==run_id for e in json.loads(content)):
            print('拒绝读取旧运行的 evidence.json',flush=True);continue
        (out/name).write_bytes(content)
        if name=='evidence.json':
            evidence_current=True
            produced={e['file'] for e in json.loads(content) if e['type'] in ['export-completed','preview-cache-ready']}
(root/'build/copy-edit-spike/latest-android.json').write_text(json.dumps({'directory':str(out)}),encoding='utf8')
passed=code==0 and any('OK (1 test)' in line for line in lines) and (args.method=='rawSurface' or evidence_current)
print(json.dumps({'passed':passed,'evidence':str(out)}),flush=True)
raise SystemExit(0 if passed else 1)
