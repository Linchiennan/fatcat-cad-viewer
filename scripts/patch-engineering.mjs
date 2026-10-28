import fs from 'node:fs';
const root='node_modules/dxf-viewer/src/';
function patch(file,old,next){const p=root+file;let s=fs.readFileSync(p,'utf8');if(s.includes(next))return;if(!s.includes(old))throw Error('版本錨點不符 '+file);fs.writeFileSync(p,s.replace(old,next));}
patch('parser/ParseHelpers.js','entity.color = getAcadColor(Math.abs(curr.value));','if (entity.trueColor === undefined) entity.color = getAcadColor(Math.abs(curr.value));');
patch('parser/ParseHelpers.js','entity.color = curr.value;','entity.trueColor = curr.value; entity.color = curr.value;');
patch('parser/DxfParser.js','layer.color = curr.value;','layer.trueColor = curr.value; layer.color = curr.value;');
patch('parser/DxfParser.js','case 62: // color, visibility','case 6: layer.lineType = curr.value; curr = scanner.next(); break;\n                case 370: layer.lineweight = curr.value; curr = scanner.next(); break;\n                case 62: // color, visibility');
patch('DxfScene.js','_GetEntityColor(entity, blockCtx = null) {','_GetEntityColor(entity, blockCtx = null) {\n        if (Number.isInteger(entity.trueColor)) return entity.trueColor;');
patch('parser/DxfParser.js',"DxfParser.prototype.parseSync = function(source) {","DxfParser.prototype.parseSync = function(source) {\n    if (typeof source === 'string' && source.startsWith('FATCAT-DXF-JSON\\n')) { const d=JSON.parse(source.slice(16)); if (!Array.isArray(d.entities)) throw Error('外參圖面格式錯誤'); return d; }");
patch('parser/DxfParser.js',"log.warn('Unhandled entity ' + curr.value);","dxf.cadUnsupported ??= {}; dxf.cadUnsupported[curr.value] = (dxf.cadUnsupported[curr.value] || 0) + 1; log.warn('Unhandled entity ' + curr.value);");
patch('DxfViewer.js','m.uniforms.color = { value: new three.Color(color) }\n        return m','m.uniforms.color = { value: new three.Color().setHex(color, three.LinearSRGBColorSpace) }\n        return m');
patch('DxfViewer.js','m.uniforms.color = { value: new three.Color(color) }\n        m.uniforms.size','m.uniforms.color = { value: new three.Color().setHex(color, three.LinearSRGBColorSpace) }\n        m.uniforms.size');
patch('DxfViewer.js','        function CreateObject(vertices, indices) {','        const cadLineweight = this.key.lineType >= 1000 ? this.key.lineType - 1000 : 0;\n        function CreateObject(vertices, indices) {');
patch('DxfViewer.js','            obj._dxfViewerLayer = layer','            obj.userData.cadLineweight = cadLineweight;\n            obj._dxfViewerLayer = layer');
patch('parser/DxfParser.js','layer.color = getAcadColor(layer.colorIndex);','if (layer.trueColor === undefined) layer.color = getAcadColor(layer.colorIndex);');
// Upgrade older candidate patch, then apply the same anchored patch to pristine 1.0.48.
{const p=root+'parser/DxfParser.js';let s=fs.readFileSync(p,'utf8');const old='case 74: ltype.complex = ltype.complex || curr.value !== 0; curr = scanner.next(); break;\n                ';if(s.includes(old))fs.writeFileSync(p,s.replace(old,''));}
patch('parser/DxfParser.js','case 49:\n                    ltype.pattern.push(curr.value);',`case 74:
                    ltype.complex = ltype.complex || curr.value !== 0;
                    if(ltype.elements?.length)ltype.elements.at(-1).flags=curr.value;
                    curr=scanner.next();break;
                case 75: case 340: case 46: case 50: case 44: case 45: case 9:
                    if(ltype.elements?.length)ltype.elements.at(-1)[({75:'shape',340:'styleHandle',46:'scale',50:'rotation',44:'x',45:'y',9:'text'})[curr.code]]=curr.value;
                    curr=scanner.next();break;
                case 49:
                    ltype.elements??=[];ltype.elements.push({length:curr.value,flags:0});
                    ltype.pattern.push(curr.value);`);
patch('parser/DxfParser.js','var parseStyles = function () {','var parseStyles = function () { /* fatcat-style-handles */');
{const p=root+'parser/DxfParser.js';let s=fs.readFileSync(p,'utf8');const start=s.indexOf('var parseStyles = function () {'),end=s.indexOf('var tableDefinitions =',start);let section=s.slice(start,end);if(!section.includes('case 5: style.handle')){section=section.replace('case 100:', 'case 5: style.handle=curr.value;curr=scanner.next();break;\n                case 100:');fs.writeFileSync(p,s.slice(0,start)+section+s.slice(end));}}
patch('parser/entities/text.js','case 50: // Rotation in degrees','case 51: entity.obliqueAngle=curr.value;break;\n        case 71: entity.textGenerationFlag=curr.value;break;\n        case 50: // Rotation in degrees');
console.log('工程parser/原色/線寬修補已套用');
// Nested block references skipped _FilterEntity, so hidden entities and frozen layers inside nested blocks still drew.
patch('DxfScene.js','            if (block.data.entities) {\n                for (const entity of block.data.entities) {\n                    this._ProcessDxfEntity(entity, nestedCtx)\n                }\n            }','            if (block.data.entities) {\n                for (const entity of block.data.entities) {\n                    if (!this._FilterEntity(entity)) continue /* fatcat nested filter */\n                    this._ProcessDxfEntity(entity, nestedCtx)\n                }\n            }');
// Old-style POLYLINE widths were skipped (40/41 on the polyline and on each VERTEX), so a donut or a wide 2D polyline
// came out as a hairline (世舜 門窗圖 10527C224: bulge 1, width 1.25, a filled ring in ZWCAD).
patch('parser/entities/vertex.js','        case 40: // start width\n            break;\n        case 41: // end width\n            break;','        case 40: // start width\n            entity.startWidth = curr.value;\n            break;\n        case 41: // end width\n            entity.endWidth = curr.value;\n            break;');
patch('parser/entities/polyline.js','        case 40: // start width\n            break;\n        case 41: // end width\n            break;','        case 40: // start width\n            entity.startWidth = curr.value;\n            break;\n        case 41: // end width\n            entity.endWidth = curr.value;\n            break;');
// A line or arc edge swallowed the loop's source-object count (97) as if it were a spline field, so the 330 after it
// ended the loop and every later loop was lost (太原段 排水 1B0C3: two side-by-side boxes, only the first hatched).
patch('parser/entities/hatch.js','            case 42:\n            case 97:\n                break;','            case 42:\n                break;\n            case 97: /* fatcat: a spline field only; after other edges it is the loop source count */\n                if (!isSpline) return e\n                break;');
// HATCH dropped its extrusion (210/220/230), so a hatch drawn with a downward normal stayed unmirrored while its circle
// boundary's own CIRCLE turned over (超級圖庫 閘閥: the solid wheel hub landed 56 units off the hub circle).
patch('parser/entities/hatch.js','        case 98: // Number of seed points','        case 210:\n            entity.extrusionDirection = helpers.parsePoint(scanner);\n            break;\n\n        case 98: // Number of seed points');
