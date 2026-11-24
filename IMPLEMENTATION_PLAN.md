# Implementačný plán NutriTrack

Rozsah vychádza zo špecifikácie NutriTrack 1.0. Aplikácia je slovenská PWA pre jedného používateľa. Údaje zostávajú v IndexedDB na zariadení. Každá etapa má samostatný kontrolný bod a pokračovanie vyžaduje výslovné potvrdenie používateľa.

## Míľniky a akceptácia

| Etapa | Výstup | Overenie |
| --- | --- | --- |
| A · Plán a kostra | Projekt, dokumentácia, dátové typy, verzovaná IndexedDB, šesť trás, responzívna navigácia, systémová téma, manifest a offline obálka aplikácie | Typová kontrola, produkčný build, čerstvá databáza a upgrade s reprezentatívnymi údajmi, navigácia, zmena systémovej témy, obnovenie a otvorenie obálky bez siete |
| B · Offline jadro | Profil a potvrdené ciele, vlastné potraviny, porcie, recepty, denník, základná analýza, merania, úplný JSON import/export a analytický CSV export | 150 g pri 200 kcal/100 g dá 300 kcal. Overiť jednotky, zaokrúhľovanie, recept, poslednú porciu, nemennosť histórie, potvrdenie cieľa, dáta offline aj po reštarte, spätný import a odmietnutie poškodeného súboru. Skontrolovať dátumy, jednotky a diakritiku v CSV. |
| C · Katalógy a rýchly zápis | Open Food Facts, lokálny katalóg základných surovín, vyhľadávanie, EAN/GTIN, skenovanie, obľúbené, posledné jedlá a zlomky balení | Tretina 150 g balenia dá 50 g. Chýbajúca hodnota zostane `null` a pokrytie bude viditeľné. Overiť výpadok, obmedzenie API, lokálnu prioritu, manuálny EAN a povolenie aj odmietnutie kamery na iPhone. |
| D · Pokročilá analýza | Mikronutrienty, trendy 7/30/90 dní, týždenné súhrny, pracovné dni a víkendy, kontext občerstvenia a kalibrácia TDEE | Overiť hranice dátumov, neúplné dni, pokrytie živín a riedke merania. Pri zmene cieľa overiť vysvetlenie neistoty, konzervatívne limity a výslovné potvrdenie. |

## Technické rozhodnutia pre Etapu A

