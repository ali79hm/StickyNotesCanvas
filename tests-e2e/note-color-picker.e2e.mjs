import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './harness.mjs';

const seed = {
  folders:{root:{id:'root',name:'All notes',parent:null,hue:'#888'},
    home:{id:'home',name:'Home',parent:'root',hue:'#d97757'},
    work:{id:'work',name:'Work',parent:'root',hue:'#5a82c9'}},
  notes:[{id:'color-note',folder:'home',title:'Colors',body:'Change my color.',color:'yellow',x:60,y:60,w:300,h:220,z:1,pinned:false},
    {id:'other-note',folder:'home',title:'Unchanged',body:'Other note.',color:'pink',x:700,y:600,w:260,h:180,z:2,pinned:false}],
  links:[],cwd:'root',drawer:false,folderOrder:['home','work'],view:{x:0,y:0,z:1},
  tweaks:{theme:'paper',font:'Inter',density:'cozy',tilt:true},
};
let app;
before(async () => { app = await launch({seed}); });
after(async () => { if (app) await app.close(); });

const click = async selector => {
  const p = await app.evaljs(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await app.click(p.x,p.y);
};
const open = async (id='color-note') => {
  await click(`[data-note-id="${id}"] [data-note-color]`);
  await app.pollUntil(()=>app.evaljs(`document.querySelector('[data-note-color-popover]')!==null`));
};
const bg = () => app.evaljs(`getComputedStyle(document.querySelector('[data-note-id="color-note"]')).backgroundColor`);
const saved = () => JSON.parse(fs.readFileSync(path.join(app.userData,'notes.json'),'utf8'));
const undo = async () => {
  for (const type of ['rawKeyDown','keyUp']) await app.cmd('Input.dispatchKeyEvent',{type,key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});
};

test('color button sits beside the folder tag and opens a matching color menu', async () => {
  const pos = await app.evaljs(`(() => {const n=document.querySelector('[data-note-id="color-note"]');const c=n.querySelector('[data-note-color]').getBoundingClientRect(),f=n.querySelector('[data-folder-tag]').getBoundingClientRect();return {before:c.right<f.left,x:n.style.left,y:n.style.top};})()`);
  assert.ok(pos.before);
  await open();
  assert.equal(await app.evaljs(`document.querySelector('[aria-selected="true"]').textContent.trim()`),'Yellow');
  assert.equal(await app.evaljs(`document.querySelector('[data-note-color-popover]').querySelector('button').textContent.trim()`),'Custom color…');
  assert.equal(await app.evaljs(`getComputedStyle(document.querySelector('[data-note-color-popover]')).backgroundColor`),'rgb(251, 241, 220)');
  assert.deepEqual(await app.evaljs(`(() => {const n=document.querySelector('[data-note-id="color-note"]');return {x:n.style.left,y:n.style.top};})()`),{x:pos.x,y:pos.y});
  await app.press('Escape');
});

test('choosing a preset changes only the note color, persists, and undoes', async () => {
  await open();
  const p = await app.evaljs(`(() => {const row=Array.from(document.querySelectorAll('[role="option"]')).find(r=>r.textContent.trim()==='Blue');const b=row.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);
  await app.click(p.x,p.y);
  await app.pollUntil(async()=>await bg()==='rgb(182, 219, 245)');
  assert.equal(await app.evaljs(`document.querySelector('[data-note-id="color-note"] [data-folder-tag]').textContent.trim()`),'Home');
  assert.equal(await app.evaljs(`getComputedStyle(document.querySelector('[data-note-id="other-note"]')).backgroundColor`),'rgb(248, 198, 212)');
  await app.pollUntil(()=>saved().notes.find(n=>n.id==='color-note').color==='blue');
  assert.equal(saved().folders.home.hue,'#d97757');
  await undo();
  await app.pollUntil(async()=>await bg()==='rgb(253, 232, 161)');
});

test('only one footer menu is open and both support Escape and keyboard navigation', async () => {
  await open();
  await click('[data-note-id="color-note"] [data-folder-tag]');
  assert.equal(await app.evaljs(`document.querySelectorAll('[role="listbox"]').length`),1);
  assert.ok(await app.evaljs(`document.querySelector('[data-folder-popover]')!==null`));
  await open();
  assert.equal(await app.evaljs(`document.querySelectorAll('[role="listbox"]').length`),1);
  for (const [key,vk] of [['ArrowDown',40],['Enter',13]]) {
    for(const type of ['keyDown','keyUp']) await app.cmd('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:vk});
  }
  await app.pollUntil(async()=>await bg()==='rgb(251, 208, 181)');
  await undo();
  await app.pollUntil(async()=>await bg()==='rgb(253, 232, 161)');
  await open();
  await app.press('Escape');
  assert.ok(await app.evaljs(`document.activeElement.matches('[data-note-color]')`));
  await open('other-note');
  assert.ok(await app.evaljs(`(() => {const r=document.querySelector('[data-note-color-popover]').getBoundingClientRect();return r.top>=8&&r.bottom<=innerHeight-8&&r.right<=innerWidth-8;})()`));
  await app.press('Escape');
});

const chooseCustom = async colors => {
  await open();
  await app.evaljs(`(() => {const input=document.querySelector('[aria-label="Custom sticky note color"]');window.nativePickerOpened=false;input.addEventListener('click',e=>{window.nativePickerOpened=true;e.preventDefault();},{once:true});})()`);
  await click('[data-note-color-popover] button');
  assert.ok(await app.evaljs('window.nativePickerOpened'));
  assert.equal(await app.evaljs(`document.querySelector('[aria-label="Custom sticky note color"]').value`),'#fde8a1');
  for(const color of colors) {
    await app.evaljs(`(() => {const input=document.querySelector('[data-note-id="color-note"] [aria-label="Custom sticky note color"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(color)});input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await app.pollUntil(()=>saved().notes.find(n=>n.id==='color-note').color===color);
  }
};

test('a custom picker session is one undo step and custom colors survive reload', async () => {
  await chooseCustom(['#123abc','#111122']);
  assert.equal(await bg(),'rgb(17, 17, 34)');
  assert.equal(await app.evaljs(`getComputedStyle(document.querySelector('[data-note-id="color-note"]')).color`),'rgb(255, 255, 255)');
  await undo();
  await app.pollUntil(async()=>await bg()==='rgb(253, 232, 161)');
  await chooseCustom(['#123abc']);
  await app.cmd('Page.reload');
  await app.pollUntil(()=>app.evaljs(`document.querySelector('[data-note-id="color-note"] [data-note-color]')!==null`));
  assert.equal(await bg(),'rgb(18, 58, 188)');
  await open();
  assert.equal(await app.evaljs(`document.querySelector('[aria-selected="true"]').textContent.trim()`),'Custom color');
  await app.press('Escape');
});
