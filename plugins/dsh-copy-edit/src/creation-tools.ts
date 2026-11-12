import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { CopyEditService } from './index.js';
import { digest } from './project.mjs';
import { voiceSettingsView } from './voice-settings.mjs';

const optionSchema = {
  type: 'object', additionalProperties: false, description: '仅填写用户明确选择；省略沿用文案设置和默认值。musicAssetId 用已登记音频 ID，不加音乐时用空串。',
  properties: {
    narration: {type: 'boolean'}, voiceId: {type: 'string'}, speed: {type: 'number', enum: [.75,1,1.25,1.5]},
    musicAssetId: {type: 'string'}, musicVolume: {type: 'number'}, sourceVolume: {type: 'number'}, targetFrames: {type: 'integer'}
  }
} as const;
const options = (value: any) => value ? {...value, ...(value.musicAssetId === '' ? {musicAssetId: null} : {})} : {};
const output = {
  schema: {type: 'object', additionalProperties: false, properties: {result: {type: 'string', required: true}}},
  render: (_args: any, value: any) => [{type: 'text' as const, text: value.result}]
} as const;
const answer = (v: any) => ({result: JSON.stringify(v)});

export function registerCreationTools(ctx: Context, service: () => Promise<CopyEditService>) {
  ctx.tools.register(defineTool({name: 'copy_edit_context',
    description: '读取 BK 创作上下文、已保存文案版本、分类、音色/音乐选项与生成任务。先读后改。仅改文案时保存；只有用户明确要制作视频且接受完整文案时，才自动调用 copy_edit_confirm 的 video 意图。不要让用户复制选片信息、输入操作码或逐步确认选片配音。',
    parameters: {projectId: {type: 'string', description: '省略时返回文案列表，指定时返回全文和版本。'}}, output,
    execute: async args => {
      const s=await service(),v=s.store.view(),voices=voiceSettingsView(s.store.state);
      return answer({workspaceId:s.store.workspaceId,projects:args.projectId?[s.store.project(args.projectId)]:v.projects.map((p:any)=>({projectId:p.projectId,revision:p.revision,title:p.title,copyVersion:p.versions.at(-1)?.version,creationSource:p.creationSource||null})),library:v.library,
        voices:Object.entries(voices.providers).flatMap(([source,p]:[string,any])=>p.voices.map((v:any)=>({source,voiceId:v.voiceId,name:v.name}))),
        audio:v.assets.filter((a:any)=>a.kind==='audio').map((a:any)=>({assetId:a.assetId,name:a.name,durationUs:a.durationUs})),connections:await s.creation.connectionsView(),jobs:s.creation.jobs.list()});
    }
  }));
  ctx.tools.register(defineTool({name:'copy_edit_confirm',
    description:'保存用户接受的文案。intent=copy 用于只修改/保存文案，不生成视频。intent=video 仅用于已经明确要做视频且已接受完整文案的任务，保存后自动选片、配音、配音乐并生成可编辑时间线，无需再问是否执行各步骤。不能把泛泛的“好”或局部句子认可当作整篇确认。先读取现有文案的 projectId/revision；新文案省略这两项。分类只能选已有分类；不改变手动分类。已配置默认值直接使用，缺少信息只按返回内容集中询问。返回 queued 只表示已开始，不能声称已经完成。保持工作台页面打开即可自动执行；可用 copy_edit_task 查询。',
    parameters:{intent:{type:'string',enum:['copy','video'],required:true},text:{type:'string',required:true},projectId:{type:'string'},expectedRevision:{type:'integer'},categoryId:{type:'string'},variant:{type:'boolean',description:'只有用户明确要求再做一版时设为 true'},options:optionSchema},output,
    execute:async(args,execution)=>{
      const s=await service();return answer(await s.creation.confirm({...args,options:options(args.options),operationId:'chat-'+digest(execution.callId).slice(0,48)}));
    }
  }));
  ctx.tools.register(defineTool({name:'copy_edit_task',
    description:'查询、暂停或继续同一个创作任务。缺少声音/音乐时根据用户回答通过 options 补充，避免重建任务。只有用户要求记住时设置 remember=true。配音服务回执不确定时不能自行重复付费合成；用户明确同意重试该段后才可设 retrySpeech=true。完成时把返回 openUrl 用作“打开剪辑”的 Markdown 链接；未完成如实报告状态。',
    parameters:{jobId:{type:'string',required:true},action:{type:'string',enum:['status','pause','resume'],required:true},options:optionSchema,remember:{type:'boolean'},retrySpeech:{type:'boolean'}},output,
    execute:async args=>{
      const s=await service();if(args.action==='status')return answer(s.creation.jobs.public(s.creation.jobs.row(args.jobId)));
      return answer(await s.creation.control(args.jobId,args.action,{options:args.options?options(args.options):undefined,remember:args.remember,retrySpeech:args.retrySpeech}));
    }
  }));
}
