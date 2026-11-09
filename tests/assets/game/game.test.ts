import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    wait,
    type Behaviour,
    type Run,
} from '../../../assets/game/brain/behaviour';
import { Engine } from '../../../assets/game/brain/engine';
import { EventBus } from '../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../assets/game/events/game_events';
import { startGame, type Game } from '../../../assets/game/game';
import type { LineBook } from '../../../assets/game/lines/speaker';
import { FakeMotor } from '../../../assets/game/ports/fake_motor';
import type { MonkeyRequest } from '../../../assets/game/ports/monkey';
import type { Motor } from '../../../assets/game/ports/motor';
import smoke from '../../../assets/game/activities/monkey/smoke';
import { byId, rect, select } from './dom';
import { FakeBrowser } from './frame/fake_environment';

const games: Game[] = [];

// A click stamped on the clock of the test's pointer events, which start at 0.
const click = (target: EventTarget): void => {
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'timeStamp', { value: 0 });
    target.dispatchEvent(event);
};

afterEach(() => {
    for (const game of games.splice(0)) {
        game.stop();
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

const names = [
    'item.freed',
    'item.grabbed',
    'item.dropped',
    'item.thrown',
    'item.hit',
    'item.restored',
    'monkey.grabbed',
    'monkey.dropped',
    'monkey.thrown',
    'monkey.landed',
    'monkey.hit',
    'bomb.placed',
    'bomb.cancelled',
    'bomb.exploded',
    'tornado.started',
    'tornado.ended',
    'gravity.changed',
] as const satisfies readonly (keyof GameEvents)[];

interface Options {
    behaviours?: Behaviour[];
    lines?: LineBook;
    reducedMotion?: boolean;
    random?: () => number;
    width?: number;
    // Lets the first frame, which every game runs once to arm the Brain's idle timer, go by.
    settle?: boolean;
}

interface Harness {
    game: Game;
    root: HTMLElement;
    browser: FakeBrowser;
    // The viewport's width, and where the ground strip starts.
    size: { width: number; floor: number };
    get: (id: string) => HTMLElement;
    log: { name: string; payload: unknown }[];
    names: (name: string) => unknown[];
    // Frames at 60 Hz, for as long as the loop runs and up to `max` of them.
    run: (max?: number) => void;
    pointer: (
        target: EventTarget,
        type: string,
        x: number,
        y: number,
        stamp?: number,
    ) => PointerEvent;
}

// A page of a 1000 px width and an 800 px height, with a block at (500, 300), a locked one at
// (200, 300), and a link at (500, 600).
const setup = ({
    // None by default: the registry's own behaviours say lines the test's book lacks.
    behaviours = [],
    lines = { locale: 'en', pools: {} },
    reducedMotion = false,
    random,
    width = 1000,
    settle = true,
}: Options = {}): Harness => {
    document.body.innerHTML = `<div id="scene">
        <div id="ground" data-ground></div>
        <main>
            <p id="block" data-physics="block">block</p>
            <p id="locked" data-physics="block" data-grabbable="false">locked</p>
            <a id="link" href="#x" data-physics="link">link</a>
            <p id="plain">plain</p>
        </main>
    </div>`;
    const root = select('main');
    const get = byId;
    vi.spyOn(get('block'), 'getBoundingClientRect').mockReturnValue(
        rect(450, 280, 100, 40),
    );
    vi.spyOn(get('locked'), 'getBoundingClientRect').mockReturnValue(
        rect(150, 280, 100, 40),
    );
    vi.spyOn(get('link'), 'getBoundingClientRect').mockReturnValue(
        rect(450, 590, 100, 20),
    );
    const size = { width, floor: 800 };
    vi.spyOn(get('ground'), 'getBoundingClientRect').mockImplementation(() =>
        rect(0, size.floor, size.width, 92),
    );
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockImplementation(
        () => size.width,
    );
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(
        800,
    );
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(
        800,
    );

    const browser = new FakeBrowser();
    const events = new EventBus<GameEvents>();
    const log: { name: string; payload: unknown }[] = [];
    for (const name of names) {
        events.on(name, (payload) => log.push({ name, payload }));
    }
    const game = startGame(root, {
        events,
        behaviours,
        lines,
        random,
        reducedMotion,
        frameEnvironment: browser,
    });
    games.push(game);

    let time = 0;
    if (settle) {
        time += 1000 / 60;
        browser.frame(time);
        browser.requested = 0;
    }
    return {
        game,
        root,
        browser,
        size,
        get,
        log,
        names: (name: string): unknown[] =>
            log.filter((entry) => entry.name === name).map((e) => e.payload),
        run: (max = 2000): void => {
            for (let i = 0; i < max && browser.pending; i++) {
                time += 1000 / 60;
                browser.frame(time);
            }
        },
        pointer: (
            target: EventTarget,
            type: string,
            x: number,
            y: number,
            stamp = 0,
        ): PointerEvent => {
            const event = new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
                pointerId: 1,
                pointerType: 'mouse',
                button: 0,
            });
            Object.defineProperty(event, 'timeStamp', { value: stamp });
            target.dispatchEvent(event);
            return event;
        },
    };
};

describe('starting', () => {
    it('pins every piece and costs no frame while nothing happens', () => {
        const { get, browser } = setup();

        expect(get('block').dataset.state).toBe('pinned');
        expect(get('locked').dataset.state).toBe('pinned');
        expect(get('link').dataset.state).toBe('pinned');
        expect(get('plain').hasAttribute('data-state')).toBe(false);
        expect(browser.requested).toBe(0);
    });

    it('runs one frame, then sleeps until the Brain’s idle timer, so he can smoke on a still page', () => {
        const { get, browser, game } = setup({
            settle: false,
            behaviours: [{ ...smoke, id: 'monkey/smoke' }],
        });
        const pose = (): string | undefined =>
            select('[data-pose]').dataset.pose;

        expect(browser.pending).toBe(true);
        browser.frame(16);
        expect(browser.pending).toBe(false);
        expect([...browser.timeouts.values()].map((t) => t.delay)).toEqual([
            5000 - 16,
        ]);
        expect(pose()).not.toBe('smoke');

        browser.fireTimeout();

        expect(game.engine.clock.now()).toBe(5000);
        expect(pose()).toBe('smoke');
        expect(get('block').dataset.state).toBe('pinned');
    });
});

describe('grabbing and throwing', () => {
    it('takes a piece with the mouse, carries it, throws it, and lets it settle', () => {
        const { get, names, browser, run, pointer } = setup();
        const block = get('block');

        pointer(block, 'pointerdown', 500, 300, 0);
        expect(names('item.grabbed')).toEqual([]);
        pointer(window, 'pointermove', 520, 300, 8);
        pointer(window, 'pointermove', 600, 280, 16);

        expect(names('item.freed')).toEqual([
            { id: 0, kind: 'block', by: 'grab' },
        ]);
        expect(names('item.grabbed')).toEqual([
            { id: 0, kind: 'block', at: { x: 500, y: 300 } },
        ]);
        expect(block.dataset.state).toBe('held');

        run(20);
        // The spring has pulled it towards the pointer, 100 px to the right of where it started.
        const [, dx] = /translate\(([\d.-]+)px/.exec(block.style.transform) ?? [
            undefined,
            '0',
        ];
        expect(Number(dx)).toBeGreaterThan(30);

        pointer(window, 'pointerup', 600, 280, 16);
        expect(block.dataset.state).toBe('loose');
        expect(names('item.thrown')).toHaveLength(1);

        run();
        expect(browser.pending).toBe(false);
        // It came to rest on the floor, the bottom of the page: below where it started.
        const [, dy] = /translate\([^,]+, ([\d.-]+)px\)/.exec(
            block.style.transform,
        ) ?? [undefined, '0'];
        expect(Number(dy)).toBeGreaterThan(300);
    });

    it('puts a piece down when it is let go gently', () => {
        const { get, names, pointer } = setup();

        pointer(get('block'), 'pointerdown', 500, 300, 0);
        pointer(window, 'pointermove', 520, 300, 8);
        pointer(window, 'pointerup', 520, 300, 400);

        expect(names('item.dropped')).toHaveLength(1);
        expect(get('block').dataset.state).toBe('loose');
    });

    it('does not take a piece that opted out, or a plain element', () => {
        const { get, names, browser, pointer } = setup();

        const locked = pointer(get('locked'), 'pointerdown', 200, 300);
        pointer(window, 'pointermove', 400, 300);
        const plain = pointer(get('plain'), 'pointerdown', 10, 10);
        pointer(window, 'pointermove', 100, 100);

        expect(names('item.grabbed')).toEqual([]);
        expect(browser.requested).toBe(0);
        // The browser keeps its own text selection and link drag there.
        expect(locked.defaultPrevented).toBe(false);
        expect(plain.defaultPrevented).toBe(false);
        expect(
            pointer(get('block'), 'pointerdown', 500, 300).defaultPrevented,
        ).toBe(true);
    });

    it('takes a link by its element, and a plain click still follows it', () => {
        const { get, names, pointer } = setup();
        const link = get('link');
        const clicked = vi.fn((event: Event) => {
            event.preventDefault();
        });
        link.addEventListener('click', clicked);

        pointer(link, 'pointerdown', 500, 600);
        pointer(window, 'pointerup', 500, 600);
        click(link);
        expect(clicked).toHaveBeenCalledTimes(1);
        expect(names('item.grabbed')).toEqual([]);

        pointer(link, 'pointerdown', 500, 600);
        pointer(window, 'pointermove', 560, 600);
        pointer(window, 'pointerup', 560, 600);
        click(link);
        expect(clicked).toHaveBeenCalledTimes(1);
        expect(names('item.grabbed')).toHaveLength(1);
    });

    it('wakes the loop for a touch press, which has a long-press timer to run', () => {
        const { get, browser, run, names } = setup();
        expect(browser.pending).toBe(false);

        get('block').dispatchEvent(
            new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                clientX: 500,
                clientY: 300,
                pointerId: 1,
                pointerType: 'touch',
                button: 0,
            }),
        );
        expect(browser.pending).toBe(true);
        run(60);

        expect(names('item.grabbed')).toHaveLength(1);
    });

    it('stops the loop once the page is still again, and starts it on the next input', () => {
        const { get, browser, run, pointer } = setup();
        pointer(get('block'), 'pointerdown', 500, 300, 0);
        pointer(window, 'pointermove', 560, 300, 8);
        pointer(window, 'pointerup', 560, 300, 400);
        run();
        expect(browser.pending).toBe(false);
        const requested = browser.requested;

        pointer(get('block'), 'pointerdown', 560, 600, 0);
        pointer(window, 'pointermove', 600, 600, 8);

        expect(browser.requested).toBeGreaterThan(requested);
        expect(browser.pending).toBe(true);
    });

    it('keeps the loop going while a piece is held, even a still one', () => {
        const { get, browser, run, pointer } = setup();
        pointer(get('block'), 'pointerdown', 500, 300, 0);
        pointer(window, 'pointermove', 560, 300, 8);

        run(300);

        expect(browser.pending).toBe(true);
    });
});

