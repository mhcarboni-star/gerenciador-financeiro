import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export const PENDING_INVITE_KEY = "gf_invite";

/** Aceitar convite: funciona deslogado (cria conta/entra e volta) e logado. */
export function InvitePage() {
  const { token = "" } = useParams();
  const { user, switchHousehold } = useAuth();
  const [info, setInfo] = useState<{ householdName: string; invitedBy: string; email: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.inviteInfo(token).then(setInfo).catch((e) => setError(e.message));
  }, [token]);

  const remember = () => {
    try {
      sessionStorage.setItem(PENDING_INVITE_KEY, token);
    } catch {
      /* sem sessionStorage: a pessoa abre o link de novo depois de entrar */
    }
  };

  async function accept() {
    setBusy(true);
    try {
      const r = await api.acceptInvite(token);
      switchHousehold(r.householdId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="card auth-card form">
        <div className="brand">
          <img src="/icon.svg" alt="" width={36} height={36} />
          <span>Gerenciador Financeiro</span>
        </div>
        {error ? (
          <>
            <h1>Convite</h1>
            <p className="error">{error}</p>
            <Link to="/">Ir para o app</Link>
          </>
        ) : !info ? (
          <p className="muted">Carregando…</p>
        ) : (
          <>
            <h1>Você foi convidado</h1>
            <p>
              <strong>{info.invitedBy}</strong> convidou você para o grupo <strong>{info.householdName}</strong>. No grupo, vocês veem juntos as entradas, as saídas e quanto a família pode gastar.
            </p>
            {user ? (
              <button className="btn primary block" disabled={busy} onClick={accept}>
                {busy ? "Entrando…" : `Entrar no grupo ${info.householdName}`}
              </button>
            ) : (
              <>
                <Link to="/cadastro" className="btn primary block center-text" onClick={remember}>Criar minha conta</Link>
                <Link to="/entrar" className="btn ghost block center-text" onClick={remember}>Já tenho conta</Link>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
