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