describe('the bomb', () => {
    it('blows after its fuse, frees what is near, marks the page and shakes it', () => {
        const { game, get, names, root, run } = setup();

        game.bomb({ x: 500, y: 330 });
        expect(names('bomb.placed')).toHaveLength(1);
        run(88);
        expect(names('bomb.exploded')).toEqual([]);
        run(4);

        expect(names('bomb.exploded')).toHaveLength(1);
        // The bomb fell to the floor, 185 px under the link and 485 under the block.
        expect(get('link').dataset.state).toBe('loose');
        expect(get('block').dataset.state).toBe('pinned');
        const marks = document.body.querySelectorAll('[data-scorch]');
        expect(marks).toHaveLength(1);
        expect(root.style.translate).not.toBe('');
    });

    it('lets the shake die down before the loop stops', () => {
        const { game, root, browser, run } = setup();
        game.bomb({ x: 500, y: 330 });

        run();

        expect(browser.pending).toBe(false);
        expect(root.style.translate).toBe('');
    });

    it('does not shake under reduced motion, but still blows', () => {
        const { game, names, root, run } = setup({ reducedMotion: true });

        game.bomb({ x: 500, y: 330 });
        run(100);

        expect(names('bomb.exploded')).toHaveLength(1);
        expect(root.style.translate).toBe('');
        expect(document.body.querySelectorAll('[data-scorch]')).toHaveLength(1);
    });

    it('keeps at most 12 marks, and wipes them on request', () => {
        const { game, run } = setup();
        for (let i = 0; i < 13; i++) {
            game.bomb({ x: 900, y: 100 });
            run(100);
        }
        expect(document.body.querySelectorAll('[data-scorch]')).toHaveLength(
            12,
        );

        game.clearScorches();

        expect(document.body.querySelectorAll('[data-scorch]')).toHaveLength(0);
    });
});

