import {it,expect} from 'vitest';
import {applyMarkEdit} from './marks';
import type {Mark} from '../viewer/markup';
it('commits color-only text edits without changing content, geometry or other marks',()=>{
 const old:Mark={kind:'text',at:{x:1,y:2},text:'甲\n乙',color:'#ff3b30',size:12,width:40};
 const other:Mark={kind:'pen',color:'#ffffff',points:[{x:0,y:0},{x:1,y:1}]};
 const marks=[old,other];
 const next=applyMarkEdit(marks,{edit:{index:0,text:old.text,color:'#34c759'}} as any);
 expect(next[0]).toEqual({...old,color:'#34c759'});expect(next[1]).toBe(other);expect(marks[0]).toBe(old);
 expect(applyMarkEdit(marks,{edit:{index:0,text:'修改'}})[0]).toEqual({...old,text:'修改'});
});
