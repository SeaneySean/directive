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

const WIDTH = 1280;
const HEIGHT = 720;
const PANEL_X = 1000;

const COLOURS = {
  background: 0x0d1117,
  panel: 0x151b24,
  region: 0x232d3a,
  regionSelected: 0x34445a,
  held: 0x96742d,
  outline: 0x536277,
  subvert: 0xd4af37,
  force: 0xc94b4b,
  enlighten: 0x45c9d1,
  empty: 0x090c10,
  exposure: 0xa35bd6,
};

interface MapBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const MAP_BOXES: readonly MapBox[] = [
  { id: 'north-america', x: 90, y: 130, width: 190, height: 115 },
  { id: 'south-america', x: 210, y: 330, width: 105, height: 185 },
  { id: 'europe', x: 445, y: 135, width: 145, height: 95 },
  { id: 'middle-east', x: 620, y: 255, width: 145, height: 90 },
  { id: 'africa', x: 450, y: 300, width: 150, height: 175 },
  { id: 'russia', x: 630, y: 114, width: 230, height: 101 },
  { id: 'asia', x: 790, y: 235, width: 180, height: 140 },
  { id: 'oceania', x: 800, y: 430, width: 165, height: 105 },
] as const;

const PATH_COLOUR: Record<InfluencePath, number> = {
  subvert: COLOURS.subvert,
  force: COLOURS.force,
  enlighten: COLOURS.enlighten,
};

export class WorldScene extends Phaser.Scene {
  private state!: CampaignState;
  private selectedRegionId: string | null = null;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private hoverText!: Phaser.GameObjects.Text;
  private dismissedGuideTurns = new Set<number>();

  constructor() {
    super('world');
  }

  create(): void {
    this.state = (this.registry.get(CAMPAIGN_REGISTRY_KEY) as CampaignState | undefined)
      ?? createCampaign(Date.now() | 0);
    this.registry.set(CAMPAIGN_REGISTRY_KEY, this.state);
    writeCampaignSave(this.state);
    this.cameras.main.setBackgroundColor(COLOURS.background);
    this.redraw();
  }

  private track<T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth>(object: T): T {
    this.objects.push(object);
    return object;
  }

