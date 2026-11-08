<?php

declare(strict_types=1);

use TwigStan\Config\TwigStanConfig;
use TwigStan\Error\IgnoreError;

$root = dirname(__DIR__, 2);

return TwigStanConfig::configure($root)
    ->reportUnmatchedIgnoredErrors(true)
    // Not under .cache/: kept between runs, its PHPStan result cache loses the dead code detector's
    // files and fails the next run ("DCD cache file not found").
    ->tempDirectory($root . '/var/twigstan')
    ->phpstanBinPath($root . '/vendor/bin/phpstan')
    ->phpstanConfigurationFile(__DIR__ . '/twigstan.neon')
    ->twigEnvironmentLoader(__DIR__ . '/twigstan-loader.php')
    ->twigPaths($root . '/templates')
    ->phpPaths($root . '/src')
    // The dead code detector, loaded with every PHPStan extension, reads the members Twig
    // generates in each compiled template as unused: Twig calls them by reflection.
    // Same for the Generator: a compiled template yields its output, and any function that can
    // throw a RuntimeError (url(), path()) is then reported.
    ->ignoreErrors(
        IgnoreError::identifier('shipmonk.checkedExceptionInYieldingMethod'),
        IgnoreError::identifier('shipmonk.deadMethod'),
        IgnoreError::identifier('shipmonk.deadProperty.neverRead'),
    )
    ->create();
