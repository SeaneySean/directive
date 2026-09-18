import Phaser from 'phaser';
import { BattleScene, PANEL_W, TILE } from './render/BattleScene.ts';
import { FARMSTEAD } from './game/index.ts';
import './style.css';

const width = FARMSTEAD.rows[0]!.length * TILE + PANEL_W;
const height = FARMSTEAD.rows.length * TILE;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width,
  height,
  backgroundColor: '#15181d',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BattleScene],
});
