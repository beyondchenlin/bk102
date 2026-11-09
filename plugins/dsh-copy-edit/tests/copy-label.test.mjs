import test from 'node:test';
import assert from 'node:assert/strict';
import {copySummary,copyDisplayText} from '../src/copy-label.mjs';

test('中文首句及句末引号，不重复显示在摘要中',()=>{
  assert.deepEqual(copySummary('  “慢一点，也没关系。” 下一句。\n继续。'),{name:'“慢一点，也没关系。”',rest:'下一句。\n继续。'});
  assert.equal(copySummary('真的吗？！后面的句子。').name,'真的吗？！');
});
test('英文句末和小数、首行无标点、空正文',()=>{
  assert.deepEqual(copySummary('Version 3.14 is ready. Next step.'),{name:'Version 3.14 is ready.',rest:'Next step.'});
  assert.equal(copySummary('“Ready.” Next step.').name,'“Ready.”');
  assert.deepEqual(copySummary('\n\r\n首行没有标点\r\n第二行'),{name:'首行没有标点',rest:'第二行'});
  for(const value of ['',null,undefined,' \n\t'])assert.deepEqual(copySummary(value),{name:'空白文案',rest:''});
});
test('长句展示有界，不截断代理对，不修改正文',()=>{
  const value='🌱'.repeat(90)+'。后续';const result=copySummary(value);
  assert.equal(result.name,'🌱'.repeat(80)+'…');assert.equal(result.rest,'后续');assert.equal(value.length,183);
});
test('当前窗口未保存的正文优先，旧标题不参与展示，输入对象不变',()=>{
  const project=Object.freeze({projectId:'a',title:'旧标题不可展示',text:'已保存。后续'}),drafts=Object.freeze({a:Object.freeze({title:'旧草稿标题',text:'正在写。第二句'})});
  assert.equal(copySummary(copyDisplayText(project,drafts)).name,'正在写。');
  assert.equal(copySummary(copyDisplayText(project,{})).name,'已保存。');
  assert.equal(copySummary(copyDisplayText(project,{a:{text:''}})).name,'空白文案');
  assert.equal(project.title,'旧标题不可展示');
});
