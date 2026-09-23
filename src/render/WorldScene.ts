import Phaser from 'phaser';
import {
  actionCost,
  assignAction,
  availableActions,
  clearAction,
  createCampaign,
  endTurn,
  heldRegions,
  isActionAvailable,
  visibleMeter,
} from '../game/strategy/campaign.ts';
import { ACTIONS } from '../game/strategy/data.ts';
import { pendingEvent, resolveEvent } from '../game/strategy/events.ts';
import {
  MISSIONS,
  availableMissions,
  canRecruit,
  recruitSoldier,
  startMission,
} from '../game/strategy/missions.ts';
import { livingSoldiers, RECRUIT_COST } from '../game/strategy/roster.ts';
import {
  availableOffers,
  launchOffer,
  offerScenario,
  OFFER_EXPOSURE,
  OFFER_INFLUENCE_GAIN,
  remainingAgents,
} from '../game/strategy/missions.ts';
import { RESEARCH, chooseResearch, isResearchAvailable } from '../game/strategy/research.ts';
import {
  ACTION_TEXT,
  EVENT_CHOICE_TEXT,
  EVENT_CONTEXT,
  MISSION_TEXT,
  OFFER_TEXT,
  RESEARCH_TEXT,
  guideText,
  regionDescription,
} from '../game/strategy/text.ts';
import type { CampaignState, InfluencePath, MissionOffer, RegionState, Soldier } from '../game/strategy/types.ts';
import type { Scenario } from '../game/types.ts';
import { showHelpOverlay } from './HelpOverlay.ts';
import { CAMPAIGN_REGISTRY_KEY, writeCampaignSave } from './sceneGlue.ts';
import { COL, HEX, crtScanlines, displayStyle, drawPanel, goldButton, textStyle } from './theme.ts';
import { MAP_OFFSET, MAP_SCALE, mapPointToScreen, regionPolygon } from './world-regions.ts';

const WIDTH = 1280;
const HEIGHT = 720;
const PANEL_X = 1000;

const PATH_COLOUR: Record<InfluencePath, number> = {
  subvert: COL.subvert,
  force: COL.force,
  enlighten: COL.enlighten,
};

const PATH_HEX: Record<InfluencePath, string> = {
  subvert: HEX.gold,
  force: HEX.forceText,
  enlighten: HEX.enlightenText,
};

function dominantPath(region: RegionState): InfluencePath {
  let dominant: InfluencePath = 'subvert';
  if (region.meters.force > region.meters[dominant]) dominant = 'force';
  if (region.meters.enlighten > region.meters[dominant]) dominant = 'enlighten';
  return dominant;
}

export class WorldScene extends Phaser.Scene {
  private state!: CampaignState;
  private selectedRegionId: string | null = null;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private hoverText!: Phaser.GameObjects.Text;
  private dismissedGuideTurns = new Set<number>();
  private offersPage = 0;
  private squadsTab = false;

  constructor() {
    super('world');
  }

  preload(): void {
    this.load.image('world-map', 'assets/art/world-map.jpg');
    // The designer's files are event-<shortname>.jpg, but the event id for the
    // miracle is 'miracle-at-the-well'; map ids to their image filenames.
    const eventImages: ReadonlyArray<readonly [string, string]> = [
      ['candidate', 'candidate'],
      ['leak', 'leak'],
      ['whistleblower', 'whistleblower'],
      ['miracle-at-the-well', 'miracle'],
      ['summit', 'summit'],
    ];
    for (const [id, file] of eventImages) {
      this.load.image(`event-${id}`, `assets/art/event-${file}.jpg`);
    }
    for (const id of ['area-51', 'atlantis']) {
      this.load.image(`briefing-${id}`, `assets/art/briefing-${id}.jpg`);
    }
    // Agent portraits for the squad panel (recruits fall back to initials).
    for (const name of ['cole', 'diaz', 'okafor', 'reyes']) {
      this.load.image(`portrait-${name}`, `assets/art/portraits/${name}.jpg`);
    }
  }

  create(): void {
    this.state = (this.registry.get(CAMPAIGN_REGISTRY_KEY) as CampaignState | undefined)
      ?? createCampaign(Date.now() | 0);
    this.registry.set(CAMPAIGN_REGISTRY_KEY, this.state);
    writeCampaignSave(this.state);
    this.cameras.main.setBackgroundColor(COL.bg);
    this.redraw();
  }

  private track<T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth>(object: T): T {
    this.objects.push(object);
    return object;
  }

