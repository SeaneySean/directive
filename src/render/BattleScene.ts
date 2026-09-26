import Phaser from 'phaser';
import {
  canAct,
  createGame,
  distance,
  endTurn,
  FARMSTEAD,
  hasFog,
  isKnownEnemy,
  key,
  livingUnits,
  moveUnit,
  previewShot,
  radar,
  reachable,
  runTeamTurn,
  selectUnit,
  selectedUnit,
  shoot,
  tileAt,
  unitAt,
  visibleTiles,
  type GameState,
  type Reach,
  type Scenario,
  type SurfaceTag,
  type Unit,
  type Vec,
} from '../game/index.ts';
import { completeMission, completeOffer, missionScenario, offerById, offerScenario, OFFER_INFLUENCE_GAIN, type MissionId } from '../game/strategy/missions.ts';
import type { CampaignState } from '../game/strategy/types.ts';
import { MISSION_TEXT } from '../game/strategy/text.ts';
import { CAMPAIGN_REGISTRY_KEY, writeCampaignSave } from './sceneGlue.ts';
import { boardLayout, districtLayout, gridToScreen, screenToGrid, tileDepth, TILE_W, type ScreenPoint, type TileLayout } from './iso.ts';
import { COL, HEX, displayStyle, goldButton, textStyle } from './theme.ts';

export { TILE_H, TILE_W } from './iso.ts';
export const PANEL_W = 280;

const PANEL_X = 1000;
const ASSET_PATH = 'assets/';
const BOARD_W = 1000;
const BOARD_H = 720;

const DIM_DISTANCE = 8; // terrain dims beyond this Chebyshev distance from every squad unit (story maps only)

// --- District fog + city rendering constants ---
const FOG_DIM = 0.4; // explored-but-not-visible brightness (X-COM)
const DRAG_THRESHOLD = 5; // px of pointer travel before a drag is no longer a click
const EDGE_SCROLL = 28; // px zone along the board edges that pans the camera
const PAN_SPEED = 0.5; // px per ms while a pan key is held
const RADAR_W = 200;
const RADAR_H = 140;
const RADAR_X = 8;
const RADAR_Y = BOARD_H - RADAR_H - 8;

/** Surface-tag floor tints for the district (dark, warm-lit city). */
const SURFACE_TINT: Record<SurfaceTag, number> = {
  road: 0x454b52,
  pavement: 0x69717a,
  plaza: 0x596168,
  interior: 0x342f2b,
};

/** Multiply a 24-bit colour by a brightness factor, clamped. */
function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

interface TileSpec {
  floor: string;
  wall: string;
  cover: string;
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

const CITY_PROPS = ['city-prop-tree', 'city-prop-tree2', 'city-prop-crate'];

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
  private offerId: string | null = null;
  private boardObjects: Phaser.GameObjects.GameObject[] = [];
  /** HUD portrait cards, kept separate from the board so camera pans don't clear them. */
  private portraitObjects: Phaser.GameObjects.GameObject[] = [];
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
  private campaign!: CampaignState;
  private tileScale = 1;
  private alarm: { pos: Vec; round: number } | null = null;

  // District camera + fog state.
  private isDistrict = false;
  private cam: { x: number; y: number } = { x: 0, y: 0 };
  private worldMinX = 0;
  private worldMinY = 0;
  private worldMaxX = BOARD_W;
  private worldMaxY = BOARD_H;
  private visible: Set<string> = new Set();
  private known: Set<string> = new Set();
  private panKeys = new Set<'up' | 'down' | 'left' | 'right'>();
  private dragStart: { x: number; y: number; camX: number; camY: number } | null = null;
  private dragged = false;

  constructor() {
    super('battle');
  }

  init(data: { missionId?: MissionId; offerId?: string }): void {
    this.missionId = data.missionId ?? null;
    this.offerId = data.offerId ?? null;
    this.returning = false;
  }

  preload(): void {
    for (const keyName of ['floor-hangar', 'wall-hangar', 'crate', 'floor-atlantis', 'wall-atlantis', 'pillar']) {
      this.load.image(keyName, `${ASSET_PATH}battle/${keyName}.png`);
    }
    this.load.image('iso-floor', `${ASSET_PATH}platformerTile_35.png`);
    this.load.image('iso-wall', `${ASSET_PATH}platformerTile_30.png`);
    this.load.image('iso-cover', `${ASSET_PATH}platformerTile_22.png`);
    for (const cityKey of ['city-road', 'city-pavement', 'city-wall', 'city-roof', 'city-door', 'city-prop-tree', 'city-prop-tree2', 'city-prop-crate']) {
      this.load.image(cityKey, `${ASSET_PATH}battle/${cityKey}.png`);
    }
    for (const [id, sprite] of Object.entries(UNIT_SPRITES)) {
      this.load.image(sprite.key, `${ASSET_PATH}art/units/${id}.png`);
    }
    for (const name of ['cole', 'diaz', 'okafor', 'reyes']) {
      this.load.image(`portrait-${name}`, `${ASSET_PATH}art/portraits/${name}.jpg`);
    }
  }

