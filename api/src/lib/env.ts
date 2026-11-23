// Carrega api/.env em desenvolvimento (em produção as variáveis vêm do host).
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // sem .env: segue com as variáveis do ambiente
}
