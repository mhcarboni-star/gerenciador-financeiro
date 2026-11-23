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

-- ── Recorrências: previsto × realizado ──
-- Netflix no cartão, valor fixo; Energia na conta, valor estimado
INSERT INTO "Recurrence"(id,"householdId",type,description,"amountCents","startDate","nextDate","creditCardId","categoryId","updatedAt")
  VALUES ('recNet','h1','EXPENSE','Netflix',5590,'2026-11-15','2027-01-15','cc1','cExp',now());
INSERT INTO "Recurrence"(id,"householdId",type,description,"amountCents","amountIsEstimate","startDate","nextDate","accountId","updatedAt")
  VALUES ('recLuz','h1','EXPENSE','Energia',18000,true,'2026-11-25','2027-01-25','acc1',now());
-- Ocorrências geradas como PENDING com o valor previsto
INSERT INTO "Transaction"(id,"householdId",type,status,description,"amountCents","expectedAmountCents",date,"occurrenceDate","creditCardId","invoiceId","categoryId","recurrenceId","updatedAt")
  VALUES ('rn1','h1','EXPENSE','PENDING','Netflix',5590,5590,'2026-11-15','2026-11-15','cc1','inv1','cExp','recNet',now());
INSERT INTO "Transaction"(id,"householdId",type,status,description,"amountCents","expectedAmountCents",date,"occurrenceDate","accountId","recurrenceId","updatedAt")
  VALUES ('rl1','h1','EXPENSE','PENDING','Energia',18000,18000,'2026-11-25','2026-11-25','acc1','recLuz',now());
-- Fatura com Netflix ainda prevista: total confirmado não muda, projetado sim
SELECT "totalCents" = 12000 AND "projectedTotalCents" = 17590 AS fatura_previsto_ok FROM invoice_totals WHERE "invoiceId" = 'inv1';
-- No dia: confirmar a energia com o valor correto, pago dois dias depois
UPDATE "Transaction" SET status = 'PAID', "amountCents" = 21347, date = '2026-11-27' WHERE id = 'rl1';
UPDATE "Transaction" SET status = 'PAID' WHERE id = 'rn1';
SELECT "expectedAmountCents" = 18000 AND "amountCents" = 21347 AND "differenceCents" = 3347 AS variacao_ok FROM recurrence_variance WHERE "transactionId" = 'rl1';

SELECT pg_temp.expect_fail('estimativa gerada já como paga', $q$INSERT INTO "Recurrence"(id,"householdId",type,description,"amountCents","amountIsEstimate","autoMarkPaid","startDate","nextDate","accountId","updatedAt") VALUES ('x','h1','EXPENSE','x',1,true,true,'2026-11-01','2026-11-01','acc1',now())$q$);
SELECT pg_temp.expect_fail('ocorrência sem data programada', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","recurrenceId","updatedAt") VALUES ('x','h1','EXPENSE','x',1,'2026-11-01','acc1','recLuz',now())$q$);
SELECT pg_temp.expect_fail('mesma ocorrência gerada duas vezes', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"occurrenceDate","accountId","recurrenceId","updatedAt") VALUES ('x','h1','EXPENSE','x',1,'2026-11-30','2026-11-25','acc1','recLuz',now())$q$);
SELECT pg_temp.expect_fail('recorrência no cartão e na conta ao mesmo tempo', $q$INSERT INTO "Recurrence"(id,"householdId",type,description,"amountCents","startDate","nextDate","accountId","creditCardId","updatedAt") VALUES ('x','h1','EXPENSE','x',1,'2026-11-01','2026-11-01','acc1','cc1',now())$q$);


