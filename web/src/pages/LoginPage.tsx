import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";

export function LoginPage({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isRegister) await register(name, email, password);
      else await login(email, password);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="card auth-card form" onSubmit={submit}>
        <div className="brand">
          <img src="/icon.svg" alt="" width={36} height={36} />
          <span>Gerenciador Financeiro</span>
        </div>
        <h1>{isRegister ? "Criar conta" : "Entrar"}</h1>
        {isRegister && (
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </label>
        )}
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={isRegister ? 8 : undefined}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? "Aguarde…" : isRegister ? "Criar conta" : "Entrar"}
        </button>
        <p className="muted small center-text">
          {isRegister ? (
            <>
              Já tem conta? <Link to="/entrar">Entrar</Link>
            </>
          ) : (
            <>
              Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
