<?php

declare(strict_types=1);

namespace App\Service;

final class StaticHistoryBuilder
{
    /**
     * @param array<string,mixed> $previous
     * @param array<string,mixed> $current
     * @return array{schema_version:int,stations:array<string,array<string,string>>,days:list<array<string,mixed>>}
     */
    public function update(array $previous, array $current, int $keepDays = 90): array
    {
        $date = (string) ($current['source']['source_date'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            throw new \InvalidArgumentException('Kainų istorijai trūksta tinkamos šaltinio datos.');
        }

        $day = ['date' => $date, 'fuels' => [], 'station_prices' => []];
        $stationCatalog = is_array($previous['stations'] ?? null) ? $previous['stations'] : [];
        foreach ((array) ($current['stations'] ?? []) as $station) {
            $stationId = (string) ($station['id'] ?? '');
            if ($stationId === '') {
                continue;
            }

            $stationCatalog[$stationId] = [
                'brand' => (string) ($station['brand'] ?? ''),
                'address' => (string) ($station['address'] ?? ''),
                'city' => (string) ($station['city'] ?? ''),
                'municipality' => (string) ($station['municipality'] ?? ''),
            ];

            $prices = [];
            foreach ((array) ($station['prices'] ?? []) as $fuel => $price) {
                if (is_numeric($price)) {
                    $prices[(string) $fuel] = (float) $price;
                }
            }
            if ($prices !== []) {
                $day['station_prices'][$stationId] = $prices;
            }
        }

        foreach ((array) ($current['summary']['fuels'] ?? []) as $fuel) {
            $priced = array_values(array_filter(
                (array) ($current['stations'] ?? []),
                static fn (array $station): bool => isset($station['prices'][$fuel]) && is_numeric($station['prices'][$fuel]),
            ));
            if ($priced === []) {
                continue;
            }
            usort($priced, static fn (array $a, array $b): int => (float) $a['prices'][$fuel] <=> (float) $b['prices'][$fuel]);
            $prices = array_map(static fn (array $station): float => (float) $station['prices'][$fuel], $priced);
            $winner = $priced[0];
            $day['fuels'][$fuel] = [
                'minimum' => min($prices),
                'average' => array_sum($prices) / count($prices),
                'maximum' => max($prices),
                'station_count' => count($prices),
                'winner' => [
                    'id' => (string) ($winner['id'] ?? ''),
                    'brand' => (string) ($winner['brand'] ?? ''),
                    'address' => (string) ($winner['address'] ?? ''),
                    'city' => (string) ($winner['city'] ?? ''),
                    'price' => (float) $winner['prices'][$fuel],
                ],
            ];
        }

        $days = [];
        foreach ((array) ($previous['days'] ?? []) as $previousDay) {
            if (is_array($previousDay) && isset($previousDay['date'])) {
                $days[(string) $previousDay['date']] = $previousDay;
            }
        }
        $days[$date] = $day;
        ksort($days);

        return [
            'schema_version' => 2,
            'stations' => $stationCatalog,
            'days' => array_values(array_slice($days, -$keepDays, null, true)),
        ];
    }
}
