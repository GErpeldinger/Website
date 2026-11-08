<?php

declare(strict_types=1);

use App\Game\LineBook;
use Symfony\Component\Translation\Loader\ArrayLoader;
use Symfony\Component\Translation\Translator;

covers(LineBook::class);

/**
 * @param array<array-key, string> $french
 */
function bookWith(array $french, string $domain = 'lines+intl-icu'): LineBook
{
    $translator = new Translator('fr');
    $translator->addLoader('array', new ArrayLoader());
    $translator->addResource('array', $french, 'fr', $domain);
    $translator->addResource('array', [
        'grab' => 'Put that back.',
    ], 'en', $domain);

    return new LineBook($translator);
}

it('groups the variants of a list under their key, in order', function (): void {
    $book = bookWith([
        'grab.0' => 'Pose ça.',
        'grab.1' => 'Hé !',
        'grab.2' => 'Doucement.',
        'hurt' => 'Aïe !',
        'monkey.sneeze.0' => 'Atchoum !',
    ]);

    expect($book->forLocale('fr')['pools'])->toEqual(new ArrayObject([
        'grab' => ['Pose ça.', 'Hé !', 'Doucement.'],
        'hurt' => ['Aïe !'],
        'monkey.sneeze' => ['Atchoum !'],
    ]));
});

it('keeps a key whose name ends in digits inside the name', function (): void {
    $pools = bookWith([
        'wave2' => 'Hop',
        'a.1.b' => 'x',
    ])->forLocale('fr')['pools'];

    expect($pools)->toEqual(new ArrayObject([
        'wave2' => ['Hop'],
        'a.1.b' => ['x'],
    ]));
});

it('takes a key that is a number for a key like any other', function (): void {
    // PHP turns a numeric key of an array into an integer.
    $pools = bookWith([
        '404' => 'Introuvable',
    ])->forLocale('fr')['pools'];

    expect($pools)->toEqual(new ArrayObject([
        '404' => ['Introuvable'],
    ]));
});

it('says which language the lines are in, and reads that language only', function (): void {
    $book = bookWith([
        'hurt' => 'Aïe !',
    ]);

    expect($book->forLocale('fr')['locale'])->toBe('fr')
        ->and($book->forLocale('en'))->toEqual([
            'locale' => 'en',
            'pools' => new ArrayObject([
                'grab' => ['Put that back.'],
            ]),
        ]);
});

it('reads the lines of the plain domain too', function (): void {
    $pools = bookWith([
        'hurt' => 'Aïe !',
    ], 'lines')->forLocale('fr')['pools'];

    expect($pools)->toEqual(new ArrayObject([
        'hurt' => ['Aïe !'],
    ]));
});

it('keeps the ICU messages as they are', function (): void {
    $message = '{n, plural, one {# pièce} other {# pièces}}';

    expect(bookWith([
        'count' => $message,
    ])->forLocale('fr')['pools'])->toEqual(new ArrayObject([
        'count' => [$message],
    ]));
});

it('has no pool when there is no line, as an empty object', function (): void {
    $book = bookWith([], 'messages');

    expect(json_encode($book->forLocale('fr'), JSON_THROW_ON_ERROR))->toBe('{"locale":"fr","pools":{}}');
});
