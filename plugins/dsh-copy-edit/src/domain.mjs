// 时间轴用整数帧，源裁剪用实际 PTS；两者不能混用。
export function frameToUs(frame, numerator = 30, denominator = 1) {
  for (const n of [frame, numerator, denominator]) if (!Number.isSafeInteger(n) || n < 0) throw Error('INVALID_TIME');
  if (!numerator || !denominator) throw Error('INVALID_RATE');
  const value = BigInt(frame) * 1000000n * BigInt(denominator) / BigInt(numerator);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('TIME_OVERFLOW');
  return Number(value);
}
export function selectPts(points, timeUs) {
  if (!Number.isSafeInteger(timeUs) || timeUs < 0 || !points.length) throw Error('INVALID_TIME');
  for (let i=0;i<points.length;i++) if (!Number.isSafeInteger(points[i]) || points[i]<0 || (i>0 && points[i]<=points[i-1])) throw Error('INVALID_PTS');
  let lo=0, hi=points.length;
  while(lo<hi) { const mid=(lo+hi)>>>1; if(points[mid]<=timeUs)lo=mid+1;else hi=mid; }
  if(!lo) throw Error('BEFORE_FIRST_FRAME');
  return lo-1;
}
export const sampleProject = Object.freeze({
  schemaVersion: 1, projectId: 'copy-edit-example', revision: 1,
  title: '留一点时间给自己',
  text: '把忙碌暂时放下。\n给自己一杯咖啡的时间。\n慢一点，也很好。',
  sticker: { kind: 'transparent-png-source', lines: ['慢一点', '也很好'], color: '#ffffff', stroke: '#202020' },
  canvas: { width: 1080, height: 1920, fps: { numerator: 30, denominator: 1 } },
  tracks: ['sticker', 'subtitle', 'overlay', 'video', 'voice', 'bgm'],
  media: { provider: 'none', frameStep: false, continuousPreview: false, local1080pExport: false }
});
export function getProject(projectId) {
  if(projectId !== sampleProject.projectId) throw Error('PROJECT_NOT_FOUND');
  return structuredClone(sampleProject);
}
export function summary(projectId) {
  const p=getProject(projectId);
  return { projectId:p.projectId, revision:p.revision, title:p.title, schemaVersion:p.schemaVersion };
}
