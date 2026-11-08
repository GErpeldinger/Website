<?php

declare(strict_types=1);

use App\Game\LineBook;
use App\Twig\GameExtension;
use Symfony\Component\Translation\Loader\ArrayLoader;
use Symfony\Component\Translation\Translator;
use Twig\Attribute\AsTwigFunction;

covers(GameExtension::class);

function extension(): GameExtension
{
    $translator = new Translator('fr');
    $translator->addLoader('array', new ArrayLoader());
    $translator->addResource('array', [
        'grab.0' => 'Pose ça.',
        'grab.1' => 'Hé !',
    ], 'fr', 'lines+intl-icu');

    return new GameExtension(new LineBook($translator));
}

it('offers game_lines to the templates', function (): void {
    $attributes = new ReflectionMethod(GameExtension::class, 'gameLines')->getAttributes(AsTwigFunction::class);

    expect($attributes)->toHaveCount(1)
        ->and($attributes[0]->newInstance()->name)->toBe('game_lines');
});

it('gives the lines of a language as JSON: its locale and its pools', function (): void {
    expect(extension()->gameLines('fr'))->toBe('{"locale":"fr","pools":{"grab":["Pose ça.","Hé !"]}}');
});
