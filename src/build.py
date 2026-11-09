"""Ghép trang landing: src/landing/index.html + src/combo/* -> public/index.html.
Chạy: cd src && python3 build.py
"""
import re
s=open('landing/index.html').read()
def rep(a,b,n=1):
  global s
  assert s.count(a)==n,(a[:90],s.count(a)); s=s.replace(a,b)
def cut(a,b,new):
  global s
  i=s.index(a); j=s.index(b,i)+len(b); s=s[:i]+new+s[j:]
rep('<canvas id="gl" aria-hidden="true"></canvas>\n','')
rep('<header class="top">\n  <glass-element auto-size radius="26" blur="3" strength="30" depth="6" background-color="rgba(16,12,26,0.32)">','<header class="top light">\n  <glass-element auto-size radius="26" blur="3" strength="30" depth="6" background-color="rgba(255,255,255,0.62)">')
# Hero mới: 1 màn hình, chữ trái, tháp isometric phải
cut('  <section class="hero" id="hero">','  </section>\n','''  <section class="hero2" id="hero">
    <div class="hero2-inner">
      <div class="hero-copy">
        <h1 data-i18n-html="hero.title"></h1>
        <p class="sub" data-i18n="hero.sub"></p>
        <div class="cta-row">
          <a class="btn btn-primary" href="#dang-ky" data-i18n="hero.cta"></a>
          <glass-element class="glass-cta" auto-size radius="26" blur="2" strength="60" depth="10" chromatic-aberration="2" background-color="rgba(255,255,255,0.55)"><a href="#noi-dung" data-i18n="hero.cta2"></a></glass-element>
        </div>
      </div>
      <div class="hero-art" id="heroArt" aria-hidden="true"><canvas></canvas><div class="h-tags"></div></div>
    </div>
  </section>
''')
# Chương trình: khung cam lớn, 3 tab bên trái + app "Soi code AI" bên phải
i0=s.index('      <div class="values">'); i1=s.index('</glass-element>\n      </div>\n',i0)+len('</glass-element>\n      </div>\n')
s=s[:i0]+'''      <div class="lab rv">
        <div class="lab-tabs" role="tablist"><button class="lab-tab" role="tab" data-k="0"><span class="lt-n">01</span><span class="lt-k" data-i18n="val.k1"></span><span class="lt-h" data-i18n="val.h1"></span><span class="lt-p" data-i18n="val.p1"></span></button><button class="lab-tab" role="tab" data-k="1"><span class="lt-n">02</span><span class="lt-k" data-i18n="val.k2"></span><span class="lt-h" data-i18n="val.h2"></span><span class="lt-p" data-i18n="val.p2"></span></button><button class="lab-tab" role="tab" data-k="2"><span class="lt-n">03</span><span class="lt-k" data-i18n="val.k3"></span><span class="lt-h" data-i18n="val.h3"></span><span class="lt-p" data-i18n="val.p3"></span></button></div>
        <div class="lab-app" id="modArt"></div>
      </div>
'''+s[i1:]
# Nội dung 6 chặng + chồng thẻ
CUP='<svg class="cup" viewBox="0 0 64 64" aria-hidden="true"><path class="cup-h" d="M18 14H8v6c0 7 5 12 12 13M46 14h10v6c0 7-5 12-12 13"/><path class="cup-b" d="M18 8h28v14c0 10-6 17-14 17s-14-7-14-17z"/><path class="cup-s" d="M26 13v9c0 4 2 7 4 8"/><path class="cup-b" d="M28 39h8v8h-8zM20 47h24l2 9H18z"/></svg>'
mods=''.join(f'<li class="step s{i}" style="--i:{i-1}" tabindex="0">{CUP if i==6 else ""}<span class="n">{i}</span><h3 data-i18n="top.t{i}"></h3><p data-i18n="top.d{i}"></p><p class="out"><b data-i18n="top.out"></b> <span data-i18n="top.o{i}"></span></p></li>' for i in range(1,7))
rep('  <section class="band glow reg" id="dang-ky">',f'''  <section class="band" id="noi-dung">
    <div class="inner">
      <div class="sec-head stairs-head rv"><span class="eyebrow" data-i18n="mods.eyebrow"></span><h2 data-i18n="mods.title"></h2></div>
      <ol class="stairs">{mods}</ol>
    </div>
  </section>

  <section class="band glow reg" id="dang-ky">''')
rep('    "top.o1": "Repository','    "tag.you": "Bạn · giữ yêu cầu, duyệt kết quả", "tag.cc": "Claude Code · viết code", "tag.cx": "Codex · review & test", "tag.ag": "Antigravity · lắp ráp & chạy thử",\n    "mods.note": "Chương trình dự kiến. Chặng nào cũng kết thúc bằng một thứ bạn làm ra được.", "mods.eyebrow": "Nội dung", "mods.title": "Sáu chặng, từ yêu cầu đến sản phẩm chạy được.",\n    "top.o1": "Repository')
rep('    "top.o1": "Project repository','    "tag.you": "You · own the spec, review", "tag.cc": "Claude Code · writes code", "tag.cx": "Codex · review & test", "tag.ag": "Antigravity · assembles & runs",\n    "mods.note": "Tentative program. Every stage ends with something you actually build.", "mods.eyebrow": "Program", "mods.title": "Six stages, from requirements to working software.",\n    "top.o1": "Project repository')
# Form đăng ký mới: Google @fpt.edu.vn → thông tin → cam kết
cut('      <form id="regForm" novalidate>','      </form>\n',open('combo/reg.html').read())
cut('/* ===== Form ===== */','})();\n',open('combo/reg.js').read())
# slogan dưới tiêu đề hero
rep('        <h1 data-i18n-html="hero.title"></h1>\n','        <h1 data-i18n-html="hero.title"></h1>\n        <p class="slogan" data-i18n-html="hero.slogan"></p>\n')
# bỏ toàn bộ script hero cũ (thiên hà + dòng thời gian cuộn)
cut('/* ===== Hero: thiên hà 3D','  requestAnimationFrame(frame);\n})();\n','')
css=open('heroes/stage.css').read()+open('combo/combo.css').read()
i=s.index('</style>'); s=s[:i]+css+s[i:]
js=open('combo/combo.js').read().replace('/*HERO3D*/\n',open('combo/hero3d.js').read()).replace('/*QUIZ*/\n',open('combo/quiz.js').read()).replace('/*COPY*/\n',open('combo/copy.js').read())
i=s.rindex('</script>'); s=s[:i]+js+s[i:]
s=re.sub(r'<title>[^<]*</title>','<title>AI Thực Chiến FA26</title>',s,count=1)
i=s.index('<script'); s=s[:i]+'<script src="/config.js"></script>\n'+s[i:]
open('../public/index.html','w').write(s)
print('built public/index.html', len(s), 'bytes')
