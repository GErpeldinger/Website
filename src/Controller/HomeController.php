<?php

declare(strict_types=1);

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class HomeController extends AbstractController
{
    // Pest can't map coverage to an attribute, so this mutant would be reported uncovered; the 404 test is what guards it.
    #[Route('/{_locale}/', name: 'home', requirements: [
        '_locale' => '%app.locales_pattern%', // @pest-mutate-ignore: RemoveArrayItem
    ])]
    public function __invoke(): Response
    {
        return $this->render('home.html.twig');
    }
}
