import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CheckStrip} from './ViewerChrome';
it('does not invent a share action when no output callback exists',()=>{
 const html=renderToStaticMarkup(<CheckStrip spaces={[]} space="Model" switching={false} missing={4} xrefsUnloaded={3} onSpace={()=>{}} onTab={()=>{}}/>);
 expect(html).toContain('模型');expect(html).toContain('圖層');expect(html).not.toContain('strip-export');expect(html).toContain('缺件');expect(html).toContain('外參');expect(html).toContain('check-strip-dots');
});
