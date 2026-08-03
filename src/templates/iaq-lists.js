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
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
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

  /* ------------------------------ الوثائق ------------------------------ */
  /* التصنيف ← معرّف الحاوية في الصفحة. الحاويات موجودة في الحوكمة (أربع)
     وفي قياس الرضا (واحدة)، وما لا حاوية له في هذه الصفحة يُتجاهَل. */
  var DOC_BOX = { policies: 'gf-pol', minutes: 'gf-min', financials: 'gf-fin',
                  annual: 'gf-ann', surveys: 'gf-sat' };
  /* التراخيص معرضٌ آخر (صور شهادات وجداول بيانات) لا قائمةَ ملفات، فلا تُبنى هنا. */

  function docHref(p) {
    var s = String(p || '');
    if (!s) return '';
    if (/^(https?:)?\/\//.test(s) || s.charAt(0) === '/') return s;
    return s;                      /* مسار داخل الموقع كما هو: files/... */
  }
  /* تمييز العدد مع «صفحة» — العربية تُغيّره بحسب العدد لا تُثبّته */
  function pagesLabel(n) {
    n = Number(n) || 0;
    if (n === 1) return 'صفحة واحدة';
    if (n === 2) return 'صفحتان';
    if (n >= 3 && n <= 10) return n + ' صفحات';
    return n + ' صفحة';
  }

  function fillDoc(node, row) {
    var href = docHref(row.storage_path), title = String(row.title || '');
    node.setAttribute('data-title', title);       /* البحث الفوري يقرأ هذا */
    node.classList.remove('in-view');             /* يُظهره خطّاف reveal */
    var tt = node.querySelector('.ftitle');
    if (tt) tt.textContent = title;

    /* البيانات: نوعٌ وحجمٌ وعدد صفحات، كلٌّ في span مستقلّ — فلا تخلط
       خوارزميةُ الاتّجاه الرقمَ بكلمته. والتاريخ لا يُعرض (الحقل باقٍ في
       القاعدة وفي اللوحة، لكنّه لا يظهر للزائر). */
    var meta = node.querySelector('.fmeta');
    if (meta) {
      var parts = ['PDF'];
      var sz = String(row.size_label == null ? '' : row.size_label).trim();
      if (sz) parts.push(sz);
      if (row.pages) parts.push(pagesLabel(row.pages));
      var spans = [].slice.call(meta.querySelectorAll('span'));
      while (spans.length > parts.length) meta.removeChild(spans.pop());
      while (spans.length < parts.length) {
        var ns = document.createElement('span');
        meta.appendChild(ns);
        spans.push(ns);
      }
      parts.forEach(function (p, k) { spans[k].textContent = p; spans[k].hidden = false; });
    }
    var view = node.querySelector('.file-view'), dl = node.querySelector('.file-dl');
    if (view) view.setAttribute('href', href);
    if (dl) {
      dl.setAttribute('href', href);
      var nm = String(row.dl_name || '').trim();
      if (nm) dl.setAttribute('download', nm); else dl.setAttribute('download', '');
    }
    return node;
  }

  function documents() {
    var boxes = {}, any = false;
    for (var cat in DOC_BOX) {
      if (!DOC_BOX.hasOwnProperty(cat)) continue;
      var el = document.getElementById(DOC_BOX[cat]);
      if (el) { boxes[cat] = el; any = true; }
    }
    if (!any) return;
    /* select=* لأن أعمدة الترتيب قد تُضاف بترقية مخطّط لاحقة */
    return get('documents?select=*&status=eq.published&limit=500').then(function (rows) {
      if (!rows) return;                       // فشل قراءة → يبقى البناء الثابت
      var byCat = {};
      rows.forEach(function (r) {
        var c = r.category;
        if (!boxes[c]) return;
        (byCat[c] = byCat[c] || []).push(r);
      });
      var total = 0;
      for (var cat2 in boxes) {
        if (!boxes.hasOwnProperty(cat2)) continue;
        var box = boxes[cat2];
        var list = box.querySelector('.files');
        if (!list) continue;
        var olds = [].slice.call(list.querySelectorAll('.file-row'));
        if (!olds.length) continue;            // لا قالب نستنسخ منه
        var items = (byCat[cat2] || []).slice().sort(function (a, b) {
          var x = (a.sort == null ? 100 : a.sort), y = (b.sort == null ? 100 : b.sort);
          if (x !== y) return x - y;
          return (a.id || 0) - (b.id || 0);
        });
        if (!items.length) {
          if (!dbOwnsLists()) continue;        // فارغة عن قصد فقط تُفرَّغ
          olds.forEach(function (c) { c.parentNode.removeChild(c); });
          continue;
        }
        var anchor = olds[olds.length - 1].nextSibling, parent = olds[0].parentNode;
        var frag = document.createDocumentFragment();
        items.forEach(function (row) { frag.appendChild(fillDoc(olds[0].cloneNode(true), row)); });
        olds.forEach(function (c) { c.parentNode.removeChild(c); });
        parent.insertBefore(frag, anchor);
        total += items.length;
      }
      /* الصفوف الجديدة تحمل صنف reveal ولم تكن موجودة حين رُصدت العناصر،
         فبلا هذا الخطّاف تبقى شفّافة إلى الأبد. */
      if (window.IAQ_REINDEX && window.IAQ_REINDEX.reveal) {
        try { window.IAQ_REINDEX.reveal(); } catch (e) { }
      }
      document.dispatchEvent(new CustomEvent('iaq:lists', { detail: { kind: 'documents', count: total } }));
    });
  }

  /* --------------------------- شرائح السلايدر --------------------------- */
  /* أيقونات زرّ الشريحة الأول — بنفس أسلوب رسم الموقع (خطّ 2، أطراف مستديرة).
     السهم هو المبنيّ أصلًا، ويُستعار من الصفحة كي لا يتفرّق الشكل. */
  var CTA_ICONS = {
    ext:   '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    doc:   '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 16.5h4"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20v-1.6A4.4 4.4 0 0 1 8 14h2a4.4 4.4 0 0 1 4.5 4.4V20"/><path d="M16.5 7.5a3 3 0 0 1 0 5"/><path d="M18 20v-1.5a3.6 3.6 0 0 0-2-3.2"/>',
    star:  '<path d="M12 3.6l2.5 5.1 5.6.8-4.05 4 .95 5.6L12 16.5l-5 2.6.95-5.6L3.9 9.5l5.6-.8z"/>',
    play:  '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/>'
  };
  function ctaIcon(kind, arrowHTML) {
    if (kind === 'none') return '';
    if (kind === 'arrow' || !kind) return arrowHTML || '';
    var p = CTA_ICONS[kind];
    if (!p) return arrowHTML || '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  function fillSlide(node, row, tpl) {
    /* خلفية الشريحة تُحمل على العقدة نفسها لا تُطبَّق هنا: مالكها paintHeroBg
       في طبقة المظهر، فلا تتنازع آليّتان على خلفيةٍ واحدة. */
    var bg = String(row.bg_image == null ? '' : row.bg_image).trim();
    if (bg) {
      node.setAttribute('data-bg', bg);
      var ov = Number(row.bg_overlay);
      if (isFinite(ov) && ov >= 0 && ov <= 100) node.setAttribute('data-ov', String(ov));
      else node.removeAttribute('data-ov');
    } else {
      node.removeAttribute('data-bg');
      node.removeAttribute('data-ov');
    }
    var eb = node.querySelector('.hero-eyebrow');
    if (eb) {
      if (norm(row.eyebrow)) { eb.textContent = row.eyebrow; eb.hidden = false; }
      else eb.hidden = true;
    }
    var h = node.querySelector('h1');
    if (h) {
      /* العنوان نصّ عادي، والجزء المميّز عنصرٌ بلون الهوية — نُعيد بناء
         الاثنين بلا innerHTML من بيانات المستخدم (نصّ فقط، فلا وسوم تُحقَن). */
      h.textContent = '';
      var base = String(row.title == null ? '' : row.title).trim();
      var acc = String(row.accent == null ? '' : row.accent).trim();
      if (base) h.appendChild(document.createTextNode(acc ? base + ' ' : base));
      if (acc) {
        var sp = document.createElement('span');
        sp.className = 'accent';
        sp.textContent = acc;
        h.appendChild(sp);
      }
    }
    var p = node.querySelector('.hero-text');
    if (p) {
      if (norm(row.text)) { p.textContent = row.text; p.hidden = false; }
      else p.hidden = true;
    }
    var cta = node.querySelector('.hero-cta');
    if (cta) {
      var a1 = cta.querySelector('.btn-primary'), a2 = cta.querySelector('.btn-ghost');
      if (a1) {
        if (norm(row.cta1_label) && norm(row.cta1_url)) {
          a1.hidden = false;
          a1.setAttribute('href', row.cta1_url);
          a1.textContent = row.cta1_label + ' ';
          var ic = ctaIcon(row.cta1_icon, tpl.arrowHTML);
          if (ic) {
            var box = document.createElement('span');
            box.innerHTML = ic;
            while (box.firstChild) a1.appendChild(box.firstChild);
          }
        } else a1.hidden = true;
      }
      if (a2) {
        if (norm(row.cta2_label) && norm(row.cta2_url)) {
          a2.hidden = false;
          a2.setAttribute('href', row.cta2_url);
          a2.textContent = row.cta2_label;
        } else a2.hidden = true;
      }
    }
    node.classList.remove('is-active');
    return node;
  }

  function heroSlides() {
    var wrap = document.getElementById('heroSlider');
    if (!wrap) return;
    return get('hero_slides?select=eyebrow,title,accent,text,bg_image,bg_overlay,cta1_label,cta1_url,cta1_icon,'
      + 'cta2_label,cta2_url&status=eq.published&order=sort.asc,id.asc').then(function (rows) {
        if (!rows) return;                        // فشل قراءة → يبقى المبنيّ
        var olds = [].slice.call(wrap.querySelectorAll('.hero-slide'));
        if (!olds.length) return;
        if (!rows.length) return;                 /* لا نُفرّغ الترويسة أبدًا:
             صفحةٌ رئيسة بلا عنوان أسوأ من عنوانٍ قديم، ولو كان الإفراغ مقصودًا. */
        var tpl = { arrowHTML: null };
        olds.forEach(function (s) {
          if (tpl.arrowHTML) return;
          var sv = s.querySelector('.btn-primary svg');
          if (sv) tpl.arrowHTML = sv.outerHTML;
        });
        var anchor = olds[olds.length - 1].nextSibling, parent = olds[0].parentNode;
        var frag = document.createDocumentFragment();
        rows.forEach(function (row) {
          frag.appendChild(fillSlide(olds[0].cloneNode(true), row, tpl));
        });
        olds.forEach(function (s) { s.parentNode.removeChild(s); });
        parent.insertBefore(frag, anchor);
        if (window.IAQ_REINDEX && window.IAQ_REINDEX.hero) {
          try { window.IAQ_REINDEX.hero(); } catch (e) { }
        }
        /* الشرائح تبدّلت فالخلفية تُعاد حسابها من النشطة الجديدة */
        if (window.IAQ_HERO_BG) { try { window.IAQ_HERO_BG(); } catch (e) { } }
        document.dispatchEvent(new CustomEvent('iaq:lists', { detail: { kind: 'hero', count: rows.length } }));
      });
  }

  /* ---------------------------- القائمة الرئيسية ----------------------------
     أخطرُ ما في هذه الطبقة: القائمة في 19 صفحة، وخطؤها يقطع التنقّل. فالحمايات
     صريحة ومتقدّمة على أي تحديث:
       • لا تُعاد القائمة إلا إذا جاء عنصرٌ رئيسٌ ظاهرٌ واحد على الأقل.
       • كل عنصرٍ يُستنسخ من العنصر المبنيّ صاحب مفتاحه، فتُحفظ أيقونته
         وأصنافه؛ ومفتاحٌ لا مقابل له في الصفحة يُتجاهَل (لا نرسم عنصرًا
         من عندنا في القائمة).
       • رابطٌ لا ينتهي بصفحةٍ موجودة يُتجاهَل — التحقّق الحقيقي في اللوحة،
         وهذا حرزٌ ثانٍ في الموقع.
       • عند أي شكّ يبقى المبنيّ كما هو. */
  function menu() {
    var nav = document.getElementById('navMenu');
    if (!nav) return;
    var keyed = nav.querySelectorAll('[data-mk]');
    if (!keyed.length) return;            /* قائمةٌ غير موسومة (صفحة 404 الثابتة) */
    return get('menu_items?select=mkey,parent,label,href,sort,visible&order=sort.asc,id.asc')
      .then(function (rows) {
        if (!rows || !rows.length) return;   // فشل قراءة أو جدولٌ فارغ → يبقى المبنيّ

        /* فهرس العناصر المبنيّة بمفتاحها */
        var byKey = {};
        [].slice.call(keyed).forEach(function (el) { byKey[el.getAttribute('data-mk')] = el; });

        /* قالبٌ لبناء عنصرٍ جديدٍ لا مقابلَ له في المبنيّ: ننسخ أوّل رابطٍ
           عاديٍّ في القائمة فيرث أصنافه ومظهره، ونُجرّده من أيقونته ومفتاحه. */
        var plain = nav.querySelector('a.nav-link:not(.has-dropdown)');
        function fresh(r) {
          if (!plain || !okHref(r.href)) return null;
          var a = plain.cloneNode(true);
          var sv = a.querySelector('svg');
          if (sv) sv.parentNode.removeChild(sv);      /* لا أيقونةَ لعنصرٍ جديد */
          a.setAttribute('href', r.href);
          a.setAttribute('data-mk', r.mkey);
          a.classList.remove('is-active');
          setLabel(a, r.label);
          return a;
        }

        var tops = [], kids = {};
        rows.forEach(function (r) {
          if (!r || !r.mkey) return;
          /* عنصرٌ لا مقابلَ له يُبنى من القالب — بشرط رابطٍ مقبول. وبلا رابطٍ
             مقبولٍ يُتجاهَل: عنصرٌ يُفضي إلى لا شيء أسوأ من غيابه. */
          if (!byKey[r.mkey] && !okHref(r.href)) return;
          if (r.parent) (kids[r.parent] = kids[r.parent] || []).push(r);
          else tops.push(r);
        });
        var vis = tops.filter(function (r) { return r.visible !== false; });
        if (!vis.length) return;             /* قائمةٌ بلا عنصر ظاهر: لا تُطبَّق */

        var frag = document.createDocumentFragment(), n = 0;
        vis.forEach(function (r) {
          var built = byKey[r.mkey];
          if (!built) {                       /* عنصرٌ جديدٌ رئيسيّ */
            var nn = fresh(r);
            if (nn) { frag.appendChild(nn); n++; }
            return;
          }
          /* العنصر الرئيس: إمّا رابط، وإمّا زرُّ منسدلة داخل حاويته */
          var host = built.closest('.nav-item.has-dropdown');
          var node = (host || built).cloneNode(true);
          if (host) {
            var btn = node.querySelector('[data-mk="' + r.mkey + '"]');
            if (btn) setLabel(btn, r.label);
            var inner = node.querySelector('.dropdown-inner');
            if (inner) {
              var list = (kids[r.mkey] || []).filter(function (c) { return c.visible !== false; });
              var olds = [].slice.call(inner.children);
              if (list.length) {
                var kf = document.createDocumentFragment();
                list.forEach(function (c) {
                  var src = byKey[c.mkey];
                  var a;
                  if (src) {
                    a = src.cloneNode(true);
                  } else {
                    /* ابنٌ جديد: ننسخ أوّل أخٍ مبنيٍّ قالبًا فيرث مظهر المنسدلة */
                    var sib = inner.querySelector('a');
                    if (!sib || !okHref(c.href)) return;
                    a = sib.cloneNode(true);
                    a.setAttribute('data-mk', c.mkey);
                    a.classList.remove('is-active');
                  }
                  setLabel(a, c.label);
                  if (okHref(c.href)) a.setAttribute('href', c.href);
                  kf.appendChild(a);
                });
                if (kf.childNodes.length) {
                  olds.forEach(function (o) { o.parentNode.removeChild(o); });
                  inner.appendChild(kf);
                }
              }
              /* منسدلةٌ بلا أبناء ظاهرين: تُصبح رابطًا إن كان لها رابط،
                 وإلا تُتجاهَل — قائمةٌ تفتح فراغًا أسوأ من إخفائها. */
              if (!inner.children.length) {
                if (!okHref(r.href)) return;
                var solo = document.createElement('a');
                solo.className = 'nav-link';
                solo.setAttribute('href', r.href);
                solo.setAttribute('data-mk', r.mkey);
                var ic = built.querySelector('svg');
                if (ic) solo.appendChild(ic.cloneNode(true));
                solo.appendChild(document.createTextNode(r.label || ''));
                frag.appendChild(solo);
                n++;
                return;
              }
            }
          } else {
            setLabel(node, r.label);
            if (okHref(r.href)) node.setAttribute('href', r.href);
          }
          frag.appendChild(node);
          n++;
        });
        if (!n) return;
        nav.innerHTML = '';
        nav.appendChild(frag);
        markActive(nav);
        document.dispatchEvent(new CustomEvent('iaq:lists', { detail: { kind: 'menu', count: n } }));
      });
  }
  /* الرابط المقبول: صفحةٌ من صفحات الموقع، أو مرساة، أو رابط https كامل.
     قائمة الصفحات تُستخرج من روابط القائمة المبنيّة نفسها — فلا مصدر خارجي. */
  var PAGES = null;
  function pageSet() {
    if (PAGES) return PAGES;
    PAGES = {};
    [].slice.call(document.querySelectorAll('#navMenu a[href], .footer-links a[href]'))
      .forEach(function (a) {
        var h = (a.getAttribute('href') || '').split('#')[0].split('?')[0];
        if (h && /\.html$/.test(h)) PAGES[h] = true;
      });
    PAGES['index.html'] = true;
    return PAGES;
  }
  function okHref(h) {
    var s = String(h == null ? '' : h).trim();
    if (!s) return false;
    if (/^\s*(javascript|vbscript|data|file)\s*:/i.test(s)) return false;
    if (/^https?:\/\//i.test(s)) return true;          /* رابط خارجي كامل */
    if (s.charAt(0) === '#') return true;              /* مرساة في الصفحة */
    var page = s.split('#')[0].split('?')[0];
    return !!pageSet()[page];
  }
  /* يستبدل نصّ العنصر ويُبقي أيقونته ووسومه الداخلية */
  function setLabel(el, label) {
    if (label == null) return;
    txtNodeSet(el, String(label));
  }
  /* الحالة النشطة تُحسب من اسم الصفحة الحالية */
  function markActive(nav) {
    var here = (location.pathname.split('/').pop() || 'index.html');
    [].slice.call(nav.querySelectorAll('.nav-link')).forEach(function (el) {
      el.classList.remove('active');
    });
    [].slice.call(nav.querySelectorAll('a[href]')).forEach(function (a) {
      var h = (a.getAttribute('href') || '').split('#')[0];
      if (!h || h !== here) return;
      if (a.classList.contains('nav-link')) a.classList.add('active');
      else {
        var host = a.closest('.nav-item.has-dropdown');
        var btn = host ? host.querySelector('.nav-trigger') : null;
        if (btn) btn.classList.add('active');
      }
    });
  }

  /* ------------------------------ التشغيل ------------------------------ */
  var JOBS = { assembly: [function () { return people('assembly'); }],
               board:    [function () { return people('board'); }],
               team:     [function () { return people('team'); }],
               news:     [news],
               governance:   [documents],
               satisfaction: [documents],
               index:    [heroSlides, partners, function () { return newsStrip(4); }] };

  /* البناء الثابت يبقى دائمًا، لكن الخطأ لا يُكتَم: يُسجَّل كي يُرى في وحدة
     التحكّم بدل أن يُظنّ أن القاعدة فارغة. */
  function warn(job, e) {
    try {
      console.warn('[iaq] تعذّر تحديث قائمة من قاعدة البيانات — بقي البناء الثابت.',
                   (e && e.message) || e);
    } catch (x) { }
  }
  function run() {
    /* القائمة الرئيسية في كل صفحة، ولو لم يكن للصفحة مهامٌّ أخرى */
    var jobs = (JOBS[slug] || []).concat([menu]);
    if (!jobs.length) return;
    /* كل وظيفة مستقلّة: سقوط إحداها لا يمنع الأخرى، والبناء الثابت يبقى */
    jobs.forEach(function (job) {
      var p;
      try { p = job(); } catch (e) { warn(job, e); return; }
      /* الاستثناء داخل .then لا يبلغه try المتزامن، فكان يسقط بلا أثر:
         بقيت القائمة المبنيّة ولا رسالةَ خطأ في السجلّ. */
      if (p && typeof p.catch === 'function') p.catch(function (e) { warn(job, e); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  IAQ.reloadLists = run;
})();
