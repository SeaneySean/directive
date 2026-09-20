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
import { MISSIONS, availableMissions, startMission } from '../game/strategy/missions.ts';
import { RESEARCH, chooseResearch, isResearchAvailable } from '../game/strategy/research.ts';
import {
  ACTION_TEXT,
  EVENT_CHOICE_TEXT,
  EVENT_CONTEXT,
  MISSION_TEXT,
  RESEARCH_TEXT,
  guideText,
  regionDescription,
} from '../game/strategy/text.ts';
import type { CampaignState, InfluencePath, RegionState } from '../game/strategy/types.ts';
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

  constructor() {
    super('world');
  }

  preload(): void {
    this.load.image('world-map', 'assets/art/world-map.jpg');
    for (const id of ['candidate', 'leak', 'whistleblower', 'miracle', 'summit']) {
      this.load.image(`event-${id}`, `assets/art/event-${id}.jpg`);
    }
    for (const id of ['area-51', 'atlantis']) {
      this.load.image(`briefing-${id}`, `assets/art/briefing-${id}.jpg`);
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
    const width = 118;
    const height = 54;
    const held = region.held;
    const card = this.track(this.add.rectangle(centre.x, centre.y, width, height, COL.panel, 0.88));
    card.setStrokeStyle(1, held ? COL.gold : PATH_COLOUR[path], 0.8).setDepth(3);

    this.track(this.add.text(centre.x, centre.y - 20, region.name.toUpperCase(), textStyle(11, held ? HEX.held : HEX.text, {
      fontFamily: '"Cinzel", Georgia, serif',
    }))).setOrigin(0.5).setDepth(4);

    const barX = centre.x - width / 2 + 12;
    const barW = width - 56;
    (['subvert', 'force', 'enlighten'] as const).forEach((meterPath, index) => {
      const y = centre.y - 7 + index * 11;
      const shown = visibleMeter(this.state, region.meters[meterPath]);
      const g = this.track(this.add.graphics()).setDepth(4);
      g.fillStyle(COL.empty, 1).fillRect(barX, y, barW, 6);
      g.fillStyle(PATH_COLOUR[meterPath], 1).fillRect(barX, y, (barW * shown) / 100, 6);
      this.track(this.add.text(barX - 9, y - 3, meterPath[0]!.toUpperCase(), textStyle(11, PATH_HEX[meterPath])))
        .setOrigin(1, 0).setDepth(5);
      this.track(this.add.text(barX + barW + 4, y - 3, String(Math.round(shown)), textStyle(11, HEX.text)))
        .setOrigin(0, 0).setDepth(5);
    });
  }

  private drawHud(): void {
    const graphics = this.track(drawPanel(this, PANEL_X, 0, WIDTH - PANEL_X, HEIGHT));
    graphics.setDepth(10);

    this.track(this.add.text(PANEL_X + 16, 18, 'ILLUMINATUS', displayStyle(26, HEX.gold))).setDepth(11);
    this.track(this.add.text(PANEL_X + 16, 54, 'WORLD CONTROL', textStyle(12, HEX.dim))).setDepth(11);

    const used = Object.keys(this.state.assignments).length;
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
    const x = 610;
    this.track(drawPanel(this, 610, 36, 350, 76, { alpha: 0.97 })).setDepth(20);
    this.track(this.add.text(x + 8, 42, 'MISSIONS', textStyle(12, HEX.gold))).setDepth(21);
    const available = new Set(availableMissions(this.state).map((mission) => mission.id));
    const listed = MISSIONS.filter((mission) =>
      available.has(mission.id) || this.state.missions[mission.id]?.status === 'completed',
    );
    if (!listed.length) {
      this.track(this.add.text(x + 8, 64, 'NO MISSIONS AVAILABLE', textStyle(11, HEX.faint))).setDepth(21);
      return;
    }
    listed.forEach((mission, index) => {
      const y = 62 + index * 24;
      const complete = this.state.missions[mission.id]?.status === 'completed';
      this.track(this.add.text(x + 8, y, `${mission.name.toUpperCase()}  ${complete ? 'COMPLETE' : 'AVAILABLE'}`,
        textStyle(10, complete ? HEX.complete : HEX.text))).setDepth(21);
      if (!complete) {
        const launch = this.track(goldButton(this, x + 272, y - 5, 'LAUNCH', () => {
          this.drawMissionBriefing(
            mission.id,
            mission.name,
            mission.scenario.units.filter((unit) => unit.team === 'alien').length,
          );
        }, { size: 10, padding: { x: 5, y: 4 } }));
        launch.setDepth(21);
        if (pendingEvent(this.state)) {
          launch.disableInteractive();
          launch.setAlpha(0.5);
        }
      }
    });
  }

  private drawMissionBriefing(missionId: 'area-51' | 'atlantis', missionName: string, enemyCount: number): void {
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
    add(this.add.text(210, 96, `MISSION BRIEFING // ${missionName.toUpperCase()}`, displayStyle(22, HEX.gold)));
    add(this.add.text(210, 168, copy.why, textStyle(16, HEX.text, { wordWrap: { width: 780 } })));
    add(this.add.text(210, 244, [
      `OBJECTIVE: ${copy.objective}`,
      '',
      'WIN: Hold the objective for 2 squad turns.',
      'OR: Eliminate every enemy.',
      '',
      `ENEMIES: ${enemyCount}`,
      `REWARD: ${copy.reward}`,
    ], textStyle(16, HEX.textDim, { lineSpacing: 8 })));
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
        const label = this.track(this.add.text(x + 8, cardY, `${node.name.toUpperCase()}\n${status}`, textStyle(10, colour))).setDepth(32);
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

    // Artwork on the left (fallback: gold triangle glyph).
    if (this.textures.exists(`event-${event.id}`)) {
      const image = this.track(this.add.image(320, 360, `event-${event.id}`));
      const scale = Math.min(360 / image.width, 460 / image.height);
      image.setScale(scale).setOrigin(0.5).setDepth(DEPTH + 1);
    } else {
      const glyph = this.track(this.add.graphics());
      glyph.fillStyle(COL.gold, 0.9).fillTriangle(320, 300, 220, 430, 420, 430);
      glyph.setDepth(DEPTH + 1);
    }

    const textX = 470;
    this.track(this.add.text(textX, 128, 'EVENT', textStyle(12, HEX.exposureText))).setDepth(DEPTH + 2);
    this.track(this.add.text(textX, 152, event.name.toUpperCase(), displayStyle(24, HEX.white))).setDepth(DEPTH + 2);
    this.track(this.add.text(textX, 196, event.description, textStyle(14, HEX.gold)).setWordWrapWidth(340)).setDepth(DEPTH + 2);
    this.track(this.add.text(textX, 226, EVENT_CONTEXT[event.id] ?? '', textStyle(13, HEX.textDim)).setWordWrapWidth(340)).setDepth(DEPTH + 2);
    const labels = EVENT_CHOICE_TEXT[event.id] ?? [];
    event.choices.forEach((choice, index) => {
      const available = !choice.available || choice.available(this.state);
      const button = this.track(this.add.text(textX, 300 + index * 58, ` ${(labels[index] ?? choice.label).toUpperCase()} `, textStyle(14, available ? HEX.black : HEX.faint, {
        backgroundColor: available ? HEX.goldBright : HEX.panelMid,
        padding: { x: 8, y: 8 },
        wordWrap: { width: 330 },
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
