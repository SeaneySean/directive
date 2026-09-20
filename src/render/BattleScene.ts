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

export const TILE = 40;
export const PANEL_W = 280;

const COLORS = {
  floor: 0x2b3038,
  floorAlt: 0x2f353e,
  wall: 0x11141a,
  cover: 0x6b5a3a,
  squad: 0x4fa3ff,
  alien: 0xe05a5a,
  selected: 0xffffff,
  reach: 0x3d6b4f,
  hp: 0x7ee08a,
  hpBg: 0x222222,
};

/**
 * Slice 1 renderer: flat top-down grid. Everything visual lives here; the
 * game rules are in src/game and this scene only calls into them.
 */
export class BattleScene extends Phaser.Scene {
  private state!: GameState;
  private gfx!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
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

  create(): void {
    this.state = createGame(FARMSTEAD, Date.now() % 100000);
    this.gfx = this.add.graphics();
    const px = this.state.grid.width * TILE + 16;

    this.panel = this.add.text(px, 12, '', { fontFamily: 'monospace', fontSize: '14px', color: '#e6e6e6', wordWrap: { width: PANEL_W - 24 } });
    this.endTurnBtn = this.add
      .text(px, 372, ' END TURN (E) ', { fontFamily: 'monospace', fontSize: '16px', color: '#111', backgroundColor: '#f0c14b', padding: { x: 8, y: 6 } })
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onEndTurn());
    this.logText = this.add.text(px, 420, '', { fontFamily: 'monospace', fontSize: '12px', color: '#b8b8b8', wordWrap: { width: PANEL_W - 24 } });
    this.tooltip = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '13px', color: '#fff', backgroundColor: '#000c', padding: { x: 6, y: 4 } }).setDepth(10).setVisible(false);
    this.banner = this.add
      .text((this.state.grid.width * TILE) / 2, (this.state.grid.height * TILE) / 2, '', { fontFamily: 'monospace', fontSize: '36px', color: '#fff', backgroundColor: '#000a', padding: { x: 20, y: 12 } })
      .setOrigin(0.5)
      .setDepth(20)
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
    const x = Math.floor(p.x / TILE);
    const y = Math.floor(p.y / TILE);
    if (x < 0 || y < 0 || x >= this.state.grid.width || y >= this.state.grid.height) return null;
    return { x, y };
  }

  private setState(next: GameState): void {
    this.state = next;
    const sel = selectedUnit(next);
    this.reach = sel && canAct(next, sel) ? reachable(next.grid, next.units, sel.pos, sel.move) : null;
    this.redraw();
  }

  private autoSelect(): void {
    const ready = livingUnits(this.state, 'squad').find((u) => u.ap > 0);
    this.setState(selectUnit(this.state, ready ? ready.id : null));
  }

  private cycleSelection(): void {
    if (this.state.turn !== 'squad' || this.busy) return;
    const squad = livingUnits(this.state, 'squad');
    if (!squad.length) return;
    const i = squad.findIndex((u) => u.id === this.state.selectedId);
    const next = squad[(i + 1) % squad.length]!;
    this.setState(selectUnit(this.state, next.id));
  }

  private onHover(p: Phaser.Input.Pointer): void {
    const tile = this.tileFromPointer(p);
    const sel = selectedUnit(this.state);
    if (!tile || !sel || this.state.turn !== 'squad') return this.tooltip.setVisible(false) && undefined;
    const target = unitAt(this.state, tile);
    if (target && target.team === 'alien') {
      const preview = previewShot(this.state.grid, sel, target);
      const text = preview
        ? `${target.name}  HP ${target.hp}/${target.maxHp}\nHit ${preview.chance}%  ${preview.cover ? 'in cover' : 'exposed'}  range ${preview.distance}`
        : `${target.name}  HP ${target.hp}/${target.maxHp}\nNo shot`;
      this.tooltip.setText(text).setPosition(p.x + 14, p.y + 14).setVisible(true);
      return;
    }
    this.tooltip.setVisible(false);
  }

  private onClick(p: Phaser.Input.Pointer): void {
    if (this.busy || this.state.outcome !== 'playing' || this.state.turn !== 'squad') return;
    const tile = this.tileFromPointer(p);
    if (!tile) return;
    const clicked = unitAt(this.state, tile);
    const sel = selectedUnit(this.state);

    if (clicked && clicked.team === 'squad') {
      this.setState(selectUnit(this.state, clicked.id));
      return;
    }
    if (!sel) return;
    if (clicked && clicked.team === 'alien') {
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
    if (this.state.outcome !== 'playing') return this.redraw();
    if (sel && sel.ap === 0) this.autoSelect();
    else this.setState(this.state);
  }

  private onEndTurn(): void {
    if (this.busy || this.state.turn !== 'squad' || this.state.outcome !== 'playing') return;
    this.busy = true;
    this.tooltip.setVisible(false);
    const afterEnd = endTurn(this.state);
    this.setState(afterEnd);
    // Slice 1: enemy turn resolves instantly after a short beat so the player sees the log.
    const { state } = runTeamTurn(afterEnd, 'alien');
    this.time.delayedCall(350, () => {
      this.busy = false;
      this.setState(state);
      this.autoSelect();
    });
  }

  private flash(at: Vec, color: number): void {
    const r = this.add.rectangle(at.x * TILE + TILE / 2, at.y * TILE + TILE / 2, TILE, TILE, color, 0.7).setDepth(5);
    this.tweens.add({ targets: r, alpha: 0, duration: 250, onComplete: () => r.destroy() });
  }

  private redraw(): void {
    const g = this.gfx;
    const { grid } = this.state;
    g.clear();
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const kind = tileAt(grid, { x, y });
        const color = kind === 'wall' ? COLORS.wall : kind === 'cover' ? COLORS.cover : (x + y) % 2 ? COLORS.floorAlt : COLORS.floor;
        g.fillStyle(color, 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
        if (kind === 'cover') {
          g.fillStyle(0x8a7549, 1);
          g.fillRect(x * TILE + 8, y * TILE + 8, TILE - 16, TILE - 16);
        }
      }
    }
    if (this.reach) {
      g.fillStyle(COLORS.reach, 0.55);
      for (const node of this.reach.values()) {
        if (node.dist === 0) continue;
        g.fillRect(node.pos.x * TILE + 2, node.pos.y * TILE + 2, TILE - 4, TILE - 4);
      }
    }
    for (const l of this.labels) l.destroy();
    this.labels = [];
    for (const u of this.state.units) {
      if (!u.alive) continue;
      this.drawUnit(g, u);
    }
    this.drawPanel();
  }

  private drawUnit(g: Phaser.GameObjects.Graphics, u: Unit): void {
    const cx = u.pos.x * TILE + TILE / 2;
    const cy = u.pos.y * TILE + TILE / 2;
    const isSel = u.id === this.state.selectedId;
    if (isSel) {
      g.lineStyle(3, COLORS.selected, 1);
      g.strokeCircle(cx, cy, TILE / 2 - 3);
    }
    g.fillStyle(u.team === 'squad' ? COLORS.squad : COLORS.alien, 1);
    if (u.team === 'squad') g.fillCircle(cx, cy, TILE / 2 - 7);
    else g.fillTriangle(cx, cy - 13, cx - 13, cy + 11, cx + 13, cy + 11);
    // HP bar
    const w = TILE - 10;
    g.fillStyle(COLORS.hpBg, 1);
    g.fillRect(cx - w / 2, cy + TILE / 2 - 7, w, 4);
    g.fillStyle(COLORS.hp, 1);
    g.fillRect(cx - w / 2, cy + TILE / 2 - 7, (w * u.hp) / u.maxHp, 4);
    // AP pips for squad
    if (u.team === 'squad') {
      for (let i = 0; i < u.maxAp; i++) {
        g.fillStyle(i < u.ap ? 0xfff2a8 : 0x555555, 1);
        g.fillCircle(cx - 6 + i * 12, cy - TILE / 2 + 6, 3);
      }
    }
    const label = this.add.text(cx, cy - 1, u.name.slice(0, 2).toUpperCase(), { fontFamily: 'monospace', fontSize: '11px', color: '#000' }).setOrigin(0.5);
    this.labels.push(label);
  }

  private drawPanel(): void {
    const s = this.state;
    const sel = selectedUnit(s);
    const lines = [`ILLUMINATUS  //  ${FARMSTEAD.name}`, `Round ${s.round}   ${s.turn === 'squad' ? 'YOUR TURN' : 'ENEMY TURN'}`, ''];
    if (sel) {
      lines.push(`> ${sel.name}`, `  HP ${sel.hp}/${sel.maxHp}   AP ${sel.ap}/${sel.maxAp}`, `  ${sel.weapon.name}  rng ${sel.weapon.range}  acc ${sel.weapon.accuracy}%  dmg ${sel.weapon.damage}`, '');
    }
    lines.push('Squad:');
    for (const u of s.units.filter((x) => x.team === 'squad')) {
      lines.push(`  ${u.alive ? '' : 'x '}${u.name.padEnd(7)} HP ${String(u.hp).padStart(2)}  AP ${u.ap}`);
    }
    lines.push('', `Aliens left: ${livingUnits(s, 'alien').length}`, '', 'Click unit: select   Click tile: move', 'Click alien: shoot   Tab: next unit');
    this.panel.setText(lines);
    this.logText.setText(s.log.slice(-9).map((l) => `${l.text}`));

    if (s.outcome !== 'playing') {
      this.banner.setText(s.outcome === 'won' ? 'AREA SECURED\n\nR to restart' : 'SQUAD LOST\n\nR to restart').setVisible(true);
      this.endTurnBtn.setVisible(false);
    } else {
      this.banner.setVisible(false);
      this.endTurnBtn.setVisible(s.turn === 'squad');
    }
  }
}