  private text(
    x: number,
    y: number,
    value: string | string[],
    size = 14,
    colour = '#d9e1ea',
  ): Phaser.GameObjects.Text {
    return this.track(this.add.text(x, y, value, {
      fontFamily: 'monospace',
      fontSize: `${size}px`,
      color: colour,
    }));
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

    const graphics = this.track(this.add.graphics());
    graphics.fillStyle(COLOURS.panel, 1).fillRect(PANEL_X, 0, WIDTH - PANEL_X, HEIGHT);
    graphics.lineStyle(1, COLOURS.outline, 1).lineBetween(PANEL_X, 0, PANEL_X, HEIGHT);

    this.text(34, 42, 'ILLUMINATUS // WORLD CONTROL', 24, '#d4af37');
    this.text(35, 74, 'ASSIGN OPERATIVES. SHAPE THE WORLD. STAY HIDDEN.', 12, '#718096');
    this.hoverText = this.track(this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
      backgroundColor: '#05070aee', padding: { x: 7, y: 5 },
      wordWrap: { width: 360 },
    })).setDepth(15_000).setVisible(false);

    for (const box of MAP_BOXES) {
      const region = this.state.regions.find((candidate) => candidate.id === box.id)!;
      this.drawRegion(graphics, box, region);
    }

    this.drawPanel(graphics);
    this.drawMissionsPanel();
    this.drawResearchPanel();
    this.drawHelpButton();
    this.drawGuide();
    if (pendingEvent(this.state)) this.drawEventModal();
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
    const help = this.track(this.add.text(566, 40, ' ? ', {
      fontFamily: 'monospace', fontSize: '18px', color: '#0d1117', backgroundColor: '#d4af37',
      padding: { x: 5, y: 3 },
    }));
    help.setInteractive({ useHandCursor: true }).on('pointerdown', () => showHelpOverlay(this));
  }

  private drawGuide(): void {
    const copy = guideText(this.state.turn);
    if (!copy || this.dismissedGuideTurns.has(this.state.turn)) return;
    const strip = this.track(this.add.rectangle(WIDTH / 2, 16, WIDTH, 32, 0x2b2413, 1))
      .setStrokeStyle(1, COLOURS.subvert).setDepth(2000);
    const label = this.text(26, 6, copy, 14, '#fff1bd').setDepth(2001);
    const close = this.track(this.add.text(1230, 4, ' X ', {
      fontFamily: 'monospace', fontSize: '14px', color: '#0d1117', backgroundColor: '#d4af37',
      padding: { x: 4, y: 2 },
    })).setDepth(2001);
    close.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.dismissedGuideTurns.add(this.state.turn);
      strip.destroy();
      label.destroy();
      close.destroy();
    });
  }

  private drawRegion(graphics: Phaser.GameObjects.Graphics, box: MapBox, region: RegionState): void {
    const selected = region.id === this.selectedRegionId;
    graphics.fillStyle(region.held ? COLOURS.held : selected ? COLOURS.regionSelected : COLOURS.region, 1);
    graphics.fillRect(box.x, box.y, box.width, box.height);
    graphics.lineStyle(selected ? 3 : 1, selected ? COLOURS.subvert : COLOURS.outline, 1);
    graphics.strokeRect(box.x, box.y, box.width, box.height);

    const hitArea = this.track(this.add.rectangle(
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.width,
      box.height,
      0xffffff,
      0.001,
    ));
    hitArea.setInteractive({ useHandCursor: true });
    this.attachHover(hitArea, `${region.name}: ${regionDescription(region)}`);
    if (this.state.outcome === 'playing' && !pendingEvent(this.state)) {
      hitArea.on('pointerdown', () => {
        this.selectedRegionId = region.id;
        this.redraw();
      });
    }

    this.text(box.x + 9, box.y + 8, region.name.toUpperCase(), 13, region.held ? '#fff1bd' : '#e4e9ef');
    if (region.held) this.text(box.x + box.width - 47, box.y + 8, 'HELD', 11, '#fff1bd');
    const assigned = this.state.assignments[region.id];
    if (assigned) this.text(box.x + 9, box.y + 27, `> ${ACTIONS[assigned]!.name}`, 10, '#d4af37');

    const barX = box.x + 9;
    const barWidth = box.width - 18;
    const barStart = box.y + box.height - 42;
    (['subvert', 'force', 'enlighten'] as const).forEach((path, index) => {
      const y = barStart + index * 12;
      const shown = visibleMeter(this.state, region.meters[path]);
      graphics.fillStyle(COLOURS.empty, 1).fillRect(barX, y, barWidth, 7);
      graphics.fillStyle(PATH_COLOUR[path], 1).fillRect(barX, y, barWidth * shown / 100, 7);
      this.text(barX + 2, y - 2, `${path[0]!.toUpperCase()} ${Math.round(shown)}`, 8, '#ffffff');
    });
  }

  private drawPanel(graphics: Phaser.GameObjects.Graphics): void {
    const used = Object.keys(this.state.assignments).length;
    this.text(PANEL_X + 20, 22, `TURN ${this.state.turn}`, 22, '#d4af37');
    this.text(PANEL_X + 20, 58, [
      `TREASURY  ${this.state.treasury}`,
      `AGENTS    ${used}/${this.state.agents}`,
      `REGIONS   ${heldRegions(this.state).length}/5`,
    ], 15);

    this.text(PANEL_X + 20, 132, `EXPOSURE ${Math.round(this.state.exposure)}/100`, 13, '#c98cf2');
    graphics.fillStyle(COLOURS.empty, 1).fillRect(PANEL_X + 20, 155, 240, 14);
    graphics.fillStyle(COLOURS.exposure, 1).fillRect(PANEL_X + 20, 155, 240 * this.state.exposure / 100, 14);

    const region = this.state.regions.find((candidate) => candidate.id === this.selectedRegionId);
    if (region) this.drawActionPicker(region);
    else this.text(PANEL_X + 20, 210, 'SELECT A REGION', 14, '#718096');

    const endTurn = this.track(this.add.text(PANEL_X + 20, 655, '      END TURN      ', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#0d1117',
      backgroundColor: '#d4af37',
      padding: { x: 8, y: 8 },
    }));
    if (this.state.outcome === 'playing' && !pendingEvent(this.state)) {
      endTurn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.state = endTurnCampaign(this.state);
        this.redraw();
      });
    }
  }

  private drawMissionsPanel(): void {
    const x = 610;
    this.track(this.add.rectangle(785, 74, 350, 74, COLOURS.panel, 0.97))
      .setStrokeStyle(1, COLOURS.outline);
    this.text(x + 8, 42, 'MISSIONS', 12, '#d4af37');
    const available = new Set(availableMissions(this.state).map((mission) => mission.id));
    const listed = MISSIONS.filter((mission) =>
      available.has(mission.id) || this.state.missions[mission.id]?.status === 'completed',
    );
    if (!listed.length) {
      this.text(x + 8, 64, 'NO MISSIONS AVAILABLE', 11, '#596575');
      return;
    }
    listed.forEach((mission, index) => {
      const y = 62 + index * 24;
      const complete = this.state.missions[mission.id]?.status === 'completed';
      this.text(
        x + 8,
        y,
        `${mission.name.toUpperCase()}  ${complete ? 'COMPLETE' : 'AVAILABLE'}`,
        10,
        complete ? '#75d69c' : '#e9eef5',
      );
      if (!complete) {
        const launch = this.track(this.add.text(x + 272, y - 5, ' LAUNCH ', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#0d1117',
          backgroundColor: '#d4af37',
          padding: { x: 4, y: 4 },
        }));
        if (!pendingEvent(this.state)) {
          launch.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.drawMissionBriefing(
              mission.id,
              mission.name,
              mission.scenario.units.filter((unit) => unit.team === 'alien').length,
            );
          });
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
    add(this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x030507, 0.9)).setInteractive();
    add(this.add.rectangle(640, 360, 760, 520, COLOURS.panel, 1)).setStrokeStyle(2, COLOURS.subvert);
    add(this.add.text(310, 125, `MISSION BRIEFING // ${missionName.toUpperCase()}`, {
      fontFamily: 'monospace', fontSize: '23px', color: '#d4af37',
    }));
    add(this.add.text(310, 180, copy.why, {
      fontFamily: 'monospace', fontSize: '16px', color: '#e7edf5', wordWrap: { width: 660 },
    }));
    add(this.add.text(310, 270, [
      `OBJECTIVE: ${copy.objective}`,
      '',
      'WIN: Hold the objective for 2 squad turns.',
      'OR: Eliminate every enemy.',
      '',
      `ENEMIES: ${enemyCount}`,
      `REWARD: ${copy.reward}`,
    ], {
      fontFamily: 'monospace', fontSize: '16px', color: '#aeb9c7', lineSpacing: 8,
    }));
    const back = add(this.add.text(385, 540, ' BACK ', {
      fontFamily: 'monospace', fontSize: '18px', color: '#0d1117', backgroundColor: '#8795a8',
      padding: { x: 10, y: 7 },
    })).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => objects.forEach((object) => object.destroy()));
    const go = add(this.add.text(785, 540, ' GO ', {
      fontFamily: 'monospace', fontSize: '18px', color: '#0d1117', backgroundColor: '#d4af37',
      padding: { x: 10, y: 7 },
    })).setInteractive({ useHandCursor: true });
    go.on('pointerdown', () => {
      const next = startMission(this.state, missionId);
      if (next === this.state) return;
      this.state = next;
      this.registry.set(CAMPAIGN_REGISTRY_KEY, next);
      writeCampaignSave(next);
      this.scene.start('battle', { missionId });
    });
  }

  private drawActionPicker(region: RegionState): void {
    this.text(PANEL_X + 20, 198, region.name.toUpperCase(), 16, '#ffffff');
    this.text(PANEL_X + 20, 222, `RESISTANCE ${region.resistance}  WEALTH ${region.wealth}`, 11, '#8795a8');

    const assigned = this.state.assignments[region.id];
    if (assigned) {
      this.text(PANEL_X + 20, 258, `ASSIGNED: ${ACTIONS[assigned]!.name}`, 12, '#d4af37');
      const clear = this.track(this.add.text(PANEL_X + 20, 288, ' CLEAR ASSIGNMENT ', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#5b2730',
        padding: { x: 5, y: 5 },
      }));
      if (!pendingEvent(this.state)) {
        clear.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.state = clearAction(this.state, region.id);
          this.redraw();
        });
      }
      return;
    }

    const legal = new Set(availableActions(this.state, region.id).map((action) => action.id));
    Object.values(ACTIONS).forEach((action, index) => {
      const y = 252 + index * 52;
      const available = legal.has(action.id);
      const label = this.track(this.add.text(PANEL_X + 20, y, `${action.name.toUpperCase()}  £${actionCost(this.state, action)}\n${this.effectLabel(action.id)}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: available ? '#e9eef5' : '#596575',
        backgroundColor: available ? '#263241' : '#171d25',
        padding: { x: 6, y: 5 },
        fixedWidth: 240,
      }));
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

  private drawResearchPanel(): void {
    const panelY = 545;
    this.track(this.add.rectangle(500, panelY + 82.5, 960, 165, COLOURS.panel, 0.97))
      .setStrokeStyle(1, COLOURS.outline);
    this.text(32, panelY + 8, 'RESEARCH', 14, '#c98cf2');

    const disciplines = ['psychology', 'weaponry', 'cybernetics', 'mythology'] as const;
    disciplines.forEach((discipline, column) => {
      const x = 32 + column * 237;
      this.text(x, panelY + 31, discipline.toUpperCase(), 11, '#8795a8');
      Object.values(RESEARCH).filter((node) => node.discipline === discipline).forEach((node, index) => {
        const active = this.state.activeResearch === node.id;
        const complete = this.state.completedResearch.includes(node.id);
        const available = isResearchAvailable(this.state, node.id);
        const status = complete ? 'DONE' : active ? `${this.state.researchPoints}/${node.cost}` : available ? `${node.cost} RP` : 'LOCKED';
        const card = this.track(this.add.text(x, panelY + 51 + index * 34, `${node.name.toUpperCase()}\n${status}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: complete ? '#75d69c' : active ? '#ffffff' : available ? '#e9eef5' : '#596575',
          backgroundColor: active ? '#68418a' : '#202936',
          padding: { x: 5, y: 3 },
          fixedWidth: 218,
        }));
        card.setInteractive({ useHandCursor: available });
        this.attachHover(card, `${node.name}: ${RESEARCH_TEXT[node.id] ?? ''}`);
        if (available && !pendingEvent(this.state)) {
          card.on('pointerdown', () => {
            this.state = chooseResearch(this.state, node.id);
            this.redraw();
          });
        }
      });
    });
  }

  private drawEventModal(): void {
    const event = pendingEvent(this.state);
    if (!event) return;
    this.track(this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x05070a, 0.82))
      .setInteractive();
    this.track(this.add.rectangle(640, 360, 680, 440, COLOURS.panel, 1))
      .setStrokeStyle(2, COLOURS.exposure);
    this.text(340, 165, 'EVENT', 12, '#c98cf2');
    this.text(340, 190, event.name.toUpperCase(), 26, '#ffffff');
    this.text(340, 236, event.description, 14, '#d4af37').setWordWrapWidth(600);
    this.text(340, 268, EVENT_CONTEXT[event.id] ?? '', 14, '#aeb9c7').setWordWrapWidth(600);
    const labels = EVENT_CHOICE_TEXT[event.id] ?? [];
    event.choices.forEach((choice, index) => {
      const available = !choice.available || choice.available(this.state);
      const button = this.track(this.add.text(340, 400 + index * 62, ` ${(labels[index] ?? choice.label).toUpperCase()} `, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: available ? '#0d1117' : '#596575',
        backgroundColor: available ? '#d4af37' : '#202936',
        padding: { x: 8, y: 8 },
      }));
      if (available) {
        button.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.state = resolveEvent(this.state, index);
          this.redraw();
        });
      }
    });
  }

}

const endTurnCampaign = endTurn;
