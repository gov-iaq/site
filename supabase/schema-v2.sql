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
