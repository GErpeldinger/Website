export interface TabSpec {
    id: string;
    label: string;
    panel: HTMLElement;
}

// A tab list that follows the ARIA pattern: the arrow keys, Home and End move between the tabs
// (which select on focus), and only the selected one is in the tab order. The first is selected.
export const tabs = (
    items: readonly TabSpec[],
    signal: AbortSignal,
): HTMLElement => {
    const list = document.createElement('div');
    list.setAttribute('role', 'tablist');
    list.dataset.tablist = '';
    const buttons: HTMLButtonElement[] = [];
    const select = (index: number): void => {
        items.forEach(({ panel }, position) => {
            panel.hidden = position !== index;
        });
        buttons.forEach((button, position) => {
            button.setAttribute('aria-selected', String(position === index));
            button.dataset.selected = String(position === index);
            button.tabIndex = position === index ? 0 : -1;
        });
    };
    items.forEach(({ id, label, panel }, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.id = `director-tab-${id}`;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', `director-panel-${id}`);
        panel.id = `director-panel-${id}`;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', button.id);
        button.addEventListener(
            'click',
            () => {
                select(index);
            },
            { signal },
        );
        buttons.push(button);
        list.append(button);
    });
    const target = (key: string, from: number): number | undefined => {
        const last = items.length - 1;
        switch (key) {
            case 'ArrowRight':
                return from === last ? 0 : from + 1;
            case 'ArrowLeft':
                return from === 0 ? last : from - 1;
            case 'Home':
                return 0;
            case 'End':
                return last;
        }
        return undefined;
    };
    list.addEventListener(
        'keydown',
        (event) => {
            const from = buttons.findIndex(
                (button) => button === document.activeElement,
            );
            const to = from < 0 ? undefined : target(event.key, from);
            if (to !== undefined) {
                event.preventDefault();
                select(to);
                buttons[to]?.focus();
            }
        },
        { signal },
    );
    select(0);
    return list;
};
