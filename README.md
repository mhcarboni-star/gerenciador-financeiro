# Gerenciador Financeiro

Aplicação web para controle financeiro pessoal. Funciona no celular e no PC com os mesmos dados, e pode ser instalada na tela inicial do celular como um app (PWA).

## Funcionalidades

- Cadastro e login com e-mail e senha
- **Grupo familiar:** convite por link, responsável em cada lançamento, visões **Eu** e **Família** (entradas e saídas de todos, quanto cada um pode gastar)
- Lançamentos de receitas e despesas, com categoria, data e observações
- **Planejamento do mês:** quanto posso gastar (receitas − compromissos − quanto quero guardar), quanto resta e quanto por dia, com limites por categoria
- Resumo do mês: receitas, despesas, saldo do mês e saldo acumulado
- Gráfico de despesas por categoria
- Filtro e busca de lançamentos, navegação entre meses
- **Avisos no celular** das contas do dia e atrasadas, no horário escolhido
- **Ajuste de saldo** para bater com o extrato; lançamentos com data anterior ao ajuste ficam só registrados
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

### No ar

Produção: Render (região Virginia) + Supabase (us-east-1). Cada envio para a `main` publica automaticamente; as migrações rodam na inicialização.

### Banco no Supabase

Siga o passo a passo em [docs/banco-de-dados.md → Configurando o Supabase](docs/banco-de-dados.md#configurando-o-supabase).

### Servidor no Render (gratuito)

O arquivo `render.yaml` descreve o serviço (região Virginia, a mesma do banco). No [Render](https://render.com), vá em **New → Blueprint**, selecione este repositório e preencha `DATABASE_URL` e `DIRECT_URL` com os dados do Supabase. O `JWT_SECRET` é gerado automaticamente. Depois, abra o endereço gerado no celular e use "Adicionar à tela inicial".

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
| GET | `/api/accounts/:id/saldo?data=` | Saldo da conta numa data |
| POST | `/api/accounts/:id/ajustar-saldo` | Ajusta o saldo (lança a diferença e cria o marco) |
| GET/POST/PUT/DELETE | `/api/cards[/:id]` | Cartões com limite e fatura atual |
| GET | `/api/invoices/card/:cardId`, `/api/invoices/:id` | Faturas de um cartão / detalhe |
| POST | `/api/invoices/:id/pagar` | Paga a fatura (total ou parcial) |
| GET | `/api/plan?month=YYYY-MM&escopo=eu\|familia` | Planejamento: disponível, compromissos, resta, limites, quebra por pessoa |
| PUT | `/api/plan/:month`, `/api/plan/:month/orcamentos` | Meta de guardar / limites por categoria |
| POST | `/api/plan/:month/copiar-anterior` | Copia limites e meta do mês anterior |
| GET/PUT | `/api/household` | Grupo ativo: membros e convites / renomear |
| POST/DELETE | `/api/household/convites[/:id]` | Gera / cancela convite (link) |
| DELETE | `/api/household/membros/:userId` · POST `/api/household/sair` | Remove membro / sair do grupo |
| GET · POST | `/api/convites/:token` · `/api/convites/:token/aceitar` | Dados do convite / aceitar |
| GET · PUT | `/api/avisos` · `/api/avisos/preferencias` | Avisos: configuração e aparelhos / preferências |
| POST/DELETE | `/api/avisos/inscricoes` · POST `/api/avisos/teste` | Inscreve/remove aparelho / envia teste |
| POST | `/api/jobs/hourly` (cabeçalho `X-Job-Secret`) | Tarefa de hora em hora: recorrências e avisos |
| GET/POST/PUT/DELETE | `/api/categories[/:id]` | Categorias |
| GET/POST/PUT/DELETE | `/api/loans[/:id]` | Empréstimos (cadastro gera parcelas e entrada do dinheiro) |
| POST | `/api/loans/:id/pagamentos` | Pagamento avulso / antecipação (recalcula as parcelas) |
| POST/DELETE | `/api/loans/pagamentos/:txId[/confirmar]` | Confirma parcela prevista / desfaz pagamento |
| GET | `/api/loans/relatorio.pdf` | Relatório de empréstimos em PDF |

## Próximos passos sugeridos

O banco já suporta os itens abaixo; faltam as telas e rotas da API:

- Metas de economia (objetivos de longo prazo)

Depois:

- Gráfico de evolução mensal
- Exportar/importar CSV e extrato bancário (OFX)
