/// <reference types="node" />
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Behaviour, Run } from '../../../../assets/game/brain/behaviour';
import { reactionBehaviour } from '../../../../assets/game/brain/reaction';
import { registered } from '../../../../assets/game/registry/behaviours';
import { catalogues, emittedEvents, poolsOf, problems } from './consistency';

// The registry, the catalogues and the code must agree. The first block is the gate; the others
// prove it can fail.

describe('the game as it is', () => {
    it('has the lines every registered behaviour says, in French and in English', () => {
        const languages = catalogues();

        expect(Object.keys(languages).sort()).toEqual(['en', 'fr']);
        expect(
            problems({
                behaviours: registered,
                catalogues: languages,
                emitted: emittedEvents(),
            }),
        ).toEqual([]);
    });
});

const say = (
    id: string,
    lines: string[],
    triggers: Behaviour['triggers'],
): Behaviour => ({
    id,
    actor: 'monkey',
    kind: 'activity',
    priority: 1,
    triggers,
    lines,
    canStart: () => true,
    *run(): Run {
        yield { type: 'wait' as const, ms: 1 };
    },
});

const languages = {
    fr: { grab: ['Pose ça.'] },
    en: { grab: ['Put that back.'] },
};

describe('what it catches', () => {
    it('a behaviour that says a line either catalogue lacks', () => {
        expect(
            problems({
                behaviours: [say('monkey/walk', ['grab', 'nope'], [])],
                catalogues: {
                    fr: languages.fr,
                    en: { grab: ['x'], nope: ['x'] },
                },
                emitted: new Set(),
            }),
        ).toEqual([
            'monkey/walk says the line "nope", which the fr catalogue lacks',
        ]);
        expect(
            problems({
                behaviours: [say('monkey/walk', ['nope'], [])],
                catalogues: languages,
                emitted: new Set(),
            }),
        ).toEqual([
            'monkey/walk says the line "nope", which the fr catalogue lacks',
            'monkey/walk says the line "nope", which the en catalogue lacks',
        ]);
    });

    it('a reaction whose line is missing, or whose event nothing emits', () => {
        const reactions = [
            reactionBehaviour(
                { actor: 'monkey', on: 'item.grabbed', line: 'grab' },
                'monkey/comments#0',
            ),
            reactionBehaviour(
                { actor: 'monkey', on: 'item.grabbed', line: 'letter' },
                'monkey/comments#1',
            ),
            reactionBehaviour(
                { actor: 'monkey', on: 'tornado.ended', line: 'grab' },
                'monkey/comments#2',
            ),
        ];

        expect(
            problems({
                behaviours: reactions,
                catalogues: languages,
                emitted: new Set(['item.grabbed']),
            }),
        ).toEqual([
            'monkey/comments#1 says the line "letter", which the fr catalogue lacks',
            'monkey/comments#1 says the line "letter", which the en catalogue lacks',
            'monkey/comments#2 listens to "tornado.ended", which nothing emits',
        ]);
    });

    it('nothing when everything agrees', () => {
        expect(
            problems({
                behaviours: [say('monkey/walk', ['grab'], ['item.freed'])],
                catalogues: languages,
                emitted: new Set(['item.freed']),
            }),
        ).toEqual([]);
        expect(
            problems({ behaviours: [], catalogues: {}, emitted: new Set() }),
        ).toEqual([]);
    });
});

