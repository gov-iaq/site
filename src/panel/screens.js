/* ============================================================================
   شاشات إدارة القوائم — أربع شاشات بمسار كود واحد.

   الجمعية العمومية · مجلس الإدارة · فريق العمل · الشركاء

   كل شاشة تُوصَف في سجلّ SCREENS (جدولها، حقولها، أعمدة جدولها، إحصاءاتها،
   وأعمدة قالب الإكسل). والرسم والحفظ والحذف والاستيراد دوالُّ واحدة تخدم
   الأربع — فأيّ إصلاح يسري عليها جميعًا، ولا تتكرّر العيوب أربع مرّات.

   قالب الإكسل يُبنى هنا بلا أي مكتبة خارجية: حزمة ZIP مخزَّنة بلا ضغط تُكتب
   بايتًا بايتًا مع CRC32، وفيها تحقّق من صحّة البيانات على عمود الاختيار
   فيصير قائمة منسدلة فعلية في إكسل. والقراءة تفكّ الضغط بـ DecompressionStream،
   ويُقبل CSV بديلًا.

   ملاحظة: لا تُستخدم أسماء أصناف تبدأ بـ ad- أو تحوي banner — مانعات الإعلانات
   تحجبها فتبدو الشاشة فارغة. (حدث هذا فعلًا وأخذ منّا جولات.)
   ============================================================================ */
