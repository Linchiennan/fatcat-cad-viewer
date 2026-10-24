// dxf-viewer 1.0.48: paragraph first-line indent in drawing units.
// ZWCAD native pi0/pi2 controls at heights 3.5 and 7 both shift by 2.
// i is relative to l, not a move of the entity insertion or glyph scaling.
import fs from 'node:fs';
const root='node_modules/dxf-viewer/src/';
const patches=[];
function patch(file,old,next){patches.push({file,old,next});}
const normalizeLegacy = source => source.replace('this.curFirstIndent = item.first * this.fontSize', 'this.curFirstIndent = item.first');
export function beforeParagraph(file,source){source=normalizeLegacy(source);for(const p of [...patches].reverse())if(p.file===file)source=source.replaceAll(p.next,p.old);return source;}
export function applyParagraph(){const renderer=root+'TextRenderer.js', legacy=fs.readFileSync(renderer,'utf8'), normalized=normalizeLegacy(legacy);if(normalized!==legacy)fs.writeFileSync(renderer,normalized);for(const {file,old,next} of patches){const p=root+file,s=fs.readFileSync(p,'utf8');if(s.includes(next))continue;if(!s.includes(old))throw Error('MTEXT paragraph version anchor mismatch: '+file+' '+old.slice(0,60));fs.writeFileSync(p,s.replaceAll(old,next));}}
patch('MTextFormatParser.js','    FONT: 8\n','    FONT: 8,\n    PARAGRAPH_INDENT: 9\n');
patch('MTextFormatParser.js','                        state = State.PARAGRAPH1\n                        continue','                        state = State.PARAGRAPH1\n                        textStart = curPos + 1\n                        continue');
patch('MTextFormatParser.js',`            case State.PARAGRAPH1:
                state = c === "x" ? State.PARAGRAPH2 : State.SKIP_FORMAT
                continue`, `            case State.PARAGRAPH1:
                if (c === ";") {
                    const args = text.slice(textStart, curPos).replace(/^x/, "").split(",")
                    for (const arg of args) {
                        const m = /^i([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?|\\*)$/.exec(arg)
                        if (m) {
                            const first = m[1] === "*" ? 0 : Number(m[1])
                            if (Number.isFinite(first) && Math.abs(first) <= 1e4)
                                curEntities.push({type: EntityType.PARAGRAPH_INDENT, first})
                        }
                        if (/^q[lcrjd]$/.test(arg)) curEntities.push({type: EntityType.PARAGRAPH_ALIGNMENT, alignment: arg[1]})
                    }
                    textStart = curPos + 1
                    state = State.TEXT
                }
                continue`);
patch('TextRenderer.js','        this.curFontName = null\n','        this.curFontName = null\n        this.curFirstIndent = 0\n');
patch('TextRenderer.js','        const fontStack = []\n','        const fontStack = []\n        const paragraphStack = []\n');
patch('TextRenderer.js','                fontStack.push(this.curFontName)\n','                fontStack.push(this.curFontName)\n                paragraphStack.push(this.curFirstIndent)\n');
patch('TextRenderer.js','                this.curFontName = fontStack.pop() ?? null\n','                this.curFontName = fontStack.pop() ?? null\n                this.curFirstIndent = paragraphStack.pop() ?? 0\n');
patch('TextRenderer.js','            case MTextFormatParser.EntityType.FONT:\n',`            case MTextFormatParser.EntityType.PARAGRAPH_INDENT:
                this.curFirstIndent = item.first
                this.curParagraph.firstIndent = this.curFirstIndent
                break

            case MTextFormatParser.EntityType.FONT:
`);
patch('TextRenderer.js','        this.emptyFontSize = textBox.curFontSize\n','        this.emptyFontSize = textBox.curFontSize\n        this.firstIndent = textBox.curFirstIndent\n');
patch('TextRenderer.js','                if (curWidth + chunkWidth > boxWidth) {','                if (curWidth + chunkWidth > boxWidth - (this.lines.length === 0 ? this.firstIndent : 0)) {');
patch('TextRenderer.js','            chunk.position = curWidth\n','            chunk.position = curWidth + (this.lines.length === 0 ? this.firstIndent : 0)\n');
patch('TextRenderer.js','                                                       curWidth))','                                                       curWidth + (this.lines.length === 0 ? this.firstIndent : 0)))');
