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

Every sausage must go through the hole. A doughnut that passes one without
threading it, over it or under it, is arrested: an officer's arm in a navy
sleeve with gold buttons rises from below and carries it away.

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
gears, from 320 to 520 pixels per second; a faster doughnut crosses voids
more easily but meets each sausage sooner. All of these numbers live in
`src/logic/tuning.ts`.

Holding the button makes a higher jump, and a jump held all the way up hangs
for a moment at the top. Letting go while the doughnut rises cuts the jump
short; letting go after that changes nothing.

## Ramps, speed pads and hills

A ramp is a kicker: its glazed surface curves up to a lip and drops straight
back down. Rolling off the lip keeps the lip's upward speed, and a jump taken
anywhere on a ramp adds that speed to the jump, so the doughnut flies far
higher than a jump from flat ground. A ramp is solid all the way down, so one
placed at the edge of a void launches the doughnut across it.

A speed pad sends a rolling doughnut into boost: 700 pixels per second,
faster than the top gear, for 1400 pixels past the pad. Jumping over the pad
misses the boost. Since the boost's speed does not depend on the gear, a void
that only a boosted jump can clear has one shape of jump across it, and a
sausage placed on that jump's path cannot be avoided.

Hills make the ground roll up and down in even waves. The doughnut hugs the
surface over every crest, and a jump taken on an upslope carries the slope's
upward speed, so it goes higher than one from a valley. Hills lie on the
ground, so a gap cut through them leaves a cliff as tall as the hill at that
point: jumping from a crest gains height, and landing past a gap may mean
clearing a cliff first.

## Toppings and levels

Each level names the topping the doughnut wears. Finishing a level opens the
next one, and a new topping comes with the level that first needs it.

| Level | Name            | Topping                                      | New            |
|-------|-----------------|----------------------------------------------|----------------|
| 1-1   | Sprinkle Meadow | Pink icing: one jump                         | Voids          |
| 1-2   | Sugar Rush      | Pink icing: one jump                         | Ramps and pads |
| 1-3   | Jelly Hills     | Pink icing: one jump                         | Rolling hills  |
| 1-4   | Glaze Heights   | Chocolate glaze: press again in the air to double jump | Double jump |
| 1-5   | Chomp Chase     | Chocolate glaze                              | The boss       |

In top gear the doughnut wears its sunglasses, and they absorb one crash
into a sausage: the doughnut smashes through it and drops to first gear.
A smashed sausage counts as dealt with. Falling into a void, hitting a cliff
or skipping a sausage still ends the run.

## The boss

Chomp Chase ends World 1. Wind-up chattering dentures in a police hat run
after the doughnut, faster than it rolls in any gear below the top, and a
meter at the top of the screen shows how close they are. Each grind's grade
moves them: a perfect shoves them back 60 px, a great lets them gain 180, and
a good or a sloppy grind lets them lunge straight in for the chomp. They never
fall further behind than they started. The level test proves the level can
be cleared this way, with every sausage threaded.

Threading a second sausage before touching the ground is an air combo: that
grind's points are multiplied by the number of grinds in the flight.

Levels are JSON files in `src/levels`, listed in order in
`src/levels/index.ts`. The format is described at the top of
`src/levels/format.ts`: a name, a length, a topping and a list of elements,
each with a `type`: `gap`, `sausage`, `ramp`, `boost` or `hills`. The tests check
every listed level with the solver: it must be finishable with its topping,
which means threading every sausage, and a level with a new topping must be
impossible without it. Each level has its own test file in `tests/levels`.

## Level editor

Open it from the menu, or add `#editor` to the address. Tools:

- **Select** (V): drag sausages, gaps, ramps, pads or the finish flag; drag an end to
  resize; drag empty sky to scroll. Arrow keys nudge the selection by 10 px
  (Shift for 1 px); Ctrl+D duplicates; Delete removes.
- **Sausage** (S): click to place, dragging sideways to set the length.
- **Gap** (G): drag along the ground to cut a gap.
- **Ramp** (R): drag along the ground to place a ramp, or click for a
  300 by 80 one. Select it and drag the handle on its lip to set its height.
- **Speed pad** (B): drag along the ground to lay a pad, or click for a
  160 px one.
- **Denture chase** (bottom bar): turns the level into a boss chase and
  sets how fast the dentures run at its start and its end.
- **Hills** (W): drag along the ground to raise rolling hills, or click for
  three waves over 1200 px. Drag the handle on the first crest to set their
  height; the bottom bar sets the number of waves.

Positions snap to 10 px (hold Shift for 1 px), and the bottom bar takes exact
numbers. Dashed guides show how high the hole reaches when rolling, at the
top of one jump and at the top of a double jump. **Check** asks the solver
whether the level can be finished, threading every sausage, and marks where
it got stuck with a red line. **Play** and
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
R restarts, H shows the hitboxes, M turns sound off and on, and Esc returns
to the menu. Add `#demo` to
the URL to watch the level solver play the first level, or `#demo-1-2` for another.

On a phone the whole screen is the jump button, including the bars beside
the game. The game waits for a first tap, pauses when the phone locks or the
page is hidden, and asks to be turned sideways in portrait.

## Sound

Every sound is synthesised in the browser with the Web Audio API
(`src/sound.ts`), so there are no audio files. It starts on the first press,
since browsers allow sound only after one. Grinds sizzle while a sausage
slides through, and grade chimes climb the scale as the chain grows. The
arrest has a siren, the dentures clack faster as they close in, and a
finish plays a fanfare. The button at the bottom right, or M, turns sound
off and on, and the game remembers the choice.

## Look and feel

Big titles, single words and scores use Bubble Toy Solid Bold by ana & yvy
(anayvy.shop), under a licence the project owner bought. It is bundled in
`src/assets/fonts` and trimmed to the characters the game uses. Sentences use Comic Neue Bold (from `@fontsource/comic-neue`,
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

- `src/logic/` holds the pure simulation (`runner.ts`), the ground's shape
  with its ramps and hills (`terrain.ts`), the threading test (`threading.ts`), the
  level solver (`solver.ts`) and every tuning number (`tuning.ts`). None of it depends on Phaser, so the tests and the solver
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