window.IAQ_SCREENS = (function () {
  'use strict';

  var CFG = window.IAQ_SUPABASE || { url: '', key: '' };
  var S = window.IAQ_SESSION || null;
  var BUILD = window.IAQ_BUILD || '—';

  var CAT = { founder: 'عضو مؤسس', working: 'عضو عامل' };
  var RANK = { chair: 'رئيس المجلس', vice: 'نائب الرئيس', member: 'عضو', lead: 'مدير تنفيذي' };
  var ST = { published: 'ظاهر', hidden: 'مخفي', draft: 'مسودّة' };
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  /* «2026-06-22» ← «22 يونيو 2026» بنفس صياغة البنّاء، بلا Date كي لا تتدخّل
     المنطقة الزمنية فيُنقص يومًا. */
  function arDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    return Number(m[3]) + ' ' + (MONTHS[Number(m[2]) - 1] || m[2]) + ' ' + m[1];
  }

  /* ------------------------------ سجلّ الشاشات ------------------------------ */
  var SCREENS = {
    assembly: {
      nav: 'الجمعية العمومية', h1: 'أعضاء الجمعية العمومية',
      sub: 'بيانات الأعضاء الحاليين — تعديل وحذف وإضافة، فرديًّا أو دفعةً من ملف إكسل.',
      table: 'people', filter: 'grp=eq.assembly', fixed: { grp: 'assembly' },
      reach: 'التعديل والحذف والإضافة تسري على صفحة «الجمعية العمومية» في الموقع عند أوّل تحميل لها، بلا إعادة بناء.',
      fields: [
        { k: 'title', l: 'اللقب (اختياري)', t: 'text', hint: 'مثل: أ. أو د. أو م.' },
        { k: 'name', l: 'اسم العضو', t: 'text', req: 1 },
        { k: 'cat', l: 'نوع العضوية', t: 'select', o: CAT, def: 'founder' },
        { k: 'sort', l: 'الترتيب', t: 'int', hint: 'الأصغر أوّلًا — فارغًا يُضاف آخر القائمة', half: 1 },
        { k: 'status', l: 'الحالة', t: 'select', o: { published: 'ظاهر على الموقع', hidden: 'مخفي' }, def: 'published', half: 1 }
      ],
      list: [{ k: 'name', l: 'الاسم', f: 'person' }, { k: 'cat', l: 'نوع العضوية', f: 'chip', o: CAT },
             { k: 'status', l: 'الحالة', f: 'status' }],
      stats: [{ l: 'إجمالي الأعضاء' }, { l: CAT.founder, c: 'cat', v: 'founder' },
              { l: CAT.working, c: 'cat', v: 'working' }, { l: 'غير ظاهر على الموقع', hidden: 1 }],
      xlsx: { file: 'قالب-أعضاء-الجمعية-العمومية.xlsx',
              cols: [{ k: 'name', l: 'اسم العضو', w: 38 }, { k: 'cat', l: 'نوع العضوية', w: 20, o: CAT }],
              sample: [['محمد عبدالله السالم', 'عضو مؤسس'], ['نورة صالح العتيبي', 'عضو عامل']] }
    },
    board: {
      nav: 'مجلس الإدارة', h1: 'أعضاء مجلس الإدارة',
      sub: 'رئيس المجلس ونائبه والأعضاء — تعديل وحذف وإضافة، فرديًّا أو دفعةً من ملف إكسل.',
      table: 'people', filter: 'grp=eq.board', fixed: { grp: 'board' }, photoDir: 'board',
      reach: 'التعديل والحذف والإضافة تسري على صفحة «مجلس الإدارة» في الموقع عند أوّل تحميل لها، بلا إعادة بناء.',
      fields: [
        { k: 'title', l: 'اللقب (اختياري)', t: 'text' },
        { k: 'name', l: 'اسم العضو', t: 'text', req: 1 },
        { k: 'role', l: 'المنصب', t: 'text', hint: 'كما يظهر في البطاقة: رئيس الجمعية، عضو…' },
        { k: 'rank', l: 'الرتبة', t: 'select', o: { member: RANK.member, chair: RANK.chair, vice: RANK.vice }, def: 'member',
          hint: 'الرئيس ونائبه يظهران في بطاقتَي الصدارة' },
        { k: 'photo', l: 'اسم ملف الصورة', t: 'text', hint: 'داخل img/board — اتركه فارغًا فتظهر أيقونة رمزية' },
        { k: 'sort', l: 'الترتيب', t: 'int', hint: 'الأصغر أوّلًا', half: 1 },
        { k: 'status', l: 'الحالة', t: 'select', o: { published: 'ظاهر على الموقع', hidden: 'مخفي' }, def: 'published', half: 1 }
      ],
      list: [{ k: 'photo', l: 'الصورة', f: 'thumb', dir: 'board' }, { k: 'name', l: 'الاسم', f: 'person' },
             { k: 'role', l: 'المنصب', f: 'text' }, { k: 'rank', l: 'الرتبة', f: 'chip', o: RANK },
             { k: 'status', l: 'الحالة', f: 'status' }],
      stats: [{ l: 'إجمالي الأعضاء' }, { l: 'الرئيس ونائبه', c: 'rank', v: ['chair', 'vice'] },
              { l: 'بصورة', has: 'photo' }, { l: 'غير ظاهر على الموقع', hidden: 1 }],
      xlsx: { file: 'قالب-مجلس-الإدارة.xlsx',
              cols: [{ k: 'name', l: 'اسم العضو', w: 38 }, { k: 'role', l: 'المنصب', w: 24 }],
              sample: [['محمد عبدالله السالم', 'عضو'], ['نورة صالح العتيبي', 'عضو']] }
    },
    team: {
      nav: 'فريق العمل', h1: 'فريق العمل التنفيذي',
      sub: 'بيانات الفريق التنفيذي وطرق التواصل — تعديل وحذف وإضافة.',
      table: 'people', filter: 'grp=eq.team', fixed: { grp: 'team' }, photoDir: 'team',
      reach: 'التعديل والحذف والإضافة تسري على صفحة «فريق العمل» في الموقع عند أوّل تحميل لها، بلا إعادة بناء.',
      fields: [
        { k: 'title', l: 'اللقب (اختياري)', t: 'text' },
        { k: 'name', l: 'الاسم', t: 'text', req: 1 },
        { k: 'role', l: 'المسمّى الوظيفي', t: 'text' },
        { k: 'rank', l: 'الرتبة', t: 'select', o: { member: 'عضو فريق', lead: RANK.lead }, def: 'member' },
        { k: 'phone', l: 'الجوال', t: 'text', half: 1 },
        { k: 'email', l: 'البريد', t: 'text', half: 1 },
        { k: 'photo', l: 'اسم ملف الصورة', t: 'text', hint: 'داخل img/team' },
        { k: 'sort', l: 'الترتيب', t: 'int', hint: 'الأصغر أوّلًا', half: 1 },
        { k: 'status', l: 'الحالة', t: 'select', o: { published: 'ظاهر على الموقع', hidden: 'مخفي' }, def: 'published', half: 1 }
      ],
      list: [{ k: 'photo', l: 'الصورة', f: 'thumb', dir: 'team' }, { k: 'name', l: 'الاسم', f: 'person' },
             { k: 'role', l: 'المسمّى', f: 'text' }, { k: 'phone', l: 'الجوال', f: 'text' },
             { k: 'email', l: 'البريد', f: 'text' }, { k: 'status', l: 'الحالة', f: 'status' }],
      stats: [{ l: 'إجمالي الفريق' }, { l: RANK.lead, c: 'rank', v: 'lead' },
              { l: 'بصورة', has: 'photo' }, { l: 'غير ظاهر على الموقع', hidden: 1 }],
      xlsx: { file: 'قالب-فريق-العمل.xlsx',
              cols: [{ k: 'name', l: 'الاسم', w: 34 }, { k: 'role', l: 'المسمّى الوظيفي', w: 26 }],
              sample: [['محمد عبدالله السالم', 'مدير تنفيذي'], ['نورة صالح العتيبي', 'محاسب']] }
    },
    newslist: {
      nav: 'الأخبار', h1: 'الأخبار والمركز الإعلامي',
      sub: 'أخبار الجمعية — تحرير كامل للنصّ والبيانات ورابط التسجيل، وإضافة خبر جديد.',
      /* جدول الأخبار لا عمود ترتيب فيه: الترتيب بالتاريخ، الأحدث أوّلًا. */
      table: 'news', filter: '', fixed: {}, nosort: 1, order: 'date.desc,id.desc',
      nameKey: 'title', searchKeys: ['title', 'lead', 'tag'],
      reach: 'التعديل والحذف والإضافة تسري على صفحة «المركز الإعلامي» وشريط الأخبار في الصفحة الرئيسة عند أوّل تحميل، بلا إعادة بناء.',
      fields: [
        { k: 'date', l: 'تاريخ الخبر', t: 'date', half: 1 },
        { k: 'tag', l: 'الوسم', t: 'tag', half: 1, hint: 'اختر وسمًا موجودًا أو اكتب وسمًا جديدًا' },
        { k: 'title', l: 'عنوان الخبر', t: 'text', req: 1 },
        { k: 'lead', l: 'المقدّمة', t: 'area', hint: 'سطر أو سطران يظهران بخطٍّ أبرز تحت العنوان' },
        { k: 'body', l: 'نصّ الخبر', t: 'lines', hint: 'كل سطر فقرة مستقلّة — اترك سطرًا فارغًا بين الفقرات أو لا، كما تشاء' },
        { k: 'facts', l: 'بيانات الخبر', t: 'pairs',
          hint: 'كل سطر: العنوان ثم نقطتان ثم القيمة — مثل «المدرب: د. أحمد الرفاعي». تظهر جدولًا في البطاقة.' },
        { k: 'cta_label', l: 'نصّ زرّ التسجيل', t: 'text', half: 1, hint: 'مثل: سجّل الآن' },
        { k: 'cta_url', l: 'رابط زرّ التسجيل', t: 'text', half: 1, hint: 'يبدأ بـ https — والزرّ لا يظهر بلا نصٍّ ورابط معًا' },
        { k: 'image', l: 'اسم ملف الصورة', t: 'text', hint: 'داخل img/news — فارغًا تظهر أيقونة رمزية' },
        { k: 'status', l: 'الحالة', t: 'select', o: { published: 'منشور على الموقع', draft: 'مسودّة (لا تظهر)' }, def: 'published' }
      ],
      list: [{ k: 'image', l: 'الصورة', f: 'thumb', dir: 'news' },
             { k: 'date', l: 'التاريخ', f: 'date' },
             { k: 'tag', l: 'الوسم', f: 'chip' },
             { k: 'title', l: 'العنوان', f: 'clip' },
             { k: 'body', l: 'الفقرات', f: 'count' },
             { k: 'status', l: 'الحالة', f: 'status' }],
      stats: [{ l: 'إجمالي الأخبار' }, { l: 'منشور', c: 'status', v: 'published' },
              { l: 'مسودّة', c: 'status', v: 'draft' }, { l: 'بصورة', has: 'image' }]
    },
    partnerlist: {
      nav: 'الشركاء', h1: 'شعارات الشركاء',
      sub: 'شركاء النجاح كما يظهرون في شريط الصفحة الرئيسة — تعديل وحذف وإضافة وترتيب.',
      table: 'partners', filter: '', fixed: {}, logoDir: 'partners',
      reach: 'التعديل والحذف والإضافة تسري على شريط الشركاء في الصفحة الرئيسة عند أوّل تحميل لها، بلا إعادة بناء.',
      fields: [
        { k: 'name', l: 'اسم الشريك', t: 'text', req: 1 },
        { k: 'logo', l: 'الشعار', t: 'text', hint: 'اسم ملف داخل img/partners أو رابط كامل يبدأ بـ https' },
        { k: 'url', l: 'رابط الشريك (اختياري)', t: 'text' },
        { k: 'sort', l: 'الترتيب', t: 'int', hint: 'الأصغر أوّلًا', half: 1 },
        { k: 'status', l: 'الحالة', t: 'select', o: { published: 'ظاهر على الموقع', hidden: 'مخفي' }, def: 'published', half: 1 }
      ],
      list: [{ k: 'logo', l: 'الشعار', f: 'logo' }, { k: 'name', l: 'الاسم', f: 'text' },
             { k: 'url', l: 'الرابط', f: 'link' }, { k: 'sort', l: 'الترتيب', f: 'text' },
             { k: 'status', l: 'الحالة', f: 'status' }],
      stats: [{ l: 'إجمالي الشركاء' }, { l: 'بشعار', has: 'logo' },
              { l: 'برابط', has: 'url' }, { l: 'غير ظاهر على الموقع', hidden: 1 }],
      xlsx: { file: 'قالب-الشركاء.xlsx',
              cols: [{ k: 'name', l: 'اسم الشريك', w: 40 }, { k: 'logo', l: 'اسم ملف الشعار', w: 30 }],
              sample: [['المركز الوطني لتنمية القطاع غير الربحي', 'national-center-nonprofit.png'],
                       ['وزارة الموارد البشرية والتنمية الاجتماعية', 'ministry-hrsd.png']] }
    }
  };

  /* ------------------------------- الحالة ------------------------------- */
  var cur = 'assembly', rows = [], q = '', err = null, busy = false, staged = null;
  /* عدّاد التبديل: قراءةٌ لم تكتمل قبل الانتقال إلى شاشة أخرى تُهمَل، وإلا
     رُسمت بيانات الشاشة السابقة في جدول الشاشة الجديدة (نفس المعرّفات). */
  var epoch = 0;
  function S0() { return SCREENS[cur]; }

  /* ------------------------------- أدوات ------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(s) { return document.querySelector(s); }
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function hdr(json) {
    var h = { apikey: CFG.key, Authorization: 'Bearer ' + (S ? S.access_token : '') };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }
  function api(path, opt) {
    opt = opt || {};
    opt.headers = hdr(!!opt.body);
    return fetch(CFG.url + '/rest/v1/' + path, opt).then(function (r) {
      if (r.ok) return r.status === 204 ? null : r.json();
      return r.text().then(function (b) {
        var d = '';
        try { var j = JSON.parse(b); d = j.message || j.hint || ''; } catch (e) { d = String(b).slice(0, 160); }
        throw new Error('(' + r.status + ') ' + (d || 'فشل الطلب'));
      });
    });
  }
  var ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    pen: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/>',
    trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
    up: '<path d="M12 20V6M6 12l6-6 6 6"/><path d="M4 20h16"/>',
    down: '<path d="M12 4v14M6 12l6 6 6-6"/><path d="M4 20h16"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function ico(k) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[k] || '') + '</svg>';
  }
  function fieldsOf(sc) { return sc.fields; }
  function fieldByKey(sc, k) {
    var f = null;
    fieldsOf(sc).forEach(function (x) { if (x.k === k) f = x; });
    return f;
  }

  /* ------------------------------ القراءة ------------------------------ */
  function load() {
    var sc = S0(), my = epoch;
    err = null;
    var cols = ['id'];
    fieldsOf(sc).forEach(function (f) { if (cols.indexOf(f.k) < 0) cols.push(f.k); });
    /* جداولٌ بلا عمود ترتيب (الأخبار) — طلبه أو الترتيب به يُفشل الطلب كلّه */
    if (!sc.nosort && cols.indexOf('sort') < 0) cols.push('sort');
    if (sc.table === 'people' && cols.indexOf('title') < 0) cols.push('title');
    var qs = 'select=' + cols.join(',') + (sc.filter ? '&' + sc.filter : '') +
             '&order=' + (sc.order || 'sort.asc,id.asc') + '&limit=500';
    return api(sc.table + '?' + qs)
      .then(function (r) { if (my === epoch) rows = r || []; })
      .catch(function (e) { if (my === epoch) { rows = []; err = e.message; } });
  }

  /* ------------------------------- العرض ------------------------------- */
  function view(key) {
    if (SCREENS[key]) cur = key;
    q = ''; staged = null; err = null; rows = [];
    epoch++;
    var my = epoch, sc = S0();
    setTimeout(function () { load().then(function () { if (my === epoch) paint(); }); }, 0);
    /* الأزرار في الهيكل الثابت: لو تعذّرت القراءة تبقى الشاشة صالحة ويظهر السبب */
    return '<div class="view-head"><h1>' + esc(sc.h1) +
      ' <span class="chip" style="vertical-align:middle;font-size:11px">إصدار ' + esc(BUILD) + '</span></h1>' +
      '<p>' + esc(sc.sub) + '</p></div>' +
      '<div class="iaq-card" style="margin-block-end:14px">' + toolbar(sc) +
        '<div id="sc-diag" class="muted small">جارٍ التحميل…</div></div>' +
      '<div id="sc-err"></div><div id="sc-stats"></div>' +
      '<div class="iaq-card"><div id="sc-list"></div>' +
        '<p class="muted small" style="margin-block-start:12px">' + esc(sc.reach) + '</p></div>';
  }
  function toolbar(sc) {
    return '<div class="addrow" style="margin-block-end:14px">' +
      '<input id="sc-q" type="text" value="' + esc(q) + '" placeholder="بحث بالاسم…" style="flex:2;min-width:170px">' +
      '<button class="btn ghost" data-sc="search">بحث</button>' +
      '<button class="btn" data-sc="add">' + ico('plus') + ' إضافة</button>' +
      (sc.xlsx ? '<button class="btn ghost" data-sc="import">' + ico('up') + ' إضافة من إكسل</button>' +
                 '<button class="btn ghost" data-sc="tpl">' + ico('down') + ' تنزيل القالب</button>' : '') +
      '<button class="btn ghost" data-sc="reload">تحديث</button></div>';
  }

  function statVal(spec) {
    if (spec.hidden) return rows.filter(function (r) { return r.status !== 'published'; }).length;
    if (spec.has) return rows.filter(function (r) { return norm(r[spec.has]) !== ''; }).length;
    if (spec.c) {
      var vals = (spec.v instanceof Array) ? spec.v : [spec.v];
      return rows.filter(function (r) { return vals.indexOf(r[spec.c]) > -1; }).length;
    }
    return rows.length;
  }
  function box(n, label) {
    return '<div class="stat-box"><div class="sb-val">' + esc(String(n)) + '</div>' +
           '<div class="sb-label">' + esc(label) + '</div></div>';
  }
  function chipOf(val, map, gold) {
    return '<span class="chip"' + (gold ? ' style="background:#f8efdb;color:#7a5518"' : '') + '>' +
      esc((map && map[val]) || val || '—') + '</span>';
  }
  function imgSrc(v, dir) {
    var s = String(v || '');
    if (!s) return '';
    if (/^(https?:)?\/\//.test(s) || s.charAt(0) === '/') return s;
    return 'img/' + dir + '/' + s;
  }
  function cell(col, r) {
    var v = r[col.k];
    if (col.f === 'person') return '<b>' + esc(((r.title || '') + ' ' + (r.name || '')).trim()) + '</b>';
    if (col.f === 'chip') return chipOf(v, col.o, v === 'founder' || v === 'chair' || v === 'vice' || v === 'lead');
    if (col.f === 'status') return v === 'published'
      ? '<span class="chip">ظاهر</span>'
      : '<span class="chip" style="background:#f4e9d4;color:#7a5518">' + esc(ST[v] || v) + '</span>';
    if (col.f === 'thumb' || col.f === 'logo') {
      var src = imgSrc(v, col.f === 'logo' ? 'partners' : col.dir);
      if (!src) return '<span class="muted">—</span>';
      return '<img src="' + esc(src) + '" alt="" style="width:' + (col.f === 'logo' ? '62' : '36') +
        'px;height:36px;object-fit:contain;border-radius:8px;border:1px solid var(--line);background:#fff">';
    }
    if (col.f === 'link') {
      if (!norm(v)) return '<span class="muted">—</span>';
      return '<a href="' + esc(v) + '" target="_blank" rel="noopener" class="mono small">رابط</a>';
    }
    if (col.f === 'date') {
      return norm(v) ? '<span style="white-space:nowrap">' + esc(arDate(v)) + '</span>'
                     : '<span class="muted">—</span>';
    }
    if (col.f === 'count') {
      var n = (v instanceof Array) ? v.length : 0;
      return n ? '<span class="chip">' + n + '</span>' : '<span class="muted">—</span>';
    }
    if (col.f === 'clip') {
      var s = norm(v);
      if (!s) return '<span class="muted">—</span>';
      return '<b title="' + esc(s) + '">' + esc(s.length > 46 ? s.slice(0, 46) + '…' : s) + '</b>';
    }
    return norm(v) ? esc(v) : '<span class="muted">—</span>';
  }
  /* الاسم المعروض في تأكيد الحذف: العنوان في الأخبار، والاسم في غيرها */
  function labelOf(sc, r) {
    if (sc.nameKey) return norm(r[sc.nameKey]);
    return norm(((r.title || '') + ' ' + (r.name || '')).trim());
  }

  function paint() {
    var sc = S0(), st = $('#sc-stats'), ls = $('#sc-list'), ep = $('#sc-err');
    if (!ls) return;
    var keys = sc.searchKeys || ['name', 'title', 'role'];
    var list = rows.filter(function (r) {
      if (!q) return true;
      var hay = keys.map(function (k) { return norm(r[k]); }).join(' ').toLowerCase();
      return hay.indexOf(q.toLowerCase()) > -1;
    });

    if (st) st.innerHTML = '<div class="stat-grid" style="grid-template-columns:repeat(' +
      sc.stats.length + ',1fr);margin-block-end:16px">' +
      sc.stats.map(function (s2) { return box(statVal(s2), s2.l); }).join('') + '</div>';

    if (ep) ep.innerHTML = err
      ? '<div class="notice" style="background:#fdf1ec;border-color:#f0cdbc;color:#8c3d1c">' +
        '<b>تعذّر تنفيذ الإجراء</b><br>' + esc(err) + '</div>' : '';

    var body = list.map(function (r, i) {
      return '<tr><td class="mono small">' + (i + 1) + '</td>' +
        sc.list.map(function (c) { return '<td>' + cell(c, r) + '</td>'; }).join('') +
        '<td style="white-space:nowrap">' +
          '<button class="ib sm" data-sc="edit" data-id="' + r.id + '" title="تعديل" aria-label="تعديل">' + ico('pen') + '</button> ' +
          '<button class="ib sm danger" data-sc="del" data-id="' + r.id + '" title="حذف" aria-label="حذف">' + ico('trash') + '</button>' +
        '</td></tr>';
    }).join('');

    ls.innerHTML = list.length
      ? '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>#</th>' +
        sc.list.map(function (c) { return '<th>' + esc(c.l) + '</th>'; }).join('') +
        '<th></th></tr></thead><tbody>' + body + '</tbody></table></div>'
      : '<div class="muted" style="padding:28px;text-align:center">' +
        (rows.length ? 'لا نتائج مطابقة للبحث.' : 'لا سجلّات بعد — أضِف واحدًا أو استورد ملفًا.') + '</div>';

    var qi = $('#sc-q');
    if (qi && qi.value !== q) qi.value = q;
    var dg = $('#sc-diag');
    if (dg) {
      dg.innerHTML = 'قُرئ <b>' + rows.length + '</b> سجلًّا · معروض <b>' + list.length + '</b>' +
        ' · صفوف الجدول في الصفحة: <b>' + ls.querySelectorAll('tbody tr').length + '</b>' +
        ' · إصدار ' + esc(BUILD);
    }
  }

  /* ---------------------------- نافذة منبثقة ---------------------------- */
  function modal(title, bodyHtml, footHtml) {
    close();
    var ov = document.createElement('div');
    ov.id = 'sc-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(4,52,44,.46);z-index:600;display:flex;' +
      'align-items:center;justify-content:center;padding:20px;direction:rtl';
    ov.innerHTML = '<div role="dialog" aria-modal="true" aria-label="' + esc(title) + '" ' +
      'style="background:#fff;border-radius:16px;max-width:660px;width:100%;max-height:88vh;overflow:auto;' +
      'box-shadow:0 30px 70px -20px rgba(6,63,54,.5)">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;' +
        'border-block-end:1px solid var(--line)"><b style="font-family:var(--disp);font-size:1.12rem;color:var(--ink)">' +
        esc(title) + '</b><button class="ib sm" data-sc="close" aria-label="إغلاق">' + ico('x') + '</button></div>' +
      '<div style="padding:20px 22px">' + bodyHtml + '</div>' +
      (footHtml ? '<div class="btnbar" style="padding:0 22px 20px">' + footHtml + '</div>' : '') + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var f = ov.querySelector('input,select,textarea');
    if (f) f.focus();
    return ov;
  }
  function close() {
    var m = document.getElementById('sc-modal');
    if (m) m.remove();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  /* --- تحويل بين قيمة القاعدة ونصّ الحقل، للنوعين المركّبين --- */
  function linesToText(v) {
    if (v instanceof Array) return v.join('\n\n');
    return String(v == null ? '' : v);
  }
  function textToLines(s) {
    return String(s || '').split('\n').map(norm).filter(function (x) { return x !== ''; });
  }
  function pairsToText(v) {
    if (!(v instanceof Array)) return '';
    return v.map(function (p) {
      if (p instanceof Array) return norm(p[0]) + ': ' + norm(p[1]);
      return norm(p && p.label) + ': ' + norm(p && p.value);
    }).join('\n');
  }
  function textToPairs(s) {
    var out = [];
    String(s || '').split('\n').forEach(function (ln) {
      if (!norm(ln)) return;
      /* أوّل نقطتين فقط: القيمة نفسها قد تحوي نقطتين مثل «4:30 - 10:00 مساءً» */
      var i = ln.indexOf(':');
      if (i < 0) { out.push({ label: norm(ln), value: '' }); return; }
      out.push({ label: norm(ln.slice(0, i)), value: norm(ln.slice(i + 1)) });
    });
    return out;
  }

  function control(f, val) {
    var id = 'sc-f-' + f.k;
    var h = '<div class="fld"><label for="' + id + '">' + esc(f.l) +
      (f.req ? ' <span style="color:#c0603a">*</span>' : '') + '</label>';
    if (f.t === 'select') {
      h += '<select id="' + id + '">';
      for (var k in f.o) if (f.o.hasOwnProperty(k)) {
        h += '<option value="' + esc(k) + '"' + (String(val) === k ? ' selected' : '') + '>' + esc(f.o[k]) + '</option>';
      }
      h += '</select>';
    } else if (f.t === 'date') {
      var d = /^(\d{4}-\d{2}-\d{2})/.exec(String(val || ''));
      h += '<input type="date" id="' + id + '" value="' + esc(d ? d[1] : '') + '">';
    } else if (f.t === 'tag') {
      /* قائمة الوسوم الموجودة، والكتابة الحرّة مسموحة */
      var tags = [], k2;
      rows.forEach(function (r) { if (norm(r[f.k]) && tags.indexOf(norm(r[f.k])) < 0) tags.push(norm(r[f.k])); });
      h += '<input type="text" id="' + id + '" list="' + id + '-dl" value="' + esc(val == null ? '' : val) + '">' +
        '<datalist id="' + id + '-dl">' +
        tags.map(function (t) { return '<option value="' + esc(t) + '"></option>'; }).join('') + '</datalist>';
    } else if (f.t === 'area' || f.t === 'lines' || f.t === 'pairs') {
      var txt = f.t === 'lines' ? linesToText(val) : (f.t === 'pairs' ? pairsToText(val) : String(val == null ? '' : val));
      h += '<textarea id="' + id + '" rows="' + (f.t === 'area' ? 3 : 7) +
        '" style="width:100%;font:inherit;line-height:1.9;resize:vertical">' + esc(txt) + '</textarea>';
    } else {
      h += '<input type="text" id="' + id + '" value="' + esc(val == null ? '' : val) + '">';
    }
    if (f.hint) h += '<div class="muted small" style="margin-block-start:4px">' + esc(f.hint) + '</div>';
    return h + '</div>';
  }

  function openForm(row) {
    var sc = S0(), isNew = !row;
    var base = {};
    fieldsOf(sc).forEach(function (f) { base[f.k] = f.def !== undefined ? f.def : ''; });
    var data = row || base;
    /* الترتيب المُعلَن يُحترم كما هو؛ ويُقرَن حقلان نصفيّان متجاوران في سطر
       واحد فقط. (جمع كل النصفية أوّلًا كان يُقدّم «الترتيب» على «الاسم».) */
    var fs = fieldsOf(sc), h = '', i = 0;
    while (i < fs.length) {
      var f = fs[i];
      if (f.half && fs[i + 1] && fs[i + 1].half) {
        h += '<div class="grid2">' + control(f, data[f.k]) +
             control(fs[i + 1], data[fs[i + 1].k]) + '</div>';
        i += 2;
      } else {
        h += control(f, data[f.k]);
        i++;
      }
    }
    h += '<div id="sc-formerr" class="muted small" style="color:#8c3d1c"></div>';
    modal(isNew ? 'إضافة سجلّ جديد — ' + sc.nav : 'تعديل — ' + sc.nav, h,
      '<button class="btn ghost" data-sc="close">إلغاء</button>' +
      '<button class="btn" data-sc="save" data-id="' + (row && row.id ? row.id : '') + '">' +
      (isNew ? 'إضافة' : 'حفظ التعديل') + '</button>');
  }

  function saveForm(id) {
    var sc = S0(), rec = {}, bad = null;
    fieldsOf(sc).forEach(function (f) {
      if (bad) return;
      var el = $('#sc-f-' + f.k);
      if (!el) return;
      var v = el.value;
      if (f.t === 'lines') { rec[f.k] = textToLines(v); return; }
      if (f.t === 'pairs') { rec[f.k] = textToPairs(v); return; }
      if (f.t === 'area') { rec[f.k] = String(v || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim(); return; }
      if (f.t === 'date') {
        var dv = norm(v);
        /* تاريخ فارغ في عمود not null: لا يُرسل المفتاح، فتتولّاه القاعدة */
        if (dv === '') return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dv)) { bad = f.l + ': تاريخ غير صحيح'; return; }
        rec[f.k] = dv;
        return;
      }
      if (f.t === 'int') {
        var s2 = norm(v);
        /* فارغ = لا تُرسل المفتاح إطلاقًا. العمود not null في القاعدة، فإرسال
           null يُفشل الإضافة، وفي التعديل يُبقي حذفُ المفتاح القيمة كما هي. */
        if (s2 === '') return;
        var n = Number(s2);
        if (!isFinite(n) || Math.floor(n) !== n) { bad = f.l + ': يجب أن يكون عددًا صحيحًا'; return; }
        rec[f.k] = n;
        return;
      }
      v = norm(v);
      if (f.req && !v) { bad = f.l + ': مطلوب'; return; }
      rec[f.k] = v;
    });
    if (bad) { var e0 = $('#sc-formerr'); if (e0) e0.textContent = bad; return; }
    for (var k in sc.fixed) if (sc.fixed.hasOwnProperty(k)) rec[k] = sc.fixed[k];
    rec.updated_by = (S && S.email) || '';
    if (busy) return;
    busy = true;
    var p;
    if (id) {
      p = api(sc.table + '?id=eq.' + Number(id) + '&select=id', { method: 'PATCH', body: JSON.stringify(rec) });
    } else {
      if (!sc.nosort) {
        var mx = 0;
        rows.forEach(function (r) { if (r.sort > mx) mx = r.sort; });
        if (rec.sort == null) rec.sort = mx + 10;
      }
      p = api(sc.table + '?select=id', { method: 'POST', body: JSON.stringify([rec]) });
    }
    p.then(function (out) {
      if (!out || !out.length) throw new Error('لم يتغيّر أي صفّ — تحقّق من صلاحية حسابك.');
      close();
      return load().then(paint);
    }).catch(function (ex) {
      var el = $('#sc-formerr');
      if (el) el.textContent = ex.message; else { err = ex.message; paint(); }
    }).then(function () { busy = false; });
  }

  function askDelete(id) {
    var sc = S0(), r = null;
    rows.forEach(function (x) { if (String(x.id) === String(id)) r = x; });
    if (!r) return;
    modal('تأكيد الحذف',
      '<p>حذف <b>' + esc(labelOf(sc, r)) + '</b> نهائيًّا من قاعدة البيانات؟</p>' +
      '<p class="muted small">سيُرفع من الموقع عند أوّل تحميل للصفحة. وإن أردت إبقاءه في السجلّ ' +
      'وإخفاءه فقط فاستخدم «تعديل» واختر ' +
      (sc.table === 'news' ? '«مسودّة»' : '«مخفي»') + '.</p>',
      '<button class="btn ghost" data-sc="close">إلغاء</button>' +
      '<button class="btn danger" data-sc="delyes" data-id="' + r.id + '">حذف نهائي</button>');
  }
  function doDelete(id) {
    if (busy) return;
    busy = true;
    var sc = S0();
    api(sc.table + '?id=eq.' + Number(id) + '&select=id', { method: 'DELETE' })
      .then(function (out) {
        if (!out || !out.length) throw new Error('لم يُحذف شيء — قد يكون محذوفًا أو لا تسمح الصلاحية.');
        close();
        return load().then(paint);
      })
      .catch(function (ex) { err = ex.message; close(); paint(); })
      .then(function () { busy = false; });
  }

  /* ============================ قالب الإكسل ============================ */
  var CRC = null;
  function crcTable() {
    if (CRC) return CRC;
    CRC = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC[n] = c >>> 0;
    }
    return CRC;
  }
  function crc32(b) {
    var t = crcTable(), c = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) { return new TextEncoder().encode(s); }
  function u16(v) { return [v & 255, (v >> 8) & 255]; }
  function u32(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }
  function zip(files) {
    var chunks = [], central = [], off = 0;
    files.forEach(function (f) {
      var nb = utf8(f.name), c = crc32(f.data);
      var lh = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
                         u32(c), u32(f.data.length), u32(f.data.length), u16(nb.length), u16(0));
      chunks.push(new Uint8Array(lh), nb, f.data);
      central.push({ n: nb, c: c, s: f.data.length, o: off });
      off += lh.length + nb.length + f.data.length;
    });
    var cdStart = off, cd = [];
    central.forEach(function (e) {
      var h = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
                        u32(e.c), u32(e.s), u32(e.s), u16(e.n.length),
                        u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.o));
      cd.push(new Uint8Array(h), e.n);
      off += h.length + e.n.length;
    });
    var eocd = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0),
                              u16(central.length), u16(central.length),
                              u32(off - cdStart), u32(cdStart), u16(0)));
    return new Blob(chunks.concat(cd, [eocd]),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function xcell(ref, text, styled) {
    return '<c r="' + ref + '" t="inlineStr"' + (styled ? ' s="1"' : '') + '><is><t xml:space="preserve">' +
      esc(text) + '</t></is></c>';
  }
  var COLREF = ['A', 'B', 'C', 'D', 'E'];
  function templateBlob(sc) {
    var cols = sc.xlsx.cols;
    var rowsXml = '<row r="1">' + cols.map(function (c, i) {
      return xcell(COLREF[i] + '1', c.l, true);
    }).join('') + '</row>';
    var sample = sc.xlsx.sample.concat([[]]);
    sample.forEach(function (sr, si) {
      var r = si + 2;
      rowsXml += '<row r="' + r + '">' + cols.map(function (c, i) {
        return xcell(COLREF[i] + r, sr[i] == null ? '' : sr[i]);
      }).join('') + '</row>';
    });
    var dv = '';
    cols.forEach(function (c, i) {
      if (!c.o) return;
      var vals = [];
      for (var k in c.o) if (c.o.hasOwnProperty(k)) vals.push(c.o[k]);
      dv += '<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"' +
        ' errorTitle="قيمة غير مقبولة" error="اختر من القائمة: ' + esc(vals.join(' أو ')) + '"' +
        ' promptTitle="' + esc(c.l) + '" prompt="اختر من القائمة"' +
        ' sqref="' + COLREF[i] + '2:' + COLREF[i] + '1000">' +
        '<formula1>"' + esc(vals.join(',')) + '"</formula1></dataValidation>';
    });
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews><cols>' +
      cols.map(function (c, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.w || 24) + '" customWidth="1"/>';
      }).join('') + '</cols><sheetData>' + rowsXml + '</sheetData>' +
      (dv ? '<dataValidations count="1">' + dv + '</dataValidations>' : '') + '</worksheet>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF0F2A2A"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF4F3"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border/></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>';
    return zip([
      { name: '[Content_Types].xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>') },
      { name: '_rels/.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>') },
      { name: 'xl/workbook.xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="البيانات" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>') },
      { name: 'xl/styles.xml', data: utf8(styles) },
      { name: 'xl/worksheets/sheet1.xml', data: utf8(sheet) }
    ]);
  }
  function downloadTemplate() {
    var sc = S0();
    if (!sc.xlsx) return;
    var url = URL.createObjectURL(templateBlob(sc));
    var a = document.createElement('a');
    a.href = url;
    a.download = sc.xlsx.file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ============================ قراءة الملفات ============================ */
  function readZipEntries(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf), eocd = -1;
    for (var i = u8.length - 22; i >= 0 && i > u8.length - 66000; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('الملف ليس حزمة إكسل صحيحة.');
    var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), out = [];
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      var nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
      var lnl = dv.getUint16(lho + 26, true), lel = dv.getUint16(lho + 28, true);
      var start = lho + 30 + lnl + lel;
      out.push({ name: name, method: method, bytes: u8.subarray(start, start + csize) });
      p += 46 + nl + el + cl;
    }
    return out;
  }
  function inflate(e) {
    if (e.method === 0) return Promise.resolve(new TextDecoder().decode(e.bytes));
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error('متصفّحك لا يدعم فكّ ضغط الإكسل. احفظ الملف بصيغة CSV وأعد المحاولة.'));
    }
    return new Response(new Blob([e.bytes]).stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  function colOf(ref) {
    var m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return 0;
    var s = m[1], v = 0;
    for (var i = 0; i < s.length; i++) v = v * 26 + (s.charCodeAt(i) - 64);
    return v;
  }
  function unesc(s) {
    return String(s == null ? '' : s).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function parseXlsx(buf) {
    var entries = readZipEntries(buf), sheet = null, shared = null;
    entries.forEach(function (e) {
      if (/^xl\/worksheets\/sheet1\.xml$/i.test(e.name)) sheet = e;
      if (/^xl\/sharedStrings\.xml$/i.test(e.name)) shared = e;
    });
    if (!sheet) throw new Error('لم أجد ورقة العمل الأولى في الملف.');
    return Promise.all([inflate(sheet), shared ? inflate(shared) : Promise.resolve(null)])
      .then(function (r) {
        var sxml = r[0], sst = [];
        if (r[1]) {
          var re = /<si>([\s\S]*?)<\/si>/g, m;
          while ((m = re.exec(r[1]))) {
            var txt = '', tre = /<t[^>]*>([\s\S]*?)<\/t>/g, tm;
            while ((tm = tre.exec(m[1]))) txt += tm[1];
            sst.push(unesc(txt));
          }
        }
        var out = [], rre = /<row[^>]*>([\s\S]*?)<\/row>/g, rm;
        while ((rm = rre.exec(sxml))) {
          var cells = {}, cre = /<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g, cm;
          while ((cm = cre.exec(rm[1]))) {
            var attrs = cm[1] || cm[3] || '', inner = cm[2] || '';
            var ref = (/r="([A-Z]+\d+)"/.exec(attrs) || [])[1] || '';
            var ty = (/t="([a-zA-Z]+)"/.exec(attrs) || [])[1] || 'n', val = '';
            if (ty === 's') {
              val = sst[parseInt((/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1], 10)] || '';
            } else if (ty === 'inlineStr') {
              var t2 = '', tre2 = /<t[^>]*>([\s\S]*?)<\/t>/g, tm2;
              while ((tm2 = tre2.exec(inner))) t2 += tm2[1];
              val = unesc(t2);
            } else {
              val = unesc((/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1] || '');
            }
            cells[colOf(ref)] = val;
          }
          out.push([cells[1] || '', cells[2] || '']);
        }
        return out;
      });
  }
  function parseCsv(text) {
    var out = [];
    String(text).replace(/\r/g, '').split('\n').forEach(function (ln) {
      if (!ln.trim()) return;
      var cells = [], cur2 = '', inQ = false;
      for (var i = 0; i < ln.length; i++) {
        var ch = ln[i];
        if (ch === '"') { if (inQ && ln[i + 1] === '"') { cur2 += '"'; i++; } else inQ = !inQ; }
        else if ((ch === ',' || ch === ';') && !inQ) { cells.push(cur2); cur2 = ''; }
        else cur2 += ch;
      }
      cells.push(cur2);
      out.push([norm(cells[0]), norm(cells[1])]);
    });
    return out;
  }

  /* ---------------------------- نافذة الاستيراد ---------------------------- */
  function openImport() {
    var sc = S0();
    if (!sc.xlsx) return;
    staged = null;
    var c2 = sc.xlsx.cols[1];
    modal('إضافة من ملف إكسل — ' + sc.nav,
      '<p class="muted small" style="margin-block-end:14px">نزّل القالب أولًا، واكتب في العمود الأول ' +
      '<b>' + esc(sc.xlsx.cols[0].l) + '</b> وفي الثاني <b>' + esc(c2.l) + '</b>' +
      (c2.o ? ' من القائمة المنسدلة' : '') + '، ثم ارفع الملف هنا. تُقبل صيغة xlsx و CSV.</p>' +
      '<div class="btnbar" style="justify-content:flex-start;margin-block-end:14px">' +
        '<button class="btn ghost" data-sc="tpl">' + ico('down') + ' تنزيل القالب</button></div>' +
      '<label class="upload big" for="sc-file">' + ico('up') + ' اختر الملف' +
        '<input type="file" id="sc-file" accept=".xlsx,.csv,text/csv" hidden></label>' +
      '<div id="sc-preview" style="margin-block-start:16px"></div>',
      '<button class="btn ghost" data-sc="close">إلغاء</button>' +
      '<button class="btn" data-sc="importgo" disabled id="sc-go">إضافة السجلّات</button>');
    var inp = $('#sc-file');
    if (inp) inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (f) handleFile(f);
    });
  }
  function handleFile(file) {
    var pv = $('#sc-preview');
    if (pv) pv.innerHTML = '<div class="muted">جارٍ قراءة الملف…</div>';
    var p = /\.csv$/i.test(file.name) ? file.text().then(parseCsv) : file.arrayBuffer().then(parseXlsx);
    p.then(showPreview).catch(function (e) {
      if (pv) pv.innerHTML = '<div class="notice" style="background:#fdf1ec;border-color:#f0cdbc;color:#8c3d1c">' +
        esc(e.message) + '</div>';
    });
  }
  /* يترجم نصّ الخلية إلى قيمة العمود: للأعمدة ذات القائمة يطابق التسمية العربية */
  function valFromText(col, s) {
    var t = norm(s);
    if (!col.o) return t;
    if (!t) return '';
    for (var k in col.o) if (col.o.hasOwnProperty(k)) {
      if (norm(col.o[k]) === t || k === t) return k;
    }
    if (t.indexOf('مؤسس') > -1) return 'founder';
    if (t.indexOf('عامل') > -1) return 'working';
    return '';
  }
  function showPreview(raw) {
    var sc = S0(), c1 = sc.xlsx.cols[0], c2 = sc.xlsx.cols[1];
    var seen = {}, ok = [], bad = [];
    rows.forEach(function (r) { seen[norm(r.name)] = true; });
    raw.forEach(function (r, i) {
      var name = norm(r[0]);
      if (!name || norm(c1.l) === name) return;
      var v2 = valFromText(c2, r[1]);
      if (c2.o && !v2) { bad.push({ i: i + 1, name: name, why: c2.l + ' غير مفهوم' }); return; }
      if (seen[name]) { bad.push({ i: i + 1, name: name, why: 'موجود مسبقًا بالاسم نفسه' }); return; }
      seen[name] = true;
      var rec = { name: name };
      rec[c2.k] = v2;
      ok.push(rec);
    });
    staged = ok;
    var pv = $('#sc-preview');
    if (!pv) return;
    var h = '<div class="stat-grid" style="grid-template-columns:repeat(2,1fr);margin-block-end:12px">' +
      box(ok.length, 'جاهز للإضافة') + box(bad.length, 'سطر متجاوَز') + '</div>';
    if (ok.length) {
      h += '<div style="max-height:220px;overflow:auto"><table class="tbl"><thead><tr><th>#</th>' +
        '<th>' + esc(c1.l) + '</th><th>' + esc(c2.l) + '</th></tr></thead><tbody>' +
        ok.map(function (r, i) {
          var shown = c2.o ? chipOf(r[c2.k], c2.o, r[c2.k] === 'founder') : esc(r[c2.k] || '—');
          return '<tr><td class="mono small">' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td>' + shown + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    if (bad.length) {
      h += '<div class="notice" style="margin-block-start:12px"><b>سطور لم تُقبل (' + bad.length + ')</b>' +
        bad.slice(0, 12).map(function (b) {
          return '<div class="small">سطر ' + b.i + ': ' + esc(b.name || '(بلا اسم)') + ' — ' + esc(b.why) + '</div>';
        }).join('') + '</div>';
    }
    if (!ok.length && !bad.length) h += '<div class="muted">لم أجد أي سطر فيه اسم.</div>';
    pv.innerHTML = h;
    var go = $('#sc-go');
    if (go) go.disabled = !ok.length;
  }
  function importGo() {
    var sc = S0();
    if (!staged || !staged.length || busy) return;
    busy = true;
    var mx = 0;
    rows.forEach(function (r) { if (r.sort > mx) mx = r.sort; });
    var payload = staged.map(function (r, i) {
      var rec = { sort: mx + (i + 1) * 10, status: 'published', updated_by: (S && S.email) || '' };
      for (var k in r) if (r.hasOwnProperty(k)) rec[k] = r[k];
      for (var k2 in sc.fixed) if (sc.fixed.hasOwnProperty(k2)) rec[k2] = sc.fixed[k2];
      return rec;
    });
    var go = $('#sc-go');
    if (go) { go.disabled = true; go.textContent = 'جارٍ الإضافة…'; }
    api(sc.table + '?select=id', { method: 'POST', body: JSON.stringify(payload) })
      .then(function (out) {
        var n = (out || []).length;
        close();
        return load().then(function () {
          paint();
          var ep = $('#sc-err');
          if (ep) ep.innerHTML = '<div class="notice" style="background:#eef4f3;border-color:#d6e5e3;color:#0c6c6c">' +
            '<b>أُضيف ' + n + ' سجلًّا.</b> يظهر في الموقع عند أوّل تحميل للصفحة.</div>';
        });
      })
      .catch(function (e) { err = e.message; close(); paint(); })
      .then(function () { busy = false; });
  }

  /* ------------------------------ الأحداث ------------------------------ */
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-sc]') : null;
    if (!b) return;
    var a = b.getAttribute('data-sc'), id = b.getAttribute('data-id');
    if (a === 'close') { e.preventDefault(); close(); return; }
    if (a === 'tpl') { e.preventDefault(); downloadTemplate(); return; }
    if (a === 'add') { e.preventDefault(); openForm(null); return; }
    if (a === 'import') { e.preventDefault(); openImport(); return; }
    if (a === 'importgo') { e.preventDefault(); importGo(); return; }
    if (a === 'save') { e.preventDefault(); saveForm(id); return; }
    if (a === 'del') { e.preventDefault(); askDelete(id); return; }
    if (a === 'delyes') { e.preventDefault(); doDelete(id); return; }
    if (a === 'reload') { e.preventDefault(); load().then(paint); return; }
    if (a === 'search') {
      e.preventDefault();
      var i2 = $('#sc-q');
      q = i2 ? norm(i2.value) : '';
      paint();
      return;
    }
    if (a === 'edit') {
      e.preventDefault();
      var row = null;
      rows.forEach(function (x) { if (String(x.id) === String(id)) row = x; });
      if (row) openForm(row);
    }
  });

  return { view: view, keys: Object.keys(SCREENS), nav: function (k) { return SCREENS[k].nav; } };
})();
