import { Body } from 'matter-js';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Clock } from '../../../../assets/game/clock/clock';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type {
    Box,
    GameEvents,
    Point,
} from '../../../../assets/game/events/game_events';
import { Monkey } from '../../../../assets/game/monkey/monkey';
import type { MonkeyBody } from '../../../../assets/game/physics/monkey_body';
import { PhysicsWorld, STEP } from '../../../../assets/game/physics/world';

const hosts: HTMLElement[] = [];
const aborts: AbortController[] = [];

afterEach(() => {
    for (const abort of aborts.splice(0)) {
        abort.abort();
    }
    for (const host of hosts.splice(0)) {
        host.remove();
    }
});

interface Options {
    reducedMotion?: boolean;
    scroll?: () => Point;
}

interface Harness {
    monkey: Monkey;
    host: HTMLElement;
    events: EventBus<GameEvents>;
    clock: Clock;
    abort: AbortController;
    body: MonkeyBody;
    viewport: Box;
    wake: Mock;
    bubble: () => HTMLElement;
    say: (text: string, actor?: string) => void;
    wait: (ms: number) => void;
    pointer: (x: number, y: number) => void;
    pupils: () => (string | null)[];
}

const setup = ({ reducedMotion = false, scroll }: Options = {}): Harness => {
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    const events = new EventBus<GameEvents>();
    const clock = new Clock();
    const abort = new AbortController();
    aborts.push(abort);
    const world = new PhysicsWorld({ width: 1000, floor: 700 }, [], {
        events,
        clock,
        random: (): number => 0.5,
        reducedMotion: false,
    });
    const body = world.addMonkey(300);
    const viewport: Box = { x: 0, y: 0, width: 1000, height: 800 };
    const wake = vi.fn();
    const monkey = new Monkey({
        host,
        world: (): PhysicsWorld => world,
        body: (): MonkeyBody => body,
        events,
        clock,
        signal: abort.signal,
        reducedMotion,
        viewport: (): Box => viewport,
        wake,
        scroll,
    });
    const bubble = (): HTMLElement => {
        const found = host.querySelector<HTMLElement>('.bubble');
        if (!found) {
            throw new Error('No bubble.');
        }
        Object.defineProperty(found, 'offsetWidth', {
            value: 100,
            configurable: true,
        });
        Object.defineProperty(found, 'offsetHeight', {
            value: 30,
            configurable: true,
        });
        return found;
    };
    // The bubble's measures are in place before the first line arrives: nothing is laid out.
    bubble();
    const say = (text: string, actor = 'monkey'): void => {
        events.emit('line.said', { actor, key: 'k', text });
    };
    const wait = (ms: number): void => {
        for (let left = ms; left > 0; left -= 250) {
            clock.tick(Math.min(250, left));
        }
    };
    const pointer = (x: number, y: number): void => {
        window.dispatchEvent(
            new PointerEvent('pointermove', { clientX: x, clientY: y }),
        );
    };
    const pupils = (): (string | null)[] =>
        [...host.querySelectorAll('.pupil')].map((pupil) =>
            pupil.getAttribute('transform'),
        );
    return {
        monkey,
        host,
        events,
        clock,
        abort,
        body,
        viewport,
        wake,
        bubble,
        say,
        wait,
        pointer,
        pupils,
    };
};

describe('the monkey', () => {
    it('puts his picture and his bubble into the scene', () => {
        const { host, monkey } = setup();

        expect(host.querySelector('.monkey')).toBe(monkey.look.element);
        expect(host.querySelectorAll('.bubble')).toHaveLength(1);
    });

    it('is placed where his body is, each frame', () => {
        const { monkey, body } = setup();

        monkey.step(0);

        expect(monkey.look.element.style.transform).toBe(
            `translate(${(body.position.x - 28).toFixed(1)}px, ${(body.position.y - 36).toFixed(1)}px) rotate(0.000rad)`,
        );
    });

    it('has a Motor that asks for the loop while it has requests to follow', () => {
        const { monkey } = setup();
        expect(monkey.busy).toBe(false);

        monkey.motor.perform({ type: 'walk', x: 600 }, () => undefined, 'body');

        expect(monkey.busy).toBe(true);
    });

    it('has a Motor that wakes the loop, and draws what it is told', () => {
        const { monkey, wake } = setup();

        monkey.motor.perform(
            { type: 'mood', mood: 'proud' },
            () => undefined,
            'body',
        );

        expect(wake).toHaveBeenCalledTimes(1);
        expect(monkey.look.element.dataset.mood).toBe('proud');
    });

    it('is stepped by the Motor each frame, which tells the Look', () => {
        const { monkey } = setup();
        monkey.motor.perform(
            { type: 'face', direction: 'left' },
            () => undefined,
            'body',
        );
        monkey.look.show({
            pose: 'stand',
            mood: 'calm',
            facing: 'right',
            gait: undefined,
            held: false,
            cigarette: 'lit',
        });

        monkey.step(STEP);

        expect(monkey.look.element.dataset.facing).toBe('left');
    });
});