describe('the tornado', () => {
    it('sweeps the page for 5.2 s, then lets it settle', () => {
        const { game, names, get, browser, run } = setup();

        game.tornado({ x: 500, y: 300 });
        expect(names('tornado.started')).toEqual([{ x: 500 }]);
        run(280);
        expect(names('tornado.ended')).toEqual([]);
        expect(get('block').dataset.state).toBe('loose');
        run(60);

        expect(names('tornado.ended')).toEqual([undefined]);
        run();
        expect(browser.pending).toBe(false);
    });

    it('follows the pointer', () => {
        const { game, get, run, pointer } = setup();
        game.tornado({ x: 100, y: 300 });
        pointer(window, 'pointermove', 480, 300);

        run(200);

        expect(get('link').dataset.state).toBe('loose');
    });

    it('does not blow under reduced motion', () => {
        const { game, names, get, browser } = setup({ reducedMotion: true });

        game.tornado({ x: 500, y: 300 });

        expect(names('tornado.started')).toEqual([]);
        expect(get('block').dataset.state).toBe('pinned');
        expect(browser.pending).toBe(true);
    });

    it('reads the reduced motion preference of the browser by default', () => {
        document.body.innerHTML = '<main></main>';
        vi.spyOn(window, 'matchMedia').mockReturnValue({
            matches: true,
        } as MediaQueryList);
        const events = new EventBus<GameEvents>();
        const started = vi.fn();
        events.on('tornado.started', started);
        const game = startGame(select('main'), {
            events,
            behaviours: [],
            lines: { locale: 'en', pools: {} },
            frameEnvironment: new FakeBrowser(),
        });
        games.push(game);

        game.tornado({ x: 500, y: 300 });

        expect(started).not.toHaveBeenCalled();
    });
});

