// dxf-viewer 1.0.48: carry scoped inline font identity to glyph/space lookup.
// Font outlines remain supplied by the existing renderer; no proprietary font is bundled.
import fs from 'node:fs';
import {beforeParagraph} from './patch-mtext-paragraph.mjs';
const root='node_modules/dxf-viewer/src/';
const patches=[];
function patch(file,old,next){patches.push({file,old,next});}
export function beforeFont(file,source){source=beforeParagraph(file,source);for(const p of [...patches].reverse())if(p.file===file)source=source.replaceAll(p.next,p.old);return source;}
export function applyFont(){for(const {file,old,next} of patches){const p=root+file,s=fs.readFileSync(p,'utf8');if(s.includes(next)||beforeParagraph(file,s).includes(next))continue;if(!s.includes(old))throw Error('MTEXT font version anchor mismatch: '+file+' '+old.slice(0,60));fs.writeFileSync(p,s.replaceAll(old,next));}}
patch('MTextFormatParser.js','    WIDTH: 8\n','    WIDTH: 8,\n    FONT: 9\n');
patch('MTextFormatParser.js','    WIDTH: 7\n','    WIDTH: 7,\n    FONT: 8\n');
patch('MTextFormatParser.js','                    case "W":\n','                    case "f":\n                    case "F":\n                        state = State.FONT\n                        textStart = curPos + 1\n                        continue\n                    case "W":\n');
patch('MTextFormatParser.js','            case State.WIDTH:\n','            case State.FONT:\n                if (c === ";") {\n                    const font = text.slice(textStart, curPos).split("|")[0].trim()\n                    if (font) curEntities.push({type: EntityType.FONT, font})\n                    textStart = curPos + 1\n                    state = State.TEXT\n                }\n                continue\n\n            case State.WIDTH:\n');
patch('TextRenderer.js','        this.curWidthFactor = 1\n','        this.curWidthFactor = 1\n        this.curFontName = null\n');
patch('TextRenderer.js','        const widthStack = []\n','        const widthStack = []\n        const fontStack = []\n');
patch('TextRenderer.js','                widthStack.push(this.curWidthFactor)\n','                widthStack.push(this.curWidthFactor)\n                fontStack.push(this.curFontName)\n');
patch('TextRenderer.js','                this.curWidthFactor = widthStack.pop() ?? 1\n','                this.curWidthFactor = widthStack.pop() ?? 1\n                this.curFontName = fontStack.pop() ?? null\n');
patch('TextRenderer.js','            case MTextFormatParser.EntityType.WIDTH: {','            case MTextFormatParser.EntityType.FONT:\n                this.curFontName = item.font\n                break\n\n            case MTextFormatParser.EntityType.WIDTH: {');
patch('TextRenderer.js','        const shape = this.textBox.charShapeProvider(c)','        const shape = this.textBox.charShapeProvider(c, this.textBox.curFontName)');
patch('TextRenderer.js','            this.curChunk.widthFactor !== this.textBox.curWidthFactor) {','            this.curChunk.widthFactor !== this.textBox.curWidthFactor ||\n            this.curChunk.fontName !== this.textBox.curFontName) {');
patch('TextRenderer.js','            this.curChunk.fontSize !== this.textBox.curFontSize) {','            this.curChunk.fontSize !== this.textBox.curFontSize ||\n            this.curChunk.fontName !== this.textBox.curFontName) {');
for (const suffix of ['.font', '.advance']) patch('TextRenderer.js','this.paragraph.textBox.spaceShape'+suffix,'this.spaceShape'+suffix);
patch('TextRenderer.js','        this.widthFactor = paragraph.textBox.curWidthFactor\n','        this.widthFactor = paragraph.textBox.curWidthFactor\n        this.fontName = paragraph.textBox.curFontName\n        this.spaceShape = paragraph.textBox.charShapeProvider(" ", this.fontName)\n');
