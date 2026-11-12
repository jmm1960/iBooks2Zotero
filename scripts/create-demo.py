#!/usr/bin/env python3
"""Create original CC0 demo pages. Requires reportlab; annotations added by Swift."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'demo' / 'clean.pdf'
OUT.parent.mkdir(exist_ok=True)
c = canvas.Canvas(str(OUT), pagesize=(612, 792), invariant=1)
c.setTitle('Small Ideas, Clear Notes - Original Demo')
c.setAuthor('Apple Books Notes contributors')
c.setSubject('Original CC0 demo; no third-party book content')

def text(x, y, value, size=12, color='#334155', font='Helvetica'):
    c.setFillColor(HexColor(color)); c.setFont(font, size); c.drawString(x,y,value)

def base(page, title, subtitle):
    text(48, 746, 'APPLE BOOKS NOTES / OPEN DEMO', 10, '#2563a6', 'Helvetica-Bold')
    text(48, 694, title, 28, '#172337', 'Helvetica-Bold')
    text(48, 666, subtitle, 12, '#64748b')
    c.setStrokeColor(HexColor('#dbe3ec')); c.line(48,643,564,643)
    c.line(48,61,564,61)
    text(48,43,'Original content - CC0 1.0 - Synthetic PencilKit test fixture',8,'#64748b')
    text(546,43,str(page),10,'#64748b')

base(1, 'Small ideas, clear notes', 'A short, original worksheet for testing annotation import.')
text(48,608,'01  A remainder tells a small story',16,'#172337','Helvetica-Bold')
for y,line in zip([574,552,530],[
    'Modulo keeps the remainder after division.',
    'Numbers can look different and still have the same remainder.',
    'For example, 7 and 12 both leave remainder 2 when divided by 5.'
]): text(48,y,line)
c.setFillColor(HexColor('#f1f5f9')); c.roundRect(48,388,516,104,8,fill=1,stroke=0)
text(68,462,'WORKED EXAMPLE',10,'#64748b','Helvetica-Bold')
text(68,425,'7 + 5 = 12        12 mod 5 = 2',22,'#172337','Helvetica-Bold')
text(48,338,'Try it yourself',16,'#172337','Helvetica-Bold')
text(48,307,'What is 17 mod 5? Write the remainder in the space below.')
text(48,158,'A highlight, a comment, and pen strokes can remain separate.',11,'#64748b')
c.showPage()

base(2, 'Space changes the grouping', 'Two separate pen clusters make splitting thresholds easy to explore.')
text(48,608,'02  Follow the white space',16,'#172337','Helvetica-Bold')
text(48,574,'Nearby strokes usually belong to the same short note.')
text(48,552,'A larger empty gap can separate two independent notes.')
text(48,495,'CLUSTER A',10,'#64748b','Helvetica-Bold')
text(332,495,'CLUSTER B',10,'#64748b','Helvetica-Bold')
text(48,340,'Try another split order',16,'#172337','Helvetica-Bold')
text(48,307,'Start with vertical gaps, then split each band horizontally.')
text(48,285,'Increase a threshold to merge more strokes; decrease it to split.')
text(48,184,'Change the import range to 2-2 to process this page only.',12,'#2563a6')
c.showPage()

base(3, 'An intentionally quiet page', 'This page contains no annotations in the demo source.')
text(48,608,'03  Check the page range',16,'#172337','Helvetica-Bold')
text(48,574,'The complete document has three pages.')
text(48,552,'Only the first two pages contain demonstration annotations.')
text(48,510,'A range of 3-3 should show an empty annotation preview.')
text(48,488,'A range of 1-2 should include all demonstration annotations.')
c.showPage(); c.save()
print(OUT)
