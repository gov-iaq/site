/* ============================================================================
   قائمة الشركاء — صفوف جدول public.partners: إضافة، تعديل، ترتيب، إخفاء، حذف،
   ورفع شعار إلى مستودع iaq-media.

   حقائق تحقّقتُ منها من مصدر الموقع نفسه، والواجهة تقولها كما هي بلا مبالغة:
   • شريط الشعارات في الصفحة الرئيسة يُبنى وقت التوليد لا وقت العرض:
     src/build.py → render_partners() يقرأ src/data/partners.json ويكتب وسوم
     الصور من مجلّد img/partners/ داخل الصفحة الثابتة.
   • طبقة التشغيل src/templates/iaq-runtime.js تقرأ جدولين فقط:
     settings (is_public) و content_overrides — ولا تقرأ جدول partners إطلاقًا.
     فلا يوجد بناء حيّ للشريط من هذا الجدول اليوم، ولذلك لا نَعِد الزائرَ بشيء:
     ما يُعدَّل هنا يبقى في القاعدة حتى يُحدَّث الملف ويُعاد البناء والنشر.
   • شاشة «شريط الشركاء» (30-partners.js) تضبط نمط الحركة في جدول settings،
     وذلك يُطبَّق حيًّا فعلًا — وهو شيء آخر لا يخصّ محتوى هذه القائمة.
   • مخطّط الجدول (schema-v3): logo و url من نوع text not null default ''،
     فنُرسل نصًّا فارغًا لا null. و sort من نوع int not null default 100.
   • على العمود name فهرس فريد (partners_name_idx) → الاسم المكرّر يرجع 409.
   • مُطلِق partners_touch يحدّث updated_at عند كل تعديل، فلا نرسله من هنا.
   • القراءة الممنوعة بـRLS ترجع 200 ومصفوفة فارغة لا خطأً — نعرض «لا توجد
     بيانات» ولا نُسمّي غياب الصفوف عطلًا.
   • مستودع iaq-media علنيّ القراءة (schema-v2)، فرابط الشعار المرفوع منه يعمل
     فورًا بلا توقيع ولا صلاحية.
   • الشاشة تُعاد بالكامل عند كل رسم، فلا مستمع على عنصر نرسمه: كل زرّ عبر
     data-act، وحقل الملف عبر مستمع واحد على المستند.
   ============================================================================ */
