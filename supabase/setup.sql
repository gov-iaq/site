-- ============================================================================
--  جمعية حاضنة الجمعيات — التهيئة الكاملة لقاعدة البيانات
--
--  ملفٌّ واحد يُغني عن تشغيل الملفات السبعة بالترتيب. آمنٌ للتشغيل أكثر من
--  مرة: كل جدولٍ ينشأ إن لم يوجد، وكل سياسةٍ تُسقَط قبل إنشائها، والبذور
--  لا تتكرّر.
--
--  شغّله في:  Supabase → SQL Editor → New query → لصق → Run
--
--  ⚠ إن ظهر خطأ «relation ... does not exist» فمعناه أن ملفًّا سابقًا لم
--    يُشغَّل. وهذا الملف يحلّ ذلك لأنه يُشغّلها كلها بترتيبها الصحيح.
--
--  يُولَّد آليًّا من ملفات schema*.sql — لا يُحرَّر يدويًّا.
-- ============================================================================


-- ==========================================================================
--  [schema.sql]  الأساس: المدراء والأخبار والوثائق والطلبات والاستبيان
-- ==========================================================================

-- ============================================================================
--  جمعية حاضنة الجمعيات — مخطّط قاعدة البيانات
--  شغّل هذا الملف مرة واحدة في:  Supabase → SQL Editor → New query → Run
--  آمن للتشغيل أكثر من مرة (idempotent).
-- ============================================================================

-- ─────────────────────────── 1) جدول المدراء ───────────────────────────
--  من يوجد بريده هنا يُعتبر مديرًا. تُضاف الصفوف يدويًا من لوحة Supabase.
create table if not exists public.admins (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text,
  role        text not null default 'admin'
                check (role in ('admin','editor','viewer')),
  created_at  timestamptz not null default now()
);

alter table public.admins enable row level security;

-- دالة مساعدة: هل المستخدم الحالي مدير؟
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));

-- ─────────────────────────── 2) الأخبار ───────────────────────────
create table if not exists public.news (
  id          bigserial primary key,
  date        date not null default current_date,
  tag         text not null default 'أخبار',
  title       text not null,
  lead        text,
  body        text[] not null default '{}',
  facts       jsonb  not null default '[]'::jsonb,
  cta_label   text,
  cta_url     text,
  image       text,
  status      text not null default 'draft'
                check (status in ('draft','published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists news_date_idx   on public.news (date desc);
create index if not exists news_status_idx on public.news (status);

alter table public.news enable row level security;

-- الجميع يقرأ المنشور فقط
drop policy if exists "news public read published" on public.news;
create policy "news public read published" on public.news
  for select to anon, authenticated
  using (status = 'published');

-- المدراء: قراءة كل شيء + إضافة/تعديل/حذف
drop policy if exists "news admin read all" on public.news;
create policy "news admin read all" on public.news
  for select to authenticated using (public.is_admin());

drop policy if exists "news admin insert" on public.news;
create policy "news admin insert" on public.news
  for insert to authenticated with check (public.is_admin());

drop policy if exists "news admin update" on public.news;
create policy "news admin update" on public.news
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "news admin delete" on public.news;
create policy "news admin delete" on public.news
  for delete to authenticated using (public.is_admin());

-- ─────────────────────────── 3) الوثائق ───────────────────────────
create table if not exists public.documents (
  id          bigserial primary key,
  category    text not null
                check (category in ('policies','minutes','financials','annual','licenses','surveys')),
  title       text not null,
  storage_path text not null,      -- المسار داخل Supabase Storage
  dl_name     text,               -- اسم التحميل العربي
  doc_date    text,
  size_label  text,
  pages       int,
  status      text not null default 'published'
                check (status in ('draft','published')),
  created_at  timestamptz not null default now()
);

alter table public.documents enable row level security;

drop policy if exists "docs public read" on public.documents;
create policy "docs public read" on public.documents
  for select to anon, authenticated using (status = 'published');

drop policy if exists "docs admin all" on public.documents;
create policy "docs admin all" on public.documents
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ─────────────────────── 4) طلبات النماذج العامة ───────────────────────
create table if not exists public.submissions (
  id          bigserial primary key,
  kind        text not null
                check (kind in ('contact','volunteer','membership','jobs')),
  payload     jsonb not null,
  status      text not null default 'new'
                check (status in ('new','in_progress','closed','archived')),
  priority    text not null default 'normal'
                check (priority in ('low','normal','high')),
  created_at  timestamptz not null default now()
);

create index if not exists subs_status_idx on public.submissions (status, created_at desc);

alter table public.submissions enable row level security;

-- الزائر يُرسل فقط — ولا يقرأ شيئًا
drop policy if exists "subs public insert" on public.submissions;
create policy "subs public insert" on public.submissions
  for insert to anon, authenticated with check (true);

drop policy if exists "subs admin read" on public.submissions;
create policy "subs admin read" on public.submissions
  for select to authenticated using (public.is_admin());

drop policy if exists "subs admin update" on public.submissions;
create policy "subs admin update" on public.submissions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ─────────────────── 5) استبيانات الرضا (مجهولة تمامًا) ───────────────────
create table if not exists public.survey_responses (
  id           bigserial primary key,
  survey_type  text not null
                 check (survey_type in ('visitors','beneficiaries','donors')),
  ratings      jsonb not null default '{}'::jsonb,
  program      text,          -- اسم البرنامج/الخدمة (لاستبيان المستفيدين)
  comment      text,
  created_at   timestamptz not null default now()
);

