import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {GloveBar,ViewerDock} from './ViewerToolbar';
import {CheckStrip} from '../app/ViewerChrome';
import {decideBack} from '../app/backDispatch';
it('Back exits selection without closing the drawing',()=>{expect(decideBack({screen:'viewing',selecting:true} as any)).toBe('end-selection');});
const noop=()=>{};
const base={onCommand:noop,canMeasure:true,onMeasure:noop,onMarkup:noop,onSearch:noop,onInspect:noop,onSelect:noop};
describe('selection entry and information relocation',()=>{
 it('replaces bottom information with independent selection on both layouts',()=>{
  for(const C of [GloveBar,ViewerDock]){const h=renderToStaticMarkup(<C {...base}/>);expect(h).toContain('aria-label="選取"');expect(h).not.toContain('aria-label="資訊"');}
 });
 it('keeps information after xrefs in second page',()=>{
  const h=renderToStaticMarkup(<CheckStrip spaces={[]} space="Model" switching={false} missing={0} xrefsUnloaded={0} onSpace={noop} onTab={noop} onExport={noop} onInspect={noop}/>);
  expect(h.slice(h.indexOf('data-check-page="2"'))).toContain('資訊');
 });
});
