/* ============================================================================
   قوائم المحتوى الحيّة — تُبنى من قاعدة البيانات فوق البناء الثابت.

   المبدأ: البناء الثابت هو الأساس دائمًا. إن وُجدت صفوف منشورة في القاعدة
   أُعيد بناء القائمة منها؛ وإن لم توجد صفوف أو سقطت الشبكة بقي المبنيّ كما هو.
   فالموقع لا يعتمد على قاعدة البيانات ليعمل، بل تستخدمها ليُحدَّث.

   الطريقة: استنساخ بطاقة قائمة أصلًا في الصفحة ثم تعبئتها (clone-and-fill)،
   لا توليد HTML جديد. بهذا تُحفظ كل الأصناف والأيقونات وحالات الحركة
   (مثل .is-in التي بدونها تبقى البطاقة شفّافة) ولا يمكن أن يتباعد الشكل
   عن قوالب البنّاء.
   ============================================================================ */
(function () {
  'use strict';
  if (typeof IAQ_SUPA === 'undefined') return;
  var CFG = IAQ_SUPA, slug = IAQ_SLUG;
  var IAQ = window.IAQ = window.IAQ || {};

  function get(q) {
    if (!CFG || !CFG.url || !CFG.key) return Promise.resolve(null);
    return fetch(CFG.url + '/rest/v1/' + q, { headers: { apikey: CFG.key, Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /* الحرف الأول للأفاتار — نفس قاعدة البنّاء: تُتجاهل «ال» التعريف */
  function initialOf(name) {
    var w = String(name || '').trim().split(/\s+/)[0] || '';
    if (w.length > 2 && w.indexOf('ال') === 0) w = w.slice(2);
    return w.slice(0, 1);
  }
  function txtNodeSet(el, text) {
    /* يضبط النصّ مع الحفاظ على العناصر الداخلية (مثل معيّن <i class="dm">) */
    for (var i = el.childNodes.length - 1; i >= 0; i--) {
      if (el.childNodes[i].nodeType === 3) el.removeChild(el.childNodes[i]);
    }
    el.appendChild(document.createTextNode(text));
  }

  /* ------------------------- تعبئة بطاقة شخص ------------------------- */
  function fillPerson(node, row, kind, ctx) {
    var nameSel = { assembly: '.gm-name', board: '.bd-name', team: '.tm-name' }[kind];
    var roleSel = { board: '.bd-role', team: '.tm-role' }[kind];
    var nm = node.querySelector(nameSel);
    if (nm) {
      var span = nm.querySelector('span');
      var cls = span ? span.className : (kind === 'assembly' ? 'gm-title' : (kind === 'board' ? 'bd-t' : 'tm-t'));
      nm.innerHTML = (row.title ? '<span class="' + esc(cls) + '">' + esc(row.title) + '</span> ' : '') + esc(row.name);
    }
    if (roleSel) {
      var rl = node.querySelector(roleSel);
      if (rl) txtNodeSet(rl, row.role || '');
    }
    if (kind === 'assembly') {
      var av = node.querySelector('.gm-av b');
      if (av) av.textContent = initialOf(row.name);
      var chip = node.querySelector('.gm-chip');
      if (chip) txtNodeSet(chip, ' ' + (ctx.catLabels[row.cat] || row.cat || ''));
      node.setAttribute('data-cat', row.cat || '');
      node.setAttribute('data-name', row.name || '');
    } else {
      node.setAttribute('data-rank', row.rank || 'member');
      var ph = node.querySelector(kind === 'board' ? '.bd-ph' : '.tm-ph');
      if (ph) {
        var img = ph.querySelector('img');
        if (row.photo) {
          if (!img) {
            if (ctx.photoHTML) ph.innerHTML = ctx.photoHTML; else return node;
            img = ph.querySelector('img');
          }
          if (img) {
            img.setAttribute('src', 'img/' + kind + '/' + row.photo);
            img.setAttribute('alt', ((row.title || '') + ' ' + row.name).trim());
          }
        } else if (ctx.symbolHTML) {
          ph.innerHTML = ctx.symbolHTML;
        } else if (img) {
          img.parentNode.removeChild(img);
        }
      }
    }
    return node;
  }

  /* يستبدل بطاقات حاوية بصفوف القاعدة، مع الإبقاء على بقية أبناء الحاوية
     (مثل رسالة «لا نتائج») كي لا تُفقد إشاراتُ سكربت القسم إليها. */
  function swapCards(container, cardSel, rows, kind, ctx) {
    var olds = [].slice.call(container.querySelectorAll(cardSel));
    if (!olds.length || !rows.length) return 0;
    var withImg = null, withSym = null;
    olds.forEach(function (c) {
      if (!withImg && c.querySelector('img')) withImg = c;
      if (!withSym && (c.querySelector('.bd-sym') || c.querySelector('.tm-sym'))) withSym = c;
    });
    var phSel = kind === 'board' ? '.bd-ph' : '.tm-ph';
    ctx.photoHTML = withImg ? (withImg.querySelector(phSel) || {}).innerHTML : null;
    ctx.symbolHTML = withSym ? (withSym.querySelector(phSel) || {}).innerHTML : null;

    var anchor = olds[olds.length - 1].nextSibling;
    var parent = olds[0].parentNode;
    var frag = document.createDocumentFragment();
    rows.forEach(function (row) {
      var base = (kind !== 'assembly' && row.photo && withImg) ? withImg
               : (kind !== 'assembly' && !row.photo && withSym) ? withSym : olds[0];
      var n = base.cloneNode(true);
      n.removeAttribute('style');
      fillPerson(n, row, kind, ctx);
      frag.appendChild(n);
    });
    olds.forEach(function (c) { c.parentNode.removeChild(c); });
    parent.insertBefore(frag, anchor);
    return rows.length;
  }

  /* ------------------------------ الأشخاص ------------------------------ */
  function people(kind) {
    var secId = { assembly: 'memSec', board: 'boardSec', team: 'teamSec' }[kind];
    var sec = document.getElementById(secId);
    if (!sec) return;
    return get('people?select=title,name,role,rank,cat,phone,email,photo,sort'
      + '&grp=eq.' + kind + '&status=eq.published&order=sort.asc,id.asc').then(function (rows) {
        if (!rows || !rows.length) return;
        var ctx = { catLabels: {} };
        // خذ تسميات التصنيف من البطاقات المبنيّة كي تبقى الصياغة واحدة
        [].slice.call(sec.querySelectorAll('.gm-card')).forEach(function (c) {
          var k = c.getAttribute('data-cat'), chip = c.querySelector('.gm-chip');
          if (k && chip && !ctx.catLabels[k]) ctx.catLabels[k] = chip.textContent.trim();
        });
        var n = 0;
        if (kind === 'board') {
          var lead = rows.filter(function (r) { return r.rank === 'chair' || r.rank === 'vice'; });
          var rest = rows.filter(function (r) { return r.rank !== 'chair' && r.rank !== 'vice'; });
          var lc = sec.querySelector('.bd-lead'), gc = sec.querySelector('.bd-grid');
          if (lc && lead.length) n += swapCards(lc, '.bd-card', lead, 'board', ctx);
          if (gc && rest.length) n += swapCards(gc, '.bd-card', rest, 'board', ctx);
        } else if (kind === 'team') {
          var tg = sec.querySelector('.tm-grid');
          if (tg) n += swapCards(tg, '.tm-card', rows, 'team', ctx);
        } else {
          var gg = sec.querySelector('.gm-grid') || document.getElementById('gm-grid');
          if (gg) n += swapCards(gg, '.gm-card', rows, 'assembly', ctx);
        }
        if (n && window.IAQ_REINDEX && window.IAQ_REINDEX[kind]) {
          try { window.IAQ_REINDEX[kind](); } catch (e) { }
        }
        if (n) document.dispatchEvent(new CustomEvent('iaq:lists', { detail: { kind: kind, count: n } }));
      });
  }

  /* ------------------------------ الشركاء ------------------------------ */
  function logoSrc(logo) {
    var s = String(logo || '');
    if (/^(https?:)?\/\//.test(s) || s.charAt(0) === '/') return s;
    return 'img/partners/' + s;
  }
  function partners() {
    var track = document.getElementById('partnersTrack');
    if (!track) return;
    return get('partners?select=name,logo,url,sort&status=eq.published&order=sort.asc,id.asc')
      .then(function (rows) {
        if (!rows || !rows.length) return;
        var sets = parseInt(getComputedStyle(track).getPropertyValue('--mq-sets'), 10);
        if (!isFinite(sets) || sets < 1 || sets > 8) sets = 4;
        var html = '';
        for (var s = 0; s < sets; s++) {
          html += '<div class="mq-set"' + (s ? ' aria-hidden="true"' : '') + '>';
          for (var i = 0; i < rows.length; i++) {
            var p = rows[i], src = esc(logoSrc(p.logo)), nm = esc(p.name);
            var inner = '<img src="' + src + '" alt="' + (s ? '' : nm) + '" loading="lazy" decoding="async" />';
            if (p.url && !s) {
              html += '<a class="plogo" href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' + nm + '">' + inner + '</a>';
            } else {
              html += '<div class="plogo"' + (s ? ' aria-hidden="true"' : ' title="' + nm + '"') + '>' + inner + '</div>';
            }
          }
          html += '</div>';
        }
        track.innerHTML = html;
        document.dispatchEvent(new CustomEvent('iaq:lists', { detail: { kind: 'partners', count: rows.length } }));
      });
  }

  /* ------------------------------ التشغيل ------------------------------ */
  var JOBS = { assembly: function () { return people('assembly'); },
               board:    function () { return people('board'); },
               team:     function () { return people('team'); },
               index:    partners };

  function run() {
    var job = JOBS[slug];
    if (!job) return;
    try { job(); } catch (e) { /* البناء الثابت يبقى كما هو */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  IAQ.reloadLists = run;
})();
