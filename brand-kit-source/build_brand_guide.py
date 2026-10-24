"""Generate a website-derived brand guide and reusable vector/token kit."""
from pathlib import Path
import sys, re, json, zipfile, shutil, io, math
sys.path.insert(0, '/tmp/nextgen-brand-deps')
from fontTools.ttLib import TTFont as FontToolsFont
from fontTools.varLib.instancer import instantiateVariableFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.graphics import renderPDF
from svglib.svglib import svg2rlg
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'nextgen-replica'
OUT = ROOT / 'output/pdf'
KIT = OUT / 'NextGen-Ventures-Brand-Kit'
TMP = ROOT / 'tmp/pdfs/nextgen-brand'
for folder in (OUT, KIT / 'logos', KIT / 'tokens', KIT / 'references', TMP):
    folder.mkdir(parents=True, exist_ok=True)

NAVY='#000033'; BLUE='#0059ff'; HEADER_BLUE='#2454ff'; ACCENT='#385fff'
PALE='#eff8ff'; TEXT='#ededed'; PANEL='#151154'; INK='#111139'; MUTE='#62627a'
W,H=842,595
M=48

def font(name, filename, weight=None):
    src=SITE/'public/assets'/filename
    face=FontToolsFont(src)
    if 'fvar' in face:
        face=instantiateVariableFont(face, {'wght':weight or 400}, inplace=False)
    face.flavor=None
    target=TMP/(name+'.ttf')
    face.save(target)
    pdfmetrics.registerFont(TTFont(name,str(target)))

font('Space','98a0d4ac28a1eb32.woff2',500)
font('SpaceBold','98a0d4ac28a1eb32.woff2',700)
font('Urban','faa908ff52b2334e.woff2',400)
font('UrbanBold','faa908ff52b2334e.woff2',700)
font('Inter','5afd6099115c5013.woff2')
font('InterBold','cd48ba5f964ee1a0.woff2')

# Vector variants are mechanically derived from the existing website lockup.
original=(SITE/'public/assets/nextgen-logo.svg').read_text()
white=re.sub(r'fill="[^"]+"','fill="#ffffff"',original)
navy=re.sub(r'fill="[^"]+"','fill="#000033"',original)
plane=re.search(r'<path\b[^>]*>',white).group(0)
plane_d=re.search(r'd="([^"]+)"',plane).group(1).split(' Z M ',1)[0]+' Z'
icon=lambda color:f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><path d="{plane_d}" fill="{color}"/></svg>'
for name,data in [('lockup-white.svg',white),('lockup-navy.svg',navy),('symbol-white.svg',icon('#ffffff')),('symbol-navy.svg',icon(NAVY))]:
    (KIT/'logos'/name).write_text(data)

colors={'navy':NAVY,'primary-action':BLUE,'header-action':HEADER_BLUE,'accent':ACCENT,'panel':PANEL,'pale-white':PALE,'body-white':TEXT,'white':'#ffffff','investor-action':'#141414','focus':'#81b7ff'}
tokens={'name':'NextGen Ventures','edition':'Website-derived working guide, 24 October 2026','colors':colors,
        'fontFamilies':{'display':'Space Grotesk','title':'Urbanist','body':'Inter','navigation':'Urbanist'},
        'typePixels':{'display':[40,32,26],'sectionTitle':[30,24,19],'body':[16,14],'navigation':16,'action':14},
        'radiiPixels':{'button':6,'image':8,'featureCard':12},
        'layout':{'containerMax':1100,'mobileMax':809.98,'tabletMin':810,'desktopMin':1100,'headerMenuMax':1099.98,'galleryGap':10,'cardPadding':20},
        'recommendations':{'logoClearSpace':'At least one symbol height on all sides','minimumLockupWidthPixels':160,'textContrastNormal':4.5,'textContrastLarge':3}}