  create(): void {
    const campaign = this.registry.get(CAMPAIGN_REGISTRY_KEY) as CampaignState;
    this.campaign = campaign;
    if (this.offerId) {
      this.scenario = offerScenario(campaign, this.offerId);
    } else if (this.missionId) {
      this.scenario = missionScenario(campaign, this.missionId);
    } else {
      this.scenario = FARMSTEAD;
    }
    this.state = createGame(this.scenario, Date.now() % 100000);
    this.tiles = this.missionId === 'atlantis' ? ATLANTIS_TILES : HANGAR_TILES;
    this.isDistrict = hasFog(this.state);
    this.layout = this.isDistrict
      ? districtLayout(this.state.grid.width, this.state.grid.height)
      : boardLayout(this.state.grid.width, this.state.grid.height);
    this.tileScale = this.layout.tileW / TILE_W;
    this.cam = { x: 0, y: 0 };
    this.computeWorldBounds();

    // The board area is black behind un-drawn (unexplored) district tiles.
    if (this.isDistrict) {
      this.add.rectangle(0, 0, BOARD_W, BOARD_H, COL.black, 1).setOrigin(0).setDepth(-1000);
    }

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
      .text(500, 326, '', displayStyle(30, HEX.white, { backgroundColor: HEX.blackFade, padding: { x: 20, y: 12 } }))
      .setOrigin(0.5)
      .setDepth(10001)
      .setVisible(false);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on('pointerupoutside', () => (this.dragStart = null));
    this.input.keyboard?.on('keydown-E', () => this.onEndTurn());
    this.input.keyboard?.on('keydown-TAB', (ev: KeyboardEvent) => {
      ev.preventDefault();
      this.cycleSelection();
    });
    this.input.keyboard?.on('keydown-R', () => {
      if (!this.missionId && !this.offerId && this.state.outcome !== 'playing') this.scene.restart();
    });
    this.hookPanKeys();

    this.autoSelect();
    this.redraw();
  }

  /** World-space pixel span of the board, for camera clamping. */
  private computeWorldBounds(): void {
    if (!this.isDistrict) return;
    const { width, height } = this.state.grid;
    const tw = this.layout.tileW;
    const th = this.layout.tileH;
    this.worldMinX = this.layout.origin.x - (height - 1) * (tw / 2) - tw;
    this.worldMinY = this.layout.origin.y - th * 4;
    this.worldMaxX = this.layout.origin.x + (width - 1) * (tw / 2) + tw;
    this.worldMaxY = this.layout.origin.y + (width + height - 2) * (th / 2) + th * 3;
  }

  private hookPanKeys(): void {
    const keys = this.input.keyboard;
    if (!keys) return;
    const bind = (k: string, dir: 'up' | 'down' | 'left' | 'right') => {
      keys.on(`keydown-${k}`, () => this.panKeys.add(dir));
      keys.on(`keyup-${k}`, () => this.panKeys.delete(dir));
    };
    bind('W', 'up'); bind('A', 'left'); bind('S', 'down'); bind('D', 'right');
    bind('UP', 'up'); bind('LEFT', 'left'); bind('DOWN', 'down'); bind('RIGHT', 'right');
  }

  // --- Camera helpers ---

  /** World screen coordinate → board viewport coordinate (camera offset applied). */
  private toScreen(p: ScreenPoint): ScreenPoint {
    return this.isDistrict ? { x: p.x - this.cam.x, y: p.y - this.cam.y } : p;
  }

  private tileScreen(point: Vec): ScreenPoint {
    return this.toScreen(gridToScreen(point, this.layout.origin, this.layout.tileW, this.layout.tileH));
  }

  private screenToTile(p: ScreenPoint): Vec | null {
    const world = this.isDistrict ? { x: p.x + this.cam.x, y: p.y + this.cam.y } : { x: p.x, y: p.y };
    const tile = screenToGrid(world, this.layout.origin, this.layout.tileW, this.layout.tileH);
    if (!tile || tile.x < 0 || tile.y < 0 || tile.x >= this.state.grid.width || tile.y >= this.state.grid.height) return null;
    return tile;
  }

  private clampCam(): void {
    const maxX = Math.max(this.worldMinX, this.worldMaxX - BOARD_W);
    const maxY = Math.max(this.worldMinY, this.worldMaxY - BOARD_H);
    this.cam.x = Math.min(Math.max(this.cam.x, this.worldMinX - 20), maxX + 20);
    this.cam.y = Math.min(Math.max(this.cam.y, this.worldMinY - 40), maxY + 20);
  }

  private centerOn(point: Vec): void {
    if (!this.isDistrict) return;
    const centre = gridToScreen(point, this.layout.origin, this.layout.tileW, this.layout.tileH);
    this.cam.x = centre.x - BOARD_W / 2;
    this.cam.y = centre.y - BOARD_H / 2;
    this.clampCam();
  }

  update(_time: number, delta: number): void {
    if (!this.isDistrict || this.state.outcome !== 'playing' || this.busy) return;
    if (!this.panKeys.size && !this.isEdgePointer()) return;
    const d = PAN_SPEED * delta;
    if (this.panKeys.has('left')) this.cam.x -= d;
    if (this.panKeys.has('right')) this.cam.x += d;
    if (this.panKeys.has('up')) this.cam.y -= d;
    if (this.panKeys.has('down')) this.cam.y += d;
    if (this.isEdgePointer()) {
      const p = this.input.activePointer;
      if (p.x < EDGE_SCROLL) this.cam.x -= d;
      else if (p.x > BOARD_W - EDGE_SCROLL) this.cam.x += d;
      if (p.y < EDGE_SCROLL) this.cam.y -= d;
      else if (p.y > BOARD_H - EDGE_SCROLL) this.cam.y += d;
    }
    this.clampCam();
    this.redrawBoard();
  }

