import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {FileBar} from './ViewerChrome';
it('renders filename, available source and real size in order without a format badge',()=>{
 const html=renderToStaticMarkup(<FileBar name="plan.dwg" size={2048} source="圖庫 / 工程 / plan.dwg" cardOpen={false} onCard={()=>{}} onLibrary={()=>{}} onClose={()=>{}}/>);
 expect(html).not.toContain('format-badge');
 expect(html).toContain('圖庫 / 工程 / plan.dwg');
 expect(html.indexOf('plan.dwg')).toBeLessThan(html.indexOf('圖庫 / 工程'));
 expect(html.indexOf('圖庫 / 工程')).toBeLessThan(html.indexOf('2 KB'));
});
