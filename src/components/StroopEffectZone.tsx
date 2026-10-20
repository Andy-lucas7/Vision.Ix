import React, { useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
} from 'react-native';
import {
  STUDIO_COLORS,
  GEOMETRIC_FONT,
  STUDIO_SURFACES,
} from '../theme/designSystem';

/**
 * ============================================================================
 * 3. THE STROOP EFFECT ENGINE (Zero-GC Pre-Allocated Conflict Ring Buffer)
 * ============================================================================
 * POR QUE IMPLEMENTAÇÕES COMUNS DE STROOP SOFREM DE MICRO-STUTTERING:
 * Sortear arrays de strings ou criar novos objetos `{ text, color }` no momento
 * da troca de estímulo aloca memória na Heap do JavaScript e pode disparar
 * Garbage Collection (GC) exatamente nos milissegundos críticos da medição.
 *
 * NOSSA ARQUITETURA ZERO-GC:
 * 1. Definimos uma tabela estática imutável de 4 canais cromáticos (`STROOP_CHANNELS`).
 * 2. Pré-alocamos um `Uint8Array(64)` estático que armazena os índices inteiros
 *    de cada rodada ANTES de a bateria começar:
 *    - Byte par `2*i`: Índice da PALAVRA escrita (0..3)
 *    - Byte ímpar `2*i + 1`: Índice da COR DA FONTE real (0..3), garantindo
 *      conflito cognitivo (`wordIdx !== inkIdx`) em >= 80% das amostras sem
 *      alocar nenhum objeto ou string durante o teste.
 * 3. Durante o teste, avançar para o próximo estímulo apenas incrementa um
 *    ponteiro inteiro em `useRef` (`roundCursorRef.current++`) e lê `Uint8Array`
 *    em O(1).
 */

export interface StroopChannel {
  readonly id: number;
  readonly word: string;
  readonly hex: string;
}

const STROOP_CHANNELS: readonly StroopChannel[] = [
  { id: 0, word: 'VERMELHO', hex: STUDIO_COLORS.ACCENT_RED },
  { id: 1, word: 'VERDE',    hex: STUDIO_COLORS.ACCENT_GREEN },
  { id: 2, word: 'CIANO',    hex: STUDIO_COLORS.ACCENT_CYAN },
  { id: 3, word: 'LARANJA',  hex: STUDIO_COLORS.ACCENT_ORANGE },
] as const;

const TOTAL_ROUNDS_PER_BATTERY = 8;
const RING_BUFFER_CAPACITY = 32;

/**
 * Buffer tipado pré-alocado na inicialização do módulo (Zero GC durante a sessão).
 * Cada slot `i` usa 2 bytes:
 * - `PREALLOCATED_TAPE[i * 2]`     = wordIndex (0..3)
 * - `PREALLOCATED_TAPE[i * 2 + 1]` = inkColorIndex (0..3)
 */
const PREALLOCATED_TAPE = new Uint8Array(RING_BUFFER_CAPACITY * 2);

/**
 * Popula a fita binária antes do início da bateria usando aritmética inteira.
 * Evita repetições consecutivas da mesma cor de tinta e força interferência
 * semântica (Stroop Incongruent Trial).
 */
function populateStroopBinaryTape(): void {
  let prevInkIdx = 255;

  for (let i = 0; i < RING_BUFFER_CAPACITY; i++) {
    // Escolhe a cor real da fonte (inkIdx) diferente da rodada imediatamente anterior
    let inkIdx = (Math.random() * 4) | 0;
    if (inkIdx === prevInkIdx) {
      inkIdx = (inkIdx + 1 + ((Math.random() * 3) | 0)) & 3;
    }
    prevInkIdx = inkIdx;

    // Força conflito cognitivo (palavra escrita != cor da tinta) em 85% dos casos
    let wordIdx = (Math.random() * 4) | 0;
    if (wordIdx === inkIdx && Math.random() < 0.85) {
      wordIdx = (inkIdx + 1 + ((Math.random() * 3) | 0)) & 3;
    }

    PREALLOCATED_TAPE[i * 2] = wordIdx;
    PREALLOCATED_TAPE[i * 2 + 1] = inkIdx;
  }
}

// Inicializa a fita na carga do módulo
populateStroopBinaryTape();

type StroopPhase = 'IDLE' | 'ACTIVE' | 'PENALTY' | 'SUMMARY';