  private isEdgePointer(): boolean {
    const p = this.input.activePointer;
    if (p.x < PANEL_X - 1) return p.x < EDGE_SCROLL || p.x > BOARD_W - EDGE_SCROLL || p.y < EDGE_SCROLL || p.y > BOARD_H - EDGE_SCROLL;
    return false;
  }

  // --- Input ---

  private tileFromPointer(p: Phaser.Input.Pointer): Vec | null {
    if (p.x >= PANEL_X) return null;
    return this.screenToTile({ x: p.x, y: p.y });
  }

  private unitFromPointer(p: Phaser.Input.Pointer): Unit | null {
    const { tileW } = this.layout;
    const candidates = this.state.units
      .filter((unit) => unit.alive)
      .filter((unit) => !this.isDistrict || unit.team === 'squad' || this.visible.has(key(unit.pos)))
      .map((unit) => ({ unit, screen: this.tileScreen(unit.pos) }))
      .filter(({ screen }) => Math.abs(p.x - screen.x) <= tileW * 0.3 && p.y >= screen.y - tileW * 1.1 && p.y <= screen.y + tileW * 0.17)
      .sort((a, b) => tileDepth(b.unit.pos) - tileDepth(a.unit.pos));
    return candidates[0]?.unit ?? null;
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.isDistrict && p.x < RADAR_X + RADAR_W && p.y > RADAR_Y && p.x < PANEL_X) {
      this.panToRadar(p);
      return;
    }
    if (p.x >= PANEL_X) return;
    this.dragStart = { x: p.x, y: p.y, camX: this.cam.x, camY: this.cam.y };
    this.dragged = false;
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    this.tooltip.setVisible(false);
    if (this.dragStart && !this.dragged) {
      const dx = p.x - this.dragStart.x;
      const dy = p.y - this.dragStart.y;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) this.dragged = true;
    }
    if (this.dragStart && this.dragged && this.isDistrict && p.x < PANEL_X) {
      this.cam.x = this.dragStart.camX - (p.x - this.dragStart.x);
      this.cam.y = this.dragStart.camY - (p.y - this.dragStart.y);
      this.clampCam();
      this.redrawBoard();
    }
    if (!this.dragStart) this.onHover(p);
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.dragStart && this.dragged) {
      this.dragStart = null;
      return;
    }
    const wasDrag = this.dragStart !== null;
    this.dragStart = null;
    if (!wasDrag) return;
    this.onClick(p);
  }

  // --- Radar ---

  private panToRadar(p: Phaser.Input.Pointer): void {
    const localX = p.x - RADAR_X;
    const localY = p.y - RADAR_Y;
    const { width, height } = this.state.grid;
    const scale = Math.min((RADAR_W - 12) / width, (RADAR_H - 12) / height);
    const ox = (RADAR_W - width * scale) / 2;
    const oy = (RADAR_H - height * scale) / 2;
    const gx = Math.floor((localX - ox) / scale);
    const gy = Math.floor((localY - oy) / scale);
    if (gx < 0 || gy < 0 || gx >= width || gy >= height) return;
    this.centerOn({ x: gx, y: gy });
    this.redrawBoard();
  }

  // --- State transitions ---

  private setState(next: GameState): void {
    this.state = next;
    const sel = selectedUnit(next);
    this.reach = sel && canAct(next, sel) ? reachable(next.grid, next.units, sel.pos, sel.move) : null;
    if (sel) this.centerOn(sel.pos);
    this.redraw();
    if (next.outcome !== 'playing') this.finishMission(next.outcome);
  }

  private finishMission(result: 'won' | 'lost'): void {
    if ((!this.missionId && !this.offerId) || this.returning) return;
    this.returning = true;
    const campaign = this.registry.get(CAMPAIGN_REGISTRY_KEY) as CampaignState;
    const next = this.offerId
      ? completeOffer(campaign, this.offerId, result, this.state)
      : completeMission(campaign, this.missionId!, result, this.state);
    this.registry.set(CAMPAIGN_REGISTRY_KEY, next);
    writeCampaignSave(next);
    this.time.delayedCall(900, () => this.showDebrief(result, campaign, next));
  }

  private showDebrief(result: 'won' | 'lost', before: CampaignState, after: CampaignState): void {
    const squad = this.state.units.filter((unit) => unit.team === 'squad');
    const fallen = squad.filter((unit) => !unit.alive).map((unit) => unit.name);
    const exposureDelta = after.exposure - before.exposure;
    const lines: string[] = [
      result === 'won' ? 'MISSION COMPLETE' : 'MISSION FAILED',
      '',
    ];

    if (this.offerId) {
      const offer = offerById(before, this.offerId);
      const region = before.regions.find((candidate) => candidate.id === offer?.regionId);
      if (result === 'won') {
        lines.push(`+${OFFER_INFLUENCE_GAIN} ${(offer?.path ?? '').toUpperCase()} in ${(region?.name ?? '').toUpperCase()}`);
        lines.push(`Resistance -5 · Exposure +${exposureDelta}`);
      } else {
        lines.push(`-20 treasury (now ${after.treasury}) · Exposure +${exposureDelta}`);
        lines.push('That offer is spent; a fresh mission appears next turn.');
      }
      lines.push(`Casualties: ${fallen.length ? fallen.join(', ') : 'none'}`);
      lines.push(`Survivors: ${squad.length - fallen.length} of ${squad.length}`);
    } else {
      const copy = this.missionId ? MISSION_TEXT[this.missionId] : undefined;
      const gained = after.items.filter((item) => !before.items.includes(item));
      if (result === 'won') {
        lines.push(`Gained: ${gained.length ? gained.join(', ') : 'nothing new'}${exposureDelta ? `, Exposure ${exposureDelta > 0 ? '+' : ''}${exposureDelta}` : ''}`);
      } else {
        lines.push(`Lost 20 treasury (now ${after.treasury}). You can retry next turn.`);
      }
      if (copy && result === 'won') lines.push(`Reward: ${copy.reward}`);
      lines.push(`Casualties: ${fallen.length ? fallen.join(', ') : 'none'}`);
      lines.push(`Survivors: ${squad.length - fallen.length} of ${squad.length}`);
    }
    this.banner.setVisible(false);
    lines.push('');
    lines.push('SQUAD RESULTS');
    for (const soldier of after.roster) {
      const prev = before.roster.find((candidate) => candidate.id === soldier.id) ?? soldier;
      const kills = soldier.kills - prev.kills;
      const promoted = prev.rank === 0 && soldier.rank === 1;
      if (!soldier.alive) {
        lines.push(`${soldier.name.toUpperCase()}  —  KIA`);
      } else {
        const hp = prev.hp === soldier.hp ? `HP ${soldier.hp}` : `HP ${prev.hp}→${soldier.hp}`;
        const killNote = kills === 1 ? '+1 kill' : `+${kills} kills`;
        lines.push(`${soldier.name.toUpperCase()}  ${hp}  ${killNote}${promoted ? '  → OPERATIVE' : ''}`);
      }
    }
    this.add.rectangle(500, 366, 620, 372, COL.panelDark, 0.97).setStrokeStyle(2, COL.gold).setDepth(10010);
    this.add.text(500, 300, lines, {
      fontFamily: '\"IBM Plex Mono\", monospace', fontSize: '14px', color: result === 'won' ? HEX.goldPale : HEX.text, align: 'center', lineSpacing: 6,
    }).setOrigin(0.5).setDepth(10011);
    goldButton(this, 500 - 80, 522, 'RETURN TO WORLD', () => this.scene.start('world'))
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

    const objectiveHint = this.objectiveHint();
    if (objectiveHint) return objectiveHint;

    if (sel.ap === 2) return 'Green tiles: move (1 AP). Hover an enemy for hit chance, click to shoot (1 AP).';
    return "Stand next to a crate for cover: it blocks only shots from the shooter's direction. E ends your turn.";
  }

  private objectiveHint(): string | null {
    const objective = this.state.objective;
    if (!objective) return null;
    switch (objective.kind) {
      case 'hold':
        return `Objective: hold the gold tile for ${objective.holdRounds} of your turns (${this.state.objectiveHoldRounds}/${objective.holdRounds}). Keep someone on it and END TURN.`;
      case 'recover':
        return this.state.carrierId
          ? 'Carrier: reach a green extraction tile on the south edge.'
          : 'End a soldier turn on the gold crate to pick it up, then reach a green extraction tile.';
      case 'assassinate':
        return 'Kill the gold-ringed target before it escapes through a red exit.';
      case 'clash':
        return 'Eliminate every rival operative.';
    }
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
    if (target?.team === 'alien' && (!this.isDistrict || isKnownEnemy(this.state, target))) {
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
    let clicked: Unit | undefined = pointerUnit ?? unitAt(this.state, tile);
    // Hidden enemies never react to clicks (and never leak through unitAt).
    if (clicked && this.isDistrict && clicked.team === 'alien' && !isKnownEnemy(this.state, clicked)) clicked = undefined;
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
    const beforeIds = new Set(livingUnits(this.state, 'alien').map((unit) => unit.id));
    const afterEnd = endTurn(this.state);
    const spawned = livingUnits(afterEnd, 'alien').find((unit) => !beforeIds.has(unit.id));
    this.alarm = spawned ? { pos: { ...spawned.pos }, round: afterEnd.round } : null;
    // Reinforcement feedback only when the arrival tile is currently visible (no fog leak).
    if (spawned && (!this.isDistrict || visibleTiles(afterEnd).has(key(spawned.pos)))) {
      this.flash(spawned.pos, COL.alien);
    }
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
    const centre = this.tileScreen(at);
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

  private surfaceAt(point: Vec): SurfaceTag {
    return this.state.district?.surfaces[point.y * this.state.grid.width + point.x] ?? 'road';
  }

  private isExplored(point: Vec): boolean {
    return !!this.state.explored[point.y * this.state.grid.width + point.x];
  }

  private isVisible(point: Vec): boolean {
    return this.visible.has(key(point));
  }

  /** True when a tile should be culled (well outside the board viewport). */
  private offScreen(screen: ScreenPoint, pad = 120): boolean {
    return screen.x < -pad || screen.x > BOARD_W + pad || screen.y < -pad || screen.y > BOARD_H + pad;
  }

  // --- Drawing ---

  private refreshFog(): void {
    this.visible = visibleTiles(this.state);
    this.known = new Set(Object.keys(this.state.knownEnemyPositions));
  }

  private drawFloorTint(surface: SurfaceTag, explored: boolean, isVisible: boolean): number | null {
    // Returns null when the floor should not be drawn (unexplored).
    if (!explored) return null;
    const base = SURFACE_TINT[surface];
    return isVisible ? base : shade(base, FOG_DIM);
  }

  private redraw(): void {
    this.drawBoard();
    this.drawPanel();
  }

  private redrawBoard(): void {
    this.drawBoard();
  }

  private drawBoard(): void {
    this.clearBoard();
    this.refreshFog();
    const { grid } = this.state;
    const { tileW, tileH } = this.layout;

    if (!this.isDistrict) {
      this.drawClassicBoard(grid, tileW, tileH);
      return;
    }

    this.drawDistrictFloors(grid, tileW, tileH);
    this.drawObjectiveMarkers();
    this.drawReach();
    this.drawUnits();
    this.drawDistrictObstacles(grid, tileW, tileH);
    this.drawRadar();
  }

  /** Story missions keep the pre-fog renderer exactly: auto-fit, per-tile floor parity + distance dimming. */
  private drawClassicBoard(grid: GameState['grid'], tileW: number, tileH: number): void {
    const origin = this.layout.origin;
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

    this.drawObjectiveMarkers();
    if (this.reach) this.drawClassicReach(tileW, tileH);
    for (const unit of this.state.units) if (unit.alive) this.drawUnit(unit);

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
  }

  private drawDistrictFloors(grid: GameState['grid'], tileW: number, tileH: number): void {
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const point = { x, y };
        if (tileAt(grid, point) !== 'floor') continue;
        const centre = this.tileScreen(point);
        if (this.offScreen(centre)) continue;
        const tint = this.drawFloorTint(this.surfaceAt(point), this.isExplored(point), this.isVisible(point));
        if (tint === null) continue;
        const floor = this.track(this.add.image(centre.x, centre.y, this.textureFor('city-road', 'iso-floor')));
        floor.setDisplaySize(tileW, tileH);
        floor.setTint(tint);
        floor.setDepth(0);
      }
    }
  }

  private drawDistrictObstacles(grid: GameState['grid'], tileW: number, tileH: number): void {
    // Roof faces first (over interiors, above walls), then walls, then props and doors.
    this.drawRoofs(grid, tileW, tileH);
    const buildings = this.state.district?.buildings ?? [];

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const point = { x, y };
        const kind = tileAt(grid, point);
        if (kind === 'floor') continue;
        const centre = this.tileScreen(point);
        if (this.offScreen(centre)) continue;
        if (!this.isExplored(point)) continue;

        const visibleHere = this.isVisible(point);
        if (kind === 'wall') {
          if (this.isDoorway(point, buildings)) continue; // doorway, not wall
          const wall = this.track(this.add.image(centre.x, centre.y, this.textureFor('city-wall', 'iso-wall')));
          wall.setDisplaySize(tileW, tileW).setOrigin(0.5, 0.25).setDepth(tileDepth(point, 8));
          if (!visibleHere) wall.setTint(shade(0xffffff, FOG_DIM));
        } else {
          // Cover prop, deterministic per tile.
          const prop = CITY_PROPS[(x * 7 + y * 13) % CITY_PROPS.length]!;
          const cover = this.track(this.add.image(centre.x, centre.y, this.textureFor(prop, 'iso-cover')));
          cover.setDisplaySize(tileW * 0.55, tileW * 0.72).setOrigin(0.5, 1).setDepth(tileDepth(point, 7));
          if (!visibleHere) cover.setTint(shade(0xffffff, FOG_DIM));
        }
      }
    }

    // Doorway markers (drawn after walls so the opening reads).
    const doorways = buildings.flatMap((b) => b.doorways);
    for (const d of doorways) {
      const centre = this.tileScreen(d);
      if (this.offScreen(centre)) continue;
      if (!this.isExplored(d)) continue;
      const door = this.track(this.add.image(centre.x, centre.y, this.textureFor('city-door', 'iso-wall')));
      door.setDisplaySize(tileW * 0.5, tileW * 0.9).setOrigin(0.5, 0.95).setDepth(tileDepth(d, 2));
    }
  }

  private isDoorway(point: Vec, buildings: ReadonlyArray<{ doorways: Vec[] }>): boolean {
    return buildings.some((b) => b.doorways.some((d) => d.x === point.x && d.y === point.y));
  }

  /** One translucent roof top face per building (the cut-away X-COM look). */
  private drawRoofs(grid: GameState['grid'], tileW: number, tileH: number): void {
    const buildings = this.state.district?.buildings ?? [];
    for (const b of buildings) {
      for (let y = b.y + 1; y < b.y + b.h - 1; y++) {
        for (let x = b.x + 1; x < b.x + b.w - 1; x++) {
          const point = { x, y };
          if (tileAt(grid, point) !== 'floor') continue;
          if (!this.isExplored(point)) continue;
          const centre = this.tileScreen(point);
          if (this.offScreen(centre)) continue;
          const raised = { ...centre, y: centre.y - tileW * 0.45 };
          const roof = this.track(this.add.image(raised.x, raised.y, this.textureFor('city-roof', 'iso-wall')));
          roof.setDisplaySize(tileW, tileH).setOrigin(0.5).setAlpha(0.34).setDepth(tileDepth(point, 12));
          if (!this.isVisible(point)) roof.setTint(shade(0xffffff, FOG_DIM));
        }
      }
    }
  }

  private drawReach(): void {
    if (!this.reach) return;
    const { tileW, tileH } = this.layout;
    const highlight = this.track(this.add.graphics());
    highlight.fillStyle(COL.reach, 0.52).setDepth(2);
    for (const node of this.reach.values()) {
      if (node.dist === 0) continue;
      if (this.isDistrict && !this.isVisible(node.pos)) continue;
      const centre = this.tileScreen(node.pos);
      highlight.fillPoints([
        new Phaser.Geom.Point(centre.x, centre.y - tileH / 2 + 2),
        new Phaser.Geom.Point(centre.x + tileW / 2 - 3, centre.y),
        new Phaser.Geom.Point(centre.x, centre.y + tileH / 2 - 2),
        new Phaser.Geom.Point(centre.x - tileW / 2 + 3, centre.y),
      ], true);
    }
  }

  private drawClassicReach(tileW: number, tileH: number): void {
    if (!this.reach) return;
    const origin = this.layout.origin;
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

  private drawUnits(): void {
    for (const unit of this.state.units) {
      if (!unit.alive) continue;
      if (unit.team === 'squad') {
        this.drawUnit(unit);
        continue;
      }
      if (!this.isDistrict) {
        this.drawUnit(unit);
        continue;
      }
      if (this.visible.has(key(unit.pos))) {
        this.drawUnit(unit);
      } else if (this.known.has(unit.id)) {
        const stored = this.state.knownEnemyPositions[unit.id];
        if (stored) this.drawSilhouette(unit, stored);
      }
    }
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

  private drawSilhouette(unit: Unit, at: Vec): void {
    const { tileW } = this.layout;
    const centre = this.tileScreen(at);
    if (this.offScreen(centre)) return;
    const sprite = this.spriteFor(unit);
    if (!this.textures.exists(sprite.key)) return;
    const ghost = this.track(this.add.image(centre.x, centre.y, sprite.key));
    const height = tileW * 1.6;
    ghost.setDisplaySize(height, height).setOrigin(0.5, sprite.feet);
    ghost.setAlpha(0.38).setTint(COL.miss);
    ghost.setDepth(tileDepth(at, 5));
  }

  private drawUnit(unit: Unit): void {
    const { tileW, tileH } = this.layout;
    const centre = this.tileScreen(unit.pos);
    const interior = this.isDistrict && this.surfaceAt(unit.pos) === 'interior';
    const container = this.track(this.add.container(centre.x, centre.y));
    // Units inside a building are always drawn above the walls and roof that would hide them.
    container.setDepth(tileDepth(unit.pos, interior ? 16 : 5));

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
      const height = tileW * 1.6;
      spriteImage.setDisplaySize(height, height);
      spriteImage.setOrigin(0.5, sprite.feet);
    } else {
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

    if (this.state.objective?.kind === 'assassinate' && this.state.objective.targetId === unit.id) {
      const goldRing = this.add.graphics();
      goldRing.lineStyle(3, COL.gold, 0.95);
      goldRing.strokeEllipse(0, 0, tileW + 2, tileH + 14);
      const label = this.add.text(0, -tileW * 1.6 - 4, 'TARGET', textStyle(10, HEX.goldPale, {
        backgroundColor: HEX.hintBg,
        padding: { x: 4, y: 2 },
      })).setOrigin(0.5, 1);
      container.add([goldRing, label]);
    }

    if (this.state.carrierId === unit.id) {
      const crate = this.add.graphics();
      const w = tileW * 0.26;
      const h = tileW * 0.2;
      crate.fillStyle(COL.gold, 1);
      crate.fillRect(-w / 2, -tileW * 1.6 - h - 6, w, h);
      crate.lineStyle(1, COL.black, 0.85);
      crate.strokeRect(-w / 2 + 3, -tileW * 1.6 - h - 3, w - 6, h - 6);
      container.add(crate);
    }
  }

  private drawObjectiveBeacon(tile: Vec): void {
    const { tileW, tileH } = this.layout;
    const centre = this.tileScreen(tile);
    const beacon = this.track(this.add.graphics());
    beacon.fillStyle(COL.gold, 0.9).fillPoints([
      new Phaser.Geom.Point(centre.x, centre.y - tileH / 2 - 4),
      new Phaser.Geom.Point(centre.x + tileW / 2 - 4, centre.y),
      new Phaser.Geom.Point(centre.x, centre.y + tileH / 2 - 4),
      new Phaser.Geom.Point(centre.x - tileW / 2 + 4, centre.y),
    ], true);
    beacon.setDepth(3);
    this.tweens.add({ targets: beacon, alpha: { from: 0.35, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
    const column = this.track(this.add.graphics());
    const h = tileW * 1.9;
    column.fillStyle(COL.gold, 0.28).fillRect(centre.x - tileW * 0.16, centre.y - h, tileW * 0.32, h);
    column.fillStyle(COL.gold, 0.55).fillRect(centre.x - tileW * 0.05, centre.y - h, tileW * 0.1, h);
    column.setDepth(tileDepth(tile, 6) + 0.5);
    this.tweens.add({ targets: column, alpha: { from: 0.5, to: 1 }, duration: 900, yoyo: true, repeat: -1 });
    const label = this.track(this.add.text(centre.x, centre.y - h - 6, 'OBJECTIVE', textStyle(11, HEX.goldPale)).setOrigin(0.5, 1));
    label.setDepth(tileDepth(tile, 6) + 0.6);
  }

  private drawGlowTile(tile: Vec, color: number, alpha = 0.5): void {
    const { tileW, tileH } = this.layout;
    const centre = this.tileScreen(tile);
    const glow = this.track(this.add.graphics());
    glow.fillStyle(color, alpha);
    glow.fillPoints([
      new Phaser.Geom.Point(centre.x, centre.y - tileH / 2 + 2),
      new Phaser.Geom.Point(centre.x + tileW / 2 - 3, centre.y),
      new Phaser.Geom.Point(centre.x, centre.y + tileH / 2 - 2),
      new Phaser.Geom.Point(centre.x - tileW / 2 + 3, centre.y),
    ], true);
    glow.setDepth(2);
  }

  /** Board objective overlays obey fog: they only render on explored tiles. */
  private drawObjectiveMarkers(): void {
    const objective = this.state.objective;
    if (!objective) return;

    if (objective.kind === 'hold') {
      if (!this.isDistrict || this.isExplored(objective.tile)) this.drawObjectiveBeacon(objective.tile);
      return;
    }

    if (objective.kind === 'recover') {
      for (const tile of objective.extraction) {
        if (!this.isDistrict || this.isExplored(tile)) this.drawGlowTile(tile, COL.reach, 0.55);
      }
      if (!this.state.carrierId && (!this.isDistrict || this.isExplored(objective.tile))) this.drawObjectiveBeacon(objective.tile);
      return;
    }

    if (objective.kind === 'assassinate') {
      for (const tile of objective.exits) {
        if (!this.isDistrict || this.isExplored(tile)) this.drawGlowTile(tile, COL.alien, 0.55);
      }
      return;
    }

    // clash: no tile markers.
  }

  // --- Radar panel ---

  private drawRadar(): void {
    if (!this.isDistrict) return;
    const data = radar(this.state);
    const { width, height } = this.state.grid;
    const scale = Math.min((RADAR_W - 12) / width, (RADAR_H - 12) / height);
    const ox = (RADAR_W - width * scale) / 2;
    const oy = (RADAR_H - height * scale) / 2;

    const panel = this.track(this.add.graphics());
    panel.setDepth(9500);
    panel.fillStyle(COL.panelDark, 0.92).fillRect(RADAR_X, RADAR_Y, RADAR_W, RADAR_H);
    panel.lineStyle(1, COL.gold, 0.9).strokeRect(RADAR_X + 0.5, RADAR_Y + 0.5, RADAR_W - 1, RADAR_H - 1);

    // Explored bitmap + walls lighter.
    const px = (gx: number, gy: number) => ({ x: RADAR_X + ox + gx * scale, y: RADAR_Y + oy + gy * scale });
    panel.fillStyle(COL.faint, 0.55);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!data.explored[y * width + x]) continue;
        const p = px(x, y);
        const isWall = tileAt(this.state.grid, { x, y }) === 'wall';
        panel.fillStyle(isWall ? COL.textDim : COL.faint, isWall ? 0.9 : 0.35);
        panel.fillRect(p.x, p.y, scale + 0.5, scale + 0.5);
      }
    }

    // Squad -> blue, known enemies -> red, objective -> gold.
    const dot = (p: { x: number; y: number }, color: number, size = 2.2) => {
      panel.fillStyle(color, 1);
      panel.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    };
    for (const pos of data.squad) dot(px(pos.x, pos.y), COL.squad, 2.6);
    for (const enemy of data.enemies) dot(px(enemy.pos.x, enemy.pos.y), COL.alien, 2.2);
    for (const tile of data.objective) dot(px(tile.x, tile.y), COL.gold, 2.6);

    // Assassination target: gold blip + a bearing arrow at the panel edge when off-explored.
    if (data.targetLastKnown) {
      const centre = px(data.targetLastKnown.x, data.targetLastKnown.y);
      panel.fillStyle(COL.gold, 1);
      panel.fillCircle(centre.x, centre.y, 2.6);
      if (data.targetBearing !== null && !data.explored[data.targetLastKnown.y * width + data.targetLastKnown.x]) {
        this.drawBearingArrow(panel, data.targetBearing);
      }
    }

    // Viewport rectangle: map the camera's four world corners back to grid space.
    this.drawViewportRect(panel);
  }

  private drawBearingArrow(panel: Phaser.GameObjects.Graphics, bearing: number): void {
    const cx = RADAR_X + RADAR_W / 2;
    const cy = RADAR_Y + RADAR_H / 2;
    const tipX = cx + Math.cos(bearing) * (RADAR_W / 2 - 6);
    const tipY = cy + Math.sin(bearing) * (RADAR_H / 2 - 6);
    panel.lineStyle(2, COL.gold, 1);
    panel.strokeTriangle(
      cx + Math.cos(bearing) * 2, cy + Math.sin(bearing) * 2,
      tipX - Math.sin(bearing) * 3, tipY + Math.cos(bearing) * 3,
      tipX + Math.sin(bearing) * 3, tipY - Math.cos(bearing) * 3,
    );
  }

  private drawViewportRect(panel: Phaser.GameObjects.Graphics): void {
    const { width, height } = this.state.grid;
    const scale = Math.min((RADAR_W - 12) / width, (RADAR_H - 12) / height);
    const ox = (RADAR_W - width * scale) / 2;
    const oy = (RADAR_H - height * scale) / 2;
    const corners: ScreenPoint[] = [
      { x: this.cam.x, y: this.cam.y },
      { x: this.cam.x + BOARD_W, y: this.cam.y },
      { x: this.cam.x + BOARD_W, y: this.cam.y + BOARD_H },
      { x: this.cam.x, y: this.cam.y + BOARD_H },
    ];
    const points: Phaser.Geom.Point[] = [];
    for (const corner of corners) {
      const tile = screenToGrid(corner, this.layout.origin, this.layout.tileW, this.layout.tileH);
      const gx = tile ? Math.max(0, Math.min(width - 1, tile.x)) : (corner.x < this.layout.origin.x ? 0 : width - 1);
      const gy = tile ? Math.max(0, Math.min(height - 1, tile.y)) : (corner.y < this.layout.origin.y ? 0 : height - 1);
      points.push(new Phaser.Geom.Point(RADAR_X + ox + gx * scale, RADAR_Y + oy + gy * scale));
    }
    panel.lineStyle(1, COL.gold, 0.7);
    panel.strokePoints(points, true, true);
  }

  private drawPanel(): void {
    const state = this.state;
    const sel = selectedUnit(state);
    const lines = [`ILLUMINATUS  //  ${this.scenario.name.toUpperCase()}`, `Round ${state.round}   ${state.turn === 'squad' ? 'YOUR TURN' : 'ENEMY TURN'}`, ''];
    const objective = state.objective;
    if (objective?.kind === 'hold') {
      lines.push('Reach the gold tile and hold it', `Hold: ${state.objectiveHoldRounds}/${objective.holdRounds} turns  or kill all enemies`, '');
    } else if (objective?.kind === 'recover') {
      lines.push(state.carrierId ? 'Carry the item to a green edge tile' : 'Recover the item, then extract', '', '');
    } else if (objective?.kind === 'assassinate') {
      const target = state.units.find((unit) => unit.id === objective.targetId);
      lines.push(target && target.alive ? 'Kill the marked target' : 'Target eliminated', target && target.alive ? 'before it reaches a red exit' : '', '');
    } else if (objective?.kind === 'clash') {
      lines.push('Eliminate the rival squad', '');
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
      const suffix = this.missionId || this.offerId ? '' : '\n\nR to restart';
      this.banner.setText(`${state.outcome === 'won' ? 'AREA SECURED' : 'SQUAD LOST'}${suffix}`).setVisible(true);
      this.endTurnBtn.setVisible(false);
    } else {
      this.banner.setVisible(false);
      this.endTurnBtn.setVisible(state.turn === 'squad');
    }
  }

  private drawPortraitCards(): void {
    for (const object of this.portraitObjects) object.destroy();
    this.portraitObjects = [];
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
        const disc = this.add.circle(PANEL_X + 20, y + 35, 29, COL.goldDim, 1).setDepth(9011);
        const initials = unit.name.slice(0, 2).toUpperCase();
        const label = this.add.text(PANEL_X + 20, y + 35, initials, textStyle(16, HEX.black, { fontStyle: 'bold' })).setOrigin(0.5).setDepth(9012);
        cards.push(disc, label);
      }

      const name = this.add.text(PANEL_X + 56, y + 8, unit.name.toUpperCase(), textStyle(12, unit.alive ? HEX.text : HEX.faint)).setDepth(9011);
      cards.push(name);
      const rosterSoldier = this.campaign.roster.find((soldier) => soldier.id === unit.id);
      const rank = this.add.text(PANEL_X + 56, y + 23, rosterSoldier?.rank === 1 ? 'OPERATIVE' : 'AGENT', textStyle(9, rosterSoldier?.rank === 1 ? HEX.goldPale : HEX.dim)).setDepth(9011);
      cards.push(rank);
      const status = this.add.text(PANEL_X + 220, y + 8, unit.alive ? '' : 'KIA', textStyle(11, HEX.danger)).setOrigin(1, 0).setDepth(9011);
      cards.push(status);

      const hpBg = this.add.rectangle(PANEL_X + 56, y + 40, 150, 8, COL.hpBg, 1).setOrigin(0, 0.5).setDepth(9011);
      const hp = this.add.rectangle(PANEL_X + 56, y + 40, (150 * unit.hp) / unit.maxHp, 8, COL.hp, 1).setOrigin(0, 0.5).setDepth(9012);
      const hpLabel = this.add.text(PANEL_X + 214, y + 40, String(unit.hp), textStyle(11, HEX.text)).setOrigin(0, 0.5).setDepth(9012);
      cards.push(hpBg, hp, hpLabel);

      const apBg = this.add.rectangle(PANEL_X + 56, y + 56, 150, 6, COL.hpBg, 1).setOrigin(0, 0.5).setDepth(9011);
      const ap = this.add.rectangle(PANEL_X + 56, y + 56, (150 * unit.ap) / unit.maxAp, 6, COL.goldBright, 1).setOrigin(0, 0.5).setDepth(9012);
      const apLabel = this.add.text(PANEL_X + 214, y + 56, `${unit.ap} AP`, textStyle(11, HEX.goldPale)).setOrigin(0, 0.5).setDepth(9012);
      cards.push(apBg, ap, apLabel);
    });
    this.portraitObjects = cards;
  }
}