<?php

declare(strict_types=1);

namespace App\Controller;

use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Generator\UrlGeneratorInterface;

final readonly class LocaleRedirectController
{
    /**
     * @param list<string> $locales the enabled locales, the default one first: it wins when nothing matches
     */
    public function __construct(
        private UrlGeneratorInterface $urlGenerator,
        #[Autowire(param: 'kernel.enabled_locales')]
        private array $locales,
    ) {
    }

    #[Route('/', name: 'root')]
    public function __invoke(Request $request): RedirectResponse
    {
        $response = new RedirectResponse($this->urlGenerator->generate('home', [
            '_locale' => $request->getPreferredLanguage($this->locales),
        ]));
        $response->setVary('Accept-Language');

        return $response;
    }
}
