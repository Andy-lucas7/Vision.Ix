import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import { STUDIO_COLORS, CognitiveTabId } from '../theme/designSystem';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Configuração física de mola (Critically Damped para 120Hz ProMotion):
 * Resposta imediata sem oscilação elástica exagerada.
 */
const STUDIO_SPRING_CONFIG = {
  mass: 0.7,
  damping: 20,
  stiffness: 180,
  overshootClamping: false,
} as const;

interface StudioStageLayoutProps {
  activeTab: CognitiveTabId;
  children: React.ReactNode;
}

/**
 * ============================================================================
 * 1. DESIGN SYSTEM & GLOBAL LAYOUT BASE (StudioStageLayout)
 * ============================================================================
 * Responsabilidades:
 * - Renderiza o palco tridimensional escuro (#09090B / #121214).
 * - Projeta iluminação volumétrica radial suave em segundo plano via SVG
 *   rasterizado na GPU (`renderToHardwareTextureAndroid` / `shouldRasterizeIOS`).
 * - Move a fonte de luz volumétrica na UI Thread (Reanimated Worklet) conforme
 *   a aba ativa, com ZERO re-renderizações na árvore React e ZERO interferência
 *   nos coletores de toque (`pointerEvents="none"`).
 */
export const StudioStageLayout: React.FC<StudioStageLayoutProps> = React.memo(
  ({ activeTab, children }) => {
    // SharedValue na UI Thread: controla deslocamento da luz volumétrica de estúdio
    const lightFocusIndex = useSharedValue(0);

    useEffect(() => {
      const targetIndex =
        activeTab === 'DASHBOARD'
          ? 0
          : activeTab === 'SIMPLE_SPEED'
          ? 1
          : activeTab === 'GO_NO_GO'
          ? 2
          : 3;
      lightFocusIndex.value = withSpring(targetIndex, STUDIO_SPRING_CONFIG);
    }, [activeTab, lightFocusIndex]);

    /**
     * Worklet executado a 120 FPS na UI Thread nativa.
     * Desloca suavemente o feixe de luz radial laranja/ciano pelo fundo do estúdio.
     */
    const primaryGlowAnimatedStyle = useAnimatedStyle(() => {
      'worklet';
      const translateX = interpolate(
        lightFocusIndex.value,
        [0, 1, 2, 3],
        [-SCREEN_WIDTH * 0.12, SCREEN_WIDTH * 0.15, -SCREEN_WIDTH * 0.18, SCREEN_WIDTH * 0.1]
      );
      const translateY = interpolate(
        lightFocusIndex.value,
        [0, 1, 2, 3],
        [-SCREEN_HEIGHT * 0.08, SCREEN_HEIGHT * 0.04, SCREEN_HEIGHT * 0.08, -SCREEN_HEIGHT * 0.04]
      );
      const scale = interpolate(
        lightFocusIndex.value,
        [0, 1, 2, 3],
        [1.05, 0.92, 0.96, 1.08]
      );

      return {
        transform: [{ translateX }, { translateY }, { scale }],
      };
    });

    return (
      <View style={styles.studioContainer}>
        {/* CAMADA DE ILUMINAÇÃO VOLUMÉTRICA (100% Isolada + Rasterizada em GPU) */}
        <Animated.View
          pointerEvents="none"
          renderToHardwareTextureAndroid={true}
          shouldRasterizeIOS={true}
          style={[styles.volumetricLayer, primaryGlowAnimatedStyle]}
        >
          <Svg
            width={SCREEN_WIDTH * 1.4}
            height={SCREEN_HEIGHT * 1.2}
            viewBox={`0 0 ${SCREEN_WIDTH * 1.4} ${SCREEN_HEIGHT * 1.2}`}
          >
            <Defs>
              {/* Feixe Volumétrico Principal: Laranja Ácido (#FF6B00) ultra-suave */}
              <RadialGradient
                id="studioOrangeGlow"
                cx="50%"
                cy="32%"
                rx="55%"
                ry="42%"
                fx="50%"
                fy="32%"
              >
                <Stop offset="0%" stopColor={STUDIO_COLORS.ACCENT_ORANGE} stopOpacity="0.18" />
                <Stop offset="45%" stopColor={STUDIO_COLORS.ACCENT_ORANGE} stopOpacity="0.06" />
                <Stop offset="100%" stopColor={STUDIO_COLORS.ABYSS_BG} stopOpacity="0" />
              </RadialGradient>

              {/* Feixe Secundário Frio: Luz de Recorte Ciano/Grafite no horizonte inferior */}
              <RadialGradient
                id="studioRimGlow"
                cx="50%"
                cy="78%"
                rx="60%"
                ry="35%"
                fx="50%"
                fy="78%"
              >
                <Stop offset="0%" stopColor={STUDIO_COLORS.ACCENT_CYAN} stopOpacity="0.08" />
                <Stop offset="55%" stopColor="#1C1C1E" stopOpacity="0.04" />
                <Stop offset="100%" stopColor={STUDIO_COLORS.ABYSS_BG} stopOpacity="0" />
              </RadialGradient>
            </Defs>

            <Rect
              x="0"
              y="0"
              width={SCREEN_WIDTH * 1.4}
              height={SCREEN_HEIGHT * 1.2}
              fill="url(#studioOrangeGlow)"
            />
            <Rect
              x="0"
              y="0"
              width={SCREEN_WIDTH * 1.4}
              height={SCREEN_HEIGHT * 1.2}
              fill="url(#studioRimGlow)"
            />
          </Svg>
        </Animated.View>

        {/* PALCO DE CONTEÚDO (Telas Cognitivas Mantidas em Memória) */}
        <View style={styles.stageViewport}>{children}</View>
      </View>
    );
  }
);

