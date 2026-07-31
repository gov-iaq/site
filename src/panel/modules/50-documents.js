/* ============================================================================
   شاشة «الوثائق والوسائط» — مكتبة ملفات PDF مع سجلّاتها في public.documents،
   ومكتبة صور في public.media + مستودع iaq-media.

   قواعد مثبَّتة في هذه الشاشة (كل واحدة أُدرجت لأنها تكسر بصمت):
   • مفتاح الكائن في المستودع لاتينيّ دائمًا: التصنيف/الطابع الزمني-اسم-مُنقّى.pdf
     العربية تبقى في dl_name فقط، لأن مفاتيح الكائنات العربية تتحوّل إلى
     نسب مئوية طويلة ويصعب مطابقتها لاحقًا عند الحذف.
   • لا معاملة (transaction) بين المستودع وقاعدة البيانات: نرفع أوّلًا، ثم
     نُدخل الصفّ؛ وإن فشل الإدخال نحذف الملف المرفوع ونُبلّغ بنتيجة الحذف.
   • حذف المستودع الذي يُرجع مصفوفة فارغة يعني «لم يُحذف شيء» ولا يُعدّ خطأ —
     نقولها للمستخدم كما هي بدل ادّعاء النجاح.
   • القراءة الممنوعة بـRLS ترجع 200 ومصفوفة فارغة، لذلك «لا توجد بيانات»
     لا تُعرض كخطأ.
   • صفحة الحوكمة في الموقع ثابتة (تُبنى من src/data/files.json)، فالوثيقة
     المرفوعة هنا محفوظة لكنها لا تظهر للزوّار قبل إعادة البناء والنشر.
   ============================================================================ */
