import { describe, expect, it, vi } from 'vitest';
import { Clock } from '../../../../assets/game/clock/clock';
import { Quiet } from '../../../../assets/game/input/quiet';

const setup = (): { clock: Clock; quiet: Quiet; onQuiet: () => void } => {
    const clock = new Clock({ maxStep: 1_000_000 });
    const onQuiet = vi.fn();
    return {
        clock,
        onQuiet,
        quiet: new Quiet({ clock, after: 1000, onQuiet }),
    };
};

describe('the visitor’s silence', () => {
    it('is told once, after the delay from the last touch', () => {
        const { clock, quiet, onQuiet } = setup();

        quiet.touch();
        clock.tick(999);
        expect(onQuiet).not.toHaveBeenCalled();
        clock.tick(1);
        expect(onQuiet).toHaveBeenCalledTimes(1);
        clock.tick(5000);

        expect(onQuiet).toHaveBeenCalledTimes(1);
    });

    it('starts again from each touch', () => {
        const { clock, quiet, onQuiet } = setup();
        quiet.touch();
        clock.tick(900);

        quiet.touch();
        clock.tick(900);

        expect(onQuiet).not.toHaveBeenCalled();
        clock.tick(100);
        expect(onQuiet).toHaveBeenCalledTimes(1);
        quiet.touch();
        clock.tick(1000);
        expect(onQuiet).toHaveBeenCalledTimes(2);
    });

    it('waits for nothing before the first touch, and after it is stopped', () => {
        const { clock, quiet, onQuiet } = setup();
        clock.tick(5000);
        quiet.touch();

        quiet.stop();
        clock.tick(5000);

        expect(onQuiet).not.toHaveBeenCalled();
        expect(clock.next()).toBeUndefined();
    });
});
