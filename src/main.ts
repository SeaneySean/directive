import Phaser from 'phaser';
import { BattleScene } from './render/BattleScene.ts';
import { EndingScene } from './render/EndingScene.ts';
import { TitleScene } from './render/TitleScene.ts';
import { WorldScene } from './render/WorldScene.ts';
import './style.css';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 1280,
  height: 720,
  backgroundColor: '#0d1117',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [TitleScene, WorldScene, BattleScene, EndingScene],
});
