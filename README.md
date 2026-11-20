# Cérebro Digital

PWA offline-first para notas em **Markdown (.md)**. As notas se conectam por `[[links]]`, `#tags` e similaridade de termos, e aparecem num **grafo interativo em formato de cérebro**. O app é instalável na Tela de Início do iPhone e do iPad.

## Pastas (estilo PARA)

As notas vivem numa árvore de pastas e subpastas, com esta estrutura padrão:

```
00 - Current Projects   projetos em andamento
01 - Areas              responsabilidades contínuas (ex.: PSM, Lingotamento Contínuo)
02 - Resources          material de referência (ex.: Análise de Risco)
98 - Archive            itens encerrados
99 - Unsorted           caixa de entrada (padrão de notas sem pasta)
```

- **Barra de ferramentas:** nova nota, nova pasta, ordenar (nome ou mais recentes), recolher tudo, importar e configurações.
- **Menu `⋯` de cada pasta:** nova nota aqui, nova subpasta, importar .md aqui, renomear e apagar. Apagar uma pasta **não apaga as notas**: elas sobem para a pasta-mãe.
- **Mover uma nota:** pelo seletor de pasta logo abaixo do título (no iPhone abre a roleta nativa).
- **Importar uma pasta inteira (computador):** mantém a estrutura de subpastas. A exportação `.zip` também.

## Sincronização com OneDrive

As notas ficam numa pasta comum do seu OneDrive (padrão: `OneDrive › Cérebro Digital`), como arquivos `.md` na mesma árvore de pastas do app. Elas aparecem no Explorador do Windows, e a pasta pode ser aberta como cofre no Obsidian; a pasta `.obsidian` é ignorada.

**Quando sincroniza (automático):** ao abrir o app, ao voltar para ele, ao reconectar à internet, ~6 s depois de cada edição e a cada 3 min com o app aberto. O ícone de nuvem na barra lateral mostra o status, e tocar nele sincroniza na hora.

**Regras:**

| Situação | O que acontece |
|---|---|
| Editou só de um lado | A versão nova vai para o outro lado |
| Editou a mesma nota nos dois lados | **Nada se perde**: a versão local fica no arquivo e a do OneDrive vira a nota "Título (conflito OneDrive dd/mm hh:mm)" |
| Apagou no app | O arquivo vai para a **Lixeira do OneDrive** (recuperável). Se ele tinha sido editado no OneDrive nesse meio-tempo, é restaurado em vez de apagado |
| Apagou no OneDrive | A nota é apagada no app (se tinha edição local não enviada, é reenviada) |
| Renomeou ou moveu (qualquer lado) | É refletido no outro lado |
| Mais da metade dos arquivos sumiu de uma vez | A sincronização **para** e avisa, sem apagar nada |

### Cadastro único no Azure (5 minutos)

O app precisa de um "Client ID" da Microsoft. É gratuito e você faz uma vez só:

1. Acesse https://entra.microsoft.com e entre com sua conta Microsoft. Se a conta pessoal (Outlook/Hotmail) não tiver um diretório, use https://portal.azure.com, que cria um diretório padrão.
2. Vá em **Aplicativos → Registros de aplicativo → Novo registro**.
   - Nome: `Cérebro Digital`
   - Tipos de conta: **Contas em qualquer diretório organizacional e contas Microsoft pessoais**
   - URI de redirecionamento: plataforma **Aplicativo de página única (SPA)**, valor `http://localhost:5173/`
3. Clique em **Registrar** e copie o **ID do aplicativo (cliente)**.
4. Em **Autenticação**, adicione também a URL publicada do app (ex.: `https://seu-app.vercel.app/`). O app mostra a URI exata nas Configurações.
5. Em **Permissões de API**, confira que existe **Microsoft Graph → Files.ReadWrite (delegada)**. Se não existir, adicione-a.
6. No app: **Configurações → Sincronização OneDrive**, ligue a opção, cole o Client ID e toque em **Entrar com a conta Microsoft**.

Para não precisar digitar o Client ID em cada aparelho, crie um arquivo `.env.local` com `VITE_MS_CLIENT_ID=<seu-id>` antes do `npm run build`.

> **Conta corporativa:** muitas empresas bloqueiam o consentimento de apps de terceiros. Para usar o OneDrive corporativo, peça ao TI que aprove o app, ou use a conta pessoal. Confirme também se a política de dados da empresa permite guardar o conteúdo fora dos sistemas oficiais.

## Rodar localmente

```bash
npm install
npm run dev        # http://localhost:5173 (com --host, acessível na rede local)
npm test           # testes do motor de conexões
npm run build      # gera dist/ com service worker e manifest
npm run preview    # serve o build em http://localhost:4173
```

## Instalar no iPhone / iPad

> O iOS só registra o service worker (modo offline) em **HTTPS**. Pelo IP da rede local (`http://192.168…`) o app abre, mas não funciona offline.

1. Publique a pasta `dist/` em qualquer host HTTPS estático (Vercel, Netlify, GitHub Pages). Como o build usa `base: './'`, subpastas também funcionam.
2. No iPhone/iPad, abra a URL no **Safari**.
3. Toque em **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início** → **Adicionar**.
4. Abra uma vez com internet. A partir daí o app funciona 100% offline.

