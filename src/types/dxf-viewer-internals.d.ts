// Type declarations for dxf-viewer 1.0.48 source modules imported directly (the package only types its
// public entry). Kept loose on purpose: scene patches add and wrap members at run time. P3 final.

declare module "dxf-viewer/src/parser/DxfParser.js" {
  export default class DxfParser {
    parseSync(source: string): any;
    [member: string]: any;
  }
}

declare module "dxf-viewer/src/DxfScene.js" {
  export class DxfScene {
    constructor(options?: any);
    Build(dxf: any, fontFetchers: any[]): Promise<void>;
    [member: string]: any;
  }
  export class Entity {
    [member: string]: any;
  }
  export const ColorCode: Readonly<Record<string, number>>;
}

declare module "dxf-viewer/src/parser/AutoCadColorIndex" {
  const colors: number[];
  export default colors;
}

declare module "dxf-viewer/src/parser/ParseHelpers.js" {
  export function getAcadColor(index: number): number;
}

declare module "dxf-viewer/src/MTextFormatParser.js" {
  export class MTextFormatParser {
    static EntityType: Record<string, number>;
    Parse(text: string): void;
    GetContent(): any[];
    [member: string]: any;
  }
}
