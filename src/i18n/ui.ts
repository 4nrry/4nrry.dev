/**
 * Static copy for both locales. `pt` is typed against `en`, so a missing or
 * misspelled key fails the build. Terminal-path eyebrows and SVG diagram
 * labels deliberately stay in English everywhere: they are code vocabulary
 * and part of the visual identity.
 */

export type Locale = 'en' | 'pt-BR';

export function resolveLocale(currentLocale: string | undefined): Locale {
  return currentLocale === 'pt-BR' ? 'pt-BR' : 'en';
}

const en = {
  layout: {
    title: 'Anrry Petrin · Software Engineer',
    description:
      'Two years of shipping, replayed. IoT platforms, fintech, dev tools and open source by Anrry Petrin.',
    ogLocale: 'en_US',
    ogImage: '/og.png',
  },
  hero: {
    role: 'Software engineer. I build IoT platforms, fintech and dev tools, and I ship every day.',
    counterContributions: 'contributions',
    counterPrs: 'merged pull requests',
    counterStreak: 'longest streak, days',
    chipConnecting: 'connecting to the worker',
    replay: 'replay',
    caption:
      'Each cell is one day of the last two years, synced live from the GitHub API. Most of this work lives in private repositories; the totals count it anyway.',
    tableSummary: 'data table: contributions by month',
    tableMonth: 'month',
    tableContributions: 'contributions',
  },
  jump: {
    title: 'The jump',
    beforeMultiplier:
      'Year one I was finding a rhythm. Year two I rebuilt the way I work around AI agents and shipped ',
    afterMultiplier: ' the contributions.',
  },
  orgs: {
    title: 'Three orgs, one engineer',
    intro: 'I run all three. Names and numbers sync straight from GitHub every six hours.',
  },
  systems: {
    title: 'Systems, not just commits',
    intro:
      'Volume is easy to chart. This is the part that matters: what the client needed, how I modeled it, and what I traded away to get there.',
    need: 'need',
    decisions: 'decisions',
    tradeoffs: 'trade-offs',
    outcome: 'outcome',
    more: 'More case studies landing here soon.',
    oc: {
      title: 'OpenCherry: a control tower for multi-repo AI coding',
      meta: 'Tauri 2 · alpha · AGPL-3.0 ·',
      need: 'AI coding tools assume one repo, one agent, one terminal. My day is the opposite: many repos, several agents working in parallel. OpenCherry is the missing dashboard: a desktop app that watches every repo and shows which agent is touching what.',
      decisions:
        'A Tauri 2 shell with a SolidJS UI over a Rust core, after a same-day pivot away from a native-Rust GUI: velocity won. The core splits into four thin crates: shared types, git operations, agent detection, SQLite persistence. Git is hybrid: local operations run on embedded libgit2, remote push and pull shell out to the user’s real git so existing credentials just work. Agents are never spawned, only detected: a data-driven rule table scans the process list and correlates each running agent to the repo it is touching. Everything is local and offline-first.',
      tradeoffs:
        'AGPL from the first commit: reciprocity over easy corporate adoption. The TypeScript-Rust contract across the IPC bridge is maintained by hand, a two-file edit on every command change. Distribution is an unsandboxed installer with no auto-update, because the app’s whole job is watching other processes and arbitrary paths; a store sandbox would neuter it.',
      outcome:
        'An alpha that already does the job: multi-repo Git with diffs, staging and sync, live agent correlation for five agent CLIs, eight built-in themes plus theme import, and one binary that is both GUI and CLI. Ubuntu and GNOME first. Code in the open at',
      figcaption: 'one IPC bridge, four thin crates, nothing spawned',
      aria: 'OpenCherry architecture: a SolidJS WebView talks to a Rust core over Tauri IPC; the core’s four crates use the git CLI for remote operations only, read the OS process table to detect agents, and persist state in a local SQLite database.',
    },
    site: {
      title: 'This site: publishing private work without leaking it',
      metaAuditable: 'auditable:',
      metaSource: 'source on GitHub',
      need: 'Two years of work, 97% of it in private repos. Show it publicly, keep it current with zero upkeep, and make "nothing private leaks" a property you can verify, not a promise.',
      decisions:
        'One Cloudflare Worker owns everything: static assets, a tiny API, and a cron that re-syncs GitHub every six hours. The sync materializes a single public-safe JSON document. Per-repo queries are generated from an allowlist, so private repo names are never even requested; a sanitizer then walks the final document and the publish fails closed on any violation, leaving the last good dataset serving.',
      tradeoffs:
        'Six-hour freshness instead of realtime. KV instead of a database, because the artifact is one document, not a query workload. A blocklist would have been simpler, but this repo is public and a blocklist of private names would itself be the leak.',
      outcomeBefore: 'Every number on this page comes from ',
      outcomeAfter: ', and the sanitizer suite plus leak checker ship in the open.',
      figcaption: 'fail-closed by design: the gate sits before the only write',
      aria: 'Site pipeline: a cron-driven sync reads the GitHub API, builds queries from an allowlist, aggregates, passes a sanitize gate that fails closed, writes one JSON document to KV, and the page reads it through the API.',
    },
  },
  repos: {
    title: 'Where the PRs landed',
    intro: 'Top repositories by pull requests I authored in the window, colored by org.',
    tableSummary: 'data table: repositories',
    tableRepo: 'repository',
    tableOrg: 'org',
    tablePrs: 'PRs',
  },
  rhythm: {
    title: 'The weekly rhythm',
    intro:
      "Contributions by weekday, month by month. GitHub's calendar is daily, so this is as granular as honesty allows.",
  },
  languages: {
    title: 'Materials',
    intro:
      'Bytes across the org codebases and my own public repos. Upstream projects I contribute to are excluded: not my code to count.',
  },
  oss: {
    title: 'In the open',
    intro: 'The public slice: my own projects and the upstream ones I contribute to.',
  },
  trajectory: {
    title: 'How I got here',
    chapters: [
      {
        title: 'Smart Compost, solo',
        body: 'I joined a small composting startup as the only engineer. Firmware, backend, frontend: whatever the day needed.',
      },
      {
        title: 'The platform',
        body: 'One repo became twenty-eight: C++ sensors, NestJS microservices, three frontends, a React Native app, Helm-managed infra.',
      },
      {
        title: 'Mentoring',
        body: 'Bruno joined as an intern; today we work as peers. Best multiplier I ever shipped.',
      },
      {
        title: 'LOTVS Finance',
        body: 'Started a fintech with a college friend. My single most PR-heavy repository lives there.',
      },
      {
        title: 'Ocean Words',
        body: 'Building an English-teaching platform with my girlfriend, who teaches the classes.',
      },
      {
        title: 'In the open',
        body: 'OpenCherry, an MCP server on npm, upstream PRs to tools I use daily. This site is one of them: a Worker that replays my own GitHub.',
      },
    ],
  },
  contact: {
    title: 'Say hi',
    intro: 'Open to interesting problems, especially where hardware, data and product meet.',
    noteBefore: 'This site is a Cloudflare Worker that re-syncs itself from the GitHub API every six hours. ',
    noteSource: 'Source on GitHub.',
    noteInspired: 'Replay idea inspired by',
  },
};

