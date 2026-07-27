-- ==========================================================================
-- Спільні витрати — схема бази даних Supabase
-- Виконайте цей файл повністю в SQL Editor вашого проекту Supabase.
-- ==========================================================================

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  payer text not null check (payer in ('Міша', 'Женя')),
  amount numeric not null check (amount > 0),
  description text,
  created_at timestamptz not null default now()
);

-- Індекс для швидкого сортування за датою (нові записи зверху)
create index if not exists transactions_created_at_idx
  on transactions (created_at desc);

-- ==========================================================================
-- Row Level Security (RLS)
-- ==========================================================================
-- У додатку немає авторизації користувачів: обидва учасники користуються
-- одним публічним (anon) ключем. Тому нижче ввімкнено RLS з політиками,
-- які дозволяють читання і запис усім, хто має anon-ключ проекту.
--
-- Це прийнятно для приватного застосунку "для двох", яким ви не ділитесь
-- публічно. Якщо потрібен вищий рівень захисту — додайте авторизацію
-- Supabase Auth і замініть політики нижче на перевірку auth.uid().
-- ==========================================================================

alter table transactions enable row level security;

create policy "Публічне читання транзакцій"
  on transactions for select
  to anon
  using (true);

create policy "Публічне додавання транзакцій"
  on transactions for insert
  to anon
  with check (true);

create policy "Публічне редагування транзакцій"
  on transactions for update
  to anon
  using (true)
  with check (true);

create policy "Публічне видалення транзакцій"
  on transactions for delete
  to anon
  using (true);