alter table public.survey_responses enable row level security;

-- إدراج عام مجهول — بلا أي معرّف شخصي ولا IP
drop policy if exists "survey public insert" on public.survey_responses;
create policy "survey public insert" on public.survey_responses
  for insert to anon, authenticated with check (true);

drop policy if exists "survey admin read" on public.survey_responses;
create policy "survey admin read" on public.survey_responses
  for select to authenticated using (public.is_admin());

-- ─────────────────────────── 6) سجل التدقيق ───────────────────────────
create table if not exists public.audit_log (
  id          bigserial primary key,
  actor_email text,
  action      text not null,
  entity      text,
  entity_id   text,
  created_at  timestamptz not null default now()
);

alter table public.audit_log enable row level security;

drop policy if exists "audit admin read" on public.audit_log;
create policy "audit admin read" on public.audit_log
  for select to authenticated using (public.is_admin());

drop policy if exists "audit admin insert" on public.audit_log;
create policy "audit admin insert" on public.audit_log
  for insert to authenticated with check (public.is_admin());

-- ─────────────────────── 7) تحديث updated_at تلقائيًا ───────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists news_touch on public.news;
create trigger news_touch before update on public.news
  for each row execute function public.touch_updated_at();

-- ============================================================================
--  الخطوة الأخيرة (مهمّة): أضف بريدك كمدير
--  استبدل البريد ببريدك ثم شغّل السطر:
--
--  insert into public.admins (email, name, role)
--  values ('البريد@iaq.org.sa', 'مدير النظام', 'admin')
--  on conflict (email) do nothing;
-- ============================================================================

-- ==========================================================================
--  [schema-v2.sql]  الإعدادات وتجاوزات المحتوى والوسائط والتخزين
-- ==========================================================================

-- ============================================================================
--  جمعية حاضنة الجمعيات — الإضافة الثانية للمخطّط
--  لوحة تحكّم شاملة: تعديل/إخفاء/حذف أي نصّ وأيقونة + إعدادات + مستودع ملفات
--
--  شغّله مرّة واحدة في:  Supabase → SQL Editor → New query → Run
--  آمن للتشغيل أكثر من مرة (idempotent). يفترض أن schema.sql شُغّل قبله.
-- ============================================================================

-- ─────────────────────── 1) إعدادات الموقع العامة ───────────────────────
--  كل صفّ إعداد واحد. is_public = يقرؤه الزائر (طبقة التشغيل في الصفحات).
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null default 'null'::jsonb,
  label       text,                      -- وصف عربي يظهر في اللوحة
  is_public   boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.settings enable row level security;

drop policy if exists "settings public read" on public.settings;
create policy "settings public read" on public.settings
  for select to anon, authenticated using (is_public = true);

drop policy if exists "settings admin read" on public.settings;
create policy "settings admin read" on public.settings
  for select to authenticated using (public.is_admin());