describe('zero gravity', () => {
    it('frees and floats the pieces, with the real random by default', () => {
        document.body.innerHTML =
            '<main><p id="a" data-physics="block">a</p></main>';
        vi.spyOn(
            document.documentElement,
            'clientWidth',
            'get',
        ).mockReturnValue(1000);
        const events = new EventBus<GameEvents>();
        const changed = vi.fn();
        events.on('gravity.changed', changed);
        const game = startGame(select('main'), {
            events,
            behaviours: [],
            lines: { locale: 'en', pools: {} },
            reducedMotion: false,
            frameEnvironment: new FakeBrowser(),
        });
        games.push(game);

        game.setZeroGravity(true);

        expect(changed).toHaveBeenCalledExactlyOnceWith({ zero: true }, 'game');
        expect(document.getElementById('a')?.dataset.state).toBe('loose');
    });

    it('keeps the loop alive while it floats and stops it when it ends', () => {
        const { game, browser, run } = setup();
        game.setZeroGravity(true);
        run(200);
        expect(browser.pending).toBe(true);

        game.setZeroGravity(false);
        run();

        expect(browser.pending).toBe(false);
    });
});

describe('the scorch marks', () => {
    it('are laid in the scene, outside what the shake moves', () => {
        const { game, run } = setup();

        game.bomb({ x: 500, y: 330 });
        run(100);

        const [mark] = document.body.querySelectorAll('[data-scorch]');
        expect(mark?.parentElement?.id).toBe('scene');
        expect(select('main').contains(mark ?? null)).toBe(false);
    });
});

describe('restore', () => {
    it('frees the hand when the held piece goes home', () => {
        const { game, get, names, pointer } = setup();
        pointer(get('block'), 'pointerdown', 500, 300);
        pointer(window, 'pointermove', 560, 300);

        game.restore(0);
        pointer(get('block'), 'pointerdown', 500, 300);
        pointer(window, 'pointermove', 560, 300);

        expect(names('item.dropped')).toHaveLength(1);
        expect(names('item.grabbed')).toHaveLength(2);
    });

    it('keeps the hand on another piece when one goes home', () => {
        const { game, get, names, pointer } = setup();
        pointer(get('block'), 'pointerdown', 500, 300);
        pointer(window, 'pointermove', 560, 300);

        game.restore(2);
        pointer(window, 'pointerup', 560, 300);

        expect(names('item.dropped')).toHaveLength(1);
        expect(names('item.thrown').length + names('item.dropped').length).toBe(
            1,
        );
    });

    it('sends a piece back to its place, pinned', () => {
        const { game, get, names, run, pointer } = setup();
        pointer(get('block'), 'pointerdown', 500, 300, 0);
        pointer(window, 'pointermove', 560, 300, 8);
        pointer(window, 'pointerup', 560, 300, 400);
        run();
        expect(get('block').style.transform).not.toBe('');

        game.restore(0);

        expect(get('block').dataset.state).toBe('pinned');
        expect(get('block').style.transform).toBe('');
        expect(names('item.restored')).toEqual([{ id: 0, kind: 'block' }]);
    });
});

describe('resizing', () => {
    const wreck = (s: ReturnType<typeof setup>): void => {
        s.pointer(s.get('block'), 'pointerdown', 500, 300, 0);
        s.pointer(window, 'pointermove', 560, 300, 8);
        s.pointer(window, 'pointerup', 560, 300, 400);
        s.run();
    };

    it('measures the page again once a new width settles', () => {
        const s = setup();
        wreck(s);
        expect(s.get('block').dataset.state).toBe('loose');

        s.size.width = 700;
        window.dispatchEvent(new Event('resize'));
        expect(s.browser.pending).toBe(true);
        s.run(8);
        expect(s.get('block').dataset.state).toBe('loose');
        s.run();

        expect(s.get('block').dataset.state).toBe('pinned');
        expect(s.get('block').style.transform).toBe('');
        expect(s.browser.pending).toBe(false);
    });

    it('waits for the resizing to stop', () => {
        const s = setup();
        wreck(s);
        s.size.width = 700;
        window.dispatchEvent(new Event('resize'));
        s.run(8);
        s.size.width = 650;
        window.dispatchEvent(new Event('resize'));
        s.run(8);

        expect(s.get('block').dataset.state).toBe('loose');
        s.run();
        expect(s.get('block').dataset.state).toBe('pinned');
    });

    it('lets go of what is held, and wipes the marks, on the new layout', () => {
        const s = setup();
        s.game.bomb({ x: 900, y: 100 });
        s.run();
        s.pointer(s.get('block'), 'pointerdown', 500, 300, 0);
        s.pointer(window, 'pointermove', 560, 300, 8);

        s.size.width = 700;
        window.dispatchEvent(new Event('resize'));
        s.run();

        expect(document.body.querySelectorAll('[data-scorch]')).toHaveLength(0);
        expect(s.names('item.dropped')).toHaveLength(1);
        expect(s.get('block').dataset.state).toBe('pinned');
    });

    it('listens to the resize until the game stops', () => {
        const listen = vi.spyOn(window, 'addEventListener');

        const s = setup();

        const calls = listen.mock.calls.filter(([type]) => type === 'resize');
        // The game's own, and the monkey's for his bubble.
        expect(calls).toHaveLength(2);
        for (const call of calls) {
            const options = call[2] as AddEventListenerOptions | undefined;
            expect(options?.signal).toBeInstanceOf(AbortSignal);
        }
        s.game.stop();
    });

    it('measures again when only the height changed and the ground moved with it', () => {
        const s = setup();
        wreck(s);

        s.size.floor = 600;
        window.dispatchEvent(new Event('resize'));
        s.run();

        expect(s.get('block').dataset.state).toBe('pinned');
    });

    it('owes no rebuild once the layout is back to the built one', () => {
        const s = setup();
        wreck(s);

        s.size.floor = 600;
        window.dispatchEvent(new Event('resize'));
        s.run(3);
        s.size.floor = 800;
        window.dispatchEvent(new Event('resize'));
        s.run();

        expect(s.get('block').dataset.state).toBe('loose');
        expect(s.browser.pending).toBe(false);
    });

    it('ends a bomb the rebuild put out, and leaves the hand free', () => {
        const s = setup();
        s.game.bomb({ x: 900, y: 100 });
        s.pointer(s.get('block'), 'pointerdown', 500, 300);
        s.pointer(window, 'pointermove', 560, 300);

        s.size.width = 700;
        window.dispatchEvent(new Event('resize'));
        s.run();

        expect(s.names('bomb.cancelled')).toEqual([{ id: 1 }]);
        s.pointer(s.get('block'), 'pointerdown', 500, 300);
        s.pointer(window, 'pointermove', 560, 300);
        expect(s.names('item.grabbed')).toHaveLength(2);
    });

    it('ignores a resize that changes neither the width nor the floor', () => {
        const s = setup();
        wreck(s);

        window.dispatchEvent(new Event('resize'));

        expect(s.browser.pending).toBe(false);
        expect(s.get('block').dataset.state).toBe('loose');
    });
});