export interface StroopSessionResult {
  averageDecisionMs: number;
  fastestDecisionMs: number;
  accuracyPercent: number;
  totalRounds: number;
}

interface StroopEffectZoneProps {
  onSessionComplete?: (result: StroopSessionResult) => void;
  onLockChange?: (locked: boolean) => void;
}

export const StroopEffectZone: React.FC<StroopEffectZoneProps> = ({
  onSessionComplete,
  onLockChange,
}) => {
  const [phase, setPhase] = useState<StroopPhase>('IDLE');
  // Índices primitivos inteiros (evitam alocação de objetos de estado)
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [lastSummary, setLastSummary] = useState<StroopSessionResult | null>(null);

  /**
   * Refs de Tempo Monotônico e Contadores de Sessão (Mutação O(1) sem Re-render)
   */
  const phaseRef = useRef<StroopPhase>('IDLE');
  const stepRef = useRef<number>(0);
  const stimulusShownAtRef = useRef<number>(0);
  const validDeltasRef = useRef<number[]>([]);
  const mistakesCountRef = useRef<number>(0);

  const setPhaseSync = useCallback(
    (next: StroopPhase) => {
      phaseRef.current = next;
      setPhase(next);
      onLockChange?.(next === 'ACTIVE');
    },
    [onLockChange]
  );

  /**
   * Inicia uma bateria de 8 decisões cognitivas sob conflito.
   * O embaralhamento ocorre ANTES do primeiro estímulo aparecer.
   */
  const startBattery = useCallback(() => {
    populateStroopBinaryTape();
    validDeltasRef.current = [];
    mistakesCountRef.current = 0;
    stepRef.current = 0;
    setCurrentStep(0);
    setPhaseSync('ACTIVE');
    stimulusShownAtRef.current = performance.now();
  }, [setPhaseSync]);

  /**
   * Captura de toque imediata (`onPressIn`, delay 0) nos botões de cor.
   * Valida se o usuário clicou na COR DA FONTE (ignorando a palavra escrita).
   */
  const handleSelectChannel = useCallback(
    (selectedChannelId: number) => {
      const touchTime = performance.now();
      if (phaseRef.current !== 'ACTIVE') return;

      const currentIdx = stepRef.current;
      const expectedInkId = PREALLOCATED_TAPE[currentIdx * 2 + 1];
      const deltaMs = Math.round(touchTime - stimulusShownAtRef.current);

      // Anti-cheat fisiológico (< 110ms para decisão discriminativa de 4 escolhas)
      if (deltaMs < 110) {
        mistakesCountRef.current += 1;
        setPhaseSync('PENALTY');
        return;
      }

      if (selectedChannelId !== expectedInkId) {
        // Usuário caiu na armadilha semântica (leu a palavra em vez da cor)
        mistakesCountRef.current += 1;
        setPhaseSync('PENALTY');
        return;
      }

      // Acertou a cor da fonte! Registra latência de decisão cognitiva
      validDeltasRef.current.push(deltaMs);
      const nextStep = currentIdx + 1;

      if (nextStep >= TOTAL_ROUNDS_PER_BATTERY) {
        // Bateria concluída -> consolida telemetria
        const samples = validDeltasRef.current;
        const sum = samples.reduce((a, b) => a + b, 0);
        const avg = Math.round(sum / samples.length);
        const fastest = Math.min(...samples);
        const totalAttempts = samples.length + mistakesCountRef.current;
        const accuracy = Math.round((samples.length / totalAttempts) * 100);

        const summary: StroopSessionResult = {
          averageDecisionMs: avg,
          fastestDecisionMs: fastest,
          accuracyPercent: accuracy,
          totalRounds: TOTAL_ROUNDS_PER_BATTERY,
        };

        setLastSummary(summary);
        setPhaseSync('SUMMARY');

        if (onSessionComplete) {
          queueMicrotask(() => onSessionComplete(summary));
        }
      } else {
        // Avança instantaneamente no buffer binário pré-alocado (Zero GC)
        stepRef.current = nextStep;
        setCurrentStep(nextStep);
        stimulusShownAtRef.current = performance.now();
      }
    },
    [onSessionComplete, setPhaseSync]
  );

  const resumeAfterPenalty = useCallback(() => {
    const nextStep = (stepRef.current + 1) % RING_BUFFER_CAPACITY;
    stepRef.current = nextStep % TOTAL_ROUNDS_PER_BATTERY;
    setCurrentStep(stepRef.current);
    setPhaseSync('ACTIVE');
    stimulusShownAtRef.current = performance.now();
  }, [setPhaseSync]);

  // Leitura O(1) do par atual diretamente do Uint8Array
  const currentWordChannel = STROOP_CHANNELS[PREALLOCATED_TAPE[currentStep * 2]];
  const currentInkChannel = STROOP_CHANNELS[PREALLOCATED_TAPE[currentStep * 2 + 1]];

  return (
    <View style={styles.container}>
      {/* Header de Telemetria do Módulo */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.moduleCode}>COGNITIVE // STROOP.04</Text>
          <Text style={styles.moduleSubtitle}>CONFLITO SEMÂNTICO VS CROMÁTICO</Text>
        </View>
        <View style={styles.stepPill}>
          <Text style={styles.stepPillText}>
            {phase === 'ACTIVE'
              ? `${currentStep + 1} / ${TOTAL_ROUNDS_PER_BATTERY}`
              : '8 TRIALS'}
          </Text>
        </View>
      </View>

      {/* Palco Central 3D */}
      <View style={styles.stageCenter}>
        {phase === 'IDLE' && (
          <View style={[STUDIO_SURFACES.tactileCard, styles.briefingCard]}>
            <View style={styles.tagBadge}>
              <Text style={styles.tagBadgeText}>INTERFERÊNCIA COGNITIVA</Text>
            </View>
            <Text style={styles.heroTitle}>EFEITO STROOP</Text>
            <Text style={styles.description}>
              Ignore a palavra escrita. Toque exclusivamente no botão correspondente à{' '}
              <Text style={styles.highlightText}>COR DA FONTE</Text> o mais rápido possível.
            </Text>

            {/* Exemplo Visual de Conflito */}
            <View style={styles.exampleBox}>
              <Text style={[styles.exampleWord, { color: STUDIO_COLORS.ACCENT_GREEN }]}>
                VERMELHO
              </Text>
              <Text style={styles.exampleCaption}>
                Resposta correta: <Text style={{ color: STUDIO_COLORS.ACCENT_GREEN, fontWeight: '800' }}>VERDE</Text>
              </Text>
            </View>

            <Pressable
              onPressIn={startBattery}
              unstable_pressDelay={0}
              style={styles.primaryStartButton}
            >
              <Text style={styles.primaryStartButtonText}>INICIAR BATERIA (8x)</Text>
            </Pressable>
          </View>
        )}

        {phase === 'ACTIVE' && (
          <View style={styles.activeArena}>
            {/* Card 3D mostrando o estímulo em conflito */}
            <View style={[STUDIO_SURFACES.tactileCard, styles.stimulusDisplayCard]}>
              <Text style={styles.focusInstruction}>FOQUE NA COR DA TINTA</Text>
              <Text
                style={[
                  styles.stroopStimulusWord,
                  { color: currentInkChannel.hex },
                ]}
              >
                {currentWordChannel.word}
              </Text>
            </View>

            {/* Matriz Tátil 2x2 de Resposta Física (Zero Press Delay) */}
            <View style={styles.buttonsGrid}>
              {STROOP_CHANNELS.map((channel) => (
                <Pressable
                  key={channel.id}
                  onPressIn={() => handleSelectChannel(channel.id)}
                  unstable_pressDelay={0}
                  android_disableSound={true}
                  style={[STUDIO_SURFACES.tactileButton, styles.colorOptionButton]}
                >
                  <View
                    style={[
                      styles.colorAnchorDot,
                      { backgroundColor: channel.hex },
                    ]}
                  />
                  <Text style={styles.colorOptionLabel}>{channel.word}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {phase === 'PENALTY' && (
          <Pressable
            onPressIn={resumeAfterPenalty}
            unstable_pressDelay={0}
            style={[STUDIO_SURFACES.tactileCard, styles.penaltyCard]}
          >
            <Text style={styles.penaltyBadge}>FALHA DE INIBIÇÃO SEMÂNTICA</Text>
            <Text style={styles.penaltyTitle}>COR INCORRETA</Text>
            <Text style={styles.penaltyText}>
              Seu cérebro leu o texto em vez de processar a cor da fonte. Toque para retomar a bateria.
            </Text>
            <View style={styles.retryButton}>
              <Text style={styles.retryButtonText}>CONTINUAR</Text>
            </View>
          </Pressable>
        )}

        {phase === 'SUMMARY' && lastSummary && (
          <Pressable
            onPressIn={startBattery}
            unstable_pressDelay={0}
            style={[STUDIO_SURFACES.tactileCard, styles.summaryCard]}
          >
            <Text style={styles.summaryOverline}>TEMPO MÉDIO DE DECISÃO</Text>
            <View style={styles.summaryScoreRow}>
              <Text style={styles.summaryHeroMs}>{lastSummary.averageDecisionMs}</Text>
              <Text style={styles.summaryUnit}>ms</Text>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryCellLabel}>MAIS RÁPIDO</Text>
                <Text style={[styles.summaryCellValue, { color: STUDIO_COLORS.ACCENT_GREEN }]}>
                  {lastSummary.fastestDecisionMs} ms
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryCell}>
                <Text style={styles.summaryCellLabel}>PRECISÃO</Text>
                <Text style={[styles.summaryCellValue, { color: STUDIO_COLORS.ACCENT_CYAN }]}>
                  {lastSummary.accuracyPercent}%
                </Text>
              </View>
            </View>

            <Text style={styles.tapAgainHint}>TOQUE PARA NOVA BATERIA STROOP</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 96,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: STUDIO_COLORS.BORDER_HAIRLINE,
  },
  moduleCode: {
    color: STUDIO_COLORS.ACCENT_ORANGE,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  moduleSubtitle: {
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.6,
  },
  stepPill: {
    backgroundColor: STUDIO_COLORS.SATIN_GRAPHITE,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.RIM_LIGHT_TOP,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  stepPillText: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  stageCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  briefingCard: {
    width: '100%',
    maxWidth: 440,
    padding: 28,
    alignItems: 'center',
  },
  tagBadge: {
    borderWidth: 1,
    borderColor: STUDIO_COLORS.ACCENT_ORANGE,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 16,
  },
  tagBadgeText: {
    color: STUDIO_COLORS.ACCENT_ORANGE,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  heroTitle: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  description: {
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 22,
  },
  highlightText: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontWeight: '800',
  },
  exampleBox: {
    width: '100%',
    backgroundColor: STUDIO_COLORS.ABYSS_BG,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.BORDER_HAIRLINE,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 24,
  },
  exampleWord: {
    fontFamily: GEOMETRIC_FONT,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 1,
  },
  exampleCaption: {
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  primaryStartButton: {
    width: '100%',
    backgroundColor: STUDIO_COLORS.ACCENT_ORANGE,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryStartButtonText: {
    color: STUDIO_COLORS.ABYSS_BG,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  activeArena: {
    width: '100%',
    maxWidth: 440,
    gap: 20,
  },
  stimulusDisplayCard: {
    paddingVertical: 44,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusInstruction: {
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 18,
  },
  stroopStimulusWord: {
    fontFamily: GEOMETRIC_FONT,
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -1,
    textAlign: 'center',
  },
  buttonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  colorOptionButton: {
    width: '48%',
    paddingVertical: 22,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  colorAnchorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  colorOptionLabel: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  penaltyCard: {
    width: '100%',
    maxWidth: 440,
    padding: 28,
    alignItems: 'center',
    borderColor: STUDIO_COLORS.ACCENT_RED,
  },
  penaltyBadge: {
    color: STUDIO_COLORS.ACCENT_RED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  penaltyTitle: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 10,
  },
  penaltyText: {
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: STUDIO_COLORS.SATIN_GRAPHITE,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.RIM_LIGHT_TOP,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  summaryCard: {
    width: '100%',
    maxWidth: 440,
    padding: 28,
    alignItems: 'center',
  },
  summaryOverline: {
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  summaryScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginVertical: 12,
  },
  summaryHeroMs: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 80,
    fontWeight: '900',
    letterSpacing: -2.5,
    fontVariant: ['tabular-nums'],
  },
  summaryUnit: {
    color: STUDIO_COLORS.ACCENT_ORANGE,
    fontSize: 26,
    fontWeight: '800',
    marginLeft: 8,
  },
  summaryGrid: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: STUDIO_COLORS.ABYSS_BG,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.BORDER_HAIRLINE,
    borderRadius: 12,
    marginVertical: 20,
  },
  summaryCell: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: STUDIO_COLORS.BORDER_HAIRLINE,
  },
  summaryCellLabel: {
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  summaryCellValue: {
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  tapAgainHint: {
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
});

