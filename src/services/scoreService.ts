/**
 * ============================================================================
 * MÓDULO 2 & 3: MOTOR DE PERSISTÊNCIA ASSÍNCRONA, ANTI-CHEAT & RANKING GLOBAL
 * ============================================================================
 * Implementa a arquitetura definida em ARCHITECTURE.md:
 * 1. Validação Anti-Cheat (Filtro fisiológico >= 50ms/100ms + Jitter Check de variância)
 * 2. Cálculo de Percentil Global em O(1) via Snapshot de Histograma (Edge/CDN Cache)
 * 3. Fila de Ingestão Assíncrona (Non-blocking Fire-and-Forget)
 */

export interface ReflexScorePayload {
  reactionTimeMs: number;
  stimulusTimestamp: number;
  inputTimestamp: number;
  scheduledDelayMs: number;
  isValid: boolean;
}

export interface ValidatedScoreRecord extends ReflexScorePayload {
  id: string;
  recordedAt: number;
  percentileTop: number; // Ex: 4.2 significa "Top 4.2% Global"
  tierLabel: string;
  jitterStdDevMs: number | null;
}

export interface GlobalBenchmarkBucket {
  rangeLabel: string;
  minMs: number;
  maxMs: number;
  populationSharePercent: number; // % da população humana nessa faixa
}

/**
 * Snapshot estático representando o Histograma Consolidado servido via Edge CDN
 * (Atualizado a cada 60s a partir do Redis na arquitetura de produção).
 * Permite calcular o percentil do usuário no cliente em 0ms sem consultar o DB.
 */
export const GLOBAL_LATENCY_HISTOGRAM: readonly GlobalBenchmarkBucket[] = [
  { rangeLabel: '100–139ms', minMs: 100, maxMs: 139, populationSharePercent: 1.2 },
  { rangeLabel: '140–159ms', minMs: 140, maxMs: 159, populationSharePercent: 4.8 },
  { rangeLabel: '160–179ms', minMs: 160, maxMs: 179, populationSharePercent: 14.5 },
  { rangeLabel: '180–199ms', minMs: 180, maxMs: 199, populationSharePercent: 24.0 },
  { rangeLabel: '200–224ms', minMs: 200, maxMs: 224, populationSharePercent: 27.5 },
  { rangeLabel: '225–259ms', minMs: 225, maxMs: 259, populationSharePercent: 16.5 },
  { rangeLabel: '260–299ms', minMs: 260, maxMs: 299, populationSharePercent: 7.5 },
  { rangeLabel: '300ms+',    minMs: 300, maxMs: 9999, populationSharePercent: 4.0 },
] as const;

export const GLOBAL_MEDIAN_MS = 208;

/**
 * Calcula em O(1) o percentil global (Top X%) interpolando linearmente dentro
 * do bucket correspondente do histograma.
 */
export function calculateGlobalPercentile(reactionTimeMs: number): {
  percentileTop: number;
  tierLabel: string;
} {
  if (reactionTimeMs < 100) {
    return { percentileTop: 0.1, tierLabel: 'SUSPICIOUS // SUB-HUMAN' };
  }

  let cumulativeFasterPercent = 0;

  for (const bucket of GLOBAL_LATENCY_HISTOGRAM) {
    if (reactionTimeMs >= bucket.minMs && reactionTimeMs <= bucket.maxMs) {
      const bucketSpan = Math.max(1, bucket.maxMs - bucket.minMs);
      const positionInBucket = (reactionTimeMs - bucket.minMs) / bucketSpan;
      const rawTop =
        cumulativeFasterPercent + positionInBucket * bucket.populationSharePercent;
      const clampedTop = Math.max(0.1, Math.min(99.9, Number(rawTop.toFixed(1))));

      let tierLabel = 'MÉDIA GLOBAL';
      if (clampedTop <= 2.0) tierLabel = 'ELITE // APEX REFLEX';
      else if (clampedTop <= 10.0) tierLabel = 'ALTA PERFORMANCE';
      else if (clampedTop <= 30.0) tierLabel = 'ACIMA DA MÉDIA';
      else if (clampedTop > 70.0) tierLabel = 'ABAIXO DA MÉDIA';

      return { percentileTop: clampedTop, tierLabel };
    }
    cumulativeFasterPercent += bucket.populationSharePercent;
  }

  return { percentileTop: 99.0, tierLabel: 'ABAIXO DA MÉDIA' };
}

