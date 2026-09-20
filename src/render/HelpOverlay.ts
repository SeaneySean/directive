import Phaser from 'phaser';
import { HELP_PANELS } from '../game/strategy/text.ts';

const WIDTH = 1280;
const HEIGHT = 720;

export function showHelpOverlay(scene: Phaser.Scene): Phaser.GameObjects.Container {
  let page = 0;
  const container = scene.add.container(0, 0).setDepth(20_000);
  const backdrop = scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x020305, 0.88)
    .setInteractive();
  const panel = scene.add.rectangle(WIDTH / 2, HEIGHT / 2, 700, 390, 0x111722, 1)
    .setStrokeStyle(2, 0xd4af37);
  const heading = scene.add.text(340, 220, '', {
    fontFamily: 'monospace', fontSize: '24px', color: '#d4af37',
  });
  const body = scene.add.text(340, 275, '', {
    fontFamily: 'monospace', fontSize: '18px', color: '#e7edf5',
    lineSpacing: 10, wordWrap: { width: 600 },
  });
  const count = scene.add.text(340, 478, '', {
    fontFamily: 'monospace', fontSize: '13px', color: '#8795a8',
  });
  const previous = scene.add.text(340, 520, ' BACK ', {
    fontFamily: 'monospace', fontSize: '16px', color: '#0d1117', backgroundColor: '#8795a8',
    padding: { x: 8, y: 6 },
  }).setInteractive({ useHandCursor: true });
  const next = scene.add.text(515, 520, ' NEXT ', {
    fontFamily: 'monospace', fontSize: '16px', color: '#0d1117', backgroundColor: '#d4af37',
    padding: { x: 8, y: 6 },
  }).setInteractive({ useHandCursor: true });
  const close = scene.add.text(850, 520, ' CLOSE ', {
    fontFamily: 'monospace', fontSize: '16px', color: '#0d1117', backgroundColor: '#d4af37',
    padding: { x: 8, y: 6 },
  }).setInteractive({ useHandCursor: true });

  const redraw = (): void => {
    const copy = HELP_PANELS[page]!;
    heading.setText(copy.title);
    body.setText(copy.body);
    count.setText(`${page + 1} / ${HELP_PANELS.length}`);
    previous.setAlpha(page === 0 ? 0.35 : 1);
    next.setAlpha(page === HELP_PANELS.length - 1 ? 0.35 : 1);
  };
  previous.on('pointerdown', () => {
    if (page > 0) {
      page--;
      redraw();
    }
  });
  next.on('pointerdown', () => {
    if (page < HELP_PANELS.length - 1) {
      page++;
      redraw();
    }
  });
  close.on('pointerdown', () => container.destroy(true));
  container.add([backdrop, panel, heading, body, count, previous, next, close]);
  redraw();
  return container;
}
