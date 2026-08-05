/* ============================================================================
   تمهيدُ نموذج التواصل من معامل العنوان.

   صفحةُ البرامج فيها ستُّ بطاقات، وكان في كلٍّ منها رابط «تفاصيل البرنامج»
   إلى href="#" — وعدٌ بصفحةٍ لا وجودَ لها. صارت «اسأل عن هذا البرنامج» إلى
   نموذج التواصل مع اسم البرنامج في العنوان، وهذه الوحدةُ تُنزل الاسمَ في
   الحقول: فيعرف المستقبِلُ عمّاذا يُسأل، ولا يُعيد الزائرُ كتابةَ ما نعرفه.

   ومعاملُ العنوان لا يُدخل الصفحةَ نصًّا: يُقرأ ويُطابَق على قائمةِ سماحٍ من
   عناوين البطاقات الموجودة في الصفحة نفسها، فما لا يُطابق يُهمَل. لا حقنَ
   نصٍّ من العنوان أصلًا.
   ============================================================================ */
(function () {
  'use strict';

  /* أسماءُ البرامج كما هي مبنيّةٌ في صفحة البرامج — قائمةُ السماح.
     يُقرأ الاسمُ من الرابط، وإن لم يكن في القائمة أُهمِل. */
  var ALLOW = ['تأسيس الجمعيات', 'بناء القدرات المؤسسية', 'الحوكمة والامتثال',
               'الاستدامة المالية والأوقاف', 'التحول الرقمي', 'قياس الأثر'];

  function param(name) {
    try {
      var q = String(location.search || '').replace(/^\?/, '');
      if (!q) return '';
      var out = '';
      q.split('&').forEach(function (kv) {
        var i = kv.indexOf('=');
        if (i < 0) return;
        if (decodeURIComponent(kv.slice(0, i)) !== name) return;
        out = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
      });
      return out;
    } catch (e) { return ''; }
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else { fn(); }
  }

  ready(function () {
    var prog = param('program').replace(/\s+/g, ' ').trim();
    if (!prog || ALLOW.indexOf(prog) < 0) return;

    var form = document.querySelector('form.js-form[data-kind="contact"]');
    if (!form) return;

    /* الحقلان منسدلان لا مُدخلَين نصّيَّين: إسنادُ نصٍّ حرٍّ إلى <select> لا
       يفعل شيئًا بصمت. فنختار خيارًا موجودًا بمطابقةِ نصِّه، ولا نخترع خيارًا
       ولا نُدخل قيمةً لا تعرفها القائمة. */
    function pickOption(sel, re) {
      if (!sel || sel.tagName !== 'SELECT') return false;
      if (sel.selectedIndex > 0) return false;            /* اختار المستخدمُ سلفًا */
      for (var i = 0; i < sel.options.length; i++) {
        if (re.test(sel.options[i].textContent || '')) { sel.selectedIndex = i; return true; }
      }
      return false;
    }
    var ct = form.querySelector('#ctype');
    pickOption(ct, /استفسار/);
    var subj = form.querySelector('#subject');
    pickOption(subj, /استفسار عام|استفسار/);

    /* واسمُ البرنامج يُحمَل في نصّ الرسالة: هو الحقلُ الحرُّ الوحيد */
    var msg = form.querySelector('#message');
    if (msg && !String(msg.value || '').trim()) {
      msg.value = 'أرغب في معرفة المزيد عن برنامج «' + prog + '».\n';
    }

    /* والعنوانُ يُنظَّف: معاملٌ في شريط العنوان يُنسخ ويُشارَك بلا داعٍ،
       ويُعيد التمهيدَ إن حُدِّثت الصفحة بعد أن كتب الزائرُ نصَّه. */
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { }

    /* إعلانٌ يُسمَع: من يعتمد على قارئ شاشةٍ لا يرى الحقولَ مُلئت.
       ومنطقةُ الإعلان يجب أن تكون في الصفحة **قبل** أن يتغيّر نصُّها، وإلّا
       أُدرجت مكتوبةً فلم تُقرأ — فنُدرجها فارغةً ثمّ نكتب فيها. */
    var note = document.createElement('p');
    note.className = 'fhint';
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    note.style.marginBlockEnd = '14px';
    var msg = 'هُيّئ النموذجُ لسؤالك عن برنامج «' + prog + '» — عدّل ما تشاء قبل الإرسال.';
    var box = form.querySelector('.form-fields');
    if (box) {
      box.insertBefore(note, box.firstChild);
      setTimeout(function () { note.textContent = msg; }, 120);
    }
    /* التركيزُ على أوّل حقلٍ فارغٍ يحتاجه الزائر: الاسم لا الموضوعَ المُهيَّأ.
       ويُؤخَّر عن كتابة الإعلان كي لا يقطعَ نقلُ التركيزِ قراءتَه. */
    var first = form.querySelector('#name');
    if (first) setTimeout(function () {
      try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
    }, 700);
  });
})();
