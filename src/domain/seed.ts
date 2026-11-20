import type { Note } from './types';

/** "Cérebro" de exemplo: PSM + lingotamento contínuo + produtividade. Mistura links, tags e conexões só semânticas. */
const SEED: [string, string][] = [
  ['bem-vindo', `---
title: Bem-vindo ao Cérebro Digital
tags: [guia]
---
# Bem-vindo ao Cérebro Digital

Cada nota é um arquivo **Markdown**. As conexões aparecem sozinhas no **Cérebro**:

1. **Links explícitos**: escreva \`[[Nome da Nota]]\`, ex.: [[PSM — Visão Geral]].
2. **Tags**: use \`#tag\` no texto ou \`tags:\` no frontmatter.
3. **Similaridade**: notas que usam termos parecidos se conectam automaticamente.

- [x] Abrir esta nota
- [ ] Tocar em um neurônio no Cérebro
- [ ] Criar uma nota com um [[link]] novo

> Dica: no iPhone/iPad, use **Compartilhar → Adicionar à Tela de Início** para instalar.
`],
  ['psm', `# PSM — Visão Geral

O **Process Safety Management** (OSHA 29 CFR 1910.119) organiza a gestão de riscos de processo em 14 elementos. #psm #seguranca-de-processo

## Elementos
- Participação dos empregados
- [[Informação de Segurança de Processo]]
- [[Análise de Perigos de Processo (PHA)]]
- Procedimentos operacionais e treinamento
- Contratadas
- [[Revisão de Segurança Pré-Partida (PSSR)]]
- [[Integridade Mecânica]]
- Permissão de trabalho a quente
- [[Gestão de Mudanças (MOC)]]
- [[Investigação de Incidentes]]
- Planejamento e resposta a emergências
- Auditorias de conformidade
- Segredos industriais
`],
  ['psi', `# Informação de Segurança de Processo

Base documental do PSM: perigos dos materiais, tecnologia do processo e dados dos equipamentos. #psm

- Fichas de segurança (FDS) dos produtos
- Fluxogramas, P&IDs e balanços de massa e energia
- Limites seguros de operação (pressão, temperatura, vazão, nível)
- Especificações de vasos, tubulações, válvulas de alívio e intertravamentos

Sem PSI atualizada não existe [[Análise de Perigos de Processo (PHA)]] confiável.
`],
  ['pha', `# Análise de Perigos de Processo (PHA)

Identifica cenários de perigo, causas, consequências e salvaguardas. Deve ser revalidada periodicamente. #psm #analise-de-risco

Técnicas: [[HAZOP]], What-If, checklist, FMEA, [[Bow-Tie]].
Cenários de alta severidade seguem para [[LOPA]].
`],
  ['hazop', `# HAZOP

Estudo de perigos e operabilidade por **nós** do P&ID, aplicando palavras-guia aos parâmetros do processo. #analise-de-risco

| Palavra-guia | Exemplo |
|---|---|
| Nenhum | sem vazão de água de refrigeração |
| Mais | mais pressão no acumulador hidráulico |
| Menos | menos vazão no spray |
| Reverso | fluxo reverso |

Para cada desvio: causa → consequência → salvaguardas → recomendações.
`],
  ['lopa', `# LOPA

Análise de camadas de proteção: estima a frequência do cenário a partir do evento iniciador e da PFD de cada camada independente (IPL). #analise-de-risco #sis

- Frequência mitigada = frequência do iniciador × Π PFD das IPLs
- Compara com o critério de risco tolerável
- Se o gap exigir, define o SIL da função instrumentada de segurança

\`\`\`
f = 1e-1 /ano × 1e-2 (alarme+operador) × 1e-2 (SIF SIL2) = 1e-5 /ano
\`\`\`
`],
  ['bowtie', `# Bow-Tie

Diagrama que liga **ameaças** → barreiras preventivas → **evento topo** → barreiras mitigadoras → **consequências**. Ótimo para comunicar cenários de perigo ao chão de fábrica. #analise-de-risco

Complementa o [[HAZOP]] e ajuda a definir o que vigiar na [[Integridade Mecânica]].
`],
  ['moc', `# Gestão de Mudanças (MOC)

Toda mudança em tecnologia, equipamentos, procedimentos ou organização é avaliada **antes** de ser implementada. #psm

- Base técnica e impacto na segurança
- Atualização da [[Informação de Segurança de Processo]]
- Treinamento dos afetados
- Mudanças temporárias com prazo de retorno
- Fechamento com [[Revisão de Segurança Pré-Partida (PSSR)]]
`],
  ['pssr', `# Revisão de Segurança Pré-Partida (PSSR)

Checklist antes de partir instalação nova ou modificada. #psm

- [ ] Construção conforme projeto
- [ ] Procedimentos de operação e emergência prontos
- [ ] Recomendações da PHA resolvidas
- [ ] Treinamento concluído
`],
  ['mi', `# Integridade Mecânica

Garante que equipamentos críticos estejam aptos ao serviço: inspeção, teste, manutenção e controle de qualidade. #psm #manutencao

- Plano de inspeção baseado em risco (RBI, API 580/581)
- Vasos de pressão e caldeiras conforme NR-13
- Válvulas de alívio, intertravamentos e sistemas de parada
- Tratamento de deficiências antes de voltar a operar

Na aciaria, inclui o circuito de água de refrigeração do [[Molde do Lingotamento]].
`],
  ['incidentes', `# Investigação de Incidentes

Investigar acidentes e quase-acidentes com potencial de evento catastrófico. #psm

Abordagem: equipe multidisciplinar, linha do tempo, causas raiz (árvore de falhas, 5 porquês) e acompanhamento das ações. Ex.: [[Breakout no Lingotamento]].
`],
  ['lc', `# Lingotamento Contínuo

Solidifica o aço líquido em placas, tarugos ou blocos. Fluxo: panela → distribuidor → [[Molde do Lingotamento]] → resfriamento secundário → segmentos → corte. #lingotamento

Principais perigos de processo: [[Breakout no Lingotamento]], contato de água com aço líquido e vazamento da panela.
`],
  ['molde', `# Molde do Lingotamento

Molde de cobre refrigerado a água, com oscilação para evitar colagem da pele solidificada. #lingotamento #manutencao

- Vazão e diferencial de temperatura da água do molde são variáveis críticas
- Desgaste das placas de cobre e conicidade afetam a formação da pele
- Falta de refrigeração do molde é cenário típico para [[HAZOP]]
`],
  ['breakout', `# Breakout no Lingotamento

Ruptura da pele solidificada abaixo do molde e vazamento de aço líquido. Risco de explosão por contato do aço com água e de danos graves aos segmentos. #lingotamento #seguranca-de-processo

Salvaguardas: sistema de previsão de breakout por termopares no molde, controle de velocidade, lubrificação do molde e intertravamentos.
`],
  ['rolos', `# Rolos dos Segmentos

Os rolos sustentam e guiam a placa durante a solidificação. Falhas de rolamento e desalinhamento geram trincas e abaulamento. #manutencao

Monitorar temperatura e vibração dos mancais, folgas, e a água de refrigeração interna dos rolos.
`],
  ['preditiva', `# Manutenção Preditiva

Análise de vibração, termografia e análise de óleo para antecipar falhas de rolamentos e mancais. A temperatura e a vibração dos rolamentos indicam desgaste antes da quebra. #produtividade
`],
  ['app', `# Ideias de Apps de Engenharia

Apps de produtividade que valeria construir: #produtividade #apps

- Checklist digital de PSSR offline
- Registro de inspeção com foto e geolocalização
- Painel de recomendações de PHA pendentes
- Este próprio cérebro de notas em Markdown 🙂
`],
];

export function seedNotes(now = Date.now()): Note[] {
  return SEED.map(([slug, content], i) => ({
    id: `seed-${slug}`,
    content,
    createdAt: now - (SEED.length - i) * 3_600_000,
    updatedAt: now - (SEED.length - i) * 3_600_000,
  }));
}
