#!/usr/bin/env python3
"""校验精确预览 APK，运行真实注册脚本的小型隔离首装/启停夹具。"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--apk', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--expected-plugin-version', default='0.2.0-mobile.12')
    parser.add_argument('--receipt', type=Path, help='复用已有构建目录时指定本轮冻结清单')
    args = parser.parse_args()
    assets = args.source / 'app/src/main/assets'
    receipt = json.loads((args.receipt or args.source.parent / 'preview-inputs.json').read_text(encoding='utf8'))
    registry = json.loads((assets / 'builtin-plugins.json').read_text(encoding='utf8'))
    plugin = json.loads((assets / 'builtin-plugins/dsh-copy-edit/package.json').read_text(encoding='utf8'))
    assert plugin['version'] == args.expected_plugin_version
    checks = []
    with zipfile.ZipFile(args.apk) as apk:
        names = apk.namelist()
        manifest = json.loads(apk.read('assets/managed-runtime-inputs.json'))
        descriptor = json.loads(apk.read('assets/runtime-descriptor.json'))
        # 后端 ESM 导入不能证明网页能解析：直接检查交付 APK 内的完整客户端脚本。
        client = apk.read('assets/builtin-plugins/dsh-copy-edit/lib/client.js')
        parsed = subprocess.run(['node', '--check', '--input-type=commonjs'], input=client,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)
        assert parsed.returncode == 0, parsed.stdout.decode('utf8', errors='replace')
        checks.append('精确APK内完整文案剪辑前端脚本解析通过')
        assert json.loads(apk.read('assets/builtin-plugins.json')) == registry
        assert 'dsh-copy-edit' in apk.read('assets/dsha-builtin.txt').decode().splitlines()
        prefix='builtin-plugins/dsh-copy-edit/'
        expected_installs={prefix+row['path']:'root/dsha-copy-edit/'+row['path'] for row in receipt['pluginMembers']}
        actual_installs=[row for row in manifest['installs'] if row['asset'].startswith(prefix) or row['target'].startswith('root/dsha-copy-edit/')]
        assert len(actual_installs)==len(expected_installs) and {row['asset']:row['target'] for row in actual_installs}==expected_installs, '插件文件未完整进入运行时安装清单'
        assert all(row.get('executable') is False for row in actual_installs)
        for row in receipt['pluginMembers']:
            assert sha(apk.read('assets/builtin-plugins/dsh-copy-edit/' + row['path'])) == row['sha256']
        for row in manifest['installs']:
            assert sha(apk.read('assets/' + row['asset'])) == descriptor['inputs'][row['asset']], row['asset']
        contract = {k: v for k, v in descriptor.items() if k not in ('version', 'runtimeId')}
        assert sha(json.dumps(contract, sort_keys=True, separators=(',', ':')).encode()) == descriptor['runtimeId']
        assert {n.split('/')[1] for n in names if n.startswith('lib/')} == {'arm64-v8a'}
        assert not any('web-state' in n or 'browser-auth' in n or 'state.json' in n or 'copy-edit-spike' in n for n in names)
        assert 'assets/offline-rootfs.bin' in names and 'assets/dsh-runtime.bin' in names
        if int(plugin['version'].rsplit('.', 1)[1]) >= 23:
            dex = b''.join(apk.read(n) for n in names if n.startswith('classes') and n.endswith('.dex'))
            for name in ('NativePreview', 'PreviewCodec', 'NativePreviewAudio', 'DrainAudioOutput', 'PcmPlaybackClock', 'AudioTailPadding'):
                assert ('Lcom/deepseekharness/media/' + name + ';').encode() in dex, name
            assert b'Ldsh/copyedit/spike/' not in dex
            assert b'native-plan-v4/media3-1.11.1/' in dex
            checks.append('实际DEX包含原生缓存播放器、PCM排空时钟与v4缓存契约，不含独立验收Activity')
        checks.extend([str(len(receipt['pluginMembers']))+' 个插件文件与冻结 '+plugin['version']+' 包逐字节一致', '全部受管安装文件与 APK 描述符摘要一致',
                       'APK 插件注册清单和默认启用清单一致', 'ARM64 原生库及离线环境齐全', '无测试工程、服务认证文件或调试网页夹具'])

    # 读取真实随包依赖版本与 bundle 元数据，避免用电脑测试服务的模块证明 ARM64 包内容。
    # React 是浏览器共享模块，实际包含在 DSH 前端入口中，不是 Node 安装目录。
    required = (set(plugin['peerDependencies']) - {'react'}) | set(plugin['dsh']['client']['inject']) | {row['name'] for row in registry['officialBundles']}
    runtime_packages = {}
    frontend_react = None
    with tarfile.open(assets / 'dsh-runtime.bin', 'r|gz') as archive:
        for entry in archive:
            if entry.isfile() and '/dsh-web-frontend/dist/assets/index-' in entry.name and entry.name.endswith('.js'):
                data = archive.extractfile(entry).read()
                assert b'react.production.min.js' in data and b'return{react:' in data and b'"react/jsx-runtime":' in data
                frontend_react = dict(path=entry.name, sha256=sha(data))
            if not entry.isfile() or not entry.name.endswith('/package.json') or entry.size > 1024 * 1024:
                continue
            if '/node_modules/' not in entry.name:
                continue
            value = json.load(archive.extractfile(entry))
            if value.get('name') in required:
                runtime_packages.setdefault(value['name'], value)
    assert required <= set(runtime_packages), required - set(runtime_packages)
    assert frontend_react is not None
    for name, version in plugin['peerDependencies'].items():
        if name == 'react':
            continue
        actual = runtime_packages[name]['version']
        if not version.startswith(('~', '^')):
            assert actual == version, (name, actual, version)
    checks.append('随包 DSH 归档含 Node 依赖、三个界面注入模块及浏览器共享 React；固定依赖版本吻合')

    # 小夹具只验证注册/链接/禁用意图；不称为 Android/proot 冷启动验收。
    with tempfile.TemporaryDirectory(prefix='registration-', dir=args.source.parent) as directory:
        fixture = Path(directory).resolve()
        assert fixture.is_relative_to(args.source.parent.resolve())
        # 从精确APK按真实安装清单展开；不能复制整个源码插件目录来掩盖漏装文件。
        managed_roots=[row['guestDirectory'].lstrip('/')+'/' for row in registry['plugins']]
        with zipfile.ZipFile(args.apk) as apk:
            for row in manifest['installs']:
                if any(row['target'].startswith(prefix) for prefix in managed_roots):
                    target=(fixture/row['target']).resolve()
                    assert target.is_relative_to(fixture)
                    target.parent.mkdir(parents=True,exist_ok=True)
                    target.write_bytes(apk.read('assets/'+row['asset']))
        # 这两条真实ESM依赖链分别覆盖后端音频时序与网页原生播放器模块；无需设备或用户库。
        node=shutil.which('node');assert node, 'Node.js required for installed module import verification'
        entries=['project.mjs']+(['native-preview.mjs'] if int(plugin['version'].rsplit('.',1)[1])>=23 else [])
        for name in entries:
            entry=fixture/'root/dsha-copy-edit/lib'/name
            result=subprocess.run([node,'--input-type=module','-e','await import(process.argv[1])',entry.as_uri()],capture_output=True,text=True,encoding='utf8',timeout=30)
            assert result.returncode==0, result.stderr
        checks.append('按实际APK安装清单展开后，后端时序和原生预览ESM依赖链真实导入通过')
        runtime = fixture / 'usr/local/lib/node_modules/@deepseek-ai/dsh'
        runtime.mkdir(parents=True)
        (runtime / 'package.json').write_text(json.dumps(dict(name='@deepseek-ai/dsh', version='0.2.1-rc.2')), encoding='utf8')
        for name, value in runtime_packages.items():
            target = runtime / 'node_modules' / name / 'package.json'
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(value), encoding='utf8')
        shutil.copyfile(assets / 'dsha-builtin.txt', fixture / 'root/dsha-builtin.txt')
        env = {**os.environ, 'DSHA_TEST_ROOT': str(fixture), 'DSH_HOME': '/root/.dsh', 'PYTHONIOENCODING': 'utf-8'}
        script = assets / 'register-builtin-plugins.py'
        def run(*arguments):
            result = subprocess.run([sys.executable, '-B', str(script), *arguments], env=env, text=True,
                                    encoding='utf8', capture_output=True, timeout=30)
            assert result.returncode == 0, result.stdout + result.stderr
        profile = fixture / 'root/.dsh/profiles/web'
        def selected():
            return json.loads((profile / 'package.json').read_text(encoding='utf8'))['dsh']['profile']['bundles']
        run()
        assert 'dsh-copy-edit' in selected()
        link = profile / 'node_modules/dsh-copy-edit'
        assert link.resolve() == fixture / 'root/dsha-copy-edit'
        assert (link / 'node_modules/@deepseek-ai/dsh-typert-protocol/package.json').is_file()
        first = (profile / 'package.json').read_bytes()
        run()
        assert (profile / 'package.json').read_bytes() == first
        run('--disable', 'dsh-copy-edit')
        run()
        assert 'dsh-copy-edit' not in selected()
        run('--enable', 'dsh-copy-edit')
        assert 'dsh-copy-edit' in selected() and link.is_dir()
        checks.extend(['真实注册脚本首次注册并链接到内置插件', '重复注册不改变 profile', '原生禁用后重启注册不复活，重新启用成功'])
    h = hashlib.sha256()
    with args.apk.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    result = dict(apk=str(args.apk.resolve()), bytes=args.apk.stat().st_size, sha256=h.hexdigest(),
                  pluginVersion=plugin['version'], runtimeId=descriptor['runtimeId'], checks=checks,
                  dependencyVersions={k: v['version'] for k, v in runtime_packages.items()}, frontendReact=frontend_react, passed=True,
                  limits=['未在 ARM64 手机实际首启', '本工具仅核对APK与注册流程，播放和设备验收以本轮独立报告为准', 'Web 设置关闭新增内置插件的重启保持未适配；原生插件页启停已经夹具验证'])
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