(function () {
  'use strict';

  var U = IAQ.ui, F = IAQ.fmt, A = IAQ.api;

  var B_DOC = 'iaq-files';                 // مستودع الوثائق
  var B_IMG = 'iaq-media';                 // مستودع الصور
  var LIM_DOC = 200, LIM_IMG = 120;

  /* التصنيفات الستّة المسموحة في القيد check على العمود category */
  var CATS = [
    { k: 'policies',   ar: 'السياسات واللوائح' },
    { k: 'minutes',    ar: 'محاضر الاجتماعات' },
    { k: 'financials', ar: 'التقارير المالية' },
    { k: 'annual',     ar: 'التقارير السنوية' },
    { k: 'licenses',   ar: 'التراخيص' },
    { k: 'surveys',    ar: 'الاستبيانات' }
  ];

  /* الصيغ المقبولة للصور، وخريطة النوع إلى امتداد حين يأتي الملف بلا امتداد */
  var IMG_EXT = { png: 1, jpg: 1, jpeg: 1, webp: 1, gif: 1, svg: 1, avif: 1 };
  var MIME_EXT = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif'
  };

  /* حالة الشاشة — داخل الغلاف، لا متغيّر عامّ */
  var docs = [], imgs = [], docErr = '', imgErr = '', catFilter = '';

  /* ------------------------------- أيقونات ------------------------------- */
  var IC_FILE  = '<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13 3v6h6"/>';
  var IC_OPEN  = '<path d="M14 5h5v5M19 5l-8 8M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/>';
  var IC_PUB   = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
  var IC_HIDE  = '<path d="M3 3l18 18M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.2 7.9A17 17 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 3.4-.6"/>';
  var IC_DEL   = '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>';
  var IC_COPY  = '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>';
  var SVG_UP   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
                 'stroke-linecap="round" stroke-linejoin="round">' +
                 '<path d="M12 16V4M7 9l5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';

  /* ------------------------------- أدوات ------------------------------- */
  function catAr(k) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].k === k) return CATS[i].ar;
    return k || '—';
  }
  function catOk(k) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].k === k) return true;
    return false;
  }
  function byId(list, id) {
    var n = String(id);
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === n) return list[i];
    return null;
  }
  function msg(e) { return (e && e.message) ? e.message : 'فشل الإجراء'; }

  /* اسم لاتينيّ آمن — لا يُشتقّ مفتاح الكائن من نصّ عربيّ أبدًا.
     الاسم العربيّ بالكامل يصبح فارغًا بعد التنقية فنستعمل بديلًا محايدًا. */
  function asciiSlug(name) {
    var base = String(name == null ? '' : name).replace(/\.[A-Za-z0-9]{1,6}$/, '');
    var s = base.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+/g, '-')
                .replace(/^-/, '').replace(/-$/, '').toLowerCase();
    if (s.length > 48) s = s.slice(0, 48).replace(/-$/, '');
    if (s.length < 2) s = 'file';
    return s;
  }
  function extOf(f) {
    var m = /\.([A-Za-z0-9]{1,6})$/.exec(String(f.name || ''));
    var e = m ? m[1].toLowerCase() : '';
    if (e === 'jpeg') e = 'jpg';
    if (IMG_EXT[e]) return e;
    return MIME_EXT[String(f.type || '').toLowerCase()] || '';
  }
  function docPath(cat, f) { return cat + '/' + Date.now() + '-' + asciiSlug(f.name) + '.pdf'; }
  function imgPath(f) {
    var e = extOf(f);
    return e ? ('images/' + Date.now() + '-' + asciiSlug(f.name) + '.' + e) : '';
  }
  function val(sel) {
    var el = U.$(sel);
    return el ? String(el.value == null ? '' : el.value).replace(/^\s+|\s+$/g, '') : '';
  }
  function fileOf(sel) {
    var el = U.$(sel);
    return (el && el.files && el.files.length) ? el.files[0] : null;
  }
  /* قراءة لا تُفشل الشاشة كلّها: كل قسم يُبلّغ عن عطله وحده */
  function safe(p) {
    return p.then(
      function (rows) { return { rows: rows || [], err: '' }; },
      function (e) { return { rows: [], err: msg(e) }; }
    );
  }

  /* حذف كائن من المستودع وتسجيل ما حدث فعلًا في st:
     st.gone = حُذف الملف فعلًا، st.note = عبارة تُلحق برسالة المستخدم.
     مصفوفة فارغة من المستودع تعني «لم يُحذف شيء» وليست خطأً. */
  function delObj(bucket, path, st) {
    if (!path) {
      st.note = ' ولم يكن للسجلّ مسار ملف في المستودع، فلم يُطلب حذف أي ملف.';
      return Promise.resolve();
    }
    return IAQ.storage.remove(bucket, [path]).then(
      function (del) {
        if (del && del.length) st.gone = true;
        else st.note = ' لكن لم يُحذف أي ملف من المستودع.';
      },
      function (e) { st.note = ' وتعذّر حذف الملف من المستودع (' + msg(e) + ').'; }
    );
  }

  /* رسالة فشل حذف الصفّ — تُصرّح بأن الملف سبق حذفه إن حُذف، فلا نترك المستخدم
     يظنّ أن شيئًا لم يتغيّر بينما الملف اختفى والسجلّ باقٍ يشير إليه. */
  function delFailMsg(st, path) {
    return 'لم يُحذف أي صفّ من قاعدة البيانات — قد لا تملك صلاحية الحذف.' +
      (st.gone
        ? ' لكنّ الملف حُذف من المستودع قبل ذلك، فالسجلّ الباقي يشير إلى ملف غير موجود (' +
          path + ').'
        : st.note);
  }

  /* --------------------------- نسخ الرابط --------------------------- */
  function fallbackCopy(t) {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (ta.parentNode) ta.parentNode.removeChild(ta);
    U.toast(ok ? 'نُسخ الرابط' : 'تعذّر النسخ تلقائيًا — الرابط: ' + t, ok ? 'ok' : 'warn');
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(
        function () { U.toast('نُسخ الرابط', 'ok'); },
        function () { fallbackCopy(t); }
      );
      return;
    }
    fallbackCopy(t);
  }

  /* ---------------------- عرض الملف المختار ----------------------
     مستمع واحد على المستند (لا على عنصر نرسمه)، فيبقى صالحًا بعد كل إعادة رسم. */
  function paintPick(sel, input, isDoc) {
    var box = U.$(sel);
    if (!box) return;
    var f = (input.files && input.files.length) ? input.files[0] : null;
    if (!f) { box.innerHTML = '<span class="muted small">لم يُختر ملف بعد.</span>'; return; }
    var latin = isDoc ? (asciiSlug(f.name) + '.pdf')
                      : (extOf(f) ? (asciiSlug(f.name) + '.' + extOf(f)) : '');
    box.innerHTML =
      '<span class="small">' + U.esc(F.cut(f.name, 46)) + '</span>' +
      '<span class="muted small">' + U.esc(F.bytes(f.size)) + '</span>' +
      (latin ? '<span class="mono">' + U.esc(latin) + '</span>'
             : '<span class="muted small">صيغة غير مدعومة</span>');
  }
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t || !t.tagName || String(t.tagName).toLowerCase() !== 'input') return;
    if (t.type !== 'file') return;
    if (t.id === 'doc-file') paintPick('#doc-pick', t, true);
    else if (t.id === 'med-file') paintPick('#med-pick', t, false);
  });

  /* ============================ رسم الوثائق ============================ */
  function docFilterBar() {
    var all = [{ k: '', ar: 'الكل' }].concat(CATS);
    return '<div class="filterbar" id="doc-filters">' + all.map(function (c) {
      var n = 0;
      for (var i = 0; i < docs.length; i++) if (!c.k || docs[i].category === c.k) n++;
      var on = (catFilter === c.k);
      return '<button class="btn sm' + (on ? ' ok' : ' ghost') + '" data-act="docFilter"' +
             ' data-arg="' + U.esc(c.k) + '">' + U.esc(c.ar) + ' (' + F.num(n) + ')</button>';
    }).join('') + '</div>';
  }

  function docTableHtml() {
    if (docErr) {
      return U.notice('<b>تعذّر قراءة جدول الوثائق.</b><br>' + U.esc(docErr));
    }
    var list = [];
    for (var i = 0; i < docs.length; i++) {
      if (!catFilter || docs[i].category === catFilter) list.push(docs[i]);
    }
    if (!list.length) {
      return U.empty(catFilter ? 'لا توجد وثائق في هذا التصنيف' : 'لا توجد بيانات');
    }
    var rows = list.map(function (d) {
      var pub = (d.status === 'published');
      var sub = [];
      if (d.dl_name) sub.push(F.cut(d.dl_name, 44));
      if (d.pages) sub.push(F.num(d.pages) + ' صفحة');
      return [
        '<b>' + U.esc(F.cut(d.title, 58)) + '</b>' +
          (sub.length ? '<div class="small muted">' + U.esc(sub.join(' · ')) + '</div>' : ''),
        '<span class="chip">' + U.esc(catAr(d.category)) + '</span>',
        U.esc(d.doc_date || '—'),
        U.esc(d.size_label || '—'),
        '<span class="stbadge ' + (pub ? 'rp' : 'nw') + '">' + (pub ? 'منشور' : 'مسوّدة') + '</span>',
        '<span class="mono">' + U.esc(F.cut(d.storage_path || '', 32)) + '</span>',
        '<div class="acts">' +
          U.iconBtn('docOpen', IC_OPEN, { id: d.id, sm: true, label: 'فتح الملف' }) +
          U.iconBtn('docToggle', pub ? IC_HIDE : IC_PUB, { id: d.id, sm: true,
            label: pub ? 'إرجاع إلى مسوّدة' : 'تعليمها منشورة' }) +
          U.iconBtn('docDel', IC_DEL, { id: d.id, sm: true, danger: true, label: 'حذف' }) +
        '</div>'
      ];
    });
    return U.table(['العنوان', 'التصنيف', 'تاريخ الوثيقة', 'الحجم', 'الحالة', 'مسار المستودع', 'إجراءات'], rows) +
      (docs.length >= LIM_DOC
        ? '<p class="small muted">يُعرض أحدث ' + F.num(LIM_DOC) + ' سجلًّا فقط.</p>' : '');
  }

  function docFormHtml() {
    var opts = CATS.map(function (c) {
      return '<option value="' + U.esc(c.k) + '">' + U.esc(c.ar) + '</option>';
    }).join('');
    return U.card('رفع وثيقة جديدة',
      '<label class="upload big">' + SVG_UP +
        '<span>اختر ملف PDF من جهازك</span>' +
        '<input type="file" id="doc-file" accept=".pdf,application/pdf" hidden>' +
      '</label>' +
      '<div class="prow" id="doc-pick"><span class="muted small">لم يُختر ملف بعد.</span></div>' +
      '<div class="fld"><label for="doc-title">عنوان الوثيقة</label>' +
        '<input type="text" id="doc-title" placeholder="التقرير السنوي 2025"></div>' +
      '<div class="grid2">' +
        '<div class="fld"><label for="doc-cat">التصنيف</label>' +
          '<select id="doc-cat">' + opts + '</select></div>' +
        '<div class="fld"><label for="doc-date">تاريخ الوثيقة</label>' +
          '<input type="text" id="doc-date" placeholder="2025 أو 2025-04"></div>' +
      '</div>' +
      '<div class="grid2">' +
        '<div class="fld"><label for="doc-dl">اسم ملف التنزيل بالعربية</label>' +
          '<input type="text" id="doc-dl" placeholder="التقرير السنوي 2025 - حاضنة الجمعيات.pdf"></div>' +
        '<div class="fld"><label for="doc-pages">عدد الصفحات (اختياري)</label>' +
          '<input type="number" id="doc-pages" min="1" step="1" placeholder="14"></div>' +
      '</div>' +
      '<p class="small muted">يُخزَّن الملف باسم لاتينيّ داخل المستودع، ويبقى الاسم العربيّ ' +
      'في «اسم ملف التنزيل» ليصل للزائر عند الحفظ. الحجم يُقرأ من الملف نفسه.</p>',
      '<button class="btn" data-act="docUp">رفع الوثيقة وحفظ سجلّها</button>');
  }

  /* ============================ رسم الوسائط ============================ */
  function medGridHtml() {
    if (imgErr) {
      return U.notice('<b>تعذّر قراءة جدول الوسائط.</b><br>' + U.esc(imgErr));
    }
    if (!imgs.length) return U.empty('لا توجد بيانات');
    return '<div class="media-grid">' + imgs.map(function (m) {
      var url = IAQ.storage.publicUrl(m.bucket || B_IMG, m.storage_path || '');
      var nm = m.title || String(m.storage_path || '').split('/').pop();
      return '<div class="media-item">' +
        '<div class="mi-img"><img src="' + U.esc(url) + '" alt="' +
          U.esc(m.alt || nm || '') + '" loading="lazy"></div>' +
        '<div class="mi-name" title="' + U.esc(nm || '') + '">' + U.esc(F.cut(nm, 30)) + '</div>' +
        '<div class="mi-acts">' +
          '<span class="small muted">' + U.esc(m.bytes ? F.bytes(m.bytes) : '—') + '</span>' +
          U.iconBtn('medCopy', IC_COPY, { id: m.id, sm: true, label: 'نسخ الرابط' }) +
          U.iconBtn('medOpen', IC_OPEN, { id: m.id, sm: true, label: 'فتح الصورة' }) +
          U.iconBtn('medDel', IC_DEL, { id: m.id, sm: true, danger: true, label: 'حذف' }) +
        '</div>' +
      '</div>';
    }).join('') + '</div>' +
    (imgs.length >= LIM_IMG
      ? '<p class="small muted">تُعرض أحدث ' + F.num(LIM_IMG) + ' صورة فقط.</p>' : '');
  }

  function medFormHtml() {
    return U.card('رفع صورة',
      '<label class="upload big">' + SVG_UP +
        '<span>اختر صورة من جهازك</span>' +
        '<input type="file" id="med-file" accept="image/*" hidden>' +
      '</label>' +
      '<div class="prow" id="med-pick"><span class="muted small">لم يُختر ملف بعد.</span></div>' +
      '<div class="grid2">' +
        '<div class="fld"><label for="med-title">اسم الصورة</label>' +
          '<input type="text" id="med-title" placeholder="شعار الشريك"></div>' +
        '<div class="fld"><label for="med-alt">النصّ البديل (alt)</label>' +
          '<input type="text" id="med-alt" placeholder="وصف مختصر للصورة لقارئ الشاشة"></div>' +
      '</div>' +
      '<p class="small muted">الصيغ المقبولة: PNG وJPG وWEBP وGIF وSVG وAVIF. ' +
      'بعد الرفع يصبح رابط الصورة العلنيّ جاهزًا للاستخدام مباشرة.</p>',
      '<button class="btn" data-act="medUp">رفع الصورة</button>');
  }

  /* ============================== الشاشة ============================== */
  IAQ.views.register('documents', {
    label: 'الوثائق والوسائط',
    group: 'المحتوى',
    icon: IC_FILE,
    render: function (mount) {
      return Promise.all([
        safe(A.select('documents', 'select=*&order=created_at.desc&limit=' + LIM_DOC)),
        safe(A.select('media', 'select=*&kind=eq.image&order=created_at.desc&limit=' + LIM_IMG))
      ]).then(function (r) {
        docs = r[0].rows; docErr = r[0].err;
        imgs = r[1].rows; imgErr = r[1].err;

        mount.innerHTML =
          U.head('الوثائق والوسائط', 'مكتبة ملفات PDF وسجلّاتها، ومكتبة صور الموقع.') +
          U.notice(
            '<b>ما يظهر للزوّار وما لا يظهر.</b><br>' +
            'صفحات الموقع العلنيّة ملفات HTML ثابتة تُبنى من ملفات المصدر. الوثيقة التي ترفعها ' +
            'هنا تُخزَّن في المستودع ويُحفظ سجلّها في قاعدة البيانات، لكن جدول التحميلات في صفحة ' +
            'الحوكمة <b>لن يتضمّنها قبل إعادة بناء الموقع ونشره</b> — حتى لو علّمتها «منشورة».<br>' +
            'أمّا الصور المرفوعة هنا فرابطها العلنيّ يعمل فورًا، ويمكن استخدامه في أي مكان بالرابط.'
          ) +
          '<div class="sub">الوثائق</div>' +
          docFormHtml() +
          U.card('الوثائق المحفوظة',
            docFilterBar() + '<div id="docs-list">' + docTableHtml() + '</div>') +
          '<div class="sub">الوسائط</div>' +
          medFormHtml() +
          U.card('الصور المحفوظة', medGridHtml());
      });
    }
  });

  /* ============================ إجراءات الوثائق ============================ */

  /* ترشيح بلا إعادة تحميل — لئلّا يفقد المستخدم الملف الذي اختاره في الأعلى */
  IAQ.on('docFilter', function (btn) {
    catFilter = btn.getAttribute('data-arg') || '';
    U.$$('#doc-filters .btn').forEach(function (b) {
      var on = ((b.getAttribute('data-arg') || '') === catFilter);
      b.classList.remove(on ? 'ghost' : 'ok');
      b.classList.add(on ? 'ok' : 'ghost');
    });
    var box = U.$('#docs-list');
    if (box) box.innerHTML = docTableHtml();
  });

  IAQ.on('docUp', function () {
    var f = fileOf('#doc-file');
    if (!f) { U.toast('اختر ملف PDF أوّلًا', 'warn'); return; }
    var isPdf = /\.pdf$/i.test(String(f.name || '')) || f.type === 'application/pdf';
    if (!isPdf) { U.toast('الصيغة المقبولة هنا PDF فقط', 'err'); return; }

    var title = val('#doc-title');
    if (!title) { U.toast('عنوان الوثيقة مطلوب', 'warn'); return; }
    var cat = val('#doc-cat');
    if (!catOk(cat)) { U.toast('اختر تصنيفًا صحيحًا', 'err'); return; }

    var dl = val('#doc-dl') || (title + '.pdf');
    if (!/\.pdf$/i.test(dl)) dl += '.pdf';
    var pages = parseInt(val('#doc-pages'), 10);
    if (!isFinite(pages) || pages <= 0) pages = null;

    var path = docPath(cat, f);
    var row = {
      category: cat,
      title: title,
      storage_path: path,
      dl_name: dl,
      doc_date: val('#doc-date') || null,
      size_label: F.bytes(f.size),
      pages: pages,
      status: 'draft'
    };

    U.toast('جارٍ رفع الملف…');
    IAQ.storage.upload(B_DOC, path, f).then(function () {
      /* لا معاملة بين المستودع وقاعدة البيانات: إن فشل الإدخال نُرجع المستودع كما كان */
      return A.insert('documents', row).catch(function (e) {
        return IAQ.storage.remove(B_DOC, [path]).then(
          function (del) {
            throw new Error('رُفع الملف لكن فشل حفظ سجلّه (' + msg(e) + '). ' +
              ((del && del.length)
                ? 'وحُذف الملف المرفوع من المستودع.'
                : 'ولم يُحذف أي ملف من المستودع — تحقّق من المسار: ' + path));
          },
          function () {
            throw new Error('رُفع الملف وفشل حفظ سجلّه (' + msg(e) +
              ') وتعذّر حذف الملف المرفوع. أزله يدويًا: ' + path);
          }
        );
      });
    }).then(function (rows) {
      /* لا نُعلن حفظًا لم نتحقّق منه: مع return=representation الصفّ المحفوظ يُعاد،
         فغياب الصفوف يعني أن السجلّ لم يُحفظ بينما الملف مرفوع فعلًا. */
      if (!rows || !rows.length) {
        throw new Error('رُفع الملف لكن قاعدة البيانات لم تُرجع أي صفّ، فلا يمكن تأكيد حفظ ' +
          'السجلّ. راجع جدول الوثائق، والملف المرفوع مساره: ' + path);
      }
      IAQ.audit('document.create', 'documents', rows[0].id);
      U.toast('حُفظت الوثيقة كمسوّدة — تظهر في الموقع بعد إعادة البناء والنشر');
      IAQ.go('documents');
    }).catch(function (e) {
      U.toast(msg(e), 'err');
    });
  });

  IAQ.on('docOpen', function (btn) {
    var d = byId(docs, btn.getAttribute('data-id'));
    if (!d || !d.storage_path) { U.toast('لا يوجد مسار ملف لهذا السجلّ', 'err'); return; }
    window.open(IAQ.storage.publicUrl(B_DOC, d.storage_path, d.dl_name || ''), '_blank', 'noopener');
  });

  IAQ.on('docToggle', function (btn) {
    var id = btn.getAttribute('data-id');
    var d = byId(docs, id);
    if (!d) { U.toast('السجلّ غير موجود — أعد تحميل الشاشة', 'err'); return; }
    var next = (d.status === 'published') ? 'draft' : 'published';
    A.update('documents', id, { status: next }).then(function (rows) {
      if (!rows || !rows.length) {
        U.toast('لم يتغيّر أي صفّ — قد لا تملك صلاحية التعديل', 'warn');
        return;
      }
      IAQ.audit('document.status.' + next, 'documents', id);
      U.toast(next === 'published'
        ? 'علّمناها منشورة في قاعدة البيانات — تحتاج إعادة بناء لتظهر في الموقع'
        : 'أُرجعت إلى مسوّدة');
      IAQ.go('documents');
    }).catch(function (e) { U.toast(msg(e), 'err'); });
  });

  IAQ.on('docDel', function (btn) {
    var id = btn.getAttribute('data-id');
    var d = byId(docs, id);
    if (!d) { U.toast('السجلّ غير موجود — أعد تحميل الشاشة', 'err'); return; }
    var path = d.storage_path || '';
    var st = { note: '', gone: false };
    U.ask('حذف «' + F.cut(d.title, 40) + '»؟ سيُحذف الملف من المستودع وسجلّه من قاعدة البيانات، ' +
          'ولا يمكن التراجع.', 'حذف نهائي').then(function (ok) {
      if (!ok) return null;
      return delObj(B_DOC, path, st).then(function () {
        return A.remove('documents', id);
      }).then(function (rows) {
        if (!rows || !rows.length) throw new Error(delFailMsg(st, path));
        IAQ.audit('document.delete', 'documents', id);
        U.toast('حُذف سجلّ الوثيقة.' + st.note, st.note ? 'warn' : undefined);
        IAQ.go('documents');
      });
    }).catch(function (e) { U.toast(msg(e), 'err'); });
  });

  /* ============================ إجراءات الوسائط ============================ */
  IAQ.on('medUp', function () {
    var f = fileOf('#med-file');
    if (!f) { U.toast('اختر صورة أوّلًا', 'warn'); return; }
    var path = imgPath(f);
    if (!path) { U.toast('صيغة الصورة غير مدعومة', 'err'); return; }

    var title = val('#med-title') || String(f.name || '');
    var alt = val('#med-alt');
    var row = {
      bucket: B_IMG, storage_path: path, kind: 'image',
      title: title, alt: alt || null, bytes: f.size
    };

    U.toast('جارٍ رفع الصورة…');
    IAQ.storage.upload(B_IMG, path, f).then(function () {
      return A.insert('media', row).catch(function (e) {
        return IAQ.storage.remove(B_IMG, [path]).then(
          function (del) {
            throw new Error('رُفعت الصورة لكن فشل حفظ سجلّها (' + msg(e) + '). ' +
              ((del && del.length)
                ? 'وحُذفت الصورة من المستودع.'
                : 'ولم تُحذف من المستودع — تحقّق من المسار: ' + path));
          },
          function () {
            throw new Error('رُفعت الصورة وفشل حفظ سجلّها (' + msg(e) +
              ') وتعذّر حذفها. أزلها يدويًا: ' + path);
          }
        );
      });
    }).then(function (rows) {
      if (!rows || !rows.length) {
        throw new Error('رُفعت الصورة لكن قاعدة البيانات لم تُرجع أي صفّ، فلا يمكن تأكيد حفظ ' +
          'سجلّها. مسار الصورة في المستودع: ' + path);
      }
      IAQ.audit('media.create', 'media', rows[0].id);
      U.toast('رُفعت الصورة ورابطها العلنيّ جاهز للاستخدام');
      IAQ.go('documents');
    }).catch(function (e) {
      U.toast(msg(e), 'err');
    });
  });

  IAQ.on('medOpen', function (btn) {
    var m = byId(imgs, btn.getAttribute('data-id'));
    if (!m || !m.storage_path) { U.toast('لا يوجد مسار لهذه الصورة', 'err'); return; }
    window.open(IAQ.storage.publicUrl(m.bucket || B_IMG, m.storage_path), '_blank', 'noopener');
  });

  IAQ.on('medCopy', function (btn) {
    var m = byId(imgs, btn.getAttribute('data-id'));
    if (!m || !m.storage_path) { U.toast('لا يوجد مسار لهذه الصورة', 'err'); return; }
    copyText(IAQ.storage.publicUrl(m.bucket || B_IMG, m.storage_path));
  });

  IAQ.on('medDel', function (btn) {
    var id = btn.getAttribute('data-id');
    var m = byId(imgs, id);
    if (!m) { U.toast('السجلّ غير موجود — أعد تحميل الشاشة', 'err'); return; }
    var path = m.storage_path || '';
    var st = { note: '', gone: false };
    U.ask('حذف الصورة «' + F.cut(m.title || m.storage_path || '', 40) + '»؟ ' +
          'أي صفحة تستخدم رابطها ستفقد الصورة.', 'حذف نهائي').then(function (ok) {
      if (!ok) return null;
      return delObj(m.bucket || B_IMG, path, st).then(function () {
        return A.remove('media', id);
      }).then(function (rows) {
        if (!rows || !rows.length) throw new Error(delFailMsg(st, path));
        IAQ.audit('media.delete', 'media', id);
        U.toast('حُذفت الصورة.' + st.note, st.note ? 'warn' : undefined);
        IAQ.go('documents');
      });
    }).catch(function (e) { U.toast(msg(e), 'err'); });
  });
})();
