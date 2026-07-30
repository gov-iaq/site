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
