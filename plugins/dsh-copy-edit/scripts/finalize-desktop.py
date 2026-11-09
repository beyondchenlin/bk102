"""冻结本次独立插件与证据；核对原有宿主文件，不操作设备。"""
import pathlib,json,hashlib,shutil,datetime
root=pathlib.Path(__file__).resolve().parents[3];base=root/'build/copy-edit-desktop'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((root/'build/copy-edit-spike/baseline.json').read_text(encoding='utf8'))
changed=[name for name,expected in baseline['existingChangedFiles'].items() if sha(root/name)!=expected]
assert not changed,changed
sources={str(p.relative_to(root)).replace('\\','/'):sha(p) for p in (root/'plugins/dsh-copy-edit').rglob('*') if p.is_file() and not any(n in p.parts for n in ['node_modules','lib'])}
package=root/'build/copy-edit-spike/dsh-copy-edit-0.2.0-desktop.2.tgz'
browser=base/'browser-20261108'
assert sha(browser/'browser-export.mp4')==sha(browser/'browser-export-v2.mp4')
for name in ['readback-report.json','final-ui-report.json','final-playback.json','mid-preview.json']:
    assert (browser/name).exists()
assert json.loads((base/'host-check.json').read_text())['status']=='PASS'
assert json.loads((base/'media-qAIFzT/boundary-readback.json').read_text())['pass']
state=root/'build/copy-edit-spike/home/copy-edit'
assert not (state/'writer.lock').exists()
assert not (root/'build/copy-edit-spike/browser-auth.json').exists()
assert list((state/'incoming').iterdir())==[]
sizes={p.name:sum(f.stat().st_size for f in p.rglob('*') if f.is_file()) for p in base.iterdir() if p.is_dir()}
report={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'package':{'path':str(package),'bytes':package.stat().st_size,'sha256':sha(package)},
 'hostFilesUnchanged':len(baseline['existingChangedFiles']),'sources':sources,'artifactLogicalBytes':sizes,
 'diskFreeGiB':{drive:round(shutil.disk_usage(drive+':/').free/1024**3,2) for drive in ['C','D','E']},
 'cleanup':{'testStoreLocksReleased':True,'hostAuthRemoved':True,'hostIncomingEmpty':True,'newWorktrees':0},
 'desktopScope':'Windows / DSH 0.2.1-rc.2 / native FFmpeg; Android native integration not performed'}
(base/'final-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k!='sources'},ensure_ascii=False))
