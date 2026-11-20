# Cérebro Digital

PWA offline-first para notas em **Markdown (.md)**. As notas se conectam por `[[links]]`, `#tags` e similaridade de termos, e aparecem num **grafo interativo em formato de cérebro**. O app é instalável na Tela de Início do iPhone e do iPad.

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
    seed.ts          "cérebro" de exemplo (PSM, lingotamento, manutenção)
  storage/
    storage.ts       interface VaultStorage + IndexedDB (fallback em memória)
    markdownFiles.ts importar .md, exportar .md e .zip do cofre, folha de compartilhamento do iOS
  state/vault.tsx    contexto do cofre: CRUD, gravação com debounce, análise derivada
  hooks/             layout (phone/tablet/wide), teclado iOS (visualViewport), tema
  components/
    BrainGraph.tsx   grafo em <canvas> + d3-force, gestos de toque, impulsos
    BrainPane.tsx    busca, filtro por tag, zoom, legenda, pré-visualização do nó
    EditorMarkdown   textarea, barra de formatação, autocompletar de [[links]]
    ViewerMarkdown   leitor (marked + DOMPurify), links e checklists clicáveis
    NoteList, NoteView, SettingsSheet, icons
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
- **Silhueta de "cérebro"**: gravidade elíptica (`forceY` mais forte que `forceX`) e cor por tag dominante.
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
