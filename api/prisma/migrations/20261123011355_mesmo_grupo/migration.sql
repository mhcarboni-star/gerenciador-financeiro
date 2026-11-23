-- Garante que conta, conta de destino, cartão, fatura, parcelamento, recorrência e meta
-- de um lançamento pertencem ao mesmo grupo do lançamento.
CREATE OR REPLACE FUNCTION check_transaction_refs() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  inv_card text;
BEGIN
  IF NEW."accountId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Account" WHERE id = NEW."accountId" AND "householdId" = NEW."householdId") THEN
    RAISE EXCEPTION 'Conta não pertence a este grupo';
  END IF;
  IF NEW."destinationAccountId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Account" WHERE id = NEW."destinationAccountId" AND "householdId" = NEW."householdId") THEN
    RAISE EXCEPTION 'Conta de destino não pertence a este grupo';
  END IF;
  IF NEW."creditCardId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "CreditCard" WHERE id = NEW."creditCardId" AND "householdId" = NEW."householdId") THEN
    RAISE EXCEPTION 'Cartão não pertence a este grupo';
  END IF;
  IF NEW."invoiceId" IS NOT NULL THEN
    SELECT i."creditCardId" INTO inv_card
      FROM "CreditCardInvoice" i JOIN "CreditCard" c ON c.id = i."creditCardId"
      WHERE i.id = NEW."invoiceId" AND c."householdId" = NEW."householdId";
    IF inv_card IS NULL THEN
      RAISE EXCEPTION 'Fatura não pertence a este grupo';
    END IF;
    IF NEW."type" <> 'INVOICE_PAYMENT' AND inv_card IS DISTINCT FROM NEW."creditCardId" THEN
      RAISE EXCEPTION 'A fatura não pertence ao cartão do lançamento';
    END IF;
  END IF;
  IF NEW."categoryId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Category" c WHERE c.id = NEW."categoryId" AND c."householdId" = NEW."householdId"
      AND c."type"::text = NEW."type"::text) THEN
    RAISE EXCEPTION 'Categoria inválida para este lançamento (grupo ou tipo diferente)';
  END IF;
  IF NEW."installmentPlanId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "InstallmentPlan" WHERE id = NEW."installmentPlanId" AND "householdId" = NEW."householdId") THEN
    RAISE EXCEPTION 'Parcelamento não pertence a este grupo';
  END IF;
  IF NEW."recurrenceId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Recurrence" WHERE id = NEW."recurrenceId" AND "householdId" = NEW."householdId") THEN
    RAISE EXCEPTION 'Recorrência não pertence a este grupo';
  END IF;
  IF NEW."goalId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Goal" WHERE id = NEW."goalId" AND "householdId" = NEW."householdId") THEN
    RAISE EXCEPTION 'Meta não pertence a este grupo';
  END IF;
  RETURN NEW;
END $$;
