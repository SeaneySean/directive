# Illuminatus

Turn-based squad tactics in the browser, in the spirit of UFO: Enemy Unknown. Built with AI for
the September Comp.

**Play:** https://seaneysean.github.io/directive/

## Controls

- Click a soldier to select it (Tab cycles).
- Click a green tile to move (one action point, up to 4 tiles).
- Hover an alien to see your hit chance; click it to shoot (one action point).
- End Turn button or **E** ends your turn. The aliens then move.
- **R** restarts after a win or loss.

## Run locally

```
bun install
bun run dev
```

Tests: `bun test`. Balance harness: `bun run playtest`.

## Credits

Built with [Phaser 3](https://phaser.io), Vite and Bun. Art (from slice 2) by
[Kenney](https://kenney.nl), CC0.
