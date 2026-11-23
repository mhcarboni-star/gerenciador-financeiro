# Gerenciador Financeiro

Aplicação web para controle financeiro pessoal. Funciona no celular e no PC com os mesmos dados, e pode ser instalada na tela inicial do celular como um app (PWA).

## Funcionalidades

- Cadastro e login com e-mail e senha
- Uso individual ou compartilhado (grupo familiar)
- Lançamentos de receitas e despesas, com categoria, data e observações
- Resumo do mês: receitas, despesas, saldo do mês e saldo acumulado
- Gráfico de despesas por categoria
- Filtro e busca de lançamentos, navegação entre meses
- Categorias personalizáveis (já vem com um conjunto padrão)
- Tema claro e escuro automático

## Tecnologias

| Parte    | Stack                                              |
| -------- | -------------------------------------------------- |
| Frontend | React 18, TypeScript, Vite, React Router, PWA      |
| Backend  | Node.js, Express 5, TypeScript, Zod, JWT           |
| Banco    | PostgreSQL (Supabase) via Prisma                   |

Valores monetários são guardados em centavos (inteiros) para evitar erros de arredondamento.

```
api/   → API REST (Express + Prisma); em produção também entrega o frontend
web/   → aplicação React
docs/  → documentação (estrutura do banco em docs/banco-de-dados.md)
```

A estrutura do banco (grupos compartilhados, contas, cartões e faturas, parcelas, recorrências, orçamentos e metas) está descrita em [docs/banco-de-dados.md](docs/banco-de-dados.md).

## Rodando localmente

Pré-requisitos: Node.js 20+ e PostgreSQL.

```bash
npm install
cp api/.env.example api/.env   # ajuste DATABASE_URL, DIRECT_URL e JWT_SECRET
npm run db:migrate             # cria as tabelas
npm run dev                    # API em :3333 e site em :5173
```

Abra http://localhost:5173. Para testar no celular na mesma rede Wi-Fi, use o endereço `Network` que o Vite mostra no terminal.

## Produção

```bash
npm run build
npm start      # aplica migrações e sobe tudo na porta $PORT
```

Variáveis de ambiente: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` (valor longo e aleatório) e, opcionalmente, `PORT`.

### Banco no Supabase

Siga o passo a passo em [docs/banco-de-dados.md → Configurando o Supabase](docs/banco-de-dados.md#configurando-o-supabase).

### Servidor no Render (gratuito)

O arquivo `render.yaml` descreve o serviço. No [Render](https://render.com), vá em **New → Blueprint**, selecione este repositório e preencha `DATABASE_URL` e `DIRECT_URL` com os dados do Supabase. Depois, abra o endereço gerado no celular e use "Adicionar à tela inicial".

> No plano gratuito do Render o serviço "dorme" após inatividade (o primeiro acesso demora alguns segundos).

## API

Todas as rotas (exceto `/api/auth/register` e `/api/auth/login`) exigem `Authorization: Bearer <token>`.

| Método | Rota | Descrição |
| ------ | ---- | --------- |
| POST | `/api/auth/register`, `/api/auth/login` | Cria conta / login |
| GET | `/api/auth/me` | Usuário atual |
| GET | `/api/summary?month=YYYY-MM` | Resumo do mês |
| GET/POST/PUT/DELETE | `/api/transactions[/:id]` | Lançamentos do mês (receitas/despesas em conta ou cartão) |
| GET | `/api/transactions/pendentes` | Para confirmar: atrasados, hoje e próximos 7 dias |
| POST | `/api/transactions/:id/confirmar` | Confirma um previsto (corrige valor/data; `updateForecast` opcional) |
| POST/PUT | `/api/transactions/transferencia[/:id]` | Transferência entre contas |
| POST/DELETE | `/api/installments[/:id]` | Compra parcelada (cria/exclui todas as parcelas) |
| GET/POST/PUT | `/api/recurrences[/:id]` | Lançamentos recorrentes |
| POST | `/api/recurrences/:id/encerrar` | Encerra uma recorrência |
| GET/POST/PUT/DELETE | `/api/accounts[/:id]` | Contas com saldo atual e previsto |
| GET/POST/PUT/DELETE | `/api/cards[/:id]` | Cartões com limite e fatura atual |
| GET | `/api/invoices/card/:cardId`, `/api/invoices/:id` | Faturas de um cartão / detalhe |
| POST | `/api/invoices/:id/pagar` | Paga a fatura (total ou parcial) |
| GET/POST/PUT/DELETE | `/api/categories[/:id]` | Categorias |
| GET | `/api/loans`, `/api/loans/relatorio.pdf` | Empréstimos e relatório em PDF |

## Próximos passos sugeridos

O banco já suporta os itens abaixo; faltam as telas e rotas da API:

- Orçamento mensal por categoria e metas de economia
- Convites para o grupo familiar

Depois:

- Gráfico de evolução mensal
- Exportar/importar CSV e extrato bancário (OFX)
