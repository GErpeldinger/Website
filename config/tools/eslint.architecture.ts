import type { Linter } from 'eslint';

// The rules that keep the game layer's modules apart (docs/architecture.md). The DOM ban is not
// here: tsconfig.game.json has no DOM lib, so the compiler enforces it. These rules need no type
// information, so tests/eslint/architecture.ts can run them on files that don't exist.
//
// Known limit: an import is matched by its text, not resolved against the importing file. It only
// matters if a file is named after another layer.

const GAME = 'assets/game';
const TS = '**/*.{ts,mts,cts,tsx}';

// Only the frame driver touches the browser's loop and clock.
const timers = [
    'setTimeout',
    'setInterval',
    'requestAnimationFrame',
    'queueMicrotask',
    'performance',
    'Date',
];
// A reference through the global object is the same call.
const globalObjects = ['window', 'globalThis', 'self'];

const timeMessage =
    'Time goes through the game clock; only the frame driver reads the browser.';

const dynamicImport = {
    selector: 'ImportExpression',
    message: 'Import statically: dynamic imports skip the boundary rules.',
};

// A game module is imported from another folder: the folder comes right after the `../`.
const gameModule = (names: string[]): string =>
    `^(\\.\\./)+(${names.join('|')})(/|$)|/game/(${names.join('|')})(/|$)`;

interface Restriction {
    patterns?: { regex: string; message: string }[];
    matterJs?: boolean;
}

const matterJs = {
    regex: '^matter-js(/|$)',
    message: 'The physics engine is reached through the physics module only.',
};

// The Stimulus controllers link the page to the game, never the reverse.
const toTheController = {
    regex: `^(\\.\\./)+controllers(/|$)|/game/controllers(/|$)|^@hotwired/stimulus$`,
    message:
        'The game layer does not know the Stimulus controllers: they call into it.',
};

// no-restricted-imports is one rule per file: each block states everything that applies to it.
const imports = ({
    patterns = [],
    matterJs: restrictMatterJs = true,
}: Restriction = {}): Linter.RulesRecord => ({
    'no-restricted-imports': [
        'error',
        { patterns: restrictMatterJs ? [matterJs, ...patterns] : patterns },
    ],
});

export const architecture: Linter.Config[] = [
    {
        name: 'architecture/matter-js',
        files: [`assets/**/${TS}`],
        rules: {
            ...imports(),
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        'ImportExpression[source.value=/^matter-js(\\/|$)/]',
                    message: matterJs.message,
                },
            ],
        },
    },
    {
        name: 'architecture/time',
        files: [`${GAME}/${TS}`],
        ignores: [`${GAME}/frame/${TS}`],
        rules: {
            'no-restricted-globals': [
                'error',
                ...timers.map((name) => ({ name, message: timeMessage })),
            ],
            'no-restricted-properties': [
                'error',
                ...globalObjects.flatMap((object) =>
                    timers.map((property) => ({
                        object,
                        property,
                        message: timeMessage,
                    })),
                ),
            ],
            'no-restricted-syntax': ['error', dynamicImport],
        },
    },
    {
        name: 'architecture/game',
        files: [`${GAME}/${TS}`],
        ignores: [`${GAME}/physics/${TS}`],
        rules: imports({ patterns: [toTheController] }),
    },
    {
        name: 'architecture/frame',
        files: [`${GAME}/frame/${TS}`],
        rules: { 'no-restricted-syntax': ['error', dynamicImport] },
    },
    {
        name: 'architecture/physics',
        files: [`${GAME}/physics/${TS}`],
        rules: imports({ patterns: [toTheController], matterJs: false }),
    },
    {
        name: 'architecture/leaves',
        files: [`${GAME}/clock/${TS}`, `${GAME}/events/${TS}`],
        rules: imports({
            patterns: [
                {
                    regex: '^\\.\\./|/game/|^@hotwired/stimulus$',
                    message:
                        'The clock and the events bus import no other game module, and not Stimulus.',
                },
            ],
        }),
    },
    {
        name: 'architecture/brain',
        files: [`${GAME}/{brain,activities,ports}/${TS}`],
        rules: imports({
            patterns: [
                toTheController,
                {
                    regex: gameModule([
                        'physics',
                        'look',
                        'motor',
                        'voice',
                        'frame',
                    ]),
                    message:
                        'The Brain, the activities and the ports reach the Motor through its port, say lines through the events bus and never touch the frame driver.',
                },
            ],
        }),
    },
];
