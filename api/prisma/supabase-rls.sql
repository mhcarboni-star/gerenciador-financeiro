-- Rode no SQL Editor do Supabase depois de aplicar as migrações (e após cada migração que criar tabelas).
-- Ativa RLS sem políticas: bloqueia o acesso pela API pública do Supabase (chaves anon/authenticated).
-- A API do app conecta direto no Postgres com o usuário dono das tabelas e não é afetada.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- Views rodam com as permissões do dono; tire o acesso das roles públicas.
REVOKE ALL ON public.account_balances, public.invoice_totals, public.recurrence_variance FROM anon, authenticated;