- Node.js 24 LTS pre vývoj. Vite 8, React 19, React Router 7, Tailwind CSS 4 a jeho Vite integrácia majú licenciu MIT. TypeScript 6 a Dexie 4 majú licenciu Apache-2.0. Plugin React a vite-plugin-pwa majú MIT. Vitest 5 má MIT, Playwright 1 a fake-indexeddb 6 majú Apache-2.0. Konkrétne verzie zaznamená npm lockfile. Vite 8, Tailwind 4 a React Router 7 sú zvolené s cieľom Safari na iOS 16.4 a novšom. [Vite – kompatibilita prehliadačov](https://vite.dev/guide/build), [Tailwind CSS – kompatibilita](https://tailwindcss.com/docs/compatibility)
- Trasy používajú fragment URL, aby priame odkazy fungovali na statickom hostingu bez pravidiel prepisovania. Manifest a service worker pokrývajú obálku aplikácie po prvom online načítaní. Každá obrazovka má slovenský názov, trvalú navigáciu a text primeraný jej aktuálnej dostupnosti.
- Dexie eviduje revízie schémy. Verzia 1 obsahuje základné tabuľky. Verzia 2 rozširuje denník o zložený index podľa dňa a kategórie, dennú úplnosť a posledné porcie. Upgrade zachová existujúce údaje. Ďalšie revízie budú pridávať podľa potreby explicitné transakčné prepočty údajov a testovaciu vzorku predchádzajúcej verzie.
- Dátum denníka používame ako miestny kalendárny deň, čas záznamu evidujeme zvlášť. Časové pečiatky pôvodu a exportu používajú UTC ISO 8601. Živiny majú jednotku aj pôvod, chýbajúce hodnoty sa ukladajú ako `null`. Záznam denníka obsahuje hodnoty a pôvod uložené pri zápise. Verzia databázy a verzia formátu zálohy majú samostatný význam.
- Systémovú tému ovláda CSS cez `prefers-color-scheme`. Model nastavení ráta s trvalým výberom svetlej alebo tmavej témy. Recharts sa posúdi pri prvej analytickej obrazovke, dekodér čiarových kódov počas Etapy C po overení na iPhone.

## Externé zdroje a riziká

- **Open Food Facts.** Dokumentácia označuje produktové API v3.6 za aktuálne a uvádza limity 15 čítaní produktov a 10 vyhľadávaní za minútu na IP. Kontrolný GET produktového API s hlavičkou Origin vrátil povolenie CORS `*` a preflight pre `X-User-Agent` túto hlavičku povolil. Kontrolná odpoveď Search-a-licious neobsahovala `Access-Control-Allow-Origin` pre lokálny pôvod. V C treba overiť aktuálne vyhľadávanie z cieľového pôvodu a spôsob identifikácie webového klienta podľa podmienok zdroja. Pre prípad blokovania ostáva lokálny katalóg a manuálne zadanie. Databáza má licenciu ODbL, jednotlivý obsah DbCL a fotografie CC BY-SA. Pri integrácii sa zobrazí atribúcia a preverí sa zdieľanie odvodených dát vrátane exportov. [API a limity](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/), [licencie a atribúcia](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/), [Search-a-licious](https://search.openfoodfacts.org/docs)
- **USDA FoodData Central.** Oficiálne API vyžaduje kľúč a uvádza predvolený limit 1 000 žiadostí za hodinu na IP. Kontrolný GET s verejným kľúčom ukážky vrátil CORS `*`. Pre C je predvoleným zdrojom malý lokálny výber z dát Foundation Foods pod CC0 1.0 s uvedením zdroja a verzie vydania. Online USDA je odložené do bezpečného riešenia bez kľúča v klientovi. [API, limity a atribúcia](https://fdc.nal.usda.gov/api-guide/), [stiahnuteľné vydania](https://fdc.nal.usda.gov/download-datasets/)
- **iOS a trvácnosť.** iOS môže odstrániť dáta webu. Etapa B pridá jednoduchú JSON zálohu do Súborov a viditeľnú informáciu o zálohovaní. Import najprv overí formát a integritu, zobrazí náhľad a po potvrdení použije jedinú transakciu. Interné overenie v Playwright doplní manuálne overenie na fyzickom iPhone cez HTTPS.
- **Neúplné údaje.** Analýza potrebuje pokrytie živín a stav úplnosti dňa. Chýbajúce merania a neúplné dni obmedzia interpretáciu a kalibráciu TDEE. Pri výskyte chýbajúcej hodnoty zobrazí funkčná obrazovka „údaj nie je dostupný“.

## Kontrolný bod A

Pre Etapu A nie sú otvorené blokujúce otázky. Dostupný lokálny náhľad a automatické testy pokryjú kostru. Fyzický iPhone, cieľový HTTPS pôvod a kamera zostávajú súčasťou overovania funkcií, ktoré ich potrebujú. Ďalší krok podlieha potvrdeniu používateľa.

## Kontrolný bod B

- Offline jadro používa pôvodné trasy a IndexedDB schému 2. Nové voliteľné vlastnosti v existujúcich záznamoch odlišujú kus od pomenovanej porcie, zaznamenávajú pokrytie živín v recepte a dovoľujú vyjadriť porciu receptu aj bez známej výslednej hmotnosti. Staršie záznamy nevyžadujú prepis.
- Záloha formátu 1 používa na overenie štruktúry Zod 4 (MIT) a SHA-256 cez Web Crypto. Prehľad sa pripravuje pred potvrdením a zápis prebieha v jedinej transakcii IndexedDB.
- Základná analýza zobrazuje denný príjem a bodové grafy meraní bez grafickej knižnice. Pokročilé trendy, referenčné príjmy a kalibrácia patria do Etapy D.
- Nutričný súčet z neúplných záznamov sa označuje ako čiastkový. Prepočet vitamínu D z IU je jednoznačný. Pri vitamínoch A a E sa hodnota v IU uchová v pôvodnej jednotke, keďže prevod závisí od formy.

## Kontrolný bod C

- Lokálne sa vyhľadáva podľa názvu, značky a GTIN. Čítanie kódu overí kontrolnú číslicu, zjednotí nulami doplnené varianty pre porovnanie a uprednostní IndexedDB. Kamera sa spúšťa používateľským tlačidlom, dekóduje v zariadení cez ZXing JS 0.23 (Apache-2.0) a uvoľňuje stopy po úspechu, zatvorení alebo odchode z obrazovky. [ZXing JS](https://github.com/zxing-js/library)
- Produktový detail Open Food Facts číta API v3.6. Text používa Product Opener CGI so slovenskými a českými názvami a filtrom trhu. Počas kontroly World CGI vrátil JSON a CORS povolenie, Search-a-licious CORS hlavičku pre testovaný pôvod neposkytol a niektoré živé dotazy CGI vrátili 503. Klient má časový limit, krátku cache, kvótu 8 textových vyhľadávaní a 12 čítaní produktov za minútu v otvorenej aplikácii a pozastavenie po 429/503. [API a limity](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/), [licencia a atribúcia](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/)
- Výživové údaje dovozu používajú deklarovanú bázu 100 g alebo 100 ml. Hodnoty z pripraveného stavu sa neprenášajú do údajov výrobku pred prípravou. Odhady zo zloženia a množstvá uvedené iba ako hranica zostávajú nedostupné. Identifikátor výrobku, verzia zdroja a čas načítania sa prenášajú do snímky denníka. Pri explicitnej aktualizácii sa zachovajú miestne úpravy a historické snímky.
- Offline výber obsahuje 21 položiek USDA Foundation Foods z vydania 2026-10-29. Katalóg obsahuje FDC ID, pôvodné názvy a vybrané hodnoty z oficiálneho súboru. [Vydania USDA](https://fdc.nal.usda.gov/download-datasets/), [licencia CC0](https://fdc.nal.usda.gov/api-guide/#licensing)
- Schéma IndexedDB 3 pridáva tabuľku kombinácií a uznáva voliteľné polia pre obľúbenosť a poslednú kategóriu. Formát zálohy 2 zahŕňa novú tabuľku a migrácia pri obnove z formátu 1 zachová údaje Etapy B. Zápis kombinácie používa jednu transakciu aj pre posledné porcie.
- Počítačové testy používajú kontrolované odpovede API a simulovanú snímku EAN. Fyzický iPhone cez dôveryhodný HTTPS pôvod zostáva potrebný na kontrolu povolení, kamery, inštalácie a chodu samostatnej PWA. Pokračovanie do Etapy D vyžaduje výslovné potvrdenie.

## Kontrolný bod D

- Obdobia 7/30/90 dní, týždenné priemery a porovnanie pracovných dní a víkendov rešpektujú označenie kompletného dňa aj dostupnosť požadovanej živiny. Energetická bilancia používa cieľ platný v jednotlivých dňoch. Zdroje energie majú samostatný prehľad pre dni nad cieľom a analýza času používa miestne časy zápisov.
- Mikronutrienty rozlišujú dostupnú nulu, chýbajúce údaje, zaznamenaný čiastkový súčet a úplné pokrytie. Percentá vyžadujú porovnateľnú jednotku a dostatočné pokrytie. Pri špecifickej chemickej forme alebo neznámom kontexte sa uvádza vysvetlenie alebo rozpätie. [Tabuľky EFSA](https://www.efsa.europa.eu/sites/default/files/assets/DRV_Summary_tables_jan_17.pdf), [EFSA sodík](https://doi.org/10.2903/j.efsa.2019.5778), [EFSA chlorid](https://doi.org/10.2903/j.efsa.2019.5779)
- Kalibrácia používa najviac 56 posledných ukončených dní, opakované váženia a robustný sklon týždenných mediánov. Podiel energie z odhadnutých porcií môže byť najviac 25 % a platia minimá pokrytia aj hranice kolísania. Zmenu cieľa obmedzuje konzervatívna heuristika. Potvrdenie prepočíta podklady v transakcii a uloží iba aktuálny návrh s dôkazmi. [Mifflin–St Jeor](https://pubmed.ncbi.nlm.nih.gov/2305711/), [NIDDK](https://www.niddk.nih.gov/research-funding/at-niddk/labs-branches/laboratory-biological-modeling/integrative-physiology-section/research/body-weight-planner)
- Pri zápise aj úprave je možné označiť viac dôvodov a typov jedla. Odporúčania sú deterministické, uvádzajú počty alebo porovnateľné hodnoty a podmienky minimálneho pokrytia. Zobrazené súvislosti vychádzajú zo zápisov v denníku.
- Schéma IndexedDB 4 pridáva zložený index dátum a čas a nové záznamy môžu niesť označenia alebo podklady kalibrácie. Export formátu 3 zachováva nové údaje a obnovuje aj formáty Etáp B a C. Staršie nutričné snímky a platnosť historických cieľov sa zachovajú.
- Akceptácia zahŕňa výpočty a prácu s chýbajúcimi údajmi, test nedostatočných podkladov a potvrdenia kalibrácie, migráciu schém, obnovu záloh a offline rozhranie pri šírke 390 px v Chromium a WebKite. Fyzický iPhone zostáva potrebný na manuálnu kontrolu samostatnej PWA.
