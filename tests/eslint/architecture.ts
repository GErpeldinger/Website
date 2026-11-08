import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { pureModules } from '../../config/tools/game-modules.ts';

// Each architecture rule must be able to fail: a violating file is reported once, by that rule,
// and a compliant one passes. The files are linted from memory, at the paths the rules apply to,
// with the real config.

interface Case {
    name: string;
    path: string;
    code: string;
    // The rule that must report the file once, or undefined when the file must pass.
    rule?: string;
}

const globals = 'no-restricted-globals';
const properties = 'no-restricted-properties';
const importRule = 'no-restricted-imports';
const syntax = 'no-restricted-syntax';
const listener = 'architecture/listener-signal';

const imported = (path: string, from: string, rule?: string): Case => ({
    name: `${from} imported by ${path}`,
    path,
    code: `import { thing } from '${from}';`,
    rule,
});

const used = (path: string, code: string, rule?: string): Case => ({
    name: `\`${code}\` in ${path}`,
    path,
    code,
    rule,
});

const cases: Case[] = [
    // Time goes through the game clock, and only the frame driver reads the browser's.
    ...[
        'motor/walk',
        'voice/lines',
        'look/pose',
        'physics/world',
        'brain/brain',
        'events/bus',
        'clock/clock',
    ].flatMap((file) => [
        used(
            `assets/game/${file}.ts`,
            'setTimeout(() => undefined, 10);',
            globals,
        ),
        used(
            `assets/game/${file}.ts`,
            'export const now = performance.now();',
            globals,
        ),
    ]),
    used(
        'assets/game/voice/lines.ts',
        'setInterval(() => undefined, 10);',
        globals,
    ),
    used(
        'assets/game/look/pose.ts',
        'requestAnimationFrame(() => undefined);',
        globals,
    ),
    used(
        'assets/game/brain/brain.ts',
        'queueMicrotask(() => undefined);',
        globals,
    ),
    used(
        'assets/game/physics/world.ts',
        'window.setTimeout(() => undefined, 10);',
        properties,
    ),
    used(
        'assets/game/physics/world.ts',
        'self.setInterval(() => undefined, 10);',
        properties,
    ),
    used(
        'assets/game/motor/walk.ts',
        'export const now = window.performance.now();',
        properties,
    ),
    used(
        'assets/game/motor/walk.ts',
        'export const now = globalThis.performance.now();',
        properties,
    ),
    used(
        'assets/game/brain/brain.ts',
        'export const now = Date.now();',
        globals,
    ),
    used(
        'assets/game/brain/brain.ts',
        'export const now = new Date();',
        globals,
    ),
    used(
        'assets/game/physics/world.ts',
        'export const now = new Date();',
        globals,
    ),
    used(
        'assets/game/frame/driver.ts',
        'requestAnimationFrame(() => undefined);\nexport const now = performance.now();',
    ),
    used(
        'assets/game/motor/walk.ts',
        'export const now = globalThis.Date.now();',
        properties,
    ),
    used(
        'assets/game/motor/walk.ts',
        'export const now = window.Date.now();',
        properties,
    ),
    used('assets/game/brain/brain.ts', 'export const now = Date();', globals),
    used('assets/game/brain/brain.ts', 'export const { now } = Date;', globals),
    used(
        'assets/game/brain/brain.ts',
        "export const now = Date['now']();",
        globals,
    ),
    used('assets/game/frame/driver.ts', 'export const now = new Date();'),
    used('assets/app.ts', 'setTimeout(() => undefined, 10);'),

    // The Brain, the activities and the ports see no other layer.
    ...['brain/brain', 'activities/climb', 'ports/motor'].flatMap((file) =>
        [
            'physics/world',
            'motor/motor',
            'look/pose',
            'voice/voice',
            'monkey/monkey',
            'frame/driver',
        ].map((layer) =>
            imported(`assets/game/${file}.ts`, `../${layer}`, importRule),
        ),
    ),
    imported(
        'assets/game/brain/choice/pick.ts',
        '../../motor/motor',
        importRule,
    ),
    imported(
        'assets/game/brain/brain.ts',
        '../../game/motor/motor',
        importRule,
    ),
    imported('assets/game/brain/brain.ts', '../ports/motor'),
    imported('assets/game/brain/brain.ts', '../events/bus'),
    imported('assets/game/brain/brain.ts', '../clock/clock'),
    imported('assets/game/brain/brain.ts', '../activities/rebuild'),
    imported('assets/game/ports/index.ts', './motor'),

    // The lines are as pure as the Brain: no other layer.
    ...[
        'physics/world',
        'motor/motor',
        'look/pose',
        'voice/voice',
        'monkey/monkey',
        'frame/driver',
    ].map((layer) =>
        imported('assets/game/lines/speaker.ts', `../${layer}`, importRule),
    ),
    imported('assets/game/lines/speaker.ts', '../clock/clock'),
    imported('assets/game/lines/speaker.ts', './format'),
    used(
        'assets/game/lines/speaker.ts',
        'export const now = Date.now();',
        globals,
    ),

    // Only the registry reads the behaviours folder with a glob.
    ...[
        'assets/game/brain/brain.ts',
        'assets/game/activities/monkey/walk.ts',
        'assets/game/game.ts',
        'assets/game/frame/frame.ts',
        'assets/game/physics/world.ts',
        'assets/game/director/director.ts',
    ].map((path) =>
        used(
            path,
            "export const found = import.meta.glob('../activities/*/*.ts', { eager: true });",
            syntax,
        ),
    ),
    used(
        'assets/game/registry/behaviours.ts',
        "export const found = import.meta.glob('../activities/*/*.ts', { eager: true });",
    ),
    used(
        'assets/app.ts',
        "export const found = import.meta.glob('./controllers/*.ts', { eager: true });",
    ),
    used(
        'assets/game/brain/brain.ts',
        'export const development = import.meta.env.DEV;',
    ),
    used(
        'assets/game/registry/behaviours.ts',
        "export const motor = await import('../motor/motor');",
        syntax,
    ),

    // The director panel is development only: the Stimulus controller loads it, and no game
    // module imports it, or it would reach the production bundle.
    ...[
        ['assets/game/game.ts', './director/director'],
        ['assets/game/game.ts', './director'],
        ['assets/game/brain/brain.ts', '../director/director'],
        ['assets/game/lines/speaker.ts', '../director/panel'],
        ['assets/game/registry/behaviours.ts', '../director/director'],
        ['assets/game/physics/world.ts', '../director/director'],
        ['assets/game/input/input.ts', '../../game/director/director'],
    ].map(([path, from]) => imported(path ?? '', from ?? '', importRule)),
    imported('assets/game/director/director.ts', './samples'),
    imported('assets/game/director/director.ts', '../brain/engine'),
    imported('assets/game/director/director.ts', '../events/event_bus'),
    imported(
        'assets/game/director/director.ts',
        '../../controllers/game_controller',
        importRule,
    ),
    imported(
        'assets/controllers/game_controller.ts',
        '../game/director/director',
    ),
    used(
        'assets/controllers/game_controller.ts',
        "export const director = await import('../game/director/director');",
    ),

    // matter-js stays in the physics module, deep imports and dynamic imports included.
    ...[
        'assets/game/activities/climb.ts',
        'assets/game/motor/motor.ts',
        'assets/game/clock/clock.ts',
        'assets/controllers/game_controller.ts',
        'assets/app.ts',
    ].flatMap((path) => [
        imported(path, 'matter-js', importRule),
        imported(path, 'matter-js/build/matter', importRule),
        used(path, "export const matter = await import('matter-js');", syntax),
    ]),
    imported('assets/game/physics/world.ts', 'matter-js'),
    imported('assets/game/physics/world.ts', 'matter-js/build/matter'),
    imported('assets/game/motor/motor.ts', '../physics/world'),

    // The clock and the events bus import no other game module.
    imported('assets/game/clock/clock.ts', '../events/bus', importRule),
    imported('assets/game/clock/clock.ts', '../game', importRule),
    imported(
        'assets/game/clock/clock.ts',
        '../../game/physics/world',
        importRule,
    ),
    imported('assets/game/events/bus.ts', '../ports/motor', importRule),
    imported('assets/game/events/bus.ts', '../brain/brain', importRule),
    imported('assets/game/events/bus.ts', '../clock/clock', importRule),
    imported('assets/game/events/bus.ts', './payloads'),

    // The game never imports the Stimulus controllers.
    ...(
        [
            ['assets/game/motor/motor.ts', '../../controllers/game_controller'],
            ['assets/game/ports/motor.ts', '../../controllers/game_controller'],
            ['assets/game/brain/brain.ts', '../../controllers/game_controller'],
            ['assets/game/events/bus.ts', '../../controllers/game_controller'],
            ['assets/game/clock/clock.ts', '../../controllers/game_controller'],
            [
                'assets/game/physics/world.ts',
                '../../controllers/game_controller',
            ],
            [
                'assets/game/frame/driver.ts',
                '../../controllers/game_controller',
            ],
            ['assets/game/game.ts', '../controllers/game_controller'],
            ['assets/game/voice/voice.ts', '@hotwired/stimulus'],
        ] satisfies [string, string][]
    ).map(([path, from]) => imported(path, from, importRule)),
    imported('assets/controllers/game_controller.ts', '../game/brain/brain'),

    // A dynamic import skips the import rules.
    ...['brain/brain', 'motor/motor', 'physics/world', 'frame/driver'].map(
        (file) =>
            used(
                `assets/game/${file}.ts`,
                "export const motor = await import('../motor/motor');",
                syntax,
            ),
    ),

    // Listeners are attached with the signal of an AbortController.
    ...[
        "window.addEventListener('pointermove', () => undefined);",
        "document.addEventListener('visibilitychange', () => undefined, { passive: true });",
        "root.addEventListener('click', () => undefined, true);",
        "root.addEventListener('click', () => undefined, options);",
        "root.addEventListener('click', () => undefined, { ...options });",
        "root['addEventListener']('click', () => undefined);",
        "root.addEventListener('click', () => undefined, { ['signal']: abort.signal });",
        'element.addEventListener(name, () => undefined, {});',
        "addEventListener('click', () => undefined);",
        "addEventListener('click', () => undefined, { passive: true });",
    ].map((code) => used('assets/game/input/input.ts', code, listener)),
    ...[
        "window.addEventListener('pointermove', () => undefined, { signal });",
        "root.addEventListener('click', () => undefined, { capture: true, signal });",
        "root.addEventListener('click', () => undefined, { signal: abort.signal, passive: false });",
        "root['addEventListener']('click', () => undefined, { signal });",
        "events.on('item.freed', () => undefined);",
        "root.removeEventListener('click', () => undefined);",
        "addEventListener('click', () => undefined, { signal });",
        "root[name]('click', () => undefined);",
    ].map((code) => used('assets/game/frame/frame.ts', code)),
    ...[
        'assets/game/clock/clock.ts',
        'assets/game/brain/brain.ts',
        'assets/game/physics/world.ts',
    ].map((path) =>
        used(
            path,
            "root.addEventListener('click', () => undefined);",
            listener,
        ),
    ),
    used(
        'assets/controllers/game_controller.ts',
        "root.addEventListener('click', () => undefined);",
    ),
    used(
        'assets/game/input/input.mts',
        "root.addEventListener('click', () => undefined);",
        listener,
    ),

    // The rules apply to every TypeScript extension.
    used(
        'assets/game/brain/brain.mts',
        'setTimeout(() => undefined, 10);',
        globals,
    ),
];

const eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: 'config/tools/eslint.config.ts',
    // The files don't exist, so the type-aware rules have nothing to read.
    overrideConfig: [
        tseslint.configs.disableTypeChecked,
        { languageOptions: { parserOptions: { project: null } } },
    ],
});

const architectureRules = new Set([
    globals,
    properties,
    importRule,
    syntax,
    listener,
]);
const failures: string[] = [];

for (const { name, path, code, rule } of cases) {
    const [result] = await eslint.lintText(code, { filePath: path });
    const reported = (result?.messages ?? [])
        .map((message) => message.ruleId ?? 'parse error')
        .filter((id) => architectureRules.has(id) || id === 'parse error');
    const expected = rule === undefined ? [] : [rule];

    try {
        assert.deepEqual(reported, expected);
    } catch {
        failures.push(
            `${name} (${path}): expected [${expected.join()}], got [${reported.join()}]`,
        );
    }
}

const tsc = (...args: string[]): { stdout: string } =>
    spawnSync('node_modules/.bin/tsc', args, { encoding: 'utf8' });

// The DOM ban is the compiler's: tsconfig.game.json has no DOM lib.
const dom = tsc('--project', 'tests/eslint/fixtures/tsconfig.json');

for (const [file, shouldFail] of [
    ['dom-global', true],
    ['dom-type', true],
    ['compliant', false],
    ['pure-modules', false],
] as const) {
    if (dom.stdout.includes(`no-dom/${file}.ts`) !== shouldFail) {
        failures.push(
            `${file}: tsc ${shouldFail ? 'should' : 'should not'} report it\n${dom.stdout}`,
        );
    }
}

// A typo in the include would leave a folder with the DOM lib.
const config = JSON.parse(
    tsc('--showConfig', '--project', 'config/tools/tsconfig.game.json').stdout,
) as {
    include?: string[];
};

const expected = pureModules
    .flatMap((folder) => [
        `assets/game/${folder}`,
        `tests/assets/game/${folder}`,
    ])
    .sort();
const included = (config.include ?? [])
    .map((entry) => entry.replace(/^(\.\.\/)+/, ''))
    .sort();

if (JSON.stringify(included) !== JSON.stringify(expected)) {
    failures.push(
        `tsconfig.game.json includes ${included.join(', ')}, not the pure modules and their tests: ${expected.join(', ')}`,
    );
}

if (failures.length > 0) {
    console.error(`Architecture rules failed:\n${failures.join('\n')}`);
    process.exitCode = 1;
} else {
    console.log(
        `${String(cases.length)} architecture rule cases and the DOM checks pass.`,
    );
}
