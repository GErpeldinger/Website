<?php

declare(strict_types=1);

use Rector\Config\RectorConfig;

/** @var array{paths: list<string>, skip: list<string>} $scope */
$scope = require __DIR__ . '/paths.php';

return RectorConfig::configure()
    ->withPaths($scope['paths'])
    ->withSkip($scope['skip'])
    // Under .cache/, which survives `docker compose run --rm` and CI runs; the default is the temp dir.
    ->withCache(__DIR__ . '/../../.cache/rector')
    ->withPhpSets()
    ->withComposerBased(symfony: true)
    ->withAttributesSets(symfony: true)
    ->withPreparedSets(
        deadCode: true,
        codeQuality: true,
        typeDeclarations: true,
        privatization: true,
        symfonyCodeQuality: true,
    )
    ->withSymfonyContainerXml(__DIR__ . '/../../var/cache/dev/App_KernelDevDebugContainer.xml')
    ->withImportNames(importShortClasses: false);
