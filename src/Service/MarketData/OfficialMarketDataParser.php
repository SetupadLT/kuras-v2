<?php

declare(strict_types=1);

namespace App\Service\MarketData;

final class OfficialMarketDataParser
{
    /**
     * @return array{pb95:list<array{date:string,value:float}>,diesel:list<array{date:string,value:float}>}
     */
    public function parseOrlen(string $html): array
    {
        $xpath = $this->xpath($html);
        $series = ['pb95' => [], 'diesel' => []];
        $headings = $xpath->query('//h4');
        if ($headings === false) {
            throw new \RuntimeException('Nepavyko perskaityti ORLEN antraščių.');
        }

        foreach ($headings as $heading) {
            $label = trim((string) $heading->textContent);
            $fuel = $label === 'A95' ? 'pb95' : ($label === 'Diesel Fuel' ? 'diesel' : null);
            if ($fuel === null) {
                continue;
            }

            $tables = $xpath->query('following::table[contains(concat(" ", normalize-space(@class), " "), " table03 ")][1]', $heading);
            $table = $tables === false ? null : $tables->item(0);
            if (!$table instanceof \DOMElement) {
                continue;
            }

            $rows = $xpath->query('.//tr[th and count(td) >= 2]', $table);
            if ($rows === false) {
                continue;
            }
            foreach ($rows as $row) {
                $dateText = trim((string) $xpath->evaluate('string(th[1])', $row));
                $priceText = trim((string) $xpath->evaluate('string(td[last()])', $row));
                $date = \DateTimeImmutable::createFromFormat('!Y-n-j', $dateText);
                $price = (float) str_replace(',', '.', $priceText);
                if ($date === false || $price < 0.5 || $price > 4.0) {
                    continue;
                }
                $series[$fuel][$date->format('Y-m-d')] = round($price, 3);
            }
        }

        foreach ($series as $fuel => $points) {
            ksort($points);
            $series[$fuel] = array_map(
                static fn (string $date, float $value): array => ['date' => $date, 'value' => $value],
                array_keys($points),
                array_values($points),
            );
            $series[$fuel] = array_values(array_slice($series[$fuel], -90));
        }

        if (count($series['pb95']) < 2 || count($series['diesel']) < 2) {
            throw new \RuntimeException('ORLEN šaltinyje nerasta pakankamai A95 ir dyzelino kainų.');
        }

        return $series;
    }

    /** @return list<array{date:string,value:float}> */
    public function parseBrent(string $html): array
    {
        $xpath = $this->xpath($html);
        $rows = $xpath->query('//table[contains(@summary, "Europe Brent Spot Price")]//tr[td[contains(@class, "B6")]]');
        if ($rows === false) {
            throw new \RuntimeException('Nepavyko perskaityti EIA Brent lentelės.');
        }

        $points = [];
        foreach ($rows as $row) {
            $cells = $xpath->query('./td', $row);
            if ($cells === false || $cells->length < 6) {
                continue;
            }
            $weekText = str_replace("\xC2\xA0", ' ', (string) $cells->item(0)?->textContent);
            $week = preg_replace('/\s+/', ' ', trim($weekText));
            if (!is_string($week) || !preg_match('/^(\d{4}) ([A-Z][a-z]{2})-\s*(\d{1,2}) to /', $week, $matches)) {
                continue;
            }
            $monday = \DateTimeImmutable::createFromFormat('!Y M-j', "{$matches[1]} {$matches[2]}-{$matches[3]}");
            if ($monday === false) {
                continue;
            }
            for ($index = 1; $index <= 5; ++$index) {
                $raw = trim((string) $cells->item($index)?->textContent);
                if ($raw === '' || !is_numeric($raw)) {
                    continue;
                }
                $price = (float) $raw;
                if ($price < 10 || $price > 300) {
                    continue;
                }
                $date = $monday->modify(sprintf('+%d days', $index - 1))->format('Y-m-d');
                $points[$date] = round($price, 2);
            }
        }

        ksort($points);
        $result = array_map(
            static fn (string $date, float $value): array => ['date' => $date, 'value' => $value],
            array_keys($points),
            array_values($points),
        );
        $result = array_values(array_slice($result, -90));
        if (count($result) < 2) {
            throw new \RuntimeException('EIA šaltinyje nerasta pakankamai Brent kainų.');
        }

        return $result;
    }

    private function xpath(string $html): \DOMXPath
    {
        if (trim($html) === '') {
            throw new \RuntimeException('Gautas tuščias rinkos duomenų atsakymas.');
        }
        $document = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);
        $loaded = $document->loadHTML($html, LIBXML_NONET | LIBXML_NOWARNING | LIBXML_NOERROR);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        if (!$loaded) {
            throw new \RuntimeException('Nepavyko perskaityti rinkos duomenų HTML.');
        }

        return new \DOMXPath($document);
    }
}
