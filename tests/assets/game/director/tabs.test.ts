import { afterEach, describe, expect, it } from 'vitest';
import { tabs } from '../../../../assets/game/director/tabs';

const setup = (): {
    list: HTMLElement;
    buttons: HTMLElement[];
    panels: HTMLElement[];
    abort: AbortController;
} => {
    const panels = ['one', 'two', 'three'].map((text) => {
        const panel = document.createElement('div');
        panel.textContent = text;
        return panel;
    });
    const abort = new AbortController();
    const list = tabs(
        [
            { id: 'a', label: 'Alpha', panel: panels[0] as HTMLElement },
            { id: 'b', label: 'Beta', panel: panels[1] as HTMLElement },
            { id: 'c', label: 'Gamma', panel: panels[2] as HTMLElement },
        ],
        abort.signal,
    );
    document.body.append(list, ...panels);
    return {
        list,
        buttons: [...list.querySelectorAll<HTMLElement>('[role="tab"]')],
        panels,
        abort,
    };
};

const press = (key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
    });
    document.activeElement?.dispatchEvent(event);
    return event;
};

// The ARIA state and the data attribute the style reads must agree.
const selected = (buttons: HTMLElement[]): number[] => {
    const aria = buttons.flatMap((button, index) =>
        button.getAttribute('aria-selected') === 'true' ? [index] : [],
    );
    const data = buttons.flatMap((button, index) =>
        button.dataset.selected === 'true' ? [index] : [],
    );
    expect(data).toEqual(aria);
    return aria;
};

afterEach(() => {
    document.body.innerHTML = '';
});

describe('tabs', () => {
    it('is a tab list of one tab per item, labelled', () => {
        const { list, buttons } = setup();

        expect(list.getAttribute('role')).toBe('tablist');
        expect(list.dataset.tablist).toBe('');
        expect(buttons.map((button) => button.textContent)).toEqual([
            'Alpha',
            'Beta',
            'Gamma',
        ]);
        expect(buttons.map((button) => button.getAttribute('type'))).toEqual([
            'button',
            'button',
            'button',
        ]);
    });

    it('links each tab and its panel both ways', () => {
        const { buttons, panels } = setup();

        expect(buttons.map((button) => button.id)).toEqual([
            'director-tab-a',
            'director-tab-b',
            'director-tab-c',
        ]);
        expect(
            buttons.map((button) => button.getAttribute('aria-controls')),
        ).toEqual(['director-panel-a', 'director-panel-b', 'director-panel-c']);
        expect(panels.map((panel) => panel.id)).toEqual([
            'director-panel-a',
            'director-panel-b',
            'director-panel-c',
        ]);
        expect(panels.map((panel) => panel.getAttribute('role'))).toEqual([
            'tabpanel',
            'tabpanel',
            'tabpanel',
        ]);
        expect(
            panels.map((panel) => panel.getAttribute('aria-labelledby')),
        ).toEqual(['director-tab-a', 'director-tab-b', 'director-tab-c']);
    });

    it('starts on the first tab, the only one in the tab order', () => {
        const { buttons, panels } = setup();

        expect(selected(buttons)).toEqual([0]);
        expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1, -1]);
        expect(panels.map((panel) => panel.hidden)).toEqual([
            false,
            true,
            true,
        ]);
    });

    it('selects a tab when it is pressed', () => {
        const { buttons, panels } = setup();

        buttons[2]?.click();

        expect(selected(buttons)).toEqual([2]);
        expect(buttons.map((button) => button.tabIndex)).toEqual([-1, -1, 0]);
        expect(panels.map((panel) => panel.hidden)).toEqual([
            true,
            true,
            false,
        ]);
    });

    it('moves with the arrow keys, round the ends, and focuses what it selects', () => {
        const { buttons } = setup();
        buttons[0]?.focus();

        const forward = press('ArrowRight');
        expect(selected(buttons)).toEqual([1]);
        expect(document.activeElement).toBe(buttons[1]);
        expect(forward.defaultPrevented).toBe(true);

        press('ArrowRight');
        press('ArrowRight');
        expect(selected(buttons)).toEqual([0]);

        press('ArrowLeft');
        expect(selected(buttons)).toEqual([2]);
        expect(document.activeElement).toBe(buttons[2]);

        press('ArrowLeft');
        expect(selected(buttons)).toEqual([1]);
    });

    it('goes to the first and last tab with Home and End', () => {
        const { buttons } = setup();
        buttons[1]?.focus();

        press('End');
        expect(selected(buttons)).toEqual([2]);

        press('Home');
        expect(selected(buttons)).toEqual([0]);
    });

    it('leaves the other keys alone', () => {
        const { buttons } = setup();
        buttons[0]?.focus();

        const event = press('a');

        expect(event.defaultPrevented).toBe(false);
        expect(selected(buttons)).toEqual([0]);
    });

    it('ignores a key pressed when no tab has the focus', () => {
        const { list, buttons } = setup();
        const event = new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            cancelable: true,
        });

        list.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(selected(buttons)).toEqual([0]);
    });

    it('stops listening once told to', () => {
        const { buttons, abort } = setup();
        buttons[0]?.focus();
        abort.abort();

        buttons[1]?.click();
        press('ArrowRight');

        expect(selected(buttons)).toEqual([0]);
    });
});
