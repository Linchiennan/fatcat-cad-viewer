import {listCadFonts} from './cadFonts';
import {shxMtextGeometry} from './shxMtext';
import {fallbackMetrics,fittedShape,verticalMtextEntities,verticalPitch,verticalTextEntities} from './shxBigFontMetrics';
import {plainCadText} from './textSearch';
import {ShxFont,fontKey,shxTextGeometry} from './shxText';
import {parse} from 'opentype.js';
import {TextRenderer} from 'dxf-viewer/src/TextRenderer.js';
import {generationMirror} from './textGeneration';
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
  // Inline outline fonts override a STYLE's SHX advances, including whitespace.
  // Unknown outline faces still use bundled glyphs, not unrelated SHX layout metrics.
  rendererPrototype._GetCharShape=function(char:string,inlineFont?:string|null){const shape=get.call(this,char),metrics=inlineFont ? (/\.shx$/i.test(inlineFont)?fallbackMetrics({font:inlineFont}):null) : this.fatcatPitch;if(!metrics||!shape)return shape;const cache=(this.fatcatPitched??=new Map()),key=metrics.key+'|'+char;let out=cache.get(key);if(!out){out=fittedShape(char,shape,metrics);cache.set(key,out);}return out;};
  rendererPrototype.fatcatPitchWrapped=true;
 }
 const p=ctor.prototype,build=p.Build;
 p.Build=async function(dxf:Any,fonts:Any){
  this.cadFonts=new Map<string,ShxFont>();this.cadOutlineFonts=new Map();this.cadFontResults={rendered:0,fallback:0,routes:{}};this.cadStyles=dxf.tables?.style?.styles??{};
  const texts=[...(dxf.entities??[]),...Object.values(dxf.blocks??{}).flatMap((b:Any)=>b.entities??[])].map((e:Any)=>e.text??'').join('');
  for(const f of await listCadFonts())try{if(f.name.endsWith('.shx'))this.cadFonts.set(f.name,new ShxFont(f.data));else{const font=parse(f.data),renderer=new TextRenderer([async()=>font]);await renderer.FetchFonts(texts);this.cadOutlineFonts.set(f.name,{font,renderer});}}catch{this.cadFontResults.fallback++;}
  // SHX text has no outline of its own, so it is drawn with the bundled light weight: CAD draws SHX as thin single strokes
  // and the regular weight looked bold beside it (用戶 2026-10-30 選「另外加一套細體只給 SHX 用」). The light font is the
  // last of the engine fonts and is only read when the drawing has text on an SHX style.
  const base=Array.isArray(fonts)&&fonts.length>2?fonts.slice(0,-1):fonts,light=Array.isArray(fonts)&&fonts.length>2?fonts[fonts.length-1]:null;
  this.cadShxRenderer=null;
  const shxTexts=[...(dxf.entities??[]),...Object.values(dxf.blocks??{}).flatMap((b:Any)=>b.entities??[])].filter((e:Any)=>e.text&&isShxStyle(this.cadStyles[e.styleName??'STANDARD'])).map((e:Any)=>e.text).join('');
  if(light&&shxTexts){try{const r=new TextRenderer([light]);await r.FetchFonts(shxTexts);this.cadShxRenderer=r;}catch{/* the regular weight stays */}}
  activeFontUsage={};
  try{await build.call(this,dxf,base);this.cadFontDiagnostics={...this.cadFontResults,actualGlyphFonts:{...activeFontUsage},styles:Object.values(this.cadStyles).slice(0,64).map((s:Any)=>({style:s.styleName,requested:s.font||'(未指定檔名)',bigFont:s.bigFont||'',availableLocal:!!(this.cadFonts.has(fontKey(s.font??''))||this.cadOutlineFonts.has(fontKey(s.font??'')))})),note:'actualGlyphFonts counts actual outline glyph lookups during layout/render (including cached glyphs), not text content or pixel counts; rendered=local font entities, fallback=bundled route because requested font/glyphs/SHX formatting unavailable. routes=local filenames actually used.'};}finally{activeFontUsage=null;for(const f of this.cadFonts.values())f.release();}
 };
 for(const name of ['_DecomposeText','_DecomposeAttribute']){
  const original=p[name];p[name]=function*(e:Any,ctx:Any){
   const style=this.cadStyles?.[e.styleName??'STANDARD']??{},font=this.cadFonts?.get(fontKey(style.font??'')),big=this.cadFonts?.get(fontKey(style.bigFont??''));
   const vertical=e.cadVerticalChar?null:verticalPitch(style);
   if(vertical){for(const c of verticalTextEntities({...e,textHeight:e.textHeight||style.fixedTextHeight||1},vertical))yield* p[name].call(this,{...c,cadVerticalChar:true},ctx);return;}
   const effective={...e,textHeight:e.textHeight||style.fixedTextHeight||1,xScale:e.xScale??style.widthFactor??1,obliqueAngle:e.obliqueAngle??style.obliqueAngle??0,textGenerationFlag:e.textGenerationFlag??style.textGenerationFlag??0};
   const outline=this.cadOutlineFonts?.get(fontKey(style.font??''));
   if(outline&&[...String(e.text??'')].every(ch=>ch.charCodeAt(0)<32||outline.font.charToGlyphIndex(ch)>0)){const previous=this.textRenderer;this.textRenderer=outline.renderer;try{yield* generationMirror(effective,original.call(this,effective,ctx));this.cadFontResults.rendered++;this.cadFontResults.routes[fontKey(style.font??'')]=(this.cadFontResults.routes[fontKey(style.font??'')]??0)+1;}finally{this.textRenderer=previous;}return;}
   if(font){const lines=shxTextGeometry(effective,font,big);if(lines){this.cadFontResults.rendered++;this.cadFontResults.routes[fontKey(style.font??'')]=(this.cadFontResults.routes[fontKey(style.font??'')]??0)+1;for(const vertices of lines)if(vertices.length>1)yield* this._DecomposePolyline({...e,type:'LWPOLYLINE',vertices,lineType:'CONTINUOUS',width:0,shape:false},ctx);return;}}
   if(this.cadFontResults)this.cadFontResults.fallback++;yield* withShxRenderer(this,style,()=>withBigFontPitch(this.textRenderer,style,()=>generationMirror(effective,original.call(this,effective,ctx))));
  };
 }
 const mtext=p._DecomposeMText;p._DecomposeMText=function*(e:Any,ctx:Any){
  const style=this.cadStyles?.[e.styleName??'STANDARD']??{},outline=this.cadOutlineFonts?.get(fontKey(style.font??''));
  // Vertical style and direction "top to bottom" (3) or "by style" (5): upright characters in columns, as single-line text.
  const vertical=e.drawingDirection===1?null:verticalPitch(style);
  if(vertical){for(const c of verticalMtextEntities(e,vertical,plainCadText))yield* p._DecomposeText.call(this,{...c,cadVerticalChar:true},ctx);return;}
  const shx=this.cadFonts?.get(fontKey(style.font??'')),big=this.cadFonts?.get(fontKey(style.bigFont??''));
  if(shx){const lines=shxMtextGeometry(e,shx,big);if(lines){this.cadFontResults.rendered++;this.cadFontResults.routes[fontKey(style.font??'')]=(this.cadFontResults.routes[fontKey(style.font??'')]??0)+1;for(const vertices of lines)if(vertices.length>1)yield* this._DecomposePolyline({...e,type:'LWPOLYLINE',vertices,lineType:'CONTINUOUS',width:0,shape:false},ctx);return;}}
  if(outline&&[...String(e.text??'')].every(ch=>ch.charCodeAt(0)<32||outline.font.charToGlyphIndex(ch)>0)){const previous=this.textRenderer;this.textRenderer=outline.renderer;try{yield* mtext.call(this,e,ctx);this.cadFontResults.rendered++;this.cadFontResults.routes[fontKey(style.font??'')]=(this.cadFontResults.routes[fontKey(style.font??'')]??0)+1;}finally{this.textRenderer=previous;}return;}
  if(this.cadFontResults)this.cadFontResults.fallback++;yield* withShxRenderer(this,style,()=>withBigFontPitch(this.textRenderer,style,()=>mtext.call(this,e,ctx)));
 };
}
/** A style drawn from SHX shapes (no font file, a .shx file or a name without extension), not an outline font. */
export function isShxStyle(style:Any):boolean{const font=String(style?.font??'').trim();return !/\.(ttf|ttc|otf)$/i.test(font);}
/** Runs SHX-style text with the light-weight renderer when it was loaded. */
function* withShxRenderer(scene:Any,style:Any,run:()=>Generator<Any>):Generator<Any>{
 const light=scene.cadShxRenderer;if(!light||!isShxStyle(style)){yield* run();return;}
 const previous=scene.textRenderer;scene.textRenderer=light;
 try{yield* run();}finally{scene.textRenderer=previous;}
}
function* withBigFontPitch(renderer:Any,style:Any,run:()=>Generator<Any>):Generator<Any>{
 const previous=renderer.fatcatPitch;renderer.fatcatPitch=fallbackMetrics(style);
 try{yield* run();}finally{renderer.fatcatPitch=previous;}
}
