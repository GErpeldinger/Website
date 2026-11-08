import { Application, type ControllerConstructor } from '@hotwired/stimulus';
import './styles/app.css';

// Stimulus only links the page to the game code. One controller per file, named after it:
// game_controller.ts is `game`.
const application = Application.start();
const controllers = import.meta.glob<{ default: ControllerConstructor }>(
    './controllers/*_controller.ts',
    {
        eager: true,
    },
);

for (const [path, module] of Object.entries(controllers)) {
    const identifier = path
        .replace('./controllers/', '')
        .replace('_controller.ts', '')
        .replaceAll('_', '-');
    application.register(identifier, module.default);
}
