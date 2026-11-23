-- Saldo das contas:
--   balanceCents          = efetivados com data até HOJE (fuso de Brasília). Lançamentos com data
--                           futura, mesmo marcados como pagos, só entram no saldo quando a data chega.
--   projectedBalanceCents = saldo em 31/12 do ano corrente, incluindo os previstos até lá.
CREATE OR REPLACE VIEW account_balances AS
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d)
SELECT
  a.id AS "accountId",
  a."householdId",
  account_balance_on(a.id, (SELECT d FROM hoje), false)::bigint AS "balanceCents",
  account_balance_on(a.id, make_date(EXTRACT(YEAR FROM (SELECT d FROM hoje))::int, 12, 31), true)::bigint AS "projectedBalanceCents"
FROM "Account" a;

-- A view continua fechada para a API pública do Supabase (só existe lá)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.account_balances FROM anon, authenticated';
  END IF;
END $$;
