import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { AccountsPage } from "./pages/AccountsPage";

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">Carregando…</div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/entrar" element={<LoginPage mode="login" />} />
        <Route path="/cadastro" element={<LoginPage mode="register" />} />
        <Route path="*" element={<Navigate to="/entrar" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/lancamentos" element={<TransactionsPage />} />
        <Route path="/contas" element={<AccountsPage />} />
        <Route path="/categorias" element={<CategoriesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
