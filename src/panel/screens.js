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
  /* تصنيفات الوثائق — القيم مقيَّدة في القاعدة بـ check، فلا تُزَد من هنا */
  var KIND = { contact: 'تواصل', volunteer: 'تطوّع', membership: 'طلب عضوية', jobs: 'توظيف' };
  var SUBST = { 'new': 'جديد', in_progress: 'قيد المعالجة', closed: 'مُغلق', archived: 'مؤرشف' };
  var PRIO = { low: 'منخفضة', normal: 'عادية', high: 'عالية' };
  /* الأهداف المسموحة: صفحات الموقع كما بناها البنّاء (IAQ_REAL.pages)، ومراسي
     الصفحة الرئيسة. تُحسب مرّةً وتُستعمل في الحقل وفي التحقّق معًا — فلا
     يفترقان ولا يمرّ رابطٌ غير موجود. */
  var ANCHORS = ['#about', '#news', '#programs', '#stats', '#testimonials', '#partners'];
  var TARGETS = null;
  function targets() {
    if (TARGETS) return TARGETS;
    TARGETS = [];
    var pages = (window.IAQ_REAL && window.IAQ_REAL.pages) || [];
    pages.forEach(function (p) {
      if (!p || !p.slug) return;
      TARGETS.push({ v: p.slug + '.html', l: (p.title || p.slug) + '  (' + p.slug + '.html)' });
    });
    ANCHORS.forEach(function (a) {
      TARGETS.push({ v: a, l: 'قسم في الرئيسة: ' + a });
    });
    return TARGETS;
  }
  function targetOk(v) {
    var s = norm(v);
    if (!s) return true;                      /* فارغ = عنصرٌ يفتح منسدلة فقط */
    if (/^https?:\/\//i.test(s)) return true;  /* رابط خارجي كامل */
    var list = targets();
    for (var i = 0; i < list.length; i++) if (list[i].v === s) return true;
    return false;
  }

  /* القيم المبنيّة وقت البناء (IAQ_REAL) — افتراضياتُ شاشة التواصل، كي لا
     تُمحى روابطٌ عاملة بحفظِ حقلٍ فارغ لم يُحمَّل أصلًا. */
  function realVal(path) {
    var o = window.IAQ_REAL || {}, parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) {
      if (o == null || typeof o !== 'object') return '';
      o = o[parts[i]];
    }
    return (o == null) ? '' : o;
  }

  var ROLE = { admin: 'مالك — يكتب ويدير الحسابات',
               editor: 'محرّر — يكتب ولا يدير الحسابات',
               viewer: 'قارئ — يقرأ ولا يكتب' };
  var ROLE_SHORT = { admin: 'مالك', editor: 'محرّر', viewer: 'قارئ' };

  var CTAIC = { arrow: 'سهم (الافتراضي)', none: 'بلا أيقونة', ext: 'رابط خارجي',
                doc: 'مستند', users: 'أشخاص', star: 'نجمة', play: 'تشغيل' };
  var SURVEY = { visitors: 'زوّار الموقع', beneficiaries: 'المستفيدون', donors: 'المتبرّعون' };
  var DOCCAT = { policies: 'اللوائح والسياسات', minutes: 'محاضر الاجتماعات',
                 financials: 'القوائم المالية', annual: 'التقارير السنوية',
                 surveys: 'قياس الرضا', licenses: 'التراخيص' };
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
    home: {
      nav: 'لوحة التحكم', h1: 'لوحة التحكم',
      sub: 'أرقامٌ حقيقيّة من قاعدة البيانات — نظرةٌ عامّة، وتفصيلُ الزوّار، وسجلُّ العمل.',
      kind: 'dash'
    },
    visits: {
      nav: 'إحصاءات الزوّار', h1: 'إحصاءات الزوّار',
      sub: 'الزيارات وتعامل الزائر مع الصفحات والملفّات والأزرار.',
      kind: 'visits'
    },
    worklog: {
      nav: 'سجلّ العمل', h1: 'سجلّ العمل ومؤشّرات الردّ',
      sub: 'من فعل ماذا ومتى، وسرعة الردّ على ما يصل من الزوّار.',
      kind: 'worklog'
    },
    assembly: {
      nav: 'الجمعية العمومية', h1: 'أعضاء الجمعية العمومية',
      sub: 'بيانات الأعضاء الحاليين — تعديل وحذف وإضافة، فرديًّا أو دفعةً من ملف إكسل.',
      table: 'people', filter: 'grp=eq.assembly', fixed: { grp: 'assembly' }, audit: 1,
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
      table: 'people', filter: 'grp=eq.board', fixed: { grp: 'board' }, photoDir: 'board', audit: 1,
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
      table: 'people', filter: 'grp=eq.team', fixed: { grp: 'team' }, photoDir: 'team', audit: 1,
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
      /* audit: العمود updated_by أضافته ترقية schema-v4 */
      table: 'news', filter: '', fixed: {}, nosort: 1, order: 'date.desc,id.desc', audit: 1,
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
    heroslides: {
      settingsTitle: 'الخلفية العامّة للسلايدر',
      settings: [
        { key: 'hero_bg_image', l: 'صورة الخلفية لكل الشرائح', t: 'img',
          hint: 'تُستعمل في كل شريحةٍ لم تُحدَّد لها صورةٌ خاصّة في الجدول أدناه' },
        { key: 'hero_overlay', l: 'تعتيم فوق الصورة %', t: 'int', def: 62, min: 0, max: 100, half: 1,
          hint: 'كي يبقى النصّ مقروءًا' },
        { key: 'hero_emblem_op', l: 'شفافية شعار الخلفية %', t: 'int', def: 8, min: 0, max: 60, half: 1 }
      ],
      nav: 'السلايدر الرئيسي', h1: 'شرائح السلايدر الرئيسي',
      sub: 'الشرائح المتعاقبة في صدر الصفحة الرئيسة — نصوصها وروابطها وأيقوناتها.',
      table: 'hero_slides', filter: '', fixed: {}, audit: 1,
      nameKey: 'title', searchKeys: ['title', 'accent', 'eyebrow', 'text'],
      reach: 'يسري على الصفحة الرئيسة عند أوّل تحميل. ولا تُفرَّغ الترويسة أبدًا: ' +
             'إن لم تبقَ شريحةٌ ظاهرة بقيت الشرائح المبنيّة — فصفحةٌ رئيسة بلا عنوان أسوأ من عنوانٍ قديم.',
      fields: [
        { k: 'eyebrow', l: 'العنوان الصغير', t: 'text', hint: 'يظهر فوق العنوان بحرف صغير — اتركه فارغًا فيُخفى' },
        { k: 'title', l: 'العنوان الرئيس', t: 'text', req: 1,
          hint: 'الجزء العادي من العنوان، بلا الكلمات المميّزة' },
        { k: 'accent', l: 'الكلمات المميّزة', t: 'text',
          hint: 'تظهر في آخر العنوان بلون الهوية — مثل «أثرًا يدوم»' },
        { k: 'text', l: 'نصّ الشريحة', t: 'area' },
        { k: 'cta1_label', l: 'نصّ الزرّ الأول', t: 'text', half: 1 },
        { k: 'cta1_url', l: 'رابط الزرّ الأول', t: 'text', half: 1,
          hint: 'صفحة مثل programs.html أو مرساة مثل #about أو رابط كامل' },
        { k: 'cta1_icon', l: 'أيقونة الزرّ الأول', t: 'select', o: CTAIC, def: 'arrow' },
        { k: 'cta2_label', l: 'نصّ الزرّ الثاني', t: 'text', half: 1 },
        { k: 'cta2_url', l: 'رابط الزرّ الثاني', t: 'text', half: 1 },
        { k: 'bgfile', l: 'صورة خلفيةٍ لهذه الشريحة (اختياري)', t: 'file', accept: 'image/*',
          hint: 'اترك الحقل فارغًا فتستعمل الشريحةُ الخلفيةَ العامّة أعلاه' },
        { k: 'bg_image', l: 'رابط خلفية الشريحة', t: 'text', viaFile: 1,
          hint: 'يُملأ تلقائيًّا عند الرفع. امحُه ليعود إلى الخلفية العامّة' },
        { k: 'bg_overlay', l: 'تعتيم خلفية الشريحة %', t: 'int', half: 1,
          hint: 'اتركه فارغًا فيُستعمل التعتيم العامّ' },
        { k: 'sort', l: 'الترتيب', t: 'int', half: 1, hint: 'الأصغر أوّلًا' },
        { k: 'status', l: 'الحالة', t: 'select', o: { published: 'ظاهرة', draft: 'مسودّة (لا تظهر)' }, def: 'published', half: 1 }
      ],
      list: [{ k: 'sort', l: 'الترتيب', f: 'text' },
             { k: 'bg_image', l: 'خلفية', f: 'file' },
             { k: 'eyebrow', l: 'العنوان الصغير', f: 'text' },
             { k: 'title', l: 'العنوان', f: 'clip' },
             { k: 'accent', l: 'المميّز', f: 'chip' },
             { k: 'cta1_label', l: 'الزرّ الأول', f: 'text' },
             { k: 'cta2_label', l: 'الزرّ الثاني', f: 'text' },
             { k: 'status', l: 'الحالة', f: 'status' }],
      stats: [{ l: 'إجمالي الشرائح' }, { l: 'ظاهرة', c: 'status', v: 'published' },
              { l: 'مسودّة', c: 'status', v: 'draft' }, { l: 'بزرّ ثانٍ', has: 'cta2_label' }]
    },
    menuitems: {
      settingsTitle: 'خلفية الشريط العلويّ وألوانه',
      settings: [
        { key: 'header_mode', l: 'نمط الخلفية', t: 'select',
          o: { glass: 'زجاجيّ شفّاف (الافتراضي)', solid: 'لونٌ واحد', gradient: 'تدرّج لونيّ', image: 'صورة' }, def: 'glass',
          hint: 'الزجاجيّ يُظهر ما تحته مموّهًا — وهو المبنيّ في الموقع' },
        { key: 'header_color', l: 'اللون الأوّل', t: 'color', def: '#ffffff',
          hint: 'يُستعمل في «لونٌ واحد» و«تدرّج»، وطبقةً فوق الصورة' },
        { key: 'header_color2', l: 'اللون الثاني', t: 'color', def: '#f3f6f7',
          hint: 'للتدرّج وحده' },
        { key: 'header_angle', l: 'زاوية التدرّج', t: 'int', def: 135, min: 0, max: 360, half: 1,
          hint: 'بالدرجات — ١٣٥ افتراضًا' },
        { key: 'header_image', l: 'صورة الخلفية', t: 'img',
          hint: 'تُغطّي الشريط. اترك الحقل فارغًا لإلغائها' },
        { key: 'header_overlay', l: 'تعتيم فوق الصورة %', t: 'int', def: 55, min: 0, max: 100, half: 1,
          hint: 'كي يبقى النصّ مقروءًا فوق الصورة' },
        { key: 'header_ink', l: 'لون نصّ القائمة', t: 'color', def: '#12302c' },
        { key: 'header_hover', l: 'لون النصّ عند المرور', t: 'color', def: '#007878' },
        { key: 'header_line', l: 'لون الخطّ السفليّ', t: 'color', def: '#e6e9e9' }
      ],
      nav: 'القوائم الرئيسية', h1: 'عناصر القائمة الرئيسية',
      sub: 'تسميات عناصر القائمة وروابطها وترتيبها وظهورها — بمستويين.',
      table: 'menu_items', filter: '', fixed: {}, audit: 1, selectAll: 1,
      clientOrder: [['parent', 1], ['sort', 1], ['id', 1]],
      nameKey: 'label', searchKeys: ['label', 'href', 'mkey'],
      autoKey: 'mkey',
      groupSort: 'parent',
      delNote: 'العنصر يُرفع من القائمة في كل الصفحات. والعنصر الرئيس الذي له أبناءٌ ' +
               'تُصبح أبناؤه بلا أبٍ فلا تظهر — فانقلها إلى أبٍ آخر قبل حذفه.',
      reach: 'يسري على القائمة في كل صفحات الموقع عند أوّل تحميل. ولا تُفرَّغ القائمة أبدًا: ' +
             'إن لم يبقَ عنصرٌ رئيسٌ ظاهر بقيت القائمة المبنيّة. والعنصر الجديد يُبنى ' +
             'بمظهر العناصر القائمة بلا أيقونة، ويلزمه رابطٌ صحيح — وإلّا لم يظهر.',
      fields: [
        { k: 'label', l: 'التسمية', t: 'text', req: 1 },
        { k: 'parent', l: 'المستوى', t: 'parent', def: '',
          hint: '«عنصر رئيسي» يظهر في الشريط، والفرعيّ يظهر داخل منسدلة الأب. ' +
                'وتغييرُ هذا الحقل هو التحويل بين المستويين.' },
        { k: 'href', l: 'الرابط', t: 'href', req: 1,
          hint: 'يُختار من صفحات الموقع فقط، أو مرساة في الصفحة الرئيسة، أو رابط خارجي كامل. ' +
                'فلا يمكن أن يُفضي إلى صفحة غير موجودة.' },
        { k: 'sort', l: 'الترتيب', t: 'int', half: 1, hint: 'اتركه فارغًا فيصير آخر مستواه' },
        { k: 'visible', l: 'الظهور', t: 'bool', half: 1, def: true }
      ],
      list: [{ k: 'mkey', l: 'المفتاح', f: 'mono' },
             { k: 'parent', l: 'المستوى', f: 'level' },
             { k: 'label', l: 'التسمية', f: 'text' },
             { k: 'href', l: 'الرابط', f: 'hrefcell' },
             { k: 'sort', l: 'الترتيب', f: 'text' },
             { k: 'visible', l: 'الظهور', f: 'bool' }],
      stats: [{ l: 'إجمالي العناصر' }, { l: 'عناصر رئيسة', c: 'parent', v: '' },
              { l: 'ظاهرة', boolTrue: 'visible' }, { l: 'مخفيّة', boolFalse: 'visible' }]
    },
    pagelist: {
      nav: 'صفحات الموقع', h1: 'جرد صفحات الموقع',
      sub: 'الصفحات المبنيّة فعلًا وروابطها — للاطّلاع والمعاينة.',
      kind: 'pages',
      reach: 'إنشاء صفحة جديدة أو تغيير عنوانها يحتاج إعادة بناء — لا تُولَّد صفحة في المتصفّح. ' +
             'وإخفاء صفحة من التنقّل يُعمل من شاشة «القوائم الرئيسية».'
    },
    adminlist: {
      settingsTitle: 'أعلام النظام',
      settings: [
        { key: 'lists_from_db', l: 'قاعدة البيانات هي مصدر القوائم', t: 'bool', def: false,
          hint: 'مُطفأ: القائمة المبنيّة تبقى إن خلت القاعدة — وهو الأسلم. ' +
                'مُشعَل: قائمةٌ فارغة في القاعدة تُفرّغ القائمة في الموقع، ' +
                'فلا تُشعله إلّا بعد التأكّد من اكتمال البيانات. ' +
                'علَمٌ تقنيّ — الأصلُ إبقاؤه كما هو إلّا لسببٍ تعرفه.' }
      ],
      nav: 'المستخدمون والأدوار', h1: 'المستخدمون والأدوار',
      sub: 'من يدخل اللوحة وماذا يستطيع. الإضافة والحذف للمالك وحده.',
      table: 'admins', filter: '', fixed: {}, nosort: 1, selectAll: 1, audit: 0,
      clientOrder: [['role', 1], ['email', 1]],
      idText: 1,                 /* المفتاح uuid لا رقم */
      delNote: 'يفقد صاحبه الدخول إلى اللوحة فورًا. ولا علاقة لهذا بالموقع العلني. ' +
               'وإن أردت تقييده بلا حذفٍ فاجعل دوره «قارئ».',
      nameKey: 'email', searchKeys: ['email', 'name', 'role'],
      reach: 'هذه حسابات الدخول إلى اللوحة، لا علاقة لها بالموقع العلني. ' +
             'ولإضافة حساب يجب أن يُنشئ صاحبه كلمة مروره بنفسه من صفحة الدخول بعد إضافة بريده هنا. ' +
             'والقاعدة تمنع حذف المالك الأخير أو تنزيل دوره — فلا يُقفل النظام على أهله.',
      fields: [
        { k: 'email', l: 'البريد الإلكتروني', t: 'text', req: 1,
          hint: 'يجب أن يطابق البريد الذي يسجّل به الدخول تمامًا' },
        { k: 'name', l: 'الاسم', t: 'text' },
        { k: 'role', l: 'الدور', t: 'select', o: ROLE, def: 'editor',
          hint: 'المالك وحده يدير الحسابات. والقارئ يرى كل شيء ولا يُغيّر شيئًا.' }
      ],
      list: [{ k: 'email', l: 'البريد', f: 'mono' },
             { k: 'name', l: 'الاسم', f: 'text' },
             { k: 'role', l: 'الدور', f: 'chip', o: ROLE_SHORT },
             { k: 'created_at', l: 'أُضيف في', f: 'datetime' }],
      stats: [{ l: 'إجمالي الحسابات' }, { l: 'مالك', c: 'role', v: 'admin' },
              { l: 'محرّر', c: 'role', v: 'editor' }, { l: 'قارئ', c: 'role', v: 'viewer' }]
    },
    blankpages: {
      nav: 'الصفحات الجاهزة', h1: 'الصفحات الجاهزة الفارغة',
      sub: 'عشر صفحاتٍ مبنيّةٍ سلفًا وفارغة — املأ ما تحتاجه منها ثم أضفه إلى القائمة.',
      kind: 'settings',
      reach: 'تسري على الصفحة المختارة عند أوّل تحميل بلا إعادة بناء: عنوانها ونصوصها ' +
             'وعنوان تبويب المتصفّح. والكتلة التي يخلو عنوانها ونصُّها تُخفى تلقائيًّا. ' +
             'ولإظهارها للزوّار أضف عنصرًا إلى «القائمة العلوية» يشير إليها. ' +
             'وحدٌّ صريح: الصفحة الفارغة لا تُفهرَس في محرّكات البحث ولا تدخل خريطة ' +
             'الموقع — فلإدخالها يلزم إعادة نشرٍ واحدة بعد أن تملأها.',
      rows: function () { return blankRows(); }
    },

    footcfg: {
      nav: 'التذييل', h1: 'التذييل — الخلفية والنصوص',
      sub: 'خلفية شريط التذييل وألوانه ونصوصه الثابتة — تسري على كل صفحات الموقع.',
      kind: 'settings',
      reach: 'يسري على تذييل كل الصفحات عند أوّل تحميل بلا إعادة بناء. وأمّا الهاتف والبريد ' +
             'وروابط المنصّات فمكانها شاشة «التواصل والروابط» — فهي تظهر في التذييل وفي صفحة ' +
             '«تواصل معنا» معًا.',
      rows: [
        { key: 'footer_mode', l: 'نمط الخلفية', t: 'select', o: { solid: 'لونٌ واحد (الافتراضي)', gradient: 'تدرّج لونيّ', image: 'صورة' }, def: 'solid' },
        { key: 'footer_color', l: 'اللون الأوّل', t: 'color', def: '#04342c',
          hint: 'يُستعمل في «لونٌ واحد» و«تدرّج»، وطبقةً فوق الصورة' },
        { key: 'footer_color2', l: 'اللون الثاني', t: 'color', def: '#063f36',
          hint: 'للتدرّج وحده' },
        { key: 'footer_angle', l: 'زاوية التدرّج', t: 'int', def: 135, min: 0, max: 360, half: 1 },
        { key: 'footer_image', l: 'صورة الخلفية', t: 'img',
          hint: 'اترك الحقل فارغًا لإلغائها' },
        { key: 'footer_overlay', l: 'تعتيم فوق الصورة %', t: 'int', def: 78, min: 0, max: 100, half: 1,
          hint: 'التذييل نصُّه فاتحٌ، فيحتاج تعتيمًا أقوى من الترويسة' },
        { key: 'footer_ink', l: 'لون النصّ', t: 'color', def: '#bfd0cd' },
        { key: 'footer_head', l: 'لون العناوين', t: 'color', def: '#ffffff' },
        { key: 'footer_line', l: 'لون الخطوط الفاصلة', t: 'color', def: '#28504a' },
        { key: 'footer_about', l: 'نبذة التذييل', t: 'area', dyn: 'footer.about',
          hint: 'الفقرة تحت الشعار في التذييل' },
        { key: 'footer_newsletter', l: 'نصّ النشرة', t: 'area', dyn: 'footer.newsletter' },
        { key: 'footer_rights', l: 'سطر الحقوق', t: 'text', dyn: 'footer.rights',
          hint: 'بلا سنةٍ — السنة تُحدَّث تلقائيًّا' }
      ]
    },

    contactcfg: {
      nav: 'التواصل والروابط', h1: 'بيانات التواصل والروابط الاجتماعية',
      sub: 'الهاتف والبريد وروابط المنصّات — تسري على كل صفحات الموقع.',
      kind: 'settings',
      reach: 'يسري على الترويسة والتذييل وصفحة «تواصل معنا» في كل الصفحات عند أوّل تحميل. ' +
             'والمنصّة التي يُترك رابطها فارغًا تُخفى أيقونتها، وتظهر بمجرّد وضع رابطها ' +
             '— فلا تحتاج إضافة منصّة إعادة بناء.',
      rows: [
        { key: 'contact_phone_display', l: 'الجوال كما يظهر', t: 'text', dyn: 'settings.phone',
          hint: 'مثل 0505144421 — هذا ما يقرأه الزائر' },
        { key: 'contact_phone_tel', l: 'الجوال للاتصال', t: 'text', dyn: 'settings.phoneTel',
          hint: 'بصيغة دولية مثل +966505144421 — هذا ما يُتصل به عند الضغط' },
        { key: 'contact_email', l: 'البريد الإلكتروني', t: 'text', dyn: 'settings.email' },
        { key: 'social_x', l: 'إكس (تويتر)', t: 'text', dyn: 'social.x',
          hint: 'رابط كامل يبدأ بـ https — واتركه فارغًا فيُخفى الأيقونة' },
        { key: 'social_youtube', l: 'يوتيوب', t: 'text', dyn: 'social.youtube' },
        { key: 'social_linkedin', l: 'لينكدإن', t: 'text', dyn: 'social.linkedin' },
        { key: 'social_whatsapp', l: 'واتساب', t: 'text', dyn: 'social.whatsapp' },
        { key: 'social_instagram', l: 'إنستغرام', t: 'text', dyn: 'social.instagram' },
        { key: 'social_tiktok', l: 'تيك توك', t: 'text', dyn: 'social.tiktok' },
        { key: 'social_facebook', l: 'فيسبوك', t: 'text', dyn: 'social.facebook' },
        { key: 'donate_url', l: 'رابط التبرّع', t: 'text', dyn: 'donate',
          hint: 'متجر جمع التبرّعات — يُستعمل في أزرار «تبرّع»' },
        { key: 'contact_city', l: 'المدينة', t: 'text', dyn: 'settings.city' },
        { key: 'contact_addr_short', l: 'العنوان المختصر', t: 'text', dyn: 'settings.addrShort',
          hint: 'يظهر في التذييل — مثل «مدينة بريدة، المملكة العربية السعودية»' },
        { key: 'contact_addr_line', l: 'العنوان التفصيلي', t: 'text', dyn: 'settings.address',
          hint: 'الحيّ والشارع' },
        { key: 'contact_hours', l: 'ساعات العمل', t: 'text', dyn: 'settings.hours' },
        { key: 'contact_license', l: 'رقم الترخيص', t: 'text', dyn: 'settings.reg' }
      ]
    },
    sitecfg: {
      nav: 'إعدادات الهوية البصرية', h1: 'إعدادات الهوية البصرية',
      sub: 'الألوان والحواف والشعار والخطّ — أساسُ مظهر الموقع كلّه في مكانٍ واحد.',
      kind: 'settings',
      before: function () { return presetBar(); },
      reach: 'تسري على كل صفحات الموقع عند أوّل تحميل بلا إعادة بناء. وأمّا خلفية ' +
             'الشريط العلويّ فمكانها شاشة «القائمة العلوية»، وخلفية التذييل شاشة ' +
             '«التذييل»، وخلفية السلايدر شاشته، ونمط شريط الشركاء شاشته — كلٌّ في ' +
             'الشاشة التي يخصّها.',
      rows: [
        { key: 'theme.primary', l: 'اللون الأساسي (تركوازي)', t: 'color', def: '#007878',
          hint: 'يُشتقّ منه نحو عشرين لونًا في الموقع: الأزرار والأيقونات والروابط' },
        { key: 'theme.accent', l: 'لون التمييز (ذهبي)', t: 'color', def: '#c09048' },
        { key: 'theme.deep', l: 'التركوازي الغامق', t: 'color', def: '#063f36' },
        { key: 'theme.heroBg', l: 'خلفية صدر الصفحات', t: 'color', def: '#edf6f5',
          hint: 'خلفيةُ السلايدر وصدرِ الصفحات الداخلية — لا شريط القائمة' },
        { key: 'theme.bg', l: 'خلفية الصفحة', t: 'color', def: '#ffffff' },
        { key: 'theme.surface', l: 'خلفية البطاقات', t: 'color', def: '#ffffff' },
        { key: 'theme.surface2', l: 'خلفية الأقسام', t: 'color', def: '#f5f8f8' },
        { key: 'theme.ink', l: 'لون العناوين', t: 'color', def: '#0f2a2a' },
        { key: 'theme.body', l: 'لون النصّ', t: 'color', def: '#47534f' },
        { key: 'theme.radius', l: 'استدارة الحواف', t: 'int', def: 12, min: 0, max: 24,
          unit: 'بكسل', hint: 'صفر = حوافٌّ حادّة' },
        { key: 'site_logo', l: 'شعار الموقع', t: 'img', def: '',
          accept: '.png,.svg,.webp,.jpg,.jpeg,image/*',
          hint: 'اختر صورة فتُرفع ويُستبدل الشعار في الترويسة والتذييل وخلفية السلايدر. ' +
                'يُفضَّل PNG أو SVG بخلفية شفّافة وارتفاع 120 بكسلًا على الأقل. ' +
                'واتركه فارغًا فيبقى الشعار المبنيّ.' },
        { key: 'site_font', l: 'خطّ المنصّة', t: 'select', def: 'IBM Plex Sans Arabic',
          o: { 'IBM Plex Sans Arabic': 'آي بي إم بلكس عربي — هندسيّ مؤسسيّ (الموصى به)',
               'Cairo': 'القاهرة — شائع في المواقع المؤسسية',
               'Tajawal': 'تجوال — هندسيّ خفيف',
               'Readex Pro': 'ريدكس برو — حديث مستدير',
               'El Messiri': 'الميسري — بأثرٍ خطّيّ' },
          hint: 'يسري على كل نصوص الموقع: العناوين والنصوص واسم الجمعية معًا. ' +
                'الخطوط مستضافة في الموقع نفسه فلا اتصال بخدمة خارجية. ' +
                'وفراغات القائمة تُشدّ آليًّا مع الخطوط العريضة كي لا تفيض الترويسة.' },
      ]
    },
    subslist: {
      nav: 'الطلبات والنماذج', h1: 'الطلبات والنماذج الواردة',
      sub: 'ما يرسله الزوّار من نماذج التواصل والتطوّع والعضوية والتوظيف — عرض ومتابعة حالة.',
      table: 'submissions', filter: '', fixed: {}, nosort: 1, selectAll: 1,
      clientOrder: [['created_at', -1], ['id', -1]],
      /* الوارد لا يُنشأ من اللوحة ولا يُمحى: لا سياسة حذف في القاعدة، ومحو
         طلبٍ وصل يُفقد أثرًا قد يُسأل عنه. الأرشفة تكفي لإخفائه. */
      noAdd: 1, noDelete: 1, audit: 0,
      nameKey: 'id',
      reach: 'هذه بيانات واردة من زوّار الموقع، لا تُنشر عليه. تغيير الحالة والأولوية للمتابعة الداخلية فقط.',
      searchFn: function (r) {
        return (KIND[r.kind] || r.kind || '') + ' ' + (SUBST[r.status] || '') + ' ' +
               JSON.stringify(r.payload || {});
      },
      detail: function (r) {
        return pairsBox('بيانات الطلب', r.payload) +
          '<p class="muted small">وصل في ' + esc(dtLabel(r.created_at)) + '</p>';
      },
      fields: [
        { k: 'status', l: 'الحالة', t: 'select', o: SUBST, def: 'new', half: 1 },
        { k: 'priority', l: 'الأولوية', t: 'select', o: PRIO, def: 'normal', half: 1 }
      ],
      list: [{ k: 'created_at', l: 'وصل في', f: 'datetime' },
             { k: 'kind', l: 'النموذج', f: 'chip', o: KIND },
             { k: 'payload', l: 'المُرسِل', f: 'who' },
             { k: 'payload', l: 'المحتوى', f: 'gist' },
             { k: 'status', l: 'الحالة', f: 'chip', o: SUBST },
             { k: 'priority', l: 'الأولوية', f: 'chip', o: PRIO }],
      stats: [{ l: 'إجمالي الطلبات' }, { l: 'جديد', c: 'status', v: 'new' },
              { l: 'قيد المعالجة', c: 'status', v: 'in_progress' },
              { l: 'أولوية عالية', c: 'priority', v: 'high' }],
      exportCols: [
        { l: 'وصل في', w: 20, get: function (r) { return dtLabel(r.created_at); } },
        { l: 'النموذج', w: 14, get: function (r) { return KIND[r.kind] || r.kind || ''; } },
        { l: 'الحالة', w: 14, get: function (r) { return SUBST[r.status] || r.status || ''; } },
        { l: 'الأولوية', w: 12, get: function (r) { return PRIO[r.priority] || r.priority || ''; } },
        { l: 'البيانات', w: 80, get: function (r) { return flatPairs(r.payload); } }
      ],
      exportName: 'الطلبات-الواردة.xlsx'
    },
    surveylist: {
      nav: 'استجابات قياس الرضا', h1: 'استجابات استبيانات الرضا',
      sub: 'ما سجّله الزوّار والمستفيدون والمتبرّعون من درجات وملاحظات.',
      table: 'survey_responses', filter: '', fixed: {}, nosort: 1, selectAll: 1,
      clientOrder: [['created_at', -1], ['id', -1]],
      /* القاعدة لا تمنح المدير غير القراءة على هذا الجدول (سياسة select وحدها)،
         فلا نعرض أزرارًا تُفضي إلى رفض. */
      noAdd: 1, noDelete: 1, viewOnly: 1, audit: 0,
      nameKey: 'id',
      reach: 'استجابات واردة من الزوّار — للقراءة والتحليل فقط، لا تُنشر على الموقع ولا تُعدَّل.',
      searchFn: function (r) {
        return (SURVEY[r.survey_type] || '') + ' ' + (r.program || '') + ' ' + (r.comment || '');
      },
      detail: function (r) {
        return pairsBox('الدرجات', r.ratings) +
          (norm(r.program) ? '<p><b>البرنامج:</b> ' + esc(r.program) + '</p>' : '') +
          (norm(r.comment) ? '<p><b>الملاحظة:</b><br>' + esc(r.comment) + '</p>' : '') +
          '<p class="muted small">وصلت في ' + esc(dtLabel(r.created_at)) + '</p>';
      },
      fields: [],
      list: [{ k: 'created_at', l: 'وصلت في', f: 'datetime' },
             { k: 'survey_type', l: 'الاستبيان', f: 'chip', o: SURVEY },
             { k: 'ratings', l: 'المتوسّط', f: 'avg' },
             { k: 'ratings', l: 'عدد الأسئلة', f: 'keys' },
             { k: 'program', l: 'البرنامج', f: 'clip' },
             { k: 'comment', l: 'الملاحظة', f: 'clip' }],
      stats: [{ l: 'إجمالي الاستجابات' },
              { l: SURVEY.visitors, c: 'survey_type', v: 'visitors' },
              { l: SURVEY.beneficiaries, c: 'survey_type', v: 'beneficiaries' },
              { l: SURVEY.donors, c: 'survey_type', v: 'donors' }],
      exportCols: [
        { l: 'وصلت في', w: 20, get: function (r) { return dtLabel(r.created_at); } },
        { l: 'الاستبيان', w: 16, get: function (r) { return SURVEY[r.survey_type] || r.survey_type || ''; } },
        { l: 'المتوسّط', w: 10, get: function (r) { return avgOf(r.ratings); } },
        { l: 'البرنامج', w: 24, get: function (r) { return r.program || ''; } },
        { l: 'الدرجات', w: 70, get: function (r) { return flatPairs(r.ratings); } },
        { l: 'الملاحظة', w: 60, get: function (r) { return r.comment || ''; } }
      ],
      exportName: 'استجابات-قياس-الرضا.xlsx'
    },
    docs: {
      nav: 'الوثائق والملفات', h1: 'الوثائق والملفات',
      sub: 'لوائح ومحاضر وقوائم مالية وتقارير — تحرير البيانات ورفع ملف PDF جديد.',
      table: 'documents', filter: '', fixed: {}, nosort: 1, selectAll: 1, audit: 'auto',
      groupSort: 'category',
      clientOrder: [['category', 1, DOCCAT], ['sort', 1], ['id', 1]],
      nameKey: 'title', searchKeys: ['title', 'storage_path'],
      reach: 'التعديل والحذف والإضافة تسري على تبويبات الملفات في صفحة «الحوكمة والإفصاح» وصفحة «قياس الرضا» عند أوّل تحميل، بلا إعادة بناء. ومعرض التراخيص مبنيّ ثابتًا (يحتاج صور الشهادات وجدول بياناتها) فلا تصله هذه الشاشة.',
      fields: [
        { k: 'category', l: 'التصنيف', t: 'select', o: DOCCAT, def: 'policies',
          hint: 'يحدّد التبويب الذي يظهر فيه الملف' },
        { k: 'title', l: 'عنوان الوثيقة', t: 'text', req: 1 },
        { k: 'file', l: 'ملف PDF جديد (اختياري)', t: 'file',
          hint: 'اختر ملفًا فيُرفع إلى تخزين الموقع ويحلّ محلّ الرابط أدناه. واتركه فارغًا فيبقى الرابط كما هو.' },
        { k: 'storage_path', l: 'رابط الملف', t: 'text', req: 1, viaFile: 1,
          hint: 'يُنشأ تلقائيًّا من العنوان والتصنيف عند رفع ملف. ويُحرَّر يدويًّا لملفٍّ داخل الموقع مثل files/policies/bylaws.pdf' },
        { k: 'size_label', l: 'حجم الملف', t: 'text', half: 1,
          hint: 'يُقرأ من الملف تلقائيًّا' },
        { k: 'pages', l: 'عدد الصفحات', t: 'int', half: 1,
          hint: 'يُحسب من الملف تلقائيًّا' },
        { k: 'sort', l: 'الترتيب', t: 'int', half: 1, needs: 'sort',
          hint: 'اتركه فارغًا فيصير آخر ملفٍّ في تصنيفه' },
        { k: 'status', l: 'الحالة', t: 'select', o: { published: 'ظاهر على الموقع', draft: 'مسودّة (لا تظهر)' }, def: 'published' }
      ],
      list: [{ k: 'category', l: 'التصنيف', f: 'chip', o: DOCCAT },
             { k: 'title', l: 'العنوان', f: 'clip' },
             { k: 'size_label', l: 'الحجم', f: 'text' },
             { k: 'pages', l: 'صفحات', f: 'text' },
             { k: 'storage_path', l: 'الملف', f: 'file' },
             { k: 'status', l: 'الحالة', f: 'status' }],
      stats: [{ l: 'إجمالي الوثائق' }, { l: 'ظاهر', c: 'status', v: 'published' },
              { l: DOCCAT.policies, c: 'category', v: 'policies' },
              { l: DOCCAT.minutes, c: 'category', v: 'minutes' }]
    },
    partnerlist: {
      settingsTitle: 'طريقة عرض شريط الشركاء',
      settings: [
        { key: 'partners_strip_mode', l: 'نمط العرض', t: 'select',
          o: { auto: 'تمريرٌ متّصل لا ينقطع', manual: 'تحريكٌ يدويّ بالأسهم والسحب',
               fade: 'تبديل مجموعاتٍ بالتلاشي' }, def: 'auto' },
        { key: 'partners_strip_speed', l: 'سرعة التمرير (ثانية للدورة)', t: 'int',
          def: 42, min: 10, max: 180, half: 1,
          hint: 'الأكبر أبطأ. يخصّ النمط المتّصل وحده' }
      ],
      nav: 'الشركاء', h1: 'شعارات الشركاء',
      sub: 'شركاء النجاح كما يظهرون في شريط الصفحة الرئيسة — تعديل وحذف وإضافة وترتيب.',
      table: 'partners', filter: '', fixed: {}, logoDir: 'partners', audit: 1,
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
  /* حارس التبديل: قراءةٌ لم تكتمل قبل الانتقال إلى شاشة أخرى تُهمَل، وإلا
     رُسمت بيانات الشاشة السابقة في جدول الشاشة الجديدة (نفس المعرّفات).
     والحارس بمفتاح الشاشة لا بعدّاد: لو أُعيد بناء العرض لنفس الشاشة مرّتين
     (وهو ما يفعله بعض مسارات التصميم) لَأَلغى العدّادُ الرسمَ فبقيت فارغة. */
  var epoch = 0;
  function alive(key) { return key === cur; }
  function S0() { return SCREENS[cur]; }

  /* ------------------------------- أدوات ------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(s) { return document.querySelector(s); }
  /* المفتاح المركّب فيه نقطة، و querySelector يُفسّرها صنفًا: «#sc-s-theme.primary»
     يعني «معرّفٌ sc-s-theme وصنفٌ primary» فلا يجد شيئًا. getElementById لا يُفسّر. */
  function byId(id) { return document.getElementById(id); }
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  /* الرمز من وحدة الجلسة لا من نسخةٍ قديمة: بعد أي تجديدٍ يصل الجديد
     إلى كل الطلبات بلا إعادة تحميل. */
  function tok() {
    return (window.IAQ_AUTH && window.IAQ_AUTH.token()) || (S ? S.access_token : '');
  }
  function hdr(json) {
    var h = { apikey: CFG.key, Authorization: 'Bearer ' + tok() };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }
  function api(path, opt, extraHeaders) {
    opt = opt || {};
    opt.headers = hdr(!!opt.body);
    if (extraHeaders) {
      for (var hk in extraHeaders) if (extraHeaders.hasOwnProperty(hk)) opt.headers[hk] = extraHeaders[hk];
    }
    function go() {
      opt.headers = hdr(!!opt.body);
      if (extraHeaders) {
        for (var k2 in extraHeaders) if (extraHeaders.hasOwnProperty(k2)) opt.headers[k2] = extraHeaders[k2];
      }
      return fetch(CFG.url + '/rest/v1/' + path, opt);
    }
    /* 401 = انتهت صلاحية الرمز: نُجدّد ونُعيد مرّةً واحدة. المحاولة الواحدة
       مقصودة — لو فشل التجديد فالخطأ يظهر للمدير ولا ندخل حلقة. */
    return go().then(function (r) {
      if (r.status !== 401 || !window.IAQ_AUTH) return r;
      return window.IAQ_AUTH.refresh().then(go).catch(function () { return r; });
    }).then(function (r) {
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
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/>' + '<circle cx="12" cy="12" r="3"/>'
  };
  function ico(k) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[k] || '') + '</svg>';
  }
  /* مقارنٌ مركّب: [['category',1,DOCCAT],['sort',1],['id',1]] — المفتاح التالي
     يفصل التعادل. والعنصر الثالث (إن وُجد) كائنٌ ترتيبُ مفاتيحه هو الترتيب
     المطلوب، فتُرتَّب التصنيفات كترتيب تبويبات الموقع لا أبجديًّا بمفاتيحها. */
  function cmp(spec) {
    return function (a, b) {
      for (var i = 0; i < spec.length; i++) {
        var k = spec[i][0], d = spec[i][1], rank = spec[i][2], x = a[k], y = b[k], c;
        if (rank) {
          var ks = Object.keys(rank), xi = ks.indexOf(x), yi = ks.indexOf(y);
          if (xi < 0) xi = ks.length;
          if (yi < 0) yi = ks.length;
          c = xi - yi;
        } else if (x == null && y == null) {
          continue;
        } else if (typeof x === 'number' && typeof y === 'number') {
          c = (x < y ? -1 : (x > y ? 1 : 0));
        } else {
          c = String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'ar');
        }
        if (c) return c * d;
      }
      return 0;
    };
  }
  /* هل يوجد العمود فعلًا في الصفوف المقروءة؟ يُستعمل مع select=* لإظهار حقلٍ
     لا وجود له قبل ترقية المخطّط، بدل أن يُرسل فيُرفض الطلب. */
  function hasCol(k) { return !!(rows.length && rows[0].hasOwnProperty(k)); }
  /* المفتاح الأوّلي رقمٌ في كل الجداول إلا admins (uuid). فالرقم يُمرَّر عددًا
     كي لا يُحقَن نصٌّ في المُصفّي، والنصّ يُرمَّز ترميز عنوان. */
  function idPart(sc, id) {
    return sc.idText ? encodeURIComponent(String(id)) : Number(id);
  }
  function auditOn(sc) { return sc.audit === 'auto' ? hasCol('updated_by') : !!sc.audit; }
  /* «2026-08-01T09:12:33Z» ← «1 أغسطس 2026 — 12:12 م» بتوقيت الرياض.
     تُستعمل toLocaleString لأن الطابع كامل بمنطقة زمنية، بخلاف عمود التاريخ. */
  function dtLabel(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var day = d.getDate(), mon = MONTHS[d.getMonth()] || (d.getMonth() + 1), yr = d.getFullYear();
    var hh = d.getHours(), mm = d.getMinutes();
    var am = hh < 12 ? 'ص' : 'م';
    var h12 = hh % 12; if (!h12) h12 = 12;
    return day + ' ' + mon + ' ' + yr + ' — ' + h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + am;
  }
  function objPairs(o) {
    var out = [];
    if (!o || typeof o !== 'object') return out;
    for (var k in o) if (o.hasOwnProperty(k)) out.push([k, o[k]]);
    return out;
  }
  function flatPairs(o) {
    return objPairs(o).map(function (p) { return p[0] + ': ' + p[1]; }).join(' | ');
  }
  function avgOf(o) {
    var v = objPairs(o).map(function (p) { return Number(p[1]); })
      .filter(function (n) { return isFinite(n); });
    if (!v.length) return '';
    var s = 0;
    v.forEach(function (n) { s += n; });
    return (Math.round((s / v.length) * 10) / 10).toFixed(1);
  }
  /* جدول مفتاح/قيمة للعرض داخل النافذة — يُبنى من الكائن كما وصل، فلا يحتاج
     معرفةً ببنية كل نموذج (النماذج تُرسل نصّ التسمية مفتاحًا). */
  function pairsBox(title, o) {
    var ps = objPairs(o);
    if (!ps.length) return '<p class="muted">لا بيانات.</p>';
    return '<div style="margin-block-end:14px"><b>' + esc(title) + '</b>' +
      '<div style="overflow-x:auto;margin-block-start:8px"><table class="tbl"><tbody>' +
      ps.map(function (p) {
        return '<tr><td style="width:38%;vertical-align:top"><b>' + esc(p[0]) + '</b></td>' +
          '<td style="white-space:pre-wrap">' + esc(p[1]) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  function fieldsOf(sc) {
    return sc.fields.filter(function (f) { return f.needs ? hasCol(f.needs) : true; });
  }
  function fieldByKey(sc, k) {
    var f = null;
    fieldsOf(sc).forEach(function (x) { if (x.k === k) f = x; });
    return f;
  }

  /* ------------------------------ القراءة ------------------------------ */
  function load() {
    var sc = S0(), myKey = cur;
    err = null;
    var cols = ['id'];
    fieldsOf(sc).forEach(function (f) {
      /* حقل الرفع ليس عمودًا في القاعدة — طلبُه في select يُفشل القراءة كلّها
         بـ«column X does not exist». وشاشة الوثائق كانت تنجو لأنّها select=*. */
      if (f.t === 'file') return;
      if (cols.indexOf(f.k) < 0) cols.push(f.k);
    });
    /* جداولٌ بلا عمود ترتيب (الأخبار) — طلبه أو الترتيب به يُفشل الطلب كلّه */
    if (!sc.nosort && cols.indexOf('sort') < 0) cols.push('sort');
    if (sc.table === 'people' && cols.indexOf('title') < 0) cols.push('title');
    /* جدولٌ قد تتغيّر أعمدته بترقية المخطّط: نطلب * ونرتّب في المتصفّح، فلا
       يُفشل طلبُ عمودٍ لم يُنشَأ بعد القراءة كلّها، ويعمل قبل الترقية وبعدها. */
    var qs = (sc.selectAll ? 'select=*' : 'select=' + cols.join(',')) +
             (sc.filter ? '&' + sc.filter : '') +
             (sc.clientOrder ? '' : '&order=' + (sc.order || 'sort.asc,id.asc')) +
             '&limit=500';
    return api(sc.table + '?' + qs)
      .then(function (r) {
        if (!alive(myKey)) return;
        rows = r || [];
        if (sc.clientOrder) rows.sort(cmp(sc.clientOrder));
      })
      .catch(function (e) { if (alive(myKey)) { rows = []; err = e.message; } });
  }

  /* ------------------------------- العرض ------------------------------- */
  function view(key) {
    if (SCREENS[key]) cur = key;
    q = ''; staged = null; err = null; rows = [];
    epoch++;
    var myKey = cur, sc = S0();
    if (sc.kind === 'settings') return settingsView(sc, myKey);
    if (sc.kind === 'pages') return pagesView(sc);
    if (sc.kind === 'dash') return dashView(sc, myKey);
    if (sc.kind === 'visits') return visitsView(sc, myKey);
    if (sc.kind === 'worklog') return worklogView(sc, myKey);
    setTimeout(function () { load().then(function () { if (alive(myKey)) paint(); }); }, 0);
    /* كتلة الإعدادات — إن كان للشاشة كتلةٌ — تُقرأ وتُرسم مستقلّةً عن الجدول،
       فلا تُسقط قراءةٌ فاشلةٌ منهما الأخرى. */
    if (sc.settings) {
      setTimeout(function () {
        loadSettings(sc).then(function () { if (alive(myKey)) paintSettings(sc); });
      }, 0);
    }
    /* الأزرار في الهيكل الثابت: لو تعذّرت القراءة تبقى الشاشة صالحة ويظهر السبب */
    return '<div class="view-head"><h1>' + esc(sc.h1) +
      '</h1>' +
      '<p>' + esc(sc.sub) + '</p></div>' +
      (sc.settings ? '<div class="iaq-card" style="margin-block-end:14px">' +
        (sc.settingsTitle ? '<h2 class="sub" style="margin-block-start:0">' + esc(sc.settingsTitle) + '</h2>' : '') +
        '<div id="sc-form"><div class="muted">جارٍ التحميل…</div></div></div>' : '') +
      '<div class="iaq-card" style="margin-block-end:14px">' + toolbar(sc) +
        '<div id="sc-diag" class="muted small">جارٍ التحميل…</div></div>' +
      '<div id="sc-err"></div><div id="sc-stats"></div>' +
      '<div class="iaq-card"><div id="sc-list"></div>' +
        '<p class="muted small" style="margin-block-start:12px">' + esc(sc.reach) + '</p></div>';
  }
  /* ======================= شاشة إعدادات (نموذج) =======================
     تقرأ صفوفًا مُسمّاة من جدول settings وتكتبها عامّةً — فيقرأها الموقع.
     ليست جدول سجلّات فلا تُستخدم دوالّ القوائم هنا. */
  var setVals = {};

  /* ---------------- الهوية البصرية ----------------
     الأنماط الستّة منقولةٌ كما هي من الشاشة السابقة: إسقاطُ ميزةٍ قائمةٍ في
     أثناء «تنظيم» انحدار. وحُذفت منها الحقول الميّتة (خطّا العناوين والنصّ
     والنمط الهندسيّ) فلا تُكتب قيمٌ لا يقرؤها أحد. */
  var BRAND_PRESETS = {
    hybrid:    { l: 'العصري النظيف (الحالي)', primary: '#007878', accent: '#c09048', deep: '#063f36',
                 bg: '#ffffff', surface: '#ffffff', surface2: '#f5f8f8', ink: '#0f2a2a',
                 body: '#47534f', heroBg: '#edf6f5', radius: 12 },
    editorial: { l: 'التحريري', primary: '#007878', accent: '#d9a441', deep: '#1c1a15',
                 bg: '#faf7f1', surface: '#fffdf9', surface2: '#f3efe6', ink: '#1c1a15',
                 body: '#403d34', heroBg: '#1c1a15', radius: 0 },
    bold:      { l: 'الجريء', primary: '#007878', accent: '#c09048', deep: '#052e29',
                 bg: '#ffffff', surface: '#ffffff', surface2: '#f2f7f6', ink: '#082523',
                 body: '#3a4746', heroBg: '#007878', radius: 16 },
    human:     { l: 'الإنساني', primary: '#0f6e56', accent: '#c09048', deep: '#0c342c',
                 bg: '#fdf9f2', surface: '#fffdf9', surface2: '#f6efe3', ink: '#2a2a26',
                 body: '#4a4a42', heroBg: '#0f6e56', radius: 20 },
    dark:      { l: 'الداكن الفخم', primary: '#c09048', accent: '#e8c98a', deep: '#04231f',
                 bg: '#062b26', surface: '#0b3a33', surface2: '#083029', ink: '#f3ece0',
                 body: '#c9d3cf', heroBg: '#04231f', radius: 12 },
    geo:       { l: 'الهندسي', primary: '#007878', accent: '#c09048', deep: '#063f36',
                 bg: '#f6f3ec', surface: '#fffdf7', surface2: '#efeadd', ink: '#14322e',
                 body: '#41504c', heroBg: '#063f36', radius: 6 }
  };

  function presetBar() {
    var ks = Object.keys(BRAND_PRESETS);
    return '<div class="fld"><label>أنماط جاهزة</label>' +
      '<div class="addrow" style="flex-wrap:wrap;gap:8px">' +
      ks.map(function (k) {
        return '<button type="button" class="btn ghost sm" data-brandpreset="' + k + '">' +
          esc(BRAND_PRESETS[k].l) + '</button>';
      }).join('') + '</div>' +
      '<div class="muted small" style="margin-block-start:6px">' +
      'يملأ حقول الألوان والحواف أدناه، ولا يُحفظ حتى تضغط «حفظ الإعدادات» — ' +
      'فتستطيع التعديل عليه قبل الحفظ.</div></div>';
  }

  /* مستمعٌ مفوَّضٌ للأنماط: يعمل بعد كل إعادة رسم */
  /* السمة data-preset يملكها ملفّ التصميم بمعالجٍ عالميّ على document
     يُبدّل الشاشة ويكتب في صفٍّ غير علنيّ — فنستعمل سمةً خاصّةً بنا. */
  var presetWired = false;
  function wirePresets() {
    if (presetWired) return;
    presetWired = true;
    var area = document.getElementById('viewArea') || document.body;
    area.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-brandpreset]');
      if (!b) return;
      e.preventDefault();
      var p = BRAND_PRESETS[b.getAttribute('data-brandpreset')];
      if (!p) return;
      Object.keys(p).forEach(function (k) {
        if (k === 'l') return;
        var el = document.getElementById('sc-s-theme.' + k);
        if (!el) return;
        el.value = String(p[k]);
        var pick = document.getElementById('sc-s-theme.' + k + '-p');
        if (pick && /^#[0-9a-fA-F]{6}$/.test(String(p[k]))) pick.value = String(p[k]);
      });
      var m = $('#sc-setmsg');
      if (m) { m.style.color = ''; m.textContent = 'مُلئت الحقول من نمط «' + p.l + '» — اضغط «حفظ الإعدادات» لتطبيقه.'; }
    });
  }

  /* ---------------- الصفحات الجاهزة الفارغة ----------------
     المُنتقى يُحفظ في المتصفّح لا في القاعدة: هو اختيارُ عرضٍ لا إعدادَ موقع. */
  var BLANK_N = 10, BLANK_BLOCKS = 4;
  var blankPick = 'page-1';
  try {
    var bp = localStorage.getItem('iaq_blank_pick');
    if (bp && /^page-([1-9]|10)$/.test(bp)) blankPick = bp;
  } catch (e) { }

  function blankOpts() {
    var o = {};
    for (var i = 1; i <= BLANK_N; i++) o['page-' + i] = 'صفحة إضافية ' + i + '  (page-' + i + '.html)';
    return o;
  }

  function blankRows() {
    var s = blankPick;
    var r = [{ key: '__pick', l: 'أيّ صفحةٍ تُحرّر؟', t: 'select', o: blankOpts(), def: s,
               local: 1, hint: 'اختر الصفحة فتظهر حقولها. والحفظ يخصّ المختارة وحدها' },
             { key: 'page_' + s + '_title', l: 'عنوان الصفحة', t: 'text',
               hint: 'يظهر في صدر الصفحة وفي تبويب المتصفّح' },
             { key: 'page_' + s + '_crumb', l: 'نصّ مسار التنقّل', t: 'text',
               hint: 'اتركه فارغًا فيتبع العنوان' },
             { key: 'page_' + s + '_lead', l: 'المقدّمة', t: 'area' }];
    for (var i = 1; i <= BLANK_BLOCKS; i++) {
      r.push({ key: 'page_' + s + '_h' + i, l: 'عنوان الكتلة ' + i, t: 'text' });
      r.push({ key: 'page_' + s + '_t' + i, l: 'نصّ الكتلة ' + i, t: 'area',
               hint: i === 1 ? 'الكتلة التي يخلو عنوانها ونصُّها تُخفى من الصفحة' : '' });
    }
    return r;
  }

  /* صفوف الإعدادات: شاشةُ إعداداتٍ خالصة تُعرّفها في rows، وشاشةُ جدولٍ
     تُعرّف كتلتها في settings — فتصلح الماكينة نفسها للاثنين. */
  function setRows(sc) {
    var r = sc.rows || sc.settings || [];
    /* دالّةٌ لا مصفوفة: شاشة الصفحات الجاهزة تُحسب حقولها من الصفحة المختارة */
    return (typeof r === 'function') ? r() : r;
  }

  function settingsView(sc, myKey) {
    setVals = {};
    setTimeout(function () {
      loadSettings(sc).then(function () { if (alive(myKey)) paintSettings(sc); });
    }, 0);
    return '<div class="view-head"><h1>' + esc(sc.h1) +
      '</h1>' +
      '<p>' + esc(sc.sub) + '</p></div>' +
      '<div id="sc-err"></div>' +
      '<div class="iaq-card"><div id="sc-form"><div class="muted">جارٍ التحميل…</div></div></div>';
  }

  /* ====================== قراءة المناظر المُجمَّعة ======================
     PostgREST لا يجمع، فالتجميع في مناظر مبوّبة باليوم. نقرأ مدى الأيام
     ونطبق الجمع على عشرات الصفوف في المتصفّح — رخيصٌ ودقيق. */
  var RANGE = 30;                      /* المدى الافتراضي بالأيام — صفرٌ = منذ الإنشاء */
  /* المدى الفعليّ للحساب حين يكون صفرًا: أقدمُ يومٍ في البيانات، فتُرسم السلسلة
     كاملةً ولا تُقصّ عند ثلاثين يومًا. */
  function spanOf(rows) {
    var min = null;
    (rows || []).forEach(function (r) {
      var d = String(r.day || '');
      if (d && (min === null || d < min)) min = d;
    });
    if (!min) return 30;
    var days = Math.ceil((Date.now() - new Date(min + 'T00:00:00').getTime()) / 86400000) + 1;
    return Math.max(7, Math.min(days, 1460));
  }
  function dayStr(back) {
    var d = new Date(Date.now() - back * 86400000);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  /* days = 0 تعني «منذ الإنشاء»: بلا ترشيح يومٍ أصلًا فلا حدَّ سفليّ. والسقف
     يُرفع مع طول المدى — ٣٦٥ يومًا × عدد المسارات قد يتجاوز عشرين ألف صفّ. */
  function readView(name, days, extra) {
    var lim = (!days || days > 180) ? 100000 : 20000;
    var q = name + '?select=*' +
            (days ? '&day=gte.' + dayStr(days - 1) : '') +
            '&limit=' + lim + (extra || '');
    return api(q).catch(function (e) { err = e.message; return []; });
  }
  /* يجمع صفوف المنظر على مفتاحٍ واحد */
  function sumBy(rows, keyFn, filter) {
    var m = {}, order = [];
    (rows || []).forEach(function (r) {
      if (filter && !filter(r)) return;
      var k = keyFn(r);
      if (k == null || k === '') k = '(مباشرة)';
      if (!(k in m)) { m[k] = 0; order.push(k); }
      m[k] += Number(r.n) || 0;
    });
    return order.map(function (k) { return { l: k, n: m[k] }; })
      .sort(function (a, b) { return b.n - a.n; });
  }
  function total(rows, filter) {
    var s = 0;
    (rows || []).forEach(function (r) { if (!filter || filter(r)) s += Number(r.n) || 0; });
    return s;
  }
  /* ------------------ صحّةُ أرقام الزوّار ------------------
     الإدراجُ مفتوحٌ للزائر بالضرورة (لا حساب ولا معرّف)، فالرقمُ قابلٌ للتلفيق
     مبدئيًّا. وترقيةُ v11 تحدُّ حجمَ التلفيق بسقفٍ يوميّ وتمنع تلفيقَ التاريخ —
     لكنّ السقفَ الصامت كذبةٌ ثانية: يومٌ بلغه يُعرض قياسًا وهو حدٌّ. فنقرأ
     v_views_health ونُعلن. والمنظرُ غيرُ موجودٍ قبل v11: نصمت ولا نُخيف. */
  function readHealth() {
    return api('v_views_health?select=*&limit=1')
      .then(function (r) { return (r && r[0]) || null; })
      .catch(function () { return null; });
  }
  function healthNotice(h) {
    if (!h) return '';
    var msgs = [];
    if (Number(h.capped_days) > 0) {
      msgs.push('<b>' + Number(h.capped_days) + ' يومًا بلغ سقفَ التسجيل (' +
        Number(h.cap) + ' سطرًا لليوم).</b> أرقامُ تلك الأيام حدٌّ لا قياس: ' +
        'الحقيقةُ عندها أو أكثر، وقد يكون بعضُها تضخيمًا مقصودًا.');
    }
    if (Number(h.future_rows) > 0) {
      msgs.push('<b>' + Number(h.future_rows) + ' سطرًا بتاريخٍ في المستقبل.</b> ' +
        'أُدرجت قبل ترقية v11 حين كان تلفيقُ التاريخ ممكنًا — احذفها من ' +
        'قاعدة البيانات كي لا تُسمّم المقارنات.');
    }
    if (!msgs.length) return '';
    return '<div class="notice" style="background:#fdf1ec;border-color:#f0cdbc;color:#8c3d1c;' +
      'margin-block-end:14px">' + msgs.join('<br><br>') + '</div>';
  }

  /* عمرٌ بالمللي ثانية إلى عبارةٍ عربية. مشتركٌ بين تبويبَي اللوحة كي لا
     يفترق الرقمُ نفسه بينهما كما افترق سلفًا. */
  function ageLabel(ms) {
    if (ms == null) return '—';
    var h = ms / 3600000;
    if (h < 1) return Math.round(h * 60) + ' دقيقة';
    if (h < 48) return Math.round(h) + ' ساعة';
    return Math.round(h / 24) + ' يومًا';
  }
  /* سلسلة يوميّة كاملة — الأيام الخالية أصفار كي لا يكذب الرسم */
  function series(rows, days, filter) {
    var m = {};
    (rows || []).forEach(function (r) {
      if (filter && !filter(r)) return;
      m[r.day] = (m[r.day] || 0) + (Number(r.n) || 0);
    });
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = dayStr(i);
      out.push({ x: d, t: d.slice(5).replace('-', '/'), y: m[d] || 0 });
    }
    return out;
  }
  function rangeBar(d) {
    var OPTS = [[7, 'أسبوع'], [30, '٣٠ يومًا'], [90, '٩٠ يومًا'],
                [365, 'سنة'], [0, 'منذ الإنشاء']];
    return '<div class="addrow" style="margin-block-end:14px;flex-wrap:wrap">' +
      OPTS.map(function (o) {
        return '<button class="btn ' + (Number(d) === o[0] ? '' : 'ghost') +
          '" data-sc="range" data-d="' + o[0] + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>';
  }
  function card(title, body, note) {
    return '<div class="iaq-card" style="margin-block-end:14px">' +
      '<h3 style="margin:0 0 12px;font-family:var(--disp);font-size:1.04rem">' + esc(title) + '</h3>' +
      body + (note ? '<p class="muted small" style="margin-block-start:10px">' + esc(note) + '</p>' : '') + '</div>';
  }
  function grid(n) { return '<div class="stat-grid" style="grid-template-columns:repeat(' + n + ',1fr)">'; }

  /* ============================ رسوم SVG ============================
     تُرسم بأيدينا لا بمكتبة: اللوحة ملفٌّ واحد بلا تبعية خارجية (وهذا يمنع
     أيضًا إرسال أي بيانات إلى طرفٍ ثالث). والقياسات نسبية فتتّسع للحاوية. */
  function svgEsc(s) { return esc(s); }
  function niceMax(v) {
    if (v <= 5) return 5;
    var p = Math.pow(10, String(Math.floor(v)).length - 1);
    return Math.ceil(v / p) * p;
  }

  /* خطّ زمنيّ بمنطقة مظلّلة. pts = [{x:'2026-08-01', y:12}, …] */
  function chartLine(pts, opt) {
    opt = opt || {};
    /* bare: شريطٌ صغيرٌ داخل بطاقة رقم — بلا شبكةٍ ولا تسمياتٍ ولا نقاط،
       فالمساحة 34px لا تتّسع لها والغرضُ اتجاهٌ لا قراءةُ قيم. */
    var W = 720, H = opt.h || 190;
    var PL = opt.bare ? 0 : 42, PR = opt.bare ? 0 : 8;
    var PT = opt.bare ? 2 : 12, PB = opt.bare ? 2 : 26;
    if (!pts.length) return '<div class="muted" style="padding:22px;text-align:center">لا بيانات في هذا المدى.</div>';
    var max = niceMax(Math.max.apply(null, pts.map(function (p) { return p.y; })) || 1);
    var iw = W - PL - PR, ih = H - PT - PB;
    var n = pts.length;
    function X(i) { return PL + (n === 1 ? iw / 2 : (iw * i) / (n - 1)); }
    function Y(v) { return PT + ih - (ih * v) / max; }
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
    var area = line + ' L' + X(n - 1).toFixed(1) + ' ' + (PT + ih) + ' L' + X(0).toFixed(1) + ' ' + (PT + ih) + ' Z';
    var grid = '', ticks = 4;
    for (var g = 0; opt.bare ? false : g <= ticks; g++) {
      var v = (max / ticks) * g, y = Y(v);
      grid += '<line x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + y.toFixed(1) +
        '" stroke="var(--line)" stroke-width="1"' + (g ? ' stroke-dasharray="3 4"' : '') + '/>' +
        '<text x="' + (PL - 6) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--muted)">' +
        Math.round(v) + '</text>';
    }
    var lab = '', step = Math.max(1, Math.ceil(n / 7));
    for (var i = 0; opt.bare ? false : i < n; i += step) {
      lab += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' +
        svgEsc(pts[i].t || pts[i].x) + '</text>';
    }
    var dots = opt.bare ? '' : pts.map(function (p, i) {
      return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="' + (n > 45 ? 1.6 : 3) +
        '" fill="var(--teal)"><title>' + svgEsc((p.t || p.x) + ' — ' + p.y) + '</title></circle>';
    }).join('');
    if (opt.bare) {
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
        'style="width:100%;height:' + H + 'px;display:block" aria-hidden="true">' +
        '<path d="' + area + '" fill="var(--teal)" opacity=".14"/>' +
        '<path d="' + line + '" fill="none" stroke="var(--teal)" stroke-width="3" ' +
        'stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block" role="img" ' +
      'aria-label="' + svgEsc(opt.label || 'اتجاه زمنيّ') + '">' + grid +
      '<path d="' + area + '" fill="var(--teal)" opacity=".10"/>' +
      '<path d="' + line + '" fill="none" stroke="var(--teal)" stroke-width="2.2" stroke-linejoin="round"/>' +
      dots + lab + '</svg>';
  }

  /* أعمدة أفقية — أفقيّة لأن التسميات العربية طويلة والعمودية تقطعها */
  function chartBars(items, opt) {
    opt = opt || {};
    if (!items.length) return '<div class="muted" style="padding:22px;text-align:center">لا بيانات.</div>';
    var top = items.slice(0, opt.top || 10);
    var max = Math.max.apply(null, top.map(function (i) { return i.n; })) || 1;
    return '<div style="display:grid;gap:8px">' + top.map(function (it) {
      var pct = Math.max(2, Math.round((it.n / max) * 100));
      return '<div style="display:grid;grid-template-columns:minmax(90px,38%) 1fr auto;gap:10px;align-items:center">' +
        '<div class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(it.l) + '">' +
          esc(it.l) + '</div>' +
        '<div style="background:var(--surface-2,#f5f8f8);border-radius:999px;height:12px;overflow:hidden">' +
          '<div style="width:' + pct + '%;height:100%;background:' + (opt.gold ? 'var(--gold)' : 'var(--teal)') +
          ';border-radius:999px"></div></div>' +
        '<b class="small mono">' + it.n + '</b></div>';
    }).join('') + '</div>';
  }

  /* حلقة للتركيب */
  function chartDonut(items, opt) {
    opt = opt || {};
    var tot = items.reduce(function (s, i) { return s + i.n; }, 0);
    if (!tot) return '<div class="muted" style="padding:22px;text-align:center">لا بيانات.</div>';
    var COL = ['var(--teal)', 'var(--gold)', 'var(--teal-600)', 'var(--gold-600)', 'var(--muted)'];
    var R = 54, C = 2 * Math.PI * R, off = 0, segs = '';
    items.forEach(function (it, i) {
      var frac = it.n / tot, len = C * frac;
      segs += '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + COL[i % COL.length] +
        '" stroke-width="20" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) +
        '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)">' +
        '<title>' + svgEsc(it.l + ' — ' + it.n + ' (' + Math.round(frac * 100) + '%)') + '</title></circle>';
      off += len;
    });
    var legend = items.map(function (it, i) {
      return '<div style="display:flex;align-items:center;gap:7px" class="small">' +
        '<span style="width:11px;height:11px;border-radius:3px;background:' + COL[i % COL.length] + '"></span>' +
        esc(it.l) + ' <b class="mono">' + it.n + '</b></div>';
    }).join('');
    return '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">' +
      '<svg viewBox="0 0 140 140" style="width:132px;height:132px;flex:0 0 auto" role="img" aria-label="' +
      svgEsc(opt.label || 'تركيب') + '">' + segs +
      '<text x="70" y="66" text-anchor="middle" font-size="22" font-weight="700" fill="var(--ink)">' + tot + '</text>' +
      '<text x="70" y="84" text-anchor="middle" font-size="10" fill="var(--muted)">' + svgEsc(opt.unit || 'الإجمالي') + '</text>' +
      '</svg><div style="display:grid;gap:6px">' + legend + '</div></div>';
  }

  /* خريطة حرارة: أيام الأسبوع × الساعات — لمعرفة وقت ذروة الزوّار */
  var DOW = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function chartHeat(cells) {
    var max = 0, m = {};
    cells.forEach(function (c) {
      m[c.dow + '_' + c.hour] = c.n;
      if (c.n > max) max = c.n;
    });
    if (!max) return '<div class="muted" style="padding:22px;text-align:center">لا بيانات بعد.</div>';
    var out = '<div style="overflow-x:auto"><table style="border-collapse:separate;border-spacing:2px;direction:rtl">' +
      '<thead><tr><th></th>';
    for (var h = 0; h < 24; h += 2) {
      out += '<th colspan="2" style="font-size:9px;font-weight:500;color:var(--muted)">' + h + '</th>';
    }
    out += '</tr></thead><tbody>';
    for (var d = 0; d < 7; d++) {
      out += '<tr><td class="small" style="white-space:nowrap;padding-inline-end:6px;color:var(--muted)">' + DOW[d] + '</td>';
      for (var hh = 0; hh < 24; hh++) {
        var v = m[d + '_' + hh] || 0;
        var a = v ? (0.14 + 0.86 * (v / max)) : 0;
        out += '<td title="' + DOW[d] + ' ' + hh + ':00 — ' + v + '" style="width:13px;height:15px;border-radius:3px;' +
          (v ? 'background:color-mix(in srgb,var(--teal) ' + Math.round(a * 100) + '%,transparent)'
             : 'background:var(--surface-2,#f2f5f4)') + '"></td>';
      }
      out += '</tr>';
    }
    return out + '</tbody></table></div>';
  }

  /* ========================= لوحة التحكم الحقيقية =========================
     العدّ يُطلب برأس Prefer: count=exact و Range: 0-0 — فيعود العدد في ترويسة
     Content-Range بلا جلب صفٍّ واحد. أرخص من قراءة الجداول كلها بكثير. */
  function countOf(path) {
    return fetch(CFG.url + '/rest/v1/' + path + (path.indexOf('?') > -1 ? '&' : '?') + 'select=id', {
      method: 'GET',
      headers: {
        apikey: CFG.key,
        Authorization: 'Bearer ' + tok(),
        Prefer: 'count=exact',
        Range: '0-0'
      }
    }).then(function (r) {
      var cr = r.headers.get('content-range') || '';
      var n = parseInt(String(cr).split('/')[1], 10);
      return isFinite(n) ? n : (r.ok ? 0 : -1);
    }).catch(function () { return -1; });
  }
  function isoDaysAgo(d) {
    var t0 = Date.now() - d * 86400000;
    return new Date(t0).toISOString().slice(0, 10);
  }

  var DASH = [
    { g: 'المحتوى المنشور', items: [
      { l: 'أعضاء الجمعية العمومية', q: 'people?grp=eq.assembly&status=eq.published' },
      { l: 'أعضاء مجلس الإدارة', q: 'people?grp=eq.board&status=eq.published' },
      { l: 'فريق العمل', q: 'people?grp=eq.team&status=eq.published' },
      { l: 'الشركاء', q: 'partners?status=eq.published' },
      { l: 'الأخبار', q: 'news?status=eq.published' },
      { l: 'الوثائق', q: 'documents?status=eq.published' },
      { l: 'شرائح السلايدر', q: 'hero_slides?status=eq.published' },
      { l: 'عناصر القائمة الظاهرة', q: 'menu_items?visible=is.true' }
    ] },
    { g: 'الوارد من الزوّار', items: [
      { l: 'إجمالي الطلبات', q: 'submissions' },
      { l: 'طلبات جديدة', q: 'submissions?status=eq.new', hot: 1 },
      { l: 'طلبات هذا الأسبوع', q: 'submissions?created_at=gte.' + isoDaysAgo(7) },
      { l: 'استجابات قياس الرضا', q: 'survey_responses' }
    ] },
    { g: 'ما لا يظهر للزائر', items: [
      { l: 'أخبار مسودّة', q: 'news?status=eq.draft' },
      { l: 'وثائق مسودّة', q: 'documents?status=eq.draft' },
      { l: 'أشخاص مخفيّون', q: 'people?status=eq.hidden' },
      { l: 'حسابات اللوحة', q: 'admins' }
    ] }
  ];

  /* ======================== مكتبة الوسائط ========================
     رفعٌ حقيقيٌّ إلى دلو iaq-media وصفٌّ في public.media. والحذف يُزيل السطر
     ويُبقي الملفّ: صفحةٌ تستعمل الصورة لا تنكسر بحذفها من المكتبة. */
  var MEDIA = [];

  function mediaUrl(m) {
    var p = String(m.storage_path || '');
    if (/^https?:\/\//i.test(p)) return p;
    return CFG.url + '/storage/v1/object/public/' +
      encodeURI((m.bucket || 'iaq-media') + '/' + p);
  }
  function kb(n) {
    var b = Number(n) || 0;
    if (!b) return '';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
    return (Math.round(b / 104857.6) / 10) + ' MB';
  }


  function loadMedia(myKey) {
    return api('media?select=*&order=created_at.desc&limit=300')
      .then(function (rows) {
        MEDIA = rows || [];
        if (myKey && !alive(myKey)) return;
        paintMedia();
      })
      .catch(function (e) {
        err = e.message;
        var g = $('#ml-grid');
        if (g) g.innerHTML = '<div class="muted">تعذّرت القراءة: ' + esc(e.message) + '</div>';
      });
  }

  /* الشبكة داخل النافذة: كلُّ بطاقةٍ زرُّ اختيارٍ ومعها حذف */
  function mediaGrid() {
    if (!MEDIA.length) {
      return '<div class="muted" style="padding:26px;text-align:center">' +
        'لا صور بعد — ارفع صورةً من الزرّ أعلاه وستظهر هنا.</div>';
    }
    return '<div class="ml-grid is-pick">' + MEDIA.map(function (m) {
      var u = mediaUrl(m);
      return '<div class="ml-item">' +
        '<button type="button" class="ml-hit" data-sc="mlpick" data-u="' + esc(u) + '" ' +
          'title="اختيار هذه الصورة">' +
          '<div class="ml-thumb"><img src="' + esc(u) + '" alt="' + esc(m.alt || m.title || '') +
            '" loading="lazy"></div>' +
          '<div class="ml-name">' + esc(m.title || String(m.storage_path).split('/').pop()) + '</div>' +
          '<div class="ml-meta">' + esc(kb(m.bytes)) + '</div>' +
        '</button>' +
        '<div class="ml-acts">' +
          '<button class="btn ghost sm" data-sc="mlcopy" data-u="' + esc(u) + '">نسخ</button>' +
          '<button class="btn danger sm" data-sc="mldel" data-id="' + esc(String(m.id)) + '">حذف</button>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  function paintMedia() {
    var g = $('#ml-grid');
    if (g) g.innerHTML = mediaGrid();
  }

  function mlMsg(text, kind) {
    var el = $('#ml-msg');
    if (!el) return;
    el.style.color = kind === 'err' ? '#8c3d1c' : (kind === 'ok' ? '#0c6c6c' : '');
    el.textContent = text;
  }

  /* رفعٌ متتابعٌ لا متزامن: عشرُ صورٍ متزامنةٍ تُخفق بعضها على اتصالٍ ضعيف */
  function mediaUpload(files) {
    var list = [].slice.call(files || []);
    if (!list.length) return;
    var done = 0, fail = 0;
    function step() {
      if (!list.length) {
        mlMsg('رُفعت ' + done + ' صورة' + (fail ? ' · فشلت ' + fail : ''), fail ? 'err' : 'ok');
        return loadMedia(null).then(function () {
          /* الرسالة تُعاد بعد إعادة رسم الشبكة، وإلّا مُحيت قبل أن تُقرأ */
          mlMsg('رُفعت ' + done + ' صورة' + (fail ? ' · فشلت ' + fail : ''), fail ? 'err' : 'ok');
        });
      }
      var f = list.shift();
      mlMsg('جارٍ رفع ' + f.name + '… (' + (done + fail + 1) + '/' + (done + fail + 1 + list.length) + ')');
      var stamp = Date.now().toString(36);
      var path = 'lib/' + stamp + '/' + safeName(f.name);
      fetch(CFG.url + '/storage/v1/object/' + encodeURI('iaq-media/' + path) + '?upsert=true', {
        method: 'POST',
        headers: {
          apikey: CFG.key,
          Authorization: 'Bearer ' + tok(),
          'x-upsert': 'true',
          'Content-Type': f.type || 'application/octet-stream'
        },
        body: f
      }).then(function (r) {
        if (!r.ok) {
          if (r.status === 404) throw new Error('دلو iaq-media غير موجود — شغّل supabase/setup.sql');
          throw new Error('تعذّر الرفع (' + r.status + ')');
        }
        /* السطر بعد الملفّ: لا نُسجّل صورةً لم تصل */
        return api('media?select=id', {
          method: 'POST',
          body: JSON.stringify([{
            bucket: 'iaq-media', storage_path: path, kind: 'image',
            title: f.name, bytes: f.size, created_by: (S && S.email) || ''
          }])
        });
      }).then(function () { done++; step(); })
        .catch(function (e) { fail++; mlMsg(e.message, 'err'); step(); });
    }
    step();
  }

  function mediaDelete(id) {
    var m = null;
    MEDIA.forEach(function (x) { if (String(x.id) === String(id)) m = x; });
    if (!m) return;
    askPassword('حذف من المكتبة',
      '<p>حذف <b>' + esc(m.title || m.storage_path) + '</b> من المكتبة؟</p>' +
      '<p class="muted small">يُحذف سطرها من المكتبة ويبقى الملفّ في التخزين — ' +
      'فالصفحات التي تستعمل رابطها لا تنكسر. ولن تظهر بعدها في منتقي الصور.</p>',
      function () {
        api('media?id=eq.' + Number(id) + '&select=id', { method: 'DELETE' })
          .then(function () {
            /* نافذةُ كلمة المرور استبدلت نافذةَ المكتبة، فنُعيد فتحها بعد الحذف */
            return loadMedia(null).then(function () {
              openPicker(null);
              mlMsg('حُذفت من المكتبة.', 'ok');
            });
          })
          .catch(function (e) { close(); mlMsg(e.message, 'err'); });
      });
  }

  /* ---------------- منتقي الصورة ----------------
     يظهر في كل حقل صورة. يقرأ المكتبة إن لم تُقرأ بعد، فلا يفتح فارغًا. */
  var pickTarget = null;

  /* المكتبة نافذةٌ لا شاشة: تُفتح من أي حقل صورة، وفيها الشبكةُ والرفعُ والحذف.
     فتُدار الصور حيث تُستعمل، ولا تبقى شاشةٌ فارغةٌ في القائمة. */
  function pickerBody() {
    return '<div class="addrow" style="flex-wrap:wrap;margin-block-end:12px">' +
        '<label class="btn" style="cursor:pointer;margin:0">' + ico('up') + ' رفع صور' +
          '<input type="file" id="ml-up" accept="image/*" multiple hidden>' +
        '</label>' +
        '<button class="btn ghost" data-sc="mlreload">' + ico('down') + ' تحديث</button>' +
      '</div>' +
      '<div id="ml-msg" class="muted small" style="margin-block-end:10px"></div>' +
      '<div id="ml-grid">' + mediaGrid() + '</div>' +
      '<p class="muted small" style="margin-block-start:10px">' +
      'الصور تُرفع إلى تخزين الموقع وتبقى. والحذف يُزيلها من المكتبة ويُبقي الملفّ، ' +
      'فالصفحات التي تستعملها لا تنكسر.</p>';
  }

  function openPicker(targetId) {
    if (targetId) pickTarget = targetId;
    wireMedia();
    function draw() {
      modal('مكتبة الصور', pickerBody(),
        '<button class="btn ghost" data-sc="close">إغلاق</button>');
    }
    if (MEDIA.length) { draw(); return; }
    modal('مكتبة الصور', '<p class="muted">جارٍ قراءة المكتبة…</p>',
      '<button class="btn ghost" data-sc="close">إغلاق</button>');
    loadMedia(null).then(draw);
  }
  function applyPick(u) {
    if (!pickTarget) { close(); return; }
    var el = byId(pickTarget);
    if (el) {
      el.value = u;
      /* المعاينة المجاورة تُحدَّث: حقلٌ يقول رابطًا وصورةٌ تُظهر غيره يُربك */
      var box = el.parentNode;
      var img = box ? box.querySelector('img') : null;
      if (img) img.src = u;
    }
    pickTarget = null;
    close();
  }

  /* ======================== لوحة التحكّم ========================
     الترتيب مقصود: ما يستدعي عملًا أوّلًا (زوّار وطلبات وسرعة ردّ)، والجردُ
     أسفلَه. وكلُّ الأرقام من ثلاث قراءاتٍ لا أكثر. */

  /* بطاقةُ رقمٍ كبيرٍ بأيقونةٍ ومقارنةٍ وشريطٍ صغير */
  function kpi(o) {
    var d = o.delta;
    var arrow = '', col = 'var(--muted)';
    if (d != null && isFinite(d)) {
      if (d > 0) { arrow = '▲ '; col = '#0c6c6c'; }
      else if (d < 0) { arrow = '▼ '; col = '#8c3d1c'; }
      else { arrow = '= '; }
    }
    return '<div class="iaq-kpi' + (o.gold ? ' is-gold' : '') + '">' +
      '<div class="kpi-top">' +
        '<span class="kpi-ico">' + (o.icon ? ico(o.icon) : '') + '</span>' +
        (d != null && isFinite(d)
          ? '<span class="kpi-delta" style="color:' + col + '">' + arrow +
            Math.abs(Math.round(d)) + '%</span>'
          : (o.note ? '<span class="kpi-delta muted">' + esc(o.note) + '</span>' : '')) +
      '</div>' +
      '<div class="kpi-val">' + esc(String(o.v)) + '</div>' +
      '<div class="kpi-lbl">' + esc(o.l) + '</div>' +
      (o.spark ? '<div class="kpi-spark">' + o.spark + '</div>' : '') +
      (o.sub ? '<div class="kpi-sub">' + esc(o.sub) + '</div>' : '') +
      '</div>';
  }

  /* نسبةُ التغيّر بين نصفَي المدى. null إن خلا النصف الأوّل — فقسمةٌ على صفرٍ
     تُنتج «∞%» وهو أسوأ من لا شيء. */
  function delta(rows, days, filter) {
    var half = dayStr(days - 1), mid = dayStr(Math.floor(days / 2) - 1);
    var a = 0, b = 0;
    (rows || []).forEach(function (r) {
      if (filter && !filter(r)) return;
      var d = String(r.day || '');
      if (d < half) return;
      if (d < mid) a += Number(r.n) || 0; else b += Number(r.n) || 0;
    });
    if (!a) return null;
    return ((b - a) / a) * 100;
  }

  /* ثلاث تبويباتٍ في شاشةٍ واحدة: الثلاثة تقرأ من المصادر نفسها، وكان
     الانتقال بينها يُعيد كل القراءات من الصفر. التبويب يُبدّل العرضَ لا
     القراءة، والمدى يُبدّل القراءة للثلاثة معًا. */
  var DASH_TAB = 'now';
  var DASH_TABS = [['now', 'نظرةٌ عامّة'], ['visits', 'الزوّار والصفحات'],
                   ['work', 'سجلّ العمل والتراجع']];

  function tabBar() {
    return '<div class="dash-tabs">' + DASH_TABS.map(function (o) {
      return '<button class="dash-tab' + (DASH_TAB === o[0] ? ' is-on' : '') +
        '" data-sc="dtab" data-t="' + o[0] + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  function dashView(sc, myKey) {
    setTimeout(function () { paintTab(myKey); }, 0);
    return '<div class="view-head"><h1>' + esc(sc.h1) + '</h1>' +
      '<p>' + esc(sc.sub) + '</p></div>' +
      tabBar() +
      '<div id="dv-range">' + rangeBar(RANGE) + '</div>' +
      '<div id="sc-err"></div>' +
      '<div id="dash-body"><div id="dv-kpi" class="iaq-kpi-grid">' +
        new Array(7).join('<div class="iaq-kpi"><div class="kpi-val">…</div>' +
          '<div class="kpi-lbl">جارٍ القراءة</div></div>') +
      '</div>' +
      '<div id="dv-charts"></div>' +
      '<div id="dv-inv"></div>' +
      '<div class="iaq-card"><h3 class="card-h">آخر الطلبات الواردة</h3>' +
        '<div id="dv-latest" class="muted">جارٍ القراءة…</div></div></div>';
  }

  /* يرسم التبويب المختار في الحاوية نفسها */
  function paintTab(myKey) {
    var box = $('#dash-body');
    var rb = $('#dv-range');
    if (rb) rb.innerHTML = rangeBar(RANGE);
    if (!box) return;
    if (DASH_TAB === 'visits') {
      box.innerHTML = '<div class="iaq-card"><div class="muted">جارٍ قراءة الإحصاءات…</div></div>';
      return paintVisits(myKey);
    }
    if (DASH_TAB === 'work') {
      box.innerHTML = '<div class="iaq-card"><div class="muted">جارٍ قراءة السجلّ…</div></div>';
      return paintWorklog(myKey);
    }
    box.innerHTML = '<div id="dv-kpi" class="iaq-kpi-grid"></div>' +
      '<div id="dv-charts"></div><div id="dv-inv"></div>' +
      '<div class="iaq-card"><h3 class="card-h">آخر الطلبات الواردة</h3>' +
      '<div id="dv-latest" class="muted">جارٍ القراءة…</div></div>';
    return paintDash(myKey);
  }

  function paintDash(myKey) {
    /* المدى المختار؛ وصفرٌ = منذ الإنشاء فنقرأ الكلّ ونحسب المدى من البيانات */
    var D = RANGE || 0;
    var subsErr = null;
    /* ثلاث قراءاتٍ لا أكثر — والمقارنة من ضِعف المدى في القراءة نفسها */
    Promise.all([
      readView('v_views_daily', D ? D * 2 : 0),
      /* الفشلُ يُرفع لا يُبلَع: كان catch يُرجع [] فتُطبع «٠ طلب لم يُفتح ·
         لا متأخّر» — وعطلٌ يُقرأ طمأنينةً أسوأ من عطلٍ يُعلن عن نفسه.
         و hours_to_first لم يُعَد مطلوبًا: الحالةُ في جدول الطلبات تكفي. */
      api('v_subs_response?select=status,created_at&order=created_at.desc&limit=1000')
        .catch(function (e) { subsErr = e.message || 'تعذّرت القراءة'; return null; }),
      readView('v_audit_daily', D ? D * 2 : 0),
      readView('v_views_by_path', D),
      readView('v_views_by_label', D),
      readView('v_views_by_device', D),
      readHealth()
    ]).then(function (r) {
      if (!alive(myKey)) return;
      /* «منذ الإنشاء»: المدى من أقدم يومٍ في البيانات، فلا تُقصّ السلسلة */
      if (!D) D = spanOf(r[0]);
      var daily = r[0] || [], subs = r[1], audit = r[2] || [];
      var byPath = r[3] || [], byLabel = r[4] || [], byDev = r[5] || [];

      /* المدى المعروض. نقرأ ضِعفَه كي تُحسب المقارنة، فالجمعُ يقتصر على نصفِه
         الأحدث — إلّا في «منذ الإنشاء»: ليس قبله مدًى يُقارَن، والمدى المعروض
         هو العمرُ كلّه بلا حدٍّ سفليّ. كان الحدُّ هنا نصفَ العمر، فعرضَ هذا
         التبويبُ نصفَ الرقم الذي يعرضه تبويبُ الزوّار على المدى نفسه. */
      var SPAN = RANGE || D;
      var FROM = RANGE ? dayStr(SPAN - 1) : '';   /* '' = بلا حدّ: كلُّ يومٍ ≥ '' */
      function tot(kind) {
        return total(daily, function (x) {
          return String(x.day) >= FROM && (!kind || x.kind === kind);
        });
      }
      var noStats = !daily.length;

      /* مؤشّرا الوارد من حالة الطلب في جدوله نفسه، لا من hours_to_first: ذاك
         يُشتقّ من سجلّ العمل الذي تُفرغه purge_audit بعد ثلاثين يومًا، فالمُجاب
         عليه قديمًا يعود «بلا ردّ». وكان المتوسّط يحسب المُجاب عليه وحده —
         فكلّما زاد الإهمال جَمُلَ الرقم. */
      var open = 0, late = 0, oldest = null, now = Date.now();
      (subs || []).forEach(function (s) {
        if (s.status !== 'new') return;
        open++;
        var age = now - new Date(s.created_at).getTime();
        if (age > 3 * 86400000) late++;
        if (oldest === null || age > oldest) oldest = age;
      });
      var seen = (subs || []).length;
      var rate = seen ? Math.round(((seen - open) / seen) * 100) : null;

      function spark(kind, rows) {
        return chartLine(series(rows || daily, SPAN, kind ? function (x) { return x.kind === kind; } : null),
                         { bare: 1, h: 34 });
      }
      function dash(v) { return noStats ? '—' : String(v); }

      /* المقارنة تحتاج مدًى سابقًا قُرئ فعلًا. و«منذ الإنشاء» لا قبلَه شيء،
         فسهمُه كان يقارن نصفَ عمر الجمعية بنصفِه — وليس هذا ما يُقرأ منه. */
      var NOTE = RANGE ? '' : 'منذ الإنشاء';
      function dlt(f, rows) { return RANGE ? delta(rows || daily, RANGE * 2, f) : null; }

      var kbox = $('#dv-kpi');
      if (kbox) {
        kbox.innerHTML =
          kpi({ v: dash(tot('page')), l: 'زيارة صفحة', icon: 'eye', note: NOTE,
                delta: dlt(function (x) { return x.kind === 'page'; }),
                spark: noStats ? '' : spark('page') }) +
          kpi({ v: dash(tot('file_dl')), l: 'تنزيل ملفّ', icon: 'down', note: NOTE,
                delta: dlt(function (x) { return x.kind === 'file_dl'; }),
                spark: noStats ? '' : spark('file_dl') }) +
          kpi({ v: dash(tot('form')), l: 'إرسال نموذج', icon: 'inbox2', note: NOTE,
                delta: dlt(function (x) { return x.kind === 'form'; }) }) +
          kpi({ v: subsErr ? '—' : String(open), l: 'طلب لم يُفتح بعد', icon: 'inbox2', gold: 1,
                sub: subsErr ? 'تعذّرت قراءة الطلبات — الرقم غير معروف'
                   : (late ? ('منها ' + late + ' متأخّرٌ فوق ٣ أيام') : 'لا متأخّر') }) +
          kpi({ v: subsErr || rate == null ? '—' : rate + '%', l: 'من الوارد فُتح وعُومل',
                icon: 'log', note: subsErr ? '' : (seen ? 'آخر ' + seen + ' طلبًا' : ''),
                sub: subsErr ? 'تعذّرت قراءة الطلبات — الرقم غير معروف'
                   : (open ? 'أقدمُ طلبٍ بلا ردّ: ' + ageLabel(oldest) : 'لا طلبَ بلا ردّ') }) +
          kpi({ v: String(total(audit, function (x) { return String(x.day) >= FROM; })),
                l: 'عملية على المحتوى', icon: 'log', note: NOTE,
                delta: dlt(null, audit), spark: spark(null, audit) });
      }

      var cbox = $('#dv-charts');
      if (cbox) {
        cbox.innerHTML = healthNotice(r[6]) + (noStats
          ? '<div class="notice" style="margin-block-end:14px">' +
            '<b>إحصاءات الزوّار لم تبدأ بعد.</b><br>شغّل <b>supabase/schema-v8.sql</b> ثم انشر الموقع — ' +
            'وتُجمَع الأرقام من أوّل زيارة بعد ذلك.</div>'
          : card('اتجاه زيارات الصفحات — ' + (RANGE ? 'آخر ' + RANGE + ' يومًا' : 'منذ الإنشاء'),
              chartLine(series(daily, SPAN, function (x) { return x.kind === 'page'; }),
                        { label: 'زيارات الصفحات', h: 190 }),
              'كل نقطةٍ يومٌ واحد. الأيام الخالية أصفارٌ لا فراغات.') +
            '<div class="chart-grid" style="align-items:start">' +
              card('أكثر الصفحات زيارةً',
                chartBars(sumBy(byPath, function (x) { return pageName(x.path); },
                                function (x) { return x.kind === 'page'; }), { top: 8 })) +
              card('أكثر الملفّات تنزيلًا',
                chartBars(sumBy(byLabel, function (x) { return x.label; },
                                function (x) { return x.kind === 'file_dl'; }), { top: 8, gold: 1 }),
                'التنزيل الفعليّ لا المعاينة في المتصفّح.') +
            '</div>' +
            card('الأجهزة',
              chartDonut(sumBy(byDev, function (x) {
                return { mobile: 'جوال', tablet: 'لوحيّ', desktop: 'حاسب' }[x.device] || 'غير معروف';
              }), { unit: 'زيارة' }),
              'نسبةُ الجوال إلى الحاسب — منها تُقرَّر أولويّة أيّ الشاشتين نُحسّن أوّلًا.'));
      }

      /* الجرد مضغوطٌ في الأسفل: أرقامٌ لا تتغيّر كثيرًا ولا تستدعي عملًا */
      var ibox = $('#dv-inv');
      if (ibox) {
        ibox.innerHTML = '<div class="iaq-card" style="margin-block-end:14px">' +
          '<h3 class="card-h">جرد المحتوى المنشور</h3>' +
          '<div class="stat-grid" id="dv-inv-grid" style="grid-template-columns:repeat(4,1fr)">' +
          DASH.map(function (g, gi) {
            return g.items.map(function (it, i) {
              return '<div class="stat-box"><div class="sb-val" id="dv-' + gi + '-' + i + '">…</div>' +
                '<div class="sb-label">' + esc(it.l) + '</div></div>';
            }).join('');
          }).join('') + '</div></div>';
        DASH.forEach(function (g, gi) {
          g.items.forEach(function (it, i) {
            countOf(it.q).then(function (n) {
              if (!alive(myKey)) return;
              var el = $('#dv-' + gi + '-' + i);
              if (!el) return;
              if (n < 0) { el.textContent = '—'; el.title = 'تعذّرت القراءة'; return; }
              el.textContent = String(n);
              if (it.hot && n > 0) el.style.color = '#8c3d1c';
            });
          });
        });
      }
    });

    api('submissions?select=id,kind,status,created_at,payload&order=created_at.desc&limit=5')
      .then(function (rows) {
        if (!alive(myKey)) return;
        var box = $('#dv-latest');
        if (!box) return;
        if (!rows || !rows.length) { box.textContent = 'لا طلبات بعد.'; return; }
        box.innerHTML = '<div style="overflow-x:auto"><table class="tbl"><thead><tr>' +
          '<th>وصل في</th><th>النموذج</th><th>المُرسِل</th><th>الحالة</th></tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr><td class="small" style="white-space:nowrap">' + esc(dtLabel(r.created_at)) + '</td>' +
              '<td>' + chipOf(r.kind, KIND) + '</td>' +
              '<td>' + cell({ k: 'payload', f: 'who' }, r) + '</td>' +
              '<td>' + chipOf(r.status, SUBST) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      })
      .catch(function (e) {
        var box = $('#dv-latest');
        if (box) box.textContent = 'تعذّرت القراءة: ' + e.message;
      });
  }

  /* ======================== إحصاءات الزوّار ======================== */
  var PAGE_AR = null;
  function pageName(slug) {
    if (!PAGE_AR) {
      PAGE_AR = {};
      ((window.IAQ_REAL && window.IAQ_REAL.pages) || []).forEach(function (p) {
        if (p && p.slug) PAGE_AR[p.slug] = p.title || p.slug;
      });
      PAGE_AR.index = 'الصفحة الرئيسة';
    }
    return PAGE_AR[slug] || slug;
  }
  var KIND_AR = { page: 'زيارة صفحة', file_dl: 'تنزيل ملفّ', file_view: 'معاينة ملفّ',
                  cta: 'نقر زرّ', form: 'إرسال نموذج', contact: 'تواصل' };

  function visitsView(sc, myKey) {
    setTimeout(function () { paintVisits(myKey); }, 0);
    return head(sc) + '<div id="sc-err"></div><div id="sc-body">' +
      '<div class="iaq-card"><div class="muted">جارٍ قراءة الإحصاءات…</div></div></div>';
  }
  /* رقم الإصدار في الشريط الأعلى مرّةً واحدة (شارة tbVer) لا جوار عنوان
     كل شاشة — تكرارُه ضجيجٌ لا معلومة. */
  function head(sc) {
    return '<div class="view-head"><h1>' + esc(sc.h1) + '</h1>' +
      '<p>' + esc(sc.sub) + '</p></div>';
  }

  function paintVisits(myKey) {
    var d = RANGE || 0;
    Promise.all([
      readView('v_views_daily', d),
      readView('v_views_by_path', d),
      readView('v_views_by_label', d),
      readView('v_views_by_ref', d),
      readView('v_views_by_device', d),
      api('v_views_hourly?select=*&limit=200').catch(function () { return []; }),
      readHealth()
    ]).then(function (r) {
      if (!alive(myKey)) return;
      var daily = r[0], byPath = r[1], byLabel = r[2], byRef = r[3], byDev = r[4], hourly = r[5];
      if (!d) d = spanOf(daily);
      var box = $('#dash-body') || $('#sc-body');
      if (!box) return;
      var ep = $('#sc-err');
      if (ep) ep.innerHTML = err
        ? '<div class="notice" style="background:#fdf1ec;border-color:#f0cdbc;color:#8c3d1c">' +
          '<b>تعذّرت قراءة بعض الإحصاءات</b><br>' + esc(err) +
          '<br><span class="small">إن كان الجدول غير موجود فشغّل <b>supabase/schema-v8.sql</b>.</span></div>' : '';

      var pv = total(daily, function (x) { return x.kind === 'page'; });
      var dl = total(daily, function (x) { return x.kind === 'file_dl'; });
      var fv = total(daily, function (x) { return x.kind === 'file_view'; });
      var ct = total(daily, function (x) { return x.kind === 'contact'; });
      var fm = total(daily, function (x) { return x.kind === 'form'; });
      var cta = total(daily, function (x) { return x.kind === 'cta'; });

      /* الفرز في ترويسة الشاشة مرّةً واحدةً لا في كل تبويب: التبويبات كانت
         شاشاتٍ مستقلّةً لكلٍّ شريطُها، فبقيا معًا بعد الدمج فظهر مكرّرًا. */
      var html = healthNotice(r[6]) +
        card('الخلاصة',
          grid(6) + box2(pv, 'زيارة صفحة') + box2(dl, 'تنزيل ملفّ') + box2(fv, 'معاينة ملفّ') +
          box2(cta, 'نقر زرّ') + box2(ct, 'نقر تواصل') + box2(fm, 'إرسال نموذج') + '</div>',
          'المدى: ' + (RANGE ? 'آخر ' + d + ' يومًا' : 'منذ الإنشاء — ' + d + ' يومًا') +
          ' بتوقيت الرياض، وهو المدى نفسه وبالحساب نفسه في تبويب «نظرة عامّة». ' +
          'ولا نحسب زوّارًا فريدين — لا معرّف زائر ولا كوكيز. والتسجيل مفتوحٌ للزائر ' +
          'بالضرورة، فسقفٌ يوميّ يحدُّ أيَّ تضخيم، وأيُّ يومٍ يبلغه يُعلَن أعلاه.') +

        card('اتجاه زيارات الصفحات',
          chartLine(series(daily, d, function (x) { return x.kind === 'page'; }), { label: 'زيارات الصفحات' })) +

        card('اتجاه التعامل مع الملفّات',
          chartLine(series(daily, d, function (x) { return x.kind === 'file_dl' || x.kind === 'file_view'; }),
                    { label: 'تنزيل ومعاينة' }),
          'تنزيلٌ ومعاينةٌ معًا.') +

        '<div class="grid2" style="align-items:start">' +
          card('أكثر الصفحات زيارةً',
            chartBars(sumBy(byPath, function (x) { return pageName(x.path); },
                            function (x) { return x.kind === 'page'; }), { top: 10 })) +
          card('أكثر الملفّات تنزيلًا',
            chartBars(sumBy(byLabel, function (x) { return x.label; },
                            function (x) { return x.kind === 'file_dl'; }), { top: 10, gold: 1 })) +
        '</div>' +

        '<div class="grid2" style="align-items:start">' +
          card('مصادر الزيارات',
            chartBars(sumBy(byRef, function (x) { return x.ref_host; }), { top: 8 }),
            '«(مباشرة)» تعني دخولًا بلا مصدر: كتابة العنوان، أو من تطبيقٍ لا يُرسل المصدر.') +
          card('الأجهزة',
            chartDonut(sumBy(byDev, function (x) {
              return { mobile: 'جوال', tablet: 'لوحيّ', desktop: 'حاسب' }[x.device] || 'غير معروف';
            }), { unit: 'زيارة' })) +
        '</div>' +

        card('أكثر الأزرار نقرًا',
          chartBars(sumBy(byLabel, function (x) { return x.label; },
                          function (x) { return x.kind === 'cta' || x.kind === 'contact'; }), { top: 10 }),
          'يشمل أزرار السلايدر وأزرار الأخبار والتواصل (هاتف وبريد ومنصّات) والتبرّع.') +

        card('ذروة الزيارة — الأسبوع × الساعة', chartHeat(hourly || []),
          'كل الفترة لا المدى المختار. الأغمق أكثر زيارةً. مفيدٌ لاختيار وقت النشر.');

      box.innerHTML = html;
    });
  }
  /* شريطُ ترشيحٍ من الفاعلين والأقسام الموجودين فعلًا في المدى المعروض */
  /* مستمعٌ مفوَّضٌ لعناصر الترشيح — يعمل بعد كل إعادة رسم */
  /* المستمعُ على document لا على منطقة العرض: النافذة تُلحَق بجسم الصفحة
     **خارج** منطقة العرض، فمستمعٌ عليها لا يرى حدث الاختيار أصلًا. */
  var mlWired = false;
  function wireMedia() {
    if (mlWired) return;
    mlWired = true;
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el && el.id === 'ml-up' && el.files && el.files.length) {
        mediaUpload(el.files);
        el.value = '';
      }
    });
  }

  var wlWired = false;
  function wireWl() {
    if (wlWired) return;
    wlWired = true;
    var area = document.getElementById('viewArea') || document.body;
    area.addEventListener('change', function (e) {
      var el = e.target, k = el && el.getAttribute && el.getAttribute('data-wl');
      if (!k) return;
      if (k === 'actor') wlActor = el.value;
      else if (k === 'entity') wlEntity = el.value;
      else if (k === 'only') wlOnlyUndo = !!el.checked;
      paintWorklog(cur);
    });
  }

  function wlBar(ad) {
    wireWl();
    var actors = {}, ents = {};
    (ad || []).forEach(function (x) {
      if (x.actor_email) actors[x.actor_email] = 1;
      if (x.entity) ents[x.entity] = 1;
    });
    function sel(id, cur, map, all, tr) {
      var ks = Object.keys(map).sort();
      return '<select data-wl="' + id + '" style="min-width:150px">' +
        '<option value=""' + (cur === '' ? ' selected' : '') + '>' + esc(all) + '</option>' +
        ks.map(function (k) {
          return '<option value="' + esc(k) + '"' + (k === cur ? ' selected' : '') + '>' +
            esc(tr ? (tr[k] || k) : k) + '</option>';
        }).join('') + '</select>';
    }
    return '<div class="addrow" style="margin-block-end:12px;flex-wrap:wrap">' +
      sel('actor', wlActor, actors, 'كل الفاعلين') +
      sel('entity', wlEntity, ents, 'كل الأقسام', ENT_AR) +
      '<label class="small" style="display:inline-flex;align-items:center;gap:7px;cursor:pointer">' +
      '<input type="checkbox" data-wl="only"' + (wlOnlyUndo ? ' checked' : '') +
      ' style="width:16px;height:16px;accent-color:var(--teal)"> ما يمكن التراجع عنه فقط</label>' +
      '</div>';
  }

  /* خليّة التراجع: زرٌّ إن جاز، وسببٌ مفهومٌ إن لم يجُز */
  function undoCell(a) {
    if (a.undone_at) return '<span class="small muted">تُرَاجِع عنه</span>';
    if (a.undo_of) return '<span class="small muted">عمليةُ تراجع</span>';
    if (a.can_undo) {
      return '<button class="btn ghost sm" data-sc="undo" data-id="' + esc(String(a.id)) + '">تراجَع</button>';
    }
    if (a.skipped === 'pii') return '<span class="small muted" title="بيانات الزوّار لا تُخزَّن">بيانات شخصية</span>';
    if (a.skipped === 'size') return '<span class="small muted" title="القيمة أكبر من سقف التخزين">كبيرٌ جدًّا</span>';
    if (a.later_edits > 0) {
      return '<span class="small muted" title="استعادةُ القيمة القديمة تدهس ما جرى بعدها">' +
        'بعده ' + a.later_edits + ' تعديلًا</span>';
    }
    if (!a.pk) return '<span class="small muted" title="قيدٌ سابقٌ لترقية v9">قيدٌ قديم</span>';
    return '<span class="small muted">—</span>';
  }

  function box2(n, label) {
    return '<div class="stat-box"><div class="sb-val">' + esc(String(n)) + '</div>' +
           '<div class="sb-label">' + esc(label) + '</div></div>';
  }

  /* ======================== سجلّ العمل ومؤشّرات الردّ ======================== */
  var ACT_AR = { insert: 'إضافة', update: 'تعديل', delete: 'حذف', status: 'تغيير حالة' };
  var ENT_AR = { news: 'الأخبار', documents: 'الوثائق', people: 'الأشخاص', partners: 'الشركاء',
                 hero_slides: 'شرائح السلايدر', menu_items: 'القائمة', submissions: 'الطلبات',
                 settings: 'الإعدادات', content_overrides: 'نصوص الموقع', media: 'الوسائط',
                 admins: 'الحسابات' };

  function worklogView(sc, myKey) {
    setTimeout(function () { paintWorklog(myKey); }, 0);
    return head(sc) + '<div id="sc-err"></div><div id="sc-body">' +
      '<div class="iaq-card"><div class="muted">جارٍ قراءة السجلّ…</div></div></div>';
  }

  /* ---------------- سجلّ العمل: ترشيحٌ وتراجع ---------------- */
  var WL_LIMIT = 100;
  var wlActor = '', wlEntity = '', wlOnlyUndo = false;
  /* الرسالة تنجو من إعادة الرسم: كانت تُكتب في عقدةٍ داخل ما يُعاد بناؤه فتُمحى
     قبل أن تُرى. وتُطفأ بعد ثمانِ ثوانٍ كي لا تبقى بعد أن فقدت معناها. */
  var wlMsg = null, wlMsgT = null;
  function setWlMsg(text, kind) {
    wlMsg = text ? { text: text, kind: kind || '' } : null;
    if (wlMsgT) clearTimeout(wlMsgT);
    if (text) wlMsgT = setTimeout(function () { wlMsg = null; }, 8000);
  }
  function wlMsgHtml() {
    if (!wlMsg) return '<div id="wl-msg" class="small" style="margin-block-end:10px"></div>';
    var col = wlMsg.kind === 'err' ? '#8c3d1c' : '#0c6c6c';
    return '<div id="wl-msg" class="small" style="margin-block-end:10px;color:' + col + '">' +
      esc(wlMsg.text) + '</div>';
  }

  function wlFilter() {
    var q = '';
    if (wlActor) q += '&actor_email=eq.' + encodeURIComponent(wlActor);
    if (wlEntity) q += '&entity=eq.' + encodeURIComponent(wlEntity);
    if (wlOnlyUndo) q += '&can_undo=is.true';
    return q;
  }

  /* التراجع: القرار في القاعدة، والواجهة تعرض سببَ الرفض كما جاء */
  function doUndo(id) {
    if (busy) return;
    busy = true;
    var msg = $('#wl-msg');
    if (msg) { msg.style.color = ''; msg.textContent = 'جارٍ التراجع…'; }
    api('rpc/undo_change', { method: 'POST', body: JSON.stringify({ log_id: Number(id) }) })
      .then(function (out) {
        if (out && out.ok === false) throw new Error(out.why || 'تعذّر التراجع');
        close();
        setWlMsg('تمّ التراجع — يسري على الموقع عند أوّل تحميل.', 'ok');
      })
      .catch(function (e) {
        close();
        setWlMsg(e.message, 'err');
      })
      .then(function () {
        busy = false;
        paintWorklog(cur);      /* الرسالة تُعاد رسمها معه */
      });
  }

  function askUndo(id) {
    var r = null;
    (WL_ROWS || []).forEach(function (x) { if (String(x.id) === String(id)) r = x; });
    if (!r) return;
    var what = (ACT_AR[r.action] || r.action) + ' في ' + (ENT_AR[r.entity] || r.entity);
    var body = '<p>التراجع عن: <b>' + esc(what) + '</b>' +
      (r.entity_id ? ' <span class="mono small muted">#' + esc(r.entity_id) + '</span>' : '') + '</p>' +
      '<p class="muted small">' +
      (r.action === 'insert'
        ? 'هذا العنصرُ أُضيف، فالتراجع عنه <b>حذفٌ نهائيّ</b> له.'
        : (r.action === 'delete'
          ? 'هذا العنصرُ حُذف، فالتراجع يُعيده بمعرّفه القديم.'
          : 'تُستعاد القيم التي كانت قبل هذا التعديل.')) +
      '</p>';
    /* «إضافة» تراجعُها حذف: تُطلب كلمة المرور. وغيرها استعادةٌ لا تُفقد شيئًا. */
    if (r.action === 'insert') {
      askPassword('تأكيد التراجع (حذف)', body, function () { doUndo(id); });
    } else {
      modal('تأكيد التراجع', body,
        '<button class="btn ghost" data-sc="close">إلغاء</button>' +
        '<button class="btn" data-sc="undoyes" data-id="' + esc(String(id)) + '">تراجَع</button>');
    }
  }

  var WL_ROWS = null;

  function paintWorklog(myKey) {
    var d = RANGE || 0;
    var subsErr = null;
    Promise.all([
      readView('v_audit_daily', d),
      api('v_audit_recent?select=*&order=created_at.desc&limit=' + WL_LIMIT +
          wlFilter()).catch(function () { return []; }),
      /* كما في التبويب الأوّل: الفشلُ يُعلَن ولا يُقرأ صفرًا */
      api('v_subs_response?select=status,created_at&order=created_at.desc&limit=1000')
        .catch(function (e) { subsErr = e.message || 'تعذّرت القراءة'; return null; })
    ]).then(function (r) {
      if (!alive(myKey)) return;
      var ad = r[0], recent = r[1], subs = r[2];
      WL_ROWS = recent;
      if (!d) d = spanOf(ad);
      var box = $('#dash-body') || $('#sc-body');
      if (!box) return;
      var ep = $('#sc-err');
      if (ep) ep.innerHTML = err
        ? '<div class="notice" style="background:#fdf1ec;border-color:#f0cdbc;color:#8c3d1c">' +
          '<b>تعذّرت قراءة بعض البيانات</b><br>' + esc(err) +
          '<br><span class="small">إن كانت المناظر غير موجودة فشغّل <b>supabase/schema-v8.sql</b>.</span></div>' : '';

      /* مؤشّرات الوارد — بالحساب نفسه الذي في تبويب «نظرة عامّة» حرفيًّا.
         كانا حسابين مختلفين للمعنى الواحد فأعطيا رقمين مختلفين. */
      var open = 0, late = 0, closed = 0, oldest = null;
      var now = Date.now();
      (subs || []).forEach(function (s) {
        if (s.status === 'closed') closed++;
        if (s.status !== 'new') return;
        open++;
        var age = now - new Date(s.created_at).getTime();
        if (age > 3 * 86400000) late++;
        if (oldest === null || age > oldest) oldest = age;
      });
      var seen = (subs || []).length;
      var rate = seen ? Math.round(((seen - open) / seen) * 100) : null;
      function q(v) { return subsErr ? '—' : String(v); }

      /* الفرز في ترويسة الشاشة مرّةً واحدةً لا في كل تبويب: التبويبات كانت
         شاشاتٍ مستقلّةً لكلٍّ شريطُها، فبقيا معًا بعد الدمج فظهر مكرّرًا. */
      var html = 
        card('مؤشّرات الردّ على الوارد',
          grid(5) +
            box2(subsErr || rate == null ? '—' : rate + '%', 'من الوارد فُتح وعُومل') +
            box2(subsErr ? '—' : ageLabel(oldest), 'عمرُ أقدمِ طلبٍ بلا ردّ') +
            box2(q(open), 'لم يُفتح بعد') +
            box2(q(late), 'متأخّر فوق ٣ أيام') +
            box2(q(closed), 'مُغلق') + '</div>',
          subsErr
            ? 'تعذّرت قراءة الطلبات: ' + subsErr + ' — الأرقام أعلاه غير معروفة، وليست أصفارًا.'
            : 'المدى: آخر ' + seen + ' طلبًا وصلت، بحالتها في جدول الطلبات. ' +
              'ولا نعرض متوسّطَ زمنِ الردّ: كان يحسب المُجاب عليه وحده فيَجمُل كلّما زاد ' +
              'الإهمال، ومصدرُه سجلٌّ يُفرَّغ بعد ثلاثين يومًا.') +

        card('نشاط الفريق يوميًّا', chartLine(series(ad, d), { label: 'عمليات' })) +

        '<div class="grid2" style="align-items:start">' +
          card('من أنجز ماذا', chartBars(sumBy(ad, function (x) { return x.actor_email; }), { top: 8 })) +
          card('أكثر الأقسام تعديلًا',
            chartBars(sumBy(ad, function (x) { return ENT_AR[x.entity] || x.entity; }), { top: 8, gold: 1 })) +
        '</div>' +

        card('نوع العمل',
          chartDonut(sumBy(ad, function (x) { return ACT_AR[x.action] || x.action; }), { unit: 'عملية' })) +

        card('سجلّ التعديلات والتراجع',
          wlBar(ad) +
          wlMsgHtml() +
          (recent && recent.length
            ? '<div style="max-height:520px;overflow:auto"><table class="tbl"><thead><tr>' +
              '<th>الوقت</th><th>من</th><th>العمل</th><th>القسم</th><th>التفصيل</th><th>التراجع</th>' +
              '</tr></thead><tbody>' + recent.map(function (a) {
                var det = '';
                if (a.detail && a.detail.from) det = esc(a.detail.from) + ' ← ' + esc(a.detail.to);
                else if (a.detail && a.detail.label) det = esc(a.detail.label);
                else if (a.entity_id) det = '<span class="mono small muted">#' + esc(a.entity_id) + '</span>';
                return '<tr><td class="small" style="white-space:nowrap">' + esc(dtLabel(a.created_at)) + '</td>' +
                  '<td class="small">' + esc(a.actor_email || '—') + '</td>' +
                  '<td>' + chipOf(a.action, ACT_AR) + '</td>' +
                  '<td class="small">' + esc(ENT_AR[a.entity] || a.entity || '—') + '</td>' +
                  '<td class="small">' + det + '</td>' +
                  '<td>' + undoCell(a) + '</td></tr>';
              }).join('') + '</tbody></table></div>'
            : '<div class="muted" style="padding:22px;text-align:center">لا عمليات مسجّلة بعد — ' +
              'السجلّ يبدأ من تشغيل schema-v8.</div>'),
          'التراجع متاحٌ ما لم يجرِ تعديلٌ أحدثُ على العنصر نفسه — واستعادةُ قيمةٍ ' +
          'قديمة تدهس ما جرى بعدها، فالدمجُ الآليّ تخمين. والقيودُ السابقة لترقية ' +
          'schema-v9 لا قيمَ محفوظةً لها فلا تراجعَ فيها. وطلباتُ الزوّار تُخزَّن ' +
          'منها الحالةُ والنوعُ والتاريخُ فقط — فبياناتهم الشخصية لا تدخل السجلّ.');

      box.innerHTML = html;
    });
  }

  /* ---------------------- شاشة جرد الصفحات (للاطّلاع) ---------------------- */
  function pagesView(sc) {
    var pages = (window.IAQ_REAL && window.IAQ_REAL.pages) || [];
    var rowsHtml = pages.map(function (p, i) {
      var f = p.slug + '.html';
      return '<tr><td class="mono small">' + (i + 1) + '</td>' +
        '<td><b>' + esc(p.title || p.slug) + '</b></td>' +
        '<td class="mono small">' + esc(f) + '</td>' +
        '<td>' + (p.type ? '<span class="chip">' + esc(p.type) + '</span>' : '—') + '</td>' +
        '<td><a href="' + esc(f) + '" target="_blank" rel="noopener" class="mono small">معاينة</a></td></tr>';
    }).join('');
    return '<div class="view-head"><h1>' + esc(sc.h1) +
      '</h1>' +
      '<p>' + esc(sc.sub) + '</p></div>' +
      '<div class="iaq-card">' +
        '<div class="stat-grid" style="grid-template-columns:repeat(2,1fr);margin-block-end:16px">' +
          box(pages.length, 'صفحة مبنيّة') + box(1, 'لوحة تحكّم') + '</div>' +
        (pages.length
          ? '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>#</th><th>العنوان</th>' +
            '<th>الملف</th><th>النوع</th><th></th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'
          : '<div class="muted" style="padding:28px;text-align:center">لم تُقرأ قائمة الصفحات.</div>') +
        '<p class="muted small" style="margin-block-start:12px">' + esc(sc.reach) + '</p>' +
      '</div>';
  }

  function loadSettings(sc) {
    err = null;
    /* المفتاح المنقوط «a.b» يعني خاصيّةَ b في الكائن المخزَّن تحت a: نقرأ a
       مرّةً واحدةً ثم نوزّع خصائصه. */
    var rowsAll = setRows(sc);
    var bases = {};
    rowsAll.forEach(function (r) {
      var d = String(r.key).indexOf('.');
      bases[d > 0 ? String(r.key).slice(0, d) : r.key] = 1;
    });
    var keys = Object.keys(bases);
    return api('settings?select=key,value&key=in.(' + encodeURIComponent(keys.join(',')) + ')')
      .then(function (r) {
        setVals = {};
        (r || []).forEach(function (row) { setVals[row.key] = row.value; });
      })
      .catch(function (e) { err = e.message; });
  }

  function setCtl(r) {
    var id = 'sc-s-' + r.key;
    var v = setVals.hasOwnProperty(r.key) && setVals[r.key] !== null ? setVals[r.key]
          : (r.dyn ? realVal(r.dyn) : r.def);
    var h = '<div class="fld"><label for="' + id + '">' + esc(r.l) + '</label>';
    if (r.t === 'select') {
      h += '<select id="' + id + '">';
      for (var k in r.o) if (r.o.hasOwnProperty(k)) {
        h += '<option value="' + esc(k) + '"' + (String(v) === k ? ' selected' : '') + '>' +
          esc(r.o[k]) + '</option>';
      }
      h += '</select>';
    } else if (r.t === 'bool') {
      h += '<select id="' + id + '">' +
        '<option value="0"' + (v === true ? '' : ' selected') + '>مُطفأ</option>' +
        '<option value="1"' + (v === true ? ' selected' : '') + '>مُشعَل</option></select>';
    } else if (r.t === 'img') {
      /* الرابط الحالي مرئيّ ومعاينته ظاهرة، والرفع يستبدله */
      h += (v ? '<div style="margin-block-end:8px"><img src="' + esc(v) + '" alt="" ' +
                'style="height:56px;max-width:220px;object-fit:contain;background:#fff;' +
                'border:1px solid var(--line);border-radius:10px;padding:6px"></div>' : '') +
        '<input type="text" id="' + id + '" value="' + esc(v == null ? '' : v) + '" ' +
        'placeholder="لا شعار مخصّص — يُستخدم المبنيّ" style="margin-block-end:8px">' +
        '<input type="file" id="' + id + '-f" accept="' + esc(r.accept || 'image/*') + '" ' +
        'style="width:100%;font:inherit;padding:9px;border:1px dashed var(--line);border-radius:10px">' +
        /* المكتبة تصير مصدرًا للصور لا معرضًا معزولًا */
        '<button type="button" class="btn ghost sm" data-sc="mlopen" data-t="' + id +
        '" style="margin-block-start:8px">' + ico('img') + ' مكتبة الصور — اختر أو ارفع</button>';
    } else if (r.t === 'color') {
      /* المنتقي والنصّ معًا: المنتقي للاختيار، والنصّ لمن عنده رمز الهوية.
         وقيمةُ الحفظ من النصّ لأنّ منتقي المتصفّح يرفض الفارغ ويُطبّع الحرف. */
      var cv = String(v == null ? '' : v).trim();
      var ok6 = /^#[0-9a-fA-F]{6}$/.test(cv);
      h += '<div style="display:flex;gap:8px;align-items:center">' +
        '<input type="color" id="' + id + '-p" value="' + esc(ok6 ? cv : (r.def || '#000000')) + '" ' +
        'aria-label="' + esc(r.l) + ' — منتقي اللون" ' +
        'style="width:44px;height:38px;padding:2px;border:1px solid var(--line);' +
        'border-radius:9px;background:#fff;cursor:pointer;flex:0 0 auto">' +
        '<input type="text" id="' + id + '" value="' + esc(cv) + '" dir="ltr" ' +
        'placeholder="' + esc(r.def || '#000000') + '" style="flex:1">' +
        '</div>';
    } else if (r.t === 'area') {
      h += '<textarea id="' + id + '" rows="3" ' +
        'style="width:100%;font:inherit;line-height:1.9;resize:vertical">' +
        esc(v == null ? '' : v) + '</textarea>';
    } else {
      h += '<input type="text" id="' + id + '" value="' + esc(v == null ? '' : v) + '"' +
        (r.unit ? ' aria-describedby="' + id + '-u"' : '') + '>' +
        (r.unit ? '<div class="muted small" id="' + id + '-u">بـ' + esc(r.unit) + '</div>' : '');
    }
    if (r.hint) h += '<div class="muted small" style="margin-block-start:4px">' + esc(r.hint) + '</div>';
    return h + '</div>';
  }

  /* المنتقي والنصّ يتبع كلٌّ الآخر. مستمعٌ مفوَّضٌ واحد فيعمل بعد كل إعادة رسم. */
  var colorWired = false;
  function wireColors() {
    if (colorWired) return;
    colorWired = true;
    var area = document.getElementById('viewArea') || document.body;
    area.addEventListener('input', function (e) {
      var el = e.target;
      if (!el || !el.id) return;
      /* تبديل الصفحة المُحرَّرة: يُحفظ محليًّا وتُعاد الحقول */
      if (el.id === 'sc-s-__pick') {
        blankPick = el.value;
        try { localStorage.setItem('iaq_blank_pick', blankPick); } catch (e2) { }
        var sc0 = S0();
        setVals = {};
        loadSettings(sc0).then(function () { paintSettings(sc0); });
        return;
      }
      if (el.type === 'color' && /^sc-s-.+-p$/.test(el.id)) {
        var txt = document.getElementById(el.id.slice(0, -2));
        if (txt) txt.value = el.value;
        return;
      }
      if (/^sc-s-/.test(el.id) && el.tagName === 'INPUT' && el.type === 'text') {
        var pick = document.getElementById(el.id + '-p');
        if (pick && /^#[0-9a-fA-F]{6}$/.test(el.value.trim())) pick.value = el.value.trim();
      }
    });
  }

  /* يُوزّع خصائص الكائنات المقروءة على المفاتيح المنقوطة */
  function spreadComposites(sc) {
    setRows(sc).forEach(function (r) {
      var k = String(r.key), d = k.indexOf('.');
      if (d <= 0) return;
      var base = k.slice(0, d), prop = k.slice(d + 1);
      var obj = setVals[base];
      if (obj && typeof obj === 'object' && obj.hasOwnProperty(prop)) setVals[k] = obj[prop];
    });
  }

  function paintSettings(sc) {
    wireColors();
    wirePresets();
    spreadComposites(sc);
    var box = $('#sc-form'), ep = $('#sc-err');
    if (!box) return;
    if (ep) ep.innerHTML = err
      ? '<div class="notice" style="background:#fdf1ec;border-color:#f0cdbc;color:#8c3d1c">' +
        '<b>تعذّر تنفيذ الإجراء</b><br>' + esc(err) + '</div>' : '';
    box.innerHTML = (sc.before ? sc.before() : '') + setRows(sc).map(setCtl).join('') +
      '<div id="sc-setmsg" class="muted small" style="margin-block-end:10px"></div>' +
      '<div class="btnbar" style="justify-content:flex-start">' +
      '<button class="btn" data-sc="setsave">حفظ الإعدادات</button>' +
      '<button class="btn ghost" data-sc="reload">استرجاع المحفوظ</button></div>' +
      '<p class="muted small" style="margin-block-start:12px">' + esc(sc.reach ||
        'يسري على الموقع عند أوّل تحميل لصفحة الزائر — وقد يظهر بعد تحديث الصفحة إن كانت نسخةٌ محفوظة في متصفّحه.') +
      '</p>';
  }

  function saveSettings(sc) {
    if (busy) return;
    /* الرفع أوّلًا: لا يُسجَّل رابطٌ لصورة لم تصل */
    var upRow = null, upFile = null;
    /* حقلا صورة في الشاشة: يُرفع واحدٌ في كل نداء ثم يُعاد النداء للآخر */
    setRows(sc).forEach(function (r) {
      if (r.t !== 'img' || upFile) return;
      var fi = byId('sc-s-' + r.key + '-f');
      if (fi && fi.files && fi.files[0]) { upRow = r; upFile = fi.files[0]; }
    });
    if (upFile) {
      var m0 = $('#sc-setmsg');
      if (m0) { m0.style.color = ''; m0.textContent = 'جارٍ رفع الصورة…'; }
      busy = true;
      uploadFile(upFile, 'brand').then(function (url) {
        var el = byId('sc-s-' + upRow.key);
        if (el) el.value = url;
        var fi2 = byId('sc-s-' + upRow.key + '-f');
        if (fi2) fi2.value = '';
        busy = false;
        saveSettings(sc);
      }).catch(function (e) {
        busy = false;
        var m1 = $('#sc-setmsg');
        if (m1) { m1.style.color = '#8c3d1c'; m1.textContent = e.message; }
      });
      return;
    }
    var out = [], bad = null, comp = {}, compLabel = {};
    setRows(sc).forEach(function (r) {
      if (bad) return;
      var el = byId('sc-s-' + r.key);
      if (!el) return;
      var v;
      if (r.t === 'bool') v = (el.value === '1');
      else if (r.t === 'int') {
        var s2 = norm(el.value);
        if (s2 === '') { v = r.def; }
        else {
          var n = Number(s2);
          if (!isFinite(n) || Math.floor(n) !== n) { bad = r.l + ': يجب أن يكون عددًا صحيحًا'; return; }
          if (r.min != null && n < r.min) { bad = r.l + ': أقلّ من الحدّ ' + r.min; return; }
          if (r.max != null && n > r.max) { bad = r.l + ': أكبر من الحدّ ' + r.max; return; }
          v = n;
        }
      } else v = norm(el.value);
      /* رابطٌ غير فارغ يجب أن يكون https — وإلا كسر الأيقونة أو فتح مخطّطًا خطِرًا */
      if (/^(social_|donate_)/.test(r.key) && v && !/^https:\/\//i.test(v)) {
        bad = r.l + ': الرابط يبدأ بـ https:// أو يُترك فارغًا';
        return;
      }
      /* الحقل المحليّ اختيارُ عرضٍ لا إعدادَ موقع: لا يُرسل إلى القاعدة */
      if (r.local) return;
      var dot = String(r.key).indexOf('.');
      if (dot > 0) {
        /* خاصيّةٌ في كائن: تُجمَّع ثم تُدمج فوق الكائن المقروء — لا تُكتب
           الكائنَ من الحقول المعروضة وحدها، فيسقط ما لا يُعرَض منها. */
        var b = String(r.key).slice(0, dot), pr = String(r.key).slice(dot + 1);
        if (!comp[b]) {
          var was = setVals[b];
          comp[b] = (was && typeof was === 'object') ? JSON.parse(JSON.stringify(was)) : {};
          compLabel[b] = r.compLabel || 'المظهر والألوان';
        }
        comp[b][pr] = v;
        return;
      }
      out.push({ key: r.key, value: v, label: r.l, is_public: true,
                 updated_by: (S && S.email) || '' });
    });
    Object.keys(comp).forEach(function (b) {
      out.push({ key: b, value: comp[b], label: compLabel[b], is_public: true,
                 updated_by: (S && S.email) || '' });
    });
    var msg = $('#sc-setmsg');
    if (bad) { if (msg) { msg.style.color = '#8c3d1c'; msg.textContent = bad; } return; }
    if (!out.length) return;
    busy = true;
    if (msg) { msg.style.color = ''; msg.textContent = 'جارٍ الحفظ…'; }
    api('settings?on_conflict=key&select=key', {
      method: 'POST',
      headers: null,
      body: JSON.stringify(out)
    }, { Prefer: 'resolution=merge-duplicates,return=representation' })
      .then(function (res) {
        if (!res || !res.length) throw new Error('لم يُحفظ شيء — تحقّق من صلاحية حسابك.');
        if (msg) { msg.style.color = '#0c6c6c'; msg.textContent = 'حُفظ ' + res.length + ' إعدادًا · يسري على الموقع عند أوّل تحميل.'; }
        return loadSettings(sc);
      })
      .catch(function (e) { if (msg) { msg.style.color = '#8c3d1c'; msg.textContent = e.message; } })
      .then(function () { busy = false; });
  }

  function toolbar(sc) {
    return '<div class="addrow" style="margin-block-end:14px">' +
      '<input id="sc-q" type="text" value="' + esc(q) + '" placeholder="بحث بالاسم…" style="flex:2;min-width:170px">' +
      '<button class="btn ghost" data-sc="search">بحث</button>' +
      (sc.noAdd ? '' : '<button class="btn" data-sc="add">' + ico('plus') + ' إضافة</button>') +
      (sc.xlsx ? '<button class="btn ghost" data-sc="import">' + ico('up') + ' إضافة من إكسل</button>' +
                 '<button class="btn ghost" data-sc="tpl">' + ico('down') + ' تنزيل القالب</button>' : '') +
      (sc.exportCols ? '<button class="btn ghost" data-sc="export">' + ico('down') +
                       ' تنزيل جدول إكسل</button>' : '') +
      '<button class="btn ghost" data-sc="reload">تحديث</button></div>';
  }

  function statVal(spec) {
    if (spec.hidden) return rows.filter(function (r) { return r.status !== 'published'; }).length;
    if (spec.has) return rows.filter(function (r) { return norm(r[spec.has]) !== ''; }).length;
    if (spec.boolTrue) return rows.filter(function (r) { return r[spec.boolTrue] !== false; }).length;
    if (spec.boolFalse) return rows.filter(function (r) { return r[spec.boolFalse] === false; }).length;
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
    if (col.f === 'file') {
      var u = norm(v);
      if (!u) return '<span class="muted">—</span>';
      var nm = u.split('/').pop();
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener" class="mono small" ' +
        'title="' + esc(u) + '">' + esc(nm.length > 22 ? nm.slice(0, 22) + '…' : nm) + '</a>';
    }
    if (col.f === 'mono') {
      return '<span class="mono small muted">' + esc(v) + '</span>';
    }
    if (col.f === 'level') {
      return norm(v) ? '<span class="chip">فرعي ← ' + esc(v) + '</span>'
                     : '<span class="chip" style="background:#f8efdb;color:#7a5518">رئيس</span>';
    }
    if (col.f === 'bool') {
      return v === false ? '<span class="chip" style="background:#f4e9d4;color:#7a5518">مخفي</span>'
                         : '<span class="chip">ظاهر</span>';
    }
    if (col.f === 'hrefcell') {
      var s3 = norm(v);
      if (!s3) return '<span class="muted">منسدلة فقط</span>';
      var ok = targetOk(s3);
      return '<span class="mono small"' + (ok ? '' : ' style="color:#8c3d1c"') + '>' +
        (ok ? '' : '⚠ ') + esc(s3) + '</span>';
    }
    if (col.f === 'datetime') {
      return '<span style="white-space:nowrap" class="small">' + esc(dtLabel(v)) + '</span>';
    }
    if (col.f === 'who') {
      /* أول قيمة تشبه اسمًا ثم أول ما يشبه جوالًا أو بريدًا — المفاتيح نصوص
         تسميات النماذج فتختلف بين نموذج وآخر، فنبحث بالمعنى لا بالمفتاح. */
      var ps = objPairs(v), nm = '', ct = '';
      ps.forEach(function (p) {
        var k = String(p[0]), val = String(p[1]);
        if (!nm && /اسم/.test(k)) nm = val;
        if (!ct && (/جوال|هاتف|بريد|إيميل/.test(k) || /@/.test(val) || /^0\d{9}$/.test(val))) ct = val;
      });
      if (!nm && ps.length) nm = String(ps[0][1]);
      if (!nm && !ct) return '<span class="muted">—</span>';
      return '<b>' + esc(nm) + '</b>' + (ct ? '<br><span class="mono small">' + esc(ct) + '</span>' : '');
    }
    if (col.f === 'gist') {
      var ps2 = objPairs(v);
      if (!ps2.length) return '<span class="muted">—</span>';
      /* حقول الهوية والتواصل تظهر في عمود «المُرسِل»، فلا تُكرَّر هنا. وبلا هذا
         الاستثناء كان الاسم أطولَ قيمة في النماذج القصيرة فيظهر مرّتين. */
      var rest = ps2.filter(function (p) {
        return !/اسم|جوال|هاتف|بريد|إيميل|هوية/.test(String(p[0]));
      });
      var pick = '';
      rest.forEach(function (p) {
        if (/رسالة|نبذة|ملاحظة|تفاصيل|موضوع|استفسار/.test(String(p[0]))) {
          if (!pick) pick = String(p[1]);
        }
      });
      if (!pick) {
        rest.forEach(function (p) {
          var s2 = String(p[1]);
          if (s2.length > pick.length) pick = s2;
        });
      }
      if (pick.length < 16) {
        pick = rest.map(function (p) { return p[0] + ': ' + p[1]; }).join(' · ') || flatPairs(v);
      }
      return '<span class="small" title="' + esc(flatPairs(v)) + '">' +
        esc(pick.length > 60 ? pick.slice(0, 60) + '…' : pick) + '</span>';
    }
    if (col.f === 'avg') {
      var a = avgOf(v);
      if (!a) return '<span class="muted">—</span>';
      var gold = Number(a) >= 4;
      return '<span class="chip"' + (gold ? ' style="background:#f8efdb;color:#7a5518"' : '') +
        '>' + esc(a) + ' / 5</span>';
    }
    if (col.f === 'keys') {
      var n2 = objPairs(v).length;
      return n2 ? '<span class="chip">' + n2 + '</span>' : '<span class="muted">—</span>';
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
      var hay = sc.searchFn ? sc.searchFn(r)
        : keys.map(function (k) { return norm(r[k]); }).join(' ');
      return String(hay).toLowerCase().indexOf(q.toLowerCase()) > -1;
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
          '<button class="ib sm" data-sc="edit" data-id="' + r.id + '" title="' +
            (sc.viewOnly ? 'عرض' : 'تعديل') + '" aria-label="' + (sc.viewOnly ? 'عرض' : 'تعديل') + '">' +
            ico(sc.viewOnly ? 'eye' : 'pen') + '</button>' +
          (sc.noDelete ? '' : ' <button class="ib sm danger" data-sc="del" data-id="' + r.id +
            '" title="حذف" aria-label="حذف">' + ico('trash') + '</button>') +
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
    /* اختيار ملفّ: يُقرأ حجمه وعدد صفحاته فورًا فلا يكتبهما المدير بيد */
    ov.addEventListener('change', function (e) {
      var t0 = e.target;
      if (t0 && t0.type === 'file' && t0.files && t0.files[0]) autoFileMeta(t0.files[0]);
    });
    /* اختيار «رابط خارجي» يُظهر حقل النصّ، وغيره يُخفيه */
    ov.addEventListener('change', function (e) {
      var s = e.target;
      if (!s.id || s.tagName !== 'SELECT') return;
      var ext = document.getElementById(s.id + '-ext');
      if (!ext) return;
      ext.style.display = (s.value === '__ext__') ? '' : 'none';
      if (s.value === '__ext__') ext.focus();
    });
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
    } else if (f.t === 'href') {
      var cur0 = String(val == null ? '' : val).trim();
      var isExt = /^https?:\/\//i.test(cur0);
      var known = targetOk(cur0) && !isExt;
      h += '<select id="' + id + '">' +
        '<option value=""' + (cur0 === '' ? ' selected' : '') + '>— بلا رابط (يفتح منسدلة فقط) —</option>' +
        targets().map(function (o) {
          return '<option value="' + esc(o.v) + '"' + (o.v === cur0 ? ' selected' : '') + '>' +
            esc(o.l) + '</option>';
        }).join('') +
        '<option value="__ext__"' + (isExt ? ' selected' : '') + '>رابط خارجي كامل…</option>' +
        (known || isExt || cur0 === '' ? '' :
          '<option value="' + esc(cur0) + '" selected>⚠ ' + esc(cur0) + ' — غير موجود</option>') +
        '</select>' +
        '<input type="text" id="' + id + '-ext" placeholder="https://example.org" value="' +
        (isExt ? esc(cur0) : '') + '" style="margin-block-start:8px' +
        (isExt ? '' : ';display:none') + '">';
    } else if (f.t === 'parent') {
      /* الآباء المتاحون: العناصر الرئيسة وحدها (parent فارغ). ويُستثنى العنصرُ
         نفسه وأبناؤه، فلا يصير أبًا لنفسه ولا تحت ابنه. */
      var me = staged && staged.mkey ? String(staged.mkey) : '';
      var mine = {};
      if (me) {
        mine[me] = 1;
        rows.forEach(function (r) { if (String(r.parent || '') === me) mine[String(r.mkey)] = 1; });
      }
      var cur1 = String(val == null ? '' : val).trim();
      var opts = rows.filter(function (r) {
        return !String(r.parent || '').trim() && !mine[String(r.mkey)];
      });
      h += '<select id="' + id + '">' +
        '<option value=""' + (cur1 === '' ? ' selected' : '') + '>عنصر رئيسي (في الشريط)</option>' +
        opts.map(function (r) {
          return '<option value="' + esc(r.mkey) + '"' + (String(r.mkey) === cur1 ? ' selected' : '') +
            '>فرعيّ تحت: ' + esc(r.label || r.mkey) + '</option>';
        }).join('') +
        (cur1 && !opts.some(function (r) { return String(r.mkey) === cur1; }) ?
          '<option value="' + esc(cur1) + '" selected>⚠ ' + esc(cur1) + ' — أبٌ غير موجود</option>' : '') +
        '</select>';
    } else if (f.t === 'bool') {
      h += '<select id="' + id + '">' +
        '<option value="1"' + (val === false ? '' : ' selected') + '>ظاهر</option>' +
        '<option value="0"' + (val === false ? ' selected' : '') + '>مخفي</option></select>';
    } else if (f.t === 'file') {
      h += '<input type="file" id="' + id + '" accept=".pdf,application/pdf" ' +
        'style="width:100%;font:inherit;padding:9px;border:1px dashed var(--line);border-radius:10px">';
    } else if (f.t === 'area' || f.t === 'lines' || f.t === 'pairs') {
      var txt = f.t === 'lines' ? linesToText(val) : (f.t === 'pairs' ? pairsToText(val) : String(val == null ? '' : val));
      h += '<textarea id="' + id + '" rows="' + (f.t === 'area' ? 3 : 7) +
        '" style="width:100%;font:inherit;line-height:1.9;resize:vertical">' + esc(txt) + '</textarea>';
    } else {
      h += '<input type="text" id="' + id + '" value="' + esc(val == null ? '' : val) + '">' +
        /* حقلٌ يملؤه الرفع (viaFile) وصورةٌ: يستحقّ منتقي المكتبة نفسه */
        (f.viaFile && /image|img|bg/.test(String(f.k))
          ? '<button type="button" class="btn ghost sm" data-sc="mlopen" data-t="' + id +
            '" style="margin-block-start:8px">مكتبة الصور — اختر أو ارفع</button>' : '');
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
    /* العرض التفصيلي يتقدّم الحقول: الغرض قراءة ما وصل ثم تحديد الحالة. */
    if (sc.detail && row) h = sc.detail(row) + h;
    var title = sc.viewOnly ? 'عرض — ' + sc.nav
              : (isNew ? 'إضافة سجلّ جديد — ' + sc.nav : 'تعديل — ' + sc.nav);
    modal(title, h,
      '<button class="btn ghost" data-sc="close">' + (sc.viewOnly ? 'إغلاق' : 'إلغاء') + '</button>' +
      (sc.viewOnly ? '' :
        '<button class="btn" data-sc="save" data-id="' + (row && row.id ? row.id : '') + '">' +
        (isNew ? 'إضافة' : 'حفظ التعديل') + '</button>'));
  }

  function saveForm(id) {
    var sc = S0(), rec = {}, bad = null;
    /* الملف المختار يُعرف قبل التحقّق: حقلٌ يملؤه الرفع لا يُطالَب بقيمة الآن،
       وإلا رُفض الحفظ بحجّة «مطلوب» قبل أن يجري الرفع الذي يملؤه. */
    var upField = null;
    sc.fields.forEach(function (f) { if (f.t === 'file') upField = f; });
    var upInput = upField ? $('#sc-f-' + upField.k) : null;
    var upFile = (upInput && upInput.files && upInput.files[0]) || null;
    fieldsOf(sc).forEach(function (f) {
      if (bad) return;
      var el = $('#sc-f-' + f.k);
      if (!el) return;
      var v = el.value;
      if (f.t === 'bool') { rec[f.k] = (v === '1'); return; }
      if (f.t === 'parent') { rec[f.k] = norm(v); return; }
      if (f.t === 'href') {
        var pick = norm(v);
        if (pick === '__ext__') {
          var ex = $('#sc-f-' + f.k + '-ext');
          pick = ex ? norm(ex.value) : '';
          if (!/^https?:\/\//i.test(pick)) { bad = f.l + ': الرابط الخارجي يبدأ بـ https://'; return; }
        }
        /* القاعدة: لا رابطَ إلا لهدفٍ موجود — فلا زرَّ يُفضي إلى 404 */
        if (!targetOk(pick)) { bad = f.l + ': لا توجد صفحة بهذا الرابط — اختر من القائمة'; return; }
        rec[f.k] = pick;
        return;
      }
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
      if (f.req && !v && !(f.viaFile && upFile)) { bad = f.l + ': مطلوب'; return; }
      /* بريدٌ خاطئ في جدول الحسابات = حسابٌ لا يستطيع أحدٌ الدخول به */
      if (f.k === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v)) {
        bad = f.l + ': صيغة البريد غير صحيحة';
        return;
      }
      rec[f.k] = v;
    });
    if (bad) { var e0 = $('#sc-formerr'); if (e0) e0.textContent = bad; return; }
    for (var k in sc.fixed) if (sc.fixed.hasOwnProperty(k)) rec[k] = sc.fixed[k];
    /* عمود التوثيق لا يوجد في كل الجداول (news و documents بلا updated_by)،
       وإرسال عمود غير موجود يُرفض بخطأ 400. فيُرسل حيث صُرّح به فقط. */
    if (auditOn(sc)) rec.updated_by = (S && S.email) || '';
    if (busy) return;
    busy = true;
    /* إن اختار المدير ملفًّا فيُرفع أوّلًا: نجاح الرفع شرطٌ لكتابة الرابط،
       فلا يُسجَّل في القاعدة مسارٌ لملفٍ لم يصل. */
    if (upField) delete rec[upField.k];   /* ليس عمودًا في القاعدة */
    /* هدف الرفع هو الحقل الموسوم viaFile لا storage_path حرفيًّا: شاشة
       الشرائح ترفع إلى bg_image، وشاشة الوثائق إلى storage_path. */
    var tgt = null;
    sc.fields.forEach(function (f) { if (f.viaFile && !tgt) tgt = f.k; });
    tgt = tgt || 'storage_path';
    var pre = upFile ? uploadFile(upFile, rec.category || sc.table, rec.title).then(function (url) {
      rec[tgt] = url;
      var sp = $('#sc-f-' + tgt);
      if (sp) sp.value = url;
    }) : Promise.resolve();
    var p = pre.then(function () {
    var q2;
    if (id) {
      q2 = api(sc.table + '?id=eq.' + idPart(sc, id) + '&select=id',
               { method: 'PATCH', body: JSON.stringify(rec) });
    } else {
      /* مفتاحٌ مُولَّدٌ للصفّ الجديد: العمود not null بلا افتراض. يُشتقّ من
         التسمية بحرفٍ لاتينيٍّ آمنٍ مع لاحقةِ وقتٍ تمنع التصادم، ولا يُعدَّل بعد
         الإنشاء لأنّه الوصلة بين الصفّ والعنصر المبنيّ. */
      if (sc.autoKey && !norm(rec[sc.autoKey])) {
        var base = String(rec[sc.nameKey] || '').trim()
          .replace(/[^\u0621-\u064Aa-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
        rec[sc.autoKey] = (base ? base : 'item') + '-' + Date.now().toString(36).slice(-5);
      }
      if (!sc.nosort || hasCol('sort')) {
        /* آخر ملفٍّ في تصنيفه: نقيس أكبر ترتيبٍ داخل المجموعة نفسها لا في
           الجدول كلّه — وإلّا قفز ملفٌّ جديدٌ في تصنيفٍ صغير إلى آخر الجميع. */
        var grp = sc.groupSort && rec[sc.groupSort] != null ? String(rec[sc.groupSort]) : null;
        var mx = 0;
        rows.forEach(function (r) {
          if (grp !== null && String(r[sc.groupSort]) !== grp) return;
          if (r.sort > mx) mx = r.sort;
        });
        if (rec.sort == null) rec.sort = mx + 10;
      }
      q2 = api(sc.table + '?select=id', { method: 'POST', body: JSON.stringify([rec]) });
    }
    return q2;
    });
    p.then(function (out) {
      if (!out || !out.length) throw new Error('لم يتغيّر أي صفّ — تحقّق من صلاحية حسابك.');
      close();
      return load().then(paint);
    }).catch(function (ex) {
      var el = $('#sc-formerr');
      if (el) el.textContent = ex.message; else { err = ex.message; paint(); }
    }).then(function () { busy = false; });
  }

  /* ---------------- بوّابة كلمة المرور قبل الحذف ----------------
     الحذف لا رجعةَ فيه، وسجلّ التراجع لا يغطّي ما جرى قبل ترقية v9. فكلمة
     المرور حاجزٌ أرخص من فقدان بيانات. والتحقّق حقيقيّ لا مربّعُ تأكيد. */
  function verifyPassword(pass) {
    var email = (window.IAQ_AUTH && window.IAQ_AUTH.email()) || (S && S.email) || '';
    if (!email) return Promise.reject(new Error('لا بريد في الجلسة — اخرج وادخل من جديد.'));
    if (!pass || pass.length < 6) return Promise.reject(new Error('كلمة المرور قصيرة جدًّا.'));
    return fetch(CFG.url + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: CFG.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: pass })
    }).then(function (r) {
      if (r.ok) return true;
      if (r.status === 429) throw new Error('محاولات كثيرة — انتظر قليلًا ثم أعد المحاولة.');
      throw new Error('كلمة المرور غير صحيحة.');
    });
  }

  /* ما يجري بعد نجاح التحقّق — يُضبط قبل فتح النافذة */
  var pendingDelete = null;

  function askPassword(title, body, onOk) {
    pendingDelete = onOk;
    modal(title,
      body +
      '<div class="fld" style="margin-block-start:14px">' +
      '<label for="sc-pw">أكّد هويّتك بكلمة مرور حسابك</label>' +
      '<input type="password" id="sc-pw" autocomplete="current-password" ' +
      'placeholder="••••••••" style="width:100%">' +
      '<div class="muted small" style="margin-block-start:6px">' +
      esc((window.IAQ_AUTH && window.IAQ_AUTH.email()) || (S && S.email) || '') + '</div>' +
      '</div><div id="sc-pwerr" class="small" style="color:#8c3d1c;margin-block-start:8px"></div>',
      '<button class="btn ghost" data-sc="close">إلغاء</button>' +
      '<button class="btn danger" data-sc="pwyes">تأكيد الحذف</button>');
    setTimeout(function () { var el = $('#sc-pw'); if (el) el.focus(); }, 60);
  }

  function runPasswordGate() {
    var el = $('#sc-pw'), ep = $('#sc-pwerr');
    if (!el) return;
    var pass = el.value;
    if (ep) { ep.style.color = ''; ep.textContent = 'جارٍ التحقّق…'; }
    verifyPassword(pass).then(function () {
      var fn = pendingDelete;
      pendingDelete = null;
      if (fn) fn();
    }).catch(function (e) {
      if (ep) { ep.style.color = '#8c3d1c'; ep.textContent = e.message; }
      if (el) { el.value = ''; el.focus(); }
    });
  }

  function askDelete(id) {
    var sc = S0(), r = null;
    rows.forEach(function (x) { if (String(x.id) === String(id)) r = x; });
    if (!r) return;
    askPassword('تأكيد الحذف',
      '<p>حذف <b>' + esc(labelOf(sc, r)) + '</b> نهائيًّا من قاعدة البيانات؟</p>' +
      '<p class="muted small">' + (sc.delNote ||
        ('سيُرفع من الموقع عند أوّل تحميل للصفحة. وإن أردت إبقاءه في السجلّ ' +
         'وإخفاءه فقط فاستخدم «تعديل» واختر ' +
         (sc.table === 'news' ? '«مسودّة»' : '«مخفي»') + '.')) + '</p>',
      function () { doDelete(r.id); });
  }
  function doDelete(id) {
    if (busy) return;
    busy = true;
    var sc = S0();
    api(sc.table + '?id=eq.' + idPart(sc, id) + '&select=id', { method: 'DELETE' })
      .then(function (out) {
        if (!out || !out.length) throw new Error('لم يُحذف شيء — قد يكون محذوفًا أو لا تسمح الصلاحية.');
        close();
        return load().then(paint);
      })
      .catch(function (ex) { err = ex.message; close(); paint(); })
      .then(function () { busy = false; });
  }

  /* ============================== رفع الملفات ============================== */
  /* يُرفع إلى دلو iaq-files العامّ: القراءة للجميع والكتابة للمدير وحده
     (سياسات storage.objects في schema-v2). ويعاد رابط عامّ ثابت. */
  function safeName(name) {
    var dot = String(name || '').lastIndexOf('.');
    var ext = dot > -1 ? String(name).slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'pdf';
    var base = (dot > -1 ? String(name).slice(0, dot) : String(name || 'file'))
      .replace(/[^\u0621-\u064Aa-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    /* الاسم العربي يُرمَّز في الرابط؛ نُبقيه لأنه أوضح للمدير في القاعدة */
    return (base || 'file') + '.' + (ext || 'pdf');
  }
  /* حجمٌ مقروءٌ كما يكتبه الإنسان — يُقرأ من الملفّ فلا يُكتب بيد */
  function sizeLabel(bytes) {
    var b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
    var m = b / (1024 * 1024);
    return (m < 10 ? m.toFixed(1) : String(Math.round(m))) + ' MB';
  }

  /* عدد صفحات PDF بلا مكتبة خارجية. طريقتان تُكمل إحداهما الأخرى:
     /Count في شجرة الصفحات دقيقٌ حين يوجد، ويغيب حين تكون الشجرة داخل مجرى
     ملاحظة: [^>] لا [\s\S] — المطابقة يجب أن تبقى داخل قاموس الكائن،
     وإلّا أخذت /Count من كائنٍ آخر (جرّبته: أعطى ٧ بدل ١٧).
     كائناتٍ مضغوط — وهناك يُنقذنا عدّ /Type /Page بعد فكّ المجاري.
     جُرّبت على أربعٍ وعشرين وثيقةً حقيقيةً من وثائق الموقع: أصابت كلَّها،
     بينما أخطأت كلُّ طريقةٍ منهما وحدها في بعضها. */
  function pdfPages(buf) {
    var u8 = new Uint8Array(buf);
    var txt = '';
    /* نقرأ البايتات كلاتينيّ-١ لا كـUTF-8: بنية PDF بايتاتٌ لا نصّ، والترميز
       الخاطئ يُفسد المطابقة. */
    for (var i = 0; i < u8.length; i += 65536) {
      txt += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + 65536, u8.length)));
    }
    var best = 0, m, re = /\/Type\s*\/Pages\b[^>]{0,400}?\/Count\s+(\d+)/g;
    while ((m = re.exec(txt))) { var n = parseInt(m[1], 10); if (n > best) best = n; }
    if (best) return Promise.resolve(best);

    /* لا شجرةَ ظاهرة: نعدّ /Type /Page في الخام ثمّ في المجاري المفكوكة */
    function countIn(s) { return (s.match(/\/Type\s*\/Page[^s]/g) || []).length; }
    var total = countIn(txt);
    if (typeof DecompressionStream !== 'function') return Promise.resolve(total);

    var streams = [], sre = /stream\r?\n/g, sm;
    while ((sm = sre.exec(txt))) {
      var start = sm.index + sm[0].length;
      var end = txt.indexOf('endstream', start);
      if (end < 0) break;
      if (end - start > 8 && end - start < 4 * 1024 * 1024) streams.push([start, end]);
      if (streams.length > 400) break;          /* سقفٌ: لا نُعلّق اللوحة */
    }
    return streams.reduce(function (chain, se) {
      return chain.then(function () {
        return new Response(new Blob([u8.subarray(se[0], se[1])])
          .stream().pipeThrough(new DecompressionStream('deflate')))
          .text()
          .then(function (s) { total += countIn(s); })
          .catch(function () { });                /* مجرًى غير مضغوطٍ بـflate */
      });
    }, Promise.resolve()).then(function () { return total; });
  }

  /* يقرأ الملفّ مرّةً واحدة ويملأ الحجم وعدد الصفحات في النموذج */
  function autoFileMeta(file) {
    var sz = $('#sc-f-size_label');
    if (sz) sz.value = sizeLabel(file.size);
    var pg = $('#sc-f-pages');
    if (!pg || !/\.pdf$/i.test(file.name || '')) return;
    pg.value = '';
    file.arrayBuffer().then(pdfPages).then(function (n) {
      if (n > 0 && pg) pg.value = String(n);
    }).catch(function () { });                    /* الفشل يُبقيه فارغًا لا خاطئًا */
  }

  function uploadFile(file, category, title) {
    if (file.size > 25 * 1024 * 1024) {
      return Promise.reject(new Error('حجم الملف يتجاوز 25 ميجابايت — اضغطه أو ارفعه بوسيلة أخرى.'));
    }
    /* بصمة وقت الرفع: تمنع تصادم الأسماء، وتضمن رابطًا جديدًا عند استبدال
       وثيقة فلا تُخدَم نسخةٌ قديمة من ذاكرة الوسيط. */
    var stamp = Date.now().toString(36);
    /* الاسم من عنوان الوثيقة لا من اسم الملفّ على جهاز المدير: خاصيّة download
       يتجاهلها المتصفّح عبر الأصول (الملفّات على نطاق سوپابيز والموقع على نطاقه)،
       فما يُحفظ به الملفّ هو آخر جزءٍ من الرابط. فليكن العنوان. */
    var base = safeName(String(title || '').trim() || file.name);
    if (!/\.[a-z0-9]{2,4}$/i.test(base)) base += '.pdf';
    /* البصمة مجلّدٌ لا بادئةَ اسم: فآخر جزءٍ من الرابط — وهو ما يحفظ به
       المتصفّح — يبقى عنوان الوثيقة نقيًّا. */
    var path = 'docs/' + (category || 'other') + '/' + stamp + '/' + base;
    var el = $('#sc-formerr');
    if (el) { el.style.color = ''; el.textContent = 'جارٍ رفع الملف…'; }
    return fetch(CFG.url + '/storage/v1/object/' + encodeURI('iaq-files/' + path) + '?upsert=true', {
      method: 'POST',
      headers: {
        apikey: CFG.key,
        Authorization: 'Bearer ' + tok(),
        'x-upsert': 'true',
        'Content-Type': file.type || 'application/pdf'
      },
      body: file
    }).then(function (r) {
      if (r.ok) {
        if (el) { el.style.color = '#8c3d1c'; el.textContent = ''; }
        return CFG.url + '/storage/v1/object/public/' + encodeURI('iaq-files/' + path);
      }
      return r.text().then(function (b) {
        var d = '';
        try { var j = JSON.parse(b); d = j.message || j.error || ''; } catch (e) { d = String(b).slice(0, 140); }
        if (r.status === 404) d = 'دلو التخزين iaq-files غير موجود — شغّل supabase/schema-v2.sql';
        throw new Error('تعذّر رفع الملف (' + r.status + ') ' + d);
      });
    });
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
  var COLREF = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  function templateBlob(sc) {
    return xlsxBlob(sc.xlsx.cols, sc.xlsx.sample.concat([[]]), true);
  }
  /* كاتبٌ واحد للقالب وللتصدير: نفس الترميز والأنماط واتجاه الورقة، فلا
     يتفرّق شكل الملفّين ولا يُصلح عيبٌ في أحدهما دون الآخر. */
  function xlsxBlob(cols, bodyRows, withValidation) {
    var rowsXml = '<row r="1">' + cols.map(function (c, i) {
      return xcell(COLREF[i] + '1', c.l, true);
    }).join('') + '</row>';
    bodyRows.forEach(function (sr, si) {
      var r = si + 2;
      rowsXml += '<row r="' + r + '">' + cols.map(function (c, i) {
        return xcell(COLREF[i] + r, sr[i] == null ? '' : sr[i]);
      }).join('') + '</row>';
    });
    var dv = '';
    cols.forEach(function (c, i) {
      if (!c.o || !withValidation) return;
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
  /* تصدير الصفوف المعروضة (بعد البحث) جدولَ إكسل — بنفس كاتب الحزمة */
  function exportSheet() {
    var sc = S0();
    if (!sc.exportCols) return;
    var list = rows.filter(function (r) {
      if (!q) return true;
      var hay = sc.searchFn ? sc.searchFn(r) : norm(r.name) + ' ' + norm(r.title);
      return String(hay).toLowerCase().indexOf(q.toLowerCase()) > -1;
    });
    var body = list.map(function (r) {
      return sc.exportCols.map(function (c) { return String(c.get(r) == null ? '' : c.get(r)); });
    });
    var blob = xlsxBlob(sc.exportCols, body, false);
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = sc.exportName || 'جدول.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
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
      var rec = { status: 'published' };
      if (!sc.nosort) rec.sort = mx + (i + 1) * 10;
      if (auditOn(sc)) rec.updated_by = (S && S.email) || '';
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
    if (a === 'export') { e.preventDefault(); exportSheet(); return; }
    if (a === 'range') {
      e.preventDefault();
      /* «منذ الإنشاء» قيمتها صفر، و«|| 30» كانت تُحوّلها إلى ثلاثين */
      var dd = parseInt(b.getAttribute('data-d'), 10);
      RANGE = (isFinite(dd) && dd >= 0) ? dd : 30;
      var sc1 = S0();
      /* paintTab يُعيد رسم شريط المدى أيضًا — وبلا ذلك بقي الزرُّ النشط قديمًا */
      if (sc1.kind === 'dash') paintTab(cur);
      else if (sc1.kind === 'visits') paintVisits(cur);
      else if (sc1.kind === 'worklog') paintWorklog(cur);
      return;
    }
    if (a === 'add') { e.preventDefault(); openForm(null); return; }
    if (a === 'import') { e.preventDefault(); openImport(); return; }
    if (a === 'importgo') { e.preventDefault(); importGo(); return; }
    if (a === 'save') { e.preventDefault(); saveForm(id); return; }
    if (a === 'del') { e.preventDefault(); askDelete(id); return; }
    if (a === 'pwyes') { e.preventDefault(); runPasswordGate(); return; }
    if (a === 'undo') { e.preventDefault(); askUndo(id); return; }
    if (a === 'undoyes') { e.preventDefault(); doUndo(id); return; }
    if (a === 'mlreload') { e.preventDefault(); mlMsg('جارٍ التحديث…'); loadMedia(null); return; }
    if (a === 'mldel') { e.preventDefault(); mediaDelete(id); return; }
    if (a === 'mlcopy') {
      e.preventDefault();
      var u0 = b.getAttribute('data-u') || '';
      try {
        if (navigator.clipboard) navigator.clipboard.writeText(u0);
        else {
          var ta = document.createElement('textarea');
          ta.value = u0; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); ta.remove();
        }
        mlMsg('نُسخ الرابط.', 'ok');
      } catch (e2) { mlMsg('تعذّر النسخ — انسخه يدويًّا: ' + u0, 'err'); }
      return;
    }
    if (a === 'mlopen') { e.preventDefault(); openPicker(b.getAttribute('data-t') || ''); return; }
    if (a === 'mlpick') { e.preventDefault(); applyPick(b.getAttribute('data-u') || ''); return; }
    if (a === 'dtab') {
      e.preventDefault();
      DASH_TAB = b.getAttribute('data-t') || 'now';
      var tb = document.querySelector('.dash-tabs');
      if (tb) {
        [].slice.call(tb.querySelectorAll('.dash-tab')).forEach(function (x) {
          x.classList.toggle('is-on', x.getAttribute('data-t') === DASH_TAB);
        });
      }
      paintTab(cur);
      return;
    }
    if (a === 'delyes') { e.preventDefault(); doDelete(id); return; }
    if (a === 'setsave') { e.preventDefault(); saveSettings(S0()); return; }
    if (a === 'reload') {
      e.preventDefault();
      var sc0 = S0();
      if (sc0.kind === 'settings') loadSettings(sc0).then(function () { paintSettings(sc0); });
      else load().then(paint);
      return;
    }
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
