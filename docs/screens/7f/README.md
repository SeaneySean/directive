# 7f evidence (critic, 26 Sep late)

Captured with Playwright through the real campaign flow: NEW GAME, dismiss guide, END TURN
(no actions, so the pressure clash spawns), MISSIONS tab, LAUNCH, GO. Mission: Rival Cabal,
North America, campaign turn 2, default new-game seed. No state injection, fog on.

- 01: mission start. Road centre dashes, kerbs on road/pavement boundaries, dressed cover
  (crate, lamp, tree), one-storey cream facade and three-storey brown facade.
- 02: 60 ms after clicking a reachable tile: Cole between tiles, AP still 2/2, fog unchanged
  (state held until the walk completes).
- 03: after the walk, during which END TURN, `e` and two extra tile clicks were sent: still
  Round 1, Cole AP 1/2, no second move. Fog expanded once.
- 04: Tab selects Diaz afterwards (input resumed).
- 05: after WASD pan: buildings at one and three storeys, two facades, road markings.