drop policy if exists "settings admin write" on public.settings;
create policy "settings admin write" on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ───────────────── 2) تعديلات المحتوى (نصّ/أيقونة/إخفاء/حذف) ─────────────────
--  page  = معرّف الصفحة، أو '*' للترويسة والتذييل المشتركين (يسري على كل الصفحات)
--  path  = مسار العنصر البنيوي، تحسبه خوارزمية العنونة المشتركة
--  op    = نوع التعديل
--  part  = فهرس عقدة النص المباشرة (للنمط tnode فقط)
--  attr  = اسم الخاصية (للنمط attr فقط)
--  orig_fp = بصمة المحتوى الأصلي؛ إن لم تطابق فلا يُطبَّق التعديل إطلاقًا
create table if not exists public.content_overrides (
  id          bigserial primary key,
  page        text not null default '*',
  path        text not null,
  op          text not null
                check (op in ('text','tnode','attr','icon','html','hide','delete')),
  attr        text not null default '',   -- '' = لا خاصية (كي يعمل الفهرس الفريد)
  part        int  not null default -1,   -- -1 = لا جزء نصّي
  value       text,
  orig_fp     text,
  orig_text   text,                      -- النص الأصلي للعرض في اللوحة (استرجاع)
  label       text,                      -- وصف مقروء: «عنوان قسم من نحن»
  status      text not null default 'published'
                check (status in ('draft','published')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- مفتاح فريد يسمح بـ upsert على (الصفحة، المسار، النوع، الخاصية/الجزء)
-- أعمدة حقيقية لا تعبيرات: PostgREST يحتاج on_conflict=page,path,op,attr,part
create unique index if not exists content_overrides_key_idx
  on public.content_overrides (page, path, op, attr, part);
create index if not exists content_overrides_page_idx
  on public.content_overrides (page, status);

alter table public.content_overrides enable row level security;

drop policy if exists "overrides public read" on public.content_overrides;
create policy "overrides public read" on public.content_overrides
  for select to anon, authenticated using (status = 'published');

drop policy if exists "overrides admin read" on public.content_overrides;
create policy "overrides admin read" on public.content_overrides
  for select to authenticated using (public.is_admin());

drop policy if exists "overrides admin write" on public.content_overrides;
create policy "overrides admin write" on public.content_overrides
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ───────────────────────── 3) مكتبة الوسائط ─────────────────────────
create table if not exists public.media (
  id          bigserial primary key,
  bucket      text not null default 'iaq-media',
  storage_path text not null,
  kind        text not null default 'image' check (kind in ('image','doc','other')),
  title       text,
  alt         text,
  bytes       bigint,
  created_at  timestamptz not null default now(),
  created_by  text
);
create unique index if not exists media_path_idx on public.media (bucket, storage_path);

alter table public.media enable row level security;

drop policy if exists "media public read" on public.media;
create policy "media public read" on public.media
  for select to anon, authenticated using (true);

drop policy if exists "media admin write" on public.media;
create policy "media admin write" on public.media
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ──────── 3-ب) نوع «نشرة» لطلبات الاشتراك من تذييل الموقع ────────
alter table public.submissions drop constraint if exists submissions_kind_check;
alter table public.submissions add constraint submissions_kind_check
  check (kind in ('contact','volunteer','membership','jobs','newsletter'));

-- ──────────────── 4) سدّ فجوات السياسات في المخطّط الأول ────────────────
--  بلا سياسة DELETE يفشل الحذف بصمت (صفر صفوف، بلا خطأ) — وهذا أسوأ خطأ ممكن.
drop policy if exists "subs admin delete" on public.submissions;
create policy "subs admin delete" on public.submissions
  for delete to authenticated using (public.is_admin());

drop policy if exists "survey admin delete" on public.survey_responses;
create policy "survey admin delete" on public.survey_responses
  for delete to authenticated using (public.is_admin());

drop policy if exists "audit admin delete" on public.audit_log;
create policy "audit admin delete" on public.audit_log
  for delete to authenticated using (public.is_admin());

--  فهرس فريد على مسار المستند كي يعمل upsert عليه
create unique index if not exists documents_path_idx
  on public.documents (storage_path);

--  تحديث updated_at تلقائيًّا للجدولين الجديدين
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

drop trigger if exists overrides_touch on public.content_overrides;
create trigger overrides_touch before update on public.content_overrides
  for each row execute function public.touch_updated_at();

-- ───────────────────── 5) مستودع الملفات (Storage) ─────────────────────
--  دلاء علنية القراءة: الوثائق والصور تُعرض للزوّار مباشرة.
insert into storage.buckets (id, name, public)
  values ('iaq-files', 'iaq-files', true)
  on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public)
  values ('iaq-media', 'iaq-media', true)
  on conflict (id) do update set public = true;

--  صلاحيات Storage مستقلّة تمامًا عن صلاحيات الجداول — بدونها يفشل الرفع
--  رغم أن public.is_admin() ترجع true.
drop policy if exists "iaq buckets public read" on storage.objects;
create policy "iaq buckets public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('iaq-files','iaq-media'));

drop policy if exists "iaq buckets admin insert" on storage.objects;
create policy "iaq buckets admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('iaq-files','iaq-media') and public.is_admin());

drop policy if exists "iaq buckets admin update" on storage.objects;
create policy "iaq buckets admin update" on storage.objects
  for update to authenticated
  using (bucket_id in ('iaq-files','iaq-media') and public.is_admin())
  with check (bucket_id in ('iaq-files','iaq-media') and public.is_admin());

drop policy if exists "iaq buckets admin delete" on storage.objects;
create policy "iaq buckets admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('iaq-files','iaq-media') and public.is_admin());

-- ───────────────────────── 6) القيم الابتدائية ─────────────────────────
insert into public.settings (key, value, label, is_public) values
  ('partners_strip_mode', '"auto"'::jsonb,
   'نمط حركة شريط الشركاء: auto متصل | manual يدوي | fade تلاشي', true),
  ('partners_strip_speed', '34'::jsonb,
   'مدّة دورة الشريط المتصل بالثواني (أكبر = أبطأ)', true),
  ('site_announcement', 'null'::jsonb,
   'شريط تنبيه أعلى الموقع — اتركه فارغًا لإخفائه', true)
