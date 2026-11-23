-- Novos tipos de lançamento (migração separada: valores novos de enum só podem ser usados após o commit)
ALTER TYPE "TransactionType" ADD VALUE 'LOAN_RECEIPT';
ALTER TYPE "TransactionType" ADD VALUE 'LOAN_PAYMENT';