(KIT/'tokens/brand-tokens.json').write_text(json.dumps(tokens,indent=2)+'\n')
css='/* Website-derived tokens. Existing source/header blues intentionally differ. */\n:root {\n'
css+=''.join(f'  --ng-{name}: {value};\n' for name,value in colors.items())
css+='  --ng-font-display: "Space Grotesk", sans-serif;\n  --ng-font-title: "Urbanist", sans-serif;\n  --ng-font-body: "Inter", sans-serif;\n  --ng-radius-button: 6px;\n  --ng-radius-image: 8px;\n  --ng-radius-card: 12px;\n  --ng-container-max: 1100px;\n}\n'
(KIT/'tokens/brand-tokens.css').write_text(css)
provenance=json.loads((SITE/'public/assets/provenance.json').read_text())
font_sources=[a for a in provenance['assets'] if any(s in a['local'] for s in ['98a0d4','faa908','5afd609','cd48ba'])]
(KIT/'references/sources.json').write_text(json.dumps({'website':'https://www.nextgenventures.com.au/','date':'2026-10-24','basis':['nextgen-replica/DESIGN.md','nextgen-replica/app/globals.css','nextgen-replica/public/styles/home.css'],'fontSources':font_sources,'logoVariants':'White original-derived lockup; navy and symbol-only variants are kit derivatives.','recommendations':'Clear space, minimum width, copy guidance, and accessibility pairings are recommendations, not an official company standard.'},indent=2)+'\n')
shutil.copy2(SITE/'DESIGN.md',KIT/'references/website-design-system.md')

PDF=OUT/'NextGen-Ventures-Brand-Guidelines.pdf'
c=canvas.Canvas(str(PDF),pagesize=(W,H))
c.setTitle('NextGen Ventures | Website Brand Guidelines')
c.setAuthor('NextGen Ventures website-derived brand kit')
c.setSubject('Visual identity, logo usage, palette, typography, photography, digital UI and handoff')

def rect(x,y,w,h,fill,r=0,stroke=None):
    c.setFillColor(HexColor(fill)); c.setStrokeColor(HexColor(stroke or fill))
    if r:c.roundRect(x,H-y-h,w,h,r,fill=1,stroke=bool(stroke))
    else:c.rect(x,H-y-h,w,h,fill=1,stroke=bool(stroke))

def text(s,x,y,size=12,font='Inter',color=INK):
    c.setFillColor(HexColor(color));c.setFont(font,size);c.drawString(x,H-y-size*.82,s)

def para(s,x,y,w,size=12,color=INK,font='Inter',leading=None):
    st=ParagraphStyle('p',fontName=font,fontSize=size,leading=leading or size*1.45,textColor=HexColor(color),spaceAfter=0)
    p=Paragraph(s,st);_,height=p.wrap(w,H);p.drawOn(c,x,H-y-height);return height

def line(x,y,w,color='#dcdde7',dash=False):
    c.setStrokeColor(HexColor(color));c.setLineWidth(.7)
    if dash:c.setDash(3,3)
    c.line(x,H-y,x+w,H-y);c.setDash()

def logo(x,y,w=220,dark=False):
    drawing=svg2rlg(str(KIT/'logos'/('lockup-navy.svg' if dark else 'lockup-white.svg')))
    scale=w/drawing.width;c.saveState();c.translate(x,H-y-drawing.height*scale);c.scale(scale,scale);renderPDF.draw(drawing,c,0,0);c.restoreState()

def photo(file,x,y,w,h,r=8):
    img=Image.open(SITE/'public/assets'/file)
    iw,ih=img.size; target=w/h
    if iw/ih>target:
        crop=ih*target;left=(iw-crop)/2;img=img.crop((left,0,left+crop,ih))
    else:
        crop=iw/target;top=(ih-crop)/2;img=img.crop((0,top,iw,top+crop))
    img=img.resize((int(w*3),int(h*3)),Image.Resampling.LANCZOS)
    c.saveState();p=c.beginPath();p.roundRect(x,H-y-h,w,h,r);c.clipPath(p,stroke=0,fill=0)
    c.drawImage(ImageReader(img),x,H-y-h,w,h,mask='auto');c.restoreState()

def page(n,label,dark=False):
    bg=NAVY if dark else '#ffffff'; fg=PALE if dark else INK
    rect(0,0,W,H,bg)
    text('NEXTGEN VENTURES',M,25,9,'SpaceBold',fg)
    text('WEBSITE BRAND GUIDELINES',W-247,25,8,'Inter',fg)
    line(M,49,W-M*2,'#282852' if dark else '#e1e2eb')
    text(label,M,H-28,8,'Inter','#a0a2be' if dark else MUTE)
    text(f'{n:02d} / 09',W-87,H-28,8,'Inter','#a0a2be' if dark else MUTE)

def title(s,subtitle=None,dark=False):
    text(s,M,76,32,'SpaceBold',PALE if dark else NAVY)
    if subtitle:para(subtitle,M,120,725,11.5,'#b7b8cf' if dark else MUTE)

