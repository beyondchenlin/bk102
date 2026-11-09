#!/usr/bin/env python3
"""在任务独占源码快照中制作手机预览输入，不改正式应用或用户数据。"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ID = 'io.github.beyondchenlin.bk102.copyedit.preview'
PLUGIN_SHA = '1cf956b59ccacb5e9eadf9aa315c5d026af5386756b12b57796a04bf776ac28e'


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def replace(path, before, after):
    text = path.read_text(encoding='utf8')
    if text.count(before) != 1:
        raise ValueError('预览源码锚点变化: ' + str(path))
    path.write_text(text.replace(before, after), encoding='utf8')


def source_files():
    names = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT).decode().split('\0')
    allowed = ('app/', 'tools/', 'gradle/', 'ci/', 'components/copy-edit-media/')
    top = {'build.gradle', 'settings.gradle', 'gradle.properties', 'gradlew', 'gradlew.bat', 'local.properties', 'LICENSE'}
    result = {ROOT / name for name in names if name and (name in top or name.startswith(allowed))}
    # 仅补构建所需忽略输入；不读取 build 内的服务配置、项目或认证文件。
    result.add(ROOT / 'local.properties')
    result.update(p for p in (ROOT / 'app/src/main/assets').rglob('*') if p.is_file())
    result.update(p for p in (ROOT / 'tools/recovery-runtime/archives').glob('*.bin'))
    return sorted(p for p in result if p.is_file() and not any(x in p.relative_to(ROOT).parts for x in ('node_modules', 'build', '.gradle', '__pycache__')))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--plugin', required=True)
    parser.add_argument('--prepare', action='store_true')
    args = parser.parse_args()
    output = Path(args.output).resolve()
    boundary = (ROOT / 'build/copy-edit-mobile').resolve()
    if not output.is_relative_to(boundary) or output == boundary or output.exists():
        raise ValueError('输出必须是本任务 build 下尚不存在的独占目录')
    plugin = Path(args.plugin).resolve()
    if sha(plugin) != PLUGIN_SHA:
        raise ValueError('mobile.12 插件摘要不匹配')
    files = source_files()
    total = sum(p.stat().st_size for p in files)
    plan = dict(output=str(output), files=len(files), sourceBytes=total,
                estimatedPeakBytes=4 * 1024**3, reuse='已有 SDK、JDK、Gradle 缓存及已验证减重 rootfs；不新建 worktree',
                cleanup='交付保留 APK、校验记录和源码差异；删除本任务快照和编译缓存',
                freeBefore={drive: shutil.disk_usage(drive).free for drive in ('C:/', 'D:/', 'E:/')},
                pluginSha256=PLUGIN_SHA, applicationId=PACKAGE_ID)
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    if not args.prepare:
        return
    if plan['freeBefore']['E:/'] < plan['estimatedPeakBytes'] + 10 * 1024**3 or plan['freeBefore']['C:/'] < 10 * 1024**3:
        raise ValueError('磁盘余量不足')
    output.mkdir(parents=True)
    write_json(output.parent / 'preview-space-plan.json', plan)
    receipt = []
    for source in files:
        relative = source.relative_to(ROOT)
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        receipt.append(dict(path=relative.as_posix(), bytes=source.stat().st_size, sha256=sha(source)))
    # 复制已校验的优化 rootfs 缓存，不复制任何可写 node_modules/Gradle 工作目录。
    for relative in ('app/build/generated/standard-assets-report.json', 'app/build/generated/standardAssets/offline-rootfs.bin'):
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    assets = output / 'app/src/main/assets'
    plugin_root = assets / 'builtin-plugins/dsh-copy-edit'
    members = []
    with tarfile.open(plugin, 'r:gz') as archive:
        for member in archive:
            name = PurePosixPath(member.name)
            if not member.isfile() or name.parts[0] != 'package' or any(p in ('.', '..') for p in name.parts):
                raise ValueError('插件包路径或成员类型错误')
            relative = PurePosixPath(*name.parts[1:])
            target = plugin_root / str(relative)
            if not target.resolve().is_relative_to(plugin_root.resolve()):
                raise ValueError('插件包路径越界')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.extractfile(member).read())
            members.append(dict(path=relative.as_posix(), sha256=sha(target), bytes=target.stat().st_size))
    registry = json.loads((assets / 'builtin-plugins.json').read_text(encoding='utf8'))
    if any(row['name'] == 'dsh-copy-edit' for row in registry['plugins']):
        raise ValueError('插件已存在，需审阅新基线')
    registry['plugins'].append(dict(name='dsh-copy-edit', guestDirectory='/root/dsha-copy-edit', entrypoint='lib/index.js', internal=False))
    write_json(assets / 'builtin-plugins.json', registry)
    manifest = json.loads((assets / 'managed-runtime-inputs.json').read_text(encoding='utf8'))
    for member in members:
        manifest['installs'].append(dict(asset='builtin-plugins/dsh-copy-edit/' + member['path'],
                                        target='root/dsha-copy-edit/' + member['path'], executable=False))
    write_json(assets / 'managed-runtime-inputs.json', manifest)
    builtins = assets / 'dsha-builtin.txt'
    builtins.write_text(builtins.read_text(encoding='utf8').rstrip() + '\ndsh-copy-edit\n', encoding='utf8')
    gradle = output / 'app/build.gradle'
    replace(gradle, 'applicationId "io.github.beyondchenlin.bk102"', 'applicationId "' + PACKAGE_ID + '"')
    replace(gradle, 'versionCode 190', 'versionCode 19012')
    replace(gradle, 'versionName "0.2.1-rc.2-20261022.2100-dsh0.2.1-rc.2"', 'versionName "0.2.0-mobile.12-preview.20261109"')
    replace(gradle, '    buildTypes {', '''    buildTypes {
        preview {
            debuggable false
            minifyEnabled false
            signingConfig signingConfigs.debug
            matchingFallbacks = ['release']
        }''')
    identity = output / 'app/src/main/java/com/deepseekharness/app/util/AppIdentity.java'
    replace(identity, 'return "io.github.beyondchenlin.bk102";', 'return "' + PACKAGE_ID + '";')
    # 应用显示名沿用用户指定的 BK Harenss；隔离身份由包名及版本表达。
    replace(identity, 'return "BK102";', 'return "BK102-CopyEdit-Preview";')
    replace(identity, 'return false;', 'return true;')
    factory = output / 'app/src/standard/java/com/deepseekharness/app/ui/CopyEditMediaFactory.java'
    replace(factory, 'HOST_DEVICE_VERIFIED=false', 'HOST_DEVICE_VERIFIED=false;\n  // 仅独立预览包授权试用，不表示 ARM64 设备验收通过。\n  private static final boolean PREVIEW_MEDIA_ENABLED=true')
    replace(factory, 'base,current,HOST_DEVICE_VERIFIED)', 'base,current,HOST_DEVICE_VERIFIED || PREVIEW_MEDIA_ENABLED)')
    subprocess.run([sys.executable, '-B', 'tools/generate-builtin-plugins.py'], cwd=output, check=True)
    subprocess.run([sys.executable, '-B', 'tools/prepare-runtime-descriptor.py', '--write'], cwd=output, check=True)
    changed = []
    for row in receipt:
        now = output / row['path']
        if sha(now) != row['sha256']:
            changed.append(dict(path=row['path'], before=row['sha256'], after=sha(now)))
    write_json(output.parent / 'preview-inputs.json', dict(plan=plan, source=receipt, changes=changed, pluginMembers=members))
    print('预览源码准备完成；生产源码未修改；插件成员数:', len(members))


if __name__ == '__main__':
    main()
