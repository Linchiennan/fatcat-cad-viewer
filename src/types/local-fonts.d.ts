declare module 'opentype.js' { export function parse(data:ArrayBuffer):any; }
declare module 'dxf-viewer/src/TextRenderer.js' { export class TextRenderer {constructor(fonts:any[],options?:any);FetchFonts(text:string):Promise<boolean>;canRender:boolean;} }