  private redraw(): void {
    this.registry.set(CAMPAIGN_REGISTRY_KEY, this.state);
    writeCampaignSave(this.state);
    if (this.state.outcome !== 'playing') {
      this.scene.start('ending');
      return;
    }
    for (const object of this.objects) object.destroy();
    this.objects = [];

    this.drawMap();
    this.drawHud();
    this.drawMissionsPanel();
    this.drawResearchPanel();
    this.drawHelpButton();
    this.drawGuide();
    if (pendingEvent(this.state)) this.drawEventModal();
  }

  /** Night-earth map fills the map area; regions are translucent polygons over it. */
  private drawMap(): void {
    if (this.textures.exists('world-map')) {
      const map = this.track(this.add.image(MAP_OFFSET.x, MAP_OFFSET.y, 'world-map'));
      map.setOrigin(0).setScale(MAP_SCALE).setDepth(0);
    }
    for (const region of this.state.regions) {
      this.drawRegion(region);
    }
    this.hoverText = this.track(this.add.text(0, 0, '', textStyle(13, HEX.white, {
      backgroundColor: HEX.hoverBg,
      padding: { x: 7, y: 5 },
      wordWrap: { width: 360 },
    }))).setDepth(15_000).setVisible(false);
  }

  private drawRegion(region: RegionState): void {
    const polygon = regionPolygon(region.id);
    if (!polygon) return;
    const points = polygon.points.map((point) => mapPointToScreen(point));
    const centroid = mapPointToScreen(polygon.centroid);
    const path = dominantPath(region);
    const selected = region.id === this.selectedRegionId;

    const fill = this.track(this.add.graphics());
    fill.fillStyle(region.held ? COL.gold : PATH_COLOUR[path], region.held ? 0.42 : 0.24);
    fill.fillPoints(points.map((point) => new Phaser.Geom.Point(point.x, point.y)), true);
    fill.setDepth(1);
    if (region.held || selected) {
      fill.lineStyle(2, COL.gold, selected ? 1 : 0.8);
      fill.strokePoints(points.map((point) => new Phaser.Geom.Point(point.x, point.y)), true, true);
    }

    const hit = this.track(this.add.polygon(0, 0, points, COL.white, 0.001));
    hit.setDepth(2).setOrigin(0, 0);
    hit.setInteractive({
      hitArea: hit.geom,
      hitAreaCallback: Phaser.Geom.Polygon.Contains,
      useHandCursor: true,
    });
    this.attachHover(hit, `${region.name}: ${regionDescription(region)}`);
    if (this.state.outcome === 'playing' && !pendingEvent(this.state)) {
      hit.on('pointerdown', () => {
        this.selectedRegionId = region.id;
        this.redraw();
      });
    }

    this.drawMeterCard(region, centroid, path);
  }

  private drawMeterCard(region: RegionState, centre: { x: number; y: number }, path: InfluencePath): void {
    const width = 132;
    const height = 54;
    const held = region.held;
    const card = this.track(this.add.rectangle(centre.x, centre.y, width, height, COL.panel, 0.88));
    card.setStrokeStyle(1, held ? COL.gold : PATH_COLOUR[path], 0.8).setDepth(3);

    this.track(this.add.text(centre.x, centre.y - 20, region.name.toUpperCase(), textStyle(11, held ? HEX.held : HEX.text, {
      fontFamily: '"Cinzel", Georgia, serif',
    }))).setOrigin(0.5).setDepth(4);

    const left = centre.x - width / 2;
    const right = centre.x + width / 2;
    const labelX = left + 7;   // path letter, left-aligned and fully inside the card
    const valueX = right - 7;  // meter value, right-aligned
    const barX = left + 22;
    const barW = right - 30 - barX;
    (['subvert', 'force', 'enlighten'] as const).forEach((meterPath, index) => {
      const y = centre.y - 7 + index * 11;
      const shown = visibleMeter(this.state, region.meters[meterPath]);
      const g = this.track(this.add.graphics()).setDepth(4);
      g.fillStyle(COL.empty, 1).fillRect(barX, y, barW, 6);
      g.fillStyle(PATH_COLOUR[meterPath], 1).fillRect(barX, y, (barW * shown) / 100, 6);
      this.track(this.add.text(labelX, y - 3, meterPath[0]!.toUpperCase(), textStyle(11, PATH_HEX[meterPath]))).setDepth(5);
      this.track(this.add.text(valueX, y - 3, String(Math.round(shown)), textStyle(11, HEX.text))).setOrigin(1, 0).setDepth(5);
    });

    // A small gold glyph marks a region with an open generated mission.
    const openOffer = this.state.offers.find((offer) => offer.regionId === region.id && offer.status === 'open');
    if (openOffer) {
      const glyph = this.track(this.add.graphics()).setDepth(6);
      const gx = centre.x + width / 2 - 11;
      const gy = centre.y - height / 2 + 8;
      glyph.fillStyle(COL.gold, 1);
      glyph.fillPoints([
        new Phaser.Geom.Point(gx, gy - 5),
        new Phaser.Geom.Point(gx + 5, gy),
        new Phaser.Geom.Point(gx, gy + 5),
        new Phaser.Geom.Point(gx - 5, gy),
      ], true);
    }
  }

