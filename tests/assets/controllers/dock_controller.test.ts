import { Application } from '@hotwired/stimulus';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DockController from '../../../assets/controllers/dock_controller';

// The handlers of `gravity.changed`, as the game would call them.
const gravityListeners: ((payload: { zero: boolean }) => void)[] = [];
const unsubscribe = vi.fn();
const game = {
    events: {
        emit: vi.fn(),
        on: vi.fn(
            (name: string, listener: (payload: { zero: boolean }) => void) => {
                if (name === 'gravity.changed') {
                    gravityListeners.push(listener);
                }
                return unsubscribe;
            },
        ),
    },
    bomb: vi.fn(),
    tornado: vi.fn(),
    setZeroGravity: vi.fn(),
    rebuild: vi.fn(),
};

let application: Application | undefined;

const markup = `
    <div id="root">
    <p id="scene">The scene</p>
    <nav id="dock" data-controller="dock"
        data-action="game:started@window->dock#start game:stopped@window->dock#stop pointerdown@window->dock#place:capture click@window->dock#swallow:capture keydown@window->dock#escape">
        <button id="grab" type="button" aria-pressed="true" data-pressed="true" data-dock-target="tool" data-dock-tool-param="grab" data-action="dock#select">Grab</button>
        <button id="bomb" type="button" aria-pressed="false" data-dock-target="tool" data-dock-tool-param="bomb" data-action="dock#select">Bomb</button>
        <button id="tornado" type="button" aria-pressed="false" data-dock-target="tool" data-dock-tool-param="tornado" data-action="dock#select">Tornado</button>
        <button id="gravity" type="button" aria-pressed="false" data-pressed="false" data-dock-target="gravity" data-action="dock#gravity">Zero gravity</button>
        <button id="rebuild" type="button" data-action="dock#rebuild">Rebuild</button>
    </nav>
    </div>
    <p id="outside">Not the scene</p>`;

const connect = async (): Promise<void> => {
    document.body.innerHTML = markup;
    application = Application.start();
    application.register('dock', DockController);
    await Promise.resolve();
};

const find = (selector: string): HTMLElement => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
        throw new Error(`No ${selector} in the page.`);
    }
    return element;
};
const dock = (): HTMLElement => find('nav');
const button = (id: string): HTMLElement => find(`#${id}`);
const scene = (): HTMLElement => find('#scene');

const start = (): void => {
    window.dispatchEvent(
        new CustomEvent('game:started', {
            detail: { game, root: find('#root') },
        }),
    );
};

const pressed = (): string[] =>
    ['grab', 'bomb', 'tornado'].filter(
        (id) => button(id).getAttribute('aria-pressed') === 'true',
    );

// A click from a pointer has a detail, one from the keyboard has none.
const click = (id: string, detail = 1): void => {
    button(id).dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, detail }),
    );
};

const press = (target: Element, init: PointerEventInit = {}): PointerEvent => {
    const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 80,
        ...init,
    });
    target.dispatchEvent(event);
    return event;
};

const key = (name: string): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: name }));
};

const scrollTo = (x: number, y: number): void => {
    Object.defineProperty(window, 'scrollX', { configurable: true, value: x });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
};

beforeEach(() => {
    for (const mock of [
        game.events.emit,
        game.events.on,
        unsubscribe,
        game.bomb,
        game.tornado,
        game.setZeroGravity,
        game.rebuild,
    ]) {
        mock.mockClear();
    }
    gravityListeners.length = 0;
    scrollTo(0, 0);
    window.innerWidth = 1000;
    window.innerHeight = 600;
});

afterEach(() => {
    application?.stop();
    application = undefined;
    document.body.innerHTML = '';
    Reflect.deleteProperty(window, 'scrollX');
    Reflect.deleteProperty(window, 'scrollY');
});

it('stays hidden until the game runs, and again when it stops', async () => {
    await connect();
    expect(dock().hasAttribute('data-ready')).toBe(false);

    start();
    expect(dock().getAttribute('data-ready')).toBe('true');

    window.dispatchEvent(new CustomEvent('game:stopped'));
    expect(dock().hasAttribute('data-ready')).toBe(false);
});

it('does nothing before the game runs', async () => {
    await connect();

    click('bomb');
    click('rebuild');
    click('gravity');
    const event = press(scene());
    const clicked = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
    });
    scene().dispatchEvent(clicked);
    key('Escape');

    expect(clicked.defaultPrevented).toBe(false);
    expect(game.events.emit).not.toHaveBeenCalled();
    expect(game.rebuild).not.toHaveBeenCalled();
    expect(game.setZeroGravity).not.toHaveBeenCalled();
    expect(game.bomb).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
});

