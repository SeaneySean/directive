import Phaser from 'phaser';
import { ENDINGS } from '../game/strategy/endings.ts';
import type { CampaignState } from '../game/strategy/types.ts';
import { CAMPAIGN_REGISTRY_KEY } from './sceneGlue.ts';
import { HEX, displayStyle, goldButton, textStyle } from './theme.ts';

export class EndingScene extends Phaser.Scene {
  constructor() {
    super('ending');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x030405);
    // Splash palette backing, dimmed behind the ending text.
    if (this.textures.exists('title-splash')) {
      const splash = this.add.image(640, 360, 'title-splash');
      const scale = Math.max(1280 / splash.width, 720 / splash.height);
      splash.setScale(scale).setAlpha(0.18);
    }

    const state = this.registry.get(CAMPAIGN_REGISTRY_KEY) as CampaignState | undefined;
    const ending = state?.endingId ? ENDINGS[state.endingId] : ENDINGS.exposed;
    const won = state?.outcome === 'won';

    this.add.text(640, 230, ending.title.toUpperCase(), displayStyle(40, won ? HEX.gold : HEX.danger, {
      stroke: '#000000', strokeThickness: 5,
    })).setOrigin(0.5).setShadow(0, 3, '#000000', 8, true, true);
    this.add.text(640, 310, [...ending.flavour], textStyle(17, HEX.textDim, {
      align: 'center', lineSpacing: 9,
    })).setOrigin(0.5);

    goldButton(this, 640, 430, 'MAIN MENU', () => this.scene.start('title'), {
      size: 18, padding: { x: 16, y: 10 },
    }).setOrigin(0.5);
  }
}