  private drawHud(): void {
    const graphics = this.track(drawPanel(this, PANEL_X, 0, WIDTH - PANEL_X, HEIGHT));
    graphics.setDepth(10);

    this.track(this.add.text(PANEL_X + 16, 18, 'ILLUMINATUS', displayStyle(26, HEX.gold))).setDepth(11);
    this.track(this.add.text(PANEL_X + 16, 54, 'WORLD CONTROL', textStyle(12, HEX.dim))).setDepth(11);

    const used = Object.keys(this.state.assignments).length + this.state.spentMissionAgents;
    this.track(this.add.text(PANEL_X + 16, 82, `TURN ${this.state.turn}`, textStyle(20, HEX.goldBright))).setDepth(11);
    this.track(this.add.text(PANEL_X + 16, 114, [
      `TREASURY  ${this.state.treasury}`,
      `AGENTS    ${used}/${this.state.agents}`,
      `REGIONS   ${heldRegions(this.state).length}/5`,
    ], textStyle(14, HEX.text))).setDepth(11);

    this.track(this.add.text(PANEL_X + 16, 186, `EXPOSURE ${Math.round(this.state.exposure)}/100`, textStyle(13, HEX.exposureText))).setDepth(11);
    const exposureBar = this.track(this.add.graphics()).setDepth(11);
    exposureBar.fillStyle(COL.empty, 1).fillRect(PANEL_X + 16, 210, 248, 14);
    exposureBar.fillStyle(COL.exposure, 1).fillRect(PANEL_X + 16, 210, (248 * this.state.exposure) / 100, 14);

    const region = this.state.regions.find((candidate) => candidate.id === this.selectedRegionId);
    if (region) this.drawActionPicker(region);
    else this.track(this.add.text(PANEL_X + 16, 252, 'SELECT A REGION', textStyle(13, HEX.dim))).setDepth(11);

    const endTurn = this.track(goldButton(this, PANEL_X + 20, 655, 'END TURN', () => {
      this.state = endTurnCampaign(this.state);
      this.redraw();
    }, { size: 16, padding: { x: 14, y: 9 } }));
    endTurn.setDepth(11);
    if (this.state.outcome !== 'playing' || pendingEvent(this.state)) {
      endTurn.disableInteractive();
      endTurn.setAlpha(0.5);
    }
  }

