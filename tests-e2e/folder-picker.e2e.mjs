import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './harness.mjs';

const folders = {
  root: { id:'root', name:'All notes', parent:null, hue:'#888' },
  work: { id:'work', name:'Work', parent:'root', hue:'#5a82c9' },
  dark: { id:'dark', name:'Dark folder', parent:'root', hue:'#123abc' },
  light: { id:'light', name:'Light folder', parent:'root', hue:'#ffffaa' },
  nested: { id:'nested', name:'Nested folder', parent:'light', hue:'#b84a6b' },
};
for (let i = 0; i < 40; i++) {
  const id = `extra-${i}`;
  folders[id] = { id, name:`Folder ${i}`, parent:'root', hue:'#4c9e6b' };
}
const note = (id, x, y) => ({ id, folder:'work', title:id, body:'Choose a folder.',
  color:'yellow', x, y, w:260, h:180, z:1, pinned:false });
const seed = {
  folders, notes:[note('picker-note', 60, 60), note('edge-note', 1100, 620)], links:[],
  tweaks:{ theme:'paper', font:'Inter', density:'cozy', tilt:true },
  cwd:'root', drawer:false, folderOrder:Object.keys(folders).filter(id=>id!=='root'),
  view:{ x:0, y:0, z:1 },
};
let app;
before(async () => { app = await launch({ seed }); });
after(async () => { if (app) await app.close(); });

const key = async (name, vk, modifiers = 0) => {
  for (const type of [modifiers ? 'rawKeyDown' : 'keyDown', 'keyUp']) {
    await app.cmd('Input.dispatchKeyEvent', { type, key:name, code:name, windowsVirtualKeyCode:vk, modifiers,
      ...(name === 'Enter' && type === 'keyDown' ? {text:'\r'} : {}) });
  }
};
const open = async (id = 'picker-note') => {
  const p = await app.evaljs(`(() => {
    const r = document.querySelector('[data-note-id="${id}"] [data-folder-tag]').getBoundingClientRect();
    return {x:r.x+r.width/2, y:r.y+r.height/2};
  })()`);
  await app.click(p.x, p.y);
  await app.pollUntil(() => app.evaljs(`document.querySelector('[role="listbox"]') !== null`));
};
const closed = () => app.pollUntil(() => app.evaljs(`document.querySelector('[role="listbox"]') === null`));
const folderName = () => app.evaljs(`document.querySelector('[data-note-id="picker-note"] [data-folder-tag]').textContent.trim()`);

test('folder names align left, including nested and last rows', async () => {
  await open();
  const rows = await app.evaljs(`Array.from(document.querySelectorAll('[role="option"]')).map(row => {
    const name = row.querySelector('[dir="auto"]');
    return {text:name.textContent, align:getComputedStyle(row).textAlign,
      inset:name.getBoundingClientRect().left - row.getBoundingClientRect().left};
  })`);
  assert.equal(rows.length, 44);
  assert.ok(rows.some(row=>row.text === 'Nested folder'));
  assert.ok(rows.every(row=>row.align === 'left' && row.text === row.text.trim() && Math.abs(row.inset - 28) < 1));
  const selected = await app.evaljs(`(() => {const r=document.querySelector('[aria-selected="true"]');return {name:r.querySelector('[dir="auto"]').textContent,weight:getComputedStyle(r).fontWeight};})()`);
  assert.deepEqual(selected, { name:'Work', weight:'600' });
  await app.press('Escape');
  await closed();
});

