import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import {
  StudioStageLayout,
  KeepAliveTabPane,
} from './src/components/StudioStageLayout';
import { FloatingTabBar } from './src/components/FloatingTabBar';
import { DashboardScreen } from './src/components/DashboardScreen';
import { ReflexTestZone } from './src/components/ReflexTestZone';
import { GoNoGoZone, GoNoGoSummary } from './src/components/GoNoGoZone';
import {
  StroopEffectZone,
  StroopSessionResult,
} from './src/components/StroopEffectZone';
import {
  ReflexScorePayload,
  ValidatedScoreRecord,
  scoreIngestionQueue,
} from './src/services/scoreService';
import { STUDIO_COLORS, CognitiveTabId } from './src/theme/designSystem';

export default function App() {
  const [activeTab, setActiveTab] = useState<CognitiveTabId>('DASHBOARD');
  const [isTestLocked, setIsTestLocked] = useState<boolean>(false);
  const [records, setRecords] = useState<ValidatedScoreRecord[]>([]);
  const [stroopBestMs, setStroopBestMs] = useState<number | null>(null);
  const [goNoGoBestMs, setGoNoGoBestMs] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = scoreIngestionQueue.subscribe((updatedRecords) => {
      setRecords(updatedRecords);
    });
    return unsubscribe;
  }, []);

  const handleScoreCaptured = useCallback((payload: ReflexScorePayload) => {
    scoreIngestionQueue.enqueueScore(payload);
  }, []);

  const handleStroopComplete = useCallback((result: StroopSessionResult) => {
    setStroopBestMs((prev) =>
      prev === null || result.averageDecisionMs < prev
        ? result.averageDecisionMs
        : prev
    );
  }, []);

  const handleGoNoGoComplete = useCallback((summary: GoNoGoSummary) => {
    setGoNoGoBestMs((prev) =>
      prev === null || summary.averageGoMs < prev ? summary.averageGoMs : prev
    );
  }, []);

  const handleClearHistory = useCallback(() => {
    scoreIngestionQueue.clearRecords();
    setStroopBestMs(null);
    setGoNoGoBestMs(null);
  }, []);

  const handleSelectTab = useCallback((tab: CognitiveTabId) => {
    setIsTestLocked(false);
    setActiveTab(tab);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <StudioStageLayout activeTab={activeTab}>
        {/* ABA 1: DASHBOARD STUDIO (Mantida em memória - Zero Unmount) */}
        <KeepAliveTabPane isActive={activeTab === 'DASHBOARD'}>
          <DashboardScreen
            records={records}
            stroopBestMs={stroopBestMs}
            goNoGoBestMs={goNoGoBestMs}
            onNavigateTab={handleSelectTab}
            onClearHistory={handleClearHistory}
          />
        </KeepAliveTabPane>

        {/* ABA 2: REAÇÃO SIMPLES (Mantida em memória - Zero Unmount) */}
        <KeepAliveTabPane isActive={activeTab === 'SIMPLE_SPEED'}>
          <ReflexTestZone
            onScoreCaptured={handleScoreCaptured}
            onLockChange={setIsTestLocked}
          />
        </KeepAliveTabPane>

        {/* ABA 3: GO / NO-GO INIBIÇÃO (Mantida em memória - Zero Unmount) */}
        <KeepAliveTabPane isActive={activeTab === 'GO_NO_GO'}>
          <GoNoGoZone
            onSessionComplete={handleGoNoGoComplete}
            onLockChange={setIsTestLocked}
          />
        </KeepAliveTabPane>

        {/* ABA 4: STROOP EFFECT ZERO-GC (Mantida em memória - Zero Unmount) */}
        <KeepAliveTabPane isActive={activeTab === 'STROOP'}>
          <StroopEffectZone
            onSessionComplete={handleStroopComplete}
            onLockChange={setIsTestLocked}
          />
        </KeepAliveTabPane>

        {/* NAVBAR FLUTUANTE 120HZ (UI Thread Reanimated Worklets) */}
        <FloatingTabBar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          locked={isTestLocked}
        />
      </StudioStageLayout>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: STUDIO_COLORS.ABYSS_BG,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
});