-- ── Notificações ──
INSERT INTO "PushSubscription"(id,"userId",endpoint,p256dh,auth) VALUES ('ps1','u1','https://push.example/abc','k','a');
INSERT INTO "NotificationSettings"("userId","updatedAt") VALUES ('u1',now());
UPDATE "HouseholdMember" SET "notifyDueItems" = false WHERE "userId" = 'u2';
-- Em 28/11: a conta de luz t5 (pendente, vence 28/11) aparece para Ana; Beto desligou os avisos do grupo
SELECT count(*) = 1 AND bool_and(description = 'Conta de luz' AND NOT overdue) AS aviso_ana_ok FROM due_items_for_user('u1','2026-11-28');
SELECT count(*) = 0 AS aviso_beto_desligado_ok FROM due_items_for_user('u2','2026-11-28');
-- No dia seguinte, ela vira "atrasada"
SELECT bool_and(overdue) AS atrasado_ok FROM due_items_for_user('u1','2026-11-29');
INSERT INTO "NotificationLog"(id,"userId",kind,"referenceDate","transactionCount","devicesReached") VALUES ('nl1','u1','DUE_ITEMS','2026-11-28',1,1);

SELECT pg_temp.expect_fail('aviso duplicado no mesmo dia', $q$INSERT INTO "NotificationLog"(id,"userId",kind,"referenceDate","transactionCount","devicesReached") VALUES ('x','u1','DUE_ITEMS','2026-11-28',1,1)$q$);
SELECT pg_temp.expect_fail('hora do aviso 24', $q$UPDATE "NotificationSettings" SET "sendHour" = 24 WHERE "userId" = 'u1'$q$);
SELECT pg_temp.expect_fail('fuso horário inválido', $q$UPDATE "NotificationSettings" SET timezone = 'São Paulo; DROP' WHERE "userId" = 'u1'$q$);
SELECT pg_temp.expect_fail('aparelho com endpoint sem https', $q$INSERT INTO "PushSubscription"(id,"userId",endpoint,p256dh,auth) VALUES ('x','u1','http://inseguro','k','a')$q$);
SELECT pg_temp.expect_fail('aparelho duplicado', $q$INSERT INTO "PushSubscription"(id,"userId",endpoint,p256dh,auth) VALUES ('x','u2','https://push.example/abc','k','a')$q$);


-- ── Empréstimos ──
-- R$ 10.000 a 2% a.m. em 12x (Price), recebido na conta corrente em 10/11, 1ª parcela 10/12
INSERT INTO "Loan"(id,"householdId",name,lender,"principalCents","interestType","monthlyRate","installmentCount","startDate","firstDueDate","receivedAccountId","paymentAccountId","updatedAt")
  VALUES ('loan1','h1','Empréstimo pessoal','Banco X',1000000,'PRICE',0.02,12,'2026-11-10','2026-12-10','acc1','acc1',now());
INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","loanId","updatedAt")
  VALUES ('lr1','h1','LOAN_RECEIPT','Empréstimo pessoal',1000000,'2026-11-10','acc1','loan1',now());
-- Parcelas previstas (geradas pela API a partir da tabela Price)
INSERT INTO "Transaction"(id,"householdId",type,status,description,"amountCents","expectedAmountCents",date,"occurrenceDate","accountId","loanId","loanInstallmentNumber","loanPrincipalCents","loanInterestCents","updatedAt") VALUES
  ('lp1','h1','LOAN_PAYMENT','PENDING','Parcela 1/12',94560,94560,'2026-12-10','2026-12-10','acc1','loan1',1,74560,20000,now()),
  ('lp2','h1','LOAN_PAYMENT','PENDING','Parcela 2/12',94560,94560,'2027-01-10','2027-01-10','acc1','loan1',2,76051,18509,now());
SELECT "principalOutstandingCents" = 1000000 AND "pendingInstallments" = 2 AND "nextDueDate" = '2026-12-10' AS emprestimo_inicio_ok FROM loan_balances WHERE "loanId" = 'loan1';
-- Parcela 1 aparece no aviso do dia 10/12
SELECT count(*) = 1 AS parcela_no_aviso_ok FROM due_items_for_user('u1','2026-12-10') WHERE "transactionId" = 'lp1';
-- Confirmar a parcela 1 e fazer uma antecipação avulsa de R$ 2.000 (amortiza tudo)
UPDATE "Transaction" SET status = 'PAID' WHERE id = 'lp1';
INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","loanId","loanPrincipalCents","loanInterestCents","updatedAt")
  VALUES ('la1','h1','LOAN_PAYMENT','Antecipação',200000,'2026-12-20','acc1','loan1',200000,0,now());
