/** 跨端数据不携带本机路径、Android URI 或进程命令。 */
export type LibraryKind = 'copy' | 'edit';
export interface Category {categoryId:string;name:string}
export interface LibraryView {revision:number;categories:Record<LibraryKind,Category[]>;assignments:Record<LibraryKind,Record<string,string>>}
export type LibraryCommand =
  | {type:'createCategory';kind:LibraryKind;name:string}
  | {type:'renameCategory';kind:LibraryKind;categoryId:string;name:string}
  | {type:'deleteCategory';kind:LibraryKind;categoryId:string}
  | {type:'assignCategory';kind:LibraryKind;projectId:string;categoryId:string|null}
  | {type:'assignCategories';kind:LibraryKind;projectIds:string[];categoryId:string|null};
export interface LibraryRequest {expectedRevision:number;operationId:string;command:LibraryCommand}
export interface CreateProjectRequest {title:string;operationId:string;category?:{kind:LibraryKind;categoryId:string|null}}
export interface Asset {
  assetId: string; sha256: string; bytes: number; name: string;
  kind: 'video' | 'audio' | 'image'; mime: string;
  width?: number; height?: number;
  /** 展示顺序，源首帧归零；不能以平均帧率替代。 */
  ptsUs?: number[]; endUs?: number; originUs?: number; durationUs?: number;
}
export interface Narration {text: string; copyVersion: number | null; voice: {assetId: string; inUs: number; outUs: number; volume: number} | null}
export interface Clip {clipId: string; assetId: string; inFrame: number; outFrame: number; narration?: Narration; window?: {inFrame:number;outFrame:number;offset:number;frames:number}}
export interface Sticker {
  assetId: string; text: string; color: string; stroke: string;
  background: string; transparent: boolean; y: number; x?: number; width?: number;
}
/** 半开区间；null 表示跟随工程片尾（兼容旧全片贴片）。 */
export interface TimedSticker extends Sticker {stickerId: string; startFrame: number; endFrame: number | null; binding?: {clipId:string;startFrame:number;endFrame:number|null}}
export interface VoiceClip {voiceId:string;clipIds:string[];text:string;copyVersion:number|null;assetId:string;inUs:number;outUs:number;volume:number;startFrame:number}
export interface MusicClip {musicId:string;assetId:string;volume:number;startFrame:number;endFrame:number|null;offsetSamples:number}
export interface ProjectSnapshot {
  schemaVersion: 2; projectId: string; revision: number; title: string; text: string;
  /** 新建或成功编辑的真实时间；旧工程允许缺失，不在读取时补写。 */
  updatedAt?: string;
  /** 草案来源与偏差；有pendingGaps时禁止将压缩时间线输出为完整成片。 */
  draftImport?: {schemaVersion:1;draftId:string;revision:number;warnings:{clipId:string;message:string}[];pendingGaps:{gapId:string;startFrame:number;frames:number;text:string;reason:string}[]};
  versions: {version: number; title: string; text: string; savedAt: string}[];
  canvas: {width: 1080; height: 1920; fps: {numerator: 30; denominator: 1}};
  trackOrder: ['sticker','subtitle','overlay','video','voice','bgm'];
  voiceClips?: VoiceClip[]; musicClips?: MusicClip[]; clips: Clip[]; sticker: Sticker | null; stickers?: TimedSticker[];
  audio: {timelineVersion?:2;bgmMode?:'segments';voiceMode?: 'global' | 'clips' | 'independent'; voice: {assetId: string; volume: number} | null; bgm: {assetId: string; volume: number} | null};
}
export type EditCommand =
  | {type:'undo'|'redo'}
  | {type:'splitClip';clipId:string;offsetFrame:number;preserveVoice?:boolean}
  | {type:'splitSticker';stickerId:string;frame:number}
  | {type:'splitVoice';voiceId:string;frame:number}
  | {type:'splitMusic';musicId:string;frame:number}
  | {type:'removeMusic';musicId:string}
  | {type:'editMusic';musicId:string;startFrame:number;endFrame:number;volume:number}
  | {type:'bindSticker';stickerId:string;clipId:string|null;cover?:boolean}
  | {type:'editVoice';voiceId:string;startFrame:number;inUs:number;outUs:number;volume:number}
  | {type:'removeVoice';voiceId:string}
  | {type: 'saveCopy'; title: string; text: string}
  | {type: 'addClip'; assetId: string}
  | {type: 'trimClip'; clipId: string; inFrame: number; outFrame: number}
  | {type: 'replaceClip'; clipId: string; assetId: string}
  | {type: 'removeClip'; clipId: string}
  | {type: 'moveClip'; clipId: string; to: number}
  | {type: 'setSticker'; sticker: Sticker | null}
  | {type: 'moveSticker'; stickerId?: string; x: number; y: number; width: number}
  | {type: 'addSticker'; sticker: Omit<TimedSticker,'stickerId'>}
  | {type: 'updateSticker'; stickerId: string; sticker: Sticker}
  | {type: 'trimSticker'; stickerId: string; startFrame: number; endFrame: number | null}
  | {type: 'removeSticker'; stickerId: string}
  | {type: 'setVoiceMode'; mode: 'global' | 'clips' | 'independent'}
  | {type: 'setNarration'; clipId: string; narration: Narration | null}
  | {type: 'setAudio'; role: 'voice' | 'bgm'; assetId: string | null; volume?: number};
export interface EditRequest {projectId: string; expectedRevision: number; operationId: string; command: EditCommand}
export interface MediaCapabilities {
  contractVersion: 1; provider: string; executionLocation: 'dsh-host' | 'android-device';
  platform: string; surfaceMode: 'rendered-file' | 'native-surface'; available: boolean;
  frameStep: boolean; continuousPreview: boolean; local1080pExport: boolean;
  maxDurationUs: number; maxImportBytes: number; androidNative: boolean;
  /** 渲染语义标识；缓存必须与当前提供方一致，旧结果本身不删除。 */
  renderVersion?: string;
}
export interface MediaJob {
  jobId: string; projectId: string; revision: number; planHash: string;
  renderVersion?: string;
  profile: 'preview' | 'export'; status: 'running' | 'complete' | 'cancelled' | 'failed';
  executionLocation: 'dsh-host' | 'android-device'; totalFrames: number;
  startedAt: string; completedAt?: string; error?: string;
  width?: number; height?: number; durationUs?: number; bytes?: number; sha256?: string;
  /** 临时传输地址，不作为跨端素材引用。 */
  url?: string;
}
export interface MediaProvider {
  capabilities(): MediaCapabilities;
  start(projectId: string, revision: number, profile: 'preview' | 'export'): MediaJob;
  job(jobId: string): MediaJob;
  cancel(jobId: string): Promise<MediaJob>;
  close(): Promise<void>;
}
