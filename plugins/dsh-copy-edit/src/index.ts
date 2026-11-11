import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-client-connection';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import path from 'node:path';
import { ProjectStore } from './store.mjs';
import { DesktopMedia } from './desktop-media.mjs';
import { getProject, summary } from './domain.mjs';
import { voiceSettingsView, changeVoiceSettings } from './voice-settings.mjs';
import { compilePlan } from './project.mjs';
import { freezeNativePlan } from './native-media.mjs';
import { NativeImports } from './native-imports.mjs';
import { DraftImports } from './draft-import.mjs';

export const name = 'copy-edit';
export const inject = ['tools', 'connection'];

/** 无设备桥、无密钥读取、无额外 HTTP 服务。 */
export class CopyEditService extends TypertRemoteService {
  store: ProjectStore;
  media: DesktopMedia;
  nativeImports: NativeImports;
  draftImports: DraftImports;
  ready: Promise<void>;
  constructor(ctx: Context) {
    super(ctx, 'copyEdit', { namespace: 'copyEdit' });
    this.store = new ProjectStore(path.join(resolveDshHome(), 'copy-edit'));
    this.media = new DesktopMedia(this.store);
    this.nativeImports = new NativeImports(this.store);
    this.draftImports = new DraftImports(this.store);
    this.ready = this.store.init().then(async () => { await this.media.init(); await this.nativeImports.init(); });
    // 初始化失败仍由调用方读取原错误，避免未处理的拒绝导致整个 DSH 进程退出。
    void this.ready.catch(() => {});
    // 注册随插件撤销，媒体仅使用 DSH 已鉴权的传输，不新增监听端口。
    for (const [route, methods, streaming] of [
      ['upload', ['POST'], true], ['media', ['GET', 'HEAD'], false], ['frame', ['GET'], false], ['native-upload', ['POST'], true], ['native-import', ['GET'], false],
      ['draft/capabilities', ['GET'], false], ['draft/prepare', ['POST'], true], ['draft/commit', ['POST'], true], ['draft/receipt', ['GET'], false], ['draft/map-source', ['POST'], true]
    ] as const) ctx.effect(() => ctx.connection.fetch.register({
      path: '/api/copy-edit/' + route, methods, requestBody: streaming ? 'streaming' : 'buffered',
      fetch: async (request: Request) => {
        try {
          await this.ready;
          if (route.startsWith('draft/')) return await this.draftImports.response(request);
          const url = new URL(request.url);
          if (route === 'native-upload') {
            if (request.headers.get('content-type') !== 'application/octet-stream') return new Response(null, {status: 415});
            return Response.json({ok: true, pending: await this.nativeImports.begin(request.body, url.searchParams.get('name'), request.signal)});
          }
          if (route === 'native-import') return await this.nativeImports.response(url.searchParams.get('importId'));
          if (route === 'upload') {
            if (request.headers.get('content-type') !== 'application/octet-stream') return new Response(null, {status: 415});
            const asset = await this.media.importStream(request.body, url.searchParams.get('name'), request.signal);
            return Response.json({ok: true, asset});
          }
          if (route === 'frame') {
            const bytes = await this.media.frame(url.searchParams.get('assetId'), Number(url.searchParams.get('frame')), request.signal, url.searchParams.get('thumbnail') === '1');
            return new Response(new Uint8Array(bytes), {headers: {'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600'}});
          }
          return await this.media.mediaResponse(request);
        } catch (error) {
          return Response.json({ok: false, error: error instanceof Error ? error.message : '媒体操作失败'}, {status: 400});
        }
      }
    }));
    ctx.effect(() => async () => { await this.ready.catch(() => {}); await this.nativeImports.close(); await this.media.close(); await this.store.close(); });
  }
  @Remote('project')
  async project(projectId: string) { return getProject(projectId); }
  @Remote('describe')
  async describe(projectId: string) {
    if (projectId === 'copy-edit-example') return summary(projectId);
    await this.ready;
    const p = this.store.project(projectId);
    return {projectId: p.projectId, revision: p.revision, title: p.title, schemaVersion: p.schemaVersion};
  }
  @Remote('workspace')
  async workspace() { await this.ready; return {...this.store.view(), voiceSettings: voiceSettingsView(this.store.state), capabilities: this.media.capabilities()}; }
  @Remote('voiceSettings')
  async voiceSettings(request: Record<string, unknown>) { await this.ready; return this.store.write((state: any) => changeVoiceSettings(state, request)); }
  @Remote('mutate')
  async mutate(request: Record<string, unknown>) { await this.ready; return this.store.mutate(request); }
  @Remote('create')
  async create(request: Record<string, unknown>) { await this.ready; return this.store.create(request); }
  @Remote('library')
  async library(request: Record<string, unknown>) { await this.ready; return this.store.library(request); }
  @Remote('render')
  async render(projectId: string, revision: number, profile: string) { await this.ready; return this.media.start(projectId, revision, profile); }
  @Remote('nativePlan')
  async nativePlan(projectId: string, revision: number, profile: string) {
    await this.ready;
    const project = this.store.project(projectId);
    if (project.revision !== revision) throw new Error('工程已更新，请重新发起渲染');
    return freezeNativePlan(compilePlan(project, this.store.state.assets, profile));
  }
  @Remote('nativeImport')
  async nativeImport(importId: string) { await this.ready; return this.nativeImports.describe(importId); }
  @Remote('nativeImportCommit')
  async nativeImportCommit(importId: string, metadata: Record<string, unknown>) { await this.ready; return this.nativeImports.commit(importId, metadata); }
  @Remote('nativeImportDrop')
  async nativeImportDrop(importId: string) { await this.ready; await this.nativeImports.drop(importId); return {retired: true}; }
  @Remote('nativeAsset')
  async nativeAsset(assetId: string) { await this.ready; const asset = this.store.state.assets.find((a: any) => a.assetId === assetId); if (!asset) throw new Error('素材不存在'); return asset; }
  @Remote('job')
  async job(jobId: string) { await this.ready; return this.media.job(jobId); }
  @Remote('cancel')
  async cancel(jobId: string) { await this.ready; return this.media.cancel(jobId); }
  @Remote('example')
  async example(sticker: Record<string, unknown>) { await this.ready; return this.media.example(sticker); }
}

export function apply(ctx: Context) {
  const fiber = ctx.plugin(CopyEditService);
  ctx.tools.register(defineTool({
    name: 'copy_edit_describe',
    description: '只读查询文案剪辑工程的 ID、版本和标题。不会生成、下载或导出媒体。',
    parameters: { projectId: { type: 'string', required: true } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        projectId: { type: 'string', required: true }, revision: { type: 'integer', required: true },
        title: { type: 'string', required: true }, schemaVersion: { type: 'integer', required: true }
      } },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]
    },
    execute: async (args) => {
      await fiber.await();
      const service = ctx.get('copyEdit') as CopyEditService;
      return service.describe(args.projectId);
    }
  }));
}
