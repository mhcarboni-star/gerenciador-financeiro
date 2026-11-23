import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useHousehold } from "../household";
import { PENDING_INVITE_KEY } from "../pages/InvitePage";
import { useAuth } from "../auth";

const links = [
  { to: "/", label: "Resumo", icon: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
  { to: "/lancamentos", label: "Lançamentos", icon: "M4 6h16M4 12h16M4 18h10" },
  { to: "/planejamento", label: "Planejar", icon: "M4 5h16v15H4zM4 9h16M9 3v4M15 3v4M8 13h3M8 16h6" },
  { to: "/contas", label: "Contas", icon: "M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2" },
  { to: "/emprestimos", label: "Empréstimos", icon: "M4 10h16M6 10V7l6-3 6 3v3M6 10v8M10 10v8M14 10v8M18 10v8M4 20h16" },
  { to: "/avisos", desktopOnly: true, label: "Avisos", icon: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" },
  { to: "/familia", desktopOnly: true, label: "Família", icon: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15.5c.6-.3 1.3-.5 2-.5 3 0 6 2 6 5" },
  { to: "/categorias", desktopOnly: true, label: "Categorias", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { info } = useHousehold();
  const navigate = useNavigate();
  // Voltando do cadastro/login aberto por um convite: segue para aceitar
  useEffect(() => {
    try {
      const t = sessionStorage.getItem(PENDING_INVITE_KEY);
      if (t) {
        sessionStorage.removeItem(PENDING_INVITE_KEY);
        navigate(`/convite/${t}`);
      }
    } catch {
      /* ignore */
    }
  }, [navigate]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>Finanças</span>
        </div>
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end className={`nav-link ${"desktopOnly" in l ? "desktop-only" : ""}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={l.icon} />
              </svg>
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="user">
          <span className="muted small">{user?.name}</span>
          {info && <NavLink to="/familia" className="small group-name">{info.name}{info.members.length > 1 ? ` · ${info.members.length} pessoas` : ""}</NavLink>}
          <button className="link" onClick={logout}>
            Sair
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
