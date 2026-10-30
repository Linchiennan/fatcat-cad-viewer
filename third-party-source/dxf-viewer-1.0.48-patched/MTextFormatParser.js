/** Parses MTEXT formatted text into more convenient intermediate representation. The MTEXT
 * formatting is not well documented, the only sources I found:
 * https://web.archive.org/web/20250910173415/https://adndevblog.typepad.com/autocad/2017/09/dissecting-mtext-format-codes.html
 * https://ezdxf.readthedocs.io/en/stable/dxfentities/mtext.html#mtext-inline-codes
 */

import colorTable from "./parser/AutoCadColorIndex"

const State = Object.freeze({
    TEXT: 0,
    ESCAPE: 1,
    /* Skip currently unsupported format codes till ';' */
    SKIP_FORMAT: 2,
    /* For \pxq* paragraph formatting. Not found documentation yet, so temporal naming for now. */
    PARAGRAPH1: 3,
    PARAGRAPH2: 4,
    PARAGRAPH3: 5,
    /* Parsing \Cxxx color code. */
    COLOR: 6,
    /* Parsing \H height code (fatcat). */
    HEIGHT: 7,
    WIDTH: 8,
    FONT: 9
})

const EntityType = Object.freeze({
    TEXT: 0,
    SCOPE: 1,
    PARAGRAPH: 2,
    NON_BREAKING_SPACE: 3,
    /** "alignment" property is either "r", "c", "l", "j", "d" for right, center, left, justify
     * (seems to be the same as left), distribute (justify) alignment.
     */
    PARAGRAPH_ALIGNMENT: 4,
    /** \Cxxx color code. "color" property specified (index resolved to actual color value). */
    COLOR: 5,
    /** \H height change (fatcat): "height" value, "relative" for an "x" multiplier. */
    HEIGHT: 6,
    WIDTH: 7,
    FONT: 8,
    PARAGRAPH_INDENT: 9
    /* Many others are not yet implemented. */
})

/** Single letter format codes which are not terminated by ";". */
const shortFormats = new Set([
    "L", "l", "O", "o", "K", "k", "P", "X", "~"
])

const longFormats = new Set([
    "f", "F", "p", "Q", "H", "W", "S", "A", "C", "T"
])

const validEscapes = new Set([
    "\\", "{", "}"
])

export class MTextFormatParser {

    constructor() {
        this.entities = []
    }

