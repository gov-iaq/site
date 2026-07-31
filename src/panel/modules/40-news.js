/* ============================================================================
   وحدة الأخبار — إدارة كاملة لجدول public.news (إضافة، تعديل، نشر، حذف).

   ملاحظات مثبَّتة تخصّ هذا الجدول:
   • body عمود text[] — نُرسل مصفوفة JS حقيقية من النصوص (سطر = فقرة).
   • facts عمود jsonb — نُرسله مصفوفة كائنات {label, value}. عند القراءة قد يأتي
     null أو [] أو (في بيانات الموقع القديمة) مصفوفة أزواج [التسمية, القيمة]،
     والثلاثة مُعالَجة هنا.
   • القراءة الممنوعة بـRLS ترجع 200 ومصفوفة فارغة — لذلك لا نُسمّي غياب الصفوف
     خطأً، بل نعرض «لا توجد بيانات».
   • الحذف يمرّ عبر IAQ.api.remove (يتحقّق من المعرّف) وبعد تأكيد IAQ.ui.ask.
   • صفحة الأخبار في الموقع صفحة ثابتة تُبنى من src/data/news.json، فأيّ صفّ هنا
     لا يظهر للزوّار إلا بعد إعادة البناء والنشر — وهذا مُصرَّح به في الواجهة.
   ============================================================================ */
