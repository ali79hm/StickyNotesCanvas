import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = { React:{}, window:{}, document:{}, navigator:{}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL('../utils.jsx', import.meta.url),'utf8'), sandbox);
const { resolveNoteColor, NOTE_COLORS, notesToClipboardText, clipboardTextToNotes } = sandbox.window;

test('existing note colors keep their exact theme colors', () => {
  for (const preset of NOTE_COLORS) assert.equal(resolveNoteColor(preset.id), preset);
});

test('custom colors retain their exact shade across themes with contrasting ink', () => {
  for (const [hex, ink] of [['#123abc','#fff'], ['#ffffaa','#222']]) {
    const col = resolveNoteColor(hex);
    assert.equal(col.paper, hex);
    assert.equal(col.flat, hex);
    assert.equal(col.term, hex);
    assert.equal(col.ink, ink);
  }
});

test('invalid custom colors fall back to the existing default', () => {
  for (const invalid of [null, undefined, '', 'invalid', '#12', '#gggggg', 'red;background:blue']) {
    assert.equal(resolveNoteColor(invalid), NOTE_COLORS[0]);
  }
});

test('custom colors survive note clipboard serialization', () => {
  const original = {id:'custom', title:'Custom note', body:'Text', color:'#123abc', w:260, h:180};
  const payload = clipboardTextToNotes(notesToClipboardText([original], []));
  assert.equal(payload.notes[0].color, original.color);
});
