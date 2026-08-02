/* ============================================================================
   منارة الإحصاء — تسجّل زيارات الصفحات وتعامل الزائر مع الملفّات والأزرار.

   لا كوكيز، ولا تخزين محليّ، ولا معرّف زائر، ولا حفظ عنوان IP. تُرسل خمسة
   حقول فقط: نوع الحدث، والصفحة، والوسم (اسم ملفّ أو زرّ)، ومضيف مصدر
   الزيارة، ونوع الجهاز. فلا بيانات شخصية أصلًا — والثمن أننا نعرف «عدد
   الزيارات» لا «عدد الزوّار الفريدين»، وهذا اختيارٌ مقصود.

   ثلاث حمايات من تضخيم الأرقام:
     • إطار المعاينة في لوحة المدير (?iaq-edit=1) لا يُحسب.
     • الصفحة داخل إطار لا تُحسب — الموقع لا يُدمج في مكانٍ آخر.
     • الروبوتات المعروفة والمتصفّحات الآلية لا تُحسب.

   والإرسال لا يُعطّل شيئًا: يفشل بصمت، ولا ينتظره أحد، و keepalive يُنجيه
   إن غادر الزائر الصفحة في أثنائه.
   ============================================================================ */
(function () {
  'use strict';
  if (typeof IAQ_SUPA === 'undefined') return;
  var CFG = IAQ_SUPA, slug = (typeof IAQ_SLUG === 'string' ? IAQ_SLUG : '');
  if (!CFG || !CFG.url || !CFG.key) return;

  /* --------------------------- هل نُحصي أصلًا؟ --------------------------- */
  function skip() {
    try {
      if (/(?:^|[?&])iaq-edit=1(?:&|$)/.test(location.search)) return true;
      if (window.top !== window.self) return true;
      if (navigator.webdriver) return true;
      var ua = String(navigator.userAgent || '');
      if (/bot|crawl|spider|slurp|bing|yandex|baidu|duckduck|facebookexternal|headless|phantom|lighthouse|pingdom|uptime/i.test(ua)) return true;
      if (!ua) return true;
      return false;
    } catch (e) { return true; }
  }
  if (skip()) return;

  /* ------------------------------ التصنيف ------------------------------ */
  function device() {
    var w = Math.min(screen.width || 0, screen.height || 0) || window.innerWidth || 0;
    var ua = String(navigator.userAgent || '');
    if (/iPad|Tablet/i.test(ua) || (w >= 600 && w <= 900 && /Mobi|Android/i.test(ua))) return 'tablet';
    /* نستعمل العرض إن عُرِف فقط: بعض المتصفّحات تُبلّغ صفرًا (نافذةٌ مُطبَقة،
       أو تحميلٌ مُسبَق)، و«صفر < ٦٠٠» كان يُصنّفها جوالًا فيُضخّم نسبته. */
    if (/Mobi|Android|iPhone|iPod/i.test(ua) || (w && w < 600)) return 'mobile';
    return 'desktop';
  }
  /* مضيف مصدر الزيارة وحده — لا المسار، فلا يُنقل شيءٌ عن الصفحة السابقة */
  function refHost() {
    try {
      var r = document.referrer;
      if (!r) return '';
      var h = new URL(r).hostname.replace(/^www\./, '');
      if (h === location.hostname.replace(/^www\./, '')) return '';   /* تنقّل داخليّ */
      return h.slice(0, 120);
    } catch (e) { return ''; }
  }
  var DEV = device(), REF = refHost();

  /* ------------------------------ الإرسال ------------------------------ */
  var sent = {};
  function send(kind, label, once) {
    var key = kind + '|' + label;
    if (once) {
      if (sent[key]) return;
      sent[key] = 1;
    }
    var row = {
      kind: kind,
      path: String(slug || '').slice(0, 120),
      label: String(label || '').slice(0, 160),
      ref_host: kind === 'page' ? REF : '',
      device: DEV
    };
    try {
      fetch(CFG.url + '/rest/v1/page_views', {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: CFG.key,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(row)
      }).catch(function () { });
    } catch (e) { /* لا شيء: الإحصاء لا يُعطّل الموقع */ }
  }

  /* اسم الملفّ من رابطه — بلا مسارٍ ولا معاملات */
  function fileOf(href) {
    var s = String(href || '').split('#')[0].split('?')[0];
    var n = s.substring(s.lastIndexOf('/') + 1);
    try { n = decodeURIComponent(n); } catch (e) { }
    return n || s;
  }

  /* ------------------------- زيارة الصفحة ------------------------- */
  send('page', '', true);

  /* --------------------- تعامل الزائر: تفويض واحد ---------------------
     مستمعٌ واحد على المستند: يعمل على ما بُني وعلى ما يُبنى من القاعدة
     بعد التحميل (الأخبار والوثائق والشرائح تُعاد بناؤها كلها). */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var a = t.closest('a[href]');
    if (a) {
      if (a.classList.contains('file-dl')) { send('file_dl', fileOf(a.getAttribute('href'))); return; }
      if (a.classList.contains('file-view')) { send('file_view', fileOf(a.getAttribute('href'))); return; }
      if (a.classList.contains('lc-btn')) { send('file_view', fileOf(a.getAttribute('href'))); return; }
      var soc = a.getAttribute('data-soc');
      if (soc) { send('contact', soc); return; }
      var href = a.getAttribute('href') || '';
      if (/^tel:/i.test(href)) { send('contact', 'phone'); return; }
      if (/^mailto:/i.test(href)) { send('contact', 'email'); return; }
      if (/iaq\.sa/i.test(href)) { send('cta', 'donate'); return; }
      if (a.closest('.hero-cta')) {
        send('cta', (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) || href);
        return;
      }
      if (a.classList.contains('nw-btn')) {
        send('cta', 'خبر: ' + (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50));
        return;
      }
      return;
    }
    /* تكبير صورة خبر أو شهادة */
    var z = t.closest('[data-zoom]');
    if (z) send('cta', 'تكبير صورة');
  }, true);

  /* ------------------- إرسال نموذج: بعد النجاح وحده -------------------
     نستمع لظهور رسالة النجاح لا لضغط الزرّ: فلا يُحسب طلبٌ لم يُرسل.

     هذه المنارة تُنفَّذ في <head> — فالجسم لم يُبنَ بعد. الاستماع المفوَّض
     على document يعمل حينها، أمّا البحث عن عناصر بعينها فلا يجد شيئًا،
     فنُؤخّره إلى جهوز المستند. */
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else { fn(); }
  }
  ready(function () {
    [].slice.call(document.querySelectorAll('.js-form')).forEach(function (form) {
      var kind = form.getAttribute('data-kind') || form.getAttribute('data-survey') || 'form';
      var ok = form.querySelector('.form-success');
      if (!ok || typeof MutationObserver !== 'function') return;
      var mo = new MutationObserver(function () {
        if (ok.style.display && ok.style.display !== 'none') {
          send('form', kind, true);
          mo.disconnect();
        }
      });
      mo.observe(ok, { attributes: true, attributeFilter: ['style'] });
    });

    /* اشتراك النشرة زرٌّ لا نموذج */
    var nb = document.getElementById('newsletterBtn');
    if (nb) nb.addEventListener('click', function () { send('form', 'newsletter'); });
  });
})();
