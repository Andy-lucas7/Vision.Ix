import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
} from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import {
  STUDIO_COLORS,
  STUDIO_SURFACES,
  GEOMETRIC_FONT,
  CognitiveTabId,
} from '../theme/designSystem';
import {
  ValidatedScoreRecord,
  GLOBAL_LATENCY_HISTOGRAM,
} from '../services/scoreService';

interface DashboardScreenProps {
  records: ValidatedScoreRecord[];
  stroopBestMs: number | null;
  goNoGoBestMs: number | null;
  onNavigateTab: (tab: CognitiveTabId) => void;
  onClearHistory: () => void;
}

/**
 * ============================================================================
 * MÓDULO 1: DASHBOARD STUDIO (TELEMETRIA, EVOLUÇÃO & STREAK)
 * ============================================================================
 * Estética tridimensional inspirada em estúdio de hardware:
 * - Cards acetinados (#121214 / #1C1C1E) com chanfro iluminado superior.
 * - Gráfico SVG de evolução em milissegundos com preenchimento volumétrico suave.
 * - Indicador de Streak Diário em Laranja Ácido (#FF6B00).
 */
export const DashboardScreen: React.FC<DashboardScreenProps> = React.memo(
  ({
    records,
    stroopBestMs,
    goNoGoBestMs,
    onNavigateTab,
    onClearHistory,
  }) => {
    const bestReflex =
      records.length > 0
        ? Math.min(...records.map((r) => r.reactionTimeMs))
        : null;

    const latestReflex = records[0]?.reactionTimeMs ?? null;
    const avgReflex =
      records.length > 0
        ? Math.round(
            records.reduce((a, b) => a + b.reactionTimeMs, 0) / records.length
          )
        : null;

    // Amostras para o gráfico de linha (ou curva de referência se vazio)
    const chartSamples =
      records.length >= 2
        ? records
            .slice(0, 10)
            .map((r) => r.reactionTimeMs)
            .reverse()
        : [235, 218, 210, 198, 204, 189, 182];

    const minChart = Math.min(...chartSamples) - 15;
    const maxChart = Math.max(...chartSamples) + 15;
    const chartW = 300;
    const chartH = 88;

    const points = chartSamples.map((val, idx) => {
      const x = (idx / Math.max(1, chartSamples.length - 1)) * chartW;
      const ratio = (val - minChart) / Math.max(1, maxChart - minChart);
      const y = chartH - (1 - ratio) * (chartH - 20) - 10;
      return { x, y, val };
    });

    const linePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');

    const areaPath = `${linePath} L ${chartW} ${chartH} L 0 ${chartH} Z`;
    const lastPt = points[points.length - 1];

    return (
      <ScrollView
        style={styles.scrollRoot}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Bar com Identidade & Streak Diário */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.overline}>NEURAL TELEMETRY // 120HZ</Text>
            <Text style={styles.studioTitle}>COGNITIVE LAB</Text>
          </View>

          <View style={styles.streakCapsule}>
            <View style={styles.streakGlowDot} />
            <Text style={styles.streakText}>STREAK // 07 DIAS</Text>
          </View>
        </View>

        {/* HERO CARD 3D: Evolução de Latência (ms) */}
        <View style={[STUDIO_SURFACES.tactileCard, styles.heroChartCard]}>
          <View style={styles.heroCardTop}>
            <View>
              <Text style={styles.cardTag}>ÍNDICE DE VELOCIDADE NEURAL</Text>
              <View style={styles.heroMetricRow}>
                <Text style={styles.heroMetricValue}>
                  {bestReflex !== null ? bestReflex : 182}
                </Text>
                <Text style={styles.heroMetricUnit}>ms</Text>
                {bestReflex === null && (
                  <Text style={styles.demoTag}>REFERÊNCIA</Text>
                )}
              </View>
            </View>

            <View style={styles.rightMiniStats}>
              <Text style={styles.miniStatLabel}>MÉDIA SESSÃO</Text>
              <Text style={styles.miniStatValue}>
                {avgReflex !== null ? `${avgReflex} ms` : '198 ms'}
              </Text>
            </View>
          </View>

          {/* Gráfico SVG Limpo com Gradiente Volumétrico */}
          <View style={styles.svgChartWrapper}>
            <Svg width="100%" height={chartH} viewBox={`0 0 ${chartW} ${chartH}`}>
              <Defs>
                <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={STUDIO_COLORS.ACCENT_ORANGE} stopOpacity="0.32" />
                  <Stop offset="100%" stopColor={STUDIO_COLORS.ACCENT_ORANGE} stopOpacity="0.0" />
                </LinearGradient>
              </Defs>
              <Path d={areaPath} fill="url(#areaGrad)" />
              <Path
                d={linePath}
                fill="none"
                stroke={STUDIO_COLORS.ACCENT_ORANGE}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {lastPt && (
                <Circle
                  cx={lastPt.x}
                  cy={lastPt.y}
                  r="4.5"
                  fill={STUDIO_COLORS.ACCENT_GREEN}
                />
              )}
            </Svg>
          </View>

          <View style={styles.chartFooter}>
            <Text style={styles.chartFooterText}>
              {records.length > 0
                ? `${records.length} AMOSTRAS VALIDADAS PELO MOTOR ANTI-CHEAT`
                : 'TOQUE EM UM MÓDULO ABAIXO PARA CALIBRAR SEU BENCHMARK'}
            </Text>
          </View>
        </View>

        {/* BENTO GRID DE MÓDULOS COGNITIVOS (Atalhos 3D Táteis) */}
        <Text style={styles.sectionHeader}>MÓDULOS DE ALTA PRECISÃO</Text>

        <View style={styles.modulesList}>
          {/* Módulo 1: Simple Speed */}
          <Pressable
            onPressIn={() => onNavigateTab('SIMPLE_SPEED')}
            unstable_pressDelay={0}
            style={[STUDIO_SURFACES.tactileButton, styles.moduleCard]}
          >
            <View style={styles.moduleLeft}>
              <View
                style={[
                  styles.moduleIndicator,
                  { backgroundColor: STUDIO_COLORS.ACCENT_GREEN },
                ]}
              />
              <View>
                <Text style={styles.moduleTitle}>REAÇÃO SIMPLES</Text>
                <Text style={styles.moduleDesc}>
                  Velocidade pura de resposta retiniana ao disparo verde
                </Text>
              </View>
            </View>
            <Text style={[styles.moduleScore, { color: STUDIO_COLORS.ACCENT_GREEN }]}>
              {bestReflex !== null ? `${bestReflex}ms` : 'INICIAR →'}
            </Text>
          </Pressable>

          {/* Módulo 2: Go / No-Go */}
          <Pressable
            onPressIn={() => onNavigateTab('GO_NO_GO')}
            unstable_pressDelay={0}
            style={[STUDIO_SURFACES.tactileButton, styles.moduleCard]}
          >
            <View style={styles.moduleLeft}>
              <View
                style={[
                  styles.moduleIndicator,
                  { backgroundColor: STUDIO_COLORS.ACCENT_CYAN },
                ]}
              />
              <View>
                <Text style={styles.moduleTitle}>GO / NO-GO (INIBIÇÃO)</Text>
                <Text style={styles.moduleDesc}>
                  Controle de impulso e freio cortical sob estímulos rápidos
                </Text>
              </View>
            </View>
            <Text style={[styles.moduleScore, { color: STUDIO_COLORS.ACCENT_CYAN }]}>
              {goNoGoBestMs !== null ? `${goNoGoBestMs}ms` : 'INICIAR →'}
            </Text>
          </Pressable>

          {/* Módulo 3: Stroop Effect */}
          <Pressable
            onPressIn={() => onNavigateTab('STROOP')}
            unstable_pressDelay={0}
            style={[STUDIO_SURFACES.tactileButton, styles.moduleCard]}
          >
            <View style={styles.moduleLeft}>
              <View
                style={[
                  styles.moduleIndicator,
                  { backgroundColor: STUDIO_COLORS.ACCENT_ORANGE },
                ]}
              />
              <View>
                <Text style={styles.moduleTitle}>STROOP EFFECT</Text>
                <Text style={styles.moduleDesc}>
                  Conflito semântico cor vs palavra com buffer Zero-GC
                </Text>
              </View>
            </View>
            <Text style={[styles.moduleScore, { color: STUDIO_COLORS.ACCENT_ORANGE }]}>
              {stroopBestMs !== null ? `${stroopBestMs}ms` : 'INICIAR →'}
            </Text>
          </Pressable>
        </View>

        {/* Histograma Global de Distribuição */}
        <View style={[STUDIO_SURFACES.tactileCard, styles.histogramCard]}>
          <View style={styles.histogramHeader}>
            <Text style={styles.cardTag}>CURVA DE DISTRIBUIÇÃO GLOBAL</Text>
            {records.length > 0 && (
              <Pressable onPress={onClearHistory}>
                <Text style={styles.resetText}>ZERAR DADOS</Text>
              </Pressable>
            )}
          </View>

          {GLOBAL_LATENCY_HISTOGRAM.map((bucket) => {
            const active =
              latestReflex !== null &&
              latestReflex >= bucket.minMs &&
              latestReflex <= bucket.maxMs;
            const widthPct = Math.min(
              100,
              Math.round((bucket.populationSharePercent / 28) * 100)
            );
            return (
              <View key={bucket.rangeLabel} style={styles.histRow}>
                <Text style={[styles.histLabel, active && styles.histLabelActive]}>
                  {bucket.rangeLabel}
                </Text>
                <View style={styles.histTrack}>
                  <View
                    style={[
                      styles.histFill,
                      {
                        width: `${widthPct}%`,
                        backgroundColor: active
                          ? STUDIO_COLORS.ACCENT_GREEN
                          : '#2E2E34',
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.histPct, active && styles.histLabelActive]}>
                  {bucket.populationSharePercent.toFixed(1)}%
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  }
);

const styles = StyleSheet.create({
  scrollRoot: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 120,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  overline: {
    color: STUDIO_COLORS.ACCENT_ORANGE,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  studioTitle: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginTop: 2,
  },
  streakCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: STUDIO_COLORS.SATIN_GRAPHITE,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.RIM_LIGHT_TOP,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  streakGlowDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: STUDIO_COLORS.ACCENT_ORANGE,
  },
  streakText: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  heroChartCard: {
    padding: 20,
  },
  heroCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  cardTag: {
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  heroMetricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  heroMetricValue: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontFamily: GEOMETRIC_FONT,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  },
  heroMetricUnit: {
    color: STUDIO_COLORS.ACCENT_ORANGE,
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 6,
  },
  demoTag: {
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginLeft: 10,
  },
  rightMiniStats: {
    alignItems: 'flex-end',
  },
  miniStatLabel: {
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  miniStatValue: {
    color: STUDIO_COLORS.ACCENT_CYAN,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  svgChartWrapper: {
    height: 92,
    width: '100%',
    marginVertical: 4,
  },
  chartFooter: {
    borderTopWidth: 1,
    borderTopColor: STUDIO_COLORS.BORDER_HAIRLINE,
    paddingTop: 12,
    marginTop: 6,
  },
  chartFooterText: {
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  sectionHeader: {
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginTop: 4,
  },
  modulesList: {
    gap: 10,
  },
  moduleCard: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moduleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    paddingRight: 10,
  },
  moduleIndicator: {
    width: 4,
    height: 34,
    borderRadius: 2,
  },
  moduleTitle: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  moduleDesc: {
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 12,
    marginTop: 3,
  },
  moduleScore: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  histogramCard: {
    padding: 18,
    gap: 8,
  },
  histogramHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  resetText: {
    color: STUDIO_COLORS.ACCENT_RED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  histLabel: {
    width: 72,
    color: STUDIO_COLORS.TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  histLabelActive: {
    color: STUDIO_COLORS.ACCENT_GREEN,
    fontWeight: '900',
  },
  histTrack: {
    flex: 1,
    height: 8,
    backgroundColor: STUDIO_COLORS.ABYSS_BG,
    borderRadius: 4,
    overflow: 'hidden',
  },
  histFill: {
    height: '100%',
    borderRadius: 4,
  },
  histPct: {
    width: 40,
    textAlign: 'right',
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