on conflict (key) do nothing;

-- ============================================================================
--  تحقّق سريع بعد التشغيل — يجب أن يعيد الصفوف الثلاثة:
--    select key, value from public.settings order by key;
--  وأن يعيد true لحسابك:
--    select public.is_admin();
-- ============================================================================

-- ==========================================================================
--  [schema-v3.sql]  الأشخاص والشركاء
-- ==========================================================================

-- ============================================================================
--  جمعية حاضنة الجمعيات — الإضافة الثالثة للمخطّط
--  جداول قوائم المحتوى: الأعضاء والشركاء، كي تُدار من اللوحة إضافةً وتعديلًا وحذفًا
--
--  شغّله في:  Supabase → SQL Editor → New query → Run
--  آمن للتشغيل أكثر من مرة. يفترض تشغيل schema.sql ثم schema-v2.sql قبله.
--  بعده شغّل seed-content.sql لتحميل محتوى الموقع الحالي إلى القاعدة.
-- ============================================================================

-- ───────────────── 1) الأشخاص: الجمعية العمومية والمجلس والفريق ─────────────────
create table if not exists public.people (
  id          bigserial primary key,
  grp         text not null check (grp in ('assembly','board','team')),
  title       text not null default '',      -- أ. / م. / د.
  name        text not null,
  role        text not null default '',      -- المنصب (للمجلس والفريق)
  rank        text not null default 'member' -- chair | vice | lead | member
                check (rank in ('chair','vice','lead','member')),
  cat         text not null default '',      -- founder | working (للجمعية العمومية)
  phone       text not null default '',
  email       text not null default '',
  photo       text not null default '',      -- اسم الملف فقط
  sort        int  not null default 100,
  status      text not null default 'published'
                check (status in ('draft','published','hidden')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create index if not exists people_grp_idx on public.people (grp, sort, id);

-- مفتاح ملف التحميل: يسمح بتكرار الاسم (شخصان مختلفان قد يتشابه اسمهما
-- تمامًا، وهذا واقع في قائمة الجمعية العمومية) ويُبقي التحميل غير مُكرِّر.
-- يبقى فارغًا لكل صفّ يُضاف من اللوحة، والفراغات لا تتعارض في فهرس فريد.
alter table public.people add column if not exists seed_key text;
drop index if exists public.people_natural_idx;
create unique index if not exists people_seed_idx on public.people (seed_key);

alter table public.people enable row level security;

drop policy if exists "people public read" on public.people;
create policy "people public read" on public.people
  for select to anon, authenticated using (status = 'published');

drop policy if exists "people admin read" on public.people;
create policy "people admin read" on public.people
  for select to authenticated using (public.is_admin());

drop policy if exists "people admin write" on public.people;
create policy "people admin write" on public.people
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ───────────────────────── 2) شعارات الشركاء ─────────────────────────
create table if not exists public.partners (
  id          bigserial primary key,
  name        text not null,
  logo        text not null default '',      -- اسم ملف الشعار في img/partners/ أو مسار كامل
  url         text not null default '',
  sort        int  not null default 100,
  status      text not null default 'published'
                check (status in ('draft','published','hidden')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create unique index if not exists partners_name_idx on public.partners (name);
create index if not exists partners_sort_idx on public.partners (sort, id);

alter table public.partners enable row level security;

drop policy if exists "partners public read" on public.partners;
create policy "partners public read" on public.partners
  for select to anon, authenticated using (status = 'published');

drop policy if exists "partners admin read" on public.partners;
create policy "partners admin read" on public.partners
  for select to authenticated using (public.is_admin());

drop policy if exists "partners admin write" on public.partners;
create policy "partners admin write" on public.partners
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ──────────── 3) مفاتيح طبيعية للأخبار والوثائق (كي لا يتكرّر التحميل) ────────────
create unique index if not exists news_natural_idx on public.news (date, title);
--  documents.storage_path فريد أصلًا من schema-v2

-- ───────────────────── 4) تحديث updated_at تلقائيًّا ─────────────────────
drop trigger if exists people_touch on public.people;
create trigger people_touch before update on public.people
  for each row execute function public.touch_updated_at();

drop trigger if exists partners_touch on public.partners;
create trigger partners_touch before update on public.partners
  for each row execute function public.touch_updated_at();

-- ============================================================================
--  تحقّق بعد التشغيل:
--    select grp, count(*) from public.people group by grp;
--    select name, count(*) from public.people where grp='assembly' group by name having count(*)>1;
--    select count(*) from public.partners;
-- ============================================================================

-- ==========================================================================
--  [schema-v4.sql]  ترتيب الوثائق وتوثيق التعديل
-- ==========================================================================

-- ============================================================================
--  جمعية حاضنة الجمعيات — الإضافة الرابعة للمخطّط  (اختيارية)
--
--  اللوحة تعمل كاملةً بدون هذا الملف. تشغيله يضيف ميزتين فقط:
--    1) عمود ترتيب للوثائق، فيتحكّم المدير بترتيب ظهورها داخل كل تبويب.
--    2) توثيق آخر من عدّل (updated_by) وآخر وقت تعديل (updated_at) للوثائق
--       والأخبار.
--
--  ولا يحتاج تشغيلُه تعديلًا في الكود: شاشة الوثائق تطلب الأعمدة الموجودة
--  فعلًا (select=*) وتُظهر حقل «الترتيب» وحدها بمجرّد وجود العمود.
--
--  شغّله في:  Supabase → SQL Editor → New query → Run
--  آمن للتشغيل أكثر من مرة. يفترض تشغيل schema.sql و schema-v2.sql و
--  schema-v3.sql قبله.
-- ============================================================================

