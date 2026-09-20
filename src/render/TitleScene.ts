import Phaser from 'phaser';
import { createCampaign } from '../game/strategy/campaign.ts';
import { showHelpOverlay } from './HelpOverlay.ts';
import {
  CAMPAIGN_REGISTRY_KEY,
  clearCampaignSave,
  readCampaignSave,
  writeCampaignSave,
} from './sceneGlue.ts';

const WIDTH = 1280;
const HEIGHT = 720;
const GOLD = 0xd4af37;
const DARK = 0x0d1117;

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  preload(): void {
    this.load.image('title-splash', 'assets/art/splash.png');
    this.load.text('asset-credits', 'assets/CREDITS.md');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x030405);
    const splash = this.add.image(WIDTH / 2, HEIGHT / 2, 'title-splash');
    const scale = Math.min(WIDTH / splash.width, HEIGHT / splash.height);
    splash.setScale(scale);

    const panelX = 545;
    const panelY = 435;
    const panelW = 190;
    const panelH = 178;
    this.add.rectangle(panelX + panelW / 2, panelY + panelH / 2, panelW, panelH, DARK, 1)
      .setStrokeStyle(2, GOLD);

    const saved = readCampaignSave();
    let buttonY = panelY + 12;
    this.button(panelX + 14, buttonY, 'NEW GAME', () => {
      if (saved) this.confirmNewGame();
      else this.startNewGame();
    });
    buttonY += 36;
    if (saved) {
      this.button(panelX + 14, buttonY, 'CONTINUE', () => {
        this.registry.set(CAMPAIGN_REGISTRY_KEY, saved);
        this.scene.start('world');
      });
      buttonY += 36;
    }
    this.button(panelX + 14, buttonY, 'HOW TO PLAY', () => showHelpOverlay(this));
    buttonY += 36;
    this.button(panelX + 14, buttonY, 'CREDITS', () => this.showCredits());
  }

  private button(x: number, y: number, label: string, action: () => void): Phaser.GameObjects.Text {
    return this.add.text(x, y, ` ${label} `, {
      fontFamily: 'monospace', fontSize: '15px', color: '#f6e6a8',
      backgroundColor: '#17130b', padding: { x: 7, y: 4 }, fixedWidth: 162,
    }).setInteractive({ useHandCursor: true }).on('pointerdown', action);
  }

  private startNewGame(): void {
    clearCampaignSave();
    this.registry.remove(CAMPAIGN_REGISTRY_KEY);
    const campaign = createCampaign(Date.now() | 0);
    this.registry.set(CAMPAIGN_REGISTRY_KEY, campaign);
    writeCampaignSave(campaign);
    this.scene.start('world');
  }

  private confirmNewGame(): void {
    const container = this.add.container(0, 0).setDepth(20_000);
    const backdrop = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x020305, 0.9)
      .setInteractive();
    const panel = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 560, 210, DARK, 1)
      .setStrokeStyle(2, GOLD);
    const copy = this.add.text(410, 285, 'ERASE THE CURRENT CAMPAIGN?\nTHIS CANNOT BE UNDONE.', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', align: 'center',
    });
    const cancel = this.add.text(455, 395, ' CANCEL ', {
      fontFamily: 'monospace', fontSize: '17px', color: '#0d1117', backgroundColor: '#8795a8',
      padding: { x: 8, y: 6 },
    }).setInteractive({ useHandCursor: true }).on('pointerdown', () => container.destroy(true));
    const confirm = this.add.text(685, 395, ' NEW GAME ', {
      fontFamily: 'monospace', fontSize: '17px', color: '#0d1117', backgroundColor: '#d4af37',
      padding: { x: 8, y: 6 },
    }).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.startNewGame());
    container.add([backdrop, panel, copy, cancel, confirm]);
  }

  private showCredits(): void {
    const container = this.add.container(0, 0).setDepth(20_000);
    const backdrop = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x020305, 0.9)
      .setInteractive();
    const panel = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 820, 510, DARK, 1)
      .setStrokeStyle(2, GOLD);
    const credits = this.cache.text.get('asset-credits') as string | undefined;
    const copy = this.add.text(270, 145, credits ?? 'Asset credits unavailable.', {
      fontFamily: 'monospace', fontSize: '15px', color: '#e7edf5',
      lineSpacing: 5, wordWrap: { width: 740 },
    });
    const close = this.add.text(570, 565, ' CLOSE ', {
      fontFamily: 'monospace', fontSize: '17px', color: '#0d1117', backgroundColor: '#d4af37',
      padding: { x: 8, y: 6 },
    }).setInteractive({ useHandCursor: true }).on('pointerdown', () => container.destroy(true));
    container.add([backdrop, panel, copy, close]);
  }
}