def label(s,x,y,dark=False):text(s.upper(),x,y,9,'InterBold','#a2baff' if dark else HEADER_BLUE)
def end():c.showPage()

poppy_image=Image.open(SITE/'public/assets/1e15d837aaebd51b.png')
poppy_image.thumbnail((1100,500),Image.Resampling.LANCZOS)
poppies=ImageReader(poppy_image)

# 01: Cover. Original language and imagery, not a new campaign identity.
page(1,'Website-derived working guide | 24 October 2026',True)
logo(M,80,278)
text('Brand',M,161,72,'SpaceBold',PALE)
text('guidelines.',M,234,72,'SpaceBold',PALE)
para('Backing young Australian founders before anyone else to build global unicorns.',M,339,550,22,PALE,'Space',28)
label('Identity / Digital experience / Reusable assets',M,446,True)
para('A practical kit based on the website as implemented. Recommendations are identified separately from observed website styles.',M,469,510,10,'#b7b8cf')
c.drawImage(poppies,570,55,300,134,mask='auto',preserveAspectRatio=True,anchor='sw')
end()

# 02: Positioning and tone.
page(2,'Brand foundations')
title('Young ambition. Taken seriously.','The brand pairs ambitious founder language with real people, direct invitations and a distinctive dark-blue digital world.')
label('Existing positioning',M,174)
para('A first-cheque venture fund.',M,198,420,28,NAVY,'UrbanBold',32)
para('The website speaks to young Australian founders and prospective investors. It presents NextGen as an early believer: approachable, committed and ready to act before others.',M,253,345,13)
rect(450,174,344,176,NAVY,12)
text('What must stay recognisable',472,196,18,'UrbanBold',PALE)
for i,s in enumerate(['Deep navy and vivid blue','Geometric, confident type','Actual founders and community','The paper-plane mark and blue poppies']):
    text(s,472,234+i*26,11,'Inter',PALE)
label('Recommended writing guidance',M,391)
for x,heading,body in [(48,'Direct','Use plain verbs and short invitations. Keep the next step obvious.'),(306,'Founder-first','Speak to ambition with warmth. Be clear about how the team helps.'),(564,'Specific','Use real names, examples and evidence. Avoid invented proof or inflated claims.')]:
    text(heading,x,416,20,'UrbanBold',NAVY);para(body,x,449,222,11,MUTE)
para('Existing CTA language: "Share your idea", "Founders - Get in touch", "LP Enquiry".',M,523,730,10,HEADER_BLUE)
end()

# 03: Logos.
page(3,'Logo system',True)
title('One mark. Clear recognition.','Use the original horizontal lockup as the primary signature. Kit variants preserve its geometry.',True)
rect(48,169,746,125,PANEL,12);logo(102,210,535)
label('Primary white lockup on navy',70,272,True)
rect(48,317,350,107,'#ffffff',10);logo(75,351,290,True)
rect(418,317,376,107,PANEL,10)
symbol=svg2rlg(str(KIT/'logos/symbol-white.svg'));c.saveState();c.translate(449,H-347-42);c.scale(42/symbol.width,42/symbol.width);renderPDF.draw(symbol,c,0,0);c.restoreState()
para('Symbol-only derivative<br/>Use only where the brand is already identified.',515,342,250,11,PALE)
label('Recommended usage rules',48,453,True)
para('Clear space: leave at least one symbol height around the lockup. Website reference size: 193 x 20px. Recommended digital minimum: 160px wide, checked at actual display size.',48,476,354,11,PALE)
para('Keep aspect ratio intact. Do not stretch, rotate, add shadows, retype the wordmark, or place the mark over busy photographs. Navy and symbol-only assets are derived kit variants.',438,476,356,11,PALE)
end()

# 04: Palette.
page(4,'Colour system')
title('Navy is the canvas. Blue acts.','Keep the existing colour roles distinct. These are digital RGB values, not print colour specifications.')
swatches=[('Navy',NAVY,'0 / 0 / 51','Primary canvas'),('Action blue',BLUE,'0 / 89 / 255','Founder actions'),('Pale white',PALE,'239 / 248 / 255','Header and high contrast type'),('Panel',PANEL,'21 / 17 / 84','Layered surfaces')]
for i,(name,hx,rgb,role) in enumerate(swatches):
    x=48+i*190;rect(x,172,176,130,hx,8, '#e0e1eb' if i==2 else None)
    text(name,x,318,19,'UrbanBold',NAVY);text(hx.upper(),x,347,12,'SpaceBold',INK)
    text('RGB '+rgb,x,371,9,'Inter',MUTE);para(role,x,395,176,10,MUTE)
