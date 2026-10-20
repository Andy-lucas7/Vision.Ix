import { Platform, StyleSheet } from 'react-native';

/**
 * ============================================================================
 * 3D STUDIO NEO-MINIMALIST DESIGN SYSTEM (120 FPS HARDWARE COMPOSITED)
 * ============================================================================
 * Inspirado em superfícies físicas anodizadas (Linear / Teenage Engineering / Apple Pro).
 * Sem vidro genérico ("fake glass"): usa materiais foscos/acetinados (#121214, #1C1C1E),
 * bordas especulares de 1px no topo (efeito de luz de estúdio vindo de cima)
 * e iluminação volumétrica radial suave em segundo plano.
 */
export const STUDIO_COLORS = {
  // Fundos e Superfícies Físicas
  ABYSS_BG: '#09090B',          // Fundo base absoluto do estúdio 3D
  MATTE_OBSIDIAN: '#121214',    // Superfície fosca primária (containers e zonas de espera)
  SATIN_GRAPHITE: '#1C1C1E',    // Superfície acetinada elevada (cards 3D e botões táteis)
  ELEVATED_ANODIZED: '#242428', // Estado pressionado / destaque estrutural

  // Bordas Especulares (Simulação de Luz Física Superior)
  RIM_LIGHT_TOP: '#323238',     // Borda superior iluminada (1px)
  BORDER_HAIRLINE: '#222226',   // Borda lateral/inferior sutil
  BORDER_SUBTLE: '#18181C',

  // Tipografia de Alto Contraste
  TEXT_PRIMARY: '#F4F4F5',      // Branco Alabastro Puro
  TEXT_SECONDARY: '#A1A1AA',    // Cinza Técnico Neutro
  TEXT_MUTED: '#52525B',        // Cinza Escuro para Metadados

  // Âncoras Cromáticas Cirúrgicas (Accents)
  ACCENT_GREEN: '#00FF66',      // Verde Elétrico (Estímulo Go / Clique Agora / PR)
  ACCENT_ORANGE: '#FF6B00',     // Laranja Ácido (Luz Volumétrica / Streak / Conflito Stroop)
  ACCENT_CYAN: '#00E5FF',       // Azul Ciano (Telemetria / Precisão / Percentil)
  ACCENT_RED: '#FF3333',        // Vermelho Puro (No-Go / Queima de Largada / Erro)
} as const;

export type CognitiveTabId = 'DASHBOARD' | 'SIMPLE_SPEED' | 'GO_NO_GO' | 'STROOP';

export const GEOMETRIC_FONT = Platform.select({
  ios: 'System',
  android: 'sans-serif-condensed',
  default: 'System',
});

export const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

/**
 * Presets de profundidade física (3D Studio Drop Shadows + Specular Rim)
 * Pré-compilados em StyleSheet para custo zero na thread de UI.
 */
export const STUDIO_SURFACES = StyleSheet.create({
  /**
   * Card fosco/acetinado flutuando no estúdio com sombra profunda em camadas
   * e borda superior especular que simula iluminação zenital.
   */
  tactileCard: {
    backgroundColor: STUDIO_COLORS.MATTE_OBSIDIAN,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.BORDER_HAIRLINE,
    borderTopColor: STUDIO_COLORS.RIM_LIGHT_TOP,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.65,
    shadowRadius: 24,
    elevation: 12,
  },
  /**
   * Botão físico 3D (Satin Graphite) com chanfro luminoso superior
   */
  tactileButton: {
    backgroundColor: STUDIO_COLORS.SATIN_GRAPHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.BORDER_HAIRLINE,
    borderTopColor: STUDIO_COLORS.RIM_LIGHT_TOP,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 8,
  },
});