test('popover uses a cream surface, colored markers and soft hover highlights', async () => {
  await open();
  assert.equal(await app.evaljs(`getComputedStyle(document.querySelector('[data-folder-popover]')).backgroundColor`), 'rgb(251, 241, 220)');
  assert.equal(await app.evaljs(`getComputedStyle(document.querySelector('[aria-selected="true"]')).backgroundColor`), 'rgba(90, 130, 201, 0.18)');
  for (const [name, marker, tint] of [
    ['Dark folder', 'rgb(18, 58, 188)', 'rgba(18, 58, 188, 0.1)'],
    ['Light folder', 'rgb(255, 255, 170)', 'rgba(255, 255, 170, 0.1)'],
  ]) {
    const p = await app.evaljs(`(() => {const r=Array.from(document.querySelectorAll('[role="option"]')).find(r=>r.querySelector('[dir="auto"]').textContent===${JSON.stringify(name)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await app.cmd('Input.dispatchMouseEvent', {type:'mouseMoved', ...p});
    await app.pollUntil(() => app.evaljs(`(() => {const row=Array.from(document.querySelectorAll('[role="option"]')).find(r=>r.querySelector('[dir="auto"]').textContent===${JSON.stringify(name)});return getComputedStyle(row).boxShadow!=='none';})()`));
    const style = await app.evaljs(`(() => {const row=Array.from(document.querySelectorAll('[role="option"]')).find(r=>r.querySelector('[dir="auto"]').textContent===${JSON.stringify(name)});const s=getComputedStyle(row);return {bg:s.backgroundColor,ink:s.color,marker:getComputedStyle(row.querySelector('[data-folder-color]')).backgroundColor};})()`);
    assert.equal(style.bg, tint);
    assert.equal(style.ink, 'rgb(56, 41, 22)');
    assert.equal(style.marker, marker);
  }
  await app.press('Escape');
  await closed();
});

test('Escape restores tag focus and outside clicks dismiss the list', async () => {
  await open();
  await app.press('Escape');
  await closed();
  assert.ok(await app.evaljs(`document.activeElement.matches('[data-note-id="picker-note"] [data-folder-tag]')`));
  await open();
  await app.click(800, 500);
  await closed();
});

test('long lists stay inside the viewport and support keyboard scrolling', async () => {
  await open('edge-note');
  assert.ok(await app.evaljs(`(() => {const list=document.querySelector('[role="listbox"]');const r=list.getBoundingClientRect();return r.left>=8&&r.top>=8&&r.right<=innerWidth-8&&r.bottom<=innerHeight-8&&list.scrollHeight>list.clientHeight;})()`));
  await key('End', 35);
  await app.pollUntil(() => app.evaljs(`document.querySelector('[role="listbox"]').scrollTop > 0`));
  assert.ok(await app.evaljs(`(() => {const list=document.querySelector('[role="listbox"]');const row=document.getElementById(list.getAttribute('aria-activedescendant'));const r=row.getBoundingClientRect(),bounds=list.getBoundingClientRect();return row===list.lastElementChild&&r.top>=bounds.top&&r.bottom<=bounds.bottom;})()`));
  await app.press('Escape');
  await closed();
});

test('keyboard selection moves only this note, saves it and supports undo', async () => {
  const before = await app.evaljs(`(() => {const n=document.querySelector('[data-note-id="picker-note"]');return {x:n.style.left,y:n.style.top};})()`);
  await open();
  await key('ArrowDown', 40);
  await key('Enter', 13);
  await closed();
  await app.pollUntil(async () => await folderName() === 'Dark folder');
  assert.equal(await app.evaljs(`document.querySelector('[data-note-id="edge-note"] [data-folder-tag]').textContent.trim()`), 'Work');
  await app.pollUntil(() => JSON.parse(fs.readFileSync(path.join(app.userData,'notes.json'),'utf8')).notes.find(n=>n.id==='picker-note').folder === 'dark');
  await key('z', 90, 2);
  await app.pollUntil(async () => await folderName() === 'Work');
  assert.deepEqual(await app.evaljs(`(() => {const n=document.querySelector('[data-note-id="picker-note"]');return {x:n.style.left,y:n.style.top};})()`), before);
});

test('Create folder is keyboard accessible and moves the note into a new editable folder', async () => {
  await open();
  await key('Tab', 9);
  assert.equal(await app.evaljs('document.activeElement.textContent.trim()'), 'Create folder');
  await key('Enter', 13);
  await closed();
  await app.pollUntil(() => app.evaljs(`document.activeElement.matches('[data-folder-id] input')`));
  await app.press('a', {ctrl:true});
  await app.type('Errands');
  await app.press('Enter');
  await app.pollUntil(async () => await folderName() === 'Errands');
  await app.pollUntil(() => {
    const saved = JSON.parse(fs.readFileSync(path.join(app.userData,'notes.json'),'utf8'));
    const moved = saved.notes.find(n=>n.id==='picker-note');
    return saved.folders[moved.folder]?.name === 'Errands';
  });
  await app.click(800, 500);
  await key('z', 90, 2);
  await app.pollUntil(async () => await folderName() === 'Work');
  assert.ok(await app.evaljs(`document.querySelector('[data-note-id="edge-note"]') !== null`));
});