line(48,438,746)
label('Supporting website values',48,458)
for i,(name,value) in enumerate([('Header action',HEADER_BLUE),('Section accent',ACCENT),('Body copy',TEXT),('Investor action','#141414')]):
    x=48+i*190;rect(x,483,15,15,value,3, '#dcdde7' if value==TEXT else None)
    text(name,x+23,483,10,'Inter',INK);text(value.upper(),x+23,505,10,'Space',MUTE)
end()

# 05: Typography.
page(5,'Typography',True)
title('Three roles. One coherent voice.','Use the actual website families. Do not replace geometric headlines with a generic display face.',True)
label('Space Grotesk / Display and source actions',48,170,True)
text('Backing young Australian founders.',48,199,31,'SpaceBold',PALE)
text('Display: 40 / 32 / 26px | Bold 700 | Line-height 120%',48,247,10,'Inter','#b7b8cf')
line(48,280,746,'#282852')
label('Urbanist / Section titles and navigation',48,303,True)
text('Your First Cheque and Beyond',48,331,30,'UrbanBold',PALE)
text('Section titles: 30 / 24 / 19px | Bold 700 | Navigation: 16px / 500',48,377,10,'Inter','#b7b8cf')
line(48,411,746,'#282852')
label('Inter / Reading copy',48,435,True)
para("To build a legendary company, it takes a village. Our team, Mitch, and Jerry are here for you 24/7 and 365 days a year.",48,460,506,14,PALE,'Inter',20)
para('Body: 16px desktop, 14px below desktop.<br/>Keep comfortable line lengths and the source page rhythm.',596,460,198,10,'#b7b8cf')
end()

# 06: Photography and signature.
page(6,'Photography and artwork')
title('Show the people behind ambition.','The website earns credibility through real founders, conversations and community - not generic technology stock.')
photos=[('fb62ead9cf70400c.jpg','Conversations in context'),('1ceebc5fac3e4d8a.jpg','Community and belonging'),('b66dfee42b6c0bcd.png','Founders as individuals')]
for i,(file,caption) in enumerate(photos):
    x=48+i*254;photo(file,x,174,238,159);text(caption,x,348,12,'UrbanBold',NAVY)
rect(48,394,370,130,NAVY,10)
c.drawImage(poppies,64,H-515,335,110,mask='auto',preserveAspectRatio=True,anchor='sw')
text('The blue poppy is a signature asset.',445,396,19,'UrbanBold',NAVY)
para('Keep the existing artwork, colour and organic silhouette. It supports the "garden of tall poppies" idea; use it purposefully rather than as a repeated background texture.',445,430,345,11,MUTE)
para('Recommended image treatment: natural skin tones, candid energy and clear focal subjects. Preserve intentional crops and avoid text over visually busy areas.',445,492,345,10,MUTE)
end()

# 07: UI components.
page(7,'Digital component language',True)
title('Make the next step unmistakable.','Preserve source action colours, restrained corner rounding and simple, readable controls.',True)
rect(48,173,354,205,PANEL,12)
text('Looking for investment?',70,196,24,'UrbanBold',PALE)
para("If you're a young Aussie founder bursting with ambition, we want to hear from you.",70,239,305,13,PALE)
rect(70,307,153,43,BLUE,6);text('Share your idea',90,321,12,'Space', '#ffffff')
label('Primary action / 6px radius',70,397,True)
rect(440,173,354,205,PANEL,12)
text('Looking to invest?',462,196,24,'UrbanBold',PALE)
para('Keep investor enquiries visibly distinct from founder applications.',462,239,305,13,PALE)
rect(462,307,122,43,'#141414',6);text('LP Enquiry',481,321,12,'Space','#ffffff')
label('Secondary investor action',462,397,True)
line(48,438,746,'#282852')
para('Observed dimensions<br/><b>Buttons:</b> 50px reference height; 14px labels.<br/><b>Photos:</b> 8px radius. <b>Feature cards:</b> 12px radius.',48,459,354,11,PALE)
para('States to preserve<br/>Clear hover treatment, visible keyboard focus and a labelled menu toggle. The focus ring uses #81B7FF with a 2px outline and 5px offset.',440,459,354,11,PALE)
end()

