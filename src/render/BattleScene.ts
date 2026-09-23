import Phaser from 'phaser';
import {
  canAct,
  createGame,
  distance,
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
  type Scenario,
  type Unit,
  type Vec,
} from '../game/index.ts';
import { completeMission, missionScenario, type MissionId } from '../game/strategy/missions.ts';
import type { CampaignState } from '../game/strategy/types.ts';
import { MISSION_TEXT } from '../game/strategy/text.ts';
import { CAMPAIGN_REGISTRY_KEY, writeCampaignSave } from './sceneGlue.ts';
import { boardLayout, gridToScreen, screenToGrid, tileDepth, TILE_W, type TileLayout } from './iso.ts';
import { COL, HEX, displayStyle, goldButton, textStyle } from './theme.ts';

export { TILE_H, TILE_W } from './iso.ts';
export const PANEL_W = 280;

const PANEL_X = 1000;
const ASSET_PATH = 'assets/';

const DIM_DISTANCE = 8; // terrain dims beyond this Chebyshev distance from every squad unit

interface TileSpec {
  floor: string;
  wall: string;
  cover: string;
  /** origin.y for the wall block so its top face centres on the tile diamond. */
  wallOriginY: number;
  wallHeight: number;
  coverWidth: number;
  coverHeight: number;
  coverOriginY: number;
  watery: boolean;
}

const HANGAR_TILES: TileSpec = {
  floor: 'hangar-floor', wall: 'hangar-wall', cover: 'crate',
  wallOriginY: 0.225, wallHeight: 67, coverWidth: 46, coverHeight: 50, coverOriginY: 0.22, watery: false,
};
const ATLANTIS_TILES: TileSpec = {
  floor: 'atlantis-floor', wall: 'atlantis-wall', cover: 'pillar',
  wallOriginY: 0.227, wallHeight: 66, coverWidth: 40, coverHeight: 118, coverOriginY: 0.18, watery: true,
};

const UNIT_SPRITES = {
  soldier: { key: 'unit-soldier', feet: 0.988 },
  guard: { key: 'unit-guard', feet: 0.992 },
  guardian: { key: 'unit-guardian', feet: 0.977 },
  sectoid: { key: 'unit-sectoid', feet: 0.945 },
} as const;

export class BattleScene extends Phaser.Scene {
  private state!: GameState;
  private scenario: Scenario = FARMSTEAD;
  private missionId: MissionId | null = null;
  private boardObjects: Phaser.GameObjects.GameObject[] = [];
  private panel!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private tooltip!: Phaser.GameObjects.Text;
  private endTurnBtn!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private reach: Reach | null = null;
  private busy = false;
  private returning = false;
  private tiles!: TileSpec;
  private layout!: TileLayout;
  /** Scale factor from the 60x30 reference tiles for terrain and sprites. */
  private tileScale = 1;
  /** A reinforcement arrival detected on the current enemy turn (for feedback). */
  private alarm: { pos: Vec; round: number } | null = null;

  constructor() {
    super('battle');
  }

  init(data: { missionId?: MissionId }): void {
    this.missionId = data.missionId ?? null;
    this.returning = false;
  }

  preload(): void {
    // Kenney miniature tiles (crumbs of the packs we actually use).
    for (const key of ['floor-hangar', 'wall-hangar', 'crate', 'floor-atlantis', 'wall-atlantis', 'pillar']) {
      this.load.image(key, `${ASSET_PATH}battle/${key}.png`);
    }
    // Legacy fallbacks so a failed load never blanks a tile.
    this.load.image('iso-floor', `${ASSET_PATH}platformerTile_35.png`);
    this.load.image('iso-wall', `${ASSET_PATH}platformerTile_30.png`);
    this.load.image('iso-cover', `${ASSET_PATH}platformerTile_22.png`);
    // Unit sprites (512px RGBA, facing down-right).
    for (const [id, sprite] of Object.entries(UNIT_SPRITES)) {
      this.load.image(sprite.key, `${ASSET_PATH}art/units/${id}.png`);
    }
    // Agent portraits.
    for (const name of ['cole', 'diaz', 'okafor', 'reyes']) {
      this.load.image(`portrait-${name}`, `${ASSET_PATH}art/portraits/${name}.jpg`);
    }
  }