describe('stopping', () => {
    it('hands the page back as the server rendered it', () => {
        const s = setup();
        s.pointer(s.get('block'), 'pointerdown', 500, 300, 0);
        s.pointer(window, 'pointermove', 560, 300, 8);
        s.game.bomb({ x: 900, y: 100 });
        s.run(100);

        s.game.stop();

        for (const id of ['block', 'locked', 'link']) {
            expect(s.get(id).hasAttribute('data-state')).toBe(false);
            expect(s.get(id).style.transform).toBe('');
        }
        expect(s.root.style.translate).toBe('');
        expect(document.body.querySelectorAll('[data-scorch]')).toHaveLength(0);
        expect(s.browser.pending).toBe(false);
        expect(s.browser.watching).toBe(false);
    });

    it('detaches the pointer, the resize and the effects', () => {
        const s = setup();
        s.game.stop();
        s.log.length = 0;

        s.pointer(s.get('block'), 'pointerdown', 500, 300);
        s.pointer(window, 'pointermove', 560, 300);
        s.size.width = 700;
        window.dispatchEvent(new Event('resize'));
        s.game.bomb({ x: 500, y: 300 });
        s.game.tornado({ x: 500, y: 300 });
        s.game.setZeroGravity(true);
        s.game.restore(0);

        expect(s.log).toEqual([]);
        expect(s.browser.requested).toBe(0);
    });

    it('stops listening to its own events, so a late event touches nothing', () => {
        const s = setup();
        s.game.stop();

        s.game.events.emit('item.freed', { id: 0, kind: 'block', by: 'grab' });
        s.game.events.emit('bomb.exploded', {
            id: 1,
            at: { x: 1, y: 1 },
            radius: 1,
            freed: [],
        });

        expect(s.get('block').hasAttribute('data-state')).toBe(false);
        expect(document.body.querySelectorAll('[data-scorch]')).toHaveLength(0);
    });

    it('can be stopped twice', () => {
        const s = setup();
        s.game.stop();

        expect(() => {
            s.game.stop();
        }).not.toThrow();
    });

    it('ends what was going on, for the systems that listen', () => {
        const s = setup();
        s.game.tornado({ x: 500, y: 300 });
        s.game.setZeroGravity(true);
        s.log.length = 0;

        s.game.stop();

        expect(s.log.map((entry) => entry.name)).toEqual([
            'tornado.ended',
            'gravity.changed',
        ]);
    });
});

describe('an unknown piece', () => {
    it('is ignored by the page updates', () => {
        const s = setup();

        s.game.events.emit('item.freed', { id: 99, kind: 'block', by: 'grab' });
        s.game.events.emit('item.restored', { id: 99, kind: 'block' });

        expect(s.get('block').dataset.state).toBe('pinned');
    });
});

