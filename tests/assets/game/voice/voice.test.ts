import { afterEach, describe, expect, it } from 'vitest';
import { Clock } from '../../../../assets/game/clock/clock';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type {
    Box,
    GameEvents,
    Point,
} from '../../../../assets/game/events/game_events';
import { LINE_TIME, Voice } from '../../../../assets/game/voice/voice';

const hosts: HTMLElement[] = [];

interface Setup {
    voice: Voice;
    host: HTMLElement;
    events: EventBus<GameEvents>;
    clock: Clock;
    anchor: Point;
    viewport: Box;
    bubble: () => HTMLElement;
    say: (text: string, actor?: string) => void;
    wait: (ms: number) => void;
}

// The bubble is 100 px wide and 30 px high: happy-dom lays nothing out.
const setup = (): Setup => {
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    const events = new EventBus<GameEvents>();
    const clock = new Clock();
    const anchor = { x: 500, y: 665 };
    const viewport = { x: 0, y: 0, width: 1000, height: 800 };
    const voice = new Voice({
        host,
        events,
        clock,
        actor: 'monkey',
        anchor: (): Point => anchor,
        viewport: (): Box => viewport,
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
    // The measures are in place before the first line arrives.
    bubble();
    return {
        voice,
        host,
        events,
        clock,
        anchor,
        viewport,
        bubble,
        say: (text, actor = 'monkey'): void => {
            events.emit('line.said', { actor, key: 'k', text });
        },
        wait: (ms): void => {
            for (let left = ms; left > 0; left -= 250) {
                clock.tick(Math.min(250, left));
            }
        },
    };
};

afterEach(() => {
    for (const host of hosts.splice(0)) {
        host.remove();
    }
});

describe('the bubble', () => {
    it('is in the page from the start, empty and hidden, for a screen reader to listen to', () => {
        const { bubble, host } = setup();

        expect(host.querySelectorAll('.bubble')).toHaveLength(1);
        expect(bubble().tagName).toBe('P');
        expect(bubble().getAttribute('role')).toBe('status');
        expect(bubble().getAttribute('aria-live')).toBe('polite');
        expect(bubble().dataset.state).toBe('hidden');
        expect(bubble().textContent).toBe('');
    });

    it('shows the line the monkey says, as text', () => {
        const { bubble, say } = setup();

        say('Sauve qui peut <b>!</b>');

        expect(bubble().textContent).toBe('Sauve qui peut <b>!</b>');
        expect(bubble().children).toHaveLength(0);
        expect(bubble().dataset.state).toBe('shown');
    });

    it('ignores what the others say', () => {
        const { bubble, say } = setup();

        say('Bzzz', 'drone');

        expect(bubble().textContent).toBe('');
        expect(bubble().dataset.state).toBe('hidden');
    });

    it('goes after 3.2 s, and is emptied so that nothing stays to be read', () => {
        const { bubble, say, wait } = setup();
        say('Salut');

        wait(LINE_TIME - 1);
        expect(bubble().dataset.state).toBe('shown');
        expect(bubble().textContent).toBe('Salut');

        wait(1);
        expect(LINE_TIME).toBe(3200);
        expect(bubble().dataset.state).toBe('hidden');
        expect(bubble().textContent).toBe('');
    });

    it('gives way to the next line, which gets its whole time', () => {
        const { bubble, say, wait, clock } = setup();
        say('Premier');
        wait(3000);

        say('Second');
        wait(3000);

        expect(bubble().textContent).toBe('Second');
        expect(bubble().dataset.state).toBe('shown');
        wait(200);
        expect(bubble().dataset.state).toBe('hidden');
        expect(clock.next()).toBeUndefined();
    });
});

describe('placing it', () => {
    it('goes above the monkey’s centre, in the middle of him', () => {
        const { bubble, say } = setup();

        say('Salut');

        expect(bubble().style.transform).toBe('translate(450.0px, 577.0px)');
    });

    it('follows him when told to', () => {
        const { bubble, say, anchor, voice } = setup();
        say('Salut');

        anchor.x = 300.26;
        anchor.y = 400.74;
        voice.place();

        expect(bubble().style.transform).toBe('translate(250.3px, 312.7px)');
    });

    it('stays 8 px inside the left and right edges of what is seen', () => {
        const { bubble, say, anchor, voice } = setup();
        say('Salut');

        anchor.x = 58;
        voice.place();
        expect(bubble().style.transform).toBe('translate(8.0px, 577.0px)');
        anchor.x = 57;
        voice.place();
        expect(bubble().style.transform).toBe('translate(8.0px, 577.0px)');
        anchor.x = 59;
        voice.place();
        expect(bubble().style.transform).toBe('translate(9.0px, 577.0px)');

        anchor.x = 942;
        voice.place();
        expect(bubble().style.transform).toBe('translate(892.0px, 577.0px)');
        anchor.x = 943;
        voice.place();
        expect(bubble().style.transform).toBe('translate(892.0px, 577.0px)');
        anchor.x = 941;
        voice.place();
        expect(bubble().style.transform).toBe('translate(891.0px, 577.0px)');
    });

    it('stays 8 px inside the top and bottom edges of what is seen', () => {
        const { bubble, say, anchor, voice } = setup();
        say('Salut');

        anchor.y = 96;
        voice.place();
        expect(bubble().style.transform).toBe('translate(450.0px, 8.0px)');
        anchor.y = 20;
        voice.place();
        expect(bubble().style.transform).toBe('translate(450.0px, 8.0px)');
        anchor.y = 97;
        voice.place();
        expect(bubble().style.transform).toBe('translate(450.0px, 9.0px)');

        anchor.y = 850;
        voice.place();
        expect(bubble().style.transform).toBe('translate(450.0px, 762.0px)');
        anchor.y = 2000;
        voice.place();
        expect(bubble().style.transform).toBe('translate(450.0px, 762.0px)');
        anchor.y = 849;
        voice.place();
        expect(bubble().style.transform).toBe('translate(450.0px, 761.0px)');
    });

    it('keeps inside the part of the page that is scrolled into view', () => {
        const { bubble, say, anchor, viewport, voice } = setup();
        viewport.x = 100;
        viewport.y = 400;
        say('Salut');

        expect(bubble().style.transform).toBe('translate(450.0px, 577.0px)');
        anchor.x = 0;
        anchor.y = 0;
        voice.place();
        expect(bubble().style.transform).toBe('translate(108.0px, 408.0px)');
        anchor.x = 5000;
        anchor.y = 5000;
        voice.place();
        expect(bubble().style.transform).toBe('translate(992.0px, 1162.0px)');
    });

    it('keeps its left edge in view when it is wider than what is seen', () => {
        const { bubble, say, viewport } = setup();
        viewport.width = 90;
        viewport.height = 20;

        say('Salut');

        expect(bubble().style.transform).toBe('translate(8.0px, 8.0px)');
    });

    it('is left alone while there is nothing to say, and after it is said', () => {
        const { bubble, say, voice, anchor, wait } = setup();

        voice.place();
        expect(bubble().style.transform).toBe('');

        say('Salut');
        wait(LINE_TIME);
        anchor.x = 100;
        voice.place();
        expect(bubble().style.transform).toBe('translate(450.0px, 577.0px)');
    });
});

describe('stopping', () => {
    it('removes the bubble, and stops listening', () => {
        const { voice, host, say, clock } = setup();
        say('Salut');

        voice.stop();
        say('Encore');

        expect(host.querySelector('.bubble')).toBeNull();
        expect(host.children).toHaveLength(0);
        expect(clock.next()).toBeUndefined();
    });

    it('leaves no timer behind', () => {
        const { voice, say, clock } = setup();
        say('Salut');

        voice.stop();

        expect(clock.next()).toBeUndefined();
    });

    it('can be stopped with nothing said', () => {
        const { voice, host } = setup();

        voice.stop();

        expect(host.children).toHaveLength(0);
    });
});

describe('measuring', () => {
    it('reads the bubble’s size when a line is set, and again only when asked', () => {
        const { bubble, say, voice } = setup();
        say('Salut');
        expect(bubble().style.transform).toBe('translate(450.0px, 577.0px)');

        const element = bubble();
        Object.defineProperty(element, 'offsetWidth', { value: 200 });
        Object.defineProperty(element, 'offsetHeight', { value: 50 });
        voice.place();
        expect(element.style.transform).toBe('translate(450.0px, 577.0px)');

        voice.place(true);
        expect(element.style.transform).toBe('translate(400.0px, 557.0px)');
    });
});

describe('the same line twice', () => {
    it('is emptied and set again on the next frame, so that it is announced again', () => {
        const { bubble, say, wait, clock } = setup();
        say('Salut');
        wait(1000);

        say('Salut');
        expect(bubble().textContent).toBe('');
        expect(bubble().dataset.state).toBe('shown');
        wait(1);

        expect(bubble().textContent).toBe('Salut');
        wait(3198);
        expect(bubble().dataset.state).toBe('shown');
        wait(1);
        expect(bubble().dataset.state).toBe('hidden');
        expect(clock.next()).toBeUndefined();
    });

    it('is set at once when the words differ, and a pending refill is dropped for them', () => {
        const { bubble, say, wait } = setup();
        say('Salut');
        say('Salut');

        say('Autre');
        expect(bubble().textContent).toBe('Autre');
        wait(1);

        expect(bubble().textContent).toBe('Autre');
    });

    it('leaves nothing pending when stopped before the refill', () => {
        const { voice, say, clock } = setup();
        say('Salut');
        say('Salut');

        voice.stop();

        expect(clock.next()).toBeUndefined();
    });
});