-- ───────────────────── 1) ترتيب الوثائق داخل تبويبها ─────────────────────
alter table public.documents add column if not exists sort int not null default 100;

-- الترتيب الحالي مأخوذ من ترتيب التحميل: نُثبّته بفواصل عشرة كي يسهل
-- إدخال وثيقة بين وثيقتين لاحقًا بلا إعادة ترقيم الجميع.
update public.documents d
   set sort = x.n * 10
  from (select id, row_number() over (partition by category order by id) as n
          from public.documents) x
 where d.id = x.id
   and d.sort = 100;

create index if not exists documents_order_idx on public.documents (category, sort, id);

-- ───────────────────── 2) توثيق التعديل: مَن ومتى ─────────────────────
alter table public.documents add column if not exists updated_at timestamptz not null default now();
alter table public.documents add column if not exists updated_by text;
alter table public.news      add column if not exists updated_by text;

drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();

-- الأخبار لها زرّ updated_at ومُشغّله من schema.sql؛ نتحقّق فقط من وجوده
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.news'::regclass
       and tgname  = 'news_touch'
       and not tgisinternal
  ) then
    create trigger news_touch before update on public.news
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- ============================================================================
--  تحقّق بعد التشغيل:
--    select category, sort, title from public.documents order by category, sort, id;
--    select column_name from information_schema.columns
--      where table_name='documents' and column_name in ('sort','updated_at','updated_by');
-- ============================================================================

-- ==========================================================================
--  [schema-v5.sql]  شرائح السلايدر الرئيسي
-- ==========================================================================

-- ============================================================================
--  جمعية حاضنة الجمعيات — الإضافة الخامسة للمخطّط
--  جدول شرائح السلايدر الرئيسي، كي تُدار من اللوحة نصًّا ورابطًا وأيقونة.
--
--  شغّله في:  Supabase → SQL Editor → New query → Run
--  آمن للتشغيل أكثر من مرة: البذرة لا تُكرّر (مفتاح seed_key فريد)، والشرائح
--  المزروعة هي الثلاث الموجودة في الموقع الآن بنصّها كما هو.
-- ============================================================================

