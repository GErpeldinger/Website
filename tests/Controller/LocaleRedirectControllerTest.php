<?php

declare(strict_types=1);

use App\Controller\LocaleRedirectController;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

pest()->extend(WebTestCase::class);

covers(LocaleRedirectController::class);

it('redirects / to the best language', function (string $header, string $locale): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    // Request::create() adds an English Accept-Language of its own: an empty one means none.
    $client->request('GET', '/', server: [
        'HTTP_ACCEPT_LANGUAGE' => $header,
    ]);

    expect($client->getResponse()->getStatusCode())->toBe(302)
        ->and($client->getResponse()->headers->get('Location'))->toEndWith("/{$locale}/");
})->with([
    'French' => ['fr', 'fr'],
    'English' => ['en', 'en'],
    'a regional variant' => ['en-GB', 'en'],
    'a weighted header' => ['de;q=0.9, en;q=0.8, fr;q=0.5', 'en'],
    'the highest weight, whatever the order' => ['fr;q=0.3, en;q=0.9', 'en'],
    'no match' => ['de, es;q=0.5', 'fr'],
    'no header' => ['', 'fr'],
]);

it('varies on Accept-Language', function (): void {
    /** @var KernelBrowser $client */
    $client = static::createClient();
    $client->request('GET', '/');

    expect($client->getResponse()->headers->all('Vary'))->toContain('Accept-Language');
});
