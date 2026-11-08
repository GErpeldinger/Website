import { describe, expect, it, vi } from 'vitest';
import { Clock } from '../../../../assets/game/clock/clock';
import { FakeMotor } from '../../../../assets/game/ports/fake_motor';
import type { Outcome } from '../../../../assets/game/ports/motor';

const walk = { type: 'walk', to: 10 };
const flinch = { type: 'flinch' };

describe('a scripted motor', () => {
    it('records what it is asked, in order, with the layer', () => {
        const motor = new FakeMotor();

        motor.perform(walk, vi.fn(), 'body');
        motor.perform(flinch, vi.fn(), 'overlay');

        expect(motor.requests).toEqual([walk, flinch]);
        expect(motor.layers).toEqual(['body', 'overlay']);
        expect(motor.pending).toEqual([walk, flinch]);
    });

    it('finishes the oldest pending request, and reports the outcome', () => {
        const motor = new FakeMotor();
        const first = vi.fn();
        const second = vi.fn();
        motor.perform(walk, first, 'body');
        motor.perform(flinch, second, 'body');

        motor.finish();
        expect(first).toHaveBeenCalledExactlyOnceWith('done');
        expect(second).not.toHaveBeenCalled();
        expect(motor.pending).toEqual([flinch]);

        motor.finish('failed');
        expect(second).toHaveBeenCalledExactlyOnceWith('failed');
        expect(motor.pending).toEqual([]);
    });

    it('finishes the oldest request of a layer', () => {
        const motor = new FakeMotor();
        const body = vi.fn();
        const overlay = vi.fn();
        motor.perform(walk, body, 'body');
        motor.perform(flinch, overlay, 'overlay');

        motor.finish('done', 'overlay');

        expect(overlay).toHaveBeenCalledTimes(1);
        expect(body).not.toHaveBeenCalled();
        expect(motor.pending).toEqual([walk]);
    });

    it('refuses to finish what is not pending', () => {
        const motor = new FakeMotor();

        expect(() => {
            motor.finish();
        }).toThrow('No pending request.');
        motor.perform(walk, vi.fn(), 'body');
        expect(() => {
            motor.finish('done', 'overlay');
        }).toThrow('No pending request on the overlay layer.');
    });

    it('forgets a cancelled request: it never finishes', () => {
        const motor = new FakeMotor();
        const done = vi.fn();
        const task = motor.perform(walk, done, 'body');

        task.cancel();
        task.cancel();

        expect(motor.cancelled).toEqual([walk]);
        expect(motor.pending).toEqual([]);
        expect(() => {
            motor.finish();
        }).toThrow('No pending request');
        expect(done).not.toHaveBeenCalled();
    });

    it('does not cancel a request that already finished', () => {
        const motor = new FakeMotor();
        const task = motor.perform(walk, vi.fn(), 'body');
        motor.finish();

        task.cancel();

        expect(motor.cancelled).toEqual([]);
    });

    it('calls back a request that finishes at once, as a motor with nothing to do could', () => {
        const motor = new FakeMotor({ instant: true });
        const outcomes: Outcome[] = [];

        motor.perform(walk, (outcome) => outcomes.push(outcome), 'body');

        expect(outcomes).toEqual(['done']);
        expect(motor.pending).toEqual([]);
        expect(motor.requests).toEqual([walk]);
    });
});

describe('on a clock', () => {
    it('finishes each request after its duration of game time', () => {
        const clock = new Clock();
        const motor = new FakeMotor({ clock, duration: 400 });
        const done = vi.fn();
        motor.perform(walk, done, 'body');

        clock.tick(200);
        expect(done).not.toHaveBeenCalled();
        clock.tick(200);

        expect(done).toHaveBeenCalledExactlyOnceWith('done');
        expect(motor.pending).toEqual([]);
    });

    it('does not finish a request twice when it was finished by hand first', () => {
        const clock = new Clock();
        const motor = new FakeMotor({ clock, duration: 100 });
        const done = vi.fn();
        motor.perform(walk, done, 'body');

        motor.finish();
        clock.tick(200);

        expect(done).toHaveBeenCalledTimes(1);
    });

    it('stops the timer of a cancelled request', () => {
        const clock = new Clock();
        const motor = new FakeMotor({ clock, duration: 100 });
        const done = vi.fn();
        motor.perform(walk, done, 'body').cancel();

        clock.tick(200);

        expect(done).not.toHaveBeenCalled();
    });

    it('takes 400 ms by default', () => {
        const clock = new Clock({ maxStep: 1000 });
        const motor = new FakeMotor({ clock });
        const done = vi.fn();
        motor.perform(walk, done, 'body');

        clock.tick(399);
        expect(done).not.toHaveBeenCalled();
        clock.tick(1);
        expect(done).toHaveBeenCalledTimes(1);
    });
});