## Estrutura

```
src/
  domain/            regras puras, sem React (testáveis)
    types.ts         Note, ParsedNote, Edge, Graph, Settings
    text.ts          normalização, tokenização, stopwords pt/en, stemming leve
    markdown.ts      frontmatter, [[links]], #tags, texto limpo, checklists
    connections.ts   motor de conexões + análise do cofre
    folders.ts       caminhos de pasta, árvore, renomear/mover, cores por pasta
    seed.ts          "cérebro" de exemplo (PSM, lingotamento, manutenção)
  storage/
    storage.ts       interface VaultStorage + IndexedDB (fallback em memória)
    markdownFiles.ts importar .md, exportar .md e .zip do cofre, folha de compartilhamento do iOS
  state/vault.tsx    contexto do cofre: CRUD, gravação com debounce, análise derivada
  sync/
    engine.ts        motor de sincronização 3 vias (puro, testado com OneDrive simulado)
    graphDrive.ts    cliente Microsoft Graph (listar, baixar, enviar, mover, lixeira)
    msal.ts          login Microsoft (MSAL, PKCE, redirecionamento; carregado sob demanda)
    controller.ts    quando sincronizar, estado persistido, status para a interface
  hooks/             layout (phone/tablet/wide), teclado iOS (visualViewport), tema
  components/
    BrainGraph.tsx   grafo em <canvas> + d3-force, gestos de toque, impulsos
    BrainPane.tsx    busca, filtro por tag, zoom, legenda, pré-visualização do nó
    EditorMarkdown   textarea, barra de formatação, autocompletar de [[links]]
    ViewerMarkdown   leitor (marked + DOMPurify), links e checklists clicáveis
    FileExplorer     árvore de pastas/subpastas (estilo PARA)
    NoteView, SettingsSheet, ActionSheet, icons
```

## Motor de conexões

| Tipo | Como é detectado | Peso na aresta |
|---|---|---|
| Link | `[[Título]]`, `[[Título\|alias]]`, `[[Título#seção]]`, resolvido sem diferenciar acento ou maiúscula (aceita `aliases:` do frontmatter) | `wLink` |
| Tag | `#tag` no texto (fora de código, títulos e URLs) + `tags:` do frontmatter | `wTag · (1 − 0,5ⁿ)` para n tags em comum |
| Similaridade | TF-IDF com título ×3 e tags ×2, similaridade de cosseno via índice invertido, mantendo só os top-K vizinhos por nota | `wSemantic · min(1, cos / 0,45)` |

Os tipos se combinam por "noisy-OR": `w = 1 − Π(1 − wᵢ)`. Um par ligado por link e por termos em comum fica, portanto, mais forte que cada critério isolado. Tudo é configurável em **Configurações**: liga/desliga, pesos, limiar e top-K. Cada aresta guarda o motivo da conexão (tags e termos em comum), que aparece na pré-visualização do nó e na seção "Conexões" da nota.

## Decisões técnicas

- **Canvas + d3-force, sem biblioteca de grafo pronta.** O controle de cada frame fica no app. A simulação avança por `requestAnimationFrame` só enquanto há movimento: assentou, a CPU fica parada (bom para bateria). Brilho com sprites pré-renderizados em vez de `shadowBlur`. DPR limitado a 2. Rótulos com detecção de colisão.
- **Visual futurista**: halos neon somados (`globalCompositeOperation: 'lighter'`), sinapses finas, anel externo nos hubs, órbita giratória e fluxo de dados animado nas conexões do nó selecionado. Painéis HUD com grade de pontos feita em CSS, sem custo para o canvas. Cor por pasta de 1º nível (ou por tag) e opção de mostrar `#tags` como nós-hub, como no Obsidian.
- **Gestos**: Pointer Events com pinça, pan, arrastar nó e toque. Alvo mínimo de 44 pt. `touch-action: none` só no canvas.
- **O Markdown cru é a fonte da verdade.** Título, tags e links são derivados, e o parse é memoizado por nota. A exportação é sem perdas e só adiciona frontmatter quando a nota não tem.
- **Persistência**: IndexedDB atrás da interface `VaultStorage`, pronta para trocar por sincronização ou pastas `.md`. As posições do grafo são salvas e o layout reabre estável.
- **iOS**: `visualViewport` mantém a barra de formatação acima do teclado. Inputs com 16 px (evita zoom), safe areas, `apple-mobile-web-app-*`, gravação ao ir para segundo plano e `navigator.share` para salvar `.md`/`.zip` em Arquivos.
- **Segurança**: o HTML do Markdown passa pelo DOMPurify (notas importadas podem conter HTML).

## Próximos passos sugeridos

- Pasta sincronizada (File System Access no desktop; iCloud via app nativo).
- Embeddings locais (ex.: modelo pequeno em WebGPU) como 4º tipo de conexão.
- Clusters visuais (comunidades Louvain) e renomear nota atualizando os `[[links]]`.

Os ícones são gerados por `npm run icons` (requer Playwright; use `PLAYWRIGHT_PATH` para uma instalação global).
