#!/usr/bin/env python3
"""复用本任务已存在的独立预览构建目录，只更新冻结插件与诊断版本。"""
import argparse,hashlib,json,re,shutil,subprocess,sys,tarfile
from pathlib import Path,PurePosixPath

ROOT=Path(__file__).resolve().parents[1]
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def main():
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--plugin',type=Path,required=True);p.add_argument('--sha256',required=True);p.add_argument('--evidence',type=Path,required=True);a=p.parse_args()
 source=a.source.resolve();evidence=a.evidence.resolve()
 assert source.is_relative_to((ROOT/'build/copy-edit-mobile').resolve()) and source.name=='source'
 assert evidence.is_relative_to((ROOT/'build/copy-edit-mobile').resolve()) and evidence.is_dir()
 assert digest(a.plugin)==a.sha256
 gradle=source/'app/build.gradle';text=gradle.read_text(encoding='utf8');assert 'applicationId "io.github.beyondchenlin.bk102.copyedit.preview"' in text
 free={d:shutil.disk_usage(d).free for d in ('C:/','D:/','E:/')};assert free['E:/']>12*1024**3 and free['C:/']>10*1024**3
 plan=dict(target=str(source),estimatedPeakAdditionalBytes=1024**3,reuse='既有预览源码、生成资产、SDK/JDK和依赖缓存；不新建工作树',freeBefore=free)
 write(evidence/'apk-update-space-plan.json',plan)
 receipt_path=source.parent/'preview-inputs.json';receipt=json.loads(receipt_path.read_text(encoding='utf8'))
 before=evidence/'previous-preview-inputs.json'
 if before.exists():assert before.read_bytes()==receipt_path.read_bytes(),'前次更新已经写入，不能覆盖恢复回执'
 else:shutil.copyfile(receipt_path,before)
 pluginroot=source/'app/src/main/assets/builtin-plugins/dsh-copy-edit'
 members={}
 with tarfile.open(a.plugin,'r:gz') as archive:
  for row in archive:
   path=PurePosixPath(row.name);assert row.isfile() and path.parts[0]=='package' and '..' not in path.parts
   relative=PurePosixPath(*path.parts[1:]).as_posix();assert not relative.startswith('/') and ':' not in relative and '\\' not in relative
   members[relative]=archive.extractfile(row).read()
 package=json.loads(members['package.json']);assert package['name']=='dsh-copy-edit'
 match=re.fullmatch(r'0\.2\.0-mobile\.(\d+)',package['version']);assert match
 previous_members={v['path'] for v in receipt['pluginMembers']}
 assert previous_members<=set(members) and set(members)-previous_members<={'lib/audio-timing.mjs','lib/native-preview.mjs'}
 for row in receipt['pluginMembers']:assert digest(pluginroot/row['path'])==row['sha256'],'预览输入已被其他任务改动'
 for relative,data in members.items():(pluginroot/relative).write_bytes(data)
 # 包内存在不等于会安装。每次更新都同步完整成员映射，新增模块也必须进入受管树。
 manifest_path=source/'app/src/main/assets/managed-runtime-inputs.json'
 manifest=json.loads(manifest_path.read_text(encoding='utf8'));prefix='builtin-plugins/dsh-copy-edit/';target_prefix='root/dsha-copy-edit/'
 for row in manifest['installs']:
  if row['asset'].startswith(prefix) or row['target'].startswith(target_prefix):
   assert row['asset'].startswith(prefix) and row['target']==target_prefix+row['asset'][len(prefix):],'插件安装映射不一致'
 manifest['installs']=[row for row in manifest['installs'] if not row['asset'].startswith(prefix)]
 manifest['installs'].extend(dict(asset=prefix+name,target=target_prefix+name,executable=False) for name in sorted(members))
 write(manifest_path,manifest)
 version=package['version'];code=19000+int(match[1])
 text,count=re.subn(r'versionCode 19\d{3}\b','versionCode '+str(code),text);assert count==1
 text,count=re.subn(r'versionName "0\.2\.0-mobile\.\d+-preview\.20261109"','versionName "'+version+'-preview.20261109"',text);assert count==1
 gradle.write_text(text,encoding='utf8')
 subprocess.run([sys.executable,'-B','tools/prepare-runtime-descriptor.py','--write'],cwd=source,check=True)
 receipt['pluginMembers']=[dict(path=k,sha256=hashlib.sha256(v).hexdigest(),bytes=len(v)) for k,v in members.items()]
 receipt['plan']['pluginSha256']=a.sha256;receipt['pluginVersion']=version;receipt['versionCode']=code
 for change in receipt['changes']:
  change['after']=digest(source/change['path'])
  saved=evidence/'source-overrides'/change['path'];saved.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/change['path'],saved)
 write(receipt_path,receipt);write(evidence/'preview-inputs.json',receipt)
 print(json.dumps(dict(pluginVersion=version,versionCode=code,pluginSha256=a.sha256,freeBefore=free),ensure_ascii=False))
if __name__=='__main__':main()
