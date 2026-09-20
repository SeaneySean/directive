import Phaser from 'phaser';
import { HELP_PANELS } from '../game/strategy/text.ts';
import { COL, HEX, crtScanlines, displayStyle, textStyle } from './theme.ts';

const WIDTH = 1280;
const HEIGHT = 720;

/** Green CRT-phosphor help overlay, matching the research panel treatment. */
export function showHelpOverlay(scene: Phaser.Scene): Phaser.GameObjects.Container {
  let page = 0;
  const container = scene.add.container(0, 0).setDepth(20_000);
  const backdrop = scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COL.overlay, 0.9)
    .setInteractive();
  const panel = scene.add.rectangle(WIDTH / 2, HEIGHT / 2, 720, 400, COL.crtBg, 1)
    .setStrokeStyle(2, COL.crtDim);
  const heading = scene.add.text(360, 210, '', displayStyle(26, HEX.crt));
  const body = scene.add.text(360, 268, '', textStyle(18, HEX.crt, {
    lineSpacing: 10, wordWrap: { width: 620 },
  }));
  const count = scene.add.text(360, 470, '', textStyle(13, HEX.crtDim));
  const previous = crtButton(scene, 360, 522, 'BACK', () => {
    if (page > 0) {
      page--;
      redraw();
    }
  });
  const next = crtButton(scene, 520, 522, 'NEXT', () => {
    if (page < HELP_PANELS.length - 1) {
      page++;
      redraw();
    }
  });
  const close = crtButton(scene, 850, 522, 'CLOSE', () => container.destroy(true));

  const redraw = (): void => {
    const copy = HELP_PANELS[page]!;
    heading.setText(copy.title);
    body.setText(copy.body);
    count.setText(`${page + 1} / ${HELP_PANELS.length}`);
    previous.setAlpha(page === 0 ? 0.35 : 1);
    next.setAlpha(page === HELP_PANELS.length - 1 ? 0.35 : 1);
  };

  const scanlines = crtScanlines(scene, WIDTH / 2 - 360, HEIGHT / 2 - 200, 720, 400);
  container.add([backdrop, panel, heading, body, count, previous, next, close, scanlines]);
  redraw();
  return container;
}

function crtButton(scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
  const button = scene.add
    .text(x, y, ` ${label} `, {
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: '16px',
      color: HEX.crt,
      backgroundColor: HEX.crtPanel,
      padding: { x: 8, y: 6 },
    })
    .setStroke(HEX.crt, 1)
    .setInteractive({ useHandCursor: true });
  button.on('pointerdown', onClick);
  return button;
}
