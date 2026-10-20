import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  GestureResponderEvent,
} from 'react-native';
import {
  ReflexScorePayload,
  calculateGlobalPercentile,
  calculateJitterStdDev,
  GLOBAL_MEDIAN_MS,
} from '../services/scoreService';
import {
  STUDIO_COLORS,
  STUDIO_SURFACES,
  GEOMETRIC_FONT,
} from '../theme/designSystem';

const TIMING_CONFIG = {
  MIN_WAIT_MS: 2000,
  MAX_WAIT_MS: 5000,
  HUMAN_MIN_LIMIT_MS: 100,
} as const;

type TestPhase = 'IDLE' | 'WAITING' | 'NOW' | 'EARLY_ERROR' | 'RESULT';

interface ReflexTestZoneProps {
  onScoreCaptured?: (payload: ReflexScorePayload) => void;
  onLockChange?: (locked: boolean) => void;
}

export const ReflexTestZone: React.FC<ReflexTestZoneProps> = ({
  onScoreCaptured,
  onLockChange,
}) => {
  const [phase, setPhase] = useState<TestPhase>('IDLE');
  const [lastScoreMs, setLastScoreMs] = useState<number | null>(null);
  const [bestScoreMs, setBestScoreMs] = useState<number | null>(null);
  const [errorReason, setErrorReason] = useState<'PREMATURE' | 'ANTICHEAT' | null>(null);

  const phaseRef = useRef<TestPhase>('IDLE');
  const timerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stimulusTimeRef = useRef<number>(0);
  const scheduledDelayRef = useRef<number>(0);
  const historyRef = useRef<number[]>([]);

  const transitionPhase = useCallback(
    (nextPhase: TestPhase) => {
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
      onLockChange?.(nextPhase === 'WAITING' || nextPhase === 'NOW');
    },
    [onLockChange]
  );

  const clearPendingTimer = useCallback(() => {
    if (timerIdRef.current !== null) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearPendingTimer();
  }, [clearPendingTimer]);

  const startWaitingCycle = useCallback(() => {
    clearPendingTimer();
    setErrorReason(null);
    stimulusTimeRef.current = 0;

    const randomDelay =
      Math.floor(
        Math.random() * (TIMING_CONFIG.MAX_WAIT_MS - TIMING_CONFIG.MIN_WAIT_MS + 1)
      ) + TIMING_CONFIG.MIN_WAIT_MS;

    scheduledDelayRef.current = randomDelay;
    transitionPhase('WAITING');

    timerIdRef.current = setTimeout(() => {
      timerIdRef.current = null;
      stimulusTimeRef.current = performance.now();
      transitionPhase('NOW');
    }, randomDelay);
  }, [clearPendingTimer, transitionPhase]);

  const handleTouchDown = useCallback(
    (_event: GestureResponderEvent) => {
      const touchTimestamp = performance.now();
      const currentPhase = phaseRef.current;

      if (currentPhase === 'WAITING') {
        clearPendingTimer();
        setErrorReason('PREMATURE');
        transitionPhase('EARLY_ERROR');
        return;
      }

      if (currentPhase === 'NOW') {
        const rawDeltaMs = touchTimestamp - stimulusTimeRef.current;
        const preciseMs = Math.round(rawDeltaMs);

        if (preciseMs < TIMING_CONFIG.HUMAN_MIN_LIMIT_MS) {
          setErrorReason('ANTICHEAT');
          transitionPhase('EARLY_ERROR');
          return;
        }

        setLastScoreMs(preciseMs);
        setBestScoreMs((prevBest) =>
          prevBest === null || preciseMs < prevBest ? preciseMs : prevBest
        );

        historyRef.current = [preciseMs, ...historyRef.current.slice(0, 4)];
        transitionPhase('RESULT');

        if (onScoreCaptured) {
          const payload: ReflexScorePayload = {
            reactionTimeMs: preciseMs,
            stimulusTimestamp: stimulusTimeRef.current,
            inputTimestamp: touchTimestamp,
            scheduledDelayMs: scheduledDelayRef.current,
            isValid: true,
          };
          queueMicrotask(() => {
            onScoreCaptured(payload);
          });
        }
        return;
      }

      if (
        currentPhase === 'IDLE' ||
        currentPhase === 'RESULT' ||
        currentPhase === 'EARLY_ERROR'
      ) {
        startWaitingCycle();
      }
    },
    [clearPendingTimer, onScoreCaptured, startWaitingCycle, transitionPhase]
  );

  const backgroundColor =
    phase === 'NOW'
      ? STUDIO_COLORS.ACCENT_GREEN
      : phase === 'EARLY_ERROR'
      ? STUDIO_COLORS.ACCENT_RED
      : STUDIO_COLORS.MATTE_OBSIDIAN;

  const averageMs =
    phase === 'RESULT' && historyRef.current.length > 0
      ? Math.round(
          historyRef.current.reduce((acc, cur) => acc + cur, 0) /
            historyRef.current.length
        )
      : null;

  const jitterMs =
    phase === 'RESULT' ? calculateJitterStdDev(historyRef.current) : null;

  const percentileInfo =
    phase === 'RESULT' && lastScoreMs !== null
      ? calculateGlobalPercentile(lastScoreMs)
      : null;

  return (
    <View style={styles.rootContainer}>
      {/* Header Técnico Minimalista */}
      <View style={styles.topTelemetryBar}>
        <View>
          <Text style={styles.telemetryLabel}>SIMPLE SPEED // REFLEX.02</Text>
          <Text style={styles.telemetryStatus}>
            {phase === 'WAITING'
              ? 'ARMED // LOCKED'
              : phase === 'NOW'
              ? 'TRIGGERED // 120HZ'
              : 'STANDBY'}
          </Text>
        </View>

        <View style={styles.telemetryCellRight}>
          <Text style={styles.telemetryLabel}>RECORDE (PR)</Text>
          <Text style={styles.telemetryValue}>
            {bestScoreMs !== null ? `${bestScoreMs} ms` : '—'}
          </Text>
        </View>
      </View>

      {/* Card 3D Flutuante de Toque (Delay Zero) */}
      <Pressable
        onPressIn={handleTouchDown}
        unstable_pressDelay={0}
        android_disableSound={true}
        style={[
          STUDIO_SURFACES.tactileCard,
          styles.touchZone,
          { backgroundColor },
        ]}
      >
        {phase === 'IDLE' && (
          <View style={styles.centerContent}>
            <View style={styles.reticleBadge}>
              <Text style={styles.reticleBadgeText}>ISOLAMENTO SUB-MS</Text>
            </View>
            <Text style={styles.heroTitle}>REAÇÃO SIMPLES</Text>
            <Text style={styles.instructionText}>
              Toque no card para armar o sensor.{'\n'}
              Quando a superfície ficar{' '}
              <Text style={styles.neonHighlight}>VERDE ELÉTRICO</Text>, reaja imediatamente.
            </Text>
          </View>
        )}

        {phase === 'WAITING' && (
          <View style={styles.centerContent}>
            <View style={styles.crosshairHorizontal} />
            <View style={styles.crosshairVertical} />
            <Text style={styles.waitingPrompt}>AGUARDE O VERDE</Text>
          </View>
        )}

        {phase === 'NOW' && (
          <View style={styles.centerContent}>
            <Text style={styles.stimulusActionText}>CLIQUE AGORA</Text>
          </View>
        )}

        {phase === 'EARLY_ERROR' && (
          <View style={styles.centerContent}>
            <Text style={styles.errorTag}>
              {errorReason === 'ANTICHEAT'
                ? 'LATÊNCIA INVÁLIDA (< 100ms)'
                : 'QUEIMA DE LARGADA'}
            </Text>
            <Text style={styles.errorTitle}>TENTATIVA ANTECIPADA</Text>
            <Text style={styles.errorSubtext}>
              {errorReason === 'ANTICHEAT'
                ? 'Toque detectado abaixo do limite fisiológico humano (100ms).'
                : 'Você tocou antes da superfície mudar para Verde Elétrico.'}
            </Text>
            <View style={styles.retryPill}>
              <Text style={styles.retryPillText}>TOQUE PARA REINICIAR</Text>
            </View>
          </View>
        )}

        {phase === 'RESULT' && lastScoreMs !== null && (
          <View style={styles.centerContent}>
            <Text style={styles.scoreLabel}>TEMPO DE REAÇÃO</Text>

            <View style={styles.scoreRow}>
              <Text style={styles.heroScoreNumber}>{lastScoreMs}</Text>
              <Text style={styles.heroScoreUnit}>ms</Text>
            </View>

            {percentileInfo && (
              <View style={styles.percentileBadge}>
                <Text style={styles.percentileBadgeText}>
                  TOP {percentileInfo.percentileTop}% GLOBAL — {percentileInfo.tierLabel} (MÉDIA {GLOBAL_MEDIAN_MS}ms)
                </Text>
              </View>
            )}

            <View style={styles.bentoMetricsGrid}>
              <View style={styles.bentoCell}>
                <Text style={styles.bentoCellLabel}>MÉDIA (5x)</Text>
                <Text style={styles.bentoCellValue}>
                  {averageMs !== null ? `${averageMs} ms` : '—'}
                </Text>
              </View>
              <View style={styles.bentoDivider} />
              <View style={styles.bentoCell}>
                <Text style={styles.bentoCellLabel}>JITTER (σ)</Text>
                <Text style={styles.bentoCellValue}>
                  {jitterMs !== null ? `±${jitterMs} ms` : '—'}
                </Text>
              </View>
              <View style={styles.bentoDivider} />
              <View style={styles.bentoCell}>
                <Text style={styles.bentoCellLabel}>AMOSTRAS</Text>
                <Text style={styles.bentoCellValue}>
                  {historyRef.current.length} / 5
                </Text>
              </View>
            </View>

            <View style={styles.samplesStrip}>
              {[0, 1, 2, 3, 4].map((idx) => {
                const sample = historyRef.current[idx];
                return (
                  <View key={idx} style={styles.sampleChip}>
                    <Text style={styles.sampleChipIndex}>T{idx + 1}</Text>
                    <Text style={styles.sampleChipValue}>
                      {sample !== undefined ? `${sample}` : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.tapToContinueText}>
              TOQUE EM QUALQUER LUGAR PARA NOVA RODADA
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 96,
  },
  topTelemetryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: STUDIO_COLORS.BORDER_HAIRLINE,
    paddingVertical: 14,
    marginBottom: 16,
  },
  telemetryCellRight: {
    alignItems: 'flex-end',
  },
  telemetryLabel: {
    color: STUDIO_COLORS.ACCENT_GREEN,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  telemetryStatus: {
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.6,
  },
  telemetryValue: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  touchZone: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 440,
  },
  reticleBadge: {
    borderWidth: 1,
    borderColor: STUDIO_COLORS.ACCENT_GREEN,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 16,
  },
  reticleBadgeText: {
    color: STUDIO_COLORS.ACCENT_GREEN,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  heroTitle: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
    textAlign: 'center',
    marginBottom: 14,
  },
  instructionText: {
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  neonHighlight: {
    color: STUDIO_COLORS.ACCENT_GREEN,
    fontWeight: '800',
  },
  crosshairHorizontal: {
    width: 32,
    height: 1,
    backgroundColor: STUDIO_COLORS.TEXT_MUTED,
    position: 'absolute',
    top: -32,
  },
  crosshairVertical: {
    width: 1,
    height: 32,
    backgroundColor: STUDIO_COLORS.TEXT_MUTED,
    position: 'absolute',
    top: -48,
  },
  waitingPrompt: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 3.2,
  },
  stimulusActionText: {
    color: STUDIO_COLORS.ABYSS_BG,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  errorTag: {
    color: STUDIO_COLORS.ABYSS_BG,
    backgroundColor: STUDIO_COLORS.TEXT_PRIMARY,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    borderRadius: 4,
    marginBottom: 14,
  },
  errorTitle: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    textAlign: 'center',
    marginBottom: 10,
  },
  errorSubtext: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    opacity: 0.9,
    marginBottom: 28,
  },
  retryPill: {
    borderWidth: 1,
    borderColor: STUDIO_COLORS.TEXT_PRIMARY,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryPillText: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  scoreLabel: {
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 14,
  },
  heroScoreNumber: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 88,
    fontWeight: '900',
    letterSpacing: -3,
    fontVariant: ['tabular-nums'],
  },
  heroScoreUnit: {
    color: STUDIO_COLORS.ACCENT_GREEN,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 26,
    fontWeight: '800',
    marginLeft: 8,
  },
  percentileBadge: {
    borderWidth: 1,
    borderColor: STUDIO_COLORS.ACCENT_CYAN,
    backgroundColor: STUDIO_COLORS.ABYSS_BG,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 20,
  },
  percentileBadgeText: {
    color: STUDIO_COLORS.ACCENT_CYAN,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    textAlign: 'center',
  },
  bentoMetricsGrid: {
    flexDirection: 'row',
    backgroundColor: STUDIO_COLORS.ABYSS_BG,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.BORDER_HAIRLINE,
    borderRadius: 10,
    width: '100%',
    marginBottom: 10,
  },
  bentoCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  bentoDivider: {
    width: 1,
    backgroundColor: STUDIO_COLORS.BORDER_HAIRLINE,
  },
  bentoCellLabel: {
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  bentoCellValue: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  samplesStrip: {
    flexDirection: 'row',
    width: '100%',
    gap: 6,
    marginBottom: 26,
  },
  sampleChip: {
    flex: 1,
    backgroundColor: STUDIO_COLORS.ABYSS_BG,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.BORDER_HAIRLINE,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  sampleChipIndex: {
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 9,
    fontWeight: '700',
  },
  sampleChipValue: {
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  tapToContinueText: {
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
});

export default ReflexTestZone;