create table if not exists public.hero_slides (
  id          bigserial primary key,
  eyebrow     text not null default '',      -- العنوان الصغير أعلى العنوان
  title       text not null,                 -- العنوان الرئيس (بلا الجزء المميّز)
  accent      text not null default '',       -- الجزء المميّز بلون الهوية في آخر العنوان
  text        text not null default '',       -- نصّ الشريحة
  cta1_label  text not null default '',
  cta1_url    text not null default '',
  cta1_icon   text not null default 'arrow',  -- arrow | none | ext | doc | users | star | play
  cta2_label  text not null default '',
  cta2_url    text not null default '',
  sort        int  not null default 100,
  status      text not null default 'published'
                check (status in ('draft','published')),
  seed_key    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create unique index if not exists hero_slides_seed_idx on public.hero_slides (seed_key);
create index if not exists hero_slides_order_idx on public.hero_slides (sort, id);

alter table public.hero_slides enable row level security;

drop policy if exists "hero public read" on public.hero_slides;
create policy "hero public read" on public.hero_slides
  for select to anon, authenticated using (status = 'published');

drop policy if exists "hero admin read" on public.hero_slides;
create policy "hero admin read" on public.hero_slides
  for select to authenticated using (public.is_admin());

drop policy if exists "hero admin write" on public.hero_slides;
create policy "hero admin write" on public.hero_slides
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop trigger if exists hero_slides_touch on public.hero_slides;
create trigger hero_slides_touch before update on public.hero_slides
  for each row execute function public.touch_updated_at();

-- ─────────────────── بذرة: الشرائح الثلاث الموجودة حاليًّا ───────────────────
insert into public.hero_slides
  (eyebrow,title,accent,text,cta1_label,cta1_url,cta1_icon,cta2_label,cta2_url,sort,status,seed_key)
values
  ('حاضنة الجمعيات','نُمكّن الجمعيات لتصنع','أثرًا يدوم','نحتضن المنظمات غير الربحية ونطوّر قدراتها المؤسسية، ونرافقها من الفكرة الأولى حتى الوصول إلى الاستدامة والأثر.','تعرّف علينا','#about','arrow','برامجنا','#programs',10,'published','seed-1'),
  ('رحلة الاحتضان','من الفكرة إلى','مؤسسة مستدامة','برامج نوعية ومسارات عملية في التأسيس والحوكمة وبناء القدرات والاستدامة المالية، مصمّمة لتنقل جمعيتك إلى المستوى المؤسسي.','استكشف البرامج','programs.html','arrow','الخدمات الإلكترونية','volunteer.html',20,'published','seed-2'),
  ('أثر مشترك','شراكات تُثمر','أثرًا مجتمعيًا','نعمل مع نخبة من الشركاء والداعمين لتوسيع أثر القطاع غير الربحي في المملكة، وبناء منظومة تمكين متكاملة.','شركاؤنا','#partners','arrow','تواصل معنا','contact.html',30,'published','seed-3')
on conflict (seed_key) do nothing;

-- ============================================================================
--  تحقّق بعد التشغيل:
--    select sort, eyebrow, title, accent, cta1_label, cta2_label
--      from public.hero_slides order by sort, id;
-- ============================================================================

-- ==========================================================================
--  [schema-v6.sql]  عناصر القائمة الرئيسية
-- ==========================================================================

-- ============================================================================
--  جمعية حاضنة الجمعيات — الإضافة السادسة للمخطّط
--  عناصر القائمة الرئيسية: تسميةٌ ورابطٌ وترتيبٌ وظهور، بمستويين.
--
--  المفتاح mkey يطابق data-mk في القائمة المبنيّة: فيُستنسخ العنصر المبنيّ
--  صاحب المفتاح نفسه عند إعادة البناء، فتُحفظ أيقونته وأصنافه.
--
--  شغّله في:  Supabase → SQL Editor → New query → Run
--  آمن للتشغيل أكثر من مرة (البذرة على مفتاح فريد لا تُكرَّر).
-- ============================================================================

create table if not exists public.menu_items (
  id         bigserial primary key,
  mkey       text not null,                 -- يطابق data-mk في القائمة المبنيّة
  parent     text not null default '',      -- مفتاح الأب، وفراغٌ للعنصر الرئيس
  label      text not null,
  href       text not null default '',      -- فارغ لعنصرٍ يفتح منسدلة فقط
  sort       int  not null default 100,
  visible    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists menu_items_key_idx on public.menu_items (mkey);
create index if not exists menu_items_order_idx on public.menu_items (parent, sort, id);

alter table public.menu_items enable row level security;

drop policy if exists "menu public read" on public.menu_items;
create policy "menu public read" on public.menu_items
  for select to anon, authenticated using (true);

drop policy if exists "menu admin write" on public.menu_items;
create policy "menu admin write" on public.menu_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop trigger if exists menu_items_touch on public.menu_items;
create trigger menu_items_touch before update on public.menu_items
  for each row execute function public.touch_updated_at();

-- ─────────────── بذرة: القائمة الحالية كما هي في الموقع ───────────────
insert into public.menu_items (mkey,parent,label,href,sort,visible)
values
  ('index','','الرئيسية','index.html',10,true),
  ('dd1','','من نحن','',20,true),
  ('about','dd1','عن الجمعية','about.html',10,true),
  ('assembly','dd1','الجمعية العمومية','assembly.html',20,true),
  ('board','dd1','مجلس الإدارة','board.html',30,true),
  ('committees','dd1','اللجان الفرعية','committees.html',40,true),
  ('team','dd1','فريق العمل','team.html',50,true),
  ('endowments','dd1','الأوقاف والاستثمارات','endowments.html',60,true),
  ('licenses','dd1','التراخيص','licenses.html',70,true),
  ('programs','','برامجنا','programs.html',30,true),
  ('news','','أخبارنا','news.html',40,true),
  ('dd2','','الحوكمة','',50,true),
  ('governance','dd2','السياسات واللوائح','governance.html',10,true),
  ('governance-2','dd2','محاضر الاجتماعات','governance.html',20,true),
  ('governance-3','dd2','القوائم المالية','governance.html',30,true),
  ('governance-4','dd2','التقارير السنوية','governance.html',40,true),
  ('governance-5','dd2','الإفصاح','governance.html',50,true),
  ('dd3','','قياس الرضا','',60,true),
  ('satisfaction','dd3','قياس رضا الزوار','satisfaction.html',10,true),
  ('satisfaction-2','dd3','قياس رضا المستفيدين','satisfaction.html',20,true),
  ('satisfaction-3','dd3','قياس رضا الداعمين','satisfaction.html',30,true),
  ('satisfaction-4','dd3','تقرير التغذية الراجعة','satisfaction.html',40,true),
  ('dd4','','الخدمات','',70,true),
  ('volunteer','dd4','تطوّع معنا','volunteer.html',10,true),
  ('membership','dd4','طلب العضوية','membership.html',20,true),
  ('jobs','dd4','الوظائف','jobs.html',30,true),
  ('contact','','تواصل معنا','contact.html',80,true)
on conflict (mkey) do nothing;

-- ============================================================================
--  تحقّق بعد التشغيل:
--    select parent, sort, mkey, label, href, visible
--      from public.menu_items order by parent, sort, id;
-- ============================================================================

-- ==========================================================================
--  [schema-v7.sql]  الأدوار الحقيقية وإدارة المدراء
-- ==========================================================================

-- ============================================================================
--  جمعية حاضنة الجمعيات — الإضافة السابعة للمخطّط
--  الأدوار تصير حقيقية، وإدارة المدراء من اللوحة.
--
--  ما كان: دالّة is_admin() تتحقّق من وجود البريد في جدول المدراء ولا تنظر
--  إلى عمود role إطلاقًا. فمن دوره «قارئ» كان يكتب في كل شيء كصاحب الحساب.
--  وجدول المدراء له سياسة قراءةٍ واحدة لصفّ صاحب الجلسة، ولا سياسة كتابة —
--  فلا تُدار الحسابات إلا بـSQL.
--
--  ما يصير:
--    is_admin()   وجود البريد في الجدول بأي دور  →  القراءة (كما هي)
--    is_editor()  الدور admin أو editor          →  كل كتابة
--    is_owner()   الدور admin وحده                →  إدارة المدراء
--
--  ولماذا بقيت is_admin() للقراءة على حالها: لو قصرتُها على الكاتبين لَفقد
--  «القارئ» حقَّ القراءة فترفض اللوحة العمل عنده. وهذا الترتيب آمنٌ عند
--  التطبيق الجزئي: لو تعذّر تنفيذ نصف الملف لم يفقد أحدٌ حقَّ القراءة.
--
--  شغّله في:  Supabase → SQL Editor → New query → Run
--  آمن للتشغيل أكثر من مرة.
-- ============================================================================

-- ─────────────────────── 1) دالّتا الأدوار ───────────────────────
create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a
     where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and a.role in ('admin', 'editor')
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a
     where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and a.role = 'admin'
  );
