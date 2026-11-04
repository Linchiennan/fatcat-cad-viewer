"""Build public/fonts/FatcatSymbols.ttf: symbols CJK drawings use that neither bundled font has.
≒ (U+2252, 約等於; 喬瓏 鑫元鴻 火警圖 and 惠宇敦南 天花板圖, about 2% of drawings showed a blank) is composed from
Liberation Sans' "=" and two scaled "." glyphs. Liberation Sans is SIL OFL 1.1 with the Reserved Font Name
"Liberation", so the result is renamed and stays under the OFL (see LICENSE-FATCAT-SYMBOLS-OFL.txt).
Run: python scripts/make-symbol-font.py  (needs fontTools)"""
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent
from fontTools import subset

SRC, OUT = 'public/fonts/LiberationSans-Regular.ttf', 'public/fonts/FatcatSymbols.ttf'
font = TTFont(SRC)
cmap = font.getBestCmap(); eq, dot = cmap[ord('=')], cmap[ord('.')]


def component(name, dx, dy, scale=1.0):
    c = GlyphComponent(); c.glyphName = name; c.x, c.y = dx, dy; c.flags = 0x4
    if scale != 1.0: c.transform = [[scale, 0], [0, scale]]
    return c


# "=" spans y 344-1004; dots (period 187-382 x 0-219, scaled 0.75) sit above its left end and below its right end
glyph = Glyph(); glyph.numberOfContours = -1
glyph.components = [component(eq, 0, 0), component(dot, 87, 1098, 0.75), component(dot, 682, 88, 0.75)]
font['glyf'].glyphs['uni2252'] = glyph; font.setGlyphOrder(font.getGlyphOrder() + ['uni2252'])
font['hmtx'].metrics['uni2252'] = font['hmtx'].metrics[eq]
for table in font['cmap'].tables:
    if table.isUnicode(): table.cmap[0x2252] = 'uni2252'

options = subset.Options(); options.notdef_outline = True; options.name_IDs = ['*']; options.glyph_names = True
sub = subset.Subsetter(options); sub.populate(unicodes=[0x2252]); sub.subset(font)
names = font['name']
for rec in names.names:
    if rec.nameID in (1, 4, 16, 21): rec.string = 'Fatcat Symbols'
    elif rec.nameID == 6: rec.string = 'FatcatSymbols'
    elif rec.nameID == 3: rec.string = 'Fatcat Symbols 1.0 (from Liberation Sans)'
    elif rec.nameID in (0, 7, 8, 9, 11, 12): rec.string = rec.toUnicode() if rec.nameID == 0 else ''
names.names = [r for r in names.names if r.string != '' or r.nameID == 0]
font.save(OUT)
print(OUT, 'glyphs', len(font.getGlyphOrder()))
