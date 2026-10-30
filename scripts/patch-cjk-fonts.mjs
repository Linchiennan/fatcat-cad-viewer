// Modifications: preserve cmap aliases, CFF bounds, winding and contour grouping.
// Upstream TextRenderer.js remains MPL-2.0; CFF-only ordering keeps trailing holes.
// code11 additionally resolves nested islands by the smallest containing solid.
import fs from 'node:fs';
const path=new URL('../node_modules/dxf-viewer/src/TextRenderer.js',import.meta.url);
const old='this.charMap.set(String.fromCodePoint(glyph.unicode), glyph)';
const replacement='for (const codepoint of (glyph.unicodes?.length ? glyph.unicodes : [glyph.unicode])) {\n                this.charMap.set(String.fromCodePoint(codepoint), glyph)\n            }';
const source=fs.readFileSync(path,'utf8');
if(source.includes(replacement)) console.log('CJK cmap patch already applied');
else {if(source.split(old).length!==2)throw new Error('Unexpected dxf-viewer version; refuse patch');fs.writeFileSync(path,source.replace(old,replacement));console.log('CJK cmap alias patch applied');}

const current=fs.readFileSync(path,'utf8');
const boundsOld='bounds: {xMin: glyph.xMin * scale, xMax: glyph.xMax * scale,\n                         yMin: glyph.yMin * scale, yMax: glyph.yMax * scale}';
const boundsNew='bounds: {xMin: (glyph.xMin ?? glyph.getBoundingBox().x1) * scale, xMax: (glyph.xMax ?? glyph.getBoundingBox().x2) * scale,\n                         yMin: (glyph.yMin ?? glyph.getBoundingBox().y1) * scale, yMax: (glyph.yMax ?? glyph.getBoundingBox().y2) * scale}';
if(!current.includes(boundsNew)){if(current.split(boundsOld).length!==2)throw new Error('Unexpected font bounds implementation');fs.writeFileSync(path,current.replace(boundsOld,boundsNew));console.log('CFF outline bounds fallback applied');}

const shapeSource=fs.readFileSync(path,'utf8');
const windingOld='glyph.path.toShapes(false)';
const windingNew='glyph.path.toShapes(font.data.outlinesFormat === "cff")';
if(!shapeSource.includes(windingNew)){if(shapeSource.split(windingOld).length!==2)throw new Error('Unexpected outline winding implementation');fs.writeFileSync(path,shapeSource.replace(windingOld,windingNew));console.log('CFF contour winding applied');}

const holeSource=fs.readFileSync(path,'utf8');
if(holeSource.includes('shapePoints.holes[h] = hole.reverse()')) {fs.writeFileSync(path,holeSource.replace('shapePoints.holes[h] = hole.reverse()', 'hole.reverse()'));console.log('Fix upstream undefined hole index for CFF');}

// CFF may put holes before AND after the outer contour. Three r161's
// holesFirst branch silently drops trailing holes. Rotate, never reverse,
// so toShapes starts on an outer contour and retains/reassigns every hole.
const orderedSource=fs.readFileSync(path,'utf8');
const orderedOld='const shapes = glyph.path.toShapes(font.data.outlinesFormat === "cff")';
const orderedNew=`if (font.data.outlinesFormat === "cff") {
                const paths = glyph.path.subPaths
                const firstOuter = paths.findIndex(p => !ShapeUtils.isClockWise(p.getPoints()))
                if (firstOuter > 0) glyph.path.subPaths = paths.slice(firstOuter).concat(paths.slice(0, firstOuter))
            }
            const shapes = glyph.path.toShapes(font.data.outlinesFormat === "cff")`;
if(!orderedSource.includes(orderedNew)){if(orderedSource.split(orderedOld).length!==2)throw Error('Unexpected CFF contour grouping implementation');fs.writeFileSync(path,orderedSource.replace(orderedOld,orderedNew));console.log('Preserve CFF trailing holes independently of contour ordering');}

// Three's ambiguous-containment fallback keeps order-based assignments when a
// hole lies in BOTH an enclosing frame and an internal solid (圍/格/個).
// Reset CFF holes and attach each to its smallest enclosing positive contour.
const nestedSource=fs.readFileSync(path,'utf8');
const nestedAnchor='const shapes = glyph.path.toShapes(font.data.outlinesFormat === "cff")';
const nestedFix=`
            if (font.data.outlinesFormat === "cff") {
                // FATCAT_CFF_SMALLEST_CONTAINER: preserve all original paths.
                const contains = (point, polygon) => {
                    let inside = false
                    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                        const a = polygon[i], b = polygon[j]
                        if ((a.y > point.y) !== (b.y > point.y) &&
                            point.x < (b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside = !inside
                    }
                    return inside
                }
                const solids = shapes.map(shape => {
                    shape.holes = []
                    const points = shape.getPoints(options.curveSubdivision)
                    return {shape, points, area: Math.abs(ShapeUtils.area(points))}
                }).sort((a,b) => a.area-b.area)
                for (const hole of glyph.path.subPaths) {
                    const points = hole.getPoints(options.curveSubdivision)
                    if (!ShapeUtils.isClockWise(points)) continue
                    const area = Math.abs(ShapeUtils.area(points))
                    const parent = solids.find(s => s.area > area && contains(points[0], s.points))
                    if (!parent) throw new Error("CFF hole has no containing solid")
                    parent.shape.holes.push(hole)
                }
            }`;
if(!nestedSource.includes('FATCAT_CFF_SMALLEST_CONTAINER')) {
    if(nestedSource.split(nestedAnchor).length!==2)throw Error('Unexpected nested CFF grouping implementation');
    fs.writeFileSync(path,nestedSource.replace(nestedAnchor,nestedAnchor+nestedFix));
    console.log('Assign nested CFF holes to the smallest containing solid');
}

// Noto CJK draws some glyphs' only solid clockwise (］ ｝ 〕 ㄟ ˙ … 31 glyphs). Such a
// contour looks like a hole with no container; throwing aborted the whole drawing.
// Keep it as a solid of its own (reversed to counter-clockwise) instead.
const loneSource=fs.readFileSync(path,'utf8');
const loneOld='if (!parent) throw new Error("CFF hole has no containing solid")';
const loneNew=`if (!parent) {
                        // FATCAT_CFF_LONE_SOLID
                        const shape = new Shape(points.slice().reverse())
                        shapes.push(shape)
                        solids.push({shape, points: shape.getPoints(options.curveSubdivision), area})
                        solids.sort((a,b) => a.area-b.area)
                        continue
                    }`;
if(!loneSource.includes('FATCAT_CFF_LONE_SOLID')) {
    if(loneSource.split(loneOld).length!==2||loneSource.split('import {Matrix3, Vector2} from "three"').length!==2)throw Error('Unexpected lone CFF solid implementation');
    fs.writeFileSync(path,loneSource.replace(loneOld,loneNew).replace('import {Matrix3, Vector2} from "three"','import {Matrix3, Shape, Vector2} from "three"'));
    console.log('Keep clockwise-only CFF contours as solids');
}
