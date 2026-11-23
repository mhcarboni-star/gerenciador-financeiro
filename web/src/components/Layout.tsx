import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";

const links = [
  { to: "/", label: "Resumo", icon: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
  { to: "/lancamentos", label: "Lançamentos", icon: "M4 6h16M4 12h16M4 18h10" },
  { to: "/contas", label: "Contas", icon: "M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2" },
  { to: "/emprestimos", label: "Empréstimos", icon: "M4 10h16M6 10V7l6-3 6 3v3M6 10v8M10 10v8M14 10v8M18 10v8M4 20h16" },
  { to: "/categorias", label: "Categorias", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
];

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>Finanças</span>
        </div>
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end className="nav-link">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={l.icon} />
              </svg>
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="user">
          <span className="muted small">{user?.name}</span>
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
