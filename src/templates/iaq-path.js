/* ============================================================================
   خوارزمية العنونة المشتركة — تُحقن حرفيًّا في كل صفحة وفي لوحة التحكّم معًا،
   فلا يمكن أن تتباعد النسختان. أي تغيير هنا يسري على الطرفين عند إعادة البناء.

   المسار = سلسلة وسوم من مرساة معلومة إلى العنصر، ومع كل وسم ترتيبه بين
   أشقّائه من النوع نفسه:   #main/SECTION[3]/DIV[1]/H2[1]

   قرارات مقصودة (كل واحد منها أُثبت على الصفحات الـ18 الفعلية):
   • الترتيب بالنوع (nth-of-type) لا بالموضع: إدراج عنصر من نوع جديد لا يُزحزح
     أي مسار قائم، بخلاف nth-child الذي يُبطل كل مسارات الشقيق الواحد.
   • localName لا tagName: وسوم SVG صغيرة الحروف في DOM بخلاف وسوم HTML.
   • مقارنة namespaceURI أيضًا: <a> في HTML و<a> في SVG نوعان مختلفان.
   • [i] تُكتب دائمًا ولو كانت 1، فلا يعتمد التحليل على قاعدة اختصار.
   • المرساة: أقرب سلف له id فريد. هذا يقصّ عمق المسار (المتوسط 7.3 خطوة)
     فلا يُبطل تغييرٌ في أعلى الصفحة مساراتِ ما تحتها.
   ============================================================================ */
var IAQ_PATH = (function () {
  'use strict';

  function tagOf(el) { return (el.localName || (el.nodeName || '').toLowerCase()); }

  function step(el) {
    var ln = el.localName, ns = el.namespaceURI, i = 1, s = el;
    while ((s = s.previousElementSibling)) {
      if (s.localName === ln && s.namespaceURI === ns) i++;
    }
    return tagOf(el) + '[' + i + ']';
  }

  /* id صالح كمرساة؟ يجب أن يكون فريدًا فعلًا في المستند */
  function anchorId(el) {
    var id = el.id;
    if (!id) return null;
    var doc = el.ownerDocument;
    if (!doc.getElementById) return null;
    if (doc.getElementById(id) !== el) return null;          // مكرّر أو ملتبس
    if (/[\s"'\\]/.test(id)) return null;                     // id غريب — لا نعتمد عليه
    return id;
  }

  /* مسار عنصر — يرجع null لما هو خارج <body> أو غير عنصر */
  function pathOf(el) {
    if (!el || el.nodeType !== 1) return null;
    var doc = el.ownerDocument, body = doc && doc.body;
    if (!body || !body.contains(el)) return null;
    if (el === body) return 'BODY';
    var self = anchorId(el);
    if (self) return '#' + self;
    var parts = [], n = el;
    while (n && n !== body) {
      if (n !== el) {
        var a = anchorId(n);
        if (a) return '#' + a + '/' + parts.reverse().join('/');
      }
      parts.push(step(n));
      n = n.parentElement;
      if (!n) return null;
    }
    return 'BODY/' + parts.reverse().join('/');
  }

  /* العنصر من مساره — null إن لم يوجد (بنية تغيّرت) */
  function nodeAt(doc, path) {
    if (!doc || !path) return null;
    var body = doc.body; if (!body) return null;
    var parts = path.split('/'), cur, i = 0;
    if (parts[0] === 'BODY') { cur = body; i = 1; }
    else if (parts[0].charAt(0) === '#') {
      cur = doc.getElementById(parts[0].slice(1));
      if (!cur) return null;
      i = 1;
    } else return null;
    for (; i < parts.length; i++) {
      var m = /^([A-Za-z0-9_:-]+)\[(\d+)\]$/.exec(parts[i]);
      if (!m) return null;
      var tag = m[1], want = +m[2], seen = 0, found = null;
      for (var c = cur.firstElementChild; c; c = c.nextElementSibling) {
        if (tagOf(c) === tag && ++seen === want) { found = c; break; }
      }
      if (!found) return null;
      cur = found;
    }
    return cur;
  }

  /* هل العنصر في الترويسة/التذييل المشتركين؟ تعديله يجب أن يسري على كل الصفحات. */
  function scopeOf(el) {
    if (!el || el.nodeType !== 1) return 'page';
    var n = el;
    while (n && n.nodeType === 1) {
      var t = tagOf(n);
      if (t === 'header' && n.id === 'siteHeader') return 'global';
      if (t === 'footer') return 'global';
      if (n.classList && (n.classList.contains('site-header') || n.classList.contains('site-footer'))) return 'global';
      if (n.classList && n.classList.contains('skip-link')) return 'global';
      n = n.parentElement;
    }
    return 'page';
  }

  /* تطبيع النص قبل البصمة: توحيد يونيكود (NFC) + المسافات، وحذف المحارف الصفرية.
     يمنع إبطال البصمات عند اختلاف صور الحروف العربية أو المسافات فقط. */
  function norm(str) {
    var s = String(str == null ? '' : str);
    if (s.normalize) { try { s = s.normalize('NFC'); } catch (e) { } }
    return s.replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  }

  /* بصمة FNV-1a (32-bit) بالسادس عشري */
  function hash(str) {
    var s = String(str == null ? '' : str), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  /* بصمة المحتوى مع سياقه: الوسم + النص + وسم الأب.
     687 عقدة نصّية في الموقع تتشابه نصوصها، فالسياق يقلّل احتمال التطابق الكاذب
     الذي قد يضع نصًّا في موضع خاطئ بعد تغيّر بنيويّ. */
  function fpOf(el, raw) {
    var text = norm(raw == null ? (el ? el.textContent : '') : raw);
    var tag = el ? tagOf(el) : '';
    var par = (el && el.parentElement) ? tagOf(el.parentElement) : '';
    return hash(tag + '\u0001' + text + '\u0001' + par);
  }

  /* بصمة نصّ مجرّد (للمقارنة السريعة) */
  function fp(str) { return hash(norm(str)); }

  function isLeafText(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.firstElementChild) return false;
    return norm(el.textContent).length > 0;
  }

  /* فهارس عُقد النص المباشرة غير الفارغة — لتحرير نصّ مجاور لعناصر سطرية */
  function textParts(el) {
    var out = [];
    if (!el) return out;
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && norm(n.nodeValue).length) out.push({ i: i, text: n.nodeValue });
    }
    return out;
  }

  return {
    pathOf: pathOf, nodeAt: nodeAt, scopeOf: scopeOf,
    fp: fp, fpOf: fpOf, norm: norm, hash: hash,
    isLeafText: isLeafText, textParts: textParts, tagOf: tagOf
  };
})();
