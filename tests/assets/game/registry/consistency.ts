/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import ts from 'typescript';
import type { Behaviour } from '../../../../assets/game/brain/behaviour';

// Mutation testing runs from a copy of the sources whose strings are instrumented: the scan
// below must read the real files, so the copy's path is cut back to the repository.
const root = join(import.meta.dirname, '../../../..').replace(
    /[/\\]\.cache[/\\]stryker[/\\].*$/u,
    '',
);

// A catalogue as the server sees it: nested keys joined by dots, a list as `.0`, `.1`...
// The server can't tell `level.2: x` from the third variant of `level`, so a key that ends in a
// number is only valid as a list item.
const flatten = (node: unknown, prefix = ''): Map<string, string> => {
    const flat = new Map<string, string>();
    if (typeof node === 'object' && node !== null) {
        for (const [key, value] of Object.entries(node)) {
            const path = prefix === '' ? key : `${prefix}.${key}`;
            if (!Array.isArray(node) && /^\d+$/u.test(key)) {
                throw new Error(
                    `The line key "${path}" ends in a number but is not a list item: name it, or write a list.`,
                );
            }
            for (const [name, text] of flatten(value, path)) {
                flat.set(name, text);
            }
        }
    } else if (prefix !== '') {
        flat.set(prefix, String(node));
    }
    return flat;
};

// The pools of one language: a key with its variants, as the page receives them (the same rule
// as App\Game\LineBook, which groups `grab.0`, `grab.1` under `grab`).
export const poolsOf = (
    flat: Map<string, string>,
): Record<string, string[]> => {
    const pools: Record<string, string[]> = {};
    for (const [key, text] of flat) {
        const pool = key.replace(/\.\d+$/u, '');
        (pools[pool] ??= []).push(text);
    }
    return pools;
};

// The translation catalogues of the lines, by language.
export const catalogues = (
    directory = join(root, 'translations'),
): Record<string, Record<string, string[]>> => {
    const result: Record<string, Record<string, string[]>> = {};
    for (const file of readdirSync(directory)) {
        const locale = /^lines\+intl-icu\.([a-z]+)\.yaml$/u.exec(file)?.[1];
        if (locale !== undefined) {
            result[locale] = poolsOf(
                flatten(load(readFileSync(join(directory, file), 'utf8'))),
            );
        }
    }
    return result;
};

// A call of `emit` or `#emit` with a literal name, wherever it is in the syntax tree: a comment
// or a string that looks like one is not.
const emitted = (source: string): string[] => {
    const names: string[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
            const { expression, arguments: args } = node;
            const callee = ts.isPropertyAccessExpression(expression)
                ? expression.name.text
                : ts.isIdentifier(expression)
                  ? expression.text
                  : undefined;
            const [first] = args;
            if (
                (callee === 'emit' || callee === '#emit') &&
                first !== undefined &&
                ts.isStringLiteralLike(first)
            ) {
                names.push(first.text);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true));
    return names;
};

// The names of the events some code in the game puts on the bus: `emit('name'`, `#emit('name'`.
// The development panel is left out: what it fires is not something the game emits. The page's
// controllers count too: the dock puts `tool.selected` on the bus.
export const emittedEvents = (directory?: string): Set<string> =>
    directory === undefined
        ? new Set([
              ...emittedIn(join(root, 'assets/game')),
              ...emittedIn(join(root, 'assets/controllers')),
          ])
        : emittedIn(directory);

const emittedIn = (directory: string): Set<string> => {
    const names = new Set<string>();
    for (const file of readdirSync(directory, {
        recursive: true,
        encoding: 'utf8',
    })) {
        if (
            file.endsWith('.ts') &&
            !file.endsWith('.d.ts') &&
            !/^director[/\\]/u.test(file)
        ) {
            for (const name of emitted(
                readFileSync(join(directory, file), 'utf8'),
            )) {
                names.add(name);
            }
        }
    }
    return names;
};

export interface World {
    behaviours: readonly Behaviour[];
    catalogues: Record<string, Record<string, string[]>>;
    emitted: ReadonlySet<string>;
}

// What is wrong between the behaviours, the catalogues and the code, one sentence each.
export const problems = ({
    behaviours,
    catalogues: languages,
    emitted,
}: World): string[] => {
    const found: string[] = [];
    for (const { id, lines = [], triggers } of behaviours) {
        for (const key of lines) {
            for (const [locale, pools] of Object.entries(languages)) {
                if (!Object.hasOwn(pools, key)) {
                    found.push(
                        `${id} says the line "${key}", which the ${locale} catalogue lacks`,
                    );
                }
            }
        }
        for (const name of triggers) {
            if (!emitted.has(name)) {
                found.push(`${id} listens to "${name}", which nothing emits`);
            }
        }
    }
    return found;
};
