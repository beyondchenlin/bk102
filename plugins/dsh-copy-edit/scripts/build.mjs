import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {Script} from 'node:vm';
const root=path.resolve(import.meta.dirname,'..');
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc')],{cwd:root,stdio:'inherit'});
const trim=fs.readFileSync(path.join(root,'src/trim.cjs'),'utf8');
const preview=fs.readFileSync(path.join(root,'src/preview.cjs'),'utf8');
const body=fs.readFileSync(path.join(root,'src/client.cjs'),'utf8')
  .replace('__COPY_EDIT_SELECTION_IMPORT__',fs.readFileSync(path.join(root,'src/selection-import.mjs'),'utf8').replaceAll('export function ','function ').replaceAll('export async function ','async function ')+'\n'+fs.readFileSync(path.join(root,'src/selection-import.cjs'),'utf8'))
  .replace('__COPY_EDIT_COPY_LABEL__',fs.readFileSync(path.join(root,'src/copy-label.mjs'),'utf8').replaceAll('export function ','function '))
  .replace('__COPY_EDIT_NATIVE_CLIENT__',fs.readFileSync(path.join(root,'src/native-client.mjs'),'utf8').replaceAll('export function ','function ').replaceAll('export async function ','async function '))
  .replace('__COPY_EDIT_NATIVE_PREVIEW__',fs.readFileSync(path.join(root,'src/native-preview.mjs'),'utf8').replaceAll('export function ','function '))
  .replace('__COPY_EDIT_CLIENT_MEMORY__',fs.readFileSync(path.join(root,'src/client-memory.mjs'),'utf8').replaceAll('export function ','function '))
  .replace('__COPY_EDIT_WORKSPACE_LOAD__',fs.readFileSync(path.join(root,'src/workspace-load.mjs'),'utf8').replaceAll('export async function ','async function '))
  .replace('__COPY_EDIT_COPY_RESIZE_LOGIC__',fs.readFileSync(path.join(root,'src/copy-resize.mjs'),'utf8').replaceAll('export function ','function '))
  .replace('__COPY_EDIT_COPY_RESIZE_UI__',fs.readFileSync(path.join(root,'src/copy-resize.cjs'),'utf8'))
  .replace('__COPY_EDIT_REORDER_LOGIC__',fs.readFileSync(path.join(root,'src/reorder.mjs'),'utf8').replaceAll('export function ','function '))
  .replace('__COPY_EDIT_REORDER_UI__',fs.readFileSync(path.join(root,'src/reorder.cjs'),'utf8'))
  .replace('__COPY_EDIT_LAYOUT_LOGIC__',fs.readFileSync(path.join(root,'src/editor-layout.mjs'),'utf8').replaceAll('export function ','function '))
  .replace('__COPY_EDIT_LAYOUT_UI__',fs.readFileSync(path.join(root,'src/editor-layout.cjs'),'utf8'))
  .replace('__COPY_EDIT_TIMELINE__',fs.readFileSync(path.join(root,'src/timeline.mjs'),'utf8').replaceAll('export function ','function '))
  .replace('__COPY_EDIT_AUDIO_TIMING__',fs.readFileSync(path.join(root,'src/audio-timing.mjs'),'utf8').replaceAll('export function ','function '))
  .replace('__COPY_EDIT_STICKER_TIME__',fs.readFileSync(path.join(root,'src/sticker-timing.mjs'),'utf8').replaceAll('export function ','function '))
  .replace('__COPY_EDIT_CSS__',JSON.stringify(['client.css','home.css','categories.css','bulk-categories.css','editor-layout.css','reorder.css','copy-layout.css','editor-polish.css','ui-scale.css','mobile-layout.css','mobile-refinement.css'].map(file=>fs.readFileSync(path.join(root,'src',file),'utf8')).join('\n')))
  .replace('__COPY_EDIT_COPY_LAYOUT__',fs.readFileSync(path.join(root,'src/copy-layout.cjs'),'utf8'))
  .replace('__COPY_EDIT_COPY_TOOLS__',fs.readFileSync(path.join(root,'src/copy-tools.cjs'),'utf8'))
  .replace('__COPY_EDIT_COPY_VOICE__',fs.readFileSync(path.join(root,'src/copy-voice.cjs'),'utf8'))
  .replace('__COPY_EDIT_COPY_COMPOSITION__',fs.readFileSync(path.join(root,'src/copy-composition.cjs'),'utf8'))
  .replace('__COPY_EDIT_CATEGORIES__',fs.readFileSync(path.join(root,'src/categories.cjs'),'utf8'))
  .replace('__COPY_EDIT_HOME__',fs.readFileSync(path.join(root,'src/home.cjs'),'utf8'))
  .replace('__COPY_EDIT_EDITOR_TOOLS__',fs.readFileSync(path.join(root,'src/editor-tools.cjs'),'utf8'))
  .replace('__COPY_EDIT_STICKER_GESTURE__',fs.readFileSync(path.join(root,'src/sticker-gesture.cjs'),'utf8'))
  .replace('__COPY_EDIT_PREVIEW__',`(()=>{const module={exports:{}};${preview}\nreturn module.exports;})()`)
  .replace('__COPY_EDIT_TRIM__',`(()=>{const module={exports:{}};${trim}\nreturn module.exports;})()`);
const client=`window.__ModuleLoader__.load({id:'dsh-copy-edit',factory:(require)=>{const module={exports:{}};const exports=module.exports;\n${body}\nreturn module.exports;}});\n`;
// TypeScript 不会解析这些拼接的 CJS 组件；必须校验浏览器实际收到的完整脚本后才能打包。
new Script(client,{filename:'dsh-copy-edit/lib/client.js'});
fs.writeFileSync(path.join(root,'lib/client.js'),client);
