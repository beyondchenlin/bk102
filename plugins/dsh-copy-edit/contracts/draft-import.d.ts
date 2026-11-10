/** 独立于编辑器快照的传输协议；通过现有DSH鉴权通道，不传路径或下载凭据。 */
export interface DraftAsset {assetId:string;sha256:string;bytes:number;kind:'video'|'audio'|'image'}
export interface DraftClip {clipId:string;assetId:string;inUs:number;outUs:number}
export interface DraftSticker {stickerId:string;assetId:string;text:string;color:string;stroke:string;background:string;transparent:boolean;x:number;y:number;width:number;startFrame:number;endFrame:number|null}
export interface DraftVoice {voiceId:string;assetId:string;text:string;inUs:number;outUs:number;startFrame:number;volume:number}
export interface DraftMusic {musicId:string;assetId:string;startFrame:number;endFrame:number|null;offsetSamples:number;volume:number}
export interface DraftGap {gapId:string;startFrame:number;frames:number;text:string;reason:string}
export interface DraftWarning {clipId:string;message:string}
export interface DraftPlan {
  schemaVersion:1;draftId:string;revision:number;requiredCapabilities:string[];
  canvas:{width:1080;height:1920;fps:{numerator:30;denominator:1}};text:string;
  assets:DraftAsset[];clips:DraftClip[];stickers:DraftSticker[];voices:DraftVoice[];music:DraftMusic[];
  warnings:DraftWarning[];gaps:DraftGap[];
}
export interface DraftPrepare {workspaceId:string;operationId:string;plan:DraftPlan}
export interface DraftCommit {workspaceId:string;operationId:string;ticketId:string;planHash:string}
export interface DraftTicket extends DraftCommit {status:'prepared';expiresAt:number}
export interface DraftSourceRange extends DraftClip {inFrame:number;outFrame:number;frames:number;roundingDeltaNumeratorUs:number;roundingDeltaDenominator:30}
export interface DraftReceipt extends DraftCommit {status:'committed';projectId:string;revision:number;capabilities:DraftCapabilities;assetMap:Record<string,string>;sourceRanges:DraftSourceRange[];warnings:DraftWarning[];gaps:DraftGap[]}
export interface DraftCapabilities {
  schemaVersion:1;workspaceId:string;features:string[];
  canvas:{width:1080;height:1920;fps:{numerator:30;denominator:1}};
  maxDurationFrames:1800;maxAssets:64;maxPlanBytes:number;maxRequestBytes:number;
  maxActivePreparations:16;maxReservedOperations:256;mode:'new-candidate';
}
/** POST /api/copy-edit/draft/prepare、commit；GET capabilities、receipt。
 * 返回 {ok:true,value:...} 或 {ok:false,error:{code,field?}}。
 * receipt查询必须携带workspaceId与operationId，not_committed不等于允许更换输入。
 * 同操作同内容重放；同操作不同内容冲突。票据15分钟有效；提交回执不随编辑操作轮换。
 * 新候选导入不写入现有工程。源范围为真实PTS半开区间，不接受平均帧率推算。
 */
