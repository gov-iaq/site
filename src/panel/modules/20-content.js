/* ============================================================================
   المحرّر المرئي — تعديل وإخفاء وحذف أي نصّ أو أيقونة أو رابط في أي صفحة.

   كيف يعمل:
   • تُحمَّل الصفحة الحقيقية في إطار داخليّ مع ?iaq-edit=1، وهذا الوسم يمنع طبقة
     التشغيل من تطبيق التعديلات، فيبقى المحتوى الأصليّ ظاهرًا وتُقرأ منه البصمات.
   • النقر على أي عنصر يحسب مساره البنيويّ بخوارزمية العنونة المشتركة نفسها التي
     تستخدمها الصفحات عند التطبيق — فلا يمكن أن يتباعد ما تسجّله عمّا يُطبَّق.
   • التعديل يُخزَّن صفًّا في content_overrides ويسري على الزوّار بلا إعادة بناء.
   • عناصر الترويسة والتذييل تُخزَّن بنطاق '*' فتسري على الصفحات الـ18 كلّها،
     وإلا لتغيّر رقم الهاتف في صفحة واحدة وبقي القديم في السبع عشرة الأخرى.
   ============================================================================ */
(function () {
  'use strict';
  var U = IAQ.ui, F = IAQ.fmt, A = IAQ.api;
  var P = window.IAQ_PATH;

  var TABLE = 'content_overrides';
  var pages = null;            // [{slug,title}]
  var slug = 'index';
  var rows = [];               // تعديلات الصفحة الحالية + العامّة
  var picked = null;           // {el, path, scope, kind}
  var frameDoc = null;
  var tab = 'visual';

  /* ------------------------- مكتبة أيقونات جاهزة ------------------------- */
  var ICONS = [
    ['نجمة', '<path d="M12 3l2.6 5.6 6.1.8-4.4 4.3 1 6-5.3-2.9L6.7 19.7l1-6L3.3 9.4l6.1-.8z"/>'],
    ['صحّ', '<path d="M20 6L9 17l-5-5"/>'],
    ['درع', '<path d="M12 3l7 3v6c0 4.6-3 8-7 9-4-1-7-4.4-7-9V6z"/>'],
    ['قلب', '<path d="M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.6 12 20 12 20z"/>'],
    ['مستخدم', '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'],
    ['فريق', '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 21c0-3.7 2.9-6 6.5-6s6.5 2.3 6.5 6"/><path d="M17 8.2a3 3 0 0 1 0 5.6M18.5 21c0-2.2-.6-3.9-1.7-5.1"/>'],
    ['وثيقة', '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'],
    ['تنزيل', '<path d="M12 3v12M7 11l5 5 5-5M5 21h14"/>'],
    ['هاتف', '<path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4 5.2 2 2 0 0 1 6 3z"/>'],
    ['بريد', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'],
    ['موقع', '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>'],
    ['تقويم', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>'],
    ['ساعة', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>'],
    ['رسم بياني', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
    ['هدف', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>'],
    ['بوصلة', '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'],
    ['عين', '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.8"/>'],
    ['كتاب', '<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M8 3v18"/>'],
    ['شهادة', '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5L7 21l5-2.5L17 21l-1.5-7.5"/>'],
    ['بناء', '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M10 21v-6h4v6"/>'],
    ['شبكة', '<circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>'],
    ['ترس', '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'],
    ['قفل', '<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"/>'],
    ['سهم', '<path d="M19 12H5M12 19l-7-7 7-7"/>']
  ];

  /* وسوم SVG المسموحة داخل الأيقونة — أي شيء آخر يُحذف قبل الحفظ */
  var SVG_OK = { path: 1, circle: 1, rect: 1, line: 1, polyline: 1, polygon: 1, ellipse: 1, g: 1, title: 1 };

  function cleanSvg(html) {
    var box = document.createElement('div');
    box.innerHTML = '<svg>' + String(html || '') + '</svg>';
    var svg = box.firstChild;
    (function walk(node) {
      var kids = Array.prototype.slice.call(node.children || []);
      kids.forEach(function (c) {
        var n = (c.localName || '').toLowerCase();
        if (!SVG_OK[n]) { c.parentNode.removeChild(c); return; }
        Array.prototype.slice.call(c.attributes || []).forEach(function (at) {
          var an = at.name.toLowerCase();
          if (an.indexOf('on') === 0 || an === 'href' || an === 'xlink:href' || an === 'style') c.removeAttribute(at.name);
        });
        walk(c);
      });
    })(svg);
    return svg.innerHTML;
  }

  /* --------------------------- تحميل البيانات --------------------------- */
  function loadPages() {
    if (pages) return Promise.resolve(pages);
    return fetch('panel-pages.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
      .then(function (d) { pages = d.pages || []; return pages; })
      .catch(function () { pages = [{ slug: 'index', title: 'الرئيسية' }]; return pages; });
  }

  function loadRows() {
    var q = 'select=*&or=(page.eq.' + encodeURIComponent(slug) + ',page.eq.*)&order=id.desc';
    return A.select(TABLE, q).then(function (r) { rows = r || []; return rows; });
  }

  function rowFor(path, op, attr, part) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.path === path && r.op === op &&
          (r.attr || '') === (attr || '') && (r.part == null ? -1 : r.part) === (part == null ? -1 : part)) return r;
    }
    return null;
  }

  /* ------------------------------ العرض ------------------------------ */
  function render(mount) {
    return loadPages().then(loadRows).then(function () {
      mount.innerHTML =
        U.head('المحتوى', 'عدّل أو أخفِ أو احذف أي نصّ أو أيقونة في أي صفحة — والتغيير يظهر للزوّار بلا إعادة بناء.') +
        '<div class="filterbar">' +
          '<button class="btn sm' + (tab === 'visual' ? ' ok' : ' ghost') + '" data-act="ct-tab" data-arg="visual">المحرّر المرئي</button>' +
          '<button class="btn sm' + (tab === 'list' ? ' ok' : ' ghost') + '" data-act="ct-tab" data-arg="list">التعديلات المحفوظة (' + rows.length + ')</button>' +
        '</div>' +
        (tab === 'visual' ? visualView() : listView());
      if (tab === 'visual') mountFrame();
    });
  }

  function visualView() {
    var opts = pages.map(function (p) {
      return '<option value="' + U.attr(p.slug) + '"' + (p.slug === slug ? ' selected' : '') + '>' +
        U.esc(p.title) + '</option>';
    }).join('');
    return U.notice(
      '<b>كيف تُعدّل؟</b> اختر الصفحة، ثم انقر على أي نصّ أو أيقونة داخل المعاينة. ' +
      'ما تنقره يُفتح في لوح جانبيّ فيه النصّ الأصليّ وخياراتُ التعديل والإخفاء والحذف.<br>' +
      'ما تنقره في <b>الترويسة أو التذييل</b> يُحفظ لكل الصفحات معًا.') +
      '<div class="ad-card">' +
        '<div class="addrow" style="margin-block-end:14px">' +
          '<select id="ct-page" style="flex:1;min-width:200px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-family:var(--ui)">' + opts + '</select>' +
          '<button class="btn" data-act="ct-load">فتح الصفحة</button>' +
          '<button class="btn ghost" data-act="ct-refresh">تحديث المعاينة</button>' +
        '</div>' +
        '<div style="position:relative;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff">' +
          '<iframe id="ct-frame" title="معاينة الصفحة" style="width:100%;height:70vh;border:0;display:block"></iframe>' +
        '</div>' +
        '<p class="muted small" style="margin-block-start:10px">المعاينة تعرض المحتوى الأصليّ دائمًا (بلا تطبيق التعديلات) كي تبقى المقارنة والاسترجاع ممكنين.</p>' +
      '</div>';
  }

  var OPS = { text: 'نصّ', tnode: 'جزء نصّي', attr: 'خاصية', icon: 'أيقونة', html: 'محتوى', hide: 'إخفاء', 'delete': 'حذف' };

  function listView() {
    if (!rows.length) return U.card('التعديلات المحفوظة', U.empty('لا توجد تعديلات محفوظة بعد.'));
    var body = rows.map(function (r) {
      return [
        '<span class="chip">' + U.esc(OPS[r.op] || r.op) + '</span>',
        '<b>' + U.esc(F.cut(r.label || r.orig_text || r.path, 46)) + '</b>' +
          '<div class="muted small mono" dir="ltr">' + U.esc(F.cut(r.path, 58)) + '</div>',
        r.page === '*' ? '<span class="chip">كل الصفحات</span>' : U.esc(r.page),
        r.op === 'hide' || r.op === 'delete' ? '<span class="muted">—</span>' : U.esc(F.cut(r.value, 42)),
        '<span class="stbadge">' + (r.status === 'published' ? 'مُطبَّق' : 'مسودّة') + '</span>',
        U.iconBtn('ct-restore', '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>', { id: r.id, label: 'استرجاع الأصل', danger: true, sm: true })
      ];
    });
    return U.card('التعديلات المحفوظة',
      U.table(['النوع', 'العنصر', 'النطاق', 'القيمة الجديدة', 'الحالة', ''], body) +
      '<p class="muted small" style="margin-block-start:12px">الاسترجاع يحذف صفّ التعديل فيعود النصّ الأصليّ المبنيّ في الصفحة.</p>');
  }

  /* --------------------------- إطار المعاينة --------------------------- */
  function mountFrame() {
    var fr = U.$('#ct-frame');
    if (!fr) return;
    fr.src = slug + '.html?iaq-edit=1';
    fr.onload = function () {
      try { frameDoc = fr.contentDocument; } catch (e) { frameDoc = null; }
      if (!frameDoc) { U.toast('تعذّر قراءة المعاينة', 'err'); return; }
      armPicker(frameDoc);
    };
  }

  function armPicker(doc) {
    var st = doc.createElement('style');
    st.textContent =
      '.iaq-hl{outline:2px dashed #007878!important;outline-offset:2px;cursor:pointer!important;background:rgba(0,120,120,.06)!important}' +
      '.iaq-sel{outline:2.5px solid #c09048!important;outline-offset:2px}';
    doc.head.appendChild(st);

    var last = null;
    function target(el) {
      if (!el || el.nodeType !== 1) return null;
      // داخل SVG نصعد إلى عنصر svg نفسه
      var n = el;
      while (n && n !== doc.body) {
        if (P.tagOf(n) === 'svg') return n;
        n = n.parentElement;
      }
      return el;
    }
    doc.addEventListener('mouseover', function (e) {
      var t = target(e.target);
      if (last && last !== t) last.classList.remove('iaq-hl');
      if (t && t !== doc.body) { t.classList.add('iaq-hl'); last = t; }
    }, true);
    doc.addEventListener('mouseout', function () { if (last) last.classList.remove('iaq-hl'); }, true);
    // نمنع التنقّل وأي تفاعل داخل المعاينة
    ['click', 'submit', 'keydown'].forEach(function (evt) {
      doc.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        if (evt !== 'click') return;
        var t = target(e.target);
        if (!t || t === doc.body) return;
        U.$$('.iaq-sel', doc).forEach(function (x) { x.classList.remove('iaq-sel'); });
        t.classList.add('iaq-sel');
        openEditor(t);
      }, true);
    });
  }

  /* ------------------------------ المحرّر ------------------------------ */
  function kindOf(el) {
    var t = P.tagOf(el);
    if (t === 'svg') return 'icon';
    if (t === 'img') return 'image';
    if (P.isLeafText(el)) return 'text';
    if (P.textParts(el).length) return 'mixed';
    return 'block';
  }

  function openEditor(el) {
    var path = P.pathOf(el);
    if (!path) { U.toast('عنصر غير قابل للعنونة', 'warn'); return; }
    var scope = P.scopeOf(el);
    var kind = kindOf(el);
    picked = { el: el, path: path, scope: scope, kind: kind };

    var page = scope === 'global' ? '*' : slug;
    var h = '';
    h += '<div class="sub-meta">' +
      '<div class="kv"><span>الوسم</span><b class="mono" dir="ltr">&lt;' + U.esc(P.tagOf(el)) + '&gt;</b></div>' +
      '<div class="kv"><span>النطاق</span><b>' + (scope === 'global' ? 'الترويسة/التذييل — كل الصفحات' : 'هذه الصفحة فقط') + '</b></div>' +
      '<div class="kv"><span>المسار</span><b class="mono small" dir="ltr">' + U.esc(path) + '</b></div>' +
      '</div>';

    if (scope === 'global') {
      h += U.notice('هذا العنصر مشترك، والتعديل سيسري على <b>كل صفحات الموقع</b>.');
    }

    if (kind === 'text') {
      var cur = rowFor(path, 'text', '', -1);
      h += '<div class="drawer-sec"><h4>النصّ</h4>' +
        '<div class="sub-msg"><div class="sm-label">النصّ الأصليّ</div><p>' + U.esc(el.textContent) + '</p></div>' +
        '<div class="fld" style="margin-block-start:12px"><label for="ct-val">النصّ الجديد</label>' +
        '<textarea class="dtxt" id="ct-val">' + U.esc(cur ? cur.value : el.textContent) + '</textarea></div>' +
        '<div class="btnbar"><button class="btn" data-act="ct-save" data-arg="text">حفظ النصّ</button></div></div>';
    } else if (kind === 'mixed') {
      var parts = P.textParts(el);
      h += '<div class="drawer-sec"><h4>أجزاء النصّ</h4>' +
        '<p class="muted small">هذا العنصر يخلط نصًّا وعناصر داخلية، فيُحرَّر كل جزء وحده.</p>';
      parts.forEach(function (pt) {
        var r = rowFor(path, 'tnode', '', pt.i);
        h += '<div class="fld"><label for="ct-p' + pt.i + '">الجزء ' + (pt.i + 1) + '</label>' +
          '<input type="text" id="ct-p' + pt.i + '" value="' + U.attr(r ? r.value : pt.text) + '">' +
          '</div><div class="btnbar" style="margin-block-end:10px"><button class="btn sm" data-act="ct-save" data-arg="tnode:' + pt.i + '">حفظ الجزء</button></div>';
      });
      h += '</div>';
    } else if (kind === 'icon') {
      var ri = rowFor(path, 'icon', '', -1);
      h += '<div class="drawer-sec"><h4>الأيقونة</h4><div class="media-grid" style="grid-template-columns:repeat(4,1fr)">';
      ICONS.forEach(function (ic, i) {
        h += '<button class="media-item" data-act="ct-icon" data-arg="' + i + '" title="' + U.attr(ic[0]) + '" style="cursor:pointer;padding:0;border-color:var(--line)">' +
          '<div class="mi-img" style="height:56px"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#007878" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ic[1] + '</svg></div>' +
          '<div class="mi-name" style="font-size:11.5px;text-align:center">' + U.esc(ic[0]) + '</div></button>';
      });
      h += '</div>' +
        '<div class="fld" style="margin-block-start:12px"><label for="ct-val">أو مسارات SVG مباشرة (متقدّم)</label>' +
        '<textarea class="dtxt" id="ct-val" dir="ltr">' + U.esc(ri ? ri.value : el.innerHTML) + '</textarea></div>' +
        '<div class="btnbar"><button class="btn" data-act="ct-save" data-arg="icon">حفظ الأيقونة</button></div></div>';
    } else if (kind === 'image') {
      h += attrSec(el, path, [['src', 'مسار الصورة'], ['alt', 'الوصف البديل']]);
    }

    var t = P.tagOf(el);
    if (t === 'a') h += attrSec(el, path, [['href', 'الرابط'], ['title', 'التلميح']]);
    if (t === 'button' || t === 'a') h += attrSec(el, path, [['aria-label', 'الوصف لقارئ الشاشة']]);

    // الإخفاء والحذف متاحان لأي عنصر
    var hid = rowFor(path, 'hide', '', -1), del = rowFor(path, 'delete', '', -1);
    h += '<div class="drawer-sec"><h4>الظهور</h4>' +
      '<p class="muted small">الإخفاء يُبقي العنصر في الصفحة ويمنع ظهوره — قابل للتراجع. الحذف يُزيله تمامًا.</p>' +
      '<div class="btnbar">' +
      (hid ? '<button class="btn ghost" data-act="ct-restore" data-id="' + hid.id + '">إلغاء الإخفاء</button>'
           : '<button class="btn ghost" data-act="ct-save" data-arg="hide">إخفاء العنصر</button>') +
      (del ? '<button class="btn ghost" data-act="ct-restore" data-id="' + del.id + '">إلغاء الحذف</button>'
           : '<button class="btn danger" data-act="ct-save" data-arg="delete">حذف العنصر</button>') +
      '</div></div>';

    U.drawer('تعديل عنصر · ' + (page === '*' ? 'كل الصفحات' : page), h);
  }

  function attrSec(el, path, list) {
    var h = '<div class="drawer-sec"><h4>الخصائص</h4>';
    list.forEach(function (pair) {
      var name = pair[0], lbl = pair[1];
      var r = rowFor(path, 'attr', name, -1);
      var cur = r ? r.value : (el.getAttribute(name) || '');
      h += '<div class="fld"><label for="ct-a-' + name + '">' + U.esc(lbl) + ' <span class="mono small">' + name + '</span></label>' +
        '<input type="text" id="ct-a-' + name + '" dir="ltr" value="' + U.attr(cur) + '"></div>' +
        '<div class="btnbar" style="margin-block-end:10px"><button class="btn sm" data-act="ct-save" data-arg="attr:' + name + '">حفظ</button></div>';
    });
    return h + '</div>';
  }

  /* ------------------------------ الحفظ ------------------------------ */
  function save(kindArg) {
    if (!picked) return;
    var el = picked.el, path = picked.path;
    var page = picked.scope === 'global' ? '*' : slug;
    var op = kindArg, attr = '', part = -1, value = null, fp = null, orig = null;

    if (kindArg.indexOf('attr:') === 0) {
      op = 'attr'; attr = kindArg.slice(5);
      var inp = U.$('#ct-a-' + attr);
      value = inp ? inp.value : '';
      orig = el.getAttribute(attr) || '';
      fp = P.fpOf(el, orig);
    } else if (kindArg.indexOf('tnode:') === 0) {
      op = 'tnode'; part = parseInt(kindArg.slice(6), 10);
      var pi = U.$('#ct-p' + part);
      value = pi ? pi.value : '';
      var n = el.childNodes[part];
      orig = n ? n.nodeValue : '';
      fp = P.fpOf(el, orig);
    } else if (kindArg === 'text') {
      var ta = U.$('#ct-val');
      value = ta ? ta.value : '';
      orig = el.textContent;
      fp = P.fpOf(el);
    } else if (kindArg === 'icon') {
      var iv = U.$('#ct-val');
      value = cleanSvg(iv ? iv.value : '');
      orig = el.innerHTML;
      fp = P.fpOf(el, orig);
    } else if (kindArg === 'hide' || kindArg === 'delete') {
      value = null; orig = F.cut(el.textContent || P.tagOf(el), 90);
      fp = P.fpOf(el);
    } else { return; }

    if ((op === 'text' || op === 'tnode') && P.norm(value) === P.norm(orig)) {
      U.toast('لا تغيير — النصّ كما هو', 'warn'); return;
    }

    var row = {
      page: page, path: path, op: op, attr: attr, part: part,
      value: value, orig_fp: fp, orig_text: F.cut(orig, 300),
      label: F.cut(P.norm(el.textContent) || P.tagOf(el), 90),
      status: 'published', updated_by: (IAQ.me && IAQ.me.email) || ''
    };

    A.upsert(TABLE, [row], 'page,path,op,attr,part').then(function (res) {
      IAQ.audit('content.' + op, 'content_overrides', res && res[0] && res[0].id);
      U.toast(op === 'delete' ? 'حُذف العنصر' : (op === 'hide' ? 'أُخفي العنصر' : 'تم الحفظ — سيظهر للزوّار خلال دقائق'));
      U.closeDrawer();
      IAQ.go('content');
    }).catch(function (e) {
      U.toast(e && e.message ? e.message : 'فشل الحفظ', 'err');
    });
  }

  /* ------------------------------ الأحداث ------------------------------ */
  IAQ.on('ct-tab', function (b) { tab = b.getAttribute('data-arg'); IAQ.go('content'); });
  IAQ.on('ct-load', function () {
    var s = U.$('#ct-page');
    if (s) slug = s.value;
    mountFrame();
  });
  IAQ.on('ct-refresh', function () { mountFrame(); });
  IAQ.on('ct-save', function (b) { save(b.getAttribute('data-arg')); });
  IAQ.on('ct-icon', function (b) {
    var i = parseInt(b.getAttribute('data-arg'), 10);
    var ta = U.$('#ct-val');
    if (ta && ICONS[i]) { ta.value = ICONS[i][1]; U.toast('اخترت «' + ICONS[i][0] + '» — اضغط حفظ الأيقونة'); }
  });
  IAQ.on('ct-restore', function (b) {
    var id = b.getAttribute('data-id');
    U.ask('استرجاع المحتوى الأصليّ وحذف هذا التعديل؟').then(function (ok) {
      if (!ok) return;
      return A.remove(TABLE, id).then(function (res) {
        if (!res || !res.length) { U.toast('لم يُحذف شيء — قد يكون التعديل محذوفًا مسبقًا', 'warn'); }
        else { IAQ.audit('content.restore', 'content_overrides', id); U.toast('استُرجع الأصل'); }
        U.closeDrawer();
        IAQ.go('content');
      });
    }).catch(function (e) { U.toast(e && e.message ? e.message : 'فشل الاسترجاع', 'err'); });
  });

  IAQ.views.register('content', {
    label: 'المحتوى',
    group: 'المحتوى',
    icon: '<path d="M4 5h16M4 12h10M4 19h7"/><path d="M15.5 19l5-5 2 2-5 5h-2z"/>',
    render: render
  });
})();
