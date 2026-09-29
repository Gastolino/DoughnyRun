# Doughny Run

A cartoon doughnut runs through doughnut-themed candy worlds and threads
sausages through its hole. Toppings unlock double jump, triple jump and a
timed hover as the sausages grow longer and closer together.

## How threading works

The doughnut stands on edge with its hole facing the direction of travel, so
a sausage lying along the running direction slides through it like a ring
onto a stick. While the doughnut overlaps a sausage, the sausage's whole
thickness must stay inside the hole's vertical span; touching the dough is a
crash. There are two kinds of sausage:

- **thread** sausages float at some height and must pass through the hole.
  Running past one without threading it counts as a miss.
- **hurdle** sausages lie on the ground and must be jumped over.

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