  create(): void {
    if (this.missionId) {
      const campaign = this.registry.get(CAMPAIGN_REGISTRY_KEY) as CampaignState;
      this.scenario = missionScenario(campaign, this.missionId);
    } else {
      this.scenario = FARMSTEAD;
    }
    this.state = createGame(this.scenario, Date.now() % 100000);
    this.tiles = this.missionId === 'atlantis' ? ATLANTIS_TILES : HANGAR_TILES;
    this.layout = boardLayout(this.state.grid.width, this.state.grid.height);
    this.tileScale = this.layout.tileW / TILE_W;

    this.add.rectangle(PANEL_X, 0, PANEL_W, 720, COL.panelDark, 0.96).setOrigin(0).setDepth(9000);
    this.add.rectangle(PANEL_X, 0, 2, 720, COL.gold, 0.55).setOrigin(0).setDepth(9001);
    this.panel = this.add.text(PANEL_X + 16, 14, '', textStyle(13, HEX.text, { wordWrap: { width: PANEL_W - 32 } })).setDepth(9002);
    this.endTurnBtn = goldButton(this, PANEL_X + 20, 555, 'END TURN (E)', () => this.onEndTurn());
    this.endTurnBtn.setDepth(9002);
    this.hint = this.add.text(PANEL_X + 16, 600, '', textStyle(11, HEX.held, {
      backgroundColor: HEX.hintBg,
      padding: { x: 6, y: 5 },
      wordWrap: { width: PANEL_W - 44 },
    })).setDepth(9002);
    this.logText = this.add.text(PANEL_X + 16, 645, '', textStyle(11, HEX.logText, { wordWrap: { width: PANEL_W - 32 } })).setDepth(9002);
    this.tooltip = this.add.text(0, 0, '', textStyle(12, HEX.white, {
      backgroundColor: HEX.blackTranslucent,
      padding: { x: 6, y: 4 },
    })).setDepth(10000).setVisible(false);
    this.banner = this.add
      .text(this.layout.origin.x, 326, '', displayStyle(30, HEX.white, { backgroundColor: HEX.blackFade, padding: { x: 20, y: 12 } }))
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
      if (!this.missionId && this.state.outcome !== 'playing') this.scene.restart();
    });

    this.autoSelect();
    this.redraw();
  }

  private tileFromPointer(p: Phaser.Input.Pointer): Vec | null {
    if (p.x >= PANEL_X) return null;
    const tile = screenToGrid({ x: p.x, y: p.y }, this.layout.origin, this.layout.tileW, this.layout.tileH);
    if (!tile || tile.x < 0 || tile.y < 0 || tile.x >= this.state.grid.width || tile.y >= this.state.grid.height) return null;
    return tile;
  }

  private unitFromPointer(p: Phaser.Input.Pointer): Unit | null {
    const { tileW } = this.layout;
    const candidates = this.state.units
      .filter((unit) => unit.alive)
      .map((unit) => ({ unit, screen: gridToScreen(unit.pos, this.layout.origin, this.layout.tileW, this.layout.tileH) }))
      .filter(({ screen }) => Math.abs(p.x - screen.x) <= tileW * 0.3 && p.y >= screen.y - tileW * 1.1 && p.y <= screen.y + tileW * 0.17)
      .sort((a, b) => tileDepth(b.unit.pos) - tileDepth(a.unit.pos));
    return candidates[0]?.unit ?? null;
  }

  private setState(next: GameState): void {
    this.state = next;
    const sel = selectedUnit(next);
    this.reach = sel && canAct(next, sel) ? reachable(next.grid, next.units, sel.pos, sel.move) : null;
    this.redraw();
    if (next.outcome !== 'playing') this.finishMission(next.outcome);
  }

  private finishMission(result: 'won' | 'lost'): void {
    if (!this.missionId || this.returning) return;
    this.returning = true;
    const campaign = this.registry.get(CAMPAIGN_REGISTRY_KEY) as CampaignState;
    const next = completeMission(campaign, this.missionId, result);
    this.registry.set(CAMPAIGN_REGISTRY_KEY, next);
    writeCampaignSave(next);
    this.time.delayedCall(900, () => this.showDebrief(result, campaign, next));
  }

  private showDebrief(result: 'won' | 'lost', before: CampaignState, after: CampaignState): void {
    const copy = this.missionId ? MISSION_TEXT[this.missionId] : undefined;
    const squad = this.state.units.filter((unit) => unit.team === 'squad');
    const fallen = squad.filter((unit) => !unit.alive).map((unit) => unit.name);
    const gained = after.items.filter((item) => !before.items.includes(item));
    const exposureDelta = after.exposure - before.exposure;
    const lines = [
      result === 'won' ? 'MISSION COMPLETE' : 'MISSION FAILED',
      '',
      result === 'won'
        ? `Gained: ${gained.length ? gained.join(', ') : 'nothing new'}${exposureDelta ? `, Exposure ${exposureDelta > 0 ? '+' : ''}${exposureDelta}` : ''}`
        : `Lost 20 treasury (now ${after.treasury}). You can retry next turn.`,
      copy && result === 'won' ? `Reward: ${copy.reward}` : '',
      `Casualties: ${fallen.length ? fallen.join(', ') : 'none'}`,
      `Survivors: ${squad.length - fallen.length} of ${squad.length}`,
    ].filter((line, index) => line !== '' || index === 1);
    this.banner.setVisible(false);
    this.add.rectangle(this.layout.origin.x, 360, 620, 330, COL.panelDark, 0.97).setStrokeStyle(2, COL.gold).setDepth(10010);
    this.add.text(this.layout.origin.x, 300, lines, {
      fontFamily: '"IBM Plex Mono", monospace', fontSize: '17px', color: result === 'won' ? HEX.goldPale : HEX.text, align: 'center', lineSpacing: 8,
    }).setOrigin(0.5).setDepth(10011);
    goldButton(this, this.layout.origin.x - 80, 470, 'RETURN TO WORLD', () => this.scene.start('world'))
      .setOrigin(0.5).setDepth(10011);
  }

  private hintText(): string {
    const state = this.state;
    if (state.outcome !== 'playing') return '';
    if (state.turn !== 'squad') {
      return this.alarm && this.alarm.round === state.round
        ? 'Enemy turn. Alarm: reinforcements arrive.'
        : 'Enemy turn.';
    }
    const sel = selectedUnit(state);
    if (!sel) return 'Select a soldier.';
    if (state.objective) {
      const onTile = livingUnits(state, 'squad').some((unit) => unit.pos.x === state.objective!.tile.x && unit.pos.y === state.objective!.tile.y);
      if (onTile) return `Objective: hold the gold tile for ${state.objective.holdRounds} of your turns (${state.objectiveHoldRounds}/${state.objective.holdRounds}). Keep someone on it and END TURN.`;
    }
    if (sel.ap === 2) return 'Green tiles: move (1 AP). Hover an enemy for hit chance, click to shoot (1 AP).';
    return "Stand next to a crate for cover: it blocks only shots from the shooter's direction. E ends your turn.";
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
        this.flash(clicked.pos, result.hit ? COL.white : COL.miss);
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
    // Detect a reinforcement arrival from the state transition, not the log.
    const beforeIds = new Set(livingUnits(this.state, 'alien').map((unit) => unit.id));
    const afterEnd = endTurn(this.state);
    const spawned = livingUnits(afterEnd, 'alien').find((unit) => !beforeIds.has(unit.id));
    this.alarm = spawned ? { pos: { ...spawned.pos }, round: afterEnd.round } : null;
    if (spawned) this.flash(spawned.pos, COL.alien);
    this.setState(afterEnd);
    const { state } = runTeamTurn(afterEnd, 'alien');
    this.time.delayedCall(350, () => {
      this.busy = false;
      this.setState(state);
      this.autoSelect();
    });
  }

  private flash(at: Vec, color: number): void {
    const { tileW, tileH } = this.layout;
    const centre = gridToScreen(at, this.layout.origin, tileW, tileH);
    const marker = this.add.graphics();
    marker.fillStyle(color, 0.85).fillPoints([
      new Phaser.Geom.Point(centre.x, centre.y - tileH / 2),
      new Phaser.Geom.Point(centre.x + tileW / 2, centre.y),
      new Phaser.Geom.Point(centre.x, centre.y + tileH / 2),
      new Phaser.Geom.Point(centre.x - tileW / 2, centre.y),
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

  private textureFor(preferred: string, fallback: string): string {
    return this.textures.exists(preferred) ? preferred : (this.textures.exists(fallback) ? fallback : preferred);
  }

  private isDimmed(point: Vec): boolean {
    let minDistance = Infinity;
    for (const unit of this.state.units) {
      if (unit.team !== 'squad' || !unit.alive) continue;
      const d = distance(point, unit.pos);
      if (d < minDistance) minDistance = d;
    }
    return minDistance > DIM_DISTANCE;
  }

  private redraw(): void {
    this.clearBoard();
    const { grid } = this.state;
    const { tileW, tileH, origin } = this.layout;

    // Decorative water outside the playable grid (Atlantis only), sized to the board.
    if (this.tiles.watery) {
      const left = origin.x - (grid.height - 1) * (tileW / 2) - tileW / 2;
      const top = origin.y - tileH / 2;
      const width = (grid.width + grid.height - 2) * (tileW / 2) + tileW;
      const height = (grid.width + grid.height - 2) * (tileH / 2) + tileH;
      const water = this.track(this.add.graphics());
      water.fillStyle(COL.waterDeep, 1).fillRoundedRect(left - 6, top - 10, width + 12, height + 20, 24).setDepth(-10);
      water.fillStyle(COL.water, 1).fillRoundedRect(left, top, width, height, 20).setDepth(-10);
    }

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const point = { x, y };
        const centre = gridToScreen(point, origin, tileW, tileH);
        const dimmed = this.isDimmed(point);
        const floor = this.track(this.add.image(centre.x, centre.y, this.textureFor(this.tiles.floor, 'iso-floor')));
        floor.setDisplaySize(tileW, tileH);
        floor.setTint(dimmed ? COL.dimTint : (x + y) % 2 ? COL.floorAlt : COL.floor);
        floor.setDepth(0);
      }
    }

    if (this.state.objective) {
      this.drawObjectiveBeacon(this.state.objective.tile);
    }

    if (this.reach) {
      const highlight = this.track(this.add.graphics());
      highlight.fillStyle(COL.reach, 0.52).setDepth(2);
      for (const node of this.reach.values()) {
        if (node.dist === 0) continue;
        const centre = gridToScreen(node.pos, origin, tileW, tileH);
        highlight.fillPoints([
          new Phaser.Geom.Point(centre.x, centre.y - tileH / 2 + 2),
          new Phaser.Geom.Point(centre.x + tileW / 2 - 3, centre.y),
          new Phaser.Geom.Point(centre.x, centre.y + tileH / 2 - 2),
          new Phaser.Geom.Point(centre.x - tileW / 2 + 3, centre.y),
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
        const centre = gridToScreen(point, origin, tileW, tileH);
        const dimmed = this.isDimmed(point);
        this.drawObstacle(kind, centre, point, dimmed);
      }
    }

    this.drawPanel();
  }

  private drawObstacle(kind: 'wall' | 'cover', centre: { x: number; y: number }, point: Vec, dimmed: boolean): void {
    const isWall = kind === 'wall';
    const scale = this.tileScale;
    const texture = this.textureFor(isWall ? this.tiles.wall : this.tiles.cover, isWall ? 'iso-wall' : 'iso-cover');
    const width = (isWall ? this.layout.tileW : this.tiles.coverWidth * scale);
    const height = (isWall ? this.tiles.wallHeight * scale : this.tiles.coverHeight * scale);
    const originY = isWall ? this.tiles.wallOriginY : this.tiles.coverOriginY;
    const obstacle = this.track(this.add.image(centre.x, centre.y, texture));
    obstacle.setDisplaySize(width, height).setOrigin(0.5, originY).setDepth(tileDepth(point, 8));
    if (dimmed) obstacle.setTint(COL.dimTint);
  }

  private spriteFor(unit: Unit): { key: string; feet: number } {
    if (unit.team === 'squad') return UNIT_SPRITES.soldier;
    const name = unit.name.toLowerCase();
    if (name.includes('guardian')) return UNIT_SPRITES.guardian;
    if (name.includes('guard')) return UNIT_SPRITES.guard;
    return UNIT_SPRITES.sectoid;
  }

  private drawUnit(unit: Unit): void {
    const { tileW, tileH } = this.layout;
    const centre = gridToScreen(unit.pos, this.layout.origin, tileW, tileH);
    const container = this.track(this.add.container(centre.x, centre.y));
    container.setDepth(tileDepth(unit.pos, 5));

    // Base ring: coloured for the squad, red for enemies.
    const ring = this.add.graphics();
    ring.lineStyle(3, unit.team === 'squad' ? COL.squad : COL.alien, 0.9);
    ring.strokeEllipse(0, 0, tileW - 4, tileH + 8);

    const shape = this.add.graphics();
    shape.fillStyle(COL.black, 0.45).fillEllipse(0, 5, tileW * 0.43, tileW * 0.17);
    if (unit.id === this.state.selectedId) {
      shape.lineStyle(2, COL.white, 1).strokePoints([
        new Phaser.Geom.Point(0, -tileH / 2 + 1),
        new Phaser.Geom.Point(tileW / 2 - 4, 0),
        new Phaser.Geom.Point(0, tileH / 2 - 1),
        new Phaser.Geom.Point(-tileW / 2 + 4, 0),
      ], true);
    }

    const sprite = this.spriteFor(unit);
    const spriteImage = this.textures.exists(sprite.key) ? this.add.image(0, 0, sprite.key) : null;
    if (spriteImage) {
      const height = tileW * 1.6; // about 1.6 tiles tall
      spriteImage.setDisplaySize(height, height); // square source, uniform scale
      spriteImage.setOrigin(0.5, sprite.feet);
    } else {
      // Fallback glyph: rounded body or triangle.
      shape.fillStyle(unit.team === 'squad' ? COL.squad : COL.alien, 1);
      if (unit.team === 'squad') shape.fillRoundedRect(-tileW * 0.2, -tileW * 0.65, tileW * 0.4, tileW * 0.62, 5);
      else shape.fillTriangle(0, -tileW * 0.72, -tileW * 0.25, -tileW * 0.05, tileW * 0.25, -tileW * 0.05);
    }

    const hpWidth = tileW * 0.47;
    shape.fillStyle(COL.hpBg, 1).fillRect(-hpWidth / 2, -tileW * 0.8, hpWidth, 4);
    shape.fillStyle(COL.hp, 1).fillRect(-hpWidth / 2, -tileW * 0.8, (hpWidth * unit.hp) / unit.maxHp, 4);
    if (unit.team === 'squad') {
      for (let i = 0; i < unit.maxAp; i++) {
        shape.fillStyle(i < unit.ap ? COL.ap : COL.apEmpty, 1).fillCircle(-hpWidth / 2 + 4 + i * (hpWidth - 8) / Math.max(1, unit.maxAp - 1), -tileW * 0.72, 2.5);
      }
    }

    container.add([ring, shape]);
    if (spriteImage) container.add(spriteImage);
  }

  private drawObjectiveBeacon(tile: Vec): void {
    const { tileW, tileH } = this.layout;
    const centre = gridToScreen(tile, this.layout.origin, tileW, tileH);
    const beacon = this.track(this.add.graphics());
    beacon.fillStyle(COL.gold, 0.9).fillPoints([
      new Phaser.Geom.Point(centre.x, centre.y - tileH / 2 - 4),
      new Phaser.Geom.Point(centre.x + tileW / 2 - 4, centre.y),
      new Phaser.Geom.Point(centre.x, centre.y + tileH / 2 - 4),
      new Phaser.Geom.Point(centre.x - tileW / 2 + 4, centre.y),
    ], true);
    beacon.setDepth(3);
    this.tweens.add({ targets: beacon, alpha: { from: 0.35, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
    // A column of light above the tile, depth-sorted with the units, so the
    // objective stays visible when guards or crates stand in front of it.
    const column = this.track(this.add.graphics());
    const h = tileW * 1.9;
    column.fillStyle(COL.gold, 0.28).fillRect(centre.x - tileW * 0.16, centre.y - h, tileW * 0.32, h);
    column.fillStyle(COL.gold, 0.55).fillRect(centre.x - tileW * 0.05, centre.y - h, tileW * 0.1, h);
    column.setDepth(tileDepth(tile, 6) + 0.5);
    this.tweens.add({ targets: column, alpha: { from: 0.5, to: 1 }, duration: 900, yoyo: true, repeat: -1 });
    const label = this.track(this.add.text(centre.x, centre.y - h - 6, 'OBJECTIVE', textStyle(11, HEX.goldPale)).setOrigin(0.5, 1));
    label.setDepth(tileDepth(tile, 6) + 0.6);
  }

  private drawPanel(): void {
    const state = this.state;
    const sel = selectedUnit(state);
    const lines = [`ILLUMINATUS  //  ${this.scenario.name.toUpperCase()}`, `Round ${state.round}   ${state.turn === 'squad' ? 'YOUR TURN' : 'ENEMY TURN'}`, ''];
    if (state.objective) {
      lines.push('Reach the gold tile and hold it', `Hold: ${state.objectiveHoldRounds}/${state.objective.holdRounds} turns  or kill all enemies`, '');
    }
    if (sel) {
      lines.push(
        `> ${sel.name}`,
        `  HP ${sel.hp}/${sel.maxHp}   AP ${sel.ap}/${sel.maxAp}`,
        `  ${sel.weapon.name}  rng ${sel.weapon.range}`,
        `  acc ${sel.weapon.accuracy}%  dmg ${sel.weapon.damage}`,
      );
    }
    lines.push('', `Enemies left: ${livingUnits(state, 'alien').length}`);
    this.panel.setText(lines);
    this.hint.setText(this.hintText()).setVisible(this.hintText() !== '');
    this.logText.setText(state.log.slice(-5).map((entry) => entry.text));

    this.drawPortraitCards();

    if (state.outcome !== 'playing') {
      const suffix = this.missionId ? '' : '\n\nR to restart';
      this.banner.setText(`${state.outcome === 'won' ? 'AREA SECURED' : 'SQUAD LOST'}${suffix}`).setVisible(true);
      this.endTurnBtn.setVisible(false);
    } else {
      this.banner.setVisible(false);
      this.endTurnBtn.setVisible(state.turn === 'squad');
    }
  }

  private drawPortraitCards(): void {
    const squad = this.state.units.filter((unit) => unit.team === 'squad');
    const cards: Phaser.GameObjects.GameObject[] = [];
    squad.forEach((unit, index) => {
      const y = 250 + index * 78;
      const card = this.add.rectangle(PANEL_X + PANEL_W / 2, y + 34, PANEL_W - 24, 70, COL.cardBg, 0.95);
      card.setStrokeStyle(1, COL.gold, 0.6).setDepth(9010);
      cards.push(card);

      const portraitKey = `portrait-${unit.name.toLowerCase()}`;
      if (this.textures.exists(portraitKey)) {
        const portrait = this.add.image(PANEL_X + 20, y + 35, portraitKey);
        portrait.setDisplaySize(58, 58).setDepth(9011);
        cards.push(portrait);
        const frame = this.add.rectangle(PANEL_X + 20, y + 35, 60, 60);
        frame.setStrokeStyle(1, COL.gold, 0.85).setDepth(9012);
        cards.push(frame);
      } else {
        // Fallback: initials on a gold disc.
        const disc = this.add.circle(PANEL_X + 20, y + 35, 29, COL.goldDim, 1).setDepth(9011);
        const initials = unit.name.slice(0, 2).toUpperCase();
        const label = this.add.text(PANEL_X + 20, y + 35, initials, textStyle(16, HEX.black, { fontStyle: 'bold' })).setOrigin(0.5).setDepth(9012);
        cards.push(disc, label);
      }

      const name = this.add.text(PANEL_X + 56, y + 8, unit.name.toUpperCase(), textStyle(12, unit.alive ? HEX.text : HEX.faint)).setDepth(9011);
      cards.push(name);
      const status = this.add.text(PANEL_X + 220, y + 8, unit.alive ? '' : 'KIA', textStyle(11, HEX.danger)).setOrigin(1, 0).setDepth(9011);
      cards.push(status);

      // HP bar: the value sits right of the bar, never over it.
      const hpBg = this.add.rectangle(PANEL_X + 56, y + 32, 150, 8, COL.hpBg, 1).setOrigin(0, 0.5).setDepth(9011);
      const hp = this.add.rectangle(PANEL_X + 56, y + 32, (150 * unit.hp) / unit.maxHp, 8, COL.hp, 1).setOrigin(0, 0.5).setDepth(9012);
      const hpLabel = this.add.text(PANEL_X + 214, y + 32, String(unit.hp), textStyle(11, HEX.text)).setOrigin(0, 0.5).setDepth(9012);
      cards.push(hpBg, hp, hpLabel);

      // AP bar
      const apBg = this.add.rectangle(PANEL_X + 56, y + 48, 150, 6, COL.hpBg, 1).setOrigin(0, 0.5).setDepth(9011);
      const ap = this.add.rectangle(PANEL_X + 56, y + 48, (150 * unit.ap) / unit.maxAp, 6, COL.goldBright, 1).setOrigin(0, 0.5).setDepth(9012);
      const apLabel = this.add.text(PANEL_X + 214, y + 48, `${unit.ap} AP`, textStyle(11, HEX.goldPale)).setOrigin(0, 0.5).setDepth(9012);
      cards.push(apBg, ap, apLabel);
    });
    this.boardObjects.push(...cards);
  }
}