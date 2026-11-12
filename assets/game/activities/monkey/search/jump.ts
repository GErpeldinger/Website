// The speed of the jump that takes him up to a cigarette `above` px over his head, `dx` px to
// one side, in pixels per step: high enough to reach it (6 to 14 up), and a tenth of the distance
// across. The prototype's 0.56 is twice the step's gravity (0.28); his air friction (0.02 per
// step) takes a fifth of the height, so the factor is 0.72, measured in the world.
export const jumpFor = (
    above: number,
    dx: number,
): { vx: number; vy: number } => ({
    vx: Math.max(-4, Math.min(4, dx * 0.1)),
    vy: -Math.min(14, Math.max(6, Math.sqrt(0.72 * (above + 30)))),
});