/**
 * Calcula o desvio padrão (Jitter) de uma janela de tentativas para verificar
 * consistência humana e evitar bots com delay fixo.
 */
export function calculateJitterStdDev(samplesMs: number[]): number | null {
  if (samplesMs.length < 2) return null;
  const mean = samplesMs.reduce((acc, v) => acc + v, 0) / samplesMs.length;
  const variance =
    samplesMs.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / samplesMs.length;
  return Number(Math.sqrt(variance).toFixed(1));
}

/**
 * Validador Anti-Cheat de Borda (Simula o contrato de validação do Backend):
 * 1. Rejeita latências impossíveis (< 50ms hard floor / < 100ms reflexo visual)
 * 2. Verifica integridade dos timestamps monotônicos
 * 3. Em baterias >= 4 amostras, rejeita desvio padrão artificialmente nulo (< 0.3ms)
 */
export function validateScoreAntiCheat(
  payload: ReflexScorePayload,
  recentHistoryMs: number[]
): { valid: boolean; reason?: string } {
  const computedDelta = Math.round(payload.inputTimestamp - payload.stimulusTimestamp);

  if (payload.reactionTimeMs < 50 || computedDelta < 50) {
    return { valid: false, reason: 'HARD_FLOOR_VIOLATION_SUB_50MS' };
  }

  if (payload.reactionTimeMs < 100) {
    return { valid: false, reason: 'PHYSIOLOGICAL_LIMIT_SUB_100MS' };
  }

  if (Math.abs(computedDelta - payload.reactionTimeMs) > 5) {
    return { valid: false, reason: 'TIMESTAMP_DELTA_TAMPERED' };
  }

  if (recentHistoryMs.length >= 4) {
    const stdDev = calculateJitterStdDev([
      payload.reactionTimeMs,
      ...recentHistoryMs.slice(0, 4),
    ]);
    if (stdDev !== null && stdDev < 0.3) {
      return { valid: false, reason: 'BOT_ZERO_JITTER_DETECTED' };
    }
  }

  return { valid: true };
}

/**
 * Fila assíncrona em memória para simular o envio non-blocking ao endpoint de ingestão.
 */
class AsyncScoreIngestionQueue {
  private records: ValidatedScoreRecord[] = [];
  private listeners: Array<(records: ValidatedScoreRecord[]) => void> = [];

  public enqueueScore(payload: ReflexScorePayload): ValidatedScoreRecord | null {
    const recentMs = this.records.slice(0, 4).map((r) => r.reactionTimeMs);
    const validation = validateScoreAntiCheat(payload, recentMs);

    if (!validation.valid) {
      return null;
    }

    const { percentileTop, tierLabel } = calculateGlobalPercentile(
      payload.reactionTimeMs
    );
    const updatedWindow = [payload.reactionTimeMs, ...recentMs];
    const jitterStdDevMs = calculateJitterStdDev(updatedWindow);

    const record: ValidatedScoreRecord = {
      ...payload,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      recordedAt: Date.now(),
      percentileTop,
      tierLabel,
      jitterStdDevMs,
    };

    this.records = [record, ...this.records.slice(0, 49)];
    this.notifyListeners();

    return record;
  }

  public getRecords(): ValidatedScoreRecord[] {
    return this.records;
  }

  public clearRecords(): void {
    this.records = [];
    this.notifyListeners();
  }

  public subscribe(listener: (records: ValidatedScoreRecord[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    const snapshot = [...this.records];
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const scoreIngestionQueue = new AsyncScoreIngestionQueue();