$$;

-- ─────────────── 2) كل سياسات الكتابة تصير للكاتبين ───────────────
--  (19 سياسة — القراءة تبقى كما هي فلا يفقد القارئ شيئًا)

-- settings
drop policy if exists "settings admin write" on public.settings;
create policy "settings admin write" on public.settings
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- content_overrides
drop policy if exists "overrides admin write" on public.content_overrides;
create policy "overrides admin write" on public.content_overrides
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- media
drop policy if exists "media admin write" on public.media;
create policy "media admin write" on public.media
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- people
drop policy if exists "people admin write" on public.people;
create policy "people admin write" on public.people
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- partners
drop policy if exists "partners admin write" on public.partners;
create policy "partners admin write" on public.partners
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- hero_slides
drop policy if exists "hero admin write" on public.hero_slides;
create policy "hero admin write" on public.hero_slides
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- menu_items
drop policy if exists "menu admin write" on public.menu_items;
create policy "menu admin write" on public.menu_items
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- news
drop policy if exists "news admin insert" on public.news;
create policy "news admin insert" on public.news
  for insert to authenticated with check (public.is_editor());
drop policy if exists "news admin update" on public.news;
create policy "news admin update" on public.news
  for update to authenticated using (public.is_editor()) with check (public.is_editor());
drop policy if exists "news admin delete" on public.news;
create policy "news admin delete" on public.news
  for delete to authenticated using (public.is_editor());

-- documents
drop policy if exists "docs admin all" on public.documents;
create policy "docs admin all" on public.documents
  for all to authenticated using (public.is_editor()) with check (public.is_editor());
--  الوثائق كانت بلا سياسة قراءةٍ للموظّفين: القارئ يرى المنشور وحده.
drop policy if exists "docs staff read" on public.documents;
create policy "docs staff read" on public.documents
  for select to authenticated using (public.is_admin());

-- submissions
drop policy if exists "subs admin update" on public.submissions;
create policy "subs admin update" on public.submissions
  for update to authenticated using (public.is_editor()) with check (public.is_editor());
