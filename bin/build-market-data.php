#!/usr/bin/env php
<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/vendor/autoload.php';

use App\Service\MarketData\OfficialMarketDataParser;

const ORLEN_URL = 'https://www.orlenlietuva.lt/en/wholesale/_layouts/f2hCharts/default_lt_M.aspx';
const BRENT_URL = 'https://www.eia.gov/dnav/pet/hist/RBRTED.htm';

$options = getopt('', ['orlen-file:', 'brent-file:', 'output:', 'previous:', 'help']);
if (isset($options['help'])) {
    echo "Usage: php bin/build-market-data.php [--orlen-file=file.html --brent-file=file.html] [--output=market.json] [--previous=market.json]\n";
    exit(0);
}

$root = dirname(__DIR__);
$output = (string) ($options['output'] ?? $root . '/static/data/market.json');
$previousPath = (string) ($options['previous'] ?? $output);
$previous = read_json($previousPath);
$parser = new OfficialMarketDataParser();
$errors = [];

try {
    $orlenBody = isset($options['orlen-file'])
        ? read_file((string) $options['orlen-file'])
        : http_get(ORLEN_URL);
    $orlenSeries = $parser->parseOrlen($orlenBody);
    $orlen = [
        'source_name' => 'ORLEN Lietuva',
        'source_url' => ORLEN_URL,
        'description' => 'Vienkartinių sandorių kainos, kraunant į autotransportą OKSETA terminale Kaune.',
        'unit' => 'EUR/l',
        'series' => $orlenSeries,
    ];
} catch (\Throwable $error) {
    $errors[] = 'ORLEN: ' . $error->getMessage();
    $orlen = is_array($previous['orlen'] ?? null) ? $previous['orlen'] : null;
}

try {
    $brentBody = isset($options['brent-file'])
        ? read_file((string) $options['brent-file'])
        : http_get(BRENT_URL);
    $brentSeries = $parser->parseBrent($brentBody);
    $brent = [
        'source_name' => 'U.S. Energy Information Administration',
        'source_url' => BRENT_URL,
        'description' => 'Europe Brent Spot Price FOB.',
        'unit' => 'USD/bbl',
        'series' => $brentSeries,
    ];
} catch (\Throwable $error) {
    $errors[] = 'Brent: ' . $error->getMessage();
    $brent = is_array($previous['brent'] ?? null) ? $previous['brent'] : null;
}

if (!is_array($orlen) && !is_array($brent)) {
    throw new RuntimeException("Nepavyko gauti rinkos duomenų:\n- " . implode("\n- ", $errors));
}

$payload = [
    'schema_version' => 1,
    'generated_at' => gmdate('c'),
    'orlen' => $orlen,
    'brent' => $brent,
];
if ($errors !== []) {
    $payload['warnings'] = $errors;
    fwrite(STDERR, "ĮSPĖJIMAS: " . implode('; ', $errors) . "\n");
}

$directory = dirname($output);
if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
    throw new RuntimeException("Nepavyko sukurti katalogo: {$directory}");
}
if (file_put_contents($output, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n") === false) {
    throw new RuntimeException("Nepavyko įrašyti rinkos duomenų: {$output}");
}

echo sprintf("Rinkos duomenys paruošti: ORLEN %s, Brent %s.\n", is_array($orlen) ? 'gerai' : 'nepasiekiama', is_array($brent) ? 'gerai' : 'nepasiekiama');

function read_file(string $path): string
{
    $body = file_get_contents($path);
    if (!is_string($body) || $body === '') {
        throw new RuntimeException("Nepavyko perskaityti failo: {$path}");
    }
    return $body;
}

/** @return array<string,mixed> */
function read_json(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $decoded = json_decode((string) file_get_contents($path), true);
    return is_array($decoded) ? $decoded : [];
}

function http_get(string $url): string
{
    if (!extension_loaded('curl')) {
        throw new RuntimeException('Rinkos duomenims būtinas PHP cURL plėtinys.');
    }
    $lastError = 'nežinoma tinklo klaida';
    for ($attempt = 1; $attempt <= 3; ++$attempt) {
        $handle = curl_init($url);
        if ($handle === false) {
            throw new RuntimeException('Nepavyko paleisti rinkos duomenų užklausos.');
        }
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_CONNECTTIMEOUT => 20,
            CURLOPT_TIMEOUT => 90,
            CURLOPT_USERAGENT => 'KurasPricerBot/1.0 (+https://kuras.pricer.lt)',
            CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.7'],
            CURLOPT_ENCODING => '',
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        ]);
        $body = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $error = curl_error($handle);
        curl_close($handle);
        if (is_string($body) && $body !== '' && $status >= 200 && $status < 300) {
            return $body;
        }
        $lastError = $error !== '' ? $error : "HTTP {$status}";
        if ($attempt < 3 && ($status === 0 || $status === 408 || $status === 429 || $status >= 500)) {
            usleep(500000 * $attempt);
            continue;
        }
        break;
    }
    throw new RuntimeException("Šaltinis nepasiekiamas: {$lastError}");
}
