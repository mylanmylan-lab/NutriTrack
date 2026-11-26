# NutriTrack – stav projektu

Kontrola 26. 11. 2026; vetva main; verzia 0.1.0 podľa package.json. Zdroje: README.md, AGENTS.md, SPECIFICATION.md, IMPLEMENTATION_PLAN.md a kontrola časti src/data/foundationFoods.json. Testy neboli v tejto kontrole spustené.

## Zdokumentovaný stav
- Etapy A–D: architektúra, offline jadro, katalógy a pokročilá analýza sú zdokumentované ako implementované; akceptácia na fyzickom zariadení ostáva otvorená.
- React, TypeScript, Vite, Tailwind, Dexie/IndexedDB, ZXing; Node 24. Schéma IndexedDB 4, záloha formátu 3 podľa README.
- Denník, porcie, recepty, vlastné potraviny, Open Food Facts, 21 základných USDA položiek, čiarové kódy, rýchly zápis.
- Merania, 7/30/90-dňové analýzy, mikronutrienty, pokrytie údajov, história cieľov a konzervatívna kalibrácia výdaja.
- JSON záloha a CSV export, PWA build a GitHub Pages workflow.

## Otvorené
1. Overiť stav publikovania Pages; nevydávať pripravený workflow za úspešné nasadenie.
2. Fyzický iPhone: kamera a povolenia, inštalácia PWA, offline reštart, záloha do Súborov, obnova a trvácnosť úložiska.
3. Manuálna akceptácia Etapy D: čitateľnosť analýzy, úplnosť dní a pokrytie živín. Ďalšia etapa len po výslovnom schválení.

## Hranice rozsahu
Jeden lokálny profil, bez synchronizácie, účtu, platených služieb a AI analýzy fotografií. Chýbajúce živiny nie sú nula. Historické snímky a potvrdené ciele zachovať. Výpočty sú orientačné, nie diagnostické. Povinné testy podľa AGENTS.md ostávajú v platnosti.
