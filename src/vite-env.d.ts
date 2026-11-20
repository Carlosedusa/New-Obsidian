/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Client ID do app registrado no Microsoft Entra (opcional; também pode ser digitado no app). */
  readonly VITE_MS_CLIENT_ID?: string;
}
