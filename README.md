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

## Running it

```sh
npm install
npm run dev        # play at http://localhost:5173
npm test           # unit tests, including a solver that proves each level beatable
npm run build      # production build in dist/
```

Controls: Space, Up, W, click or tap to jump; hold for a higher jump.
R restarts, and H shows the hitboxes. Add `?demo` to the URL to watch the
level solver play the level.

## Layout

- `src/logic/` holds the pure simulation (`runner.ts`), the threading test
  (`threading.ts`), the level solver (`solver.ts`) and every tuning number
  (`tuning.ts`). None of it depends on Phaser, so the tests and the solver
  run the same code the player does.
- `src/scenes/` draws that simulation with Phaser 3 and turns input into it.
- `src/levels/` holds level data.

## Deployment

Every push to `main` runs the tests, builds the game and publishes it to
GitHub Pages. In the repository settings, under Pages, set the source to
"GitHub Actions" once.
