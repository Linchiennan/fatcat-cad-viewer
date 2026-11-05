import {it,expect} from 'vitest';
import {drawOrderKey,installDrawOrder,sortBatches} from './drawOrder';

// Stand-in for DxfScene: batches kept in key (layer name) order, each entity puts geometry in its layer's batch.
class Scene {
 tree=new Map<string,any>();
 batches={each:(f:(b:any)=>void)=>[...this.tree.keys()].sort().forEach(k=>f(this.tree.get(k)))};
 _ProcessDxfEntity(e:any,_ctx:any=null){this._GetBatch(e.layer);}
 _GetBatch(key:string){let b=this.tree.get(key);if(!b)this.tree.set(key,b={key});return b;}
 _BuildScene(){const batches:any[]=[];this.batches.each(b=>batches.push({key:b.key}));return {batches};}
}

it('orders batches by the latest draw order of their entities, not by layer name (惠宇敦南 排水竣工圖-1)',()=>{
 expect(sortBatches(['a','b','c','d'],[30,undefined,10,30])).toEqual(['c','a','d','b']);
 expect(drawOrderKey({handle:'1E3D6D'})).toBe(0x1E3D6D);
 expect(drawOrderKey({handle:'1E3D6D',cadDrawOrder:5})).toBe(5); // SORTENTSTABLE wins
});

it('draws a note made after the trees on top although its layer name sorts first',()=>{
 installDrawOrder(Scene.prototype);const s:any=new Scene();
 s._ProcessDxfEntity({handle:'10',layer:'Z-TREE'});
 s._ProcessDxfEntity({handle:'20',layer:'A-NOTE'});
 s._ProcessDxfEntity({handle:'5',layer:'0'},{block:true}); // block definition content: no order of its own
 expect(s._BuildScene().batches.map((b:any)=>b.key)).toEqual(['Z-TREE','A-NOTE','0']);
});
