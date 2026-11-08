<?php

declare(strict_types=1);

namespace App\Twig;

use App\Game\LineBook;
use Twig\Attribute\AsTwigFunction;

/**
 * Hands the game its lines with the page: Twig renders them in the HTML, so there is no second
 * request and no build step, and the page carries its own language only.
 */
final readonly class GameExtension
{
    public function __construct(
        private LineBook $lines,
    ) {
    }

    /**
     * @return string JSON, for an HTML attribute: Twig escapes it
     */
    #[AsTwigFunction(name: 'game_lines')]
    public function gameLines(string $locale): string
    {
        return json_encode($this->lines->forLocale($locale), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    }
}
