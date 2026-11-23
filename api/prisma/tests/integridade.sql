-- Teste de integridade do banco. Roda tudo dentro de uma transação e desfaz no final.
-- Uso: psql "$DIRECT_URL" -f api/prisma/tests/integridade.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.expect_fail(label text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'FALHOU (deveria rejeitar): %', label;
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
  RAISE NOTICE 'ok rejeitado: % -> %', label, left(SQLERRM, 70);
END $$;

INSERT INTO "User"(id,name,email,"passwordHash","updatedAt") VALUES ('u1','Ana','a@x','h',now()),('u2','Beto','b@x','h',now());
INSERT INTO "Household"(id,name,"updatedAt") VALUES ('h1','Casa',now()),('h2','Outro',now());
INSERT INTO "HouseholdMember"("householdId","userId",role) VALUES ('h1','u1','OWNER'),('h1','u2','MEMBER');
INSERT INTO "Account"(id,"householdId",name,"initialBalanceCents","updatedAt") VALUES ('acc1','h1','Corrente',100000,now()),('acc2','h1','Poupança',0,now());
INSERT INTO "CreditCard"(id,"householdId",name,"closingDay","dueDay","paymentAccountId","updatedAt") VALUES ('cc1','h1','Nubank',3,10,'acc1',now());
INSERT INTO "CreditCardInvoice"(id,"creditCardId","referenceMonth","closingDate","dueDate","updatedAt") VALUES ('inv1','cc1','2026-12-01','2026-12-03','2026-12-10',now());
INSERT INTO "Category"(id,"householdId",name,type,"updatedAt") VALUES ('cExp','h1','Alimentação','EXPENSE',now()),('cInc','h1','Salário','INCOME',now()),('cOther','h2','Lazer','EXPENSE',now());
INSERT INTO "Category"(id,"householdId","parentId",name,type,"updatedAt") VALUES ('cSub','h1','cExp','Mercado','EXPENSE',now());

-- Válidos
INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","categoryId","updatedAt") VALUES
 ('t1','h1','INCOME','Salário',500000,'2026-11-05','acc1','cInc',now()),
 ('t2','h1','EXPENSE','Mercado',30000,'2026-11-10','acc1','cSub',now());
INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","destinationAccountId","updatedAt") VALUES
 ('t3','h1','TRANSFER','Guardar',100000,'2026-11-11','acc1','acc2',now());
INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"creditCardId","invoiceId","categoryId","updatedAt") VALUES
 ('t4','h1','EXPENSE','Restaurante',12000,'2026-11-20','cc1','inv1','cExp',now());
INSERT INTO "Transaction"(id,"householdId",type,status,description,"amountCents",date,"accountId","updatedAt") VALUES
 ('t5','h1','EXPENSE','PENDING','Conta de luz',20000,'2026-11-28','acc1',now());
INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","invoiceId","updatedAt") VALUES
 ('t6','h1','INVOICE_PAYMENT','Pagamento fatura',12000,'2026-12-10','acc1','inv1',now());

-- Inválidos
SELECT pg_temp.expect_fail('valor zero', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","updatedAt") VALUES ('x','h1','EXPENSE','x',0,'2026-11-01','acc1',now())$q$);
SELECT pg_temp.expect_fail('despesa sem conta nem cartão', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"updatedAt") VALUES ('x','h1','EXPENSE','x',1,'2026-11-01',now())$q$);
SELECT pg_temp.expect_fail('despesa com conta e cartão', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","creditCardId","invoiceId","updatedAt") VALUES ('x','h1','EXPENSE','x',1,'2026-11-01','acc1','cc1','inv1',now())$q$);
SELECT pg_temp.expect_fail('compra no cartão sem fatura', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"creditCardId","updatedAt") VALUES ('x','h1','EXPENSE','x',1,'2026-11-01','cc1',now())$q$);
SELECT pg_temp.expect_fail('transferência para a mesma conta', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","destinationAccountId","updatedAt") VALUES ('x','h1','TRANSFER','x',1,'2026-11-01','acc1','acc1',now())$q$);
SELECT pg_temp.expect_fail('categoria de receita em despesa', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","categoryId","updatedAt") VALUES ('x','h1','EXPENSE','x',1,'2026-11-01','acc1','cInc',now())$q$);
SELECT pg_temp.expect_fail('categoria de outro grupo', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","categoryId","updatedAt") VALUES ('x','h1','EXPENSE','x',1,'2026-11-01','acc1','cOther',now())$q$);
SELECT pg_temp.expect_fail('sub-subcategoria', $q$INSERT INTO "Category"(id,"householdId","parentId",name,type,"updatedAt") VALUES ('x','h1','cSub','Feira','EXPENSE',now())$q$);
SELECT pg_temp.expect_fail('categoria duplicada (maiúsc./minúsc.)', $q$INSERT INTO "Category"(id,"householdId",name,type,"updatedAt") VALUES ('x','h1','alimentação','EXPENSE',now())$q$);
SELECT pg_temp.expect_fail('orçamento fora do dia 1', $q$INSERT INTO "Budget"(id,"householdId","categoryId",month,"limitCents","updatedAt") VALUES ('x','h1','cExp','2026-11-15',100,now())$q$);
SELECT pg_temp.expect_fail('dia de fechamento 32', $q$INSERT INTO "CreditCard"(id,"householdId",name,"closingDay","dueDay","updatedAt") VALUES ('x','h1','X',32,10,now())$q$);

SELECT pg_temp.expect_fail('conta de outro grupo', $q$INSERT INTO "Account"(id,"householdId",name,"updatedAt") VALUES ('accX','h2','X',now()); INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","updatedAt") VALUES ('x','h1','EXPENSE','x',1,'2026-11-01','accX',now())$q$);
SELECT a.name, b."balanceCents", b."projectedBalanceCents" FROM account_balances b JOIN "Account" a ON a.id=b."accountId" ORDER BY 1;
SELECT "invoiceId","totalCents","paidCents" FROM invoice_totals;
ROLLBACK;
