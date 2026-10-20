import React, { useState, useRef, useCallback, useEffect } from 'react';
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
 * MÓDULO 3: GO / NO-GO (INIBIÇÃO COGNITIVA SOB PRESSÃO)
 * ============================================================================
 * - Estímulo GO (Verde Elétrico #00FF66 - CÍRCULO): Toque imediatamente!
 * - Estímulo NO-GO (Vermelho Puro #FF3333 - QUADRADO BLOQUEADO): NÃO TOQUE!
 *   Se o usuário segurar o impulso por 950ms, avança automaticamente.
 * - Usa fita binária pré-alocada (`Uint8Array`) para evitar GC durante o teste.
 */
const TOTAL_TRIALS = 8;
const NOGO_HOLD_DURATION_MS = 950;
const GONOGO_TAPE = new Uint8Array(TOTAL_TRIALS);

function populateGoNoGoTape(): void {
  // Garante ~65% GO (1) e ~35% NO-GO (0) para induzir hábito motor antes da inibição
  for (let i = 0; i < TOTAL_TRIALS; i++) {
    GONOGO_TAPE[i] = Math.random() < 0.65 ? 1 : 0;
  }
  // Garante pelo menos 2 NO-GO na bateria
  GONOGO_TAPE[2] = 0;
  GONOGO_TAPE[6] = 0;
}

populateGoNoGoTape();

type GoNoGoPhase = 'IDLE' | 'WAITING' | 'GO_SIGNAL' | 'NOGO_SIGNAL' | 'ERROR' | 'SUMMARY';

export interface GoNoGoSummary {
  averageGoMs: number;
  inhibitionSuccessRate: number;
}

interface GoNoGoZoneProps {
  onSessionComplete?: (summary: GoNoGoSummary) => void;
  onLockChange?: (locked: boolean) => void;
}

export const GoNoGoZone: React.FC<GoNoGoZoneProps> = ({
  onSessionComplete,
  onLockChange,
}) => {
  const [phase, setPhase] = useState<GoNoGoPhase>('IDLE');
  const [trialIndex, setTrialIndex] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [summary, setSummary] = useState<GoNoGoSummary | null>(null);

  const phaseRef = useRef<GoNoGoPhase>('IDLE');
  const trialRef = useRef<number>(0);
  const stimulusTimeRef = useRef<number>(0);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noGoHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goDeltasRef = useRef<number[]>([]);
  const commissionErrorsRef = useRef<number>(0);

  const clearTimers = useCallback(() => {
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    if (noGoHoldTimerRef.current) {
      clearTimeout(noGoHoldTimerRef.current);
      noGoHoldTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const setPhaseSync = useCallback(
    (next: GoNoGoPhase) => {
      phaseRef.current = next;
      setPhase(next);
      onLockChange?.(
        next === 'WAITING' || next === 'GO_SIGNAL' || next === 'NOGO_SIGNAL'
      );
    },
    [onLockChange]
  );

  const scheduleNextTrial = useCallback(
    (nextIndex: number) => {
      clearTimers();

      if (nextIndex >= TOTAL_TRIALS) {
        const samples = goDeltasRef.current;
        const avg =
          samples.length > 0
            ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
            : 0;
        const inhibitionRate = Math.max(
          0,
          Math.round(
            ((TOTAL_TRIALS - commissionErrorsRef.current) / TOTAL_TRIALS) * 100
          )
        );
        const result: GoNoGoSummary = {
          averageGoMs: avg,
          inhibitionSuccessRate: inhibitionRate,
        };
        setSummary(result);
        setPhaseSync('SUMMARY');
        if (onSessionComplete && avg > 0) {
          queueMicrotask(() => onSessionComplete(result));
        }
        return;
      }

      trialRef.current = nextIndex;
      setTrialIndex(nextIndex);
      setPhaseSync('WAITING');

      const delay = Math.floor(Math.random() * 1400) + 900; // 900ms a 2300ms
      waitTimerRef.current = setTimeout(() => {
        const isGo = GONOGO_TAPE[nextIndex] === 1;
        stimulusTimeRef.current = performance.now();

        if (isGo) {
          setPhaseSync('GO_SIGNAL');
        } else {
          setPhaseSync('NOGO_SIGNAL');
          // Se o usuário inibir o toque por 950ms com sucesso, avança!
          noGoHoldTimerRef.current = setTimeout(() => {
            scheduleNextTrial(nextIndex + 1);
          }, NOGO_HOLD_DURATION_MS);
        }
      }, delay);
    },
    [clearTimers, onSessionComplete, setPhaseSync]
  );

  const startBattery = useCallback(() => {
    populateGoNoGoTape();
    goDeltasRef.current = [];
    commissionErrorsRef.current = 0;
    scheduleNextTrial(0);
  }, [scheduleNextTrial]);

  const handleTouch = useCallback(() => {
    const now = performance.now();
    const currentPhase = phaseRef.current;

    if (currentPhase === 'IDLE' || currentPhase === 'SUMMARY') {
      startBattery();
      return;
    }

    if (currentPhase === 'ERROR') {
      scheduleNextTrial(trialRef.current);
      return;
    }

    if (currentPhase === 'WAITING') {
      clearTimers();
      commissionErrorsRef.current += 1;
      setErrorMessage('Toque antecipado antes do estímulo aparecer.');
      setPhaseSync('ERROR');
      return;
    }

    if (currentPhase === 'NOGO_SIGNAL') {
      clearTimers();
      commissionErrorsRef.current += 1;
      setErrorMessage('FALHA DE INIBIÇÃO! Você tocou no sinal VERMELHO (NO-GO).');
      setPhaseSync('ERROR');
      return;
    }

    if (currentPhase === 'GO_SIGNAL') {
      const delta = Math.round(now - stimulusTimeRef.current);
      if (delta < 95) {
        clearTimers();
        commissionErrorsRef.current += 1;
        setErrorMessage('Toque abaixo do limite fisiológico (< 95ms).');
        setPhaseSync('ERROR');
        return;
      }
      goDeltasRef.current.push(delta);
      scheduleNextTrial(trialRef.current + 1);
    }
  }, [clearTimers, scheduleNextTrial, setPhaseSync, startBattery]);

  const zoneBg =
    phase === 'GO_SIGNAL'
      ? STUDIO_COLORS.ACCENT_GREEN
      : phase === 'NOGO_SIGNAL'
      ? '#1E090C'
      : STUDIO_COLORS.MATTE_OBSIDIAN;

  return (
    <View style={styles.container}>
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.moduleCode}>INHIBITION // GO-NOGO.03</Text>
          <Text style={styles.moduleSubtitle}>CONTROLE DE IMPULSO MOTOR</Text>
        </View>
        <View style={styles.stepPill}>
          <Text style={styles.stepPillText}>
            {phase === 'IDLE' || phase === 'SUMMARY'
              ? `${TOTAL_TRIALS} TRIALS`
              : `${trialIndex + 1} / ${TOTAL_TRIALS}`}
          </Text>
        </View>
      </View>

      <Pressable
        onPressIn={handleTouch}
        unstable_pressDelay={0}
        android_disableSound={true}
        style={[
          STUDIO_SURFACES.tactileCard,
          styles.arenaCard,
          { backgroundColor: zoneBg },
          phase === 'NOGO_SIGNAL' && styles.noGoBorder,
        ]}
      >
        {phase === 'IDLE' && (
          <View style={styles.centerBox}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>FREIO CORTICAL</Text>
            </View>
            <Text style={styles.title}>GO / NO-GO</Text>
            <Text style={styles.desc}>
              Toque instantaneamente quando o alvo for{' '}
              <Text style={{ color: STUDIO_COLORS.ACCENT_GREEN, fontWeight: '800' }}>
                VERDE (GO)
              </Text>
              .{'\n'}
              Segure o impulso e <Text style={{ color: STUDIO_COLORS.ACCENT_RED, fontWeight: '800' }}>NÃO TOQUE</Text> se aparecer o bloqueio vermelho.
            </Text>
            <View style={styles.startCta}>
              <Text style={styles.startCtaText}>TOQUE PARA INICIAR</Text>
            </View>
          </View>
        )}

        {phase === 'WAITING' && (
          <View style={styles.centerBox}>
            <View style={styles.aimDot} />
            <Text style={styles.waitingText}>PREPARADO...</Text>
          </View>
        )}

        {phase === 'GO_SIGNAL' && (
          <View style={styles.centerBox}>
            <View style={styles.goCircle} />
            <Text style={styles.goActionText}>GO // CLIQUE</Text>
          </View>
        )}

        {phase === 'NOGO_SIGNAL' && (
          <View style={styles.centerBox}>
            <View style={styles.noGoSquare} />
            <Text style={styles.noGoActionText}>NO-GO // NÃO TOQUE</Text>
          </View>
        )}

        {phase === 'ERROR' && (
          <View style={styles.centerBox}>
            <Text style={styles.errorTag}>ERRO DE COMISSÃO</Text>
            <Text style={styles.errorHeadline}>IMPULSO DETECTADO</Text>
            <Text style={styles.errorDesc}>{errorMessage}</Text>
            <View style={styles.retryPill}>
              <Text style={styles.retryPillText}>TOQUE PARA RETOMAR</Text>
            </View>
          </View>
        )}

        {phase === 'SUMMARY' && summary && (
          <View style={styles.centerBox}>
            <Text style={styles.summaryOverline}>LATÊNCIA DISCRIMINATIVA (GO)</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.heroMs}>{summary.averageGoMs}</Text>
              <Text style={styles.heroUnit}>ms</Text>
            </View>
            <View style={styles.statBadge}>
              <Text style={styles.statBadgeText}>
                CONTROLE INIBITÓRIO: {summary.inhibitionSuccessRate}%
              </Text>
            </View>
            <Text style={styles.tapHint}>TOQUE PARA NOVA SESSÃO</Text>
          </View>
        )}
      </Pressable>
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
    marginBottom: 16,
  },
  moduleCode: {
    color: STUDIO_COLORS.ACCENT_CYAN,
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
  },
  arenaCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  noGoBorder: {
    borderColor: STUDIO_COLORS.ACCENT_RED,
    borderTopColor: STUDIO_COLORS.ACCENT_RED,
    borderWidth: 2,
  },
  centerBox: {
    alignItems: 'center',
    maxWidth: 380,
  },
  badge: {
    borderWidth: 1,
    borderColor: STUDIO_COLORS.ACCENT_CYAN,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 16,
  },
  badgeText: {
    color: STUDIO_COLORS.ACCENT_CYAN,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  desc: {
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  startCta: {
    backgroundColor: STUDIO_COLORS.ACCENT_CYAN,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
  },
  startCtaText: {
    color: STUDIO_COLORS.ABYSS_BG,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  aimDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: STUDIO_COLORS.TEXT_MUTED,
    marginBottom: 18,
  },
  waitingText: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 3,
  },
  goCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 5,
    borderColor: STUDIO_COLORS.ABYSS_BG,
    marginBottom: 18,
  },
  goActionText: {
    color: STUDIO_COLORS.ABYSS_BG,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1,
  },
  noGoSquare: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 4,
    borderColor: STUDIO_COLORS.ACCENT_RED,
    marginBottom: 18,
  },
  noGoActionText: {
    color: STUDIO_COLORS.ACCENT_RED,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  errorTag: {
    color: STUDIO_COLORS.ACCENT_RED,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  errorHeadline: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 10,
  },
  errorDesc: {
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryPill: {
    borderWidth: 1,
    borderColor: STUDIO_COLORS.RIM_LIGHT_TOP,
    backgroundColor: STUDIO_COLORS.SATIN_GRAPHITE,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryPillText: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  summaryOverline: {
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginVertical: 12,
  },
  heroMs: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 80,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2.5,
  },
  heroUnit: {
    color: STUDIO_COLORS.ACCENT_CYAN,
    fontSize: 26,
    fontWeight: '800',
    marginLeft: 8,
  },
  statBadge: {
    borderWidth: 1,
    borderColor: STUDIO_COLORS.ACCENT_CYAN,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 24,
  },
  statBadgeText: {
    color: STUDIO_COLORS.ACCENT_CYAN,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  tapHint: {
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
});