SELECT "principalOutstandingCents" = 725440 AND "totalPaidCents" = 294560 AND "interestPaidCents" = 20000 AND "paidInstallments" = 1
  AS saldo_devedor_ok FROM loan_balances WHERE "loanId" = 'loan1';

SELECT pg_temp.expect_fail('pagamento sem empréstimo', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","updatedAt") VALUES ('x','h1','LOAN_PAYMENT','x',1,'2026-12-01','acc1',now())$q$);
SELECT pg_temp.expect_fail('despesa comum ligada a empréstimo', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","loanId","updatedAt") VALUES ('x','h1','EXPENSE','x',1,'2026-12-01','acc1','loan1',now())$q$);
SELECT pg_temp.expect_fail('amortização + juros diferente do valor', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","loanId","loanPrincipalCents","loanInterestCents","updatedAt") VALUES ('x','h1','LOAN_PAYMENT','x',1000,'2026-12-01','acc1','loan1',500,400,now())$q$);
SELECT pg_temp.expect_fail('juros negativos', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","loanId","loanPrincipalCents","loanInterestCents","updatedAt") VALUES ('x','h1','LOAN_PAYMENT','x',1000,'2026-12-01','acc1','loan1',1100,-100,now())$q$);
SELECT pg_temp.expect_fail('parcela do empréstimo duplicada', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","loanId","loanInstallmentNumber","updatedAt") VALUES ('x','h1','LOAN_PAYMENT','x',1,'2026-12-01','acc1','loan1',2,now())$q$);
SELECT pg_temp.expect_fail('Price sem número de parcelas', $q$INSERT INTO "Loan"(id,"householdId",name,"principalCents","interestType","monthlyRate","startDate","updatedAt") VALUES ('x','h1','x',100,'PRICE',0.02,'2026-11-01',now())$q$);
SELECT pg_temp.expect_fail('sem juros com taxa', $q$INSERT INTO "Loan"(id,"householdId",name,"principalCents","interestType","monthlyRate","startDate","updatedAt") VALUES ('x','h1','x',100,'NONE',0.02,'2026-11-01',now())$q$);
SELECT pg_temp.expect_fail('quitado sem data de quitação', $q$UPDATE "Loan" SET status = 'PAID_OFF' WHERE id = 'loan1'$q$);
SELECT pg_temp.expect_fail('empréstimo de outro grupo', $q$INSERT INTO "Loan"(id,"householdId",name,"principalCents","startDate","updatedAt") VALUES ('loanX','h2','x',100,'2026-11-01',now()); INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","loanId","updatedAt") VALUES ('x','h1','LOAN_PAYMENT','x',1,'2026-12-01','acc1','loanX',now())$q$);
SELECT pg_temp.expect_fail('recorrência de pagamento de empréstimo', $q$INSERT INTO "Recurrence"(id,"householdId",type,description,"amountCents","startDate","nextDate","accountId","updatedAt") VALUES ('x','h1','LOAN_PAYMENT','x',1,'2026-11-01','2026-11-01','acc1',now())$q$);


-- ── Ajuste de saldo ──
-- Saldo da Corrente no app em 31/12 (antes do ajuste)
SELECT account_balance_on('acc1','2026-12-31',false) AS corrente_antes_do_ajuste;
-- Extrato do banco diz R$ 10.000,00 em 31/12 → ajuste de saída da diferença
INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","createdAt","updatedAt")
  SELECT 'adj1','h1','ADJUSTMENT_OUT','Ajuste de saldo', account_balance_on('acc1','2026-12-31',false) - 1000000,'2026-12-31','acc1','2026-12-31 10:00',now();
INSERT INTO "BalanceCheckpoint"(id,"accountId",date,"balanceCents","transactionId","createdAt") VALUES ('cp1','acc1','2026-12-31',1000000,'adj1','2026-12-31 10:00');
SELECT account_balance_on('acc1','2026-12-31',false) = 1000000 AS saldo_bate_no_ajuste;
-- Lançamento com data ANTERIOR ao ajuste: fica registrado, mas não muda o saldo
INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","updatedAt") VALUES ('old1','h1','EXPENSE','Esquecido',5000,'2026-12-15','acc1',now());
SELECT account_balance_on('acc1','2026-12-31',false) = 1000000 AS anterior_nao_muda;
-- Mesmo dia, registrado DEPOIS do ajuste: conta
INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","createdAt","updatedAt") VALUES ('same1','h1','EXPENSE','Padaria',1500,'2026-12-31','acc1','2026-12-31 15:00',now());
UPDATE "Transaction" SET "paidAt" = '2026-12-31 15:00' WHERE id = 'same1';
-- Data posterior: conta
INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","updatedAt") VALUES ('new1','h1','INCOME','Pix recebido',20000,'2027-01-02','acc1',now());
SELECT account_balance_on('acc1','2027-01-31',false) = 1000000 - 1500 + 20000 AS posteriores_contam;
SELECT b."balanceCents" = account_balance_on('acc1','infinity',false) AS view_usa_a_regra FROM account_balances b WHERE b."accountId" = 'acc1';
-- Pendente criado ANTES do ajuste e confirmado DEPOIS (mesmo dia) conta no saldo
INSERT INTO "Transaction"(id,"householdId",type,status,description,"amountCents",date,"accountId","createdAt","updatedAt") VALUES ('pend1','h1','EXPENSE','PENDING','Conta de água',8000,'2026-12-31','acc1','2026-12-30 08:00',now());
-- (inclui também a conta de luz t5, pendente desde 28/11: pendente nunca fica congelada pelo ajuste)
SELECT account_balance_on('acc1','2026-12-31',true) = 1000000 - 1500 - 8000 - 20000 AS pendente_conta_no_previsto;
UPDATE "Transaction" SET status = 'PAID' WHERE id = 'pend1';
UPDATE "Transaction" SET "paidAt" = '2026-12-31 16:00' WHERE id = 'pend1';
SELECT account_balance_on('acc1','2026-12-31',false) = 1000000 - 1500 - 8000 AS pendente_confirmado_depois_conta;
DELETE FROM "Transaction" WHERE id = 'pend1';
-- Saldo numa data antes do ajuste continua calculado pelo histórico
SELECT account_balance_on('acc1','2026-11-30',false) AS corrente_em_30_11;
-- Excluir o ajuste (apaga o marco) faz o saldo voltar a considerar tudo
SAVEPOINT antes_excluir;
DELETE FROM "Transaction" WHERE id = 'adj1';
SELECT NOT EXISTS (SELECT 1 FROM "BalanceCheckpoint" WHERE id = 'cp1') AS marco_removido_junto;
ROLLBACK TO SAVEPOINT antes_excluir;

SELECT pg_temp.expect_fail('ajuste com categoria', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"accountId","categoryId","updatedAt") VALUES ('x','h1','ADJUSTMENT_IN','x',1,'2026-12-01','acc1','cExp',now())$q$);
SELECT pg_temp.expect_fail('ajuste pendente', $q$INSERT INTO "Transaction"(id,"householdId",type,status,description,"amountCents",date,"accountId","updatedAt") VALUES ('x','h1','ADJUSTMENT_IN','PENDING','x',1,'2026-12-01','acc1',now())$q$);
SELECT pg_temp.expect_fail('ajuste no cartão', $q$INSERT INTO "Transaction"(id,"householdId",type,description,"amountCents",date,"creditCardId","invoiceId","updatedAt") VALUES ('x','h1','ADJUSTMENT_OUT','x',1,'2026-12-01','cc1','inv1',now())$q$);
SELECT pg_temp.expect_fail('marco ligado a lançamento de outra conta', $q$INSERT INTO "BalanceCheckpoint"(id,"accountId",date,"balanceCents","transactionId") VALUES ('x','acc2','2026-12-31',0,'adj1')$q$);

SELECT a.name, b."balanceCents", b."projectedBalanceCents" FROM account_balances b JOIN "Account" a ON a.id=b."accountId" ORDER BY 1;
SELECT "invoiceId","totalCents","projectedTotalCents","paidCents" FROM invoice_totals;
SELECT "loanId","principalOutstandingCents","totalPaidCents","interestPaidCents","pendingInstallments","nextDueDate" FROM loan_balances WHERE "loanId" = 'loan1';
ROLLBACK;
