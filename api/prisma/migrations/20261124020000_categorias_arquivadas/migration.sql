-- Excluir categoria passa a ser "arquivar" (reversível). O nome só precisa ser único entre as
-- categorias ativas: dá para criar uma nova "Moradia" mesmo com uma antiga arquivada.
DROP INDEX IF EXISTS "Category_unique_name";
CREATE UNIQUE INDEX "Category_unique_name" ON "Category" ("householdId", "type", "parentId", lower("name")) NULLS NOT DISTINCT
  WHERE "archivedAt" IS NULL;
