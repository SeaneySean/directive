# 7f evidence (critic, 26–27 Sep)

All captured with Playwright at 1280x720 through the real campaign flow, no state injection,
fog on, no debug hooks. Generated mission: NEW GAME, dismiss guide, END TURN with no actions
(the pressure clash spawns), MISSIONS tab, LAUNCH, GO. That offer is Rival Cabal, North
America, seed 67079994, grid 37x37, 14 buildings (storeys 1/2/3 and facades 0/1/2 all
present), squad spawn row y=35 with lamp/tree/crate/tree cover at (17..20, 34). Click
targets were computed from the rules (scratch planner) using the fixed 64x32 tile and the
camera centred on the selected unit.

- 01 mission start: road centre dashes, kerbs on road/pavement boundaries, one-storey cream
  facade and three-storey brown facade. The spawn-row props sit behind the soldier sprites.
- 02 60 ms after clicking a reachable tile: Cole between tiles, AP still 2/2, fog unchanged.
- 03 after the walk, during which END TURN, `e` and two extra tile clicks were sent: still
  Round 1, AP 1/2, no second move, fog expanded once.
- 04 Tab selects Diaz afterwards (input resumed). 05 after WASD pan.
- 06 Reyes one move from the three-storey doorway at (21,30). 07 Reyes inside at (21,29),
  drawn above the walls, doorway readable; AP 0 so selection auto-advanced to Cole.
- 08 clicking Reyes inside the building selects her (panel and camera follow).
- 09 round 3: two-storey blue-grey buildings (facade 2) top-left and right, two rival
  operatives revealed by sight, red rings.
- 10 Cole and an enemy on the road north of a three-storey building: they are drawn over its
  roof rather than hidden behind it (readable, but reads as "on the roof"); a faded
  last-seen silhouette is visible left of them.
- 11 lamp (renderer-drawn pole and glow), tree (the Kenney prop, which reads as a cream
  wedge more than a tree) and crate; a second crate dimmed in fog.
- 12–14 story mission Area 51 Hangar through its real unlock (The Leak event on turn 3):
  renders, instant move works (Cole AP 1/2), END TURN reaches round 2. No console errors.
