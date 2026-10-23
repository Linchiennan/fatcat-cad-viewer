import {listCadFonts} from './cadFonts';
import {shxMtextGeometry} from './shxMtext';
import {fallbackMetrics,fittedShape,verticalPitch,verticalTextEntities} from './shxBigFontMetrics';
import {ShxFont,fontKey,shxTextGeometry} from './shxText';
import {parse} from 'opentype.js';
import {TextRenderer} from 'dxf-viewer/src/TextRenderer.js';
type Any=any;
let activeFontUsage:Record<string,number>|null=null;
export function installCadFontScene(ctor:Any):void {
 const rendererPrototype=TextRenderer.prototype as Any;
 if(!rendererPrototype.fatcatDiagnosticWrapped){
  const get=rendererPrototype._GetCharShape;
  rendererPrototype._GetCharShape=function(char:string){const shape=get.call(this,char);try{const font=this.fonts.find((f:Any)=>f.HasChar(char)),name=font?.data.names?.fullName?.en??font?.data.names?.fontFamily?.en??'missing-glyph-stub';if(activeFontUsage&&(Object.keys(activeFontUsage).length<32||name in activeFontUsage))activeFontUsage[name]=(activeFontUsage[name]??0)+1;}catch{/* Diagnostics cannot alter drawing. */}return shape;};
  rendererPrototype.fatcatDiagnosticWrapped=true;
 }
 if(!rendererPrototype.fatcatPitchWrapped){
  // While a fallback SHX big font style renders, full-width glyphs advance by that big font's pitch.
  const get=rendererPrototype._GetCharShape;
  rendererPrototype._GetCharShape=function(char:string){const shape=get.call(this,char),metrics=this.fatcatPitch;if(!metrics||!shape)return shape;const cache=(this.fatcatPitched??=new Map()),key=metrics.key+'|'+char;let out=cache.get(key);if(!out){out=fittedShape(char,shape,metrics);cache.set(key,out);}return out;};
  rendererPrototype.fatcatPitchWrapped=true;
 }
 const p=ctor.prototype,build=p.Build;
 p.Build=async function(dxf:Any,fonts:Any){
  this.cadFonts=new Map<string,ShxFont>();this.cadOutlineFonts=new Map();this.cadFontResults={rendered:0,fallback:0,routes:{}};this.cadStyles=dxf.tables?.style?.styles??{};
  const texts=[...(dxf.entities??[]),...Object.values(dxf.blocks??{}).flatMap((b:Any)=>b.entities??[])].map((e:Any)=>e.text??'').join('');
  for(const f of await listCadFonts())try{if(f.name.endsWith('.shx'))this.cadFonts.set(f.name,new ShxFont(f.data));else{const font=parse(f.data),renderer=new TextRenderer([async()=>font]);await renderer.FetchFonts(texts);this.cadOutlineFonts.set(f.name,{font,renderer});}}catch{this.cadFontResults.fallback++;}
  activeFontUsage={};
  try{await build.call(this,dxf,fonts);this.cadFontDiagnostics={...this.cadFontResults,actualGlyphFonts:{...activeFontUsage},styles:Object.values(this.cadStyles).slice(0,64).map((s:Any)=>({style:s.styleName,requested:s.font||'(未指定檔名)',bigFont:s.bigFont||'',availableLocal:!!(this.cadFonts.has(fontKey(s.font??''))||this.cadOutlineFonts.has(fontKey(s.font??'')))})),note:'actualGlyphFonts counts actual outline glyph lookups during layout/render (including cached glyphs), not text content or pixel counts; rendered=local font entities, fallback=bundled route because requested font/glyphs/SHX formatting unavailable. routes=local filenames actually used.'};}finally{activeFontUsage=null;for(const f of this.cadFonts.values())f.release();}
 };
 for(const name of ['_DecomposeText','_DecomposeAttribute']){
  const original=p[name];p[name]=function*(e:Any,ctx:Any){
   const style=this.cadStyles?.[e.styleName??'STANDARD']??{},font=this.cadFonts?.get(fontKey(style.font??'')),big=this.cadFonts?.get(fontKey(style.bigFont??''));
   const vertical=e.cadVerticalChar?null:verticalPitch(style);
   if(vertical){for(const c of verticalTextEntities({...e,textHeight:e.textHeight||style.fixedTextHeight||1},vertical))yield* p[name].call(this,{...c,cadVerticalChar:true},ctx);return;}
   const effective={...e,textHeight:e.textHeight||style.fixedTextHeight||1,xScale:e.xScale??style.widthFactor??1,obliqueAngle:e.obliqueAngle??style.obliqueAngle??0,textGenerationFlag:e.textGenerationFlag??style.textGenerationFlag??0};
   const outline=this.cadOutlineFonts?.get(fontKey(style.font??''));
   if(outline&&[...String(e.text??'')].every(ch=>ch.charCodeAt(0)<32||outline.font.charToGlyphIndex(ch)>0)){const previous=this.textRenderer;this.textRenderer=outline.renderer;try{yield* original.call(this,effective,ctx);this.cadFontResults.rendered++;this.cadFontResults.routes[fontKey(style.font??'')]=(this.cadFontResults.routes[fontKey(style.font??'')]??0)+1;}finally{this.textRenderer=previous;}return;}
   if(font){const lines=shxTextGeometry(effective,font,big);if(lines){this.cadFontResults.rendered++;this.cadFontResults.routes[fontKey(style.font??'')]=(this.cadFontResults.routes[fontKey(style.font??'')]??0)+1;for(const vertices of lines)if(vertices.length>1)yield* this._DecomposePolyline({...e,type:'LWPOLYLINE',vertices,lineType:'CONTINUOUS',width:0,shape:false},ctx);return;}}
   if(this.cadFontResults)this.cadFontResults.fallback++;yield* withBigFontPitch(this.textRenderer,style,()=>original.call(this,effective,ctx));
  };
 }
 const mtext=p._DecomposeMText;p._DecomposeMText=function*(e:Any,ctx:Any){
  const style=this.cadStyles?.[e.styleName??'STANDARD']??{},outline=this.cadOutlineFonts?.get(fontKey(style.font??''));
  const shx=this.cadFonts?.get(fontKey(style.font??'')),big=this.cadFonts?.get(fontKey(style.bigFont??''));
  if(shx){const lines=shxMtextGeometry(e,shx,big);if(lines){this.cadFontResults.rendered++;this.cadFontResults.routes[fontKey(style.font??'')]=(this.cadFontResults.routes[fontKey(style.font??'')]??0)+1;for(const vertices of lines)if(vertices.length>1)yield* this._DecomposePolyline({...e,type:'LWPOLYLINE',vertices,lineType:'CONTINUOUS',width:0,shape:false},ctx);return;}}
  if(outline&&[...String(e.text??'')].every(ch=>ch.charCodeAt(0)<32||outline.font.charToGlyphIndex(ch)>0)){const previous=this.textRenderer;this.textRenderer=outline.renderer;try{yield* mtext.call(this,e,ctx);this.cadFontResults.rendered++;this.cadFontResults.routes[fontKey(style.font??'')]=(this.cadFontResults.routes[fontKey(style.font??'')]??0)+1;}finally{this.textRenderer=previous;}return;}
  if(this.cadFontResults)this.cadFontResults.fallback++;yield* withBigFontPitch(this.textRenderer,style,()=>mtext.call(this,e,ctx));
 };
}
function* withBigFontPitch(renderer:Any,style:Any,run:()=>Generator<Any>):Generator<Any>{
 const previous=renderer.fatcatPitch;renderer.fatcatPitch=fallbackMetrics(style);
 try{yield* run();}finally{renderer.fatcatPitch=previous;}
}
