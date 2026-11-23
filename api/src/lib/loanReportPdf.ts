import PDFDocument from "pdfkit";
import type { LoanReport } from "./loanReport.js";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
// Intl usa espaço não separável e sinal de menos Unicode; trocamos por caracteres da fonte padrão do PDF.
const money = (c: number | null) => (c === null ? "—" : brl.format(c / 100).replace(/ /g, " ").replace("−", "-"));
const date = (s: string | null) => (s ? s.split("-").reverse().join("/") : "—");
const pct = (r: number | null) => (r === null ? "—" : `${(r * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}% a.m.`);

const INTEREST_LABEL = { NONE: "Sem juros", PRICE: "Parcelas fixas (Tabela Price)", MONTHLY_ON_BALANCE: "Juros mensais sobre o saldo" };
const STATUS_LABEL = { ACTIVE: "Em aberto", PAID_OFF: "Quitado", CANCELLED: "Cancelado" };

/** "5/12" (com plano) ou "2 pagamentos" (pagamentos livres). */
function installmentsLabel(l: LoanReport, short: boolean) {
  if (l.installmentCount) return short ? `${l.paidInstallments}/${l.installmentCount}` : `${l.paidInstallments} pagas de ${l.installmentCount}`;
  const n = l.statement.filter((s) => s.status === "PAID").length;
  return `${n} pagamento${n === 1 ? "" : "s"}`;
}

const C = { text: "#0f172a", muted: "#64748b", line: "#e2e8f0", head: "#f1f5f9", accent: "#0f766e", warn: "#b45309" };
const MARGIN = 40;

interface Col {
  label: string;
  width: number;
  align?: "left" | "right" | "center";
}