describe('the behaviour engine', () => {
    const bombReaction = (overrides: Partial<Behaviour> = {}): Behaviour => ({
        id: 'drone/flee',
        actor: 'drone',
        kind: 'activity',
        priority: 1,
        triggers: ['bomb.placed'],
        canStart: () => true,
        *run(): Run {
            yield wait(500);
        },
        ...overrides,
    });

    it('is the game’s, with the actors the registry found', () => {
        const { game } = setup({
            behaviours: [bombReaction()],
            settle: false,
        });

        expect(game.engine).toBeInstanceOf(Engine);
        // The monkey has a body from the start, and no behaviour yet.
        expect(game.engine.actors()).toEqual(['drone', 'monkey']);
        expect(game.engine.clock.now()).toBe(0);
    });

    it('runs an attached actor on the events of the world, on the game clock', () => {
        const { game, run, names, browser } = setup({
            behaviours: [bombReaction()],
        });
        const started = vi.fn();
        game.events.on('behaviour.started', started);
        game.engine.attach('drone', new FakeMotor());

        game.bomb({ x: 500, y: 330 });
        expect(started).toHaveBeenCalledTimes(1);
        run(10);
        expect(browser.pending).toBe(true);
        run();

        expect(names('bomb.exploded')).toHaveLength(1);
        expect(game.engine.brain('drone')?.snapshot().body).toBeUndefined();
        expect(game.engine.clock.now()).toBeGreaterThan(500);
    });

    it('starts an ambient behaviour after the idle time on a page at rest', () => {
        const { game, run, browser } = setup({
            behaviours: [bombReaction({ kind: 'ambient', triggers: [] })],
            settle: false,
        });
        const started = vi.fn();
        game.events.on('behaviour.started', started);
        game.engine.attach('drone', new FakeMotor());
        game.events.emit('gravity.changed', { zero: false });
        run();
        expect(browser.pending).toBe(false);
        expect(started).not.toHaveBeenCalled();

        browser.fireTimeout();

        expect(started).toHaveBeenCalledTimes(1);
        expect(browser.pending).toBe(true);
    });

    it('sleeps through a behaviour’s wait, which is a game timer, and wakes for it', () => {
        const { game, run, browser } = setup({
            behaviours: [
                bombReaction({
                    triggers: ['gravity.changed'],
                    *run(): Run {
                        yield wait(5000);
                    },
                }),
            ],
        });
        game.engine.attach('drone', new FakeMotor());

        game.events.emit('gravity.changed', { zero: false });
        run(200);
        expect(game.engine.busy).toBe(true);
        expect(browser.pending).toBe(false);

        browser.fireTimeout();
        run();
        expect(game.engine.busy).toBe(false);
    });

    it('lets the loop sleep through the smoke pose', () => {
        const { game, browser } = setup({
            settle: false,
            behaviours: [{ ...smoke, id: 'monkey/smoke' }],
        });
        browser.frame(16);
        browser.fireTimeout();
        // The timer woke the loop; its next frame sees nothing moving and lets it sleep again.
        browser.frame(5100);

        expect(game.engine.busy).toBe(true);
        expect(browser.pending).toBe(false);
    });

    it('wakes a sleeping loop on any event, so a behaviour can start', () => {
        const { game, run, browser } = setup();
        run();
        expect(browser.pending).toBe(false);

        game.events.emit('gravity.changed', { zero: false });

        expect(browser.pending).toBe(true);
    });

    it('reads the reduced motion preference as a field of the context', () => {
        const canStart = vi.fn(() => false);
        for (const reducedMotion of [true, false]) {
            const { game } = setup({
                behaviours: [bombReaction({ canStart })],
                reducedMotion,
            });
            game.engine.attach('drone', new FakeMotor());
            canStart.mockClear();

            game.events.emit('bomb.placed', { id: 1, at: { x: 0, y: 0 } });

            expect(canStart).toHaveBeenCalledWith(
                expect.objectContaining({ reducedMotion }),
            );
        }
    });

    it('tells the behaviours the page’s width and where the monkey stands', () => {
        const canStart = vi.fn(() => false);
        const { game } = setup({
            behaviours: [bombReaction({ canStart })],
            width: 900,
        });
        game.engine.attach('drone', new FakeMotor());
        canStart.mockClear();

        game.events.emit('bomb.placed', { id: 1, at: { x: 0, y: 0 } });

        expect(canStart).toHaveBeenCalledWith(
            expect.objectContaining({
                pageWidth: 900,
                monkeyX: expect.closeTo(64, 0) as number,
            }),
        );
    });

    it('gives an actor that speaks the lines of the page', () => {
        const { game } = setup({
            behaviours: [
                bombReaction({
                    kind: 'line',
                    lines: ['run'],
                    *run(_, act): Run {
                        act.say('run');
                        yield wait(1);
                    },
                }),
            ],
            lines: { locale: 'fr', pools: { run: ['Sauve qui peut !'] } },
        });
        const said = vi.fn();
        game.events.on('line.said', said);
        game.engine.attach('drone', new FakeMotor(), { speaks: true });

        game.events.emit('bomb.placed', { id: 1, at: { x: 0, y: 0 } });

        expect(said).toHaveBeenCalledExactlyOnceWith(
            { actor: 'drone', key: 'run', text: 'Sauve qui peut !' },
            'game',
        );
    });

    it('reports a behaviour that fails, and goes on', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {
            // The report is the test's subject.
        });
        const failure = new Error('boom');
        const { game } = setup({
            behaviours: [
                bombReaction({
                    // eslint-disable-next-line require-yield
                    *run(): Run {
                        throw failure;
                    },
                }),
            ],
        });
        game.engine.attach('drone', new FakeMotor());
        const ended = vi.fn();
        game.events.on('behaviour.ended', ended);

        game.events.emit('bomb.placed', { id: 1, at: { x: 0, y: 0 } });

        expect(error).toHaveBeenCalledExactlyOnceWith(
            'The behaviour engine failed in drone/flee.',
            failure,
        );
        expect(ended).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                actor: 'drone',
                id: 'drone/flee',
                by: 'failed',
            }),
            'game',
        );
    });

    it('stops with the game', () => {
        const { game } = setup({ behaviours: [bombReaction()] });
        const started = vi.fn();
        game.events.on('behaviour.started', started);
        game.engine.attach('drone', new FakeMotor());

        game.stop();
        game.events.emit('bomb.placed', { id: 1, at: { x: 0, y: 0 } });

        expect(started).not.toHaveBeenCalled();
    });
});

