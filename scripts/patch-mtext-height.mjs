// MTEXT \H (absolute or "x" multiplier) height codes for the TrueType text path of dxf-viewer 1.0.48.
// Upstream skips \H and lays out every chunk at the entity height; AutoCAD/ZWCAD apply it per scope.
// Anchored and idempotent like patch-engineering.mjs: refuses to run against an unexpected version.
import fs from 'node:fs';
import {beforeWidth, applyWidth} from './patch-mtext-width.mjs';
import {beforeFont, applyFont} from './patch-mtext-font.mjs';
import {applyParagraph} from './patch-mtext-paragraph.mjs';
const root = 'node_modules/dxf-viewer/src/';
function patch(file, old, next) {
  const p = root + file; const s = fs.readFileSync(p, 'utf8');
  if (s.includes(next) || beforeWidth(file, beforeFont(file, s)).includes(next)) return;
  if (!s.includes(old)) throw Error('版本錨點不符 ' + file + '：' + old.slice(0, 60));
  fs.writeFileSync(p, s.replace(old, next));
}

// Parser: emit {type: HEIGHT, height, relative} for \H...; and keep it inside its {} scope.
patch('MTextFormatParser.js', '    COLOR: 6\n})', '    COLOR: 6,\n    /* Parsing \\H height code (fatcat). */\n    HEIGHT: 7\n})');
patch('MTextFormatParser.js', '    COLOR: 5\n', '    COLOR: 5,\n    /** \\H height change (fatcat): "height" value, "relative" for an "x" multiplier. */\n    HEIGHT: 6\n');
patch('MTextFormatParser.js', '                    case "C":\n                        state = State.COLOR',
  '                    case "H":\n                        state = State.HEIGHT\n                        textStart = curPos + 1\n                        continue\n                    case "C":\n                        state = State.COLOR');
patch('MTextFormatParser.js', '        function PushScope() {',
  '        function EmitHeight() {\n            const s = text.slice(textStart, curPos).trim()\n            const relative = /x$/i.test(s)\n            const height = parseFloat(relative ? s.slice(0, -1) : s)\n            if (!(height > 0) || height > 1e4) {\n                return\n            }\n            curEntities.push({type: EntityType.HEIGHT, height, relative})\n        }\n\n        function PushScope() {');
patch('MTextFormatParser.js', '            case State.COLOR:\n',
  '            case State.HEIGHT:\n                if (c === ";") {\n                    EmitHeight()\n                    textStart = curPos + 1\n                    state = State.TEXT\n                }\n                continue\n\n            case State.COLOR:\n');

// Layout: current height follows \H and scopes; chunks carry their own size; line height uses the line's largest size.
patch('TextRenderer.js', '        this.fontSize = fontSize\n        this.charShapeProvider = charShapeProvider',
  '        this.fontSize = fontSize\n        this.curFontSize = fontSize\n        this.charShapeProvider = charShapeProvider');
patch('TextRenderer.js',
  '                if (item.type === MTextFormatParser.EntityType.SCOPE) {\n                    yield *FlattenItems(item.content)\n                } else {',
  '                if (item.type === MTextFormatParser.EntityType.SCOPE) {\n                    yield {type: "fatcatScopeStart"}\n                    yield *FlattenItems(item.content)\n                    yield {type: "fatcatScopeEnd"}\n                } else {');
patch('TextRenderer.js', '        let curColor = null\n', '        let curColor = null\n        const heightStack = []\n');
patch('TextRenderer.js', '            case MTextFormatParser.EntityType.COLOR:\n                curColor = item.color',
  '            case "fatcatScopeStart":\n                heightStack.push(this.curFontSize)\n                break\n\n            case "fatcatScopeEnd":\n                this.curFontSize = heightStack.pop() ?? this.fontSize\n                break\n\n            case MTextFormatParser.EntityType.HEIGHT: {\n                const next = item.relative ? this.curFontSize * item.height : item.height\n                if (next > 0 && next <= this.fontSize * 100) {\n                    this.curFontSize = next\n                }\n                break\n            }\n\n            case MTextFormatParser.EntityType.COLOR:\n                curColor = item.color');
patch('TextRenderer.js', '        this.lines = null\n        //XXX for now applied',
  '        this.lines = null\n        this.emptyFontSize = textBox.curFontSize\n        //XXX for now applied');
patch('TextRenderer.js', '        if (this.curChunk === null) {\n            this._AddChunk()\n        }\n        this.curChunk.PushChar(c, shape)',
  '        if (this.curChunk !== null && this.curChunk.block === null) {\n            this.curChunk.fontSize = this.textBox.curFontSize\n        }\n        if (this.curChunk === null || this.curChunk.fontSize !== this.textBox.curFontSize) {\n            this._AddChunk()\n        }\n        this.curChunk.PushChar(c, shape)');
patch('TextRenderer.js', 'new TextBox.Paragraph.Chunk(this, this.textBox.fontSize, this.color,',
  'new TextBox.Paragraph.Chunk(this, this.textBox.curFontSize, this.color,');
patch('TextRenderer.js',
  '        const lineHeight = lineSpacing * 5 * this.fontSize / 3\n\n        let height = 0\n        for (const p of this.paragraphs) {\n            if (p.lines === null) {\n                /* Paragraph always occupies at least one line. */\n                height++\n            } else {\n                height += p.lines.length\n            }\n        }\n        height *= lineHeight',
  '        /* Each line advances by its own largest height (fatcat \\H support). */\n        const lineSize = (p, line) => {\n            let size = 0\n            for (let i = line.startChunkIdx; i < line.startChunkIdx + line.numChunks; i++) {\n                size = Math.max(size, p.chunks[i].fontSize)\n            }\n            return size || p.emptyFontSize || this.fontSize\n        }\n        const advance = size => lineSpacing * 5 * size / 3\n\n        let height = 0\n        for (const p of this.paragraphs) {\n            if (p.lines === null) {\n                /* Paragraph always occupies at least one line. */\n                height += advance(p.emptyFontSize ?? this.fontSize)\n            } else {\n                for (const line of p.lines) {\n                    height += advance(lineSize(p, line))\n                }\n            }\n        }');
patch('TextRenderer.js',
  '        let y = -this.fontSize\n        for (const p of this.paragraphs) {\n            if (p.lines === null) {\n                y -= lineHeight\n                continue\n            }\n            for (const line of p.lines) {',
  '        let top = 0\n        for (const p of this.paragraphs) {\n            if (p.lines === null) {\n                top -= advance(p.emptyFontSize ?? this.fontSize)\n                continue\n            }\n            for (const line of p.lines) {\n                const size = lineSize(p, line)\n                const y = top - size');
patch('TextRenderer.js',
  '                                                  color, layer)\n                    }\n                }\n                y -= lineHeight\n            }',
  '                                                  color, layer)\n                    }\n                }\n                top -= advance(size)\n            }');

// Keep all existing build/pretest callers on the same ordered text patches.
applyWidth();
applyFont();
applyParagraph();
