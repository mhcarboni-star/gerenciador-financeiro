# Gerenciador Financeiro

Aplicação web para controle financeiro pessoal. Funciona no celular e no PC com os mesmos dados, e pode ser instalada na tela inicial do celular como um app (PWA).

## Funcionalidades

- Cadastro e login com e-mail e senha
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
| Banco    | PostgreSQL via Prisma                              |

Valores monetários são guardados em centavos (inteiros) para evitar erros de arredondamento.

```
api/   → API REST (Express + Prisma); em produção também entrega o frontend
web/   → aplicação React
```

## Rodando localmente

Pré-requisitos: Node.js 20+ e PostgreSQL.

```bash
npm install
cp api/.env.example api/.env   # ajuste DATABASE_URL e JWT_SECRET
npm run db:migrate             # cria as tabelas
npm run dev                    # API em :3333 e site em :5173
```

Abra http://localhost:5173. Para testar no celular na mesma rede Wi-Fi, use o endereço `Network` que o Vite mostra no terminal.

## Produção

```bash
npm run build
npm start      # aplica migrações e sobe tudo na porta $PORT
```

Variáveis de ambiente: `DATABASE_URL`, `JWT_SECRET` (valor longo e aleatório) e, opcionalmente, `PORT`.

### Deploy no Render (gratuito)

O arquivo `render.yaml` já descreve o serviço web e o banco PostgreSQL. No [Render](https://render.com), vá em **New → Blueprint**, selecione este repositório e confirme. Depois, abra o endereço gerado no celular e use "Adicionar à tela inicial".

> No plano gratuito do Render o serviço "dorme" após inatividade (o primeiro acesso demora alguns segundos) e o banco gratuito expira depois de um período. Veja os limites atuais no site do Render antes de guardar dados importantes.

## API

Todas as rotas (exceto `/api/auth/register` e `/api/auth/login`) exigem `Authorization: Bearer <token>`.

| Método | Rota                           | Descrição                         |
| ------ | ------------------------------ | --------------------------------- |
| POST   | `/api/auth/register`           | Cria conta                        |
| POST   | `/api/auth/login`              | Login                             |
| GET    | `/api/auth/me`                 | Usuário atual                     |
| GET    | `/api/summary?month=YYYY-MM`   | Resumo do mês                     |
| GET    | `/api/transactions?month=...`  | Lançamentos do mês                |
| POST/PUT/DELETE | `/api/transactions[/:id]` | Cria, edita, exclui lançamento |
| GET/POST/PUT/DELETE | `/api/categories[/:id]` | Categorias                  |

## Próximos passos sugeridos

- Lançamentos recorrentes (aluguel, assinaturas) e parcelados
- Contas e cartões de crédito separados
- Orçamento mensal por categoria com alertas
- Gráfico de evolução mensal
- Exportar/importar CSV e extrato bancário (OFX)
