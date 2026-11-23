-- Segurança (recomendações do verificador do Supabase)
-- 1) search_path fixo nas funções: impede que um objeto com o mesmo nome em outro schema
--    seja usado no lugar do original.
ALTER FUNCTION public.check_transaction_refs() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_category_parent() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_transaction_loan() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_checkpoint_tx() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_member(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_responsible() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_plan_owner() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_paid_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.due_items_for_user(text, date) SET search_path = public, pg_temp;
ALTER FUNCTION public.account_balance_on(text, date, boolean) SET search_path = public, pg_temp;

-- 2) Funções só para o próprio banco/servidor: ninguém mais executa (triggers não dependem disso).
REVOKE EXECUTE ON FUNCTION
  public.check_transaction_refs(), public.check_category_parent(), public.check_transaction_loan(),
  public.check_checkpoint_tx(), public.check_member(text, text), public.check_responsible(),
  public.check_plan_owner(), public.set_paid_at(), public.due_items_for_user(text, date),
  public.account_balance_on(text, date, boolean)
FROM PUBLIC;

-- 3) Tabelas fechadas para a API pública (RLS sem políticas). O servidor conecta como dono
--    das tabelas e não é afetado. Novas tabelas em migrações futuras devem fazer o mesmo.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
  -- Papéis da API do Supabase (só existem lá)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.account_balances, public.invoice_totals, public.recurrence_variance, public.loan_balances FROM anon, authenticated';
    EXECUTE 'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated';
  END IF;
END $$;
