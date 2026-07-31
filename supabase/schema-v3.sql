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
-- مفتاح طبيعي يمنع التكرار عند إعادة تشغيل ملف التحميل
create unique index if not exists people_natural_idx on public.people (grp, name);

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
--    select count(*) from public.partners;
-- ============================================================================
