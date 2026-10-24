// dxf-viewer 1.0.48: preserve MTEXT inline \W width through layout and rendering.
// Run after patch-mtext-height.mjs. No font substitution or SHX/CFF outline changes.
import fs from 'node:fs';
import {beforeFont} from './patch-mtext-font.mjs';
const root='node_modules/dxf-viewer/src/';
const patches=[];
function patch(file,old,next){patches.push({file,old,next});}
// Used only for height-patch idempotence checks; never writes the normalized text.
export function beforeWidth(file,source){for(const p of [...patches].reverse())if(p.file===file)source=source.replace(p.next,p.old);return source;}
export function applyWidth(){for(const {file,old,next} of patches){const p=root+file,s=fs.readFileSync(p,'utf8');if(s.includes(next)||beforeFont(file,s).includes(next))continue;if(!s.includes(old))throw Error('MTEXT width version anchor mismatch: '+file+' '+old.slice(0,60));fs.writeFileSync(p,s.replace(old,next));}}
patch('MTextFormatParser.js','    HEIGHT: 7\n','    HEIGHT: 7,\n    WIDTH: 8\n');
patch('MTextFormatParser.js','    HEIGHT: 6\n','    HEIGHT: 6,\n    WIDTH: 7\n');
patch('MTextFormatParser.js','                    case "H":\n','                    case "W":\n                        state = State.WIDTH\n                        textStart = curPos + 1\n                        continue\n                    case "H":\n');
patch('MTextFormatParser.js','        function EmitHeight() {','        function EmitWidth() {\n            const s = text.slice(textStart, curPos).trim()\n            const relative = /x$/i.test(s)\n            const width = Number(relative ? s.slice(0, -1) : s)\n            if (Number.isFinite(width) && width > 0 && width <= 100) {\n                curEntities.push({type: EntityType.WIDTH, width, relative})\n            }\n        }\n\n        function EmitHeight() {');
patch('MTextFormatParser.js','            case State.HEIGHT:\n','            case State.WIDTH:\n                if (c === ";") {\n                    EmitWidth()\n                    textStart = curPos + 1\n                    state = State.TEXT\n                }\n                continue\n\n            case State.HEIGHT:\n');
patch('TextRenderer.js','        this.curFontSize = fontSize\n','        this.curFontSize = fontSize\n        this.curWidthFactor = 1\n');
patch('TextRenderer.js','        const heightStack = []\n','        const heightStack = []\n        const widthStack = []\n');
patch('TextRenderer.js','                heightStack.push(this.curFontSize)\n','                heightStack.push(this.curFontSize)\n                widthStack.push(this.curWidthFactor)\n');
patch('TextRenderer.js','                this.curFontSize = heightStack.pop() ?? this.fontSize\n','                this.curFontSize = heightStack.pop() ?? this.fontSize\n                this.curWidthFactor = widthStack.pop() ?? 1\n');
patch('TextRenderer.js','            case MTextFormatParser.EntityType.HEIGHT: {','            case MTextFormatParser.EntityType.WIDTH: {\n                const next = item.relative ? this.curWidthFactor * item.width : item.width\n                if (Number.isFinite(next) && next > 0 && next <= 100) this.curWidthFactor = next\n                break\n            }\n\n            case MTextFormatParser.EntityType.HEIGHT: {');
patch('TextRenderer.js','        this.paragraph = paragraph\n        this.fontSize = fontSize','        this.paragraph = paragraph\n        this.widthFactor = paragraph.textBox.curWidthFactor\n        this.fontSize = fontSize');
patch('TextRenderer.js','            this.curChunk.fontSize = this.textBox.curFontSize\n','            this.curChunk.fontSize = this.textBox.curFontSize\n            this.curChunk.widthFactor = this.textBox.curWidthFactor\n');
patch('TextRenderer.js','        if (this.curChunk === null || this.curChunk.fontSize !== this.textBox.curFontSize) {','        if (this.curChunk === null || this.curChunk.fontSize !== this.textBox.curFontSize ||\n            this.curChunk.widthFactor !== this.textBox.curWidthFactor) {');
patch('TextRenderer.js','        if (this.curChunk === null || this.curChunk.lastChar !== null) {','        if (this.curChunk === null || this.curChunk.lastChar !== null ||\n            this.curChunk.widthFactor !== this.textBox.curWidthFactor ||\n            this.curChunk.fontSize !== this.textBox.curFontSize) {');
patch('TextRenderer.js','this.spaceStartKerning + this.spaceEndKerning) * this.fontSize','this.spaceStartKerning + this.spaceEndKerning) * this.fontSize * this.widthFactor');
patch('TextRenderer.js','        let width = this.block.GetCurrentPosition()','        let width = this.block.GetCurrentPosition() * this.widthFactor');
patch('TextRenderer.js','yield* chunk.block.Render(v, null, rotation, null,','yield* chunk.block.Render(v, null, rotation, chunk.widthFactor,');
patch('TextRenderer.js','        if (this.curChunk !== null && this.curChunk.block === null) {','        if (this.curChunk !== null && this.curChunk.block === null && this.curChunk.leadingSpaces === 0) {');
patch('TextRenderer.js','        if (this.block === null) {\n            return 0\n        }\n        let width = this.block.GetCurrentPosition() * this.widthFactor','        if (this.block === null) {\n            return withSpacing ? this.GetSpacingWidth() : 0\n        }\n        let width = this.block.GetCurrentPosition() * this.widthFactor');
