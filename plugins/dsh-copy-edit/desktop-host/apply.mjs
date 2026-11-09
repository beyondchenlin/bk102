import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const upstreamSha = '697e5273fa6f7ac7e811b6171a1858fbfd402f556b03d9cc6f0c4808dc72e87b';
const hash = value => createHash('sha256').update(value).digest('hex');
const helper = await fs.readFile(new URL('./shared-hmr.mjs', import.meta.url), 'utf8');
const originalBlock = `const source = new EventSource(EVENTS_ROUTE);
\t\t\t\tsource.addEventListener("message", (event) => {
\t\t\t\t\treceive(event.data);
\t\t\t\t});
\t\t\t\treturn () => {
\t\t\t\t\tsource.close();
\t\t\t\t};`;

export function patchedClient(original) {
  if (hash(original) !== upstreamSha) throw new Error('DSH HMR 原件摘要不匹配，拒绝猜测套用补丁');
  const source = original.toString('utf8');
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const block = originalBlock.replaceAll('\n', newline);
  if (source.split(block).length !== 2 || source.split('function apply(ctx) {').length !== 2) throw new Error('DSH HMR 补丁锚点不唯一');
  return Buffer.from(source.replace('function apply(ctx) {', helper.replace('export function ', 'function ').replaceAll('\r\n', '\n').replaceAll('\n', newline) + newline + '\t\tfunction apply(ctx) {')
    .replace(block, 'return startBrowserHmrEvents(EVENTS_ROUTE, receive, (error) => ctx.logger.error(error));'));
}

export async function applyPatch(runtime, restore = false) {
  const packageDir = path.resolve(runtime, 'node_modules/@deepseek-ai/dsh-client-hmr');
  const meta = JSON.parse(await fs.readFile(path.join(packageDir, 'package.json'), 'utf8'));
  if (meta.name !== '@deepseek-ai/dsh-client-hmr' || meta.version !== '0.2.1-rc.2') throw new Error('只支持已核验的桌面 DSH HMR 0.2.1-rc.2');
  const target = path.join(packageDir, 'lib/client.js');
  const backup = target + '.desktop-shared.original';
  const current = await fs.readFile(target);
  let original = current;
  try { original = await fs.readFile(backup); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const patched = patchedClient(original);
  const targetHash = hash(current);
  if (targetHash !== upstreamSha && targetHash !== hash(patched)) throw new Error('目标含未知修改，停止以免覆盖');
  const next = restore ? original : patched;
  if (targetHash === hash(next)) return { status: 'unchanged', sha256: targetHash };
  if (!restore) {
    try { await fs.writeFile(backup, original, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  // 同目录原子替换，避免文件监听器读取半个脚本。
  const temporary = target + '.desktop-shared.pending';
  await fs.writeFile(temporary, next, { flag: 'wx' });
  try { await fs.rename(temporary, target); }
  finally { await fs.rm(temporary, { force: true }); }
  return { status: restore ? 'restored' : 'patched', sha256: hash(next), originalSha256: upstreamSha };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('用法：node desktop-host/apply.mjs <桌面 runtime 目录> [--restore]');
  console.log(await applyPatch(process.argv[2], process.argv.includes('--restore')));
}
