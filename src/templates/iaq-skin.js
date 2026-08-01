/* ============================================================================
   المظهر والأقسام والأكواد — تُطبَّق من إعدادات المدير على الموقع العلنيّ.

   تُقرأ من ثلاثة صفوف عامّة في جدول settings يكتبها جسر اللوحة:
     theme     الألوان والخطوط ونصف قطر الحافّة
     sections  ظهور أقسام الصفحة الرئيسة وترتيبها
     code      أكواد مخصّصة لكل صفحة

   لماذا الاشتقاق لا الاستبدال: رموز الموقع مترابطة — اللون الأساسي يظهر
   صريحًا في تدرّج الأيقونات وظلّ الأزرار ولون الروابط والوسوم. فتبديل
   ‎--teal‎ وحده يُنتج شكلًا متناقضًا: زرٌّ بلون جديد وظلُّه بلون قديم.
   لذا نشتقّ كل رمزٍ تابع من مصدره حسابيًّا.

   ولا وميض: هذه الطبقة تُنفَّذ في <head> والإعدادات محفوظة محليًّا، فتُطبَّق
   الألوان قبل أوّل رسم.
   ============================================================================ */
(function () {
  'use strict';
  if (typeof IAQ_SUPA === 'undefined') return;
  var IAQ = window.IAQ = window.IAQ || {};
  var root = document.documentElement;

  /* ------------------------------ لون ------------------------------ */
  function hex2rgb(h) {
    var s = String(h || '').trim().replace(/^#/, '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  function rgb2hex(c) {
    return '#' + c.map(function (n) {
      var v = Math.max(0, Math.min(255, Math.round(n))).toString(16);
      return v.length < 2 ? '0' + v : v;
    }).join('');
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function dark(c, t) { return mix(c, [0, 0, 0], t); }
  function light(c, t) { return mix(c, [255, 255, 255], t); }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')'; }

  /* المقاسات المستخرجة من الرموز المبنيّة: النسبة بين اللون الأساسي وتابعه.
     ‎#007878 → #0c6c6c‎ تعميق بنحو 8%، و ‎#c09048 → #a87b34‎ بنحو 13%. */
  var DK_PRIMARY = 0.09, DK_ACCENT = 0.13, LT_ACCENT = 0.78;

  function applyTheme(th) {
    if (!th) return 0;
    var n = 0;
    function set(k, v) { if (v) { root.style.setProperty(k, v); n++; } }

    var p = hex2rgb(th.primary);
    if (p) {
      var p6 = dark(p, DK_PRIMARY);
      set('--teal', rgb2hex(p));
      set('--teal-600', rgb2hex(p6));
      /* كل رمزٍ كان مكتوبًا بلون الأساس صريحًا */
      set('--brand-ar', rgb2hex(p));
      set('--nav-hover', rgb2hex(p));
      set('--btn1-bg', rgb2hex(p));
      set('--btn1-h', rgb2hex(p6));
      set('--link', rgb2hex(p));
      set('--card-title', rgb2hex(p));
      set('--tag-bg', rgb2hex(p));
      set('--icon-bg', 'linear-gradient(135deg,' + rgb2hex(p) + ',' + rgb2hex(p6) + ')');
      set('--btn1-shadow', '0 10px 24px ' + rgba(p, '.22'));
      set('--icon-shadow', '0 10px 22px ' + rgba(p, '.24'));
      /* كتلة :root ثانية في أنماط الأقسام تعرّف هذين أيضًا بلون الأساس */
      set('--icon-ink', rgb2hex(p6));
      set('--card-bd-h', rgb2hex(p));
      set('--picon-bg', rgb2hex(light(p, 0.93)));
    }

    var a = hex2rgb(th.accent);
    if (a) {
      var a6 = dark(a, DK_ACCENT);
      set('--gold', rgb2hex(a));
      set('--gold-600', rgb2hex(a6));
      set('--gold-soft', rgb2hex(light(a, LT_ACCENT)));
      set('--hero-accent', rgb2hex(a));
      set('--hero-eb-bg', rgba(a, '.12'));
      set('--hero-eb-bd', rgba(a, '.4'));
      set('--picon-bg-h', rgb2hex(a));
      set('--picon-ink', rgb2hex(a6));
      /* كتلتان تعرّفان --picon-bg: إحداهما تخفيف ذهبيّ */
      set('--picon-bg', rgb2hex(light(a, 0.82)));
      set('--num-color', rgb2hex(a));
    }

    var dp = hex2rgb(th.deep);
    if (dp) {
      set('--teal-deep', rgb2hex(dp));
      set('--stats-bg', rgb2hex(dp));
      /* الظلال كلها بلون العمق: نُعيد بناءها بنفس الأبعاد والشفافية */
      set('--shadow', '0 18px 46px ' + rgba(dp, '.12'));
      set('--header-shadow', '0 6px 26px ' + rgba(dp, '.09'));
      set('--card-shadow', '0 2px 12px ' + rgba(dp, '.06'));
      set('--card-shadow-h', '0 18px 46px ' + rgba(dp, '.12'));
    }
    /* خلفية الترويسة حقلٌ مستقلّ في اللوحة، وإلا فلون العمق */
    var hb = hex2rgb(th.heroBg);
    if (hb) set('--hero-bg', rgb2hex(hb)); else if (dp) set('--hero-bg', rgb2hex(dp));

    if (hex2rgb(th.bg)) set('--bg', rgb2hex(hex2rgb(th.bg)));
    if (hex2rgb(th.surface)) set('--surface', rgb2hex(hex2rgb(th.surface)));
    if (hex2rgb(th.surface2)) set('--surface-2', rgb2hex(hex2rgb(th.surface2)));
    if (hex2rgb(th.ink)) set('--ink', rgb2hex(hex2rgb(th.ink)));
    if (hex2rgb(th.body)) set('--body', rgb2hex(hex2rgb(th.body)));

    var r = Number(th.radius);
    if (isFinite(r) && r >= 0 && r <= 40) {
      set('--radius', r + 'px');
      set('--card-radius', r + 'px');
    }
    return n;
  }

  /* ------------------------ رموز الأقسام المُسمّاة ------------------------
     كل قسم يعرّف عائلةً من الرموز على عنصره لا على :root، فلا يبلغها نمطٌ
     مضمَّن في الجذر. وقيمها كلها مشتقّة من اللونين: تعميقٌ وتفتيحٌ وشفافية.
     وأهمّها خطّ الزخرفة الذهبية في صدر كل قسم — تركُه يعني زخرفةً ذهبية
     فوق مظهرٍ جديد.

     الصيغة: 'عائلة:مُحدِّد/لاحقة,مُحدِّد/لاحقة' — واسم الرمز = المُحدِّد بلا
     نقطة + شرطة + اللاحقة. */
  var SEC_VARS = [
    'p6:.ab/t6,.bd/t6,.dc/t6,.lg/t6,.lc/t6,.gm/teal-600,.nw/t6,.tm/t6',
    'ptint:.ab/tt,.bd/tt,.dc/tt,.lg/tt,.lc/tt,.gm/teal-tint,.nw/tt,.tm/tt',
    'pline:.ab/tb,.bd/tb,.lg/tb,.lc/tb,.gm/teal-bd,.nw/tb,.tm/tb',
    'a42:.ab/gold-line,.bd/gold-line,.dc/gold-line,.lg/gl,.lc/gl,.gm/gold-line,.nw/gl,.tm/gold-line',
    'aink:.ab/gold-ink,.bd/gold-ink,.lg/gi,.lc/gi,.gm/gold-ink,.nw/gi,.tm/gold-ink',
    'asoft:.ab/gt,.bd/gt,.lc/gt,.gm/gold-tint,.nw/gt,.tm/gt',
    'abd:.ab/gb,.bd/gb,.lc/gb,.gm/gold-bd,.nw/gb,.tm/gb'
  ];
  /* ظلال ولطخات لها أبعادها الخاصّة، فتُذكر مفردةً */
  var SEC_ONE = [
    ['.bd', 'lattice', 'p', '.05'],
    ['.gm', 'lattice', 'p', '.055'],
    ['.bd', 'shadow-h', 'deep', '.13', '0 18px 40px '],
    ['.gm', 'shadow-h', 'deep', '.10', '0 14px 34px '],
    ['.tm', 'shadow-h', 'deep', '.13', '0 18px 40px ']
  ];

  function applySecVars(p, a, dp) {
    if (!p && !a && !dp) return 0;
    var p6 = p ? dark(p, DK_PRIMARY) : null;
    var vals = {
      p6: p6 && rgb2hex(p6),
      ptint: p && rgb2hex(light(p, 0.93)),
      pline: p && rgb2hex(light(p, 0.84)),
      a42: a && rgba(a, '.42'),
      aink: a && rgb2hex(dark(a, 0.36)),
      asoft: a && rgb2hex(light(a, 0.88)),
      abd: a && rgb2hex(light(a, 0.74))
    };
    var n = 0;
    SEC_VARS.forEach(function (line) {
      var i = line.indexOf(':');
      var fam = line.slice(0, i), v = vals[fam];
      if (!v) return;
      line.slice(i + 1).split(',').forEach(function (pair) {
        var q = pair.split('/'), sel = q[0], suffix = q[1];
        var name = '--' + sel.replace('.', '') + '-' + suffix;
        [].slice.call(document.querySelectorAll(sel)).forEach(function (el) {
          el.style.setProperty(name, v);
          n++;
        });
      });
    });
    SEC_ONE.forEach(function (o) {
      var src = o[2] === 'p' ? p : dp;
      if (!src) return;
      var v = (o[4] || '') + rgba(src, o[3]);
      var name = '--' + o[0].replace('.', '') + '-' + o[1];
      [].slice.call(document.querySelectorAll(o[0])).forEach(function (el) {
        el.style.setProperty(name, v);
        n++;
      });
    });
    return n;
  }

  /* ------------------------------- الشعار ------------------------------- */
  /* الشعار المبنيّ صورةٌ مضمّنة (base64) في الترويسة والتذييل، وخلفيةُ زخرفةٍ
     في الترويسة العليا. فيُستبدل الثلاثة معًا وإلا ظهر شعارٌ جديد وزخرفةٌ
     بالشعار القديم. وإن خلا الإعداد بقي المبنيّ كما هو. */
  function applyLogo(url) {
    var u = String(url || '').trim();
    if (!u) return 0;
    /* منعٌ صريح للمخطّطات المُنفِّذة بدل سماحٍ ضيّق: المسار النسبيّ مشروع
       (مثل img/logo.png) وكان الحارس السابق يرفضه. */
    if (/^\s*(javascript|vbscript|file)\s*:/i.test(u)) return 0;
    if (/^\s*data\s*:/i.test(u) && !/^\s*data\s*:\s*image\//i.test(u)) return 0;
    var n = 0;
    [].slice.call(document.querySelectorAll('img.brand-mark')).forEach(function (im) {
      if (im.getAttribute('src') !== u) { im.setAttribute('src', u); n++; }
    });
    root.style.setProperty('--emblem-url', "url('" + u.replace(/'/g, '%27') + "')");
    return n + 1;
  }

  /* ------------------------------- الخطّ ------------------------------- */
  /* العائلات المستضافة محليًّا في fonts/. والعريضة منها تحتاج شدَّ فراغات
     القائمة كي لا تفيض الترويسة — قياسًا لا تقديرًا: 1280px أحرجُ عرضٍ قبل
     ظهور الدرج، وفرق عرض القائمة بين العائلات بلغ 71px. */
  var FONTS = {
    'IBM Plex Sans Arabic': { wide: false },
    'Cairo': { wide: false },
    'El Messiri': { wide: false },
    'Tajawal': { wide: true },
    'Readex Pro': { wide: true }
  };
  function applyFont(fam) {
    var name = String(fam || '').trim();
    if (!name || !FONTS.hasOwnProperty(name)) return 0;
    root.style.setProperty('--font-fam', "'" + name.replace(/['"\\]/g, '') + "'");
    if (FONTS[name].wide) root.setAttribute('data-font-wide', '1');
    else root.removeAttribute('data-font-wide');
    return 1;
  }

  /* -------------------------- خلفية الترويسة --------------------------- */
  /* صورةٌ خلف الترويسة مع طبقة تعتيم كي يبقى النصّ مقروءًا — وهذا شرطٌ لا
     تحسين: صورةٌ فاتحة تحت نصٍّ أبيض تجعله غير مقروء. */
  function applyHero(img, overlay, emblemOp) {
    var hero = document.querySelector('section.hero');
    if (!hero) return 0;
    var n = 0;
    var u = String(img || '').trim();
    if (/^\s*(javascript|vbscript|file)\s*:/i.test(u)) u = '';
    if (/^\s*data\s*:/i.test(u) && !/^\s*data\s*:\s*image\//i.test(u)) u = '';
    if (u) {
      var a = Number(overlay);
      if (!isFinite(a) || a < 0 || a > 90) a = 45;
      var c = 'rgba(0,0,0,' + (a / 100) + ')';
      hero.style.backgroundImage = 'linear-gradient(' + c + ',' + c + "),url('" +
        u.replace(/'/g, '%27') + "')";
      hero.style.backgroundSize = 'cover';
      hero.style.backgroundPosition = 'center';
      hero.style.backgroundRepeat = 'no-repeat';
      n++;
    } else if (hero.style.backgroundImage) {
      hero.style.backgroundImage = '';
      hero.style.backgroundSize = '';
      hero.style.backgroundPosition = '';
      hero.style.backgroundRepeat = '';
      n++;
    }
    var eo = Number(emblemOp);
    if (isFinite(eo) && eo >= 0 && eo <= 60) {
      root.style.setProperty('--hero-emblem-op', String(eo / 100));
      n++;
    }
    return n;
  }

  /* -------------------------- التواصل والروابط --------------------------
     تُحدَّث الروابط لا النصوص وحدها: هاتفٌ نصُّه صحيح ورابطه قديم يتّصل بالرقم
     الخطأ. والروابط الاجتماعية تُطابَق بوسم aria-label الذي بناه البنّاء،
     والفارغة تُخفى بدل أن تُفضي إلى صفحة خطأ. */
  var SOC = { social_x: 'إكس', social_youtube: 'يوتيوب', social_linkedin: 'لينكدإن',
              social_whatsapp: 'واتساب', social_instagram: 'إنستغرام' };
  function okLink(u) {
    var s2 = String(u == null ? '' : u).trim();
    if (!s2) return '';
    return /^https:\/\//i.test(s2) ? s2 : '';
  }
  function applyContact() {
    var n = 0;
    var disp = String(IAQ.setting('contact_phone_display') || '').trim();
    var tel = String(IAQ.setting('contact_phone_tel') || '').trim();
    if (tel && /^\+?[0-9\s-]{7,20}$/.test(tel)) {
      var href = 'tel:' + tel.replace(/[\s-]/g, '');
      [].slice.call(document.querySelectorAll('a[href^="tel:"]')).forEach(function (a) {
        a.setAttribute('href', href);
        if (disp) a.textContent = disp;
        n++;
      });
    }
    var mail = String(IAQ.setting('contact_email') || '').trim();
    if (mail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      [].slice.call(document.querySelectorAll('a[href^="mailto:"]')).forEach(function (a) {
        a.setAttribute('href', 'mailto:' + mail);
        if ((a.textContent || '').indexOf('@') > -1) a.textContent = mail;
        n++;
      });
    }
    for (var key in SOC) {
      if (!SOC.hasOwnProperty(key)) continue;
      var v = IAQ.settings()[key];
      if (v === undefined) continue;               /* لم يُضبط: يبقى المبنيّ */
      var url = okLink(v);
      var sel = '[aria-label="' + SOC[key] + '"]';
      [].slice.call(document.querySelectorAll(sel)).forEach(function (a) {
        if (a.tagName !== 'A') return;
        if (url) { a.setAttribute('href', url); a.hidden = false; }
        else a.hidden = true;                      /* فارغ = يُخفى لا يُفضي لخطأ */
        n++;
      });
    }
    var don = okLink(IAQ.setting('donate_url'));
    if (don) {
      [].slice.call(document.querySelectorAll('a[data-iaq-donate], a.btn-donate')).forEach(function (a) {
        a.setAttribute('href', don);
        n++;
      });
    }
    return n;
  }

  /* --------------------------- أقسام الرئيسة --------------------------- */
  /* مفتاح القسم في اللوحة هو مُعرِّفه في الصفحة نفسها (البنّاء يستخرجه من
     id="..." في مصدر الرئيسة)، فالحلّ هُويّةٌ لا خريطة: قسمٌ يُضاف مستقبلًا
     يعمل بلا تعديل هنا. والأسماء المستعارة لحالاتٍ لا مُعرِّف لها. */
  var SEC_ALIAS = { hero: 'section.hero', testi: '#testimonials' };
  function secSel(key) {
    if (!key || !/^[A-Za-z][\w-]*$/.test(key)) return null;
    return SEC_ALIAS[key] || ('#' + key);
  }

  function applySections(list) {
    if (!(list instanceof Array) || !list.length) return 0;
    var seen = {}, order = [], n = 0;
    list.forEach(function (s) {
      var sel = secSel(s && s.key);
      if (!sel || seen[s.key]) return;
      var el = document.querySelector(sel);
      if (!el) return;
      seen[s.key] = true;
      /* الإخفاء بـ hidden لا display: يُخرجه من شجرة الوصول أيضًا، ولا
         يتعارض مع أنماط القسم نفسه. */
      var hide = (s.visible === false);
      if (hide !== !!el.hasAttribute('data-iaq-off')) n++;
      if (hide) { el.setAttribute('data-iaq-off', '1'); el.style.display = 'none'; el.setAttribute('aria-hidden', 'true'); }
      else { el.removeAttribute('data-iaq-off'); el.style.display = ''; el.removeAttribute('aria-hidden'); }
      if (!hide) order.push(el);
    });
    /* الترتيب: تُنقل الأقسام الظاهرة إلى تسلسل اللوحة. الترويسة تبقى أوّلًا
       دائمًا — نقلها يُفسد تخطيط الصفحة ولا معنى له. */
    if (order.length > 1) {
      var first = order[0], parent = first.parentNode;
      if (parent) {
        for (var i = 1; i < order.length; i++) {
          var prev = order[i - 1], cur = order[i];
          if (prev.nextElementSibling !== cur) {
            parent.insertBefore(cur, prev.nextSibling);
            n++;
          }
        }
      }
    }
    return n;
  }

  /* ---------------------------- أكواد مخصّصة ---------------------------- */
  /* لا يكتبها إلا مديرٌ مُصرَّح له (سياسات settings)، وهي أكواد صاحب الموقع
     نفسه: قياسات وبكسلات. تُدرَج في حاوية موسومة كي يُعرف مصدرها. */
  function applyCode(cfg) {
    if (!cfg || !cfg.pages) return 0;
    var blocks = cfg.pages[IAQ_SLUG];
    if (!(blocks instanceof Array) || !blocks.length) return 0;
    var box = document.getElementById('iaq-custom-code');
    if (box) box.parentNode.removeChild(box);
    box = document.createElement('div');
    box.id = 'iaq-custom-code';
    box.setAttribute('data-iaq', 'أكواد مخصّصة من لوحة التحكّم');
    var n = 0;
    blocks.forEach(function (b) {
      if (!b || b.enabled === false || !String(b.code || '').trim()) return;
      var slot = document.createElement('div');
      slot.setAttribute('data-pos', b.pos || 'bottom');
      /* innerHTML لا ينفّذ <script>: نُعيد بناء كل وسم سكربت كي يُنفَّذ */
      slot.innerHTML = String(b.code);
      [].slice.call(slot.querySelectorAll('script')).forEach(function (old) {
        var s = document.createElement('script');
        for (var i = 0; i < old.attributes.length; i++) {
          s.setAttribute(old.attributes[i].name, old.attributes[i].value);
        }
        s.text = old.textContent || '';
        old.parentNode.replaceChild(s, old);
      });
      box.appendChild(slot);
      n++;
    });
    if (!n) return 0;
    var main = document.querySelector('main') || document.body;
    var tops = [], rest = [];
    [].slice.call(box.children).forEach(function (c) {
      (c.getAttribute('data-pos') === 'top' ? tops : rest).push(c);
    });
    document.body.appendChild(box);
    tops.forEach(function (c) { main.insertBefore(c, main.firstChild); });
    var hero = document.querySelector('section.hero');
    [].slice.call(box.children).forEach(function (c) {
      if (c.getAttribute('data-pos') === 'afterHero' && hero && hero.parentNode) {
        hero.parentNode.insertBefore(c, hero.nextSibling);
      }
    });
    return n;
  }

  /* ------------------------------ التشغيل ------------------------------ */
  var codeDone = false;

  function applyAll() {
    var th = IAQ.setting('theme');
    var t = applyTheme(th);
    var done = { theme: t, secVars: 0, font: 0, logo: 0, contact: 0, hero: 0, sections: 0, code: 0 };
    function later() {
      /* رموز الأقسام تُضبط على عناصرها، فتحتاج شجرةً جاهزة */
      done.secVars = th ? applySecVars(hex2rgb(th.primary), hex2rgb(th.accent), hex2rgb(th.deep)) : 0;
      done.font = applyFont(IAQ.setting('site_font'));
      done.logo = applyLogo(IAQ.setting('site_logo'));
      done.contact = applyContact();
      done.hero = applyHero(IAQ.setting('hero_bg_image'), IAQ.setting('hero_overlay'),
                            IAQ.setting('hero_emblem_op'));
      done.sections = applySections(IAQ.setting('sections'));
      /* الأكواد مرّةً واحدة لكل تحميل: إعادة إدراجها تُعيد تنفيذ سكربتاتها
         فيُحسب القياس مرّتين. والمظهر والأقسام تطبيقهما لا يضرّ تكراره. */
      if (!codeDone) {
        done.code = applyCode(IAQ.setting('code'));
        if (done.code) codeDone = true;
      }
      document.dispatchEvent(new CustomEvent('iaq:skin', { detail: done }));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later, { once: true });
    else later();
    return done;
  }
  IAQ.applySkin = applyAll;
  applyAll();
  /* الإعدادات تُحدَّث بهدوء بعد التحميل: نُعيد التطبيق حين تتغيّر */
  document.addEventListener('iaq:settings', function () { applyAll(); });
})();