    Parse(text) {
        const n = text.length
        let textStart = 0
        let state = State.TEXT
        let scopeStack = []
        let curEntities = this.entities
        let curPos = 0
        const _this = this

        function EmitText() {
            if (state !== State.TEXT || textStart === curPos) {
                return
            }
            curEntities.push({
                type: EntityType.TEXT,
                content: text.slice(textStart, curPos)
            })
            textStart = curPos
        }

        function EmitEntity(type) {
            curEntities.push({type: type})
        }

        function EmitColor() {
            const s = text.slice(textStart, curPos)
            const colorIndex = parseInt(s)
            if (isNaN(colorIndex)) {
                return
            }
            if (colorIndex < 1 || colorIndex > 255) {
                return
            }
            /* We actually allow whole color table indices for better compatibility. */
            curEntities.push({type: EntityType.COLOR, color: colorTable[colorIndex]})
        }

        function EmitWidth() {
            const s = text.slice(textStart, curPos).trim()
            const relative = /x$/i.test(s)
            const width = Number(relative ? s.slice(0, -1) : s)
            if (Number.isFinite(width) && width > 0 && width <= 100) {
                curEntities.push({type: EntityType.WIDTH, width, relative})
            }
        }

        function EmitHeight() {
            const s = text.slice(textStart, curPos).trim()
            const relative = /x$/i.test(s)
            const height = parseFloat(relative ? s.slice(0, -1) : s)
            if (!(height > 0) || height > 1e4) {
                return
            }
            curEntities.push({type: EntityType.HEIGHT, height, relative})
        }

        function PushScope() {
            const scope = {
                type: EntityType.SCOPE,
                content: []
            }
            curEntities.push(scope)
            curEntities = scope.content
            scopeStack.push(scope)
        }

        function PopScope() {
            if (scopeStack.length === 0) {
                /* Stack underflow, just ignore now. */
                return
            }
            scopeStack.pop()
            if (scopeStack.length === 0) {
                curEntities = _this.entities
            } else {
                curEntities = scopeStack[scopeStack.length - 1].content
            }
        }

        for ( ;curPos < n; curPos++) {
            const c = text.charAt(curPos)

            switch (state) {

            case State.TEXT:
                if (c === "{") {
                    EmitText()
                    PushScope()
                    textStart = curPos + 1
                    continue
                }
                if (c === "}") {
                    EmitText()
                    PopScope()
                    textStart = curPos + 1
                    continue
                }
                if (c === "\\") {
                    EmitText()
                    state = State.ESCAPE
                    continue
                }
                continue

            case State.ESCAPE:
                if (shortFormats.has(c)) {
                    switch (c) {
                    case "P":
                        EmitEntity(EntityType.PARAGRAPH)
                        break
                    case "~":
                        EmitEntity(EntityType.NON_BREAKING_SPACE)
                        break
                    }
                    state = State.TEXT
                    textStart = curPos + 1
                    continue
                }
                if (longFormats.has(c)) {
                    switch (c) {
                    case "p":
                        state = State.PARAGRAPH1
                        textStart = curPos + 1
                        continue
                    case "f":
                    case "F":
                        state = State.FONT
                        textStart = curPos + 1
                        continue
                    case "W":
                        state = State.WIDTH
                        textStart = curPos + 1
                        continue
                    case "H":
                        state = State.HEIGHT
                        textStart = curPos + 1
                        continue
                    case "C":
                        state = State.COLOR
                        textStart = curPos + 1
                        continue
                    }
                    state = State.SKIP_FORMAT
                    continue
                }
                /* Include current character into a next text chunk. Backslash is also included if
                 * character is not among allowed ones (that is how Autodesk viewer behaves).
                 */
                if (validEscapes.has(c)) {
                    textStart = curPos
                } else {
                    textStart = curPos - 1
                }
                state = State.TEXT
                continue

            case State.PARAGRAPH1:
                if (c === ";") {
                    const args = text.slice(textStart, curPos).replace(/^x/, "").split(",")
                    for (const arg of args) {
                        const m = /^i([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|\*)$/.exec(arg)
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
                continue

            case State.PARAGRAPH2:
                state = c === "q" ? State.PARAGRAPH3 : State.SKIP_FORMAT
                continue

            case State.PARAGRAPH3:
                curEntities.push({type: EntityType.PARAGRAPH_ALIGNMENT, alignment: c})
                state = State.SKIP_FORMAT
                continue

            case State.SKIP_FORMAT:
                if (c === ";") {
                    textStart = curPos + 1
                    state = State.TEXT
                }
                continue

            case State.FONT:
                if (c === ";") {
                    const font = text.slice(textStart, curPos).split("|")[0].trim()
                    if (font) curEntities.push({type: EntityType.FONT, font})
                    textStart = curPos + 1
                    state = State.TEXT
                }
                continue

            case State.WIDTH:
                if (c === ";") {
                    EmitWidth()
                    textStart = curPos + 1
                    state = State.TEXT
                }
                continue

            case State.HEIGHT:
                if (c === ";") {
                    EmitHeight()
                    textStart = curPos + 1
                    state = State.TEXT
                }
                continue

            case State.COLOR:
                if (c === ";") {
                    EmitColor()
                    textStart = curPos + 1
                    state = State.TEXT
                }
                continue

            default:
                throw new Error("Unhandled state")
            }
        }

        EmitText()
    }

    /** @typedef MTextFormatEntity
     * @property type One of EntityType
     *
     * @return {MTextFormatEntity[]} List of format chunks. Each chunk is either a text chunk with
     * TEXT type or some format entity. Entity with type SCOPE represents format scope which has
     * nested list of entities in "content" property.
     */
    GetContent() {
        return this.entities
    }

    /** Return only text chunks in a flattened sequence of strings. */
    *GetText() {

        function *TraverseItems(items) {
            for (const item of items) {
                if (item.type === EntityType.TEXT) {
                    yield item.content
                } else if (item.type === EntityType.SCOPE) {
                    yield *TraverseItems(item.content)
                }
            }
        }

        yield *TraverseItems(this.GetContent())
    }
}

MTextFormatParser.EntityType = EntityType
