# Especificação de Arquitetura de Software e Design System

**Projeto:** Plataforma de Testes de Reflexo e Agilidade Cognitiva (Alta Precisão)  
**Papel:** Principal Software Engineer & Product Design Lead (UI/UX)  
**Status do Documento:** RFC-001 — Arquitetura Macro, Design System & Infraestrutura

---

## 1. ARQUITETURA MACRO DO SISTEMA

A arquitetura foi desenhada sob o paradigma **Local-First Execution, Async-Event Persistence**. Qualquer interferência da camada de rede, coleta de lixo (Garbage Collection) ou re-renderização de árvore de interface durante a janela crítica do teste invalida a precisão científica do benchmark.

### 1.1. Os Três Módulos Principais

#### A. Módulo de Teste (Client-Side High-Precision Engine)
Opera como uma máquina de estados finitos (FSM) isolada da camada de gerenciamento de estado global da aplicação.
* **Isolamento de Thread e Renderização:** Ao iniciar uma rodada, o motor entra em modo de bloqueio de efeitos colaterais (*Side-Effect Lock*). Listeners de telemetria secundária, animações periféricas da interface e atualizações de estado reativas são suspensos.
* **Captura de Tempo em Nível de Hardware/SO:** O cálculo de delta temporal não utiliza o relógio de parede do sistema (`Date.now()`), mas sim contadores monotônicos de alta resolução (`performance.now()`, com resolução sub-milissegundo). O timestamp inicial é registrado exatamente após a confirmação de layout/pintura do quadro em que o estímulo visual é entregue à tela, e o timestamp final é capturado no primeiro instante do evento nativo de entrada (`onPressIn` / `Gesture.Tap().onBegin`).
* **Pré-alocação de Memória:** Todas as referências e estruturas de dados necessárias para registrar a bateria de tentativas são mantidas em `useRef` mutáveis para evitar pausas de *Garbage Collection* e re-renderizações da árvore React durante a espera do estímulo.

#### B. Motor de Persistência de Dados (Ingestion & Anti-Cheat Pipeline)
Responsável por receber, validar, auditar e armazenar os resultados de forma 100% assíncrona (*Fire-and-Forget with Retry Queue*).
* **Contrato de Envio Non-Blocking:** Assim que o usuário conclui a bateria de testes, a UI calcula e exibe o resultado instantaneamente a partir dos dados em memória local. Em paralelo, um worker em segundo plano despacha o pacote de telemetria da sessão para a API de Ingestão.
* **Pipeline de Validação e Anti-Cheat no Backend:**
  1. **Filtro Fisiológico Absoluto (Hard Floor):** Descarte imediato de qualquer tentativa individual abaixo do limiar fisiológico humano (100ms no cliente para reflexo visual puro; 50ms como corte estrito de fraude na borda da API).
  2. **Análise de Variância Estatística (Jitter Check):** Rejeição de sessões cujo desvio padrão entre tentativas seja artificialmente próximo de zero (ex: scripts automatizados com delay fixo).
  3. **Validação de Token de Sessão Temporal (Server-Issued Nonce):** Verifica se o tempo total decorrido entre a abertura da sessão e a submissão condiz com a soma dos intervalos aleatórios sorteados.

#### C. Sistema de Ranking Global (Real-Time Leaderboard & Percentile Engine)
Transforma milhões de pontuações individuais em métricas comparativas instantâneas.
* **Estruturas em Memória (Redis):** Utiliza **Sorted Sets (ZSET)** no Redis para manter o leaderboard dos melhores tempos absolutos em complexidade logarítmica $O(\log N)$, combinados com **Histogramas de Latência (Buckets de 1ms)** armazenados em Hashes atômicos no Redis (`HINCRBY`).
* **Cálculo de Percentil em Tempo Constante $O(1)$:** O percentil exato do jogador é derivado diretamente da distribuição acumulada dos buckets em cache, sem executar `COUNT(*)` no banco relacional.

### 1.2. Fluxo de Dados Sem Gargalos

