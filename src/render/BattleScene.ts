import Phaser from 'phaser';
import {
  canAct,
  createGame,
  endTurn,
  FARMSTEAD,
  livingUnits,
  moveUnit,
  previewShot,
  reachable,
  runTeamTurn,
  selectUnit,
  selectedUnit,
  shoot,
  tileAt,
  unitAt,
  type GameState,
  type Reach,
  type Unit,
  type Vec,
} from '../game/index.ts';
import { gridToScreen, screenToGrid, tileDepth, TILE_H, TILE_W } from './iso.ts';

export { TILE_H, TILE_W } from './iso.ts';
export const PANEL_W = 280;

const BOARD_ORIGIN = { x: 490, y: 78 };
const PANEL_X = 1000;
const ASSET_PATH = 'assets/';

const COLORS = {
  floor: 0x596473,
  floorAlt: 0x4d5867,
  squad: 0x4fa3ff,
  alien: 0xe05a5a,
  selected: 0xffffff,
  reach: 0x56c982,
  hp: 0x7ee08a,
  hpBg: 0x171a20,
};

/** Isometric tactical renderer. All rules remain in src/game. */
export class BattleScene extends Phaser.Scene {
  private state!: GameState;
  private boardObjects: Phaser.GameObjects.GameObject[] = [];
  private panel!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private tooltip!: Phaser.GameObjects.Text;
  private endTurnBtn!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private reach: Reach | null = null;
  private busy = false;

  constructor() {
    super('battle');
  }

  preload(): void {
    this.load.image('iso-floor', `${ASSET_PATH}platformerTile_35.png`);
    this.load.image('iso-wall', `${ASSET_PATH}platformerTile_30.png`);
    this.load.image('iso-cover', `${ASSET_PATH}platformerTile_22.png`);
  }

