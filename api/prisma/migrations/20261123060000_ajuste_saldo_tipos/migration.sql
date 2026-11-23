-- Tipos do ajuste de saldo (separado: valores novos de enum só podem ser usados após o commit)
ALTER TYPE "TransactionType" ADD VALUE 'ADJUSTMENT_IN';
ALTER TYPE "TransactionType" ADD VALUE 'ADJUSTMENT_OUT';
