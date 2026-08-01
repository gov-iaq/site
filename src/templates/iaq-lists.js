/* ============================================================================
   قوائم المحتوى الحيّة — تُبنى من قاعدة البيانات فوق البناء الثابت.

   المبدأ: البناء الثابت هو الأساس دائمًا. إن وُجدت صفوف منشورة في القاعدة
   أُعيد بناء القائمة منها؛ وإن لم توجد صفوف أو سقطت الشبكة بقي المبنيّ كما هو.
   فالموقع لا يعتمد على قاعدة البيانات ليعمل، بل تستخدمها ليُحدَّث.

   الطريقة: استنساخ بطاقة قائمة أصلًا في الصفحة ثم تعبئتها (clone-and-fill)،
   لا توليد HTML جديد. بهذا تُحفظ كل الأصناف والأيقونات وحالات الحركة
   (مثل .is-in التي بدونها تبقى البطاقة شفّافة) ولا يمكن أن يتباعد الشكل
   عن قوالب البنّاء.
   ============================================================================ */
(function () {
  'use strict';
  if (typeof IAQ_SUPA === 'undefined') return;
  var CFG = IAQ_SUPA, slug = IAQ_SLUG;
  var IAQ = window.IAQ = window.IAQ || {};

  function get(q) {
    if (!CFG || !CFG.url || !CFG.key) return Promise.resolve(null);
    return fetch(CFG.url + '/rest/v1/' + q, { headers: { apikey: CFG.key, Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /* الحرف الأول للأفاتار — نفس قاعدة البنّاء: تُتجاهل «ال» التعريف */
  function initialOf(name) {
    var w = String(name || '').trim().split(/\s+/)[0] || '';
    if (w.length > 2 && w.indexOf('ال') === 0) w = w.slice(2);
    return w.slice(0, 1);
  }
  function txtNodeSet(el, text) {
    /* يضبط النصّ مع الحفاظ على العناصر الداخلية (مثل معيّن <i class="dm">) */
    for (var i = el.childNodes.length - 1; i >= 0; i--) {
      if (el.childNodes[i].nodeType === 3) el.removeChild(el.childNodes[i]);
    }
    el.appendChild(document.createTextNode(text));
  }

  /* ------------------------- تعبئة بطاقة شخص ------------------------- */
  function fillPerson(node, row, kind, ctx) {
    var nameSel = { assembly: '.gm-name', board: '.bd-name', team: '.tm-name' }[kind];
    var roleSel = { board: '.bd-role', team: '.tm-role' }[kind];
    var nm = node.querySelector(nameSel);
    if (nm) {
      var span = nm.querySelector('span');
      var cls = span ? span.className : (kind === 'assembly' ? 'gm-title' : (kind === 'board' ? 'bd-t' : 'tm-t'));
      nm.innerHTML = (row.title ? '<span class="' + esc(cls) + '">' + esc(row.title) + '</span> ' : '') + esc(row.name);
    }
    if (roleSel) {
      var rl = node.querySelector(roleSel);
      if (rl) txtNodeSet(rl, row.role || '');
    }
    if (kind === 'assembly') {
      var av = node.querySelector('.gm-av b');
      if (av) av.textContent = initialOf(row.name);
      var chip = node.querySelector('.gm-chip');
      if (chip) txtNodeSet(chip, ' ' + (ctx.catLabels[row.cat] || row.cat || ''));
      node.setAttribute('data-cat', row.cat || '');
      node.setAttribute('data-name', row.name || '');
    } else {
      node.setAttribute('data-rank', row.rank || 'member');
      var ph = node.querySelector(kind === 'board' ? '.bd-ph' : '.tm-ph');
      if (ph) {
        var img = ph.querySelector('img');
        if (row.photo) {
          if (!img) {
            if (ctx.photoHTML) ph.innerHTML = ctx.photoHTML; else return node;
            img = ph.querySelector('img');
          }
          if (img) {
            img.setAttribute('src', 'img/' + kind + '/' + row.photo);
            img.setAttribute('alt', ((row.title || '') + ' ' + row.name).trim());
          }
        } else if (ctx.symbolHTML) {
          ph.innerHTML = ctx.symbolHTML;
        } else if (img) {
          img.parentNode.removeChild(img);
        }
      }
    }
    return node;
  }

  /* يستبدل بطاقات حاوية بصفوف القاعدة، مع الإبقاء على بقية أبناء الحاوية
     (مثل رسالة «لا نتائج») كي لا تُفقد إشاراتُ سكربت القسم إليها. */
  function swapCards(container, cardSel, rows, kind, ctx) {
    var olds = [].slice.call(container.querySelectorAll(cardSel));
    if (!olds.length || !rows.length) return 0;
    var withImg = null, withSym = null;
    olds.forEach(function (c) {
      if (!withImg && c.querySelector('img')) withImg = c;
      if (!withSym && (c.querySelector('.bd-sym') || c.querySelector('.tm-sym'))) withSym = c;
    });
    var phSel = kind === 'board' ? '.bd-ph' : '.tm-ph';
    var symSel = kind === 'board' ? '.bd-sym' : '.tm-sym';
    if (withImg) ctx.photoHTML = (withImg.querySelector(phSel) || {}).innerHTML;
    if (withSym) ctx.symbolHTML = (withSym.querySelector(phSel) || {}).innerHTML;
    /* الحاوية الواحدة قد تخلو من أحد النوعين — نستعير القالب من بقيّة الصفحة،
       وإلا ظهر عضوٌ بلا صورة في إطار فارغ بدل الأيقونة الرمزية. */
    if (!ctx.photoHTML) {
      var anyImg = document.querySelector(cardSel + ' ' + phSel + ' img');
      if (anyImg && anyImg.parentNode) ctx.photoHTML = anyImg.parentNode.innerHTML;
    }
    if (!ctx.symbolHTML) {
      var anySym = document.querySelector(cardSel + ' ' + phSel + ' ' + symSel);
      if (anySym && anySym.parentNode) ctx.symbolHTML = anySym.parentNode.innerHTML;
    }

    var anchor = olds[olds.length - 1].nextSibling;
    var parent = olds[0].parentNode;
    var frag = document.createDocumentFragment();
    rows.forEach(function (row) {
      var base = (kind !== 'assembly' && row.photo && withImg) ? withImg
               : (kind !== 'assembly' && !row.photo && withSym) ? withSym : olds[0];
      var n = base.cloneNode(true);
      n.removeAttribute('style');
      fillPerson(n, row, kind, ctx);
      frag.appendChild(n);
    });
    olds.forEach(function (c) { c.parentNode.removeChild(c); });
    parent.insertBefore(frag, anchor);
    return rows.length;
  }

  /* ------------------------------ الأشخاص ------------------------------ */
  function people(kind) {
    var secId = { assembly: 'memSec', board: 'boardSec', team: 'teamSec' }[kind];
    var sec = document.getElementById(secId);
    if (!sec) return;
    return get('people?select=title,name,role,rank,cat,phone,email,photo,sort'
      + '&grp=eq.' + kind + '&status=eq.published&order=sort.asc,id.asc').then(function (rows) {
        if (!rows) return;                       // فشل قراءة → يبقى البناء الثابت
        if (!rows.length) return emptyOut(kind); // فارغة عن قصد → تُفرَّغ القائمة
        var ctx = { catLabels: {} };
        // خذ تسميات التصنيف من البطاقات المبنيّة كي تبقى الصياغة واحدة
        [].slice.call(sec.querySelectorAll('.gm-card')).forEach(function (c) {
          var k = c.getAttribute('data-cat'), chip = c.querySelector('.gm-chip');
          if (k && chip && !ctx.catLabels[k]) ctx.catLabels[k] = chip.textContent.trim();
        });
        var n = 0;
        if (kind === 'board') {
          var lead = rows.filter(function (r) { return r.rank === 'chair' || r.rank === 'vice'; });
          var rest = rows.filter(function (r) { return r.rank !== 'chair' && r.rank !== 'vice'; });
          var lc = sec.querySelector('.bd-lead'), gc = sec.querySelector('.bd-grid');
          if (lc && lead.length) n += swapCards(lc, '.bd-card', lead, 'board', ctx);
          if (gc && rest.length) n += swapCards(gc, '.bd-card', rest, 'board', ctx);
        } else if (kind === 'team') {
          var tg = sec.querySelector('.tm-grid');
          if (tg) n += swapCards(tg, '.tm-card', rows, 'team', ctx);
        } else {
          var gg = sec.querySelector('.gm-grid') || document.getElementById('gm-grid');
          if (gg) n += swapCards(gg, '.gm-card', rows, 'assembly', ctx);
        }
        if (n && window.IAQ_REINDEX && window.IAQ_REINDEX[kind]) {
          try { window.IAQ_REINDEX[kind](); } catch (e) { }
        }
        if (n) document.dispatchEvent(new CustomEvent('iaq:lists', { detail: { kind: kind, count: n } }));
      });
  }

  /* ------------------------------ الشركاء ------------------------------ */
  /* القائمة فارغة فعلًا: إخفاء كل ما بُني ثابتًا، وإلا ظلّ العضو المحذوف ظاهرًا.
     لا يُفعَّل هذا إلا إذا أعلن المدير أن القاعدة هي مصدر القوائم (إعداد
     lists_from_db)، وإلا لَفرّغَ الصفحات قبل تحميل المحتوى إلى القاعدة. */
  function dbOwnsLists() {
    return !!(IAQ.setting && IAQ.setting('lists_from_db') === true);
  }
  function emptyOut(kind) {
    if (!dbOwnsLists()) return;
    var secId = { assembly: 'memSec', board: 'boardSec', team: 'teamSec' }[kind];
    var sec = document.getElementById(secId);
    if (!sec) return;
    var sel = { assembly: '.gm-card', board: '.bd-card', team: '.tm-card' }[kind];
    var olds = [].slice.call(sec.querySelectorAll(sel));
    if (!olds.length) return;
    olds.forEach(function (c) { c.parentNode.removeChild(c); });
    if (window.IAQ_REINDEX && window.IAQ_REINDEX[kind]) {
      try { window.IAQ_REINDEX[kind](); } catch (e) { }
    }
    document.dispatchEvent(new CustomEvent('iaq:lists', { detail: { kind: kind, count: 0 } }));
  }

  function logoSrc(logo) {
    var s = String(logo || '');
    if (/^(https?:)?\/\//.test(s) || s.charAt(0) === '/') return s;
    return 'img/partners/' + s;
  }
  function partners() {
    var track = document.getElementById('partnersTrack');
    if (!track) return;
    return get('partners?select=name,logo,url,sort&status=eq.published&order=sort.asc,id.asc')
      .then(function (rows) {
        if (!rows) return;
        if (!rows.length) {
          // لا شركاء منشورون: نُفرّغ الشريط بدل إظهار قائمة محذوفة
          if (!dbOwnsLists()) return;
          track.innerHTML = '';
          document.dispatchEvent(new CustomEvent('iaq:lists', { detail: { kind: 'partners', count: 0 } }));
          return;
        }
        var sets = parseInt(getComputedStyle(track).getPropertyValue('--mq-sets'), 10);
        if (!isFinite(sets) || sets < 1 || sets > 8) sets = 4;
        var html = '';
        for (var s = 0; s < sets; s++) {
          html += '<div class="mq-set"' + (s ? ' aria-hidden="true"' : '') + '>';
          for (var i = 0; i < rows.length; i++) {
            var p = rows[i], src = esc(logoSrc(p.logo)), nm = esc(p.name);
            var inner = '<img src="' + src + '" alt="' + (s ? '' : nm) + '" loading="lazy" decoding="async" />';
            if (p.url && !s) {
              html += '<a class="plogo" href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' + nm + '">' + inner + '</a>';
            } else {
              html += '<div class="plogo"' + (s ? ' aria-hidden="true"' : ' title="' + nm + '"') + '>' + inner + '</div>';
            }
          }
          html += '</div>';
        }
        track.innerHTML = html;
        document.dispatchEvent(new CustomEvent('iaq:lists', { detail: { kind: 'partners', count: rows.length } }));
      });
  }

  /* ------------------------------- الأخبار ------------------------------- */
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  /* «2026-06-22» ← «22 يونيو 2026» بنفس صياغة البنّاء. لا نمرّ بـ Date كي لا
     تُنقص المنطقة الزمنية يومًا عن التاريخ المخزَّن. */
  function arDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    return Number(m[3]) + ' ' + (MONTHS[Number(m[2]) - 1] || m[2]) + ' ' + m[1];
  }
  function newsImg(f) {
    var s = String(f || '');
    if (!s) return '';
    if (/^(https?:)?\/\//.test(s) || s.charAt(0) === '/') return s;
    return 'img/news/' + s;
  }
  /* يُعيد عقدةً موجودة، أو يبنيها من قالبٍ محفوظ إن لزمت. لا نولّد ترميزًا
     جديدًا من عندنا فتبقى الأصناف والأيقونات كما بناها البنّاء. */
  function need(parent, sel, tplHTML, before) {
    var el = parent.querySelector(sel);
    if (el) return el;
    if (!tplHTML) return null;
    var box = document.createElement('div');
    box.innerHTML = tplHTML;
    el = box.firstElementChild;
    if (!el) return null;
    parent.insertBefore(el, before || null);
    return el;
  }
  function drop(parent, sel) {
    var el = parent.querySelector(sel);
    if (el) el.parentNode.removeChild(el);
  }
  function moveInto(parent, html) {
    var box = document.createElement('div');
    box.innerHTML = html;
    while (box.firstChild) parent.appendChild(box.firstChild);
  }

  function fillNews(node, row, tpl) {
    var tag = row.tag || '', cap = row.title || '', src = newsImg(row.image);
    node.setAttribute('data-tag', tag);
    node.removeAttribute('style');

    /* مكان الصورة: صورة قابلة للتكبير، أو الأيقونة الرمزية */
    var media = node.querySelector('.nw-media');
    if (media) {
      var tagSpan = media.querySelector('.nw-tag');
      if (tagSpan) tagSpan.textContent = tag;
      if (src) {
        media.className = 'nw-media is-photo';
        media.setAttribute('role', 'button');
        media.setAttribute('tabindex', '0');
        media.setAttribute('data-zoom', src);
        media.setAttribute('data-caption', cap);
        media.setAttribute('aria-label', 'تكبير صورة الخبر');
        drop(media, '.nw-sym');
        var img = media.querySelector('img');
        if (!img && tpl.photoHTML) { moveInto(media, tpl.photoHTML); img = media.querySelector('img'); }
        if (img) { img.setAttribute('src', src); img.setAttribute('alt', cap); }
      } else {
        media.className = 'nw-media';
        ['role', 'tabindex', 'data-zoom', 'data-caption', 'aria-label'].forEach(function (a) {
          media.removeAttribute(a);
        });
        var im = media.querySelector('img');
        if (im) im.parentNode.removeChild(im);
        drop(media, '.nw-zoom');
        if (!media.querySelector('.nw-sym') && tpl.symHTML) moveInto(media, tpl.symHTML);
      }
    }

    var body = node.querySelector('.nw-body');
    if (!body) return node;

    var tm = body.querySelector('.nw-date time');
    if (tm) {
      tm.setAttribute('datetime', String(row.date || ''));
      tm.textContent = arDate(row.date);
    }
    var h = body.querySelector('.nw-title');
    if (h) h.textContent = cap;

    /* المقدّمة */
    var lead = String(row.lead == null ? '' : row.lead).trim();
    if (lead) {
      var lp = need(body, '.nw-lead', '<p class="nw-lead"></p>', body.querySelector('.nw-text'));
      if (lp) lp.textContent = lead;
    } else { drop(body, '.nw-lead'); }

    /* الفقرات */
    var txt = body.querySelector('.nw-text');
    if (txt) {
      var ps = (row.body instanceof Array) ? row.body : (row.body ? [String(row.body)] : []);
      txt.innerHTML = '';
      ps.forEach(function (p) {
        var el = document.createElement('p');
        el.textContent = String(p == null ? '' : p);
        txt.appendChild(el);
      });
    }

    /* بيانات الخبر: [{label,value}] أو [[label,value]] */
    var facts = (row.facts instanceof Array) ? row.facts : [];
    if (facts.length && tpl.factHTML) {
      var dl = need(body, '.nw-facts', '<dl class="nw-facts"></dl>', body.querySelector('.nw-actions'));
      if (dl) {
        dl.innerHTML = '';
        facts.forEach(function (f) {
          var lab = (f instanceof Array) ? f[0] : (f && f.label);
          var val = (f instanceof Array) ? f[1] : (f && f.value);
          var bx = document.createElement('div');
          bx.innerHTML = tpl.factHTML;
          var one = bx.firstElementChild;
          if (!one) return;
          var dt = one.querySelector('dt'), dd = one.querySelector('dd');
          if (dt) dt.textContent = String(lab == null ? '' : lab);
          if (dd) dd.textContent = String(val == null ? '' : val);
          dl.appendChild(one);
        });
      }
    } else { drop(body, '.nw-facts'); }

    /* زرّ التسجيل: لا يظهر إلا بنصٍّ ورابط معًا */
    var cl = String(row.cta_label == null ? '' : row.cta_label).trim();
    var cu = String(row.cta_url == null ? '' : row.cta_url).trim();
    if (cl && cu && tpl.ctaHTML) {
      var act = need(body, '.nw-actions', tpl.ctaHTML, null);
      var a = act ? act.querySelector('a') : null;
      if (a) {
        a.setAttribute('href', cu);
        txtNodeSet(a, cl + ' ');   /* السهم عنصر داخل الوسم فيبقى */
      }
    } else { drop(body, '.nw-actions'); }
    return node;
  }

  function news() {
    var list = document.getElementById('nwList');
    if (!list) return;
    return get('news?select=date,tag,title,lead,body,facts,cta_label,cta_url,image'
      + '&status=eq.published&order=date.desc,id.desc').then(function (rows) {
        if (!rows) return;                       // فشل قراءة → يبقى البناء الثابت
        var olds = [].slice.call(list.querySelectorAll('.nw-card'));
        if (!olds.length) return;                // لا قالب نستنسخ منه
        if (!rows.length) {
          if (!dbOwnsLists()) return;            // فارغة عن قصد فقط تُفرَّغ
          olds.forEach(function (c) { c.parentNode.removeChild(c); });
          rebuildFilters(0, []);
          reindexNews(0);
          return;
        }

        /* قوالب الأجزاء تُستعار من البطاقات المبنيّة، ورمز «بلا صورة» من قالب
           خفيّ يضعه البنّاء دائمًا فلا يتوقّف على وجود بطاقة بلا صورة. */
        var tpl = { photoHTML: null, symHTML: null, factHTML: null, ctaHTML: null };
        olds.forEach(function (c) {
          var im = c.querySelector('.nw-media img');
          if (!tpl.photoHTML && im) {
            var z = c.querySelector('.nw-zoom');
            tpl.photoHTML = im.outerHTML + (z ? z.outerHTML : '');
          }
          if (!tpl.symHTML) { var s = c.querySelector('.nw-sym'); if (s) tpl.symHTML = s.outerHTML; }
          if (!tpl.factHTML) { var f = c.querySelector('.nw-fact'); if (f) tpl.factHTML = f.outerHTML; }
          if (!tpl.ctaHTML) { var a = c.querySelector('.nw-actions'); if (a) tpl.ctaHTML = a.outerHTML; }
        });
        if (!tpl.symHTML) {
          var st = document.getElementById('nwSymTpl');
          if (st) tpl.symHTML = st.innerHTML;
        }

        var anchor = olds[olds.length - 1].nextSibling, parent = olds[0].parentNode;
        var frag = document.createDocumentFragment();
        rows.forEach(function (row) {
          frag.appendChild(fillNews(olds[0].cloneNode(true), row, tpl));
        });
        olds.forEach(function (c) { c.parentNode.removeChild(c); });
        parent.insertBefore(frag, anchor);

        rebuildFilters(rows.length, rows);
        reindexNews(rows.length);
      });
  }

  /* المرشّحات مبنيّة بعدّادات، فلا بدّ من إعادة بنائها مع القائمة وإلا عرضت
     وسمًا زائلًا أو رقمًا كاذبًا. تُستنسخ من زرٍّ قائم كي تبقى أصنافه. */
  function rebuildFilters(total, rows) {
    var bar = document.querySelector('.nw-bar');
    if (!bar) return;
    var btns = [].slice.call(bar.querySelectorAll('.nw-fil'));
    if (!btns.length) return;
    var order = [], count = {};
    rows.forEach(function (r) {
      var tg = r.tag || '';
      if (!tg) return;
      if (!count.hasOwnProperty(tg)) { count[tg] = 0; order.push(tg); }
      count[tg]++;
    });
    var proto = btns[0];
    function make(tag, label, n, pressed) {
      var b = proto.cloneNode(true);
      b.setAttribute('data-tag', tag);
      b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      var c = b.querySelector('.c');
      if (c) c.textContent = String(n);
      for (var i = b.childNodes.length - 1; i >= 0; i--) {
        if (b.childNodes[i].nodeType === 3) b.removeChild(b.childNodes[i]);
      }
      b.insertBefore(document.createTextNode(label + ' '), c || null);
      return b;
    }
    var frag = document.createDocumentFragment();
    frag.appendChild(make('all', 'كل الأخبار', total, true));
    order.forEach(function (tg) { frag.appendChild(make(tg, tg, count[tg], false)); });
    btns.forEach(function (b) { b.parentNode.removeChild(b); });
    bar.insertBefore(frag, bar.firstChild);
  }
  function reindexNews(n) {
    if (window.IAQ_REINDEX && window.IAQ_REINDEX.news) {
      try { window.IAQ_REINDEX.news(); } catch (e) { }
    }
    document.dispatchEvent(new CustomEvent('iaq:lists', { detail: { kind: 'news', count: n } }));
  }

  /* --------------------- شريط الأخبار في الصفحة الرئيسة --------------------- */
  function newsStrip(limit) {
    var strip = document.getElementById('newsStrip');
    if (!strip) return;
    return get('news?select=date,tag,title,lead,body,image&status=eq.published'
      + '&order=date.desc,id.desc&limit=' + (limit || 4)).then(function (rows) {
        if (!rows) return;
        var olds = [].slice.call(strip.querySelectorAll('.news-card'));
        if (!olds.length) return;
        if (!rows.length) {
          if (!dbOwnsLists()) return;
          olds.forEach(function (c) { c.parentNode.removeChild(c); });
          document.dispatchEvent(new CustomEvent('iaq:lists', { detail: { kind: 'newsStrip', count: 0 } }));
          return;
        }
        var withImg = null;
        olds.forEach(function (c) { if (!withImg && c.querySelector('.news-img img')) withImg = c; });
        var frag = document.createDocumentFragment();
        rows.forEach(function (row) {
          var base = (row.image && withImg) ? withImg : olds[0];
          var n = base.cloneNode(true);
          var src = newsImg(row.image), cap = row.title || '';
          var wrap = n.querySelector('.news-img');
          if (wrap) {
            var tg = wrap.querySelector('.news-tag');
            if (tg) tg.textContent = row.tag || '';
            var im = wrap.querySelector('img');
            if (src) {
              if (im) { im.setAttribute('src', src); im.setAttribute('alt', cap); }
            } else if (im) { im.parentNode.removeChild(im); }
          }
          var dt = n.querySelector('.news-date');
          if (dt) txtNodeSet(dt, arDate(row.date));
          var h = n.querySelector('h3');
          if (h) h.textContent = cap;
          var p = n.querySelector('.news-body > p');
          if (p) {
            p.textContent = String(row.lead || '').trim() ||
              ((row.body instanceof Array && row.body.length) ? String(row.body[0]) : '');
          }
          frag.appendChild(n);
        });
        var anchor2 = olds[olds.length - 1].nextSibling, parent2 = olds[0].parentNode;
        olds.forEach(function (c) { c.parentNode.removeChild(c); });
        parent2.insertBefore(frag, anchor2);
        document.dispatchEvent(new CustomEvent('iaq:lists', { detail: { kind: 'newsStrip', count: rows.length } }));
      });
  }

  /* ------------------------------ التشغيل ------------------------------ */
  var JOBS = { assembly: [function () { return people('assembly'); }],
               board:    [function () { return people('board'); }],
               team:     [function () { return people('team'); }],
               news:     [news],
               index:    [partners, function () { return newsStrip(4); }] };

  function run() {
    var jobs = JOBS[slug];
    if (!jobs) return;
    /* كل وظيفة مستقلّة: سقوط إحداها لا يمنع الأخرى، والبناء الثابت يبقى */
    jobs.forEach(function (job) {
      try { job(); } catch (e) { }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  IAQ.reloadLists = run;
})();