  create(): void {
    this.state = createGame(FARMSTEAD, Date.now() % 100000);

    this.add.rectangle(PANEL_X, 0, PANEL_W, 720, 0x090d13, 0.96).setOrigin(0).setDepth(9000);
    this.add.rectangle(PANEL_X, 0, 2, 720, 0xf0c14b, 0.55).setOrigin(0).setDepth(9001);
    this.panel = this.add.text(PANEL_X + 16, 14, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#e6e6e6',
      wordWrap: { width: PANEL_W - 32 },
    }).setDepth(9002);
    this.endTurnBtn = this.add
      .text(PANEL_X + 16, 372, ' END TURN (E) ', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#111',
        backgroundColor: '#f0c14b',
        padding: { x: 8, y: 6 },
      })
      .setDepth(9002)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onEndTurn());
    this.logText = this.add.text(PANEL_X + 16, 420, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#b8b8b8',
      wordWrap: { width: PANEL_W - 32 },
    }).setDepth(9002);
    this.tooltip = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#fff',
      backgroundColor: '#000e',
      padding: { x: 6, y: 4 },
    }).setDepth(10000).setVisible(false);
    this.banner = this.add
      .text(BOARD_ORIGIN.x, 326, '', {
        align: 'center',
        fontFamily: 'monospace',
        fontSize: '36px',
        color: '#fff',
        backgroundColor: '#000c',
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5)
      .setDepth(10001)
      .setVisible(false);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onHover(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onClick(p));
    this.input.keyboard?.on('keydown-E', () => this.onEndTurn());
    this.input.keyboard?.on('keydown-TAB', (ev: KeyboardEvent) => {
      ev.preventDefault();
      this.cycleSelection();
    });
    this.input.keyboard?.on('keydown-R', () => {
      if (this.state.outcome !== 'playing') this.scene.restart();
    });

    this.autoSelect();
    this.redraw();
  }

  private tileFromPointer(p: Phaser.Input.Pointer): Vec | null {
    if (p.x >= PANEL_X) return null;
    const tile = screenToGrid({ x: p.x, y: p.y }, BOARD_ORIGIN);
    if (!tile || tile.x < 0 || tile.y < 0 || tile.x >= this.state.grid.width || tile.y >= this.state.grid.height) return null;
    return tile;
  }

  private unitFromPointer(p: Phaser.Input.Pointer): Unit | null {
    const candidates = this.state.units
      .filter((unit) => unit.alive)
      .map((unit) => ({ unit, screen: gridToScreen(unit.pos, BOARD_ORIGIN) }))
      .filter(({ screen }) => Math.abs(p.x - screen.x) <= 18 && p.y >= screen.y - 48 && p.y <= screen.y + 10)
      .sort((a, b) => tileDepth(b.unit.pos) - tileDepth(a.unit.pos));
    return candidates[0]?.unit ?? null;
  }

  private setState(next: GameState): void {
    this.state = next;
    const sel = selectedUnit(next);
    this.reach = sel && canAct(next, sel) ? reachable(next.grid, next.units, sel.pos, sel.move) : null;
    this.redraw();
  }

  private autoSelect(): void {
    const ready = livingUnits(this.state, 'squad').find((unit) => unit.ap > 0);
    this.setState(selectUnit(this.state, ready ? ready.id : null));
  }

  private cycleSelection(): void {
    if (this.state.turn !== 'squad' || this.busy) return;
    const squad = livingUnits(this.state, 'squad');
    if (!squad.length) return;
    const index = squad.findIndex((unit) => unit.id === this.state.selectedId);
    const next = squad[(index + 1) % squad.length]!;
    this.setState(selectUnit(this.state, next.id));
  }

  private onHover(p: Phaser.Input.Pointer): void {
    const sel = selectedUnit(this.state);
    if (!sel || this.state.turn !== 'squad') {
      this.tooltip.setVisible(false);
      return;
    }
    const hoveredUnit = this.unitFromPointer(p);
    const tile = this.tileFromPointer(p);
    const target = hoveredUnit ?? (tile ? unitAt(this.state, tile) : null);
    if (target?.team === 'alien') {
      const preview = previewShot(this.state.grid, sel, target);
      const text = preview
        ? `${target.name}  HP ${target.hp}/${target.maxHp}\nHit ${preview.chance}%  ${preview.cover ? 'in cover' : 'exposed'}  range ${preview.distance}`
        : `${target.name}  HP ${target.hp}/${target.maxHp}\nNo shot`;
      this.tooltip.setText(text).setPosition(Math.min(p.x + 14, PANEL_X - 230), p.y + 14).setVisible(true);
      return;
    }
    this.tooltip.setVisible(false);
  }

  private onClick(p: Phaser.Input.Pointer): void {
    if (this.busy || this.state.outcome !== 'playing' || this.state.turn !== 'squad') return;
    const pointerUnit = this.unitFromPointer(p);
    const tile = pointerUnit?.pos ?? this.tileFromPointer(p);
    if (!tile) return;
    const clicked = pointerUnit ?? unitAt(this.state, tile);
    const sel = selectedUnit(this.state);

    if (clicked?.team === 'squad') {
      this.setState(selectUnit(this.state, clicked.id));
      return;
    }
    if (!sel) return;
    if (clicked?.team === 'alien') {
      const result = shoot(this.state, sel.id, clicked.id);
      if (result) {
        this.setState(result.state);
        this.flash(clicked.pos, result.hit ? 0xffffff : 0x888888);
        this.afterAction();
      }
      return;
    }
    if (this.reach?.has(`${tile.x},${tile.y}`)) {
      const next = moveUnit(this.state, sel.id, tile);
      if (next !== this.state) {
        this.setState(next);
        this.afterAction();
      }
    }
  }

  private afterAction(): void {
    const sel = selectedUnit(this.state);
    if (this.state.outcome !== 'playing') {
      this.redraw();
      return;
    }
    if (sel && sel.ap === 0) this.autoSelect();
    else this.setState(this.state);
  }

  private onEndTurn(): void {
    if (this.busy || this.state.turn !== 'squad' || this.state.outcome !== 'playing') return;
    this.busy = true;
    this.tooltip.setVisible(false);
    const afterEnd = endTurn(this.state);
    this.setState(afterEnd);
    const { state } = runTeamTurn(afterEnd, 'alien');
    this.time.delayedCall(350, () => {
      this.busy = false;
      this.setState(state);
      this.autoSelect();
    });
  }

  private flash(at: Vec, color: number): void {
    const centre = gridToScreen(at, BOARD_ORIGIN);
    const marker = this.add.graphics();
    marker.fillStyle(color, 0.85).fillPoints([
      new Phaser.Geom.Point(centre.x, centre.y - TILE_H / 2),
      new Phaser.Geom.Point(centre.x + TILE_W / 2, centre.y),
      new Phaser.Geom.Point(centre.x, centre.y + TILE_H / 2),
      new Phaser.Geom.Point(centre.x - TILE_W / 2, centre.y),
    ], true).setDepth(10002);
    this.tweens.add({ targets: marker, alpha: 0, duration: 250, onComplete: () => marker.destroy() });
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.boardObjects.push(object);
    return object;
  }

  private clearBoard(): void {
    for (const object of this.boardObjects) object.destroy();
    this.boardObjects = [];
  }

  private redraw(): void {
    this.clearBoard();
    const { grid } = this.state;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const point = { x, y };
        const centre = gridToScreen(point, BOARD_ORIGIN);
        const floor = this.track(this.add.image(centre.x, centre.y, 'iso-floor'));
        floor.setCrop(0, 0, 111, 64).setDisplaySize(TILE_W, TILE_H).setTint((x + y) % 2 ? COLORS.floorAlt : COLORS.floor).setDepth(0);
      }
    }

    if (this.reach) {
      const highlight = this.track(this.add.graphics());
      highlight.fillStyle(COLORS.reach, 0.52).setDepth(1);
      for (const node of this.reach.values()) {
        if (node.dist === 0) continue;
        const centre = gridToScreen(node.pos, BOARD_ORIGIN);
        highlight.fillPoints([
          new Phaser.Geom.Point(centre.x, centre.y - TILE_H / 2 + 2),
          new Phaser.Geom.Point(centre.x + TILE_W / 2 - 3, centre.y),
          new Phaser.Geom.Point(centre.x, centre.y + TILE_H / 2 - 2),
          new Phaser.Geom.Point(centre.x - TILE_W / 2 + 3, centre.y),
        ], true);
      }
    }

    for (const unit of this.state.units) {
      if (unit.alive) this.drawUnit(unit);
    }

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const point = { x, y };
        const kind = tileAt(grid, point);
        if (kind === 'floor') continue;
        const centre = gridToScreen(point, BOARD_ORIGIN);
        const texture = kind === 'wall' ? 'iso-wall' : 'iso-cover';
        const width = kind === 'wall' ? TILE_W : 46;
        const height = kind === 'wall' ? (128 * TILE_W) / 111 : (128 * width) / 111;
        const obstacle = this.track(this.add.image(centre.x, centre.y, texture));
        obstacle.setDisplaySize(width, height).setOrigin(0.5, 0.25).setDepth(tileDepth(point, 8));
      }
    }

    this.drawPanel();
  }

  private drawUnit(unit: Unit): void {
    const centre = gridToScreen(unit.pos, BOARD_ORIGIN);
    const container = this.track(this.add.container(centre.x, centre.y));
    container.setDepth(tileDepth(unit.pos, 5));

    const shape = this.add.graphics();
    shape.fillStyle(0x000000, 0.45).fillEllipse(0, 6, 30, 11);
    if (unit.id === this.state.selectedId) {
      shape.lineStyle(2, COLORS.selected, 1).strokePoints([
        new Phaser.Geom.Point(0, -TILE_H / 2 + 1),
        new Phaser.Geom.Point(TILE_W / 2 - 4, 0),
        new Phaser.Geom.Point(0, TILE_H / 2 - 1),
        new Phaser.Geom.Point(-TILE_W / 2 + 4, 0),
      ], true);
    }
    shape.fillStyle(unit.team === 'squad' ? COLORS.squad : COLORS.alien, 1);
    if (unit.team === 'squad') shape.fillRoundedRect(-12, -39, 24, 37, 5);
    else shape.fillTriangle(0, -43, -15, -3, 15, -3);

    const hpWidth = 28;
    shape.fillStyle(COLORS.hpBg, 1).fillRect(-hpWidth / 2, -48, hpWidth, 4);
    shape.fillStyle(COLORS.hp, 1).fillRect(-hpWidth / 2, -48, (hpWidth * unit.hp) / unit.maxHp, 4);
    if (unit.team === 'squad') {
      for (let i = 0; i < unit.maxAp; i++) {
        shape.fillStyle(i < unit.ap ? 0xfff2a8 : 0x555555, 1).fillCircle(-5 + i * 10, -43, 2.5);
      }
    }

    const label = this.add.text(0, -21, unit.name.slice(0, 2).toUpperCase(), {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#071018',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add([shape, label]);
  }

  private drawPanel(): void {
    const state = this.state;
    const sel = selectedUnit(state);
    const lines = [`ILLUMINATUS  //  ${FARMSTEAD.name.toUpperCase()}`, `Round ${state.round}   ${state.turn === 'squad' ? 'YOUR TURN' : 'ENEMY TURN'}`, ''];
    if (sel) {
      lines.push(
        `> ${sel.name}`,
        `  HP ${sel.hp}/${sel.maxHp}   AP ${sel.ap}/${sel.maxAp}`,
        `  ${sel.weapon.name}  rng ${sel.weapon.range}`,
        `  acc ${sel.weapon.accuracy}%  dmg ${sel.weapon.damage}`,
        '',
      );
    }
    lines.push('Squad:');
    for (const unit of state.units.filter((candidate) => candidate.team === 'squad')) {
      lines.push(`  ${unit.alive ? '' : 'x '}${unit.name.padEnd(7)} HP ${String(unit.hp).padStart(2)}  AP ${unit.ap}`);
    }
    lines.push('', `Aliens left: ${livingUnits(state, 'alien').length}`, '', 'Click unit: select', 'Click tile: move', 'Click alien: shoot', 'Tab: next unit');
    this.panel.setText(lines);
    this.logText.setText(state.log.slice(-9).map((entry) => entry.text));

    if (state.outcome !== 'playing') {
      this.banner.setText(state.outcome === 'won' ? 'AREA SECURED\n\nR to restart' : 'SQUAD LOST\n\nR to restart').setVisible(true);
      this.endTurnBtn.setVisible(false);
    } else {
      this.banner.setVisible(false);
      this.endTurnBtn.setVisible(state.turn === 'squad');
    }
  }
}
