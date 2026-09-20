import Phaser from 'phaser';

/**
 * Shared war-room theme: fonts, colours and small drawing helpers used by every
 * scene. Scene code should never hard-code a colour or font literal; pull from here.
 *
 * Palette: gold and black HUD (Syndicate 1993 + the game's splash), with a green
 * CRT-phosphor treatment for research and help screens.
 */

export const FONTS = {
  display: '"Cinzel", Georgia, serif',
  mono: '"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace',
} as const;

/** Hex strings for text / backgroundColor. */
export const HEX = {
  gold: '#d4af37',
  goldBright: '#f0c14b',
  goldHover: '#ffd766',
  goldPale: '#f6e6a8',
  goldDim: '#8a6d24',
  black: '#0d1117',
  blackPure: '#000000',
  blackTranslucent: '#000e',
  blackFade: '#000c',
  panel: '#0d1117',
  panelMid: '#202936',
  crtPanel: '#02120a',
  hintBg: '#2b2413',
  hoverBg: '#05070aee',
  dangerBg: '#5b2730',
  actionAvailable: '#263241',
  actionDisabled: '#171d25',
  text: '#e7edf5',
  textDim: '#aeb9c7',
  dim: '#8795a8',
  faint: '#596575',
  logText: '#8f9aa8',
  crt: '#39ff77',
  crtDim: '#1d7a3d',
  crtBg: '#010a03',
  white: '#ffffff',
  held: '#fff1bd',
  complete: '#75d69c',
  danger: '#d15b64',
  exposureText: '#c98cf2',
  forceText: '#e08a8a',
  enlightenText: '#7fe0e6',
} as const;

/** Numeric colour values for fills / strokes. */
export const COL = {
  bg: 0x05070a,
  blackBg: 0x030405,
  overlay: 0x020305,
  white: 0xffffff,
  black: 0x000000,
  panel: 0x0d1117,
  panelDark: 0x090d13,
  panelLight: 0x151b24,
  panelMid: 0x202936,
  cardBg: 0x0b1018,
  gold: 0xd4af37,
  goldBright: 0xf0c14b,
  goldDim: 0x8a6d24,
  subvert: 0xd4af37,
  force: 0xc94b4b,
  enlighten: 0x45c9d1,
  exposure: 0xa35bd6,
  crtGreen: 0x39ff77,
  crtDim: 0x1d7a3d,
  crtBg: 0x010a03,
  crtPanel: 0x02120a,
  crtActive: 0x06310f,
  reach: 0x56c982,
  squad: 0x4fa3ff,
  alien: 0xe05a5a,
  empty: 0x090c10,
  hintBg: 0x2b2413,
  dimTint: 0x666666,
  waterDeep: 0x0a2b33,
  water: 0x0e3a44,
  floor: 0x596473,
  floorAlt: 0x4d5867,
  miss: 0x888888,
  hp: 0x7ee08a,
  hpBg: 0x171a20,
  ap: 0xfff2a8,
  apEmpty: 0x555555,
} as const;

export const PAD = 8;

/** Text-style factory so every scene shares the same font families. */
export function textStyle(size: number, colour: string, extra?: Phaser.Types.GameObjects.Text.TextStyle) {
  return {
    fontFamily: FONTS.mono,
    fontSize: `${size}px`,
    color: colour,
    ...extra,
  };
}

export function displayStyle(size: number, colour: string, extra?: Phaser.Types.GameObjects.Text.TextStyle) {
  return {
    fontFamily: FONTS.display,
    fontSize: `${size}px`,
    color: colour,
    ...extra,
  };
}

/**
 * Dark panel with a 1px gold rule. Returns the Graphics object; callers add their
 * own children above it (a higher depth) as needed.
 */
export function drawPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: { fill?: number; alpha?: number; stroke?: number; depth?: number },
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(options?.fill ?? COL.panel, options?.alpha ?? 1);
  g.fillRect(x, y, width, height);
  g.lineStyle(1, options?.stroke ?? COL.gold, 0.9);
  g.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  if (options?.depth !== undefined) g.setDepth(options.depth);
  return g;
}

/**
 * Gold button: gold fill, black text, brightens on hover. Returns the Text so the
 * caller can size/position further.
 */
export function goldButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options?: { size?: number; fixedWidth?: number; padding?: { x: number; y: number }; enabled?: boolean },
): Phaser.GameObjects.Text {
  const enabled = options?.enabled ?? true;
  const button = scene.add
    .text(x, y, ` ${label} `, {
      fontFamily: FONTS.mono,
      fontSize: `${options?.size ?? 15}px`,
      color: enabled ? HEX.black : HEX.faint,
      backgroundColor: enabled ? HEX.goldBright : HEX.panelMid,
      padding: options?.padding ?? { x: 8, y: 6 },
      fixedWidth: options?.fixedWidth,
    })
    .setInteractive({ useHandCursor: enabled });
  if (enabled) {
    button.on('pointerover', () => button.setBackgroundColor(HEX.goldHover));
    button.on('pointerout', () => button.setBackgroundColor(HEX.goldBright));
    button.on('pointerdown', onClick);
  }
  return button;
}

/** Ensure the 2px scanline pattern texture exists and return its key. */
export function ensureScanlines(scene: Phaser.Scene): string {
  const key = '__scanlines';
  if (scene.textures.exists(key)) return key;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 1);
  g.fillRect(0, 1, 2, 1);
  g.generateTexture(key, 2, 2);
  g.destroy();
  return key;
}

/**
 * Green CRT-phosphor overlay: a tiled 2px scanline pattern at ~8% alpha over a
 * rectangle. Draw AFTER the CRT content, on top of it.
 */
export function crtScanlines(scene: Phaser.Scene, x: number, y: number, width: number, height: number, alpha = 0.08): Phaser.GameObjects.TileSprite {
  const key = ensureScanlines(scene);
  return scene.add.tileSprite(x, y, width, height, key).setAlpha(alpha).setOrigin(0);
}
