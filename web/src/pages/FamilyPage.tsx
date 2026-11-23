import { useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useHousehold } from "../household";

const inviteUrl = (token: string) => `${location.origin}/convite/${token}`;

export function FamilyPage() {
  const { user, switchHousehold } = useAuth();
  const { info, reload, myId } = useHousehold();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!info) return <p className="muted">Carregando…</p>;
  const owner = info.myRole === "OWNER";

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function share(url: string) {
    const text = `Entre no nosso grupo "${info!.name}" no Gerenciador Financeiro: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Convite", text, url });
        return;
      } catch {
        /* cancelado: cai para copiar */
      }
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(url);
    setTimeout(() => setCopied(null), 2500);
  }

  function invite(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      const r = await api.createInvite(email);
      setLastLink(inviteUrl(r.token));
      setEmail("");
    });
  }

  return (
    <>
      <header className="page-head">
        <div>
          <span className="muted small">Grupo familiar</span>
          {editingName ? (
            <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); run(() => api.renameHousehold(name)).then(() => setEditingName(false)); }}>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} aria-label="Nome do grupo" />
              <button className="btn primary">OK</button>
            </form>
          ) : (
            <h1>
              {info.name}{" "}
              {owner && (
                <button className="link small" onClick={() => { setName(info.name); setEditingName(true); }}>renomear</button>
              )}
            </h1>
          )}
        </div>
      </header>
      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>Membros</h2>
        <ul className="tx-list">
          {info.members.map((m) => (
            <li key={m.userId} className="member-row">
              <span className="avatar">{m.name.charAt(0).toUpperCase()}</span>
              <span className="tx-main">
                <span className="tx-desc"><span className="tx-text">{m.name}{m.userId === myId ? " (você)" : ""}</span></span>
                <span className="muted small">{m.email} · {m.role === "OWNER" ? "dono" : "membro"}</span>
              </span>
              {owner && m.userId !== myId && (
                <button
                  className="btn danger-ghost"
                  disabled={busy}
                  onClick={() => confirm(`Remover ${m.name} do grupo? Os lançamentos dele continuam, como Família.`) && run(() => api.removeMember(m.userId))}
                >
                  Remover
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {owner && (
        <section className="card spaced">
          <h2>Convidar</h2>
          <p className="muted small">Gere um link e envie pelo WhatsApp ou e-mail. Vale por 7 dias. A pessoa cria a conta (ou entra) e passa a ver as finanças do grupo.</p>
          <form className="invite-form" onSubmit={invite}>
            <input type="email" placeholder="E-mail da pessoa" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="E-mail para convite" />
            <button className="btn primary" disabled={busy}>Gerar convite</button>
          </form>
          {lastLink && (
            <div className="invite-link">
              <code>{lastLink}</code>
              <button className="btn ghost" onClick={() => share(lastLink)}>{copied === lastLink ? "Copiado!" : "Compartilhar"}</button>
            </div>
          )}
          {info.invites.length > 0 && (
            <>
              <h3 className="small muted spaced-sm">Convites pendentes</h3>
              <ul className="tx-list">
                {info.invites.map((i) => (
                  <li key={i.id} className="member-row">
                    <span className="tx-main">
                      <span className="tx-desc"><span className="tx-text">{i.email}</span></span>
                      <span className="muted small">expira em {new Date(i.expiresAt).toLocaleDateString("pt-BR")}</span>
                    </span>
                    <button className="btn ghost" onClick={() => share(inviteUrl(i.token))}>{copied === inviteUrl(i.token) ? "Copiado!" : "Link"}</button>
                    <button className="btn danger-ghost" disabled={busy} onClick={() => run(() => api.cancelInvite(i.id))}>Cancelar</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {(user?.households?.length ?? 0) > 1 && (
        <section className="card spaced">
          <h2>Meus grupos</h2>
          <ul className="tx-list">
            {user!.households!.map((h) => (
              <li key={h.id} className="member-row">
                <span className="tx-main">
                  <span className="tx-desc"><span className="tx-text">{h.name}</span></span>
                  <span className="muted small">{h.role === "OWNER" ? "dono" : "membro"}</span>
                </span>
                {h.id === info.id ? <span className="tag paid">ativo</span> : <button className="btn ghost" onClick={() => switchHousehold(h.id)}>Abrir</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {info.members.length > 1 && (
        <p className="center-text">
          <button
            className="link small danger-link"
            onClick={() =>
              confirm("Sair deste grupo? Você deixa de ver as finanças dele; o que estava no seu nome fica como Família.") &&
              run(async () => {
                await api.leaveHousehold();
                const other = user?.households?.find((h) => h.id !== info.id);
                if (other) switchHousehold(other.id);
              })
            }
          >
            Sair do grupo
          </button>
        </p>
      )}
    </>
  );
}
