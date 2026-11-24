import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth";
import { App } from "./App";
import "./styles.css";
import { registerSW } from "virtual:pwa-register";

// Atualização automática: o app instalado no celular guarda uma cópia para abrir rápido.
// Ao detectar versão nova, ela é ativada e a página recarrega sozinha.
// Verifica ao abrir, a cada 30 minutos e sempre que o app volta para a frente.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => reg.update().catch(() => {});
    setInterval(check, 30 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  },
  onNeedRefresh() {
    void updateSW(true);
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