(function () {
  'use strict';

  var U = IAQ.ui, F = IAQ.fmt, A = IAQ.api;
  var KEY = 'news';

  /* حالة الشاشة داخل الوحدة — تُقرأ عند كل رسم لأن الشاشة تُعاد بالكامل */
  var mode = 'list';        // 'list' أو 'form'
  var flt = 'all';          // 'all' أو 'published' أو 'draft'
  var editId = null;        // معرّف الخبر عند التعديل، أو null للإضافة
  var internal = false;     // هل جاء الرسم من تنقّل داخليّ لهذه الوحدة؟

  var STATUS = [
    { v: 'draft', t: 'مسودّة' },
    { v: 'published', t: 'منشور' }
  ];

  var IC_EDIT = '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14.5 5.5l4 4"/>';
  var IC_UP = '<path d="M12 16V6"/><path d="M8 10l4-4 4 4"/><path d="M5 19h14"/>';
  var IC_DOWN = '<path d="M12 6v10"/><path d="M8 12l4 4 4-4"/><path d="M5 19h14"/>';
  var IC_DEL = '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/>';
  var IC_EYE = '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>';

  /* --------------------------- أدوات مساعدة صغيرة --------------------------- */

  /* معرّف صحيح موجب أو null — نتحقّق قبل بناء أي استعلام يحمل معرّفًا */
  function toInt(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0 || Math.floor(n) !== n) return null;
    return n;
  }

  /* تاريخ بصيغة YYYY-MM-DD صالحة لحقل input[type=date] بلا انزلاق منطقة زمنية.
     يُعيد '' إن تعذّر التحليل — لأن قيمة غير قياسية في input[type=date] يتجاهلها
     المتصفّح بصمت (F.day تُعيد النصّ كما هو عند فشل التحليل). */
  function ymd(v) {
    if (!v) return '';
    var s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var d = F.day(s);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  }

  /* للعرض فقط: لا نُخفي قيمة غير قياسية، نُظهرها كما جاءت من القاعدة */
  function dateText(v) {
    if (v == null || v === '') return '—';
    return ymd(v) || String(v);
  }

  function val(sel) {
    var el = U.$(sel);
    return el ? String(el.value == null ? '' : el.value) : '';
  }
  function trimmed(sel) { return val(sel).replace(/^\s+|\s+$/g, ''); }
  function orNull(s) { return s ? s : null; }

  function statusText(s) { return s === 'published' ? 'منشور' : 'مسودّة'; }
  function statusBadge(s) {
    return '<span class="stbadge ' + (s === 'published' ? 'rp' : 'nw') + '">' +
      U.esc(statusText(s)) + '</span>';
  }

  /* نصّ متعدّد الأسطر ← مصفوفة نصوص (عمود body من نوع text[]) */
  function linesToArray(t) {
    var parts = String(t || '').split(/\r?\n/), out = [], i, s;
    for (i = 0; i < parts.length; i++) {
      s = parts[i].replace(/^\s+|\s+$/g, '');
      if (s) out.push(s);
    }
    return out;
  }
  function arrayToLines(v) {
    if (v == null) return '';
    if (Object.prototype.toString.call(v) === '[object Array]') return v.join('\n');
    return String(v);
  }

  /* facts: من قاعدة البيانات ← أسطر «التسمية | القيمة» */
  function factsToLines(f) {
    if (!f || Object.prototype.toString.call(f) !== '[object Array]' || !f.length) return '';
    var out = [], i, it, l, v;
    for (i = 0; i < f.length; i++) {
      it = f[i];
      if (it == null) continue;
      l = ''; v = '';
      if (Object.prototype.toString.call(it) === '[object Array]') {
        l = it[0]; v = it[1];                       // شكل قديم: زوج [تسمية, قيمة]
      } else if (typeof it === 'object') {
        l = it.label; v = it.value;
      } else {
        l = it;
      }
      out.push(String(l == null ? '' : l) + ' | ' + String(v == null ? '' : v));
    }
    return out.join('\n');
  }
  /* أسطر «التسمية | القيمة» ← مصفوفة كائنات jsonb */
  function linesToFacts(t) {
    var parts = String(t || '').split(/\r?\n/), out = [], i, s, p;
    for (i = 0; i < parts.length; i++) {
      s = parts[i].replace(/^\s+|\s+$/g, '');
      if (!s) continue;
      p = s.indexOf('|');
      if (p < 0) out.push({ label: s, value: '' });
      else out.push({
        label: s.slice(0, p).replace(/^\s+|\s+$/g, ''),
        value: s.slice(p + 1).replace(/^\s+|\s+$/g, '')
      });
    }
    return out;
  }

  function boom(e) { U.toast((e && e.message) || 'فشل الإجراء', 'err'); }

  /* التنبيه الإلزاميّ: القاعدة ليست هي الموقع */
  function staticNotice() {
    return U.notice(
      '<b>هذه السجلّات تُخزَّن في قاعدة البيانات، ولا تظهر على الموقع فورًا.</b><br>' +
      'صفحة الأخبار في الموقع صفحة HTML ثابتة تُبنى من الملف <span class="mono">src/data/news.json</span> ' +
      'عبر <span class="mono">build.py</span>. إضافة خبر أو تعديله أو نشره هنا يغيّر القاعدة فقط، ' +
      'ويظهر للزوّار بعد إعادة البناء والنشر التاليَين. لا يوجد حتى الآن ربط تلقائي بين الجدول والملف.'
    );
  }

  /* ------------------------------ شاشة القائمة ------------------------------ */

  function fltBtn(v, t) {
    return '<button class="btn sm' + (flt === v ? ' ok' : '') + '" data-act="news-flt" data-arg="' +
      U.esc(v) + '">' + U.esc(t) + '</button>';
  }

  function renderList(mount) {
    var q = 'select=*&order=date.desc,id.desc&limit=100';
    if (flt === 'published' || flt === 'draft') q += '&status=eq.' + flt;

    return A.select('news', q).then(function (rows) {
      rows = rows || [];

      var bar = '<div class="filterbar">' +
        fltBtn('all', 'الكل') + fltBtn('published', 'منشور') + fltBtn('draft', 'مسودّة') +
        '</div>';

      var body;
      if (!rows.length) {
        body = U.empty(flt === 'all'
          ? 'لا توجد بيانات'
          : 'لا توجد بيانات بهذا التصنيف');
      } else {
        body = U.table(
          ['التاريخ', 'العنوان', 'التصنيف', 'الحالة', 'إجراءات'],
          rows.map(function (r) {
            var pub = r.status === 'published';
            var acts = '<div class="acts">' +
              U.iconBtn('news-view', IC_EYE, { id: r.id, sm: true, label: 'استعراض' }) +
              U.iconBtn('news-edit', IC_EDIT, { id: r.id, sm: true, label: 'تعديل' }) +
              U.iconBtn('news-toggle', pub ? IC_DOWN : IC_UP,
                { id: r.id, arg: pub ? 'draft' : 'published', sm: true,
                  label: pub ? 'إرجاع إلى مسودّة' : 'نشر' }) +
              U.iconBtn('news-del', IC_DEL, { id: r.id, sm: true, danger: true, label: 'حذف' }) +
              '</div>';
            return [
              '<span class="mono small">' + U.esc(dateText(r.date)) + '</span>',
              '<b>' + U.esc(F.cut(r.title, 72) || '(بلا عنوان)') + '</b>' +
                (r.lead ? '<br><span class="muted small">' + U.esc(F.cut(r.lead, 90)) + '</span>' : ''),
              r.tag ? '<span class="chip">' + U.esc(r.tag) + '</span>' : '<span class="muted">—</span>',
              statusBadge(r.status),
              acts
            ];
          })
        );
      }

      var foot = '<button class="btn" data-act="news-new">خبر جديد</button>';

      mount.innerHTML =
        U.head('الأخبار', 'إدارة أخبار الجمعية المخزَّنة في قاعدة البيانات') +
        staticNotice() + bar +
        U.card('السجلّات (' + F.num(rows.length) + ')', body, foot) +
        '<p class="muted small">يُعرض حتى 100 سجلّ مرتّبة من الأحدث تاريخًا. ' +
        'العدد أعلاه هو عدد الصفوف المُحمَّلة فعليًا، لا العدد الكلّي في الجدول.</p>';
    });
  }

  /* ------------------------------ شاشة النموذج ------------------------------ */

  function statusSelect(cur) {
    return '<select id="news-status">' + STATUS.map(function (s) {
      return '<option value="' + U.esc(s.v) + '"' + (cur === s.v ? ' selected' : '') + '>' +
        U.esc(s.t) + '</option>';
    }).join('') + '</select>';
  }

  function formHtml(r) {
    r = r || {};
    var isEdit = !!r.id;

    var g1 = '<div class="grid2">' +
      '<div class="fld"><label for="news-date">التاريخ</label>' +
        '<input type="date" id="news-date" value="' + U.esc(ymd(r.date)) + '"></div>' +
      '<div class="fld"><label for="news-tag">التصنيف</label>' +
        '<input type="text" id="news-tag" value="' + U.esc(r.tag || (isEdit ? '' : 'أخبار')) +
        '" placeholder="أخبار"></div>' +
      '</div>';

    var g2 = '<div class="fld"><label for="news-title">العنوان</label>' +
      '<input type="text" id="news-title" value="' + U.esc(r.title || '') +
      '" placeholder="عنوان الخبر"></div>' +
      '<div class="fld"><label for="news-lead">المقدّمة</label>' +
      '<textarea id="news-lead" placeholder="سطر تعريفي قصير يظهر تحت العنوان">' +
      U.esc(r.lead || '') + '</textarea></div>' +
      '<div class="fld"><label for="news-body">النصّ — فقرة في كل سطر</label>' +
      '<textarea id="news-body" style="min-height:200px" placeholder="فقرة أولى&#10;فقرة ثانية">' +
      U.esc(arrayToLines(r.body)) + '</textarea>' +
      '<span class="muted small">كل سطر يُخزَّن فقرة مستقلّة في العمود body، والأسطر الفارغة تُحذف.</span></div>' +
      '<div class="fld"><label for="news-facts">حقائق سريعة — سطر لكل عنصر بصيغة: التسمية | القيمة</label>' +
      '<textarea id="news-facts" placeholder="المدرب | اسم المدرب&#10;المدة | 5 أيام">' +
      U.esc(factsToLines(r.facts)) + '</textarea>' +
      '<span class="muted small">اتركه فارغًا إن لم تكن هناك حقائق؛ يُخزَّن حينها مصفوفة فارغة.</span></div>';

    var g3 = '<div class="grid2">' +
      '<div class="fld"><label for="news-cta_label">نصّ زرّ الإجراء</label>' +
        '<input type="text" id="news-cta_label" value="' + U.esc(r.cta_label || '') +
        '" placeholder="سجّل الآن"></div>' +
      '<div class="fld"><label for="news-cta_url">رابط زرّ الإجراء</label>' +
        '<input type="text" id="news-cta_url" value="' + U.esc(r.cta_url || '') +
        '" placeholder="https://…" dir="ltr"></div>' +
      '</div>' +
      '<div class="grid2">' +
      '<div class="fld"><label for="news-image">اسم ملف الصورة</label>' +
        '<input type="text" id="news-image" value="' + U.esc(r.image || '') +
        '" placeholder="tot.jpg" dir="ltr">' +
        '<span class="muted small">اسم الملف فقط كما هو في مجلّد صور الأخبار داخل الموقع. ' +
        'هذه الوحدة لا ترفع صورًا.</span></div>' +
      '<div class="fld"><label for="news-status">الحالة</label>' + statusSelect(r.status || 'draft') +
        '</div>' +
      '</div>';

    var foot = '<button class="btn ghost" data-act="news-cancel">إلغاء</button>' +
      '<button class="btn" data-act="news-save"' + (isEdit ? ' data-id="' + U.esc(r.id) + '"' : '') + '>' +
      (isEdit ? 'حفظ التعديلات' : 'إضافة الخبر') + '</button>';

    var meta = isEdit
      ? '<p class="muted small mono">#' + U.esc(r.id) + ' · أُنشئ: ' + U.esc(F.date(r.created_at)) +
        (r.updated_at ? ' · آخر تعديل: ' + U.esc(F.date(r.updated_at)) : '') + '</p>'
      : '';

    return U.head(isEdit ? 'تعديل خبر' : 'خبر جديد',
      isEdit ? 'تحديث سجلّ موجود في جدول الأخبار' : 'إضافة سجلّ جديد إلى جدول الأخبار') +
      staticNotice() + meta +
      U.card(isEdit ? 'بيانات الخبر' : 'بيانات الخبر الجديد', g1 + g2 + g3, foot);
  }

  function renderForm(mount) {
    if (editId == null) {
      mount.innerHTML = formHtml(null);
      return Promise.resolve();
    }
    var n = toInt(editId);
    if (n == null) {
      // نُعيد الحالة إلى القائمة كي لا يتحوّل هذا المخرج بصمت إلى نموذج «خبر جديد»
      editId = null; mode = 'list';
      mount.innerHTML = U.head('تعديل خبر') +
        U.notice('<b>معرّف غير صالح — أُلغي التحميل حمايةً للبيانات.</b><br>' +
          'عد إلى القائمة واختر الخبر من جديد.') +
        '<div class="right"><button class="btn ghost" data-act="news-cancel">رجوع إلى القائمة</button></div>';
      return Promise.resolve();
    }
    return A.select('news', 'select=*&id=eq.' + n + '&limit=1').then(function (rows) {
      if (!rows || !rows.length) {
        editId = null; mode = 'list';
        mount.innerHTML = U.head('تعديل خبر') + U.notice(
          '<b>لم يُعَد أي صفّ بهذا المعرّف (#' + U.esc(n) + ').</b><br>' +
          'قد يكون السجلّ محذوفًا، أو أن سياسات الحماية لا تسمح لحسابك بقراءته — ' +
          'القراءة الممنوعة ترجع نتيجة فارغة لا رسالة خطأ.') +
          '<div class="right"><button class="btn ghost" data-act="news-cancel">رجوع إلى القائمة</button></div>';
        return;
      }
      mount.innerHTML = formHtml(rows[0]);
    });
  }

  /* -------------------------- قراءة النموذج وحفظه -------------------------- */

  function collect() {
    var title = trimmed('#news-title');
    var date = trimmed('#news-date');
    if (!title) { U.toast('العنوان مطلوب', 'warn'); return null; }
    if (!date) { U.toast('التاريخ مطلوب', 'warn'); return null; }
    return {
      date: date,
      tag: orNull(trimmed('#news-tag')),
      title: title,
      lead: orNull(trimmed('#news-lead')),
      body: linesToArray(val('#news-body')),
      facts: linesToFacts(val('#news-facts')),
      cta_label: orNull(trimmed('#news-cta_label')),
      cta_url: orNull(trimmed('#news-cta_url')),
      image: orNull(trimmed('#news-image')),
      status: val('#news-status') === 'published' ? 'published' : 'draft'
    };
  }

  /* تنقّل داخليّ — نُعلم دالة الرسم أن الطلب منّا لا من الشريط الجانبي */
  function goSelf() { internal = true; IAQ.go(KEY); }

  function backToList() {
    mode = 'list'; editId = null; goSelf();
  }

  /* ------------------------------- التسجيل ------------------------------- */

  IAQ.views.register(KEY, {
    label: 'الأخبار',
    group: 'المحتوى',
    icon: '<path d="M4 5h11a1 1 0 0 1 1 1v13H5a1 1 0 0 1-1-1V5z"/>' +
          '<path d="M16 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3"/>' +
          '<path d="M7 9h6M7 12h6M7 15h4"/>',
    render: function (mount) {
      // الدخول من الشريط الجانبي يعيدنا دائمًا إلى القائمة، لا إلى نموذج قديم
      var self = internal; internal = false;
      if (mode === 'form' && !self) { mode = 'list'; editId = null; }
      return mode === 'form' ? renderForm(mount) : renderList(mount);
    }
  });

  IAQ.on('news-flt', function (btn) {
    flt = btn.getAttribute('data-arg') || 'all';
    mode = 'list'; editId = null;
    goSelf();
  });

  IAQ.on('news-new', function () {
    mode = 'form'; editId = null; goSelf();
  });

  IAQ.on('news-edit', function (btn) {
    mode = 'form'; editId = btn.getAttribute('data-id'); goSelf();
  });

  IAQ.on('news-cancel', function () { backToList(); });

  /* استعراض سريع في اللوح الجانبي — قراءة فقط */
  IAQ.on('news-view', function (btn) {
    var n = toInt(btn.getAttribute('data-id'));
    if (n == null) { U.toast('معرّف غير صالح', 'err'); return; }
    A.select('news', 'select=*&id=eq.' + n + '&limit=1').then(function (rows) {
      if (!rows || !rows.length) {
        U.toast('لم يُعَد أي صفّ بهذا المعرّف', 'warn');
        return;
      }
      var r = rows[0];
      var paras = Object.prototype.toString.call(r.body) === '[object Array]' ? r.body : [];
      var fl = factsToLines(r.facts);
      var h = '<div class="sub-meta">' +
        '<div class="kv"><span>التاريخ</span><b>' + U.esc(dateText(r.date)) + '</b></div>' +
        '<div class="kv"><span>التصنيف</span><b>' + U.esc(r.tag || '—') + '</b></div>' +
        '<div class="kv"><span>الحالة</span><b>' + U.esc(statusText(r.status)) + '</b></div>' +
        '<div class="kv"><span>الصورة</span><b>' + U.esc(r.image || '—') + '</b></div>' +
        '</div>';
      if (r.lead) {
        h += '<div class="sub-msg"><div class="sm-label">المقدّمة</div><p>' + U.esc(r.lead) + '</p></div>';
      }
      h += '<div class="drawer-sec"><h4>النصّ (' + F.num(paras.length) + ' فقرة)</h4>' +
        (paras.length
          ? paras.map(function (p) { return '<p class="small">' + U.esc(p) + '</p>'; }).join('')
          : '<p class="muted small">لا يوجد نصّ.</p>') + '</div>';
      h += '<div class="drawer-sec"><h4>حقائق سريعة</h4>' +
        (fl
          ? '<div class="mono small" style="white-space:pre-wrap">' + U.esc(fl) + '</div>'
          : '<p class="muted small">لا توجد حقائق.</p>') + '</div>';
      h += '<div class="drawer-sec"><h4>زرّ الإجراء</h4><p class="small">' +
        (r.cta_label || r.cta_url
          ? U.esc(r.cta_label || '(بلا نصّ)') + ' — <span class="mono" dir="ltr">' +
            U.esc(r.cta_url || '(بلا رابط)') + '</span>'
          : '<span class="muted">غير مُحدَّد.</span>') + '</p></div>';
      h += '<div class="drawer-sec"><h4>ظهور الخبر على الموقع</h4>' +
        '<p class="small muted">هذا السجلّ في قاعدة البيانات. صفحة الأخبار في الموقع ثابتة وتُبنى من ' +
        'src/data/news.json، فلن يراه الزوّار قبل إعادة البناء والنشر.</p></div>';
      U.drawer(F.cut(r.title || 'خبر', 60), h);
    }).catch(boom);
  });

  IAQ.on('news-save', function (btn) {
    // نفرّق بين «لا يوجد معرّف» (إضافة) و«معرّف موجود لكنه غير صالح» (نتوقّف).
    // بلا هذا التفريق يتحوّل التعديل إلى إضافة صفّ مكرّر بصمت.
    var id = btn.getAttribute('data-id');
    var n = null;
    if (id != null && id !== '') {
      n = toInt(id);
      if (n == null) { U.toast('معرّف غير صالح — أُلغي الحفظ.', 'err'); return; }
    }

    var rec = collect();
    if (!rec) return;

    if (n != null) {
      rec.updated_at = new Date().toISOString();
      A.update('news', n, rec).then(function (rows) {
        if (!rows || !rows.length) {
          U.toast('لم يُحدَّث أي صفّ — تحقّق من صلاحياتك أو من وجود السجلّ.', 'warn');
          return;
        }
        return IAQ.audit('news.update', 'news', n).then(function () {
          U.toast('تم الحفظ');
          backToList();
        });
      }).catch(boom);
      return;
    }

    A.insert('news', rec, '*').then(function (rows) {
      var nid = rows && rows.length ? rows[0].id : null;
      if (nid == null) {
        // لا نعرف إن نجحت الإضافة: نُبقي النموذج كما هو ونحذّر من تكرار الحفظ
        U.toast('لم يُعَد سجلّ جديد — راجع القائمة قبل إعادة الحفظ كي لا يتكرّر الخبر.', 'warn');
        return;
      }
      return IAQ.audit('news.create', 'news', nid).then(function () {
        U.toast('تمت إضافة الخبر — لن يظهر على الموقع قبل إعادة البناء');
        backToList();
      });
    }).catch(boom);
  });

  IAQ.on('news-toggle', function (btn) {
    var n = toInt(btn.getAttribute('data-id'));
    var to = btn.getAttribute('data-arg') === 'published' ? 'published' : 'draft';
    if (n == null) { U.toast('معرّف غير صالح', 'err'); return; }
    A.update('news', n, { status: to, updated_at: new Date().toISOString() }).then(function (rows) {
      if (!rows || !rows.length) {
        U.toast('لم يُحدَّث أي صفّ — تحقّق من صلاحياتك.', 'warn');
        return;
      }
      return IAQ.audit(to === 'published' ? 'news.publish' : 'news.unpublish', 'news', n)
        .then(function () {
          U.toast(to === 'published'
            ? 'صار السجلّ منشورًا في القاعدة — يظهر على الموقع بعد إعادة البناء'
            : 'أُرجع السجلّ إلى مسودّة');
          IAQ.go(KEY);
        });
    }).catch(boom);
  });

  IAQ.on('news-del', function (btn) {
    var n = toInt(btn.getAttribute('data-id'));
    if (n == null) { U.toast('معرّف غير صالح', 'err'); return; }
    U.ask('سيُحذف هذا الخبر من قاعدة البيانات نهائيًا. هل تريد المتابعة؟', 'حذف').then(function (ok) {
      if (!ok) return;
      return A.remove('news', n).then(function (rows) {
        if (!rows || !rows.length) {
          U.toast('لم يُحذف أي صفّ — قد لا تملك صلاحية الحذف أو السجلّ غير موجود.', 'warn');
          return;
        }
        return IAQ.audit('news.delete', 'news', n).then(function () {
          U.toast('تم الحذف');
          mode = 'list'; editId = null;
          IAQ.go(KEY);
        });
      });
    }).catch(boom);
  });

})();
