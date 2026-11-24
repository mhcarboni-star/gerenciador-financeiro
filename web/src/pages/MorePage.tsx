import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { useHousehold } from "../household";

const items = [
  { to: "/emprestimos", icon: "🏦", title: "Empréstimos", desc: "Saldo devedor, parcelas e relatório em PDF" },
  { to: "/categorias", icon: "🏷️", title: "Categorias", desc: "Criar, editar, subcategorias e restaurar excluídas" },
  { to: "/recorrencias", icon: "🔁", title: "Recorrentes", desc: "Contas fixas, salário e assinaturas" },
  { to: "/familia", icon: "👨‍👩‍👧", title: "Família", desc: "Membros, convites e grupos" },
  { to: "/avisos", icon: "🔔", title: "Avisos no celular", desc: "Contas do dia: horário e aparelhos" },
];

/** No celular, reúne o que não cabe na barra inferior. */
export function MorePage() {
  const { user, logout } = useAuth();
  const { info } = useHousehold();
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Mais</h1>
          <span className="muted small">
            {user?.name}
            {info ? ` · ${info.name}` : ""}
          </span>
        </div>
      </header>
      <ul className="more-list">
        {items.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="card more-item">
              <span className="more-icon" aria-hidden="true">{i.icon}</span>
              <span className="tx-main">
                <strong>{i.title}</strong>
                <span className="muted small">{i.desc}</span>
              </span>
              <span className="muted" aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="center-text">
        <button className="link danger-link" onClick={() => confirm("Sair da sua conta neste aparelho?") && logout()}>
          Sair da conta
        </button>
      </p>
    </>
  );
}
