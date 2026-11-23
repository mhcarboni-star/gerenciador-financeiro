import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { hid, type AuthRequest } from "../lib/auth.js";
import { ah } from "../lib/http.js";
import { buildLoanReport } from "../lib/loanReport.js";
import { renderLoanReportPdf } from "../lib/loanReportPdf.js";

export const loansRouter = Router();

/** Empréstimos com situação e extrato (JSON). ?ativos=1 para só os em aberto. */
loansRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    res.json(await buildLoanReport(hid(req), { onlyActive: req.query.ativos === "1" }));
  }),
);

/** Relatório em PDF: resumo de todos os empréstimos + extrato de cada um. */
loansRouter.get(
  "/relatorio.pdf",
  ah(async (req: AuthRequest, res) => {
    const householdId = hid(req);
    const [loans, household] = await Promise.all([
      buildLoanReport(householdId, { onlyActive: req.query.ativos === "1" }),
      prisma.household.findUniqueOrThrow({ where: { id: householdId } }),
    ]);
    const pdf = await renderLoanReportPdf(loans, { householdName: household.name, generatedAt: new Date() });
    const day = new Date().toISOString().slice(0, 10);
    res
      .type("application/pdf")
      .setHeader("Content-Disposition", `attachment; filename="emprestimos-${day}.pdf"`)
      .send(pdf);
  }),
);