drop policy if exists "subs admin delete" on public.submissions;
create policy "subs admin delete" on public.submissions
  for delete to authenticated using (public.is_editor());

-- survey_responses
drop policy if exists "survey admin delete" on public.survey_responses;
create policy "survey admin delete" on public.survey_responses
  for delete to authenticated using (public.is_editor());

-- audit_log  (الإدراج يبقى لأي موظّف كي يُسجَّل عملُه)
drop policy if exists "audit admin delete" on public.audit_log;
create policy "audit admin delete" on public.audit_log
  for delete to authenticated using (public.is_owner());

-- التخزين: رفع الملفات وحذفها للكاتبين
drop policy if exists "iaq buckets admin insert" on storage.objects;
create policy "iaq buckets admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('iaq-files','iaq-media') and public.is_editor());

drop policy if exists "iaq buckets admin update" on storage.objects;
create policy "iaq buckets admin update" on storage.objects
  for update to authenticated
  using (bucket_id in ('iaq-files','iaq-media') and public.is_editor())
  with check (bucket_id in ('iaq-files','iaq-media') and public.is_editor());

drop policy if exists "iaq buckets admin delete" on storage.objects;
create policy "iaq buckets admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('iaq-files','iaq-media') and public.is_editor());

-- ─────────────── 3) إدارة المدراء: للمالك وحده ───────────────
--  صفّ صاحب الجلسة يبقى مقروءًا له دائمًا (اللوحة تحتاجه للتحقّق).
drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));

drop policy if exists "admins owner read" on public.admins;
create policy "admins owner read" on public.admins
  for select to authenticated using (public.is_owner());

drop policy if exists "admins owner insert" on public.admins;
create policy "admins owner insert" on public.admins
  for insert to authenticated with check (public.is_owner());

drop policy if exists "admins owner update" on public.admins;
create policy "admins owner update" on public.admins
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "admins owner delete" on public.admins;
create policy "admins owner delete" on public.admins
  for delete to authenticated using (public.is_owner());

-- ─────────────── 4) حرزٌ يمنع إقفال الحساب على أهله ───────────────
--  حذف آخر مالكٍ أو تنزيل دوره يترك النظام بلا من يديره ولا من يكتب فيه —
--  ولا يُصلَح ذلك إلا من لوحة Supabase. فيُمنع في القاعدة نفسها.
create or replace function public.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owners int;
begin
  select count(*) into owners from public.admins where role = 'admin';

  if tg_op = 'DELETE' then
    if old.role = 'admin' and owners <= 1 then
      raise exception 'لا يمكن حذف المالك الأخير — أضِف مالكًا آخر أوّلًا.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'admin' and new.role <> 'admin' and owners <= 1 then
      raise exception 'لا يمكن تنزيل دور المالك الأخير — أضِف مالكًا آخر أوّلًا.';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists admins_guard on public.admins;
create trigger admins_guard before update or delete on public.admins
  for each row execute function public.guard_last_owner();

-- ============================================================================
--  تحقّق بعد التشغيل:
--
--  1) الدوالّ الثلاث موجودة:
--       select proname from pg_proc
--        where proname in ('is_admin','is_editor','is_owner') order by 1;
--
--  2) دورك يسمح بالكتابة وبإدارة المدراء:
--       select public.is_admin() as يقرأ,
--              public.is_editor() as يكتب,
--              public.is_owner() as يدير;
--       -- المتوقّع لحسابك (role=admin): true, true, true
--
--  3) الحرز يعمل — يجب أن يفشل هذا بخطأٍ واضح ما دمتَ المالك الوحيد:
--       -- delete from public.admins where email = 'gov@iaq.org.sa';
--
--  4) عدد سياسات الكتابة التي صارت للكاتبين:
--       select count(*) from pg_policies
--        where qual like '%is_editor%' or with_check like '%is_editor%';
-- ============================================================================

-- ============================================================================
--  تقرير ما بعد التشغيل — يجب أن تظهر كل الجداول والدوالّ الثلاث
-- ============================================================================
select 'الجداول' as البند, string_agg(table_name, ' · ' order by table_name) as القيمة
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('admins','news','documents','submissions','survey_responses',
                      'audit_log','settings','content_overrides','media','people',
                      'partners','hero_slides','menu_items')
union all
select 'الدوالّ', string_agg(proname, ' · ' order by proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname in ('is_admin','is_editor','is_owner')
union all
select 'صلاحيتك', 'يقرأ=' || public.is_admin() || ' · يكتب=' || public.is_editor()
                 || ' · يدير=' || public.is_owner()
union all
select 'شرائح السلايدر', count(*)::text from public.hero_slides
union all
select 'عناصر القائمة', count(*)::text from public.menu_items
union all
select 'سياسات الكتابة للكاتبين', count(*)::text from pg_policies
 where qual like '%is_editor%' or with_check like '%is_editor%';
