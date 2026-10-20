import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import {
  GLOBAL_LATENCY_HISTOGRAM,
  ValidatedScoreRecord,
} from '../services/scoreService';

interface TelemetryModalProps {
  visible: boolean;
  records: ValidatedScoreRecord[];
  onClose: () => void;
  onClearHistory: () => void;
}

const COLORS = {
  VOID_BLACK: '#0B0B0C',
  CARBON_SURFACE: '#121214',
  ZINC_MUTED: '#18181B',
  BORDER_HAIRLINE: '#27272A',
  TEXT_PRIMARY: '#F4F4F5',
  TEXT_SECONDARY: '#A1A1AA',
  TEXT_MUTED: '#52525B',
  STIMULUS_GREEN: '#00FF66',
  ACCENT_CYAN: '#00E5FF',
} as const;

export const TelemetryModal: React.FC<TelemetryModalProps> = ({
  visible,
  records,
  onClose,
  onClearHistory,
}) => {
  const latestScore = records[0]?.reactionTimeMs ?? null;
  const bestRecord =
    records.length > 0
      ? records.reduce((best, cur) =>
          cur.reactionTimeMs < best.reactionTimeMs ? cur : best
        )
      : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {/* Header do Modal */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTag}>EDGE CDN SNAPSHOT // REDIS ZSET</Text>
            <Text style={styles.headerTitle}>DISTRIBUIÇÃO GLOBAL</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>FECHAR</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Curva de Distribuição Global (Bell Curve Minimalista em Barras) */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              CURVA DE LATÊNCIA HUMANA (HISTOGRAMA GLOBAL)
            </Text>
            <Text style={styles.sectionSub}>
              A faixa iluminada indica onde seu último reflexo ({latestScore ? `${latestScore}ms` : '—'}) se posiciona.
            </Text>

            <View style={styles.histogramContainer}>
              {GLOBAL_LATENCY_HISTOGRAM.map((bucket) => {
                const isUserBucket =
                  latestScore !== null &&
                  latestScore >= bucket.minMs &&
                  latestScore <= bucket.maxMs;

                const barWidthPercent = Math.min(
                  100,
                  Math.round((bucket.populationSharePercent / 28) * 100)
                );

                return (
                  <View key={bucket.rangeLabel} style={styles.bucketRow}>
                    <Text
                      style={[
                        styles.bucketLabel,
                        isUserBucket && styles.bucketLabelActive,
                      ]}
                    >
                      {bucket.rangeLabel}
                    </Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${barWidthPercent}%`,
                            backgroundColor: isUserBucket
                              ? COLORS.ACCENT_CYAN
                              : COLORS.TEXT_MUTED,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.bucketShare,
                        isUserBucket && styles.bucketLabelActive,
                      ]}
                    >
                      {bucket.populationSharePercent.toFixed(1)}%
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Resumo de Recorde Pessoal */}
          {bestRecord && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>MELHOR MARCA VALIDADA (ANTI-CHEAT OK)</Text>
              <View style={styles.bestRow}>
                <Text style={styles.bestScoreText}>
                  {bestRecord.reactionTimeMs} ms
                </Text>
                <View style={styles.bestBadge}>
                  <Text style={styles.bestBadgeText}>
                    TOP {bestRecord.percentileTop}% // {bestRecord.tierLabel}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Log de Ingestão Assíncrona */}
          <View style={styles.sectionCard}>
            <View style={styles.logHeaderRow}>
              <Text style={styles.sectionTitle}>
                LOG DE SESSÃO ({records.length})
              </Text>
              {records.length > 0 && (
                <Pressable onPress={onClearHistory}>
                  <Text style={styles.clearButtonText}>LIMPAR</Text>
                </Pressable>
              )}
            </View>

            {records.length === 0 ? (
              <Text style={styles.emptyText}>
                Nenhuma tentativa validada ainda. Realize um teste para popular a fila assíncrona.
              </Text>
            ) : (
              records.slice(0, 15).map((item, index) => (
                <View key={item.id} style={styles.recordRow}>
                  <Text style={styles.recordIndex}>#{records.length - index}</Text>
                  <Text style={styles.recordMs}>{item.reactionTimeMs} ms</Text>
                  <Text style={styles.recordPercentile}>
                    TOP {item.percentileTop}%
                  </Text>
                  <Text style={styles.recordDelay}>
                    wait {(item.scheduledDelayMs / 1000).toFixed(1)}s
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.VOID_BLACK,
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER_HAIRLINE,
  },
  headerTag: {
    color: COLORS.ACCENT_CYAN,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  headerTitle: {
    color: COLORS.TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  closeButton: {
    borderWidth: 1,
    borderColor: COLORS.BORDER_HAIRLINE,
    backgroundColor: COLORS.ZINC_MUTED,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
  },
  closeButtonText: {
    color: COLORS.TEXT_PRIMARY,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 48,
  },
  sectionCard: {
    backgroundColor: COLORS.CARBON_SURFACE,
    borderWidth: 1,
    borderColor: COLORS.BORDER_HAIRLINE,
    borderRadius: 4,
    padding: 16,
  },
  sectionTitle: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  sectionSub: {
    color: COLORS.TEXT_MUTED,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  histogramContainer: {
    gap: 10,
  },
  bucketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bucketLabel: {
    width: 78,
    color: COLORS.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  bucketLabelActive: {
    color: COLORS.ACCENT_CYAN,
    fontWeight: '800',
  },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: COLORS.VOID_BLACK,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  bucketShare: {
    width: 44,
    textAlign: 'right',
    color: COLORS.TEXT_MUTED,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  bestScoreText: {
    color: COLORS.STIMULUS_GREEN,
    fontSize: 32,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  bestBadge: {
    borderWidth: 1,
    borderColor: COLORS.STIMULUS_GREEN,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  bestBadgeText: {
    color: COLORS.STIMULUS_GREEN,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  logHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  clearButtonText: {
    color: COLORS.TEXT_MUTED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  emptyText: {
    color: COLORS.TEXT_MUTED,
    fontSize: 13,
    lineHeight: 20,
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER_HAIRLINE,
  },
  recordIndex: {
    color: COLORS.TEXT_MUTED,
    fontSize: 12,
    fontWeight: '700',
    width: 36,
    fontVariant: ['tabular-nums'],
  },
  recordMs: {
    color: COLORS.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  recordPercentile: {
    color: COLORS.ACCENT_CYAN,
    fontSize: 11,
    fontWeight: '800',
    marginRight: 14,
    fontVariant: ['tabular-nums'],
  },
  recordDelay: {
    color: COLORS.TEXT_MUTED,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});

