# Doughny Run

A cartoon doughnut runs through doughnut-themed candy worlds and threads
sausages through its hole. Toppings unlock double jump, triple jump and a
timed hover as the sausages grow longer and closer together.

## How threading works

The doughnut stands on edge with its hole facing the direction of travel, so
a sausage lying along the running direction slides through it like a ring
onto a stick. While the doughnut overlaps a sausage, the sausage's whole
thickness must stay inside the hole's vertical span; touching the dough is a
crash.

Raised sausages hang over voids. Running underneath drops the doughnut into
the void, and the sausage hangs too high to jump over, so the only way across
is through the hole. The level tests prove this for every such sausage.
Sausages over solid ground are optional: skipping one costs the chain and a
gear.

## Grinding, score and speed

Each thread is a grind, graded by how close to the centre of the hole the
sausage stayed on average:

| Grade   | Mean offset from centre | Points multiplier | Gears |
|---------|-------------------------|-------------------|-------|
| Perfect | up to 15% of the slack  | x3                | +2    |
| Great   | up to 35%               | x2                | +1    |
| Good    | up to 60%               | x1.5              | 0     |
| Sloppy  | more                    | x1                | -1    |

Points are the sausage's length times the multiplier, and every unbroken
Good-or-better grind adds 0.5 to a chain multiplier. The doughnut runs in six
gears, from 320 to 480 pixels per second; a faster doughnut crosses voids
more easily but meets each sausage sooner. All of these numbers live in
`src/logic/tuning.ts`.

## Toppings and levels

Each level names the topping the doughnut wears. Finishing a level opens the
next one, and a new topping comes with the level that first needs it.

| Topping         | Power                                  | First level       |
|-----------------|----------------------------------------|-------------------|
| Pink icing      | One jump                               | 1-1 Sprinkle Meadow |
| Chocolate glaze | Double jump: press again in the air    | 1-2 Glaze Heights |

In top gear the doughnut wears its sunglasses, and they absorb one crash
into a sausage: the doughnut smashes through it and drops to first gear.
Falling into a void or hitting a cliff still ends the run. The level tests prove
sausages cannot be skipped without spending that free crash.

Threading a second sausage before touching the ground is an air combo: that
grind's points are multiplied by the number of grinds in the flight.

Levels are JSON files in `src/levels`, listed in order in
`src/levels/index.ts`. The format is described at the top of
`src/levels/format.ts`: a name, a length, a topping and a list of elements,
each with a `type` (`gap` or `sausage` for now; ramps and speed boosts will be
new types). The tests check every listed level with the solver: it must be
finishable with its topping, every sausage must be threadable in one run, a
level with a new topping must be impossible without it, and on a one-jump
level no sausage over a void may be avoidable.

## Level editor

Open it from the menu, or add `#editor` to the address. Tools:

- **Select** (V): drag sausages, gaps or the finish flag; drag an end to
  resize; drag empty sky to scroll. Arrow keys nudge the selection by 10 px
  (Shift for 1 px); Ctrl+D duplicates; Delete removes.
- **Sausage** (S): click to place, dragging sideways to set the length.
- **Gap** (G): drag along the ground to cut a gap.

Positions snap to 10 px (hold Shift for 1 px), and the bottom bar takes exact
numbers. Dashed guides show how high the hole reaches when rolling, at the
top of one jump and at the top of a double jump. **Check** asks the solver
whether the level can be finished and whether every sausage can be threaded
in one run, and marks where it got stuck with a red line. **Play** and
**Watch solver** test the level, and **Save** adds it to Your levels in the
menu. The editor keeps a draft between visits and has undo (Ctrl+Z) and redo.

**Export** shows the level as JSON: save it as a file in `src/levels` and add
it to `src/levels/index.ts` to put it in the game. **Import** loads JSON
pasted from an export.

## Running it

```sh
npm install
npm run dev        # play at http://localhost:5173
npm test           # unit tests, including a solver that proves each level beatable
npm run build      # production build in dist/
```

Controls: Space, Up, W, click or tap to jump; hold for a higher jump.
R restarts, H shows the hitboxes and Esc returns to the menu. Add `#demo` to
the URL to watch the level solver play the first level.

On a phone the whole screen is the jump button, including the bars beside
the game. The game waits for a first tap, pauses when the phone locks or the
page is hidden, and asks to be turned sideways in portrait.

## Look and feel

Big titles, single words and scores use Bubble Toy Solid Bold by ana & yvy
(anayvy.shop), bundled in `src/assets/fonts` and trimmed to the characters
the game uses. Sentences use Comic Neue Bold (from `@fontsource/comic-neue`,
under the SIL Open Font License), because Bubble Toy is hard to read in a
sentence.
Banners and call-outs use rainbow letters with a rainbow outline and land
with a splash of sugar sprinkles. In top gear the doughnut puts on
rainbow-shimmer sunglasses.

## Single-page build

`npm run build:artifact` writes `dist-artifact/doughny-run.html`: one page
with the game inline and Phaser loaded from jsdelivr, pinned by an integrity
hash. This is the page published on claude.ai for playing on a phone.

## Layout

- `src/logic/` holds the pure simulation (`runner.ts`), the threading test
  (`threading.ts`), the level solver (`solver.ts`) and every tuning number
  (`tuning.ts`). None of it depends on Phaser, so the tests and the solver
  run the same code the player does.
- `src/scenes/` draws that simulation with Phaser 3 and turns input into it.
- `src/levels/` holds the level files and their format.
- `src/scenes/` holds the menu, the level and the editor; `src/progress.ts`
  keeps finished levels, best scores, saved levels and the editor draft in
  the browser's storage.

## Deployment

Every push to `main` runs the tests, builds the game and publishes it to
GitHub Pages. In the repository settings, under Pages, set the source to
"GitHub Actions" once.
