// Every number that shapes how the game feels lives here, so that tuning
// never requires hunting through scene code. Units are pixels and seconds.

export const TUNING = {
  runSpeed: 320,
  gravity: 2200,
  jumpVelocity: 820,
  // Releasing jump while rising multiplies the upward speed by this factor,
  // which gives the player control over jump height.
  jumpCutFactor: 0.45,
  maxFallSpeed: 1400,
  // Near the top of a held jump, gravity weakens so that the doughnut hangs
  // in the air for a moment. That moment is when it threads raised sausages.
  apexHangSpeed: 260,
  apexHangGravityFactor: 0.45,
  coyoteTime: 0.1,
  jumpBufferTime: 0.12,
  fixedStep: 1 / 120,
} as const;

// The doughnut stands on edge with its hole facing the direction of travel.
// Seen from the side it is a narrow ring: tall, with the hole as a vertical gap.
export const DOUGHNUT = {
  outerRadius: 48,
  holeRadius: 26,
  // Horizontal half-width of the ring as drawn in three-quarter view.
  halfWidth: 16,
  // Extra pixels the hole forgives beyond its drawn size. Players judge a
  // near miss by what they see, so the hitbox is slightly kinder than the art.
  holeForgiveness: 4,
} as const;

export const VIEW = {
  width: 960,
  height: 540,
  groundY: 460,
  // Horizontal screen position the doughnut is held at while the camera follows.
  playerScreenX: 260,
} as const;
