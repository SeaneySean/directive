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
import { RESEARCH, chooseResearch, isResearchAvailable } from '../game/strategy/research.ts';
import type { CampaignState, InfluencePath, RegionState } from '../game/strategy/types.ts';

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
  { id: 'russia', x: 630, y: 105, width: 230, height: 110 },
  { id: 'asia', x: 790, y: 235, width: 180, height: 140 },
  { id: 'oceania', x: 800, y: 455, width: 165, height: 105 },
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

  constructor() {
    super('world');
  }

  create(): void {
    this.state = createCampaign(Date.now() | 0);
    this.cameras.main.setBackgroundColor(COLOURS.background);
    this.redraw();
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
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
    for (const object of this.objects) object.destroy();
    this.objects = [];

    const graphics = this.track(this.add.graphics());
    graphics.fillStyle(COLOURS.panel, 1).fillRect(PANEL_X, 0, WIDTH - PANEL_X, HEIGHT);
    graphics.lineStyle(1, COLOURS.outline, 1).lineBetween(PANEL_X, 0, PANEL_X, HEIGHT);

    this.text(34, 24, 'ILLUMINATUS // WORLD CONTROL', 24, '#d4af37');
    this.text(35, 56, 'ASSIGN OPERATIVES. SHAPE THE WORLD. STAY HIDDEN.', 12, '#718096');

    for (const box of MAP_BOXES) {
      const region = this.state.regions.find((candidate) => candidate.id === box.id)!;
      this.drawRegion(graphics, box, region);
    }

    this.drawPanel(graphics);
    if (this.state.outcome === 'playing') {
      this.drawResearchPanel();
      if (pendingEvent(this.state)) this.drawEventModal();
    } else {
      this.drawEnding(graphics);
    }
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
    if (this.state.outcome === 'playing' && !pendingEvent(this.state)) {
      hitArea.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
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
      if (available && !pendingEvent(this.state) && isActionAvailable(this.state, region.id, action.id)) {
        label.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
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
        if (available && !pendingEvent(this.state)) {
          card.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
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
    this.track(this.add.rectangle(640, 360, 610, 350, COLOURS.panel, 1))
      .setStrokeStyle(2, COLOURS.exposure);
    this.text(375, 220, 'EVENT', 12, '#c98cf2');
    this.text(375, 250, event.name.toUpperCase(), 26, '#ffffff');
    this.text(375, 300, event.description, 14, '#aeb9c7').setWordWrapWidth(530);
    event.choices.forEach((choice, index) => {
      const available = !choice.available || choice.available(this.state);
      const button = this.track(this.add.text(375, 375 + index * 65, ` ${choice.label.toUpperCase()} `, {
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

  private drawEnding(graphics: Phaser.GameObjects.Graphics): void {
    graphics.fillStyle(0x05070a, 0.94).fillRect(0, 0, WIDTH, HEIGHT);
    const won = this.state.outcome === 'won';
    this.text(0, 250, won ? 'THE WORLD IS YOURS' : 'THE CONSPIRACY IS EXPOSED', 38, won ? '#d4af37' : '#d15b64')
      .setOrigin(0.5)
      .setX(WIDTH / 2);
    const newGame = this.track(this.add.text(WIDTH / 2, 360, ' NEW GAME ', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#0d1117',
      backgroundColor: '#d4af37',
      padding: { x: 14, y: 9 },
    }).setOrigin(0.5));
    newGame.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.restart());
  }
}

const endTurnCampaign = endTurn;