/**
 * ============================================================================
 * GERENCIADOR DE ABAS SEM UNMOUNT (KeepAliveTabPane)
 * ============================================================================
 * Mantém cada módulo montado permanentemente na árvore nativa.
 * A alternância usa opacidade e micro-translação na UI Thread (Reanimated)
 * para garantir troca instantânea (0ms de remount / 0 GC pauses).
 */
interface KeepAliveTabPaneProps {
  isActive: boolean;
  children: React.ReactNode;
}

export const KeepAliveTabPane: React.FC<KeepAliveTabPaneProps> = React.memo(
  ({ isActive, children }) => {
    const progress = useSharedValue(isActive ? 1 : 0);

    useEffect(() => {
      progress.value = withSpring(isActive ? 1 : 0, {
        mass: 0.5,
        damping: 22,
        stiffness: 260,
      });
    }, [isActive, progress]);

    const paneAnimatedStyle = useAnimatedStyle(() => {
      'worklet';
      return {
        opacity: progress.value,
        transform: [
          {
            scale: interpolate(progress.value, [0, 1], [0.985, 1]),
          },
        ],
      };
    });

    return (
      <Animated.View
        pointerEvents={isActive ? 'auto' : 'none'}
        style={[
          styles.keepAlivePane,
          !isActive && styles.keepAlivePaneHidden,
          paneAnimatedStyle,
        ]}
      >
        {children}
      </Animated.View>
    );
  }
);

const styles = StyleSheet.create({
  studioContainer: {
    flex: 1,
    backgroundColor: STUDIO_COLORS.ABYSS_BG,
    overflow: 'hidden',
  },
  volumetricLayer: {
    position: 'absolute',
    top: -SCREEN_HEIGHT * 0.1,
    left: -SCREEN_WIDTH * 0.2,
    width: SCREEN_WIDTH * 1.4,
    height: SCREEN_HEIGHT * 1.2,
  },
  stageViewport: {
    flex: 1,
  },
  keepAlivePane: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  keepAlivePaneHidden: {
    zIndex: -1,
  },
});
