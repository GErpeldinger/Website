import { Body } from 'matter-js';
import type { Point } from '../events/game_events';

export const capSpeed = ({ x, y }: Point, max: number): Point => {
    const scale = Math.min(1, max / Math.hypot(x, y));
    return { x: x * scale, y: y * scale };
};

export const limitSpeed = (body: Body, max: number): void => {
    Body.setVelocity(body, capSpeed(body.velocity, max));
};

// A blast's push: along (nx, ny), a little upward, with a random spin. `strength` is 0 to 1.
export const kick = (
    body: Body,
    nx: number,
    ny: number,
    strength: number,
    random: () => number,
): void => {
    const power = 7 + 24 * strength;
    Body.setVelocity(body, {
        x: body.velocity.x + nx * power,
        y: body.velocity.y + ny * power - 4 * strength,
    });
    Body.setAngularVelocity(
        body,
        body.angularVelocity + (random() - 0.5) * 0.5 * (0.3 + strength),
    );
};
