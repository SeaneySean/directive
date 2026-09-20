import Phaser from 'phaser';
import { createCampaign } from '../game/strategy/campaign.ts';
import { showHelpOverlay } from './HelpOverlay.ts';
import {
  CAMPAIGN_REGISTRY_KEY,
  clearCampaignSave,
  readCampaignSave,
  writeCampaignSave,
} from './sceneGlue.ts';
import { COL, HEX, displayStyle, goldButton } from './theme.ts';

const WIDTH = 1280;
const HEIGHT = 720;

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  preload(): void {
    this.load.image('title-splash', 'assets/art/splash.jpg');
    this.load.text('asset-credits', 'assets/CREDITS.md');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x030405);
    const splash = this.add.image(WIDTH / 2, HEIGHT / 2, 'title-splash');
    const scale = Math.max(WIDTH / splash.width, HEIGHT / splash.height);
    splash.setScale(scale);

    this.add.text(WIDTH / 2, 120, 'ILLUMINATUS', displayStyle(64, HEX.gold, {
      stroke: '#000000', strokeThickness: 6,
    })).setOrigin(0.5).setShadow(0, 3, '#000000', 8, true, true);

    const panelX = 545;
    const panelY = 420;
    const panelW = 200;
    const panelH = 196;
    this.add.rectangle(panelX + panelW / 2, panelY + panelH / 2, panelW, panelH, COL.panel, 0.96)
      .setStrokeStyle(2, COL.gold);

    const saved = readCampaignSave();
    let buttonY = panelY + 14;
    goldButton(this, panelX + 19, buttonY, 'NEW GAME', () => {
      if (saved) this.confirmNewGame();
      else this.startNewGame();
    }, { size: 15, fixedWidth: 162 });
    buttonY += 40;
    if (saved) {
      goldButton(this, panelX + 19, buttonY, 'CONTINUE', () => {
        this.registry.set(CAMPAIGN_REGISTRY_KEY, saved);
        this.scene.start('world');
      }, { size: 15, fixedWidth: 162 });
      buttonY += 40;
    }
    goldButton(this, panelX + 19, buttonY, 'HOW TO PLAY', () => showHelpOverlay(this), { size: 15, fixedWidth: 162 });
    buttonY += 40;
    goldButton(this, panelX + 19, buttonY, 'CREDITS', () => this.showCredits(), { size: 15, fixedWidth: 162 });
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
    const panel = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 560, 210, COL.panel, 1)
      .setStrokeStyle(2, COL.gold);
    const copy = this.add.text(410, 285, 'ERASE THE CURRENT CAMPAIGN?\nTHIS CANNOT BE UNDONE.', {
      fontFamily: '"IBM Plex Mono", monospace', fontSize: '20px', color: HEX.white, align: 'center',
    });
    const cancel = goldButton(this, 455, 395, 'CANCEL', () => container.destroy(true), { size: 16 });
    const confirm = goldButton(this, 685, 395, 'NEW GAME', () => this.startNewGame(), { size: 16 });
    container.add([backdrop, panel, copy, cancel, confirm]);
  }

  private showCredits(): void {
    const container = this.add.container(0, 0).setDepth(20_000);
    const backdrop = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x020305, 0.9)
      .setInteractive();
    const panel = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 820, 510, COL.panel, 1)
      .setStrokeStyle(2, COL.gold);
    const credits = this.cache.text.get('asset-credits') as string | undefined;
    const copy = this.add.text(270, 145, credits ?? 'Asset credits unavailable.', {
      fontFamily: '"IBM Plex Mono", monospace', fontSize: '15px', color: HEX.text,
      lineSpacing: 5, wordWrap: { width: 740 },
    });
    const close = goldButton(this, 570, 565, 'CLOSE', () => container.destroy(true), { size: 16 });
    container.add([backdrop, panel, copy, close]);
  }
}
