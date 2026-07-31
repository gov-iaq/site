/* ============================================================================
   طبقة التشغيل العلنية — تقرأ إعدادات المدير وتعديلاته من Supabase وتطبّقها.

   • تُنفَّذ في <head> فتكون IAQ.setting() جاهزة قبل أي سكربت آخر في الصفحة.
   • القراءة الأولى من الذاكرة المحلية (فورية بلا انتظار الشبكة)، ثم تحديث
     هادئ من الخدمة مع مهلة صلاحية.
   • أمان المحتوى: لا يُطبَّق تعديل إلا إذا طابقت بصمة الأصل، فلا يظهر نصّ في
     موضع خاطئ إذا تغيّرت بنية الصفحة. وكل ما يُقرأ محميّ بسياسات RLS.
   • إعادة التطبيق: سكربتات الصفحة تكتب على textContent في مواضع كثيرة، فنُعيد
     التثبيت بعد التحميل وبعد مهلتين قصيرتين حتى لا يُمحى تعديل المدير بهدوء.
   • وضع التحرير (?iaq-edit=1): لا يُطبَّق شيء تلقائيًّا، وتُكشف واجهة للوحة
     كي تقرأ النصوص الأصلية وتعاين تعديلاتها.
   ============================================================================ */
(function () {
  'use strict';

  var CFG  = IAQ_SUPA;                                 // {url, key} — يُحقنان عند البناء
  var slug = IAQ_SLUG;                                 // معرّف الصفحة — يُحقن عند البناء
  var TTL  = 300000;                                   // 5 دقائق
  var LSK  = 'iaq_rt_v1';
  var EDIT = /(?:^|[?&])iaq-edit=1(?:&|$)/.test(location.search);

  var store = { settings: {}, overrides: [], at: 0 };
  try {
    var raw = localStorage.getItem(LSK);
    if (raw) { var p = JSON.parse(raw); if (p && p.settings) store = p; }
  } catch (e) { /* تخزين محليّ معطَّل — نكمل بالافتراضيات */ }

  var IAQ = window.IAQ = window.IAQ || {};
  IAQ.setting  = function (k, d) { var v = store.settings ? store.settings[k] : undefined; return (v === undefined || v === null) ? d : v; };
  IAQ.settings = function () { return store.settings || {}; };
  IAQ.path     = IAQ_PATH;
  IAQ.editing  = EDIT;

  /* ------------------------- تطبيق تعديل واحد ------------------------- */
  function stamp(o) { return o.op + ':' + (o.attr || o.part || ''); }

  function basisFp(o, el) {
    if (o.op === 'attr') return IAQ_PATH.fpOf(el, el.getAttribute(o.attr || '') || '');
    if (o.op === 'icon' || o.op === 'html') return IAQ_PATH.fpOf(el, el.innerHTML);
    if (o.op === 'tnode') {
      var n = el.childNodes[o.part];
      if (!n || n.nodeType !== 3) return null;
      return IAQ_PATH.fpOf(el, n.nodeValue);
    }
    return IAQ_PATH.fpOf(el);
  }

  function put(o, el) {
    switch (o.op) {
      case 'text':
        if (el.firstElementChild) return 'unsafe';       // فيه عناصر أبناء — يُحرَّر بالورقة لا بالكل
        if (el.textContent !== o.value) el.textContent = o.value == null ? '' : o.value;
        return 'ok';
      case 'tnode':
        var n = el.childNodes[o.part];
        if (!n || n.nodeType !== 3) return 'drift';
        if (n.nodeValue !== o.value) n.nodeValue = o.value == null ? '' : o.value;
        return 'ok';
      case 'attr':
        if (!o.attr) return 'bad';
        if (o.value == null || o.value === '') { if (el.hasAttribute(o.attr)) el.removeAttribute(o.attr); }
        else if (el.getAttribute(o.attr) !== o.value) el.setAttribute(o.attr, o.value);
        return 'ok';
      case 'icon':
        if (IAQ_PATH.tagOf(el) !== 'svg') return 'bad';
        if (el.innerHTML !== o.value) el.innerHTML = o.value || '';
        return 'ok';
      case 'html':
        if (el.innerHTML !== o.value) el.innerHTML = o.value || '';
        return 'ok';
      case 'hide':
        el.setAttribute('hidden', '');
        el.style.setProperty('display', 'none', 'important');
        el.setAttribute('aria-hidden', 'true');
        return 'ok';
      case 'delete':
        if (el.parentNode) el.parentNode.removeChild(el);
        return 'ok';
      default: return 'bad';
    }
  }

  function applyOne(o, doc) {
    var el = IAQ_PATH.nodeAt(doc || document, o.path);
    if (!el) return 'missing';
    var done = el.getAttribute('data-iaq-done') === stamp(o);
    // البصمة تُفحص عند أول تطبيق فقط: بعده صار المحتوى هو الجديد بطبيعته،
    // وإعادة الفحص ستُسقط التعديل وتُعيد النص القديم لو كتبت عليه سكربتات الصفحة.
    if (!done && o.orig_fp) {
      var got = basisFp(o, el);
      if (got === null) return 'drift';
      if (got !== o.orig_fp) return 'drift';
    }
    var r = put(o, el);
    if (r === 'ok' && o.op !== 'delete') el.setAttribute('data-iaq-done', stamp(o));
    return r;
  }

  /* الحذف آخرًا: إزالة عنصر تُزحزح ترتيب أشقّائه من نوعه، فتُبطل مسارات لم تُطبَّق بعد */
  function ordered(list) {
    return list.slice().sort(function (a, b) {
      return (a.op === 'delete' ? 1 : 0) - (b.op === 'delete' ? 1 : 0);
    });
  }

  function applyAll(list, doc) {
    var stats = { ok: 0, drift: 0, missing: 0, other: 0 };
    ordered(list || []).forEach(function (o) {
      var r = applyOne(o, doc);
      if (r === 'ok') stats.ok++;
      else if (r === 'drift') stats.drift++;
      else if (r === 'missing') stats.missing++;
      else stats.other++;
    });
    return stats;
  }

  function applyStored() {
    if (EDIT) return;
    IAQ.lastApply = applyAll(store.overrides);
    document.dispatchEvent(new CustomEvent('iaq:content', { detail: IAQ.lastApply }));
  }

  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  whenReady(function () {
    applyStored();
    // إعادة تثبيت: سكربتات الصفحة قد تكتب على النصوص بعدنا
    window.addEventListener('load', applyStored, { once: true });
    setTimeout(applyStored, 1200);
    setTimeout(applyStored, 3200);
  });

  /* --------------------------- جلب وتحديث --------------------------- */
  function fresh() { return store.at && (Date.now() - store.at) < TTL; }

  function get(pathQ) {
    return fetch(CFG.url + '/rest/v1/' + pathQ, { headers: { apikey: CFG.key, Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function refresh() {
    if (!CFG || !CFG.url || !CFG.key) return Promise.resolve();
    var q = encodeURIComponent(slug || '__none__');
    return Promise.all([
      get('settings?select=key,value&is_public=is.true'),
      get('content_overrides?select=page,path,op,attr,part,value,orig_fp&status=eq.published'
        + '&or=(page.eq.' + q + ',page.eq.*)')
    ]).then(function (res) {
      if (res[0] === null && res[1] === null) return;      // الشبكة ساقطة — نُبقي المخزَّن
      var s = {};
      (res[0] || []).forEach(function (row) { s[row.key] = row.value; });
      var ovr = res[1] || [];
      var setChanged = JSON.stringify(s) !== JSON.stringify(store.settings || {});
      var ovrChanged = JSON.stringify(ovr) !== JSON.stringify(store.overrides || []);
      store = { settings: s, overrides: ovr, at: Date.now() };
      try { localStorage.setItem(LSK, JSON.stringify(store)); } catch (e) { }
      if (setChanged) document.dispatchEvent(new CustomEvent('iaq:settings', { detail: s }));
      if (ovrChanged) whenReady(applyStored);
    });
  }

  IAQ.refresh = function () { store.at = 0; return refresh(); };
  if (!fresh()) refresh(); else setTimeout(refresh, 1500);

  /* ------------------------- إرسال نماذج الزوّار -------------------------
     سياسات RLS تسمح للزائر بالإدراج فقط في submissions و survey_responses،
     ولا تسمح له بقراءة أي منهما. الفشل يُعاد كخطأ كي لا تُعرض رسالة نجاح كاذبة. */
  IAQ.post = function (table, row) {
    if (!CFG || !CFG.url || !CFG.key) return Promise.reject(new Error('الخدمة غير مهيّأة'));
    return fetch(CFG.url + '/rest/v1/' + table, {
      method: 'POST',
      headers: { apikey: CFG.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (b) {
        var m = '';
        try { var j = JSON.parse(b); m = j.message || j.hint || ''; } catch (e) { }
        throw new Error(m || ('تعذّر الإرسال (' + r.status + ')'));
      });
      return true;
    });
  };

  /* ------------------- واجهة وضع التحرير للوحة التحكّم ------------------- */
  if (EDIT) {
    IAQ.edit = {
      slug: slug,
      apply: function (list) { return applyAll(list); },
      applyOne: function (o) { return applyOne(o); },
      reset: function () { location.reload(); },
      ready: true
    };
    document.documentElement.setAttribute('data-iaq-edit', '1');
  }
})();
