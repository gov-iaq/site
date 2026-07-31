/* ============================================================================
   إدارة البيانات — صفحة واحدة تتحكّم بكل جداول الموقع.

   مسار كود واحد لكل الجداول: جدول واحد يُرسم، ودالة حفظ واحدة، ودالة حذف
   واحدة، وسجلّ أعمدة يوصف فيه كل جدول. فأيّ عيب يُصلح مرّة واحدة لا إحدى
   عشرة مرّة، وهذا سبب استبدال الشاشات المنفصلة بهذه.

   قواعد ثابتة هنا:
   • كل الحقول قابلة للتحرير مباشرةً في الجدول — لا نقر ثم تحويل.
   • الترتيب يُضبط بكتابة رقم في عمود «الترتيب»، لا بأزرار أعلى/أسفل:
     أزرار الإزاحة تُفسد القيم عند تساويها، والرقم المباشر لا يُفسد شيئًا.
   • كل خطأ يُكتب في لوحة ثابتة أعلى الجدول ولا يختفي، مع اسم الجدول
     والإجراء ونصّ الخدمة. لا رسائل عابرة تضيع قبل أن تُقرأ.
   ============================================================================ */
(function () {
  'use strict';
  var U = IAQ.ui, F = IAQ.fmt, A = IAQ.api;
  var KEY = 'data';

  /* ------------------------------ أنواع الحقول ------------------------------
     text | area | int | select | json (jsonb) | lines (text[]) | facts | ro   */

  var ST_PUB = { published: 'ظاهر', hidden: 'مخفي', draft: 'مسودّة' };
  var ST_NEWS = { published: 'منشور', draft: 'مسودّة' };

  var TABLES = [
    {
      id: 'people', label: 'الأعضاء والفريق', mode: 'crud',
      order: 'grp.asc,sort.asc,id.asc',
      reach: 'يظهر للزائر في أوّل تحميل للصفحة، بلا إعادة بناء.',
      cols: [
        { k: 'grp', l: 'المجموعة', t: 'select', o: { assembly: 'الجمعية العمومية', board: 'مجلس الإدارة', team: 'فريق العمل' }, req: 1, w: 128 },
        { k: 'title', l: 'اللقب', t: 'text', w: 58 },
        { k: 'name', l: 'الاسم', t: 'text', req: 1, w: 196 },
        { k: 'role', l: 'المنصب', t: 'text', w: 140 },
        { k: 'rank', l: 'الرتبة', t: 'select', o: { chair: 'رئيس', vice: 'نائب الرئيس', lead: 'مدير تنفيذي', member: 'عضو' }, w: 118 },
        { k: 'cat', l: 'التصنيف', t: 'select', o: { '': '—', founder: 'مؤسس', working: 'عامل' }, w: 96 },
        { k: 'phone', l: 'الجوال', t: 'text', w: 112 },
        { k: 'email', l: 'البريد', t: 'text', w: 158 },
        { k: 'photo', l: 'الصورة', t: 'text', w: 116, hint: 'اسم الملف داخل img/board أو img/team' },
        { k: 'sort', l: 'الترتيب', t: 'int', w: 74 },
        { k: 'status', l: 'الحالة', t: 'select', o: ST_PUB, w: 92 }
      ]
    },
    {
      id: 'news', label: 'الأخبار', mode: 'crud', order: 'date.desc,id.desc',
      reach: 'يُخزَّن في القاعدة. صفحة الأخبار مبنيّة ثابتًا، فلا يظهر الجديد قبل إعادة البناء والنشر.',
      cols: [
        { k: 'date', l: 'التاريخ', t: 'text', req: 1, w: 106, hint: 'YYYY-MM-DD' },
        { k: 'tag', l: 'التصنيف', t: 'text', w: 94 },
        { k: 'title', l: 'العنوان', t: 'text', req: 1, w: 230 },
        { k: 'lead', l: 'المقدّمة', t: 'area', w: 210 },
        { k: 'body', l: 'الفقرات', t: 'lines', w: 230, hint: 'فقرة في كل سطر' },
        { k: 'facts', l: 'حقائق', t: 'facts', w: 190, hint: 'العنوان | القيمة في كل سطر' },
        { k: 'image', l: 'الصورة', t: 'text', w: 130 },
        { k: 'cta_label', l: 'نصّ الزرّ', t: 'text', w: 110 },
        { k: 'cta_url', l: 'رابط الزرّ', t: 'text', w: 150 },
        { k: 'status', l: 'الحالة', t: 'select', o: ST_NEWS, w: 92 }
      ]
    },
    {
      id: 'partners', label: 'الشركاء', mode: 'crud', order: 'sort.asc,id.asc',
      reach: 'شريط الشركاء في الرئيسة يُبنى من هذا الجدول عند أوّل تحميل، بلا إعادة بناء.',
      cols: [
        { k: 'name', l: 'الاسم', t: 'text', req: 1, w: 240 },
        { k: 'logo', l: 'الشعار', t: 'text', w: 230, hint: 'اسم ملف في img/partners أو رابط كامل' },
        { k: 'url', l: 'الرابط', t: 'text', w: 190 },
        { k: 'sort', l: 'الترتيب', t: 'int', w: 74 },
        { k: 'status', l: 'الحالة', t: 'select', o: ST_PUB, w: 92 }
      ]
    },
    {
      id: 'documents', label: 'الوثائق', mode: 'crud', order: 'category.asc,id.desc',
      reach: 'سجلّ الوثيقة فقط. قوائم التحميل في الموقع مبنيّة ثابتًا، فتحتاج إعادة بناء.',
      cols: [
        { k: 'category', l: 'التصنيف', t: 'select', req: 1, w: 150,
          o: { policies: 'السياسات واللوائح', minutes: 'محاضر الاجتماعات', financials: 'التقارير المالية', annual: 'التقارير السنوية', licenses: 'التراخيص', surveys: 'الاستبيانات' } },
        { k: 'title', l: 'العنوان', t: 'text', req: 1, w: 250 },
        { k: 'storage_path', l: 'مسار الملف', t: 'text', req: 1, w: 220 },
        { k: 'dl_name', l: 'اسم التحميل', t: 'text', w: 180 },
        { k: 'doc_date', l: 'التاريخ', t: 'text', w: 150 },
        { k: 'size_label', l: 'الحجم', t: 'text', w: 90 },
        { k: 'pages', l: 'الصفحات', t: 'int', w: 74 },
        { k: 'status', l: 'الحالة', t: 'select', o: ST_NEWS, w: 92 }
      ]
    },
    {
      id: 'settings', label: 'الإعدادات', mode: 'crud', order: 'key.asc', pk: 'key',
      reach: 'تُقرأ من صفحات الموقع عند العرض. «علنيّ» يعني أنّ الزائر يقرؤها.',
      cols: [
        { k: 'key', l: 'المفتاح', t: 'text', req: 1, w: 190, mono: 1 },
        { k: 'value', l: 'القيمة', t: 'json', req: 1, w: 200, hint: 'قيمة JSON: "نصّ" أو 34 أو true' },
        { k: 'label', l: 'الوصف', t: 'text', w: 260 },
        { k: 'is_public', l: 'علنيّ', t: 'select', o: { 'true': 'نعم', 'false': 'لا' }, w: 84 }
      ]
    },
    {
      id: 'content_overrides', label: 'تعديلات النصوص', mode: 'del', order: 'id.desc',
      reach: 'تعديلات المحرّر المرئي. الحذف هنا يُرجع النصّ الأصليّ المبنيّ في الصفحة.',
      cols: [
        { k: 'page', l: 'الصفحة', t: 'ro', w: 100 },
        { k: 'op', l: 'النوع', t: 'ro', w: 80 },
        { k: 'orig_text', l: 'الأصل', t: 'ro', w: 220 },
        { k: 'value', l: 'الجديد', t: 'area', w: 240 },
        { k: 'path', l: 'المسار', t: 'ro', w: 220, mono: 1 },
        { k: 'status', l: 'الحالة', t: 'select', o: ST_NEWS, w: 92 }
      ]
    },
    {
      id: 'submissions', label: 'الطلبات والرسائل', mode: 'del', order: 'created_at.desc',
      reach: 'الوارد من نماذج الموقع. لا تُرسل الردود من هنا — الردّ يدويّ من بريد الجمعية.',
      cols: [
        { k: 'created_at', l: 'التاريخ', t: 'ro', w: 150, fmt: 'date' },
        { k: 'kind', l: 'النوع', t: 'ro', w: 90, map: { contact: 'تواصل', volunteer: 'تطوّع', membership: 'عضوية', jobs: 'وظائف', newsletter: 'نشرة' } },
        { k: 'payload', l: 'المحتوى', t: 'ro', w: 380, fmt: 'kv' },
        { k: 'status', l: 'الحالة', t: 'select', o: { 'new': 'جديد', in_progress: 'قيد المعالجة', closed: 'مُغلق', archived: 'مؤرشف' }, w: 118 },
        { k: 'priority', l: 'الأولوية', t: 'select', o: { low: 'منخفضة', normal: 'عادية', high: 'عالية' }, w: 96 }
      ]
    },
    {
      id: 'survey_responses', label: 'ردود قياس الرضا', mode: 'del', order: 'created_at.desc',
      reach: 'مجهولة بالكامل: لا اسم ولا بريد ولا عنوان شبكة. الحذف نهائيّ.',
      cols: [
        { k: 'created_at', l: 'التاريخ', t: 'ro', w: 150, fmt: 'date' },
        { k: 'survey_type', l: 'الاستبيان', t: 'ro', w: 110, map: { visitors: 'الزوّار', beneficiaries: 'المستفيدون', donors: 'الداعمون' } },
        { k: 'ratings', l: 'التقييمات', t: 'ro', w: 330, fmt: 'kv' },
        { k: 'program', l: 'البرنامج', t: 'ro', w: 150 },
        { k: 'comment', l: 'ملاحظة', t: 'ro', w: 240 }
      ]
    },
    {
      id: 'media', label: 'الوسائط', mode: 'del', order: 'id.desc',
      reach: 'الصور المرفوعة إلى المستودع. روابطها تعمل فورًا في أي مكان.',
      cols: [
        { k: 'storage_path', l: 'الملف', t: 'ro', w: 240, fmt: 'thumb' },
        { k: 'title', l: 'العنوان', t: 'text', w: 190 },
        { k: 'alt', l: 'الوصف البديل', t: 'text', w: 190 },
        { k: 'bytes', l: 'الحجم', t: 'ro', w: 90, fmt: 'bytes' },
        { k: 'kind', l: 'النوع', t: 'ro', w: 80 }
      ]
    },
    {
      id: 'audit_log', label: 'سجلّ العمليات', mode: 'ro', order: 'created_at.desc',
      reach: 'ما فعلته اللوحة نفسها. لا يُحذف من هنا — سجلّ يُمحى لا قيمة له.',
      cols: [
        { k: 'created_at', l: 'التاريخ', t: 'ro', w: 150, fmt: 'date' },
        { k: 'actor_email', l: 'المستخدم', t: 'ro', w: 190 },
        { k: 'action', l: 'الإجراء', t: 'ro', w: 170, mono: 1 },
        { k: 'entity', l: 'الجدول', t: 'ro', w: 140 },
        { k: 'entity_id', l: 'المعرّف', t: 'ro', w: 90 }
      ]
    }
  ];

  /* ------------------------------- الحالة ------------------------------- */
  var cur = 'people';       // الجدول المعروض
  var rows = [];            // الصفوف المقروءة
  var news = [];            // صفوف جديدة لم تُحفظ بعد
  var errs = [];            // أخطاء ظاهرة لا تختفي
  var q = '';               // بحث
  var LIMIT = 300;

  function tbl(id) {
    for (var i = 0; i < TABLES.length; i++) if (TABLES[i].id === id) return TABLES[i];
    return TABLES[0];
  }
  function pkOf(t) { return t.pk || 'id'; }

  function note(action, e) {
    errs.push({ t: cur, a: action, m: (e && e.message) ? e.message : String(e) });
  }

  /* ------------------------------ قراءة القيم ------------------------------ */
  function toInput(col, v) {
    if (v === null || v === undefined) return '';
    if (col.t === 'json') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
    if (col.t === 'lines') return (v && v.join) ? v.join('\n') : String(v);
    if (col.t === 'facts') {
      if (!v || !v.length) return '';
      var out = [];
      for (var i = 0; i < v.length; i++) {
        var f = v[i];
        if (f && f.label !== undefined) out.push(f.label + ' | ' + (f.value === undefined ? '' : f.value));
        else if (f && f.length === 2) out.push(f[0] + ' | ' + f[1]);
      }
      return out.join('\n');
    }
    if (col.t === 'select' && (v === true || v === false)) return v ? 'true' : 'false';
    return String(v);
  }

  /* يرجع {ok, value} — القيمة جاهزة للإرسال إلى القاعدة */
  function fromInput(col, raw) {
    var s = raw === null || raw === undefined ? '' : String(raw);
    if (col.t === 'int') {
      if (s.trim() === '') return { ok: true, value: null };
      var n = Number(s);
      if (!isFinite(n) || Math.floor(n) !== n) return { ok: false, why: 'يجب أن يكون عددًا صحيحًا' };
      return { ok: true, value: n };
    }
    if (col.t === 'json') {
      if (s.trim() === '') return { ok: true, value: null };
      try { return { ok: true, value: JSON.parse(s) }; }
      catch (e) { return { ok: false, why: 'قيمة JSON غير صحيحة — النصّ يُكتب بين علامتَي تنصيص' }; }
    }
    if (col.t === 'lines') {
      var ls = s.split('\n');
      var keep = [];
      for (var i = 0; i < ls.length; i++) if (ls[i].trim() !== '') keep.push(ls[i].trim());
      return { ok: true, value: keep };
    }
    if (col.t === 'facts') {
      var out = [], L = s.split('\n');
      for (var j = 0; j < L.length; j++) {
        var line = L[j].trim();
        if (!line) continue;
        var p = line.split('|');
        out.push({ label: (p[0] || '').trim(), value: (p.slice(1).join('|') || '').trim() });
      }
      return { ok: true, value: out };
    }
    if (col.t === 'select' && col.o && (col.o['true'] || col.o['false'])) {
      return { ok: true, value: s === 'true' };
    }
    return { ok: true, value: s };
  }

  /* ------------------------------- العرض ------------------------------- */
  function cellRO(col, row) {
    var v = row[col.k];
    if (col.fmt === 'date') return '<span class="mono small">' + U.esc(F.date(v)) + '</span>';
    if (col.fmt === 'bytes') return U.esc(F.bytes(v));
    if (col.fmt === 'thumb') {
      var url = IAQ.storage.publicUrl(row.bucket || 'iaq-media', v || '');
      return '<div style="display:flex;align-items:center;gap:8px">' +
        '<img src="' + U.attr(url) + '" alt="" style="width:38px;height:38px;object-fit:cover;border-radius:8px;border:1px solid var(--line)">' +
        '<span class="mono small">' + U.esc(F.cut(v, 34)) + '</span></div>';
    }
    if (col.fmt === 'kv') {
      if (!v || typeof v !== 'object') return '<span class="muted">—</span>';
      var ks = [], n = 0;
      for (var k in v) {
        if (!v.hasOwnProperty(k)) continue;
        n++; if (n > 8) { ks.push('<div class="muted small">…</div>'); break; }
        ks.push('<div><span class="muted small">' + U.esc(k) + ':</span> ' + U.esc(F.cut(String(v[k]), 70)) + '</div>');
      }
      return ks.join('') || '<span class="muted">—</span>';
    }
    if (col.map) return U.esc(col.map[v] || v || '—');
    if (v === null || v === undefined || v === '') return '<span class="muted">—</span>';
    return '<span' + (col.mono ? ' class="mono small"' : '') + '>' + U.esc(F.cut(String(v), 90)) + '</span>';
  }

  function cellEdit(col, row, rid) {
    var id = 'dt-' + rid + '-' + col.k;
    var val = toInput(col, row[col.k]);
    var style = 'width:100%;min-width:' + (col.w || 120) + 'px;padding:7px 9px;border:1px solid var(--line);' +
      'border-radius:8px;font-family:' + (col.mono ? 'var(--mono, monospace)' : 'var(--ui)') + ';font-size:13.5px;background:#fff;color:var(--ink)';
    if (col.t === 'select') {
      var h = '<select id="' + id + '" data-col="' + U.attr(col.k) + '" style="' + style + '">';
      for (var k in col.o) {
        if (!col.o.hasOwnProperty(k)) continue;
        h += '<option value="' + U.attr(k) + '"' + (String(val) === k ? ' selected' : '') + '>' + U.esc(col.o[k]) + '</option>';
      }
      return h + '</select>';
    }
    if (col.t === 'area' || col.t === 'lines' || col.t === 'facts') {
      return '<textarea id="' + id + '" data-col="' + U.attr(col.k) + '" rows="3" style="' + style + ';resize:vertical">' + U.esc(val) + '</textarea>';
    }
    return '<input id="' + id + '" data-col="' + U.attr(col.k) + '" type="text" value="' + U.attr(val) + '" style="' + style + '">';
  }

  function rowHtml(t, row, isNew) {
    var pk = pkOf(t);
    var rid = isNew ? ('n' + row.__tmp) : String(row[pk]);
    var tds = t.cols.map(function (c) {
      var editable = (c.t !== 'ro') && (t.mode === 'crud' || t.mode === 'del');
      return '<td>' + (editable ? cellEdit(c, row, rid) : cellRO(c, row)) + '</td>';
    }).join('');
    var acts = '';
    if (t.mode === 'crud' || t.mode === 'del') {
      acts += '<button class="btn sm ok" data-act="dt-save" data-id="' + U.attr(rid) + '">حفظ</button> ';
    }
    if (t.mode !== 'ro') {
      acts += '<button class="ib danger sm" data-act="dt-del" data-id="' + U.attr(rid) + '" title="حذف" aria-label="حذف">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg></button>';
    }
    if (isNew) {
      acts += ' <button class="ib sm" data-act="dt-drop" data-id="' + U.attr(rid) + '" title="إلغاء" aria-label="إلغاء">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
    }
    return '<tr' + (isNew ? ' style="background:#f8fbfa"' : '') + '>' +
      '<td class="mono small" style="white-space:nowrap">' + (isNew ? '<span class="chip">جديد</span>' : U.esc(String(row[pk]))) + '</td>' +
      tds + '<td style="white-space:nowrap">' + acts + '</td></tr>';
  }

  function matches(row, t) {
    if (!q) return true;
    var s = q.toLowerCase();
    for (var i = 0; i < t.cols.length; i++) {
      var v = row[t.cols[i].k];
      if (v === null || v === undefined) continue;
      var str = (typeof v === 'object') ? JSON.stringify(v) : String(v);
      if (str.toLowerCase().indexOf(s) > -1) return true;
    }
    return String(row[pkOf(t)] || '').indexOf(s) > -1;
  }

  function errPanel() {
    if (!errs.length) return '';
    var h = '<div class="notice" style="background:#fdf1ec;border-color:#f0cdbc;color:#8c3d1c">' +
      '<b>أخطاء لم تُنفَّذ (' + errs.length + ')</b>' +
      '<button class="btn sm ghost right" data-act="dt-clearerr" style="margin-inline-start:10px">إخفاء</button>';
    for (var i = 0; i < errs.length; i++) {
      h += '<div style="margin-block-start:8px"><b>' + U.esc(errs[i].a) + '</b> — <span class="mono small">' +
        U.esc(errs[i].t) + '</span><br>' + U.esc(errs[i].m) + '</div>';
    }
    return h + '</div>';
  }

  function draw(mount) {
    var t = tbl(cur);
    var chips = '<div class="filterbar">' + TABLES.map(function (x) {
      return '<button class="btn sm' + (x.id === cur ? ' ok' : ' ghost') + '" data-act="dt-tab" data-arg="' +
        U.attr(x.id) + '">' + U.esc(x.label) + '</button>';
    }).join('') + '</div>';

    var shown = rows.filter(function (r) { return matches(r, t); });
    var head = '<tr><th>#</th>' + t.cols.map(function (c) {
      return '<th style="white-space:nowrap">' + U.esc(c.l) +
        (c.req ? ' <span style="color:#c0603a">*</span>' : '') +
        (c.hint ? '<div class="muted small" style="font-weight:400">' + U.esc(c.hint) + '</div>' : '') + '</th>';
    }).join('') + '<th></th></tr>';

    var body = news.map(function (r) { return rowHtml(t, r, true); }).join('') +
      shown.map(function (r) { return rowHtml(t, r, false); }).join('');

    var tools = '<div class="addrow" style="margin-block-end:12px">' +
      '<input id="dt-q" type="text" value="' + U.attr(q) + '" placeholder="بحث في كل الأعمدة…" style="flex:2;min-width:180px">' +
      '<button class="btn ghost" data-act="dt-search">بحث</button>' +
      (t.mode === 'crud' ? '<button class="btn" data-act="dt-new">+ صفّ جديد</button>' : '') +
      '<button class="btn ghost" data-act="dt-reload">تحديث من القاعدة</button>' +
      '</div>';

    var count = '<span class="chip">' + U.esc(F.num(rows.length)) + ' صفًّا' +
      (shown.length !== rows.length ? ' · ' + U.esc(F.num(shown.length)) + ' مطابق' : '') + '</span>';

    mount.innerHTML =
      U.head('إدارة البيانات', 'كل جداول الموقع في مكان واحد — تعديل وإضافة وحذف.') +
      chips + errPanel() +
      '<div class="ad-card">' +
        '<h3>' + U.esc(t.label) + ' ' + count + '</h3>' +
        '<p class="muted small" style="margin-block-end:14px">' + U.esc(t.reach) + '</p>' +
        tools +
        (body ? '<div style="overflow-x:auto"><table class="tbl"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>'
              : U.empty('لا صفوف في هذا الجدول.')) +
        (t.mode === 'crud' && t.cols.length ? '<p class="muted small" style="margin-block-start:12px">الترتيب يُضبط بكتابة رقم في عمود «الترتيب» — الأصغر أوّلًا.</p>' : '') +
      '</div>';
  }

  /* ------------------------------- التحميل ------------------------------- */
  function load(mount) {
    var t = tbl(cur);
    return A.select(t.id, 'select=*&order=' + t.order + '&limit=' + LIMIT).then(function (r) {
      rows = r || [];
      draw(mount);
    }, function (e) {
      rows = [];
      note('قراءة الجدول', e);
      draw(mount);
    });
  }

  function render(mount) {
    news = [];
    return load(mount);      // الوعد يُعاد كي تلتقط النواة أي فشل ولا يُكتم
  }

  /* -------------------------------- الحفظ -------------------------------- */
  function readRow(t, rid) {
    var patch = {}, bad = null;
    for (var i = 0; i < t.cols.length; i++) {
      var c = t.cols[i];
      if (c.t === 'ro') continue;
      var el = U.$('#dt-' + rid + '-' + c.k);
      if (!el) continue;                       // الحقل غير معروض — لا نلمس العمود
      var res = fromInput(c, el.value);
      if (!res.ok) { bad = c.l + ': ' + res.why; break; }
      if (c.req && (res.value === null || res.value === '' )) { bad = c.l + ': مطلوب'; break; }
      patch[c.k] = res.value;
    }
    return { patch: patch, bad: bad };
  }

  function afterWrite(mount, action, id) {
    IAQ.audit(cur + '.' + action, cur, id);
    news = news.filter(function (r) { return ('n' + r.__tmp) !== id; });
    load(mount);
  }

  IAQ.on('dt-tab', function (b) { cur = b.getAttribute('data-arg'); q = ''; news = []; IAQ.go(KEY); });
  IAQ.on('dt-reload', function () { IAQ.go(KEY); });
  IAQ.on('dt-clearerr', function () { errs = []; IAQ.go(KEY); });
  IAQ.on('dt-search', function () { var i = U.$('#dt-q'); q = i ? i.value.trim() : ''; draw(U.$('#viewArea')); });
  IAQ.on('dt-new', function () {
    var t = tbl(cur), r = { __tmp: Date.now() };
    for (var i = 0; i < t.cols.length; i++) {
      var c = t.cols[i];
      r[c.k] = (c.t === 'select') ? Object.keys(c.o)[0] : (c.t === 'int' ? null : '');
    }
    if (t.id === 'people') { r.status = 'published'; r.sort = 100; }
    if (t.id === 'partners') { r.status = 'published'; r.sort = 100; }
    news.unshift(r);
    draw(U.$('#viewArea'));
  });
  IAQ.on('dt-drop', function (b) {
    var id = b.getAttribute('data-id');
    news = news.filter(function (r) { return ('n' + r.__tmp) !== id; });
    draw(U.$('#viewArea'));
  });

  IAQ.on('dt-save', function (b) {
    var t = tbl(cur), rid = b.getAttribute('data-id'), mount = U.$('#viewArea');
    var r = readRow(t, rid);
    if (r.bad) { U.toast(r.bad, 'err'); errs.push({ t: cur, a: 'تحقّق من الحقول', m: r.bad }); draw(mount); return; }
    b.disabled = true; b.textContent = '…';
    var isNew = rid.charAt(0) === 'n';
    var p;
    if (isNew) {
      p = A.insert(t.id, r.patch, pkOf(t)).then(function (out) {
        var id = out && out[0] ? out[0][pkOf(t)] : null;
        U.toast('أُضيف الصفّ');
        afterWrite(mount, 'create', rid);
        return id;
      });
    } else if (t.pk === 'key') {
      p = A.updateWhere(t.id, 'key=eq.' + encodeURIComponent(rid), r.patch).then(function (out) {
        if (!out || !out.length) throw new Error('لم يتغيّر أي صفّ — تحقّق من الصلاحية');
        U.toast('حُفظ'); afterWrite(mount, 'update', rid);
      });
    } else {
      p = A.update(t.id, rid, r.patch).then(function (out) {
        if (!out || !out.length) throw new Error('لم يتغيّر أي صفّ — تحقّق من الصلاحية');
        U.toast('حُفظ'); afterWrite(mount, 'update', rid);
      });
    }
    p.catch(function (e) {
      note(isNew ? 'إضافة صفّ' : 'حفظ الصفّ ' + rid, e);
      U.toast((e && e.message) ? e.message : 'فشل الحفظ', 'err');
      draw(mount);
    });
  });

  IAQ.on('dt-del', function (b) {
    var t = tbl(cur), rid = b.getAttribute('data-id'), mount = U.$('#viewArea');
    if (rid.charAt(0) === 'n') { news = news.filter(function (r) { return ('n' + r.__tmp) !== rid; }); draw(mount); return; }
    U.ask('حذف هذا الصفّ نهائيًّا من قاعدة البيانات؟', 'حذف').then(function (ok) {
      if (!ok) return;
      var p = (t.pk === 'key')
        ? A.removeWhere(t.id, 'key=eq.' + encodeURIComponent(rid))
        : A.remove(t.id, rid);
      return p.then(function (out) {
        if (!out || !out.length) {
          note('حذف الصفّ ' + rid, new Error('لم يُحذف شيء — قد يكون محذوفًا أو لا تسمح الصلاحية'));
          U.toast('لم يُحذف شيء', 'warn');
        } else { U.toast('حُذف الصفّ'); }
        afterWrite(mount, 'delete', rid);
      });
    }).catch(function (e) {
      note('حذف الصفّ ' + rid, e);
      U.toast((e && e.message) ? e.message : 'فشل الحذف', 'err');
      draw(mount);
    });
  });

  IAQ.views.register(KEY, {
    label: 'إدارة البيانات',
    group: 'الإدارة',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14.5h18M9 4v16"/>',
    render: render
  });
})();