it('forgets the game when it stops', async () => {
    await connect();
    start();
    window.dispatchEvent(new CustomEvent('game:stopped'));

    click('rebuild');
    click('bomb', 0);

    expect(game.rebuild).not.toHaveBeenCalled();
    expect(game.bomb).not.toHaveBeenCalled();
});

it('selects a tool: one pressed at a time, in aria and in a data attribute', async () => {
    await connect();
    start();

    click('bomb');
    expect(pressed()).toEqual(['bomb']);
    expect(button('bomb').dataset.pressed).toBe('true');
    expect(button('grab').dataset.pressed).toBe('false');
    expect(button('tornado').dataset.pressed).toBe('false');

    click('grab');
    expect(pressed()).toEqual(['grab']);
});

it('tells the game which tool was chosen, only when it changes', async () => {
    await connect();
    start();

    click('grab');
    click('bomb');
    click('bomb');
    click('grab');

    expect(game.events.emit.mock.calls).toEqual([
        ['tool.selected', { tool: 'bomb' }],
        ['tool.selected', { tool: 'grab' }],
    ]);
});

it.each(['bomb', 'tornado'] as const)(
    'places a %s where the scene is pressed',
    async (tool) => {
        await connect();
        start();
        scrollTo(30, 400);
        click(tool);

        const event = press(scene(), { clientX: 120, clientY: 80 });

        expect(game[tool]).toHaveBeenCalledExactlyOnceWith({ x: 150, y: 480 });
        expect(event.defaultPrevented).toBe(true);
    },
);

it('leaves a press alone while Grab is the tool, so the hand can take pieces', async () => {
    await connect();
    start();
    const stray = vi.fn();
    scene().addEventListener('pointerdown', stray);

    const event = press(scene());

    expect(game.bomb).not.toHaveBeenCalled();
    expect(game.tornado).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(stray).toHaveBeenCalledTimes(1);
});

it('keeps a placing press from reaching the hand', async () => {
    await connect();
    start();
    click('bomb');
    const stray = vi.fn();
    scene().addEventListener('pointerdown', stray);

    press(scene());

    expect(stray).not.toHaveBeenCalled();
});

it('ignores a press on the dock itself', async () => {
    await connect();
    start();
    click('bomb');

    const event = press(button('rebuild'));

    expect(game.bomb).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
});

it('ignores a press with another button than the main one', async () => {
    await connect();
    start();
    click('bomb');

    press(scene(), { button: 2 });

    expect(game.bomb).not.toHaveBeenCalled();
});

it('keeps a pointer click on the scene from following a link while placing', async () => {
    await connect();
    start();
    click('bomb');
    const stray = vi.fn();
    scene().addEventListener('click', stray);

    const clicked = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
    });
    scene().dispatchEvent(clicked);

    expect(clicked.defaultPrevented).toBe(true);
    expect(stray).not.toHaveBeenCalled();
});

it.each([
    ['a keyboard click on the scene', 'bomb', 0],
    ['a click with Grab selected', 'grab', 1],
] as const)('lets %s through', async (_, tool, detail) => {
    await connect();
    start();
    click(tool, 1);
    const stray = vi.fn();
    scene().addEventListener('click', stray);

    const clicked = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail,
    });
    scene().dispatchEvent(clicked);

    expect(clicked.defaultPrevented).toBe(false);
    expect(stray).toHaveBeenCalledTimes(1);
});

it('lets a pointer click on the dock through while placing', async () => {
    await connect();
    start();
    click('bomb');
    const stray = vi.fn();
    dock().addEventListener('click', stray);

    click('rebuild');

    expect(stray).toHaveBeenCalledTimes(1);
    expect(game.rebuild).toHaveBeenCalledTimes(1);
});

it('fires a tool picked with the keyboard at the middle of what is on screen', async () => {
    await connect();
    start();
    scrollTo(10, 200);

    click('bomb', 0);
    expect(game.bomb).toHaveBeenCalledExactlyOnceWith({ x: 510, y: 500 });

    click('tornado', 0);
    expect(game.tornado).toHaveBeenCalledExactlyOnceWith({ x: 510, y: 500 });
});

it('fires the keyboard tool again each time it is activated', async () => {
    await connect();
    start();

    click('bomb', 0);
    click('bomb', 0);

    expect(game.bomb).toHaveBeenCalledTimes(2);
});

it('does not fire when Grab is picked with the keyboard, nor when a tool is picked with the pointer', async () => {
    await connect();
    start();

    click('grab', 0);
    click('bomb', 1);
    click('tornado', 1);

    expect(game.bomb).not.toHaveBeenCalled();
    expect(game.tornado).not.toHaveBeenCalled();
});

const changeGravity = (zero: boolean): void => {
    for (const listener of gravityListeners) {
        listener({ zero });
    }
};