const pt: typeof en = {
  layout: {
    title: 'Anrry Petrin · Engenheiro de Software',
    description:
      'Dois anos de entrega, em replay. Plataformas IoT, fintech, dev tools e open source por Anrry Petrin.',
    ogLocale: 'pt_BR',
    ogImage: '/og-pt.png',
  },
  hero: {
    role: 'Engenheiro de software. Construo plataformas IoT, fintech e dev tools, e entrego todo dia.',
    counterContributions: 'contribuições',
    counterPrs: 'pull requests merged',
    counterStreak: 'maior sequência, dias',
    chipConnecting: 'conectando ao worker',
    replay: 'replay',
    caption:
      'Cada célula é um dia dos últimos dois anos, sincronizado ao vivo da API do GitHub. A maior parte desse trabalho vive em repositórios privados; os totais contam mesmo assim.',
    tableSummary: 'tabela: contribuições por mês',
    tableMonth: 'mês',
    tableContributions: 'contribuições',
  },
  jump: {
    title: 'O salto',
    beforeMultiplier:
      'No primeiro ano eu estava achando um ritmo. No segundo, reconstruí meu jeito de trabalhar em volta de agentes de IA e entreguei ',
    afterMultiplier: ' o volume de contribuições.',
  },
  orgs: {
    title: 'Três orgs, um engenheiro',
    intro: 'Eu toco as três. Nomes e números sincronizam direto do GitHub a cada seis horas.',
  },
  systems: {
    title: 'Sistemas, não só commits',
    intro:
      'Volume é fácil de plotar. O que importa é isto: o que o cliente precisava, como eu modelei, e do que abri mão pra chegar lá.',
    need: 'necessidade',
    decisions: 'decisões',
    tradeoffs: 'trade-offs',
    outcome: 'resultado',
    more: 'Mais estudos de caso chegando aqui em breve.',
    oc: {
      title: 'OpenCherry: uma torre de controle para IA multi-repo',
      meta: 'Tauri 2 · alpha · AGPL-3.0 ·',
      need: 'Ferramentas de IA pra código assumem um repo, um agente, um terminal. Meu dia é o oposto: muitos repos, vários agentes em paralelo. O OpenCherry é o dashboard que faltava: um app desktop que observa cada repo e mostra qual agente está mexendo em quê.',
      decisions:
        'Um shell Tauri 2 com UI SolidJS sobre um core Rust, depois de um pivô no mesmo dia abandonando uma GUI nativa em Rust: velocidade venceu. O core se divide em quatro crates enxutos: tipos compartilhados, operações git, detecção de agentes, persistência SQLite. O git é híbrido: operações locais rodam no libgit2 embutido, push e pull remotos chamam o git real do usuário, então as credenciais que já existem simplesmente funcionam. Agentes nunca são disparados, só detectados: uma tabela de regras varre a lista de processos e correlaciona cada agente rodando ao repo que ele está tocando. Tudo local, offline-first.',
      tradeoffs:
        'AGPL desde o primeiro commit: reciprocidade acima de adoção corporativa fácil. O contrato TypeScript-Rust na ponte IPC é mantido na mão, uma edição em dois arquivos a cada mudança de comando. A distribuição é um instalador sem sandbox e sem auto-update, porque o trabalho do app é justamente observar outros processos e caminhos arbitrários; sandbox de loja castraria ele.',
      outcome:
        'Um alpha que já faz o trabalho: Git multi-repo com diffs, staging e sync, correlação de agentes ao vivo pra cinco CLIs, oito temas embutidos mais import de temas, e um binário que é GUI e CLI ao mesmo tempo. Ubuntu e GNOME primeiro. Código aberto em',
      figcaption: 'uma ponte IPC, quatro crates enxutos, nada é disparado',
      aria: 'Arquitetura do OpenCherry: uma WebView SolidJS conversa com um core Rust via IPC do Tauri; os quatro crates do core usam o git CLI só pra operações remotas, leem a tabela de processos do sistema pra detectar agentes, e persistem estado num banco SQLite local.',
    },
    site: {
      title: 'Este site: publicar trabalho privado sem vazar nada',
      metaAuditable: 'auditável:',
      metaSource: 'código no GitHub',
      need: 'Dois anos de trabalho, 97% em repos privados. Mostrar publicamente, manter atualizado com zero manutenção, e fazer de "nada privado vaza" uma propriedade verificável, não uma promessa.',
      decisions:
        'Um único Cloudflare Worker é dono de tudo: assets estáticos, uma API pequena e um cron que re-sincroniza o GitHub a cada seis horas. O sync materializa um único documento JSON seguro pra publicar. As queries por repositório são geradas a partir de uma allowlist, então nomes de repos privados nunca são sequer pedidos; um sanitizador varre o documento final e a publicação falha fechada em qualquer violação, deixando o último dataset bom servindo.',
      tradeoffs:
        'Atualização a cada seis horas em vez de tempo real. KV em vez de banco, porque o artefato é um documento, não uma carga de queries. Uma blocklist seria mais simples, mas este repo é público e uma blocklist de nomes privados seria ela mesma o vazamento.',
      outcomeBefore: 'Todo número desta página vem de ',
      outcomeAfter: ', e a suíte do sanitizador mais o checador de vazamentos estão no aberto.',
      figcaption: 'fail-closed por design: o portão vem antes da única escrita',
      aria: 'Pipeline do site: um sync disparado por cron lê a API do GitHub, monta queries a partir de uma allowlist, agrega, passa por um portão de sanitização que falha fechado, escreve um documento JSON no KV, e a página lê pela API.',
    },
  },
  repos: {
    title: 'Onde os PRs aterrissaram',
    intro: 'Top repositórios por pull requests que eu autorei na janela, coloridos por org.',
    tableSummary: 'tabela: repositórios',
    tableRepo: 'repositório',
    tableOrg: 'org',
    tablePrs: 'PRs',
  },
  rhythm: {
    title: 'O ritmo semanal',
    intro:
      'Contribuições por dia da semana, mês a mês. O calendário do GitHub é diário, então este é o máximo de granularidade que a honestidade permite.',
  },
  languages: {
    title: 'Materiais',
    intro:
      'Bytes através das codebases das orgs e dos meus repos públicos. Projetos upstream que eu contribuo ficam de fora: não é meu código pra contar.',
  },
  oss: {
    title: 'No aberto',
    intro: 'A fatia pública: meus projetos e os upstream que eu contribuo.',
  },
  trajectory: {
    title: 'Como cheguei aqui',
    chapters: [
      {
        title: 'Smart Compost, solo',
        body: 'Entrei numa startup pequena de compostagem como o único engenheiro. Firmware, backend, frontend: o que o dia pedisse.',
      },
      {
        title: 'A plataforma',
        body: 'Um repo virou vinte e oito: sensores C++, microservices NestJS, três frontends, um app React Native, infra gerenciada com Helm.',
      },
      {
        title: 'Mentoria',
        body: 'O Bruno entrou como estagiário; hoje trabalhamos como pares. Melhor multiplicador que já entreguei.',
      },
      {
        title: 'LOTVS Finance',
        body: 'Comecei uma fintech com um amigo de faculdade. Meu repositório mais pesado em PRs vive lá.',
      },
      {
        title: 'Ocean Words',
        body: 'Construindo uma plataforma de ensino de inglês com minha namorada, que dá as aulas.',
      },
      {
        title: 'No aberto',
        body: 'OpenCherry, um servidor MCP no npm, PRs upstream pra ferramentas que uso todo dia. Este site é uma delas: um Worker que faz replay do meu próprio GitHub.',
      },
    ],
  },
  contact: {
    title: 'Vamos conversar',
    intro: 'Aberto a problemas interessantes, principalmente onde hardware, dados e produto se encontram.',
    noteBefore: 'Este site é um Cloudflare Worker que se re-sincroniza da API do GitHub a cada seis horas. ',
    noteSource: 'Código no GitHub.',
    noteInspired: 'Ideia do replay inspirada em',
  },
};

export const ui: Record<Locale, typeof en> = { en, 'pt-BR': pt };
