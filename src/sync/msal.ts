import type { AccountInfo, PublicClientApplication } from '@azure/msal-browser';

/** Permissão mínima para ler/gravar arquivos do próprio usuário no OneDrive. */
export const SCOPES = ['Files.ReadWrite'];

export class NeedsLogin extends Error {
  constructor() { super('É preciso entrar na conta Microsoft.'); }
}

let client: Promise<PublicClientApplication> | null = null;
let clientFor = '';

/** URL de retorno do login: a página do app (sem query/hash). Deve estar cadastrada no Azure. */
export function redirectUri(): string {
  return new URL('./', location.href).href;
}

/** Carrega a MSAL sob demanda (não pesa no app para quem não usa sincronização). */
function getClient(clientId: string): Promise<PublicClientApplication> {
  // Guarda a *promessa*: chamadas simultâneas compartilham a mesma inicialização
  // (o retorno do login só pode ser processado uma vez).
  if (!client || clientFor !== clientId) {
    clientFor = clientId;
    client = createClient(clientId).catch((e) => { client = null; throw e; });
  }
  return client;
}

async function createClient(clientId: string): Promise<PublicClientApplication> {
  const msal = await import('@azure/msal-browser');
  const pca = new msal.PublicClientApplication({
    auth: {
      clientId,
      // "common": aceita contas pessoais (outlook/hotmail) e corporativas/escolares
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: redirectUri(),
      postLogoutRedirectUri: redirectUri(),
    },
    // localStorage: o login sobrevive ao fechar o app instalado no iPhone/iPad
    cache: { cacheLocation: 'localStorage' },
  });
  await pca.initialize();
  // Conclui um login por redirecionamento, se estivermos voltando dele.
  const result = await pca.handleRedirectPromise();
  if (result?.account) pca.setActiveAccount(result.account);
  else if (!pca.getActiveAccount()) pca.setActiveAccount(pca.getAllAccounts()[0] ?? null);
  return pca;
}

export async function currentAccount(clientId: string): Promise<AccountInfo | null> {
  return (await getClient(clientId)).getActiveAccount();
}

/** Redirecionamento (e não popup): é o fluxo que funciona no app instalado no iOS. */
export async function signIn(clientId: string): Promise<void> {
  const c = await getClient(clientId);
  await c.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
}

export async function getToken(clientId: string): Promise<string> {
  const c = await getClient(clientId);
  const account = c.getActiveAccount();
  if (!account) throw new NeedsLogin();
  try {
    return (await c.acquireTokenSilent({ scopes: SCOPES, account })).accessToken;
  } catch (e) {
    const { InteractionRequiredAuthError } = await import('@azure/msal-browser');
    if (e instanceof InteractionRequiredAuthError) throw new NeedsLogin();
    throw e;
  }
}

/** Desconecta só este app (não encerra a sessão Microsoft no navegador). */
export async function signOut(clientId: string): Promise<void> {
  const c = await getClient(clientId);
  await c.clearCache();
  c.setActiveAccount(null);
}