it('asks for the opposite of what the button shows, and lets the game show the result', async () => {
    await connect();
    start();

    click('gravity');
    expect(game.setZeroGravity).toHaveBeenLastCalledWith(true);
    expect(button('gravity').getAttribute('aria-pressed')).toBe('false');

    changeGravity(true);
    click('gravity');
    expect(game.setZeroGravity).toHaveBeenLastCalledWith(false);
    expect(game.setZeroGravity).toHaveBeenCalledTimes(2);
});

it('shows the gravity the world has, as after a resize turned it back on', async () => {
    await connect();
    start();

    changeGravity(true);
    expect(button('gravity').getAttribute('aria-pressed')).toBe('true');
    expect(button('gravity').dataset.pressed).toBe('true');

    changeGravity(false);
    expect(button('gravity').getAttribute('aria-pressed')).toBe('false');
    expect(button('gravity').dataset.pressed).toBe('false');
    expect(game.events.on).toHaveBeenCalledWith(
        'gravity.changed',
        expect.any(Function),
    );
});

it('lets go of the old game when it stops: the tool, the gravity, the listener', async () => {
    await connect();
    start();
    click('tornado');
    changeGravity(true);
    game.events.emit.mockClear();

    window.dispatchEvent(new CustomEvent('game:stopped'));

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(pressed()).toEqual(['grab']);
    expect(button('tornado').dataset.pressed).toBe('false');
    expect(button('gravity').getAttribute('aria-pressed')).toBe('false');
    expect(button('gravity').dataset.pressed).toBe('false');
    expect(game.events.emit).not.toHaveBeenCalled();
    press(scene());
    expect(game.tornado).not.toHaveBeenCalled();
});

it('only counts a touch as a placement when a click follows, not for a scroll or a pinch', async () => {
    await connect();
    start();
    scrollTo(30, 400);
    click('bomb');
    const stray = vi.fn();
    scene().addEventListener('pointerdown', stray);

    const down = press(scene(), { pointerType: 'touch' });
    scene().dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    press(scene(), { pointerType: 'touch' });

    expect(game.bomb).not.toHaveBeenCalled();
    expect(down.defaultPrevented).toBe(true);
    expect(stray).not.toHaveBeenCalled();

    scene().dispatchEvent(
        new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            detail: 1,
            clientX: 120,
            clientY: 80,
        }),
    );
    expect(game.bomb).toHaveBeenCalledExactlyOnceWith({ x: 150, y: 480 });

    // The same click again is not a tap.
    scene().dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }),
    );
    expect(game.bomb).toHaveBeenCalledTimes(1);
});

it('never places on a click that no finger pressed, nor one left over from a game that stopped', async () => {
    await connect();
    start();
    click('bomb');
    const tap = (): void => {
        scene().dispatchEvent(
            new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                detail: 1,
            }),
        );
    };

    tap();
    press(scene(), { pointerType: 'touch' });
    window.dispatchEvent(new CustomEvent('game:stopped'));
    start();
    click('bomb');
    tap();

    expect(game.bomb).not.toHaveBeenCalled();
});

it('does not place on the click of a mouse, which placed on the press', async () => {
    await connect();
    start();
    click('bomb');

    press(scene(), { pointerType: 'touch' });
    press(scene(), { pointerType: 'mouse' });
    scene().dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }),
    );

    expect(game.bomb).toHaveBeenCalledTimes(1);
});

it('leaves what is outside the scene alone: a press and a click', async () => {
    await connect();
    start();
    click('bomb');
    const outside = find('#outside');
    const clicked = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
    });

    const event = press(outside);
    outside.dispatchEvent(clicked);

    expect(game.bomb).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(clicked.defaultPrevented).toBe(false);
});

it('leaves a ctrl-press alone, which opens the context menu on a Mac', async () => {
    await connect();
    start();
    click('bomb');

    const event = press(scene(), { ctrlKey: true });

    expect(game.bomb).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
});

it('asks the game to rebuild', async () => {
    await connect();
    start();

    click('rebuild');

    expect(game.rebuild).toHaveBeenCalledTimes(1);
});

it('goes back to Grab on Escape, and tells the game', async () => {
    await connect();
    start();
    click('tornado');
    game.events.emit.mockClear();

    key('Escape');

    expect(pressed()).toEqual(['grab']);
    expect(game.events.emit).toHaveBeenCalledExactlyOnceWith('tool.selected', {
        tool: 'grab',
    });
    press(scene());
    expect(game.tornado).not.toHaveBeenCalled();
});

it('ignores Escape when Grab is already the tool, and any other key', async () => {
    await connect();
    start();

    key('Escape');
    expect(game.events.emit).not.toHaveBeenCalled();

    click('bomb');
    game.events.emit.mockClear();
    key('Enter');

    expect(game.events.emit).not.toHaveBeenCalled();
    expect(pressed()).toEqual(['bomb']);
});