  private attachHover(object: Phaser.GameObjects.GameObject, copy: string): void {
    object.on('pointerover', (pointer: Phaser.Input.Pointer) => {
      this.hoverText.setText(copy)
        .setPosition(Math.min(pointer.x + 12, WIDTH - 380), Math.min(pointer.y + 12, HEIGHT - 90))
        .setVisible(true);
    });
    object.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.hoverText.setPosition(Math.min(pointer.x + 12, WIDTH - 380), Math.min(pointer.y + 12, HEIGHT - 90));
    });
    object.on('pointerout', () => this.hoverText.setVisible(false));
  }

  private drawHelpButton(): void {
    const help = this.track(goldButton(this, 566, 36, '?', () => showHelpOverlay(this), { size: 15, padding: { x: 6, y: 3 } }));
    help.setDepth(2000);
  }

  private drawGuide(): void {
    const copy = guideText(this.state.turn);
    if (!copy || this.dismissedGuideTurns.has(this.state.turn)) return;
    const strip = this.track(this.add.rectangle(WIDTH / 2, 16, WIDTH, 32, COL.hintBg, 1))
      .setStrokeStyle(1, COL.subvert).setDepth(2000);
    const label = this.track(this.add.text(26, 6, copy, textStyle(14, HEX.held))).setDepth(2001);
    const close = this.track(goldButton(this, 1230, 4, 'X', () => {
      this.dismissedGuideTurns.add(this.state.turn);
      strip.destroy();
      label.destroy();
    }, { size: 13, padding: { x: 5, y: 2 } }));
    close.setDepth(2001);
  }

  private drawMissionsPanel(): void {
    const x = 600;
    const top = 36;
    const panelW = 388;
    const depth = 20;
    const tabH = 26;

    const squadTab = this.track(goldButton(this, x + 92, top + 3, 'SQUAD', () => {
      if (!this.squadsTab) { this.squadsTab = true; this.redraw(); }
    }, { size: 10, padding: { x: 7, y: 4 } })).setDepth(depth + 2);
    const missionTab = this.track(goldButton(this, x + 8, top + 3, 'MISSIONS', () => {
      if (this.squadsTab) { this.squadsTab = false; this.redraw(); }
    }, { size: 10, padding: { x: 7, y: 4 } })).setDepth(depth + 2);
    (this.squadsTab ? squadTab : missionTab).setBackgroundColor(HEX.goldHover);

    if (this.squadsTab) {
      this.drawSquadPanel(x, top + tabH + 8, panelW, depth);
      return;
    }

    const contentTop = top + tabH + 8;
    const available = new Set(availableMissions(this.state).map((mission) => mission.id));
    const story = MISSIONS.filter((mission) =>
      available.has(mission.id) || this.state.missions[mission.id]?.status === 'completed',
    );
    const open = availableOffers(this.state);
    const pageSize = 5;
    const pageCount = Math.max(1, Math.ceil(open.length / pageSize));
    const page = Math.min(this.offersPage, pageCount - 1);
    const pageOffers = open.slice(page * pageSize, (page + 1) * pageSize);
    const canAct = this.state.outcome === 'playing' && !pendingEvent(this.state);
    const agents = remainingAgents(this.state);
    const noSquad = livingSoldiers(this.state).length === 0;

    const rowH = 23;
    const gutterH = 12;
    const navH = 22;
    const storyH = story.length ? story.length * rowH : 0;
    const offersH = open.length ? (pageOffers.length * rowH + gutterH) : 0;
    const totalH = (storyH ? storyH + 6 : 0)
      + (open.length ? 16 + offersH : 0)
      + (open.length ? navH : 0) + 18;

    this.track(drawPanel(this, x, contentTop, panelW, totalH, { alpha: 0.97 })).setDepth(depth);
    let y = contentTop + 12;

    // Story missions first, unchanged behaviour.
    for (const mission of story) {
      const complete = this.state.missions[mission.id]?.status === 'completed';
      this.track(this.add.text(x + 8, y, `${mission.name.toUpperCase()}  ${complete ? 'COMPLETE' : 'AVAILABLE'}`,
        textStyle(11, complete ? HEX.complete : HEX.text))).setDepth(depth + 1);
      if (!complete) {
        const launch = this.track(goldButton(this, x + panelW - 82, y - 5, noSquad ? 'NO SQUAD' : 'LAUNCH', () => {
          this.drawMissionBriefing(mission.id, mission.name, mission.scenario);
        }, { size: 11, padding: { x: 5, y: 4 } })).setDepth(depth + 1);
        if (!canAct || noSquad) {
          launch.disableInteractive();
          launch.setAlpha(0.5);
        }
      }
      y += rowH;
    }

    if (!open.length) {
      if (!story.length) {
        this.track(this.add.text(x + 8, y, 'NO MISSIONS AVAILABLE', textStyle(11, HEX.faint))).setDepth(depth + 1);
      }
      return;
    }

    y += 4;
    this.track(this.add.text(x + 8, y, `REGIONAL MISSIONS  ${agents} AGENT${agents === 1 ? '' : 'S'} FREE`, textStyle(11, HEX.dim))).setDepth(depth + 1);
    y += 16;

    for (const offer of pageOffers) {
      const region = this.state.regions.find((candidate) => candidate.id === offer.regionId);
      const copy = OFFER_TEXT[offer.type];
      const label = `${(region?.name ?? offer.regionId).toUpperCase()} · ${copy.name.split(' ')[0]} · +${OFFER_INFLUENCE_GAIN} ${offer.path.toUpperCase()}`;
      this.track(this.add.text(x + 8, y, label, textStyle(11, HEX.text))).setDepth(depth + 1);
      const launch = this.track(goldButton(this, x + panelW - 82, y - 5, noSquad ? 'NO SQUAD' : 'LAUNCH', () => {
        this.drawOfferBriefing(offer);
      }, { size: 11, padding: { x: 5, y: 4 } })).setDepth(depth + 1);
      if (!canAct || agents <= 0 || noSquad) {
        launch.disableInteractive();
        launch.setAlpha(0.5);
      }
      y += rowH;
    }

    if (pageCount > 1) {
      const navY = y + 4;
      this.track(goldButton(this, x + panelW - 150, navY, 'PREV', () => {
        this.offersPage = (page + pageCount - 1) % pageCount;
        this.redraw();
      }, { size: 10, padding: { x: 5, y: 3 } })).setDepth(depth + 1);
      this.track(this.add.text(x + panelW - 82, navY + 1, `${page + 1}/${pageCount}`, textStyle(11, HEX.text)).setOrigin(0.5, 0)).setDepth(depth + 1);
      this.track(goldButton(this, x + panelW - 52, navY, 'NEXT', () => {
        this.offersPage = (page + 1) % pageCount;
        this.redraw();
      }, { size: 10, padding: { x: 5, y: 3 } })).setDepth(depth + 1);
    }
  }

  /** The four soldier slots, each with portrait, name, rank, HP and career kills. */
  private drawSquadPanel(x: number, top: number, panelW: number, depth: number): void {
    const roster = this.state.roster;
    const living = roster.filter((soldier) => soldier.alive).length;
    const anyKia = roster.some((soldier) => !soldier.alive);

    const rowH = 52;
    const warningH = living === 0 ? 20 : 0;
    const recruitH = anyKia ? 36 : 0;
    const totalH = roster.length * rowH + warningH + recruitH + 20;

    this.track(drawPanel(this, x, top, panelW, totalH, { alpha: 0.97 })).setDepth(depth);
    let y = top + 8;

    roster.forEach((soldier) => {
      this.drawSquadSlot(x, y, panelW, soldier, depth);
      y += rowH;
    });

    if (living === 0) {
      this.track(this.add.text(x + 8, y + 2, 'NO SOLDIERS LEFT — RECRUIT A REPLACEMENT', textStyle(11, HEX.danger))).setDepth(depth + 1);
      y += warningH;
    }

    if (anyKia) {
      const allowed = canRecruit(this.state);
      const recruit = this.track(goldButton(this, x + 8, y + 4, `RECRUIT  —  TREASURY ${RECRUIT_COST}`, () => {
        this.state = recruitSoldier(this.state);
        this.redraw();
      }, { size: 11, padding: { x: 8, y: 7 } })).setDepth(depth + 1);
      if (!allowed) {
        recruit.disableInteractive();
        recruit.setAlpha(0.5);
      }
    }
  }

  private drawSquadSlot(x: number, y: number, panelW: number, soldier: Soldier, depth: number): void {
    const card = this.track(this.add.rectangle(x + panelW / 2, y + 23, panelW - 20, 46, COL.cardBg, 0.95));
    card.setStrokeStyle(1, COL.gold, soldier.alive ? 0.55 : 0.25).setDepth(depth + 1);

    const portraitKey = `portrait-${soldier.name.toLowerCase()}`;
    if (this.textures.exists(portraitKey)) {
      const portrait = this.track(this.add.image(x + 15, y + 23, portraitKey));
      portrait.setDisplaySize(42, 42).setDepth(depth + 2);
    } else {
      this.track(this.add.circle(x + 15, y + 23, 20, COL.goldDim, 1)).setDepth(depth + 2);
      this.track(this.add.text(x + 15, y + 23, soldier.name.slice(0, 2).toUpperCase(), textStyle(13, HEX.black, { fontStyle: 'bold' })))
        .setOrigin(0.5).setDepth(depth + 3);
    }

    this.track(this.add.text(x + 42, y + 2, soldier.name.toUpperCase(), textStyle(11, soldier.alive ? HEX.text : HEX.faint)))
      .setDepth(depth + 2);
    this.track(this.add.text(x + 42, y + 16, soldier.rank === 1 ? 'OPERATIVE' : 'AGENT', textStyle(9, soldier.rank === 1 ? HEX.goldPale : HEX.dim)))
      .setDepth(depth + 2);

    const hpW = 96;
    this.track(this.add.rectangle(x + 42, y + 34, hpW, 7, COL.hpBg, 1).setOrigin(0, 0.5)).setDepth(depth + 2);
    this.track(this.add.rectangle(x + 42, y + 34, (hpW * soldier.hp) / soldier.maxHp, 7, soldier.alive ? COL.hp : COL.miss, 1).setOrigin(0, 0.5)).setDepth(depth + 3);
    this.track(this.add.text(x + 42 + hpW + 8, y + 34, `${soldier.hp}/${soldier.maxHp}`, textStyle(10, HEX.text)).setOrigin(0, 0.5)).setDepth(depth + 3);

    this.track(this.add.text(x + panelW - 10, y + 16, `${soldier.kills} KILLS`, textStyle(10, HEX.textDim)).setOrigin(1, 0)).setDepth(depth + 2);
    if (!soldier.alive) {
      this.track(this.add.text(x + panelW - 10, y + 2, 'KIA', textStyle(10, HEX.danger)).setOrigin(1, 0)).setDepth(depth + 2);
    }
  }

  private offerRewardExposure(offer: MissionOffer): number {
    const base = OFFER_EXPOSURE[offer.type];
    return offer.path === 'enlighten' ? Math.floor(base / 2) : base;
  }

  private drawOfferBriefing(offer: MissionOffer): void {
    const copy = OFFER_TEXT[offer.type];
    const region = this.state.regions.find((candidate) => candidate.id === offer.regionId);
    const scenario = offerScenario(this.state, offer.id);
    const objects: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth>(object: T): T => {
      object.setDepth(18_000);
      objects.push(object);
      return object;
    };
    add(this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COL.overlay, 0.92)).setInteractive();
    add(this.add.rectangle(640, 372, 900, 560, COL.panel, 1)).setStrokeStyle(2, COL.gold);
    add(this.add.rectangle(590, 236, 820, 292, COL.overlay, 0.62));
    add(this.add.text(210, 96, `MISSION BRIEFING // ${copy.name}`, displayStyle(22, HEX.gold)));
    add(this.add.text(210, 150, `${(region?.name ?? offer.regionId).toUpperCase()} · OPERATING ON THE ${offer.path.toUpperCase()} PATH`, textStyle(14, HEX.dim)));
    add(this.add.text(210, 178, copy.objective, textStyle(16, HEX.text, { wordWrap: { width: 780 } })));

    const alienCount = scenario.units.filter((unit) => unit.team === 'alien').length;
    const reinf = scenario.reinforcements;
    const lines = [
      `ENEMIES: ${copy.enemies} (${alienCount} total)`,
      copy.specials ? `SPECIALS: ${copy.specials}` : '',
      reinf ? `REINFORCEMENTS: up to ${reinf.max} more, first on round ${reinf.fromRound}, then every ${reinf.every} rounds` : '',
      '',
      'AGENT COST: 1 agent this turn',
      `REWARD ON SUCCESS: +${OFFER_INFLUENCE_GAIN} ${offer.path.toUpperCase()} in this region, Resistance -5`,
      `EXPOSURE: +${this.offerRewardExposure(offer)} ${offer.path === 'enlighten' ? '(halved on the Enlighten path)' : ''}`,
      'FAILURE: -20 treasury',
    ].filter((line) => line !== '');
    add(this.add.text(210, 244, lines, textStyle(16, HEX.textDim, { lineSpacing: 8, wordWrap: { width: 800 } })));
    add(goldButton(this, 350, 600, 'BACK', () => objects.forEach((object) => object.destroy()), {
      size: 17,
      padding: { x: 12, y: 7 },
    }));
    add(goldButton(this, 780, 600, 'GO', () => {
      const next = launchOffer(this.state, offer.id);
      if (next === this.state) return;
      this.state = next;
      this.registry.set(CAMPAIGN_REGISTRY_KEY, next);
      writeCampaignSave(next);
      this.scene.start('battle', { offerId: offer.id });
    }, { size: 17, padding: { x: 12, y: 7 } }));
  }

  private drawMissionBriefing(missionId: 'area-51' | 'atlantis', missionName: string, scenario: Scenario): void {
    const copy = MISSION_TEXT[missionId]!;
    const objects: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth>(object: T): T => {
      object.setDepth(18_000);
      objects.push(object);
      return object;
    };
    add(this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COL.overlay, 0.92)).setInteractive();
    add(this.add.rectangle(640, 372, 900, 560, COL.panel, 1)).setStrokeStyle(2, COL.gold);
    if (this.textures.exists(`briefing-${missionId}`)) {
      const backdrop = add(this.add.image(640, 290, `briefing-${missionId}`));
      const scale = Math.max(880 / backdrop.width, 300 / backdrop.height);
      backdrop.setScale(scale);
      backdrop.setCrop(0, 0, 880 / scale, 300 / scale);
    }
    // Scrim: translucent dark band behind the text so the first lines read
    // against the backdrop illustration.
    add(this.add.rectangle(590, 236, 820, 292, COL.overlay, 0.62));
    add(this.add.text(210, 96, `MISSION BRIEFING // ${missionName.toUpperCase()}`, displayStyle(22, HEX.gold)));
    add(this.add.text(210, 168, copy.why, textStyle(16, HEX.text, { wordWrap: { width: 780 } })));

    const alienCount = scenario.units.filter((unit) => unit.team === 'alien').length;
    const reinf = scenario.reinforcements;
    const lines = [
      `OBJECTIVE: ${copy.objective}`,
      '',
      'WIN: Hold the objective for 2 squad turns.',
      'OR: Eliminate every enemy on the field.',
      '',
      `ENEMIES: ${alienCount}`,
      reinf ? `REINFORCEMENTS: up to ${reinf.max} more, first on round ${reinf.fromRound}, then every ${reinf.every} rounds` : '',
      reinf && copy.reinforcementsNote ? copy.reinforcementsNote : '',
      reinf ? 'Clearing every enemy on the field still wins immediately, even if more are due.' : '',
      `REWARD: ${copy.reward}`,
    ];
    add(this.add.text(210, 244, lines, textStyle(16, HEX.textDim, { lineSpacing: 8, wordWrap: { width: 800 } })));
    add(goldButton(this, 350, 600, 'BACK', () => objects.forEach((object) => object.destroy()), {
      size: 17,
      padding: { x: 12, y: 7 },
    }));
    add(goldButton(this, 780, 600, 'GO', () => {
      const next = startMission(this.state, missionId);
      if (next === this.state) return;
      this.state = next;
      this.registry.set(CAMPAIGN_REGISTRY_KEY, next);
      writeCampaignSave(next);
      this.scene.start('battle', { missionId });
    }, { size: 17, padding: { x: 12, y: 7 } }));
  }

  private drawActionPicker(region: RegionState): void {
    this.track(this.add.text(PANEL_X + 16, 246, region.name.toUpperCase(), textStyle(16, HEX.white))).setDepth(11);
    this.track(this.add.text(PANEL_X + 16, 272, `RESISTANCE ${region.resistance}  WEALTH ${region.wealth}`, textStyle(11, HEX.dim))).setDepth(11);

    const assigned = this.state.assignments[region.id];
    if (assigned) {
      this.track(this.add.text(PANEL_X + 16, 302, `ASSIGNED: ${ACTIONS[assigned]!.name}`, textStyle(12, HEX.gold))).setDepth(11);
      const clear = this.track(this.add.text(PANEL_X + 16, 330, ' CLEAR ASSIGNMENT ', textStyle(12, HEX.white, {
        backgroundColor: HEX.dangerBg,
        padding: { x: 5, y: 5 },
      }))).setDepth(11);
      clear.setInteractive({ useHandCursor: true });
      if (!pendingEvent(this.state)) {
        clear.on('pointerdown', () => {
          this.state = clearAction(this.state, region.id);
          this.redraw();
        });
      }
      return;
    }

    const legal = new Set(availableActions(this.state, region.id).map((action) => action.id));
    Object.values(ACTIONS).forEach((action, index) => {
      const y = 302 + index * 46;
      const available = legal.has(action.id);
      const label = this.track(this.add.text(PANEL_X + 16, y, `${action.name.toUpperCase()}  £${actionCost(this.state, action)}\n${this.effectLabel(action.id)}`, textStyle(11, available ? HEX.text : HEX.faint, {
        backgroundColor: available ? HEX.actionAvailable : HEX.actionDisabled,
        padding: { x: 6, y: 5 },
        fixedWidth: 248,
      }))).setDepth(11);
      label.setInteractive({ useHandCursor: available });
      this.attachHover(label, ACTION_TEXT[action.id]!);
      if (available && !pendingEvent(this.state) && isActionAvailable(this.state, region.id, action.id)) {
        label.on('pointerdown', () => {
          this.state = assignAction(this.state, region.id, action.id);
          this.redraw();
        });
      }
    });
  }

  private effectLabel(actionId: string): string {
    const action = ACTIONS[actionId]!;
    if (action.requires && !this.state.completedResearch.includes(action.requires)) {
      return `LOCKED: ${action.requires.toUpperCase()}`;
    }
    const effects = Object.entries(action.effects).map(([path, value]) => `+${value} ${path[0]!.toUpperCase()}`);
    const exposure = action.exposure === 0 ? 'NO EXP' : `${action.exposure > 0 ? '+' : ''}${action.exposure} EXP`;
    return [...effects, exposure].join('  ');
  }

  /** Green CRT-phosphor research panel with scanlines and pulsing active node. */
  private drawResearchPanel(): void {
    const panelY = 545;
    const panel = this.track(this.add.rectangle(500, panelY + 77, 960, 154, COL.crtBg, 0.98));
    panel.setStrokeStyle(1, COL.crtDim, 0.9).setDepth(30);

    this.track(this.add.text(32, panelY + 8, 'RESEARCH', textStyle(14, HEX.crt, { fontFamily: '"Cinzel", Georgia, serif' }))).setDepth(31);

    const disciplines = ['psychology', 'weaponry', 'cybernetics', 'mythology'] as const;
    disciplines.forEach((discipline, column) => {
      const x = 32 + column * 237;
      this.track(this.add.text(x, panelY + 30, discipline.toUpperCase(), textStyle(11, HEX.crtDim))).setDepth(31);
      Object.values(RESEARCH).filter((node) => node.discipline === discipline).forEach((node, index) => {
        const active = this.state.activeResearch === node.id;
        const complete = this.state.completedResearch.includes(node.id);
        const available = isResearchAvailable(this.state, node.id);
        const status = complete ? 'DONE' : active ? `${this.state.researchPoints}/${node.cost}` : available ? `${node.cost} RP` : 'LOCKED';

        const cardY = panelY + 49 + index * 34;
        const card = this.track(this.add.rectangle(x + 109, cardY + 14, 218, 30, active ? COL.crtActive : COL.crtPanel, 1));
        card.setStrokeStyle(active ? 2 : 1, active ? COL.crtGreen : COL.crtDim, 0.95).setDepth(31);

        const colour = complete ? HEX.complete : active ? HEX.crt : available ? HEX.crt : HEX.crtDim;
        const label = this.track(this.add.text(x + 8, cardY, `${node.name.toUpperCase()}\n${status}`, textStyle(11, colour))).setDepth(32);
        void label;
        card.setInteractive({ useHandCursor: available });
        this.attachHover(card, `${node.name}: ${RESEARCH_TEXT[node.id] ?? ''}`);
        if (available && !pendingEvent(this.state)) {
          card.on('pointerdown', () => {
            this.state = chooseResearch(this.state, node.id);
            this.redraw();
          });
        }
        if (active) {
          this.tweens.add({
            targets: card,
            alpha: { from: 0.55, to: 1 },
            duration: 800,
            yoyo: true,
            repeat: -1,
          });
        }
      });
    });

    this.track(crtScanlines(this, 0, panelY, 1000, 165)).setDepth(33);
  }

  private drawEventModal(): void {
    const event = pendingEvent(this.state);
    if (!event) return;
    const DEPTH = 10_000;
    this.track(this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COL.bg, 0.86)).setInteractive().setDepth(DEPTH);
    this.track(this.add.rectangle(640, 360, 820, 500, COL.panel, 1)).setStrokeStyle(2, COL.exposure).setDepth(DEPTH + 1);

    // Illustration column on the left, with an explicit 25px gutter before the text.
    const artX = 318;
    const artW = 236;
    const artH = 440;
    if (this.textures.exists(`event-${event.id}`)) {
      const image = this.track(this.add.image(artX, 360, `event-${event.id}`));
      const scale = Math.min(artW / image.width, artH / image.height);
      image.setScale(scale).setOrigin(0.5).setDepth(DEPTH + 1);
    } else {
      const glyph = this.track(this.add.graphics());
      glyph.fillStyle(COL.gold, 0.9).fillTriangle(artX, 250, artX - 95, 430, artX + 95, 430);
      glyph.setDepth(DEPTH + 1);
    }

    // Text column on the right, clear of the artwork.
    const textX = 460;
    const textW = 560;
    this.track(this.add.text(textX, 128, 'EVENT', textStyle(12, HEX.exposureText))).setDepth(DEPTH + 2);
    this.track(this.add.text(textX, 150, event.name.toUpperCase(), displayStyle(24, HEX.white))).setDepth(DEPTH + 2);
    const description = this.track(this.add.text(textX, 196, event.description, textStyle(14, HEX.gold)).setWordWrapWidth(textW)).setDepth(DEPTH + 2);
    const context = this.track(this.add.text(textX, 202 + description.height, EVENT_CONTEXT[event.id] ?? '', textStyle(13, HEX.textDim)).setWordWrapWidth(textW)).setDepth(DEPTH + 2);

    const labels = EVENT_CHOICE_TEXT[event.id] ?? [];
    const buttonsTop = 202 + description.height + context.height + 18;
    event.choices.forEach((choice, index) => {
      const available = !choice.available || choice.available(this.state);
      const button = this.track(this.add.text(textX, buttonsTop + index * 62, ` ${(labels[index] ?? choice.label).toUpperCase()} `, textStyle(14, available ? HEX.black : HEX.faint, {
        backgroundColor: available ? HEX.goldBright : HEX.panelMid,
        padding: { x: 8, y: 8 },
        wordWrap: { width: textW },
      }))).setDepth(DEPTH + 3);
      if (available) {
        button.setInteractive({ useHandCursor: true });
        button.on('pointerover', () => button.setBackgroundColor(HEX.goldHover));
        button.on('pointerout', () => button.setBackgroundColor(HEX.goldBright));
        button.on('pointerdown', () => {
          this.state = resolveEvent(this.state, index);
          this.redraw();
        });
      }
    });
  }
}

const endTurnCampaign = endTurn;