describe('emittedEvents', () => {
    it('finds the events the game emits, whatever the layout of the call', () => {
        const names = emittedEvents();

        expect(names.has('item.freed')).toBe(true);
        expect(names.has('bomb.exploded')).toBe(true);
        // The Brain's own helper.
        expect(names.has('behaviour.started')).toBe(true);
        expect(names.has('line.said')).toBe(true);
        // The dock's, outside the game directory.
        expect(names.has('tool.selected')).toBe(true);
        for (const name of [
            'monkey.grabbed',
            'monkey.dropped',
            'monkey.thrown',
            'monkey.landed',
            'monkey.hit',
        ]) {
            expect(names.has(name), name).toBe(true);
        }
        expect(names.has('monkey.waved')).toBe(false);
    });

    it('reads every .ts file below the folder, and nothing else', () => {
        const directory = mkdtempSync(join(tmpdir(), 'emitted-'));
        mkdirSync(join(directory, 'deep/er'), { recursive: true });
        writeFileSync(join(directory, 'a.ts'), "events.emit('one.a', 1);\n");
        writeFileSync(
            join(directory, 'deep/er/b.ts'),
            "this.#events.emit(\n    'two.b',\n    2,\n);\nthis.#emit('three.c', 3);",
        );
        writeFileSync(join(directory, 'c.d.ts'), "emit('declared.d')");
        writeFileSync(join(directory, 'd.md'), "emit('doc.e')");
        writeFileSync(
            join(directory, 'e.ts'),
            "emit(name, 1); reemit('no.f');",
        );

        expect([...emittedEvents(directory)].sort()).toEqual([
            'one.a',
            'three.c',
            'two.b',
        ]);
    });
});

describe('emittedEvents and what is not an emit', () => {
    it('ignores comments, strings, other names and the development panel', () => {
        const directory = mkdtempSync(join(tmpdir(), 'emitted-'));
        mkdirSync(join(directory, 'director'), { recursive: true });
        mkdirSync(join(directory, 'directors'), { recursive: true });
        writeFileSync(
            join(directory, 'a.ts'),
            [
                "// events.emit('commented.a');",
                "/* this.#emit('commented.b') */",
                'const text = "emit(\'string.c\')";',
                "events.emit('real.d', 1);",
                'emit(`template.e`);',
                'emit(name);',
                "reemit('no.f');",
                'emit(); emit(1);',
            ].join('\n'),
        );
        writeFileSync(
            join(directory, 'director/panel.ts'),
            "events.emit('panel.g');",
        );
        writeFileSync(
            join(directory, 'directors/other.ts'),
            "events.emit('other.h');",
        );

        expect([...emittedEvents(directory)].sort()).toEqual([
            'other.h',
            'real.d',
            'template.e',
        ]);
    });
});

describe('catalogues', () => {
    const read = (yaml: string): Record<string, Record<string, string[]>> => {
        const directory = mkdtempSync(join(tmpdir(), 'lines-'));
        writeFileSync(join(directory, 'lines+intl-icu.en.yaml'), yaml);
        writeFileSync(join(directory, 'messages.fr.yaml'), 'a: b');
        return catalogues(directory);
    };

    it('reads the pools of each language, and only the lines domain', () => {
        expect(
            read('grab:\n  - one\n  - two\nhi: Hello\nmonkey:\n  hurt: [a]\n'),
        ).toEqual({
            en: { grab: ['one', 'two'], hi: ['Hello'], 'monkey.hurt': ['a'] },
        });
    });

    it('refuses a key that ends in a number unless it is a list item', () => {
        expect(() => read('level:\n  2: x\n')).toThrow(
            'The line key "level.2" ends in a number but is not a list item',
        );
        expect(() => read('"7": x\n')).toThrow('The line key "7"');
        expect(() => read('a:\n  - b: c\n    9: d\n')).toThrow('"a.0.9"');
        expect(read('a:\n  - x\n')).toEqual({ en: { a: ['x'] } });
        expect(read('level2: x\n')).toEqual({ en: { level2: ['x'] } });
    });
});

describe('poolsOf', () => {
    it('groups the variants of a list under their key, in order', () => {
        const flat = new Map([
            ['hi', 'Salut'],
            ['grab.0', 'a'],
            ['grab.1', 'b'],
            ['monkey.hurt.0', 'c'],
        ]);

        expect(poolsOf(flat)).toEqual({
            hi: ['Salut'],
            grab: ['a', 'b'],
            'monkey.hurt': ['c'],
        });
    });
});
