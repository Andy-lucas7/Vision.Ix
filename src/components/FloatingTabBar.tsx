import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  LayoutChangeEvent,
} from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { STUDIO_COLORS, CognitiveTabId } from '../theme/designSystem';

interface TabDefinition {
  id: CognitiveTabId;
  label: string;
  accentColor: string;
}

const TABS: readonly TabDefinition[] = [
  { id: 'DASHBOARD', label: 'STUDIO', accentColor: STUDIO_COLORS.ACCENT_ORANGE },
  { id: 'SIMPLE_SPEED', label: 'REFLEX', accentColor: STUDIO_COLORS.ACCENT_GREEN },
  { id: 'GO_NO_GO', label: 'INIBIÇÃO', accentColor: STUDIO_COLORS.ACCENT_CYAN },
  { id: 'STROOP', label: 'STROOP', accentColor: STUDIO_COLORS.ACCENT_ORANGE },
] as const;

/**
 * Mola física calibrada para 120 FPS na UI Thread
 */
const TAB_SPRING_CONFIG = {
  mass: 0.55,
  damping: 19,
  stiffness: 240,
  overshootClamping: false,
} as const;

interface FloatingTabBarProps {
  activeTab: CognitiveTabId;
  onSelectTab: (tab: CognitiveTabId) => void;
  /**
   * Quando um teste está armado (WAITING/NOW), a barra atenua sua opacidade
   * e bloqueia toques para evitar cliques acidentais fora da zona de teste.
   */
  locked?: boolean;
}

/**
 * Ícones Geométricos Ultra-Minimalistas (1.75px stroke)
 */
const GeometricTabIcon: React.FC<{ id: CognitiveTabId; color: string }> = React.memo(
  ({ id, color }) => {
    switch (id) {
      case 'DASHBOARD':
        return (
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Rect x="3" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" />
            <Rect x="14" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" />
            <Rect x="3" y="14" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" />
            <Rect x="14" y="14" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" />
          </Svg>
        );
      case 'SIMPLE_SPEED':
        return (
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M13 2L4 14H12L11 22L20 10H12L13 2Z"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        );
      case 'GO_NO_GO':
        return (
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
            <Circle cx="12" cy="12" r="3.5" fill={color} />
          </Svg>
        );
      case 'STROOP':
        return (
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 3L21 19H3L12 3Z"
              stroke={color}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <Circle cx="12" cy="14" r="2" fill={color} />
          </Svg>
        );
    }
  }
);

/**
 * ============================================================================
 * 2. ADVANCED TABBAR COMPONENT (FloatingTabBar)
 * ============================================================================
 * Barra inferior flutuante com acabamento acetinado 3D (#141417),
 * chanfro superior iluminado (#2E2E34) e pílula deslizante animada 100%
 * por Worklets na UI Thread via `react-native-reanimated`.
 */
export const FloatingTabBar: React.FC<FloatingTabBarProps> = React.memo(
  ({ activeTab, onSelectTab, locked = false }) => {
    const activeIndex = TABS.findIndex((t) => t.id === activeTab);
    const tabWidthSV = useSharedValue(0);
    const activeIndexSV = useSharedValue(activeIndex);
    const barLockSV = useSharedValue(locked ? 1 : 0);

    useEffect(() => {
      activeIndexSV.value = withSpring(activeIndex, TAB_SPRING_CONFIG);
    }, [activeIndex, activeIndexSV]);

    useEffect(() => {
      barLockSV.value = withSpring(locked ? 1 : 0, {
        mass: 0.5,
        damping: 20,
        stiffness: 220,
      });
    }, [locked, barLockSV]);

    const handleTrackLayout = (e: LayoutChangeEvent) => {
      const totalWidth = e.nativeEvent.layout.width;
      tabWidthSV.value = totalWidth / TABS.length;
    };

    /**
     * Worklet na UI Thread que move fisicamente o indicador de superfície
     * elevada sob o ícone selecionado a 120 FPS.
     */
    const slidingPillStyle = useAnimatedStyle(() => {
      'worklet';
      return {
        width: tabWidthSV.value > 0 ? tabWidthSV.value : '25%',
        transform: [
          {
            translateX: activeIndexSV.value * tabWidthSV.value,
          },
        ],
      };
    });

    const containerLockStyle = useAnimatedStyle(() => {
      'worklet';
      return {
        opacity: 1 - barLockSV.value * 0.82,
        transform: [
          {
            translateY: barLockSV.value * 10,
          },
        ],
      };
    });

    const currentAccent = TABS[activeIndex]?.accentColor ?? STUDIO_COLORS.ACCENT_ORANGE;

    return (
      <Animated.View
        pointerEvents={locked ? 'none' : 'box-none'}
        style={[styles.floatingWrapper, containerLockStyle]}
      >
        <View style={styles.dockCapsule}>
          <View style={styles.tabsTrack} onLayout={handleTrackLayout}>
            {/* Pílula 3D Deslizante (UI Thread Worklet) */}
            <Animated.View style={[styles.slidingPill, slidingPillStyle]}>
              <View style={styles.slidingPillInner}>
                <View
                  style={[
                    styles.pillTopLaser,
                    { backgroundColor: currentAccent },
                  ]}
                />
              </View>
            </Animated.View>

            {/* Botões das 4 Abas */}
            {TABS.map((tab) => {
              const isSelected = tab.id === activeTab;
              const iconColor = isSelected
                ? tab.accentColor
                : STUDIO_COLORS.TEXT_MUTED;

              return (
                <Pressable
                  key={tab.id}
                  onPressIn={() => onSelectTab(tab.id)}
                  unstable_pressDelay={0}
                  android_disableSound={true}
                  style={styles.tabButton}
                >
                  <GeometricTabIcon id={tab.id} color={iconColor} />
                  <Text
                    style={[
                      styles.tabLabel,
                      isSelected && styles.tabLabelActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Animated.View>
    );
  }
);

const styles = StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 50,
  },
  dockCapsule: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#131316',
    borderRadius: 22,
    padding: 5,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.BORDER_HAIRLINE,
    borderTopColor: STUDIO_COLORS.RIM_LIGHT_TOP,
    // Sombra profunda de estúdio 3D
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.78,
    shadowRadius: 24,
    elevation: 18,
  },
  tabsTrack: {
    flexDirection: 'row',
    position: 'relative',
    height: 54,
    alignItems: 'center',
  },
  slidingPill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    padding: 2,
  },
  slidingPillInner: {
    flex: 1,
    backgroundColor: STUDIO_COLORS.SATIN_GRAPHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272C',
    borderTopColor: '#3A3A42',
    alignItems: 'center',
    overflow: 'hidden',
  },
  pillTopLaser: {
    width: 22,
    height: 2,
    borderRadius: 1,
    marginTop: 1,
  },
  tabButton: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    zIndex: 2,
  },
  tabLabel: {
    color: STUDIO_COLORS.TEXT_MUTED,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  tabLabelActive: {
    color: STUDIO_COLORS.TEXT_PRIMARY,
  },
});

