import { Application } from '@hotwired/stimulus';
import { afterEach, expect, it } from 'vitest';
import GameController from '../../../assets/controllers/game_controller';

let application: Application | undefined;

afterEach(() => {
    application?.stop();
    application = undefined;
    document.body.innerHTML = '';
});

it('connects to its element and leaves it untouched', async () => {
    document.body.innerHTML = '<main data-controller="game"></main>';
    application = Application.start();
    application.register('game', GameController);

    // Stimulus connects on the next microtask after the registration.
    await Promise.resolve();

    const element = document.querySelector('main');
    expect(element).not.toBeNull();
    expect(
        application.getControllerForElementAndIdentifier(
            element as Element,
            'game',
        ),
    ).toBeInstanceOf(GameController);
    expect(element?.outerHTML).toBe('<main data-controller="game"></main>');
});
