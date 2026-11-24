import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { AccountsPage } from "./pages/AccountsPage";
import { CardPage } from "./pages/CardPage";
import { RecurrencesPage } from "./pages/RecurrencesPage";
import { LoansPage } from "./pages/LoansPage";
import { LoanPage } from "./pages/LoanPage";
import { PlanPage } from "./pages/PlanPage";
import { FamilyPage } from "./pages/FamilyPage";
import { InvitePage } from "./pages/InvitePage";
import { AlertsPage } from "./pages/AlertsPage";
import { MorePage } from "./pages/MorePage";
import { HouseholdProvider } from "./household";

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">Carregando…</div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/convite/:token" element={<InvitePage />} />
        <Route path="/entrar" element={<LoginPage mode="login" />} />
        <Route path="/cadastro" element={<LoginPage mode="register" />} />
        <Route path="*" element={<Navigate to="/entrar" replace />} />
      </Routes>
    );
  }

  return (
    <HouseholdProvider>
    <Routes>
      <Route path="/convite/:token" element={<InvitePage />} />
      <Route element={<Layout />}>
        <Route path="/familia" element={<FamilyPage />} />
        <Route path="/avisos" element={<AlertsPage />} />
        <Route path="/mais" element={<MorePage />} />
        <Route path="/" element={<DashboardPage />} />
        <Route path="/lancamentos" element={<TransactionsPage />} />
        <Route path="/contas" element={<AccountsPage />} />
        <Route path="/cartoes/:id" element={<CardPage />} />
        <Route path="/recorrencias" element={<RecurrencesPage />} />
        <Route path="/planejamento" element={<PlanPage />} />
        <Route path="/emprestimos" element={<LoansPage />} />
        <Route path="/emprestimos/:id" element={<LoanPage />} />
        <Route path="/categorias" element={<CategoriesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </HouseholdProvider>
  );
}
