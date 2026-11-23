-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "paidAt" TIMESTAMP(3);


-- Lançamentos já pagos: considera efetivados quando foram criados
UPDATE "Transaction" SET "paidAt" = "createdAt" WHERE status = 'PAID' AND "paidAt" IS NULL;

-- Preenche paidAt automaticamente quando o lançamento passa a PAID (e limpa se voltar a PENDING)
CREATE FUNCTION set_paid_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'PAID' THEN
    IF TG_OP = 'INSERT' THEN
      NEW."paidAt" := COALESCE(NEW."paidAt", now());
    ELSIF OLD.status <> 'PAID' THEN
      NEW."paidAt" := now();
    END IF;
  ELSE
    NEW."paidAt" := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER transaction_paid_at BEFORE INSERT OR UPDATE ON "Transaction"
  FOR EACH ROW EXECUTE FUNCTION set_paid_at();

-- Regra do ajuste de saldo, corrigida:
-- • efetivados (PAID) contam se a data é posterior ao ajuste, ou se é do mesmo dia e foram
--   efetivados depois do ajuste;
-- • pendentes (só no saldo previsto) sempre contam: não estavam no saldo do banco.
CREATE OR REPLACE FUNCTION account_balance_on(p_account text, p_date date, p_include_pending boolean)
RETURNS integer LANGUAGE sql STABLE AS $$
  WITH cp AS (
    SELECT c.date, c."balanceCents", c."createdAt"
    FROM "BalanceCheckpoint" c
    WHERE c."accountId" = p_account AND c.date <= p_date
    ORDER BY c.date DESC, c."createdAt" DESC
    LIMIT 1
  )
  SELECT (
    COALESCE((SELECT "balanceCents" FROM cp), (SELECT "initialBalanceCents" FROM "Account" WHERE id = p_account))
    + COALESCE((
      SELECT SUM(CASE
                   WHEN t."type" = 'TRANSFER' AND t."destinationAccountId" = p_account THEN t."amountCents"
                   WHEN t."type" IN ('INCOME', 'LOAN_RECEIPT') THEN t."amountCents"
                   ELSE -t."amountCents"
                 END)
      FROM "Transaction" t
      WHERE (t."accountId" = p_account OR (t."type" = 'TRANSFER' AND t."destinationAccountId" = p_account))
        AND t."type" NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT')
        AND t.date <= p_date
        AND (p_include_pending OR t.status = 'PAID')
        AND (NOT EXISTS (SELECT 1 FROM cp)
             OR t.status = 'PENDING'
             OR t.date > (SELECT date FROM cp)
             OR (t.date = (SELECT date FROM cp) AND t."paidAt" > (SELECT "createdAt" FROM cp)))
    ), 0)
  )::int
$$;