describe('the monkey', () => {
    // The Motor the engine holds takes requests of any actor: this one's are the monkey's.
    const monkeyMotor = (game: Game): Motor<MonkeyRequest> | undefined =>
        game.engine.motor('monkey');
    const monkey = (): SVGSVGElement => {
        const found = document.querySelector<SVGSVGElement>('svg.monkey');
        if (!found) {
            throw new Error('No monkey on the page.');
        }
        return found;
    };

    it('is not on the page until the game starts', () => {
        document.body.innerHTML = '<div id="scene"><main></main></div>';

        expect(document.querySelector('.monkey')).toBeNull();
        expect(document.querySelector('.bubble')).toBeNull();
    });

    it('stands on the ground in the scene, hidden from assistive technology', () => {
        const { get } = setup({ settle: false });

        expect(monkey().parentElement).toBe(get('ground').parentElement);
        expect(monkey().getAttribute('aria-hidden')).toBe('true');
        expect(monkey().dataset.pose).toBe('stand');
        // 64 px from the left, his centre 35 px above the ground at 800.
        expect(monkey().style.transform).toBe(
            'translate(36.0px, 729.0px) rotate(0.000rad)',
        );
    });

    it('stands on the body of the page when it has no ground strip', () => {
        document.body.innerHTML = '<main><p data-physics="block">x</p></main>';
        const game = startGame(select('main'), {
            behaviours: [],
            lines: { locale: 'en', pools: {} },
            frameEnvironment: new FakeBrowser(),
        });
        games.push(game);

        expect(monkey().parentElement).toBe(document.body);
    });

    it('has a Motor on the game’s engine, and a voice', () => {
        const { game, get } = setup();

        expect(game.engine.brain('monkey')).toBeDefined();
        expect(game.engine.motor('monkey')).toBeDefined();
        game.events.emit('line.said', {
            actor: 'monkey',
            key: 'k',
            text: 'Salut',
        });

        expect(
            get('ground').parentElement?.querySelector('.bubble')?.textContent,
        ).toBe('Salut');
    });

    it('speaks the lines of the page through his Brain', () => {
        const say: Behaviour = {
            id: 'monkey/greet',
            actor: 'monkey',
            kind: 'line',
            priority: 0,
            triggers: ['bomb.placed'],
            lines: ['hello'],
            canStart: () => true,
            *run(_, act): Run {
                act.say('hello');
                yield wait(1);
            },
        };
        const { game, get } = setup({
            behaviours: [say],
            lines: { locale: 'en', pools: { hello: ['Hello there'] } },
        });

        game.events.emit('bomb.placed', { id: 1, at: { x: 0, y: 0 } });

        expect(
            get('ground').parentElement?.querySelector('.bubble')?.textContent,
        ).toBe('Hello there');
    });

    it('takes part in the engine whatever the registry found', () => {
        const { game } = setup();

        expect(game.engine.actors()).toEqual(['monkey']);
    });

    it('walks where the Motor is asked to, which wakes the loop, and lets it sleep after', () => {
        const { game, browser, run } = setup();
        const outcomes: string[] = [];
        expect(browser.pending).toBe(false);

        monkeyMotor(game)?.perform(
            { type: 'walk', x: 400 },
            (outcome) => outcomes.push(outcome),
            'body',
        );
        expect(browser.pending).toBe(true);
        run();

        expect(outcomes).toEqual(['done']);
        expect(monkey().dataset.walking).toBeUndefined();
        const [, x] = /translate\(([\d.-]+)px/.exec(
            monkey().style.transform,
        ) ?? [undefined, '0'];
        expect(Math.abs(Number(x) + 28 - 400)).toBeLessThanOrEqual(10);
        expect(browser.pending).toBe(false);
    });

    it('steps while he walks, and faces the way he goes', () => {
        const { game, run } = setup();

        monkeyMotor(game)?.perform(
            { type: 'walk', x: 400 },
            () => undefined,
            'body',
        );
        run(10);

        expect(monkey().dataset.walking).toBeDefined();
        expect(monkey().dataset.facing).toBe('right');
    });

    it('is taken with the mouse like a piece, and thrown', () => {
        const { names, browser, run, pointer } = setup();

        pointer(monkey(), 'pointerdown', 64, 765, 0);
        expect(names('monkey.grabbed')).toEqual([]);
        pointer(window, 'pointermove', 80, 700, 8);
        pointer(window, 'pointermove', 200, 500, 16);

        expect(names('monkey.grabbed')).toEqual([{ at: { x: 64, y: 765 } }]);
        run(30);
        expect(monkey().dataset.state).toBe('held');

        pointer(window, 'pointerup', 200, 500, 16);
        expect(names('monkey.thrown')).toHaveLength(1);
        run(1);
        expect(monkey().dataset.state).toBe('free');
        run();

        expect(browser.pending).toBe(false);
        expect(names('monkey.landed').length).toBeGreaterThan(0);
        expect(monkey().dataset.pose).toBe('stand');
    });

    it('tumbles in the air when thrown', () => {
        const { run, pointer } = setup();
        pointer(monkey(), 'pointerdown', 64, 765, 0);
        pointer(window, 'pointermove', 80, 700, 8);
        pointer(window, 'pointermove', 400, 400, 16);
        pointer(window, 'pointerup', 400, 400, 16);

        run(8);

        expect(monkey().dataset.pose).toBe('tumble');
    });

    it('is put down when let go gently', () => {
        const { names, pointer } = setup();

        pointer(monkey(), 'pointerdown', 64, 765, 0);
        pointer(window, 'pointermove', 70, 760, 8);
        pointer(window, 'pointerup', 70, 760, 400);

        expect(names('monkey.dropped')).toHaveLength(1);
    });

    it('is not taken by a click that does not move', () => {
        const { names, pointer, browser } = setup();

        pointer(monkey(), 'pointerdown', 64, 765, 0);
        pointer(window, 'pointerup', 64, 765, 40);

        expect(names('monkey.grabbed')).toEqual([]);
        expect(browser.requested).toBe(0);
    });

    it('is the only thing a press on him takes, not the piece under the pointer', () => {
        const { names, pointer } = setup();

        pointer(monkey(), 'pointerdown', 500, 300, 0);
        pointer(window, 'pointermove', 600, 300, 8);

        expect(names('item.grabbed')).toEqual([]);
        expect(names('monkey.grabbed')).toHaveLength(1);
    });

    it('keeps his place when the page is measured again, within the new walls', () => {
        const s = setup();
        monkeyMotor(s.game)?.perform(
            { type: 'walk', x: 400 },
            () => undefined,
            'body',
        );
        s.run();
        const at = (): number[] =>
            [
                ...monkey().style.transform.matchAll(
                    /translate\(([\d.-]+)px, ([\d.-]+)px/g,
                ),
            ].flatMap(([, x, y]) => [Number(x), Number(y)]);
        const before = at();

        s.size.width = 700;
        window.dispatchEvent(new Event('resize'));
        s.run();

        expect(at()[0]).toBeCloseTo(before[0] ?? 0, 0);
        expect(at()[1]).toBeCloseTo(before[1] ?? 0, 0);
        expect(document.querySelectorAll('svg.monkey')).toHaveLength(1);
    });

    it('is let go of when the page is measured again', () => {
        const s = setup();
        s.pointer(monkey(), 'pointerdown', 64, 765, 0);
        s.pointer(window, 'pointermove', 100, 700, 8);
        s.run(2);

        s.size.width = 700;
        window.dispatchEvent(new Event('resize'));
        s.run();

        expect(s.names('monkey.dropped')).toHaveLength(1);
        expect(monkey().dataset.state).toBe('free');
    });

    it('looks at the pointer', () => {
        const { pointer } = setup({ settle: false });

        pointer(window, 'pointermove', 900, 761);

        expect(
            [...monkey().querySelectorAll('.pupil')].map((pupil) =>
                pupil.getAttribute('transform'),
            ),
        ).toEqual(['translate(3.0 0.0)', 'translate(3.0 0.0)']);
    });

    it('does not follow the pointer with his eyes under reduced motion', () => {
        const { pointer } = setup({ reducedMotion: true });

        pointer(window, 'pointermove', 900, 761);

        expect(
            monkey().querySelector('.pupil')?.hasAttribute('transform'),
        ).toBe(false);
    });

    it('goes when the game stops, picture and bubble, and nothing listens', () => {
        const { game, get } = setup();
        const scene = get('ground').parentElement;

        game.stop();

        expect(document.querySelector('.monkey')).toBeNull();
        expect(scene?.querySelector('.bubble')).toBeNull();
        expect(game.engine.motor('monkey')).toBeUndefined();
    });

    it('keeps a piece he took with him, which the page can restore', () => {
        const { game, get, run, pointer } = setup();
        pointer(get('block'), 'pointerdown', 500, 300, 0);
        pointer(window, 'pointermove', 520, 300, 8);
        pointer(window, 'pointerup', 520, 300, 400);
        run();
        const outcomes: string[] = [];
        const motor = monkeyMotor(game);

        motor?.perform(
            { type: 'carry', piece: 0 },
            (outcome) => outcomes.push(outcome),
            'body',
        );
        run();
        motor?.perform(
            { type: 'place', piece: 0 },
            (outcome) => outcomes.push(outcome),
            'body',
        );
        run();

        expect(outcomes).toEqual(['done', 'done']);
        expect(get('block').dataset.state).toBe('pinned');
        expect(monkey().dataset.pose).toBe('stand');
    });
});