describe('what he says', () => {
    it('shows his lines in the bubble, above him', () => {
        const { monkey, bubble, say } = setup();
        monkey.step(0);

        say('Salut');

        expect(bubble().textContent).toBe('Salut');
        expect(bubble().style.transform).not.toBe('');
    });

    it('keeps the bubble above him as he moves', () => {
        const { monkey, bubble, say, body } = setup();
        say('Salut');
        const before = bubble().style.transform;

        Body.setPosition(body.body, { x: 700, y: 665 });
        monkey.step(STEP);

        expect(bubble().style.transform).not.toBe(before);
    });

    it('ignores what the others say', () => {
        const { bubble, say, monkey } = setup();

        say('Bzzz', 'drone');

        expect(bubble().textContent).toBe('');
        expect(monkey.look.element.dataset.pose).toBe('stand');
    });

    it('talks while he says it, for as long as the line takes', () => {
        const { monkey, say, wait } = setup();

        say('Salut');

        expect(monkey.look.element.dataset.pose).toBe('talk');
        // 600 ms and 40 ms a character: 5 characters make 800 ms.
        wait(799);
        expect(monkey.look.element.dataset.pose).toBe('talk');
        wait(1);
        expect(monkey.look.element.dataset.pose).toBe('stand');
    });

    it('talks no longer than the bubble stays', () => {
        const { monkey, say, wait } = setup();

        say('x'.repeat(200));

        wait(3199);
        expect(monkey.look.element.dataset.pose).toBe('talk');
        wait(1);
        expect(monkey.look.element.dataset.pose).toBe('stand');
    });

    it('stops talking, and drawing, when he is stopped', () => {
        const { monkey, host, say } = setup();

        monkey.stop();
        say('Salut');

        expect(host.querySelector('.monkey')).toBeNull();
        expect(host.querySelector('.bubble')).toBeNull();
        expect(monkey.look.element.dataset.pose).toBe('stand');
    });
});

describe('his eyes', () => {
    it('follow the pointer, on the page', () => {
        const { monkey, pointer, pupils } = setup();
        monkey.step(0);

        pointer(900, 665);

        expect(pupils()).toEqual(['translate(3.0 0.0)', 'translate(3.0 0.0)']);
    });

    it('count the scroll, so that the pointer is where it is on the page', () => {
        const { monkey, pointer, pupils } = setup({
            scroll: () => ({ x: 0, y: 1000 }),
        });
        monkey.step(0);

        pointer(300, 0);

        expect(pupils()).toEqual(['translate(0.0 3.0)', 'translate(0.0 3.0)']);
    });

    it('read the real scroll of the window by default', () => {
        const { monkey, pointer, pupils } = setup();
        monkey.step(0);
        vi.spyOn(window, 'scrollX', 'get').mockReturnValue(600);
        vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0);

        pointer(300, 661);

        expect(pupils()).toEqual(['translate(3.0 0.0)', 'translate(3.0 0.0)']);
    });

    it('stay still under reduced motion', () => {
        const { monkey, pointer, pupils } = setup({ reducedMotion: true });
        monkey.step(0);

        pointer(900, 665);

        expect(pupils()).toEqual([null, null]);
    });

    it('stop following when the game stops', () => {
        const { monkey, abort, pointer, pupils } = setup();
        monkey.step(0);
        abort.abort();

        pointer(900, 665);

        expect(pupils()).toEqual([null, null]);
    });
});

describe('the bubble in the viewport', () => {
    it('is placed again when the page scrolls', () => {
        const { monkey, bubble, say, viewport } = setup();
        monkey.step(0);
        say('Salut');
        expect(bubble().style.transform).toBe('translate(250.0px, 577.0px)');

        viewport.y = 600;
        window.dispatchEvent(new Event('scroll'));

        expect(bubble().style.transform).toBe('translate(250.0px, 608.0px)');
    });

    it('is placed again when the window is resized', () => {
        const { monkey, bubble, say, viewport } = setup();
        monkey.step(0);
        say('Salut');

        viewport.x = 300;
        window.dispatchEvent(new Event('resize'));

        expect(bubble().style.transform).toBe('translate(308.0px, 577.0px)');

        // The bubble grew: only a resize measures it again.
        const element = bubble();
        Object.defineProperty(element, 'offsetWidth', { value: 400 });
        window.dispatchEvent(new Event('scroll'));
        expect(element.style.transform).toBe('translate(308.0px, 577.0px)');
        window.dispatchEvent(new Event('resize'));
        expect(element.style.transform).toBe('translate(308.0px, 577.0px)');
        viewport.x = 0;
        window.dispatchEvent(new Event('resize'));
        expect(element.style.transform).toBe('translate(100.0px, 577.0px)');
    });

    it('is left alone once the game stops', () => {
        const { monkey, bubble, say, viewport, abort } = setup();
        monkey.step(0);
        say('Salut');
        abort.abort();

        viewport.y = 600;
        viewport.x = 300;
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));

        expect(bubble().style.transform).toBe('translate(250.0px, 577.0px)');
    });
});