(function () {
  'use strict';

  var U = IAQ.ui, F = IAQ.fmt, A = IAQ.api;

  var KEY = 'partnerlist';
  var TBL = 'partners';
  var BUCKET = 'iaq-media';
  var DIR = 'img/partners/';          // المجلّد الذي تُحلّ فيه الأسماء المجرّدة
  var LIM = 200;

  var STATUS = [
    { v: 'published', t: 'منشور' },
    { v: 'draft', t: 'مسودّة' },
    { v: 'hidden', t: 'مخفي' }
  ];

  /* الصيغ المقبولة للشعار، وخريطة النوع إلى امتداد حين يأتي الملف بلا امتداد */
  var IMG_EXT = { png: 1, jpg: 1, jpeg: 1, webp: 1, gif: 1, svg: 1, avif: 1 };
  var MIME_EXT = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif'
  };

  /* حالة الشاشة داخل الغلاف — لا متغيّر عامّ */
  var mode = 'list';        // 'list' أو 'form'
  var editId = null;        // معرّف الشريك عند التعديل، أو null للإضافة
  var internal = false;     // هل جاء الرسم من تنقّل داخليّ لهذه الوحدة؟
  var busy = false;         // رفع جارٍ — نمنع رفعين متوازيين
  var rows = [];            // آخر ما قُرئ فعلًا من القاعدة (يُستخدم في الترتيب)

  /* ------------------------------- أيقونات ------------------------------- */
  var IC_LIST = '<rect x="3" y="4" width="7" height="7" rx="1.6"/>' +
                '<rect x="14" y="4" width="7" height="7" rx="1.6"/>' +
                '<rect x="3" y="13" width="7" height="7" rx="1.6"/>' +
                '<rect x="14" y="13" width="7" height="7" rx="1.6"/>';
  var IC_EDIT = '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14.5 5.5l4 4"/>';
  var IC_UP   = '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>';
  var IC_DOWN = '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>';
  var IC_PUB  = '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>';
  var IC_HIDE = '<path d="M3 3l18 18"/>' +
                '<path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.8"/>' +
                '<path d="M6.2 7.9A17 17 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 3.4-.6"/>';
  var IC_DEL  = '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>';
  var SVG_UP  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
                'stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M12 16V4M7 9l5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';

  /* ------------------------------ أدوات صغيرة ------------------------------ */

  /* معرّف صحيح موجب أو null — لا نبني استعلامًا بمعرّف لم يُتحقّق منه */
  function toInt(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0 || Math.floor(n) !== n) return null;
    return n;
  }
  function val(sel) {
    var el = U.$(sel);
    return el ? String(el.value == null ? '' : el.value) : '';
  }
  function trimmed(sel) { return val(sel).replace(/^\s+|\s+$/g, ''); }
  function msg(e) { return (e && e.message) ? e.message : 'فشل الإجراء'; }
  function boom(e) { U.toast(msg(e), 'err'); }
  function who() { return (IAQ.me && IAQ.me.email) || null; }

  function statusText(s) {
    for (var i = 0; i < STATUS.length; i++) if (STATUS[i].v === s) return STATUS[i].t;
    return String(s == null ? '—' : s);
  }
  function statusOk(s) {
    for (var i = 0; i < STATUS.length; i++) if (STATUS[i].v === s) return true;
    return false;
  }

  /* الشعار يقبل شكلين: اسم ملف مجرّد يُحلّ على img/partners/، أو رابطًا كاملًا */
  function isUrl(s) { return /^(?:https?:)?\/\//i.test(String(s || '')); }
  function logoSrc(logo) { return isUrl(logo) ? String(logo) : DIR + String(logo); }

  /* اسم لاتينيّ آمن لمفتاح الكائن — الاسم العربيّ يصبح فارغًا بعد التنقية
     فنستعمل بديلًا محايدًا بدل مفتاح مكوّن من نسب مئوية طويلة */
  function asciiSlug(name) {
    var base = String(name == null ? '' : name).replace(/\.[A-Za-z0-9]{1,6}$/, '');
    var s = base.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+/g, '-')
                .replace(/^-/, '').replace(/-$/, '').toLowerCase();
    if (s.length > 48) s = s.slice(0, 48).replace(/-$/, '');
    if (s.length < 2) s = 'logo';
    return s;
  }
  function extOf(f) {
    var m = /\.([A-Za-z0-9]{1,6})$/.exec(String(f.name || ''));
    var e = m ? m[1].toLowerCase() : '';
    if (e === 'jpeg') e = 'jpg';
    if (IMG_EXT[e]) return e;
    return MIME_EXT[String(f.type || '').toLowerCase()] || '';
  }

  function idxOf(id) {
    var s = String(id);
    for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === s) return i;
    return -1;
  }
  /* قيمة ترتيب رقمية أو null. المخطّط يجعل sort not null default 100،
     فالفرع الفارغ دفاعيّ فقط لقاعدة أُنشئت بمخطّط أقدم. */
  function sortOf(r) {
    if (r == null || r.sort == null || r.sort === '') return null;
    var n = Number(r.sort);
    return isFinite(n) ? Math.round(n) : null;
  }

  /* ------------------------- التنبيهات الإلزاميّة ------------------------- */

  /* مدى الوصول — مقروء من مصدر الموقع لا مُفترَض */
  function reachNotice() {
    return U.notice(
      '<b>هذه القائمة تُغيّر قاعدة البيانات، ولا تُغيّر شريط الشركاء في الموقع بعد.</b><br>' +
      'شريط شعارات «شركاء النجاح» في الصفحة الرئيسة يُبنى وقت التوليد من الملف ' +
      '<span class="mono">src/data/partners.json</span> عبر <span class="mono">build.py</span>، ' +
      'وطبقة التشغيل في صفحات الموقع (<span class="mono">src/templates/iaq-runtime.js</span>) ' +
      'تقرأ جدولَي <span class="mono">settings</span> و<span class="mono">content_overrides</span> ' +
      'فقط — ولا تقرأ جدول <span class="mono">partners</span>. لذلك الإضافة والتعديل والإخفاء ' +
      'وإعادة الترتيب والحذف هنا تُغيّر الصفوف وحدها، ولا يراها الزائر قبل تحديث الملف وإعادة ' +
      'البناء والنشر. حين تُربط الطبقة بهذا الجدول سيصل التغيير عند أوّل تحميل صفحة بلا إعادة بناء.'
    );
  }

  /* شكلا حقل الشعار — الشكلان مقبولان فعلًا، والفرق بينهما مذكور صريحًا */
  function logoNotice() {
    return U.notice(
      '<b>حقل الشعار يقبل شكلين، وكلاهما يعمل:</b><br>' +
      '١) <b>اسم ملف مجرّد</b> مثل <span class="mono">alrajhi-foundation.png</span> — يُحلّ على ' +
      '<span class="mono">' + U.esc(DIR) + '</span>، ويجب أن يكون الملف موجودًا فعلًا في ' +
      '<span class="mono">site/img/partners/</span> ضمن الموقع المنشور، وإلا فالمكان يظهر فارغًا.<br>' +
      '٢) <b>رابط كامل</b> يبدأ بـ <span class="mono">https://</span> — مثل الرابط الذي يُنتجه الرفع ' +
      'في نموذج الإضافة: الصورة تُخزَّن في مستودع <span class="mono">iaq-media</span> العلنيّ ' +
      'ويُسجَّل صفّها في جدول <span class="mono">media</span>، فرابطها يعمل فورًا بلا إرفاق ملف ' +
      'بالبناء — لكنه لا يظهر في الشريط قبل ما ذُكر في التنبيه أعلاه.'
    );
  }

  /* السطر الوحيد الذي يشير إلى شاشة نمط الحركة — بلا تكرار لعملها */
  function stripLine() {
    return '<p class="muted small">حركة الشريط نفسها (شريط متصل / تحريك يدوي / تبديل بالتلاشي) ' +
      'وسرعته تُضبطان في شاشة «شريط الشركاء»، لا من هنا. ' +
      '<button class="btn ghost sm" data-act="partnerlist-strip">افتح شريط الشركاء</button></p>';
  }

  /* ------------------------------ شاشة القائمة ------------------------------ */

  function tile(r, i, n) {
    var pub = (r.status === 'published');
    var logo = String(r.logo == null ? '' : r.logo);
    var nm = String(r.name == null ? '' : r.name);

    var img = logo
      ? '<img src="' + U.esc(logoSrc(logo)) + '" alt="' + U.esc(nm) + '" loading="lazy">'
      : '<span class="muted" title="لا شعار في هذا الصفّ">—</span>';

    var acts = '';
    if (!pub) {
      /* بطاقة غير منشورة: لا يقرؤها الزائر (سياسة القراءة العلنية status = published) */
      acts += '<span class="chip" title="الحالة في القاعدة: ' + U.esc(statusText(r.status)) + '">مخفي</span>';
    }
    acts += U.iconBtn('partnerlist-edit', IC_EDIT, { id: r.id, sm: true, label: 'تعديل' });
    if (i > 0) {
      acts += U.iconBtn('partnerlist-move', IC_UP, { id: r.id, arg: 'up', sm: true, label: 'تقديم' });
    }
    if (i < n - 1) {
      acts += U.iconBtn('partnerlist-move', IC_DOWN, { id: r.id, arg: 'down', sm: true, label: 'تأخير' });
    }
    acts += U.iconBtn('partnerlist-toggle', pub ? IC_HIDE : IC_PUB,
      { id: r.id, arg: pub ? 'hidden' : 'published', sm: true,
        label: pub ? 'إخفاء' : 'نشر' });
    acts += U.iconBtn('partnerlist-del', IC_DEL, { id: r.id, sm: true, danger: true, label: 'حذف' });

    return '<div class="media-item"' + (pub ? '' : ' style="opacity:.62"') + '>' +
      '<div class="mi-img">' + img + '</div>' +
      '<div class="mi-name" title="' + U.esc(nm) + '">' +
        U.esc(F.cut(nm, 30) || '(بلا اسم)') + '</div>' +
      '<div class="mi-acts" style="flex-wrap:wrap">' + acts + '</div>' +
      '</div>';
  }

  function gridHtml() {
    var n = rows.length;
    return '<div class="media-grid">' + rows.map(function (r, i) {
      return tile(r, i, n);
    }).join('') + '</div>';
  }

  function renderList(mount) {
    return A.select(TBL, 'select=*&order=sort.asc,id.asc&limit=' + LIM).then(function (rs) {
      rows = rs || [];

      var pubN = 0, i;
      for (i = 0; i < rows.length; i++) if (rows[i].status === 'published') pubN++;

      var body = rows.length ? gridHtml() : U.empty('لا توجد بيانات');
      var foot = '<button class="btn ghost" data-act="partnerlist-reload">إعادة القراءة من القاعدة</button>' +
        '<button class="btn" data-act="partnerlist-new">شريك جديد</button>';

      mount.innerHTML =
        U.head('قائمة الشركاء', 'شعارات شركاء النجاح وأسماؤهم وروابطهم وترتيبهم في جدول partners') +
        reachNotice() + logoNotice() + stripLine() +
        U.card('الشعارات (' + F.num(rows.length) + ')', body, foot) +
        '<p class="muted small">يُعرض حتى ' + F.num(LIM) + ' صفًّا مرتّبة بالعمود ' +
        '<span class="mono">sort</span> تصاعديًّا ثم بالمعرّف. الأعداد المذكورة هي عدد الصفوف ' +
        'المُحمَّلة فعليًا (' + F.num(rows.length) + ' صفًّا، منها ' + F.num(pubN) + ' بحالة «منشور») ' +
        'لا العدد الكلّي في الجدول. الشركاء الجدد يأخذون <span class="mono">sort = 100</span> ' +
        'من إعداد الجدول، فإن تشابهت قيم الترتيب بين صفوف فالأقدم معرّفًا يتقدّم؛ وتحريك أي بطاقة ' +
        'يفرّق القيم تلقائيًّا.</p>';
    });
  }

  /* ------------------------------ شاشة النموذج ------------------------------ */

  function statusSelect(cur) {
    return '<select id="partnerlist-status">' + STATUS.map(function (s) {
      return '<option value="' + U.esc(s.v) + '"' + (cur === s.v ? ' selected' : '') + '>' +
        U.esc(s.t) + '</option>';
    }).join('') + '</select>';
  }

  function prevHtml(logo) {
    if (!logo) return '<span class="muted small">لا شعار محدّد بعد.</span>';
    return '<img src="' + U.esc(logoSrc(logo)) + '" alt="" style="max-height:48px;max-width:130px">' +
      '<span class="mono">' + U.esc(F.cut(logo, 46)) + '</span>';
  }
  function paintPrev(logo) {
    var b = U.$('#partnerlist-prev');
    if (b) b.innerHTML = prevHtml(logo);
  }
  function setUp(html) {
    var b = U.$('#partnerlist-up');
    if (b) b.innerHTML = html || '<span class="muted small">لم يُرفع شعار في هذه الجلسة.</span>';
  }

  /* خطأ داخل النموذج — نصّ عربيّ ظاهر مكان الحدث لا تنبيه عابر وحده */
  function inlineErr(title, detail) {
    var b = U.$('#partnerlist-err');
    if (!b) return;
    b.innerHTML = title
      ? U.notice('<b>' + U.esc(title) + '</b>' + (detail ? '<br>' + U.esc(detail) : ''))
      : '';
  }

  function formHtml(r) {
    r = r || {};
    var isEdit = !!r.id;
    var logo = String(r.logo == null ? '' : r.logo);

    var g1 = '<div class="grid2">' +
      '<div class="fld"><label for="partnerlist-name">اسم الشريك</label>' +
        '<input type="text" id="partnerlist-name" value="' + U.esc(r.name || '') +
        '" placeholder="مؤسسة … الخيرية">' +
        '<span class="muted small">مطلوب. وعلى هذا العمود فهرس فريد في القاعدة، ' +
        'فاسم مستخدم في صفّ آخر يُرفض بتعارض ولا يُحفظ.</span></div>' +
      '<div class="fld"><label for="partnerlist-status">الحالة</label>' +
        statusSelect(statusOk(r.status) ? r.status : 'published') +
        '<span class="muted small">«منشور» وحده يقرؤه الزائر بسياسات الحماية؛ ' +
        '«مسودّة» و«مخفي» يبقيان للمدراء.</span></div>' +
      '</div>';

    var g2 = '<div class="fld"><label for="partnerlist-logo">الشعار — اسم ملف مجرّد أو رابط كامل</label>' +
      '<input type="text" id="partnerlist-logo" value="' + U.esc(logo) +
      '" placeholder="alrajhi-foundation.png" dir="ltr">' +
      '<span class="muted small">اسم مجرّد يُحلّ على <span class="mono">' + U.esc(DIR) +
      '</span>، أو رابط كامل يبدأ بـ <span class="mono">https://</span> ' +
      '(الرفع أدناه يضع الرابط الكامل هنا). اتركه فارغًا فيُخزَّن نصًّا فارغًا ' +
      'وتظهر البطاقة بشُرطة بلا صورة.</span></div>' +
      '<div class="prow" id="partnerlist-prev">' + prevHtml(logo) + '</div>' +
      '<div class="fld"><label for="partnerlist-url">رابط الشريك (اختياري)</label>' +
      '<input type="text" id="partnerlist-url" value="' + U.esc(r.url || '') +
      '" placeholder="https://example.org" dir="ltr">' +
      '<span class="muted small">إن وُضع رابط جُعل الشعار على الموقع وصلة تُفتح في تبويب جديد ' +
      '(<span class="mono">target=_blank rel=noopener</span>)، وإن تُرك فارغًا عُرض الشعار ' +
      'بلا وصلة.</span></div>';

    var up = '<label class="upload big">' + SVG_UP +
        '<span>ارفع صورة شعار من جهازك</span>' +
        '<input type="file" id="partnerlist-file" accept="image/*" hidden>' +
      '</label>' +
      '<div class="prow" id="partnerlist-up"><span class="muted small">لم يُرفع شعار في هذه الجلسة.</span></div>' +
      '<p class="muted small">اختيار الملف يبدأ الرفع فورًا إلى مستودع ' +
      '<span class="mono">' + U.esc(BUCKET) + '</span> على المسار ' +
      '<span class="mono">partners/&lt;الطابع الزمني&gt;-&lt;اسم لاتينيّ&gt;</span>، ثم يُسجَّل ' +
      'صفّ في جدول <span class="mono">media</span>، ثم يُوضع الرابط العلنيّ في حقل الشعار أعلاه. ' +
      'الرفع وحده لا يحفظ الشريك — اضغط الحفظ بعده. الصيغ المقبولة: ' +
      '<span class="mono">png jpg webp gif svg avif</span>.</p>';

    var foot = '<button class="btn ghost" data-act="partnerlist-cancel">إلغاء</button>' +
      '<button class="btn" data-act="partnerlist-save"' +
      (isEdit ? ' data-id="' + U.esc(r.id) + '"' : '') + '>' +
      (isEdit ? 'حفظ التعديلات' : 'إضافة الشريك') + '</button>';

    var meta = isEdit
      ? '<p class="muted small mono">#' + U.esc(r.id) + ' · sort: ' +
        U.esc(r.sort == null ? '—' : String(r.sort)) +
        ' · أُنشئ: ' + U.esc(F.date(r.created_at)) +
        (r.updated_at ? ' · آخر تعديل: ' + U.esc(F.date(r.updated_at)) : '') +
        (r.updated_by ? ' · ' + U.esc(r.updated_by) : '') + '</p>'
      : '<p class="muted small">الترتيب لا يُكتب في هذا النموذج: الصفّ الجديد يأخذ ' +
        '<span class="mono">sort = 100</span> من إعداد الجدول، ثم تُرتّبه بأسهم التقديم ' +
        'والتأخير في القائمة.</p>';

    return U.head(isEdit ? 'تعديل شريك' : 'شريك جديد',
      isEdit ? 'تحديث صفّ موجود في جدول الشركاء' : 'إضافة صفّ جديد إلى جدول الشركاء') +
      reachNotice() + '<div id="partnerlist-err"></div>' + meta +
      U.card(isEdit ? 'بيانات الشريك' : 'بيانات الشريك الجديد', g1 + g2, foot) +
      U.card('رفع شعار إلى المستودع', up) +
      logoNotice();
  }

  function renderForm(mount) {
    if (editId == null) {
      mount.innerHTML = formHtml(null);
      return Promise.resolve();
    }
    var n = toInt(editId);
    if (n == null) {
      /* نُعيد الحالة إلى القائمة كي لا يتحوّل هذا المخرج بصمت إلى نموذج «شريك جديد» */
      editId = null; mode = 'list';
      mount.innerHTML = U.head('تعديل شريك') +
        U.notice('<b>معرّف غير صالح — أُلغي التحميل حمايةً للبيانات.</b><br>' +
          'عد إلى القائمة واختر الشريك من جديد.') +
        '<div class="right"><button class="btn ghost" data-act="partnerlist-cancel">رجوع إلى القائمة</button></div>';
      return Promise.resolve();
    }
    return A.select(TBL, 'select=*&id=eq.' + n + '&limit=1').then(function (rs) {
      if (!rs || !rs.length) {
        editId = null; mode = 'list';
        mount.innerHTML = U.head('تعديل شريك') + U.notice(
          '<b>لم يُعَد أي صفّ بهذا المعرّف (#' + U.esc(n) + ').</b><br>' +
          'قد يكون السجلّ محذوفًا، أو أن سياسات الحماية لا تسمح لحسابك بقراءته — ' +
          'القراءة الممنوعة ترجع نتيجة فارغة لا رسالة خطأ.') +
          '<div class="right"><button class="btn ghost" data-act="partnerlist-cancel">رجوع إلى القائمة</button></div>';
        return;
      }
      mount.innerHTML = formHtml(rs[0]);
    });
  }

  /* تنقّل داخليّ — نُعلم دالة الرسم أن الطلب منّا لا من الشريط الجانبي */
  function goSelf() { internal = true; IAQ.go(KEY); }
  function backToList() { mode = 'list'; editId = null; goSelf(); }

  /* ------------------------------- التسجيل ------------------------------- */

  IAQ.views.register(KEY, {
    label: 'قائمة الشركاء',
    group: 'الموقع',
    icon: IC_LIST,
    render: function (mount) {
      /* الدخول من الشريط الجانبي يعيدنا دائمًا إلى القائمة، لا إلى نموذج قديم */
      var self = internal; internal = false;
      if (mode === 'form' && !self) { mode = 'list'; editId = null; }
      return mode === 'form' ? renderForm(mount) : renderList(mount);
    }
  });

  /* ------------------------------- التنقّل ------------------------------- */

  IAQ.on('partnerlist-strip', function () { IAQ.go('partners'); });
  IAQ.on('partnerlist-reload', function () { mode = 'list'; editId = null; goSelf(); });
  IAQ.on('partnerlist-new', function () { mode = 'form'; editId = null; goSelf(); });
  IAQ.on('partnerlist-edit', function (btn) {
    mode = 'form'; editId = btn.getAttribute('data-id'); goSelf();
  });
  IAQ.on('partnerlist-cancel', function () { backToList(); });

  /* -------------------------------- الحفظ -------------------------------- */

  function saveBoom(e) {
    if (e && e.status === 409) {
      inlineErr('اسم الشريك مستخدم في صفّ آخر.',
        'على العمود name فهرس فريد في قاعدة البيانات، فرُفض الحفظ ولم يتغيّر شيء. ' +
        'غيّر الاسم، أو عد إلى القائمة وعدّل الصفّ الموجود.');
      U.toast('اسم مكرّر — لم يُحفظ شيء', 'err');
      return;
    }
    boom(e);
  }

  IAQ.on('partnerlist-save', function (btn) {
    /* نفرّق بين «لا يوجد معرّف» (إضافة) و«معرّف موجود لكنه غير صالح» (نتوقّف)،
       فبلا هذا التفريق يتحوّل التعديل إلى إضافة صفّ مكرّر بصمت. */
    var id = btn.getAttribute('data-id');
    var n = null;
    if (id != null && id !== '') {
      n = toInt(id);
      if (n == null) { U.toast('معرّف غير صالح — أُلغي الحفظ.', 'err'); return; }
    }

    var name = trimmed('#partnerlist-name');
    if (!name) {
      inlineErr('اسم الشريك مطلوب.',
        'اكتب اسم الشريك كما يظهر في تلميح الشعار على الموقع ثم أعد الحفظ. ' +
        'لم يُكتب شيء في قاعدة البيانات.');
      U.toast('اسم الشريك مطلوب', 'warn');
      return;
    }
    var st = val('#partnerlist-status');
    if (!statusOk(st)) {
      inlineErr('حالة غير معروفة.',
        'القيم المسموحة في القاعدة ثلاث فقط: published و draft و hidden. ' +
        'أعد اختيار الحالة — لم يُحفظ شيء.');
      U.toast('حالة غير معروفة — أُلغي الحفظ', 'err');
      return;
    }
    inlineErr('', '');                       // نمحو خطأ محاولة سابقة

    /* logo و url من نوع text not null default '' — نُرسل نصًّا فارغًا لا null */
    var rec = {
      name: name,
      logo: trimmed('#partnerlist-logo'),
      url: trimmed('#partnerlist-url'),
      status: st,
      updated_by: who()
    };

    if (n != null) {
      /* updated_at يضعه مُطلِق partners_touch — لا نرسله كي لا نكتب وقتًا من المتصفّح */
      A.update(TBL, n, rec).then(function (rs) {
        if (!rs || !rs.length) {
          U.toast('لم يُحدَّث أي صفّ — تحقّق من صلاحياتك أو من وجود السجلّ.', 'warn');
          return;
        }
        return IAQ.audit('partners.update', TBL, n).then(function () {
          U.toast('حُفظت التعديلات في القاعدة — لا تظهر على الموقع قبل إعادة البناء');
          backToList();
        });
      }).catch(saveBoom);
      return;
    }

    A.insert(TBL, rec, '*').then(function (rs) {
      var nid = rs && rs.length ? rs[0].id : null;
      if (nid == null) {
        /* لا نعرف إن نجحت الإضافة: نُبقي النموذج ونحذّر من تكرار الحفظ */
        U.toast('لم يُعَد صفّ جديد — راجع القائمة قبل إعادة الحفظ كي لا يتكرّر الشريك.', 'warn');
        return;
      }
      return IAQ.audit('partners.create', TBL, nid).then(function () {
        U.toast('أُضيف الشريك إلى القاعدة — لا يظهر على الموقع قبل إعادة البناء');
        backToList();
      });
    }).catch(saveBoom);
  });

  /* ------------------------------ النشر والإخفاء ------------------------------ */

  IAQ.on('partnerlist-toggle', function (btn) {
    var n = toInt(btn.getAttribute('data-id'));
    var to = btn.getAttribute('data-arg') === 'published' ? 'published' : 'hidden';
    if (n == null) { U.toast('معرّف غير صالح', 'err'); return; }
    A.update(TBL, n, { status: to, updated_by: who() }).then(function (rs) {
      if (!rs || !rs.length) {
        U.toast('لم يُحدَّث أي صفّ — تحقّق من صلاحياتك.', 'warn');
        return;
      }
      return IAQ.audit(to === 'published' ? 'partners.publish' : 'partners.hide', TBL, n)
        .then(function () {
          U.toast(to === 'published'
            ? 'صار الصفّ منشورًا في القاعدة'
            : 'أُخفي الصفّ في القاعدة');
          mode = 'list'; editId = null; goSelf();
        });
    }).catch(boom);
  });

  /* -------------------------------- الترتيب --------------------------------
     تبديل قيمتَي sort بين بطاقتين متجاورتين بتحديثين متسلسلين. وإذا تساوت
     القيمتان فالتبديل الحرفيّ لا يغيّر شيئًا (الترتيب حينها بالمعرّف)، فنكتب
     قيمة مفرّقة للصفّ المتحرّك وحده ونقول ذلك في التنبيه. */
  IAQ.on('partnerlist-move', function (btn) {
    var n = toInt(btn.getAttribute('data-id'));
    if (n == null) { U.toast('معرّف غير صالح', 'err'); return; }
    var dir = btn.getAttribute('data-arg') === 'up' ? -1 : 1;

    var i = idxOf(n);
    if (i < 0) {
      U.toast('هذا الصفّ لم يعد في القائمة المعروضة — أعد القراءة من القاعدة.', 'warn');
      return;
    }
    var j = i + dir;
    if (j < 0 || j >= rows.length) {
      U.toast(dir < 0 ? 'البطاقة في أوّل القائمة' : 'البطاقة في آخر القائمة', 'warn');
      return;
    }

    var a = rows[i], b = rows[j];
    var sa = sortOf(a), sb = sortOf(b);
    var na, nb;
    if (sa == null || sb == null || sa === sb) {
      var base = (sb == null ? (sa == null ? 100 : sa) : sb);
      na = base + dir;
      nb = null;                             // الجار لا يحتاج كتابة
    } else {
      na = sb; nb = sa;                      // تبديل حقيقيّ للقيمتين
    }

    var w = who();
    A.update(TBL, a.id, { sort: na, updated_by: w }).then(function (r1) {
      if (!r1 || !r1.length) {
        throw new Error('لم يُحدَّث ترتيب «' + F.cut(String(a.name || ''), 30) +
          '» — تحقّق من صلاحية الكتابة. لم يتغيّر شيء.');
      }
      if (nb == null) return null;
      return A.update(TBL, b.id, { sort: nb, updated_by: w }).then(function (r2) {
        if (!r2 || !r2.length) {
          throw new Error('تغيّرت قيمة ترتيب «' + F.cut(String(a.name || ''), 24) +
            '» ولم تتغيّر قيمة «' + F.cut(String(b.name || ''), 24) +
            '»، فالترتيب الآن قد لا يكون كما تتوقّع. أعد القراءة من القاعدة ثم أعد المحاولة.');
        }
        return r2;
      });
    }).then(function () {
      IAQ.audit('partners.reorder', TBL, a.id);
      U.toast('تغيّر الترتيب في القاعدة — لا يظهر على الموقع قبل إعادة البناء');
      mode = 'list'; editId = null; goSelf();
    }).catch(boom);
  });

  /* --------------------------------- الحذف --------------------------------- */

  IAQ.on('partnerlist-del', function (btn) {
    var n = toInt(btn.getAttribute('data-id'));
    if (n == null) { U.toast('معرّف غير صالح', 'err'); return; }
    var i = idxOf(n);
    var nm = i >= 0 ? String(rows[i].name || '') : '';

    U.ask('سيُحذف الشريك ' + (nm ? '«' + F.cut(nm, 40) + '» ' : '') +
      'من قاعدة البيانات نهائيًا. أمّا صورة الشعار في المستودع — إن كانت مرفوعة هنا — ' +
      'فلا تُحذف معه، وتبقى في مكتبة الوسائط. هل تريد المتابعة؟', 'حذف').then(function (ok) {
      if (!ok) return null;
      return A.remove(TBL, n).then(function (rs) {
        if (!rs || !rs.length) {
          U.toast('لم يُحذف أي صفّ — قد لا تملك صلاحية الحذف أو السجلّ غير موجود.', 'warn');
          return;
        }
        return IAQ.audit('partners.delete', TBL, n).then(function () {
          U.toast('تم الحذف من القاعدة — يبقى الشعار في الموقع قبل إعادة البناء');
          mode = 'list'; editId = null; goSelf();
        });
      });
    }).catch(boom);
  });

  /* ------------------------------ رفع الشعار ------------------------------
     لا معاملة (transaction) بين المستودع وقاعدة البيانات: نرفع أوّلًا، وإن فشل
     إدخال صفّ الوسائط أعدنا المستودع كما كان وقلنا بدقّة ما حدث. */
  function startUpload(input) {
    var f = (input.files && input.files.length) ? input.files[0] : null;
    if (!f) return;
    if (busy) { U.toast('هناك رفع جارٍ — انتظر انتهاءه', 'warn'); return; }

    var ext = extOf(f);
    if (!ext) {
      setUp('<span class="muted small">صيغة غير مدعومة — لم يُرفع شيء.</span>');
      U.toast('صيغة الصورة غير مدعومة. المسموح: png, jpg, webp, gif, svg, avif', 'err');
      try { input.value = ''; } catch (e0) { }
      return;
    }

    var path = 'partners/' + Date.now() + '-' + asciiSlug(f.name) + '.' + ext;
    busy = true;

    function done() {
      busy = false;
      try { input.value = ''; } catch (e1) { }   // كي يُطلق اختيار الملف نفسه الحدث مرّة أخرى
    }

    setUp('<span class="small">جارٍ رفع ' + U.esc(F.cut(String(f.name || ''), 40)) + ' …</span>' +
      '<span class="muted small">' + U.esc(F.bytes(f.size)) + '</span>');

    IAQ.storage.upload(BUCKET, path, f).then(function () {
      return A.insert('media', {
        bucket: BUCKET, storage_path: path, kind: 'image',
        title: String(f.name || path), alt: null, bytes: f.size
      }, '*').catch(function (err) {
        return IAQ.storage.remove(BUCKET, [path]).then(
          function (del) {
            throw new Error('رُفع الشعار لكن فشل حفظ سجلّه في جدول الوسائط (' + msg(err) + '). ' +
              ((del && del.length)
                ? 'وحُذف الملف المرفوع من المستودع، فلم يبقَ شيء معلّق.'
                : 'ولم يُحذف أي ملف من المستودع — تحقّق من المسار: ' + path));
          },
          function (e2) {
            throw new Error('رُفع الشعار وفشل حفظ سجلّه (' + msg(err) +
              ')، وتعذّر أيضًا حذف الملف المرفوع (' + msg(e2) + '). المسار: ' + path);
          }
        );
      });
    }).then(function (mrows) {
      if (!mrows || !mrows.length) {
        throw new Error('رُفع الشعار لكن القاعدة لم تُرجع صفّ وسائط، فلا يمكن تأكيد حفظ سجلّه. ' +
          'مسار الملف في المستودع: ' + path);
      }
      IAQ.audit('media.create', 'media', mrows[0].id);
      var url = IAQ.storage.publicUrl(BUCKET, path);
      var fld = U.$('#partnerlist-logo');
      if (!fld) {
        /* غادر المدير النموذج قبل انتهاء الرفع — لا نُخفي الرابط عنه */
        setUp('');
        U.toast('رُفع الشعار لكن حقل الشعار لم يعد معروضًا. الرابط: ' + url, 'warn');
        done();
        return;
      }
      fld.value = url;
      paintPrev(url);
      setUp('<span class="small">رُفع الشعار ووُضع رابطه الكامل في حقل الشعار.</span>' +
        '<span class="mono">' + U.esc(F.cut(url, 48)) + '</span>');
      U.toast('رُفع الشعار — اضغط الحفظ لتثبيت الرابط في صفّ الشريك');
      done();
    }).catch(function (e) {
      setUp('<span class="muted small">تعذّر الرفع — لم يتغيّر حقل الشعار.</span>');
      U.toast(msg(e), 'err');
      done();
    });
  }

  /* مستمع واحد على المستند: الشاشة تُعاد بالكامل، فلا نربط شيئًا بعنصر نرسمه */
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t || !t.tagName || String(t.tagName).toLowerCase() !== 'input') return;
    if (t.type !== 'file' || t.id !== 'partnerlist-file') return;
    startUpload(t);
  });

})();