# 08: Layout, motion and accessibility.
page(8,'Responsive behaviour and accessibility')
title('Consistent character at every size.','Use the source layouts as the authority. Scale hierarchy and spacing; do not compress a desktop page into a phone.')
rows=[('Desktop','1100px and above','1100px maximum content container; inline navigation.'),('Tablet','810-1099.98px','32px display headings; navigation collapses to the menu.'),('Mobile','Up to 809.98px','26px display headings; stacked content and actions.')]
y=176
for name,range_,description in rows:
    text(name,48,y,20,'UrbanBold',NAVY);text(range_,214,y+3,11,'SpaceBold',HEADER_BLUE);para(description,410,y,380,12,INK)
    line(48,y+48,746);y+=71
label('Motion',48,410)
para('The two photo strips move in opposing directions. The replica uses 50s / 58s linear loops, pauses on hover and stops for reduced-motion preferences. Keep reading content visible without entrance-animation delays.',48,434,352,11,INK)
label('Recommended accessibility rules',440,410)
def luminance(h):
    rgb=[int(h[i:i+2],16)/255 for i in (1,3,5)];rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]
def contrast(a,b):
    a,b=sorted([luminance(a),luminance(b)]);return (b+.05)/(a+.05)
para(f'White on action blue: {contrast("#ffffff",BLUE):.1f}:1. Pale white on navy: {contrast(PALE,NAVY):.1f}:1. Target 4.5:1 for normal text and 3:1 for large text. Use pale copy for small text on navy; do not assume every blue-on-navy label passes.',440,434,352,11,INK)
end()

# 09: Practical handoff.
page(9,'Handoff and consistency checklist')
title('A kit built to be used.','Keep the guide, assets and implementation tokens together. This is a website-derived working standard, not an independently approved corporate identity manual.')
label('Included in the asset bundle',48,177)
items=[('01','Logos','White and navy horizontal SVG lockups; white and navy symbol-only SVGs.'),('02','Digital tokens','CSS custom properties and JSON values for colour, type, radius and layout.'),('03','References','Source URLs, font asset references and the existing website design-system record.')]
y=205
for num,heading,body in items:
    text(num,48,y,13,'SpaceBold',HEADER_BLUE);text(heading,86,y-2,20,'UrbanBold',NAVY);para(body,86,y+27,318,11,MUTE);y+=92
rect(456,177,338,260,NAVY,12)
text('Before anything goes live',478,198,22,'UrbanBold',PALE)
checks=['Original mark, proportion and contrast','Correct type family for each role','Existing colour roles preserved','Real imagery with intentional crops','Mobile and keyboard behaviour checked','Clear CTA and accurate factual copy']
for i,s in enumerate(checks):
    rect(479,239+i*28,8,8,'#151154',2,'#81b7ff');text(s,496,237+i*28,10,'Inter',PALE)
label('Source and status',48,496)
para('Source: nextgenventures.com.au and the implemented Next.js replica, inspected 24 October 2026. Logo clear space, minimum size, copy guidance and accessibility usage rules are recommendations. Font binaries and photographic image files are not redistributed in this bundle; their sources remain recorded with the website.',48,517,746,9,MUTE,leading=12)
c.linkURL('https://www.nextgenventures.com.au/',(48,H-543,350,H-517),relative=0)
end()
c.save()

shutil.copy2(PDF,KIT/PDF.name)
(KIT/'README.txt').write_text('NEXTGEN VENTURES - WEBSITE BRAND KIT\n\nStart with NextGen-Ventures-Brand-Guidelines.pdf.\n\nlogos/ contains original-derived SVG lockups and symbol variants.\ntokens/ contains editable CSS and JSON website tokens.\nreferences/ contains asset sources and the existing design-system record.\n\nThis kit describes the website identity as implemented on 24 October 2026.\nClear space, minimum size, writing and accessibility guidance are recommendations.\nFont binaries and photographs are not included; source references are recorded.\n')
ZIP=OUT/'NextGen-Ventures-Brand-Kit.zip'
with zipfile.ZipFile(ZIP,'w',zipfile.ZIP_DEFLATED) as archive:
    for file in KIT.rglob('*'):
        if file.is_file():archive.write(file,file.relative_to(OUT))
print(PDF)
print(ZIP)
print('Contrast:',round(contrast('#ffffff',BLUE),2),round(contrast(PALE,NAVY),2))
