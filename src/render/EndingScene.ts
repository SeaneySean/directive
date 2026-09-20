import Phaser from 'phaser';
import { ENDINGS } from '../game/strategy/endings.ts';
import type { CampaignState } from '../game/strategy/types.ts';
import { CAMPAIGN_REGISTRY_KEY } from './sceneGlue.ts';

export class EndingScene extends Phaser.Scene {
  constructor() {
    super('ending');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x05070a);
    const state = this.registry.get(CAMPAIGN_REGISTRY_KEY) as CampaignState | undefined;
    const ending = state?.endingId ? ENDINGS[state.endingId] : ENDINGS.exposed;
    const won = state?.outcome === 'won';

    this.add.text(640, 230, ending.title.toUpperCase(), {
      fontFamily: 'monospace',
      fontSize: '38px',
      color: won ? '#d4af37' : '#d15b64',
      align: 'center',
    }).setOrigin(0.5);
    this.add.text(640, 310, [...ending.flavour], {
      fontFamily: 'monospace',
      fontSize: '17px',
      color: '#aeb9c7',
      align: 'center',
      lineSpacing: 9,
    }).setOrigin(0.5);

    const newGame = this.add.text(640, 420, ' MAIN MENU ', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#0d1117',
      backgroundColor: '#d4af37',
      padding: { x: 14, y: 9 },
    }).setOrigin(0.5);
    newGame.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.scene.start('title');
    });
  }
}
