/* ============================================================================
   جسر البيانات — يوصل تصميم اللوحة بقاعدة البيانات دون تعديل أي شاشة فيه.

   التصميم يقرأ ويكتب في كائن واحد اسمه config عبر دالّتين فقط:
       load()  كانت تقرأ من localStorage  →  صارت تقرأ من هنا
       save()  كانت تكتب في localStorage  →  صارت تكتب من هنا
   فكل شاشاته تعمل كما هي، وما يُحفظ يصير في القاعدة لا في متصفّح واحد.

   مصدران للحقيقة:
   • IAQ_REAL: بيانات معروفة وقت البناء (الهوية، التواصل، الصفحات، أقسام
     الرئيسية) — تُحقن جاهزة فلا تنتظر الشبكة ولا تُخطئ.
   • القاعدة: الأخبار والطلبات والوسائط والمستخدمون + كامل حالة اللوحة
     المخزَّنة في صفّ واحد (settings.panel_config) كي تتبع المدير على أي جهاز.

   شريط الحالة أعلى اللوحة يقول دائمًا ما جرى: متصل، أو نصّ الخطأ كما ورد من
   الخدمة. لا شاشة صامتة بعد اليوم.
   ============================================================================ */
(function () {
  'use strict';

  var CFG = window.IAQ_SUPABASE || { url: '', key: '' };
  var S = window.IAQ_SESSION || null;
  var REAL = window.IAQ_REAL || {};
  var BLOB = 'panel_config';

  /* ------------------------------ شريط الحالة ------------------------------ */
  var bar = null;
  function status(msg, kind) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'iaqStatus';
      bar.style.cssText = 'position:fixed;inset-block-end:0;inset-inline:0;z-index:400;padding:9px 16px;' +
        'font-family:Tajawal,sans-serif;font-size:13px;line-height:1.7;text-align:center;' +
        'border-block-start:1px solid rgba(0,0,0,.08);direction:rtl';
      document.body.appendChild(bar);
      document.body.style.paddingBottom = '44px';
    }
    var c = kind === 'err' ? ['#fdf1ec', '#8c3d1c'] : (kind === 'warn' ? ['#fff8ec', '#7a5518'] : ['#eef4f3', '#0c6c6c']);
    bar.style.background = c[0];
    bar.style.color = c[1];
    bar.textContent = msg;
  }

  function fatal(msg) {
    var m = document.getElementById('viewArea') || document.body;
    m.innerHTML = '<div class="ad-card"><h3>تعذّر تحميل البيانات</h3>' +
      '<div class="notice" style="background:#fdf1ec;border-color:#f0cdbc;color:#8c3d1c">' +
      esc(msg) + '</div>' +
      '<p class="muted">اللوحة لم تُشغَّل كي لا تُظهر بيانات غير حقيقية. أعد تحميل الصفحة، وإن تكرّر الخطأ فانسخ نصّه.</p></div>';
    status(msg, 'err');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ------------------------------ طلبات الخدمة ------------------------------ */
  function headers(extra, json) {
    var h = { apikey: CFG.key, Authorization: 'Bearer ' + (S ? S.access_token : '') };
    if (json) h['Content-Type'] = 'application/json';
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
    return h;
  }
  function must(r) {
    if (r.ok) return r;
    return r.text().then(function (b) {
      var d = '';
      try { var j = JSON.parse(b); d = j.message || j.hint || j.error_description || ''; } catch (e) { d = String(b).slice(0, 140); }
      var e2 = new Error('(' + r.status + ') ' + (d || 'فشل الطلب'));
      e2.status = r.status;
      throw e2;
    });
  }
  function sel(table, q) {
    return fetch(CFG.url + '/rest/v1/' + table + '?' + q, { headers: headers() })
      .then(must).then(function (r) { return r.json(); });
  }
  function upsert(table, rows, onConflict) {
    return fetch(CFG.url + '/rest/v1/' + table + (onConflict ? '?on_conflict=' + onConflict : ''), {
      method: 'POST', headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }, true),
      body: JSON.stringify(rows)
    }).then(must).then(function (r) { return r.json(); });
  }
  function patch(table, filter, body) {
    return fetch(CFG.url + '/rest/v1/' + table + '?' + filter, {
      method: 'PATCH', headers: headers({ Prefer: 'return=representation' }, true),
      body: JSON.stringify(body)
    }).then(must).then(function (r) { return r.json(); });
  }

  /* ------------------------- تحويل صفوف القاعدة ------------------------- */
  var AR_MONTH = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function arDate(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return String(iso);
    var mi = parseInt(p[1], 10) - 1;
    return parseInt(p[2], 10) + ' ' + (AR_MONTH[mi] || p[1]) + ' ' + p[0];
  }
  function ago(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var m = Math.floor((Date.now() - d.getTime()) / 60000);
    if (m < 2) return 'الآن';
    if (m < 60) return 'قبل ' + m + ' دقيقة';
    var h = Math.floor(m / 60);
    if (h < 24) return 'قبل ' + h + ' ساعة';
    var dd = Math.floor(h / 24);
    return dd === 1 ? 'أمس' : 'قبل ' + dd + ' يومًا';
  }

  function newsIn(rows) {
    return (rows || []).map(function (n) {
      return { id: 'db' + n.id, dbid: n.id, tag: n.tag || '', date: arDate(n.date),
               title: n.title || '', excerpt: n.lead || (n.body && n.body[0]) || '',
               status: n.status };
    });
  }
  var KIND_AR = { contact: 'تواصل', volunteer: 'تطوّع', membership: 'عضوية', jobs: 'وظائف', newsletter: 'نشرة' };
  var ST_AR = { 'new': 'جديد', in_progress: 'قيد المعالجة', closed: 'مغلق', archived: 'مؤرشف' };
  function pick(o, keys) {
    for (var i = 0; i < keys.length; i++) if (o && o[keys[i]]) return String(o[keys[i]]);
    return '';
  }
  function subsIn(rows) {
    return (rows || []).map(function (r) {
      var p = r.payload || {};
      var msg = pick(p, ['الرسالة', 'message', 'notes', 'الملاحظات']);
      if (!msg) { var acc = []; for (var k in p) if (p.hasOwnProperty(k)) acc.push(k + ': ' + p[k]); msg = acc.join(' · '); }
      return {
        id: 'db' + r.id, dbid: r.id,
        type: KIND_AR[r.kind] || r.kind,
        name: pick(p, ['الاسم الكامل', 'الاسم', 'name', 'full_name']) || '—',
        email: pick(p, ['البريد الإلكتروني', 'البريد', 'email']),
        phone: pick(p, ['رقم الجوال', 'الجوال', 'phone']),
        subject: pick(p, ['الموضوع', 'نوع التواصل', 'subject']) || (KIND_AR[r.kind] || ''),
        message: msg, status: ST_AR[r.status] || r.status,
        assignee: '', priority: r.priority === 'high' ? 'عالية' : (r.priority === 'low' ? 'منخفضة' : 'عادية'),
        date: ago(r.created_at), rt: 0, replies: [], notes: []
      };
    });
  }
  function mediaIn(rows) {
    return (rows || []).map(function (m) {
      return { id: 'db' + m.id, dbid: m.id, name: m.title || m.storage_path,
               src: CFG.url + '/storage/v1/object/public/' + (m.bucket || 'iaq-media') + '/' + m.storage_path };
    });
  }
  function usersIn(rows) {
    var RN = { admin: 'r_admin', editor: 'r_content', viewer: 'r_viewer' };
    return (rows || []).map(function (a, i) {
      return { id: 'db' + i, name: a.name || a.email, email: a.email,
               role: RN[a.role] || 'r_viewer', status: 'نشط', last: '' };
    });
  }

  /* ------------------------------ بناء config ------------------------------ */
  function compose(blob, db) {
    var c = {};
    if (blob && typeof blob === 'object') for (var k in blob) if (blob.hasOwnProperty(k)) c[k] = blob[k];

    /* بيانات البناء تسبق ما في الكائن المحفوظ للحقول التي يملكها المصدر */
    if (REAL.brand) c.brand = merge(c.brand, REAL.brand);
    if (REAL.settings) c.settings = merge(c.settings, REAL.settings);
    if (REAL.social) c.social = merge(c.social, REAL.social);
    if (REAL.pages && REAL.pages.length) c.pages = REAL.pages;
    if (REAL.sections && REAL.sections.length && !blobHas(blob, 'sections')) c.sections = REAL.sections;
    if (REAL.menu && REAL.menu.length && !blobHas(blob, 'menu')) c.menu = REAL.menu;
    if (REAL.seoTitle) c.seoTitle = REAL.seoTitle;

    /* جداول القاعدة تُعرض كما هي دائمًا */
    if (db.news) c.news = newsIn(db.news);
    if (db.subs) c.submissions = subsIn(db.subs);
    if (db.media && db.media.length) c.media = mediaIn(db.media);
    if (db.admins && db.admins.length) c.users = usersIn(db.admins);

    /* أرقام حقيقية بدل المفبركة، وما لا نعرفه يُصفَّر لا يُختلق */
    c.contentStats = { pages: (c.pages || []).length, news: (c.news || []).length,
                       media: (c.media || []).length, sections: (c.sections || []).length };
    return c;
  }
  /* تُعرض في اللوحة القيم السارية فعلًا على الموقع: التعديل إن وُجد وإلا الأصل.
     بهذا يرى المدير الحقيقة لا نسخة قديمة محفوظة في كائن اللوحة. */
  function overlaySite(c) {
    if (!T) return;
    (c.sections || []).forEach(function (s) {
      var m = T.sections[s.key];
      if (!m) return;
      if (m.eyebrow) s.name = shown(m.eyebrow);
      if (m.title) s.title = shown(m.title);
      if (m.subtitle) s.subtitle = shown(m.subtitle);
      if (m.root) s.visible = !OVR[ovrKey('index', m.root.path, 'hide')];
    });
    /* الأقسام الموجودة في الصفحة ولا تعرفها اللوحة تُضاف كي يتحكّم بها */
    var known = {};
    (c.sections || []).forEach(function (s) { known[s.key] = 1; });
    for (var k in T.sections) {
      if (!T.sections.hasOwnProperty(k) || known[k]) continue;
      var m2 = T.sections[k];
      if (!m2.title) continue;
      c.sections = c.sections || [];
      c.sections.push({ id: 'sec_' + k, key: k, name: shown(m2.eyebrow),
                        visible: !OVR[ovrKey('index', m2.root.path, 'hide')],
                        editable: true, title: shown(m2.title), subtitle: shown(m2.subtitle) });
    }
    var hs = (c.content && c.content.heroSlides) || c.heroSlides;
    if (hs) {
      for (var i = 0; i < hs.length && i < T.hero.length; i++) {
        if (T.hero[i].eyebrow) hs[i].eyebrow = shown(T.hero[i].eyebrow);
        if (T.hero[i].title) hs[i].title = shown(T.hero[i].title);
        if (T.hero[i].text) hs[i].text = shown(T.hero[i].text);
      }
    }
  }

  function merge(base, over) {
    var o = {};
    if (base) for (var k in base) if (base.hasOwnProperty(k)) o[k] = base[k];
    if (over) for (var k2 in over) if (over.hasOwnProperty(k2) && over[k2] !== '' && over[k2] != null) o[k2] = over[k2];
    return o;
  }
  function blobHas(b, k) { return !!(b && b[k] && b[k].length); }

  /* ============================ وصل الشاشات بالموقع ============================
     شاشتا «أقسام الرئيسية» و«النصوص والمحتوى» تُحرّران نصوصًا موجودة فعلًا في
     الصفحة الرئيسة. نوصلهما بجدول content_overrides فيصير التعديل نافذًا على
     الموقع عند أوّل تحميل، بلا إعادة بناء.

     المسارات والبصمات تُحسب داخل إطار يحمل الصفحة الحقيقية بوسم iaq-edit=1،
     أي بالخوارزمية نفسها التي ستُطبّق التعديل لاحقًا. لا نُعيد كتابتها هنا،
     فلا يمكن أن تتباعد نسختان.
     ============================================================================ */
  var T = null;        // خريطة الأهداف: مسار + بصمة + النصّ الأصلي
  var OVR = {};        // التعديلات القائمة، مفتاحها page|path|op
  var frameWin = null;

  function ovrKey(page, path, op) { return page + '|' + path + '|' + op; }

  function loadTargets() {
    return new Promise(function (done) {
      var fr = document.createElement('iframe');
      fr.setAttribute('aria-hidden', 'true');
      fr.style.cssText = 'position:absolute;width:1280px;height:800px;inset-block-start:-99999px;border:0';
      fr.src = 'index.html?iaq-edit=1';
      fr.onload = function () {
        try { done(scan(fr.contentWindow, fr.contentDocument)); }
        catch (e) { done(null); }
      };
      fr.onerror = function () { done(null); };
      document.body.appendChild(fr);
      setTimeout(function () { done(T || null); }, 9000);   // لا نُعلّق اللوحة أبدًا
    });
  }

  function scan(w, d) {
    var P = w.IAQ_PATH;
    if (!P) return null;
    frameWin = w;

    function target(el) {
      if (!el) return null;
      var path = P.pathOf(el);
      if (!path) return null;
      var mixed = !!el.firstElementChild;
      return { path: path, op: mixed ? 'html' : 'text',
               orig: mixed ? el.innerHTML : el.textContent,
               plain: P.norm(el.textContent) };
    }

    var map = { sections: {}, hero: [], aboutIntro: null };

    /* أقسام الرئيسية: العنوان الصغير والكبير والوصف، وجذر القسم للإظهار والإخفاء */
    [].slice.call(d.querySelectorAll('section[id]')).forEach(function (sec) {
      var hd = sec.querySelector('.section-head');
      if (!hd) return;
      map.sections[sec.id] = {
        eyebrow: target(hd.querySelector('.eyebrow')),
        title: target(hd.querySelector('h2')),
        subtitle: target(hd.querySelector('p')),
        root: { path: P.pathOf(sec), op: 'hide', orig: '', plain: '' }
      };
    });

    /* شرائح الغلاف */
    [].slice.call(d.querySelectorAll('.hero-slide')).forEach(function (sl) {
      map.hero.push({ eyebrow: target(sl.querySelector('.hero-eyebrow')),
                      title: target(sl.querySelector('h1')),
                      text: target(sl.querySelector('.hero-text')) });
    });

    return map;
  }

  /* بصمة الأصل بالخوارزمية نفسها التي يستخدمها الموقع عند التطبيق */
  function fpFor(t) {
    if (!frameWin || !frameWin.IAQ_PATH) return null;
    var el = frameWin.IAQ_PATH.nodeAt(frameWin.document, t.path);
    if (!el) return null;
    return (t.op === 'html') ? frameWin.IAQ_PATH.fpOf(el, el.innerHTML) : frameWin.IAQ_PATH.fpOf(el);
  }
  function normOf(s) {
    return (frameWin && frameWin.IAQ_PATH) ? frameWin.IAQ_PATH.norm(s) : String(s == null ? '' : s).trim();
  }

  /* القيمة المعروضة في اللوحة: التعديل السارِي إن وُجد، وإلا الأصل المبنيّ */
  function shown(t, page) {
    if (!t) return '';
    var o = OVR[ovrKey(page || 'index', t.path, t.op)];
    if (o && o.value != null) return o.value;
    /* دائمًا النصّ المجرّد: عرض HTML خام في حقل نصّ يُربك، والمقارنة به تُنتج
       فروقًا وهمية. وما لم يُغيّره المدير لا يُكتب أصلًا فتبقى الوسوم الداخلية. */
    return t.plain;
  }

  /* يبني قائمة الكتابات من الفرق بين ما في اللوحة وما في الصفحة */
  function diffOne(out, t, val, label, page) {
    if (!t || val == null) return;
    page = page || 'index';
    var cur = String(val);
    var key = ovrKey(page, t.path, t.op);
    var base = t.plain;
    if (normOf(cur) === normOf(base)) {
      if (OVR[key]) out.del.push({ page: page, path: t.path, op: t.op });   // عاد للأصل
      return;
    }
    if (OVR[key] && String(OVR[key].value) === cur) return;                 // لا جديد
    var fp = fpFor(t);
    out.up.push({ page: page, path: t.path, op: t.op, attr: '', part: -1,
                  value: cur, orig_fp: fp, orig_text: String(base).slice(0, 300),
                  label: label, status: 'published',
                  updated_by: (S && S.email) || '' });
  }

  function diffVisible(out, root, visible, label) {
    if (!root) return;
    var key = ovrKey('index', root.path, 'hide');
    if (visible === false) {
      if (OVR[key]) return;
      out.up.push({ page: 'index', path: root.path, op: 'hide', attr: '', part: -1,
                    value: null, orig_fp: fpFor(root), orig_text: '', label: label,
                    status: 'published', updated_by: (S && S.email) || '' });
    } else if (OVR[key]) {
      out.del.push({ page: 'index', path: root.path, op: 'hide' });
    }
  }

  function collectSite(config) {
    var out = { up: [], del: [] };
    if (!T) return out;
    (config.sections || []).forEach(function (s) {
      var m = T.sections[s.key];
      if (!m) return;
      diffOne(out, m.eyebrow, s.name, 'العنوان الصغير — ' + s.key);
      diffOne(out, m.title, s.title, 'عنوان القسم — ' + s.key);
      diffOne(out, m.subtitle, s.subtitle, 'وصف القسم — ' + s.key);
      diffVisible(out, m.root, s.visible, 'إظهار القسم — ' + s.key);
    });
    var hs = (config.content && config.content.heroSlides) || config.heroSlides || [];
    for (var i = 0; i < hs.length && i < T.hero.length; i++) {
      diffOne(out, T.hero[i].eyebrow, hs[i].eyebrow, 'شريحة ' + (i + 1) + ' — التمهيد');
      diffOne(out, T.hero[i].title, hs[i].title, 'شريحة ' + (i + 1) + ' — العنوان');
      diffOne(out, T.hero[i].text, hs[i].text, 'شريحة ' + (i + 1) + ' — النصّ');
    }
    return out;
  }

  function applySite(config) {
    var w = collectSite(config);
    if (!w.up.length && !w.del.length) return Promise.resolve(0);
    var jobs = [];
    if (w.up.length) {
      jobs.push(upsert('content_overrides', w.up, 'page,path,op,attr,part').then(function (rows) {
        (rows || []).forEach(function (r) { OVR[ovrKey(r.page, r.path, r.op)] = r; });
      }));
    }
    w.del.forEach(function (d) {
      jobs.push(fetch(CFG.url + '/rest/v1/content_overrides?page=eq.' + encodeURIComponent(d.page) +
        '&path=eq.' + encodeURIComponent(d.path) + '&op=eq.' + encodeURIComponent(d.op),
        { method: 'DELETE', headers: headers({ Prefer: 'return=representation' }) })
        .then(must).then(function () { delete OVR[ovrKey(d.page, d.path, d.op)]; }));
    });
    return Promise.all(jobs).then(function () { return w.up.length + w.del.length; });
  }

  /* -------------------------------- الحفظ -------------------------------- */
  var timer = null, lastJson = '', saving = false, pending = false;

  window.IAQ_CFG_SAVE = function (config) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { flush(config); }, 700);
    status('جارٍ الحفظ…', 'warn');
  };

  function flush(config) {
    if (saving) { pending = true; return; }
    var body;
    try { body = JSON.stringify(config); } catch (e) { status('تعذّر تجهيز البيانات للحفظ: ' + e.message, 'err'); return; }
    if (body === lastJson) { status('لا تغييرات جديدة', 'ok'); return; }
    saving = true;
    upsert('settings', [{ key: BLOB, value: config, label: 'حالة لوحة التحكّم', is_public: false,
                          updated_by: (S && S.email) || '' }], 'key')
      .then(function () {
        lastJson = body;
        return Promise.all([syncNews(config), applySite(config)]);
      })
      .then(function (r) {
        var n = r[0], live = r[1];
        status('حُفظ في قاعدة البيانات' +
               (live ? ' · سرى ' + live + ' تعديلًا على الموقع (يظهر للزائر عند أوّل تحميل)' : '') +
               (n ? ' · حُدِّث ' + n + ' خبرًا' : ''), 'ok');
      })
      .catch(function (e) {
        status('فشل الحفظ: ' + (e && e.message ? e.message : e), 'err');
      })
      .then(function () {
        saving = false;
        if (pending) { pending = false; flush(config); }
      });
  }

  /* الأخبار جدول حقيقي: نُعيد إليه ما يقبل التطابق (التصنيف والعنوان والمقدّمة).
     التاريخ لا يُكتب لأن التصميم يعرضه نصًّا عربيًّا لا تاريخًا قابلًا للتحويل. */
  function syncNews(config) {
    var list = (config && config.news) || [], jobs = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (!n.dbid) continue;
      jobs.push({ id: n.dbid, tag: n.tag || '', title: n.title || '', lead: n.excerpt || '' });
    }
    if (!jobs.length) return Promise.resolve(0);
    var done = 0;
    return jobs.reduce(function (p, j) {
      return p.then(function () {
        return patch('news', 'id=eq.' + Number(j.dbid), { tag: j.tag, title: j.title, lead: j.lead })
          .then(function () { done++; });
      });
    }, Promise.resolve()).then(function () { return done; });
  }

  /* ------------------------------- الإقلاع ------------------------------- */
  if (!CFG.url || !CFG.key) { fatal('إعداد الاتصال بقاعدة البيانات غير مكتمل.'); return; }
  if (!S || !S.access_token) { fatal('لا توجد جلسة سارية.'); return; }

  status('جارٍ قراءة البيانات…', 'warn');

  var db = {};
  sel('admins', 'select=email,name,role&limit=20').then(function (a) {
    if (!a || !a.length) {
      throw new Error('بريدك غير مُسجَّل في جدول المدراء، فكل قراءة وكتابة مرفوضة. أضِف بريدك إلى public.admins ثم أعد الدخول.');
    }
    db.admins = a;
    return Promise.all([
      sel('settings', 'select=key,value&limit=100'),
      sel('news', 'select=*&order=date.desc&limit=200'),
      sel('submissions', 'select=*&order=created_at.desc&limit=200'),
      sel('media', 'select=*&order=id.desc&limit=200'),
      sel('content_overrides', 'select=*&limit=500'),
      loadTargets()
    ]);
  }).then(function (res) {
    var blob = null;
    (res[0] || []).forEach(function (row) { if (row.key === BLOB) blob = row.value; });
    db.news = res[1] || [];
    db.subs = res[2] || [];
    db.media = res[3] || [];
    (res[4] || []).forEach(function (r) { OVR[ovrKey(r.page, r.path, r.op)] = r; });
    T = res[5];

    window.IAQ_CFG_IN = compose(blob, db);
    /* الدمج يجري داخل load() بعد أن يضمّ التصميم قيمه الافتراضية — قبلها لا
       يكون config.content موجودًا، فتُقارَن نصوص التصميم النموذجية بنصوص
       الصفحة الحقيقية ويُكتب فوقها. */
    window.IAQ_AFTER_LOAD = overlaySite;
    try { lastJson = JSON.stringify(window.IAQ_CFG_IN); } catch (e) { lastJson = ''; }

    if (typeof window.IAQ_PANEL_MAIN !== 'function') { fatal('لم يُحمَّل سكربت اللوحة.'); return; }
    window.IAQ_PANEL_MAIN();

    var nSec = T ? Object.keys(T.sections).length : 0;
    var nOvr = Object.keys(OVR).length;
    status('متصل — ' + db.news.length + ' خبرًا · ' + db.subs.length + ' طلبًا · ' +
           db.media.length + ' وسيطًا · ' + db.admins.length + ' مديرًا' +
           (nSec ? ' | موصول بالموقع: ' + nSec + ' قسمًا و' + T.hero.length + ' شريحة' +
                   (nOvr ? '، ' + nOvr + ' تعديلًا ساريًا' : '')
                 : ' | تعذّر قراءة الصفحة الرئيسة، فتعديل النصوص لن يسري'), 'ok');
  }).catch(function (e) {
    fatal((e && e.message ? e.message : String(e)));
  });
})();
