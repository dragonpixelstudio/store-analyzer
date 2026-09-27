import { test, expect } from '@playwright/test';
import { makeArtwork, newText, hitLayer, localPoint, resizeArtwork, commitArtwork, undoArtwork, redoArtwork, validDimensions, type ArtworkHistory } from '../lib/artworkDocument';

test('rotated hit testing respects visibility, locking and stacking', () => {
  const doc = makeArtwork('/sample.png', 1000, 500);
  const text = {...newText(doc), x:100,y:100,width:200,height:50,rotation:90};
  doc.layers.push(text);
  expect(localPoint(text,200,200)).toEqual({x:175,y:25.000000000000004});
  expect(hitLayer(doc,200,200)?.id).toBe(text.id);
  expect(hitLayer(doc,110,120)).toBeUndefined();
  const top = {...text,id:'top'}; doc.layers.push(top);
  expect(hitLayer(doc,200,200)?.id).toBe('top');
  top.visible=false; expect(hitLayer(doc,200,200)?.id).toBe(text.id);
  text.locked=true; expect(hitLayer(doc,200,200)).toBeUndefined();
});

test('portrait conversion preserves image proportions, editable text and original document', () => {
  const doc=makeArtwork('/sample.png',1000,500); const text=newText(doc,'Actual text'); doc.layers.push(text);
  const resized=resizeArtwork(doc,500,1000);
  expect(resized.layers[0]).toMatchObject({x:0,y:375,width:500,height:250});
  expect(resized.layers[1]).toMatchObject({text:'Actual text',fontSize:text.fontSize/2,width:text.width/2});
  expect(doc.width).toBe(1000); expect(doc.layers[0].height).toBe(500);
  expect(JSON.parse(JSON.stringify(resized))).toEqual(resized);
});

test('undo redo restores edits and new edits discard the old redo branch', () => {
  const original=makeArtwork('/sample.png',512,512);
  let h:ArtworkHistory={past:[],present:original,future:[]};
  const edited={...original,layers:[...original.layers,newText(original,'Saved text')]};
  h=commitArtwork(h,edited); h=undoArtwork(h); expect(h.present).toBe(original);
  h=redoArtwork(h); expect(h.present).toBe(edited);
  h=commitArtwork(undoArtwork(h),{...original,background:'#123456'});
  expect(h.future).toHaveLength(0); expect(redoArtwork(h).present.background).toBe('#123456');
  for(let i=0;i<50;i++) h=commitArtwork(h,{...h.present,width:512+i});
  expect(h.past).toHaveLength(30);
});

test('canvas memory bounds reject invalid and excessively large dimensions', () => {
  for(const [w,h] of [[0,100],[-1,100],[50.5,100],[NaN,100],[Infinity,100],[6001,32],[4000,4000]]) {
    expect(validDimensions(w,h)).toBe(false); expect(()=>makeArtwork('/image.png',w,h)).toThrow();
  }
  expect(validDimensions(6000,2000)).toBe(true);
});

import { LAYERED_TEMPLATES, layeredArtwork } from '../lib/layeredTemplates';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
test('layered presets use independent editable titles and local image assets', () => {
  for (const preset of LAYERED_TEMPLATES) {
    const first=layeredArtwork(preset), second=layeredArtwork(preset);
    expect(validDimensions(first.width,first.height)).toBe(true);
    expect(first.layers).toHaveLength(6);
    expect(new Set(first.layers.map(layer=>layer.id)).size).toBe(6);
    expect(first.layers.filter(layer=>layer.kind==='image')).toHaveLength(2);
    const title=first.layers.find(layer=>layer.name==='Title');
    expect(title).toMatchObject({kind:'text',text:preset.game,locked:false});
    first.layers[0].x=9999;
    expect(second.layers[0].x).not.toBe(9999);
    expect(first.layers[0].id).not.toBe(second.layers[0].id);
    for(const layer of second.layers) if(layer.kind==='image') expect(existsSync(join(process.cwd(),'public',layer.src))).toBe(true);
    const restored=JSON.parse(JSON.stringify(second));
    expect(restored).toEqual(second);
  }
});