| Etapa | Origem → Destino | Comportamento Técnico | Impacto na Latência do Usuário |
| :--- | :--- | :--- | :--- |
| **1. Execução da Rodada** | Dispositivo Local (Memória) | Loop fechado entre Frame Paint e Hardware Input (`useRef` + `performance.now()`). Zero rede. | **0 ms** (Isolamento Total) |
| **2. Exibição do Score** | Memória Local → UI | Cálculo imediato do delta local e atualização limpa de estado visual. | **< 2 ms** (Renderização Imediata) |
| **3. Submissão (Ingestão)** | Cliente → API Gateway | Envio assíncrono em background (`queueMicrotask` / `fetch` não-bloqueante). | **Assíncrono** (Invisível ao usuário) |
| **4. Validação & Cache** | API → Validador → Redis / Fila | Anti-Cheat valida o payload; atualiza ZSET/Histograma no Redis e publica no Broker. | Processamento em **< 10 ms** na borda |
| **5. Persistência Fria** | Broker → Workers → Banco Principal | Workers consomem a fila em lotes (*Batch Inserts*) e gravam no PostgreSQL. | Desacoplado (Zero impacto) |

---

## 2. DESIGN SYSTEM SPEC ("NEO-MINIMALISTA PREMIUM")

A direção de arte segue a estética de instrumentos de precisão (inspirada em Vercel, Linear e Apple Pro Apps): contraste cirúrgico, ausência de sombras difusas, bordas de `1px` e cores vibrantes usadas exclusivamente como âncoras visuais de estado.

### 2.1. Paleta de Cores Hexadecimais Exata

| Token Semântico | Hexadecimal | Aplicação Estrita na Interface |
| :--- | :--- | :--- |
| **Canvas Principal (Void Black)** | `#0B0B0C` | Fundo global da aplicação. |
| **Estado: Aguardando (Carbon Surface)** | `#121214` | Superfície neutra escura durante a espera do estímulo e cards do grid. |
| **Superfície Interativa (Zinc Muted)** | `#18181B` | Células secundárias de telemetria e histórico. |
| **Borda Estrutural (Hairline Border)** | `#27272A` | Linhas divisórias de `1px solid` que definem o grid rígido. |
| **Texto Primário (Pure Alabaster)** | `#F4F4F5` | Títulos, cronômetros principais e valores numéricos de destaque. |
| **Texto Secundário (Neutral Slate)** | `#A1A1AA` | Rótulos de métricas, unidades de medida (`ms`) e instruções de apoio. |
| **Texto Terciário (Muted Ash)** | `#52525B` | Metadados técnicos e indicadores secundários. |
| **Estado: Clique Agora (Electric Neon Green)** | `#00FF66` | **Exclusivo** para o disparo do estímulo visual e confirmação de recorde. |
| **Estado: Erro / Antecipado (Crimson Alert)** | `#FF3333` | **Exclusivo** para cliques prematuros (antes do verde) ou inválidos (< 100ms). |
| **Anchor: Telemetria / Score (Cyan Laser)** | `#00E5FF` | **Exclusivo** para indicadores de alta performance e badges analíticos. |

### 2.2. Tipografia e Grid Estrutural
* **Números Tabulares (`tabular-nums`):** Obrigatório em todos os contadores e exibições de milissegundos para evitar *layout shift* horizontal.
* **Transições de Estado:** Proibido o uso de animações de *fade* ou interpolação de cor no momento do disparo do estímulo. A troca para `#00FF66` deve ocorrer em 0ms.

---

## 3. DESIGN DE INFRAESTRUTURA E ISOLAMENTO DE BANCO DE DADOS

### 3.1. Isolamento de Leituras Massivas (Zero-DB-Hit Read Path)
1. **Snapshot de Distribuição na CDN (Edge Caching):** Um worker consolida o histograma global do Redis a cada 30–60 segundos em um JSON compacto e o publica na CDN com `stale-while-revalidate`. O cliente calcula o percentil localmente a partir desse snapshot.
2. **Leaderboard Quente em Redis Cluster:** Consultas de Top Global leem exclusivamente de réplicas do Redis (`ZRANGE`), mantendo 0% de leitura no banco relacional.

### 3.2. Isolamento de Escritas Massivas (Write-Behind & Event Buffering)
1. **Ingestão na Borda + Redis Pipelining:** A API valida o pacote Anti-Cheat, incrementa o Redis em memória e publica o evento em um barramento (Kafka / Redis Streams).
2. **Batch Sink Workers:** Workers consomem a fila em lotes (ex: a cada 1.000 registros ou 2 segundos) e executam `BULK INSERT` / `COPY` no banco de dados principal, reduzindo milhares de escritas individuais por segundo a poucas transações otimizadas.

