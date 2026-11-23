import { useCallback, useEffect, useState } from "react";
import { api, type AlertsInfo } from "../api";
import { currentSubscription, deviceName, isIOS, pushSupport, subscribe } from "../push";

const HOURS = Array.from({ length: 17 }, (_, i) => i + 5); // 5h a 21h

export function AlertsPage() {
  const [info, setInfo] = useState<AlertsInfo | null>(null);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const support = pushSupport();

  const load = useCallback(() => {
    api.alerts().then(setInfo).catch((e) => setError(e.message));
    currentSubscription().then((s) => setThisEndpoint(s?.endpoint ?? null)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const thisDeviceOn = !!info && !!thisEndpoint && info.devices.some((d) => d.endpoint === thisEndpoint);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await fn();
      if (ok) setMsg(ok);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    if (!info?.publicKey) return;
    await run(async () => {
      const sub = await subscribe(info.publicKey!);
      await api.subscribePush(sub);
      await api.testAlert().catch(() => {});
    }, "Avisos ativados neste aparelho. Enviamos uma notificação de teste.");
  }

  async function disable() {
    await run(async () => {
      const sub = await currentSubscription();
      if (sub) {
        await api.unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
    }, "Avisos desativados neste aparelho.");
  }

  async function save(patch: Partial<AlertsInfo["settings"]> & { notifyThisHousehold?: boolean }) {
    if (!info) return;
    const next = { ...info.settings, notifyThisHousehold: info.notifyThisHousehold, ...patch };
    setInfo({ ...info, settings: { ...info.settings, ...patch }, notifyThisHousehold: next.notifyThisHousehold });
    await run(() => api.saveAlertSettings(next));
  }

  if (!info) return <p className="muted">{error || "Carregando…"}</p>;
  const s = info.settings;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Avisos no celular</h1>
          <span className="muted small">Contas do dia e atrasadas, uma vez por dia</span>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {msg && <p className="info ok">{msg}</p>}

      <section className="card">
        <h2>Este aparelho</h2>
        {!info.enabled ? (
          <p className="info warn">Os avisos ainda não foram configurados no servidor.</p>
        ) : support === "ios-install" ? (
          <div className="ios-steps">
            <p>No iPhone, os avisos só funcionam com o app <strong>instalado na tela inicial</strong> (iOS 16.4 ou mais novo):</p>
            <ol>
              <li>No Safari, toque em <strong>Compartilhar</strong> (quadrado com seta para cima).</li>
              <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
              <li>Abra o app pelo ícone novo e volte aqui em <strong>Avisos</strong>.</li>
            </ol>
          </div>
        ) : support === "unsupported" ? (
          <p className="info warn">
            Este navegador não aceita notificações. {isIOS() ? "Atualize o iPhone para o iOS 16.4 ou mais novo." : "No Android, use o Chrome."}
          </p>
        ) : thisDeviceOn ? (
          <div className="alert-state on">
            <span>✓ Avisos <strong>ativados</strong> neste aparelho</span>
            <div className="actions">
              <button className="btn ghost" disabled={busy} onClick={() => run(() => api.testAlert(), "Notificação de teste enviada.")}>Enviar teste</button>
              <button className="btn danger-ghost" disabled={busy} onClick={disable}>Desativar</button>
            </div>
          </div>
        ) : (
          <div className="alert-state">
            <span>Receba aqui, todo dia, as contas que vencem e as atrasadas.</span>
            <button className="btn primary" disabled={busy} onClick={enable}>{busy ? "Ativando…" : "Ativar avisos"}</button>
          </div>
        )}
      </section>

      <section className="card spaced">
        <h2>Preferências</h2>
        <div className="form">
          <label className="check">
            <input type="checkbox" checked={s.dueItemsEnabled} onChange={(e) => save({ dueItemsEnabled: e.target.checked })} />
            <span>
              Aviso diário das contas
              <span className="hint block">Chega só nos dias com contas ou recebimentos previstos.</span>
            </span>
          </label>
          <label>
            Horário do aviso
            <select value={s.sendHour} onChange={(e) => save({ sendHour: Number(e.target.value) })} disabled={!s.dueItemsEnabled}>
              {HOURS.map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
            <span className="hint">Pode chegar alguns minutos depois do horário.</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={s.includeOverdue} onChange={(e) => save({ includeOverdue: e.target.checked })} disabled={!s.dueItemsEnabled} />
            <span>Incluir contas atrasadas</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={info.notifyThisHousehold} onChange={(e) => save({ notifyThisHousehold: e.target.checked })} disabled={!s.dueItemsEnabled} />
            <span>
              Avisar sobre este grupo
              <span className="hint block">Inclui as contas no seu nome e as da Família (conjunto).</span>
            </span>
          </label>
        </div>
      </section>

      {info.devices.length > 0 && (
        <section className="card spaced">
          <h2>Aparelhos que recebem</h2>
          <ul className="tx-list">
            {info.devices.map((d) => (
              <li key={d.id} className="member-row">
                <span className="tx-main">
                  <span className="tx-desc">
                    <span className="tx-text">{deviceName(d.userAgent)}</span>
                    {d.endpoint === thisEndpoint && <span className="badge">este</span>}
                  </span>
                  <span className="muted small">
                    desde {new Date(d.createdAt).toLocaleDateString("pt-BR")}
                    {d.lastSuccessAt ? ` · último aviso ${new Date(d.lastSuccessAt).toLocaleDateString("pt-BR")}` : ""}
                  </span>
                </span>
                <button className="btn danger-ghost" disabled={busy} onClick={() => run(() => api.removeDevice(d.id))}>Remover</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
