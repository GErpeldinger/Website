import type { Linter, Rule } from 'eslint';

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

// An eager glob is static imports in disguise: one file reads the behaviours folder with it, and
// the pattern there is the only place a boundary rule cannot see.
const glob = {
    selector:
        'CallExpression[callee.type="MemberExpression"][callee.object.type="MetaProperty"][callee.property.name="glob"]',
    message:
        'Only registry/behaviours.ts calls import.meta.glob: its pattern skips the boundary rules.',
};

// A game module is imported from another folder: the folder comes right after the `../`.
const gameModule = (names: string[]): string =>
    `^(\\.\\./)+(${names.join('|')})(/|$)|/game/(${names.join('|')})(/|$)`;

// The development panel is loaded by the Stimulus controller behind `import.meta.env.DEV`, so that
// it never reaches the production bundle: no other game module may import it.
const toTheDirector = {
    regex: '^(\\.{1,2}/)+director(/|$)|/game/director(/|$)',
    message:
        'Only the Stimulus controller loads the director panel, in development builds: a game module importing it would put it in the production bundle.',
};

// A listener the game attaches is detached with the game: it passes the `signal` of an
// AbortController. Calls are matched by the method's name, on whatever it is called.
const listenerSignal: Rule.RuleModule = {
    meta: {
        type: 'problem',
        schema: [],
        messages: {
            missing:
                'Attach the listener with `{ signal }` from an AbortController, so stopping the game detaches it.',
        },
    },
    create: (context): Rule.RuleListener => ({
        CallExpression(node): void {
            const { callee } = node;
            // `addEventListener(...)` alone is the window's.
            const isListener =
                callee.type === 'Identifier'
                    ? callee.name === 'addEventListener'
                    : callee.type === 'MemberExpression' &&
                      (callee.computed
                          ? callee.property.type === 'Literal' &&
                            callee.property.value === 'addEventListener'
                          : callee.property.type === 'Identifier' &&
                            callee.property.name === 'addEventListener');
            if (!isListener) {
                return;
            }
            const options = node.arguments[2];
            const hasSignal =
                options?.type === 'ObjectExpression' &&
                options.properties.some(
                    (property) =>
                        property.type === 'Property' &&
                        !property.computed &&
                        property.key.type === 'Identifier' &&
                        property.key.name === 'signal',
                );
            if (!hasSignal) {
                context.report({ node, messageId: 'missing' });
            }
        },
    }),
};

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
        },
    },
    {
        name: 'architecture/syntax',
        files: [`${GAME}/${TS}`],
        ignores: [`${GAME}/registry/${TS}`],
        rules: { 'no-restricted-syntax': ['error', dynamicImport, glob] },
    },
    {
        name: 'architecture/registry',
        files: [`${GAME}/registry/${TS}`],
        rules: { 'no-restricted-syntax': ['error', dynamicImport] },
    },
    {
        name: 'architecture/game',
        files: [`${GAME}/${TS}`],
        ignores: [`${GAME}/physics/${TS}`, `${GAME}/director/${TS}`],
        rules: imports({ patterns: [toTheController, toTheDirector] }),
    },
    {
        name: 'architecture/director',
        files: [`${GAME}/director/${TS}`],
        rules: imports({ patterns: [toTheController] }),
    },
    {
        name: 'architecture/listeners',
        files: [`${GAME}/${TS}`],
        plugins: {
            architecture: { rules: { 'listener-signal': listenerSignal } },
        },
        rules: { 'architecture/listener-signal': 'error' },
    },
    {
        name: 'architecture/physics',
        files: [`${GAME}/physics/${TS}`],
        rules: imports({
            patterns: [toTheController, toTheDirector],
            matterJs: false,
        }),
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
        files: [`${GAME}/{brain,activities,ports,lines}/${TS}`],
        rules: imports({
            patterns: [
                toTheController,
                toTheDirector,
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