/** Gera o PDF e devolve como Buffer. */
export function renderLoanReportPdf(loans: LoanReport[], meta: { householdName: string; generatedAt: Date }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true, info: { Title: "Relatório de empréstimos" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width - MARGIN * 2;
  const bottom = () => doc.page.height - MARGIN - 20;
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };

  function table(cols: Col[], rows: string[][], opts: { muteRows?: boolean[]; boldLast?: boolean } = {}) {
    const rowH = 18;
    const header = () => {
      ensure(rowH * 2);
      const y = doc.y;
      doc.rect(MARGIN, y, W, rowH).fill(C.head);
      let x = MARGIN;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(C.muted);
      for (const c of cols) {
        doc.text(c.label, x + 4, y + 5, { width: c.width - 8, align: c.align ?? "left", lineBreak: false });
        x += c.width;
      }
      doc.y = y + rowH;
    };
    header();
    rows.forEach((r, i) => {
      if (doc.y + rowH > bottom()) {
        doc.addPage();
        header();
      }
      const y = doc.y;
      const last = opts.boldLast && i === rows.length - 1;
      doc.font(last ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor(opts.muteRows?.[i] ? C.muted : C.text);
      let x = MARGIN;
      r.forEach((cell, j) => {
        doc.text(cell, x + 4, y + 5, { width: cols[j].width - 8, height: 10, align: cols[j].align ?? "left", ellipsis: true });
        x += cols[j].width;
      });
      doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + W, y + rowH).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.y = y + rowH;
    });
    doc.x = MARGIN;
  }

  function kv(pairs: [string, string][], columns = 3) {
    const colW = W / columns;
    for (let i = 0; i < pairs.length; i += columns) {
      ensure(30);
      const y = doc.y;
      pairs.slice(i, i + columns).forEach(([k, v], j) => {
        const x = MARGIN + j * colW;
        doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(k.toUpperCase(), x, y, { width: colW - 8 });
        doc.font("Helvetica-Bold").fontSize(10).fillColor(C.text).text(v, x, y + 10, { width: colW - 8 });
      });
      doc.y = y + 30;
    }
    doc.x = MARGIN;
  }

  // ── Cabeçalho ──
  doc.font("Helvetica-Bold").fontSize(18).fillColor(C.text).text("Relatório de empréstimos");
  doc.font("Helvetica").fontSize(9).fillColor(C.muted)
    .text(`${meta.householdName} · emitido em ${meta.generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  doc.moveDown(1.2);

  if (loans.length === 0) {
    doc.font("Helvetica").fontSize(11).fillColor(C.text).text("Nenhum empréstimo cadastrado.");
    doc.end();
    return done;
  }

  // ── Resumo geral ──
  const active = loans.filter((l) => l.status === "ACTIVE");
  const tot = (f: (l: LoanReport) => number, ls = loans) => ls.reduce((s, l) => s + f(l), 0);
  kv([
    ["Empréstimos em aberto", String(active.length)],
    ["Saldo devedor hoje", money(tot((l) => l.balanceTodayCents, active))],
    ["Parcelas a pagar (previsto)", money(tot((l) => l.pendingAmountCents, active))],
    ["Total emprestado", money(tot((l) => l.principalCents))],
    ["Total pago", money(tot((l) => l.totalPaidCents))],
    ["Juros pagos", money(tot((l) => l.interestPaidCents))],
  ]);
  doc.moveDown(0.5);

  doc.font("Helvetica-Bold").fontSize(12).fillColor(C.text).text("Resumo");
  doc.moveDown(0.4);
  const sumCols: Col[] = [
    { label: "Empréstimo", width: W * 0.24 },
    { label: "Situação", width: W * 0.11 },
    { label: "Valor", width: W * 0.13, align: "right" },
    { label: "Pago", width: W * 0.13, align: "right" },
    { label: "Juros pagos", width: W * 0.12, align: "right" },
    { label: "Saldo devedor", width: W * 0.14, align: "right" },
    { label: "Parcelas", width: W * 0.13, align: "center" },
  ];
  const sumRows = loans.map((l) => [
    l.lender ? `${l.name} (${l.lender})` : l.name,
    STATUS_LABEL[l.status],
    money(l.principalCents),
    money(l.totalPaidCents),
    money(l.interestPaidCents),
    money(l.status === "ACTIVE" ? l.balanceTodayCents : 0),
    installmentsLabel(l, true),
  ]);
  sumRows.push([
    "Total", "", money(tot((l) => l.principalCents)), money(tot((l) => l.totalPaidCents)),
    money(tot((l) => l.interestPaidCents)), money(tot((l) => l.balanceTodayCents, active)), "",
  ]);
  table(sumCols, sumRows, { boldLast: true });

  // ── Extrato de cada empréstimo ──
  for (const l of loans) {
    doc.addPage();
    doc.font("Helvetica-Bold").fontSize(14).fillColor(C.text).text(l.name);
    doc.font("Helvetica").fontSize(9).fillColor(l.status === "ACTIVE" ? C.warn : C.accent)
      .text(STATUS_LABEL[l.status] + (l.paidOffAt ? ` em ${date(l.paidOffAt)}` : ""));
    doc.moveDown(0.8);
    kv([
      ["Credor", l.lender ?? "—"],
      ["Tipo de juros", INTEREST_LABEL[l.interestType]],
      ["Taxa", l.interestType === "NONE" ? "—" : pct(l.monthlyRate)],
      ["Valor emprestado", money(l.principalCents)],
      ["Data", date(l.startDate)],
      ["Parcelas", installmentsLabel(l, false)],
      ["Total pago", money(l.totalPaidCents)],
      ["Juros pagos", money(l.interestPaidCents)],
      ["Próximo vencimento", date(l.nextDueDate)],
    ]);
    if (l.status === "ACTIVE") {
      ensure(48);
      const y = doc.y + 4;
      doc.roundedRect(MARGIN, y, W, 40, 6).fill("#fef3c7");
      doc.font("Helvetica").fontSize(8).fillColor(C.warn).text("SALDO DEVEDOR HOJE", MARGIN + 12, y + 8);
      doc.font("Helvetica-Bold").fontSize(14).fillColor(C.text).text(money(l.balanceTodayCents), MARGIN + 12, y + 19);
      doc.font("Helvetica").fontSize(8).fillColor(C.muted).text(
        `Principal ${money(l.principalOutstandingCents)} + juros acumulados ${money(l.accruedInterestCents)}`,
        MARGIN + 200, y + 22, { width: W - 212, align: "right" },
      );
      doc.y = y + 52;
      doc.x = MARGIN;
    }

    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.text).text("Extrato");
    doc.moveDown(0.4);
    if (l.statement.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor(C.muted).text("Nenhum pagamento registrado.");
      continue;
    }
    const cols: Col[] = [
      { label: "Nº", width: W * 0.07, align: "center" },
      { label: "Data", width: W * 0.12 },
      { label: "Situação", width: W * 0.11 },
      { label: "Valor", width: W * 0.15, align: "right" },
      { label: "Juros", width: W * 0.14, align: "right" },
      { label: "Amortização", width: W * 0.16, align: "right" },
      { label: "Saldo após", width: W * 0.25, align: "right" },
    ];
    table(
      cols,
      l.statement.map((s) => [
        s.number === null ? "Avulso" : String(s.number),
        date(s.date),
        s.status === "PAID" ? "Pago" : "Previsto",
        money(s.amountCents),
        money(s.interestCents),
        money(s.principalCents ?? s.amountCents),
        money(s.balanceAfterCents),
      ]),
      { muteRows: l.statement.map((s) => s.status === "PENDING") },
    );
  }

  // ── Rodapé com paginação e aviso ──
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Sem isso o PDFKit cria uma página nova ao escrever abaixo da margem inferior.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN - 6;
    doc.font("Helvetica").fontSize(7).fillColor(C.muted);
    doc.text("Saldo devedor estimado pelo app; confirme o valor de quitação com o credor.", MARGIN, y, { width: W * 0.75, lineBreak: false });
    doc.text(`Página ${i + 1} de ${range.count}`, MARGIN, y, { width: W, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}
