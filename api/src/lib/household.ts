import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

const DEFAULT_CATEGORIES: {
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string;
  children?: string[];
}[] = [
  { name: "Salário", type: "INCOME", color: "#16a34a" },
  { name: "Renda extra", type: "INCOME", color: "#0d9488", children: ["Freelance", "Vendas"] },
  { name: "Rendimentos", type: "INCOME", color: "#0891b2" },
  { name: "Outras receitas", type: "INCOME", color: "#64748b" },
  { name: "Moradia", type: "EXPENSE", color: "#7c3aed", children: ["Aluguel", "Condomínio", "Energia", "Água", "Internet"] },
  { name: "Alimentação", type: "EXPENSE", color: "#ea580c", children: ["Mercado", "Restaurante", "Delivery"] },
  { name: "Transporte", type: "EXPENSE", color: "#2563eb", children: ["Combustível", "Aplicativo", "Transporte público"] },
  { name: "Saúde", type: "EXPENSE", color: "#dc2626", children: ["Plano de saúde", "Farmácia"] },
  { name: "Educação", type: "EXPENSE", color: "#ca8a04" },
  { name: "Lazer", type: "EXPENSE", color: "#db2777" },
  { name: "Assinaturas", type: "EXPENSE", color: "#9333ea" },
  { name: "Compras", type: "EXPENSE", color: "#0284c7" },
  { name: "Outras despesas", type: "EXPENSE", color: "#64748b" },
];

/** Cria o grupo inicial de um novo usuário, com categorias padrão e uma carteira. */
export async function createHouseholdForUser(tx: Tx, userId: string, userName: string) {
  const household = await tx.household.create({
    data: {
      name: `Finanças de ${userName.split(" ")[0]}`,
      members: { create: { userId, role: "OWNER" } },
      accounts: { create: { name: "Carteira", type: "CASH", color: "#16a34a" } },
    },
  });
  for (const c of DEFAULT_CATEGORIES) {
    const parent = await tx.category.create({
      data: { householdId: household.id, name: c.name, type: c.type, color: c.color },
    });
    if (c.children?.length) {
      await tx.category.createMany({
        data: c.children.map((name) => ({
          householdId: household.id,
          parentId: parent.id,
          name,
          type: c.type,
          color: c.color,
        })),
      });
    }
  }
  return household;
}
