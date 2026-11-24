# NutriTrack — technická a funkčná špecifikácia pre Codex

Verzia: 1.0 | Jazyk aplikácie: slovenčina | Platforma: iPhone 14, PWA

## 1. Cieľ
Vytvoriť osobnú, rýchlu a spoľahlivú aplikáciu na evidenciu kalorického príjmu, makro- a mikronutrientov, telesnej hmotnosti, obvodu pásu a voliteľnej aktivity. Primárny cieľ používateľa: pochopiť dlhodobé priberanie a podporiť miernu, udržateľnú redukciu tuku. Aplikácia nesmie moralizovať ani označovať potraviny ako zakázané.

## 2. Záväzné rozhodnutia
- Jeden používateľ; bez účtu, bez serverového ukladania a bez synchronizácie v prvej verzii.
- Lokálne ukladanie v IndexedDB; manuálna úplná záloha/obnova JSON a analytický export CSV.
- PWA pre iPhone 14, responzívna aj pre počítač; automatická svetlá/tmavá téma podľa systému s možnosťou neskoršieho prepnutia.
- Manuálne zadávanie gramov, mililitrov, kusov, porcií a zlomkov balenia; pamätať poslednú použitú porciu pre konkrétnu potravinu.
- Vyhľadávanie potravín podľa názvu, značky a čiarového kódu; skenovanie čiarového kódu kamerou; vlastné výrobky a recepty.
- Zdroje: Open Food Facts pre balené výrobky, USDA FoodData Central pre základné potraviny, vlastná lokálna databáza. Integráciu USDA navrhnúť bez vystavenia tajného API kľúča v klientskom kóde; v prvej fáze použiť licenčne vhodný lokálny katalóg základných surovín alebo odložiť online USDA vyhľadávanie, kým bude bezpečné riešenie.
- Denník: raňajky, obed, večera, občerstvenie, s možnosťou vlastných kategórií; dátum a čas záznamu.
- Hmotnosť a obvod pásu, voliteľne fyzická aktivita. Váženie približne raz týždenne; umožniť ľubovoľnú frekvenciu. Grafy zobrazovať bez vynucovania denného váženia.
- Počiatočný cieľ: mierna redukcia približne 0,25–0,5 kg/týždeň, ale len ako nastaviteľná predvoľba. Energetický výdaj a cieľ sa najprv odhadnú z profilu a neskôr opatrne kalibrujú podľa trendu hmotnosti a kvality záznamov. Zmeny cieľa musí používateľ potvrdiť.
- Všetky dostupné makro- a mikronutrienty; pri chýbajúcich hodnotách zobraziť „údaj nie je dostupný“, nikdy automaticky nulu.
- **Žiadne fotografovanie jedla, AI odhad porcií ani AI analýza fotografií.** Nie sú súčasťou žiadnej plánovanej etapy.

## 3. Odporúčaný stack
React + TypeScript + Vite; Tailwind CSS; Dexie.js/IndexedDB; PWA service worker (napr. vite-plugin-pwa); Recharts; Vitest a Playwright. Knižnicu na čiarové kódy vybrať po overení podpory Safari/iOS; zabezpečiť alternatívu manuálneho zadania EAN/GTIN. Preferovať statický HTTPS hosting bez backendu. Nevytvárať závislosť na platených službách.

## 4. Dátový model
Navrhnúť verzovanú schému a migrácie minimálne pre:
- Profile: vek/dátum narodenia (voliteľne), pohlavie potrebné pre vybraný výpočtový vzorec, výška, hmotnosť, úroveň aktivity, cieľ a preferencie; citlivé údaje zostávajú lokálne.
- Food: stabilné ID, názov, značka, čiarový kód, zdroj, verzia a dátum získania, referenčné množstvo, jednotky, nutričné hodnoty, pokrytie dostupných živín.
- Nutrient: jednotka, hodnota alebo null, zdroj, prípadne referenčná hodnota; normalizovať kcal/kJ, g/mg/µg a vitamínové jednotky.
- Serving: hmotnosť v gramoch alebo objem v ml, pomenovanie porcie, zlomok balenia, prevodové pravidlo, posledná použitá porcia.
- Recipe: ingrediencie, množstvá, výsledná hmotnosť/počet porcií, prepočty výživy a výťažnosti; nezamieňať surový a varený stav.
- MealEntry: dátum, čas, kategória, množstvo, voliteľný kontext, **snapshot nutričných hodnôt a pôvodu** v čase zápisu.
- BodyMeasurement: dátum, hmotnosť, obvod pásu, voliteľná poznámka.
- ActivityEntry: typ, trvanie, voliteľný odhad výdaja; zabrániť dvojitému započítaniu aktivity v TDEE.
- GoalHistory: ciele, platnosť od/do, spôsob výpočtu, potvrdené zmeny.
- BackupMetadata: verzia schémy, čas exportu, kontrola formátu a integrity.

## 5. Výpočty a analytika
- Nutričné hodnoty prepočítať podľa referenčného množstva a skutočnej gramáže; jasne odlíšiť odhadované množstvá.
- Denné súčty: energia, bielkoviny, sacharidy, tuky, vláknina, cukry (pridané len ak dostupné), nasýtené tuky, sodík/soľ s korektným prevodom a všetky dostupné vitamíny/minerály.
- Percentá referenčných príjmov zobrazovať len pri zmysluplnej referencii a s informáciou o neúplnom pokrytí údajov; žiadne diagnózy nedostatkov.
- Trendy: 7/30/90 dní, týždenné priemery, porovnanie pracovných dní a víkendov, najvýznamnejšie zdroje energie, zmeny hmotnosti a pásu.
- Pri neúplne zaznamenaných dňoch nevyvodzovať závery o energetickom nadbytku; umožniť označiť deň ako kompletný/nekompletný.
- Kalibráciu TDEE povoliť až pri dostatku kvalitných záznamov a meraní, s konzervatívnymi limitmi a vysvetlením neistoty. Počiatočný výpočet podľa uznávaného vzorca (napr. Mifflin–St Jeor) s editovateľnými vstupmi.
- Kontext občerstvenia voliteľný: hlad, chuť/pôžitok, oddych, stres/únava; viacnásobný výber. Žiadne povinné psychologické dotazníky.

## 6. Obrazovky a UX
1. Dnes: kalórie, makrá, prehľad jedál, rýchle pridanie.
2. Pridať jedlo: vyhľadávanie, obľúbené, posledné, čiarový kód, vlastná potravina/recept; gramy, ml, kusy, zlomky balenia.
3. Denník a história: editácia, mazanie s potvrdením, kopírovanie jedla medzi dňami.
4. Analýza: grafy, mikronutrienty, dostupnosť údajov, trend hmotnosti.
5. Merania: hmotnosť, pás, voliteľná aktivita.
6. Nastavenia: profil, ciele, téma, export, import, informácie o zdrojoch.
Optimalizovať na ovládanie jednou rukou. Preferovať čo najmenej krokov pri opakovanom jedle; predvoliť poslednú porciu. Zobraziť prázdne stavy, chyby siete a stavy bez nutričných údajov.

## 7. Offline, externé API a ochrana dát
- Offline musí fungovať otvorenie aplikácie, prehliadanie a editácia uložených údajov, vlastné potraviny, recepty, výpočty a export.
- Online vyhľadávanie a skenovanie: po naskenovaní skúsiť lokálnu databázu a potom externý zdroj; pri výpadku ponúknuť manuálny zápis.
- Overiť aktuálne API, CORS, limity, licencie a atribúciu Open Food Facts a USDA pred implementáciou. Nesmie sa predpokladať úplnosť ich nutričných údajov.
- Neumiestňovať API tajomstvá do frontendových súborov, build premenných VITE_* ani do verejného repozitára.
- JSON export musí zahŕňať všetky vlastné údaje, recepty, históriu, ciele, posledné porcie a nastavenia. Import musí validovať schému, ukázať náhľad a pred prepísaním vyžadovať potvrdenie; podporiť bezpečné obnovenie bez čiastočného poškodenia dát.
- CSV export: jedlá, denné súčty, merania a podľa možností nutričné súhrny; UTF-8 BOM alebo iná overená kompatibilita s Excelom, jasný oddeľovač a desatinný formát.
- iOS môže vymazať lokálne webové dáta: aplikácia musí upozorniť na zálohovanie a ponúknuť jednoduchý export do Súborov, odkiaľ možno uložiť aj na Synology NAS. Automatický NAS sync nie je súčasťou MVP.
- Kamera vyžaduje HTTPS a používateľské povolenie; skenovanie overiť na skutočnom iPhone, nielen desktop emuláciou.

## 8. Etapy implementácie
### Etapa A — plán a kostra
Založiť projekt, definovať dátové typy, migrácie, routovanie, navigáciu, tému, testovaciu infraštruktúru, README. Vytvoriť IMPLEMENTATION_PLAN.md a AGENTS.md. Zastaviť sa na kontrolnom bode.
### Etapa B — použiteľné offline jadro
Profil, ciele, vlastné potraviny, porcie, recepty, denník, súčty, merania, základná analýza, JSON backup/restore a CSV. Otestovať aj po obnovení stránky a offline.
### Etapa C — katalógy a rýchle zadávanie
Open Food Facts vyhľadávanie, EAN/GTIN, kamera, lokálny katalóg základných potravín, obľúbené a posledné jedlá, zlomky balenia, riešenie neúplných údajov.
### Etapa D — pokročilá analýza
Mikronutrientové pokrytie, trendy, kontext občerstvenia, opatrná kalibrácia TDEE, prehľad zdrojov nadbytku, testy a UX audit.
Každú etapu dokončiť, otestovať a zhrnúť pred pokračovaním. Neimplementovať všetko naraz.

## 9. Akceptačné testy
- 150 g potraviny s 200 kcal/100 g = 300 kcal; test rôznych jednotiek a zaokrúhľovania.
- 1/3 zo 150 g balenia = 50 g; správny prepočet živín.
- Chýbajúci vitamín zostáva null, nie 0; neúplné pokrytie je viditeľné.
- Editácia nutričných údajov výrobku nemení historické záznamy.
- Recept s viacerými ingredienciami sa správne prepočíta na porciu.
- Posledná porcia sa predvolí pri opätovnom výbere potraviny.
- Aplikácia funguje offline s lokálnymi dátami a po reštarte prehliadača.
- Export JSON a následný import do čistej databázy obnoví všetky údaje; poškodený JSON neprepíše existujúce údaje.
- CSV má správne dátumy, jednotky a diakritiku.
- Skenovanie má manuálnu alternatívu; otestovať iOS Safari/PWA a povolenie kamery.
- Cieľ sa nezmení automaticky bez potvrdenia.
- Automatická svetlá/tmavá téma rešpektuje nastavenie systému.

## 10. Inštrukcie pre Codex
Najprv prečítaj celý tento súbor. Pred programovaním:
1. Over kompatibilitu a licencie vybraných knižníc a externých zdrojov.
2. Vytvor IMPLEMENTATION_PLAN.md s jasnými míľnikmi, rizikami a testami.
3. Vytvor AGENTS.md s projektovými pravidlami.
4. Uveď prípadné blokujúce otázky a navrhni predvolené riešenia.
5. Implementuj iba Etapu A a potom sa zastav, vypíš vytvorené súbory a výsledky testov.
Nepredstieraj, že kamera, externé API alebo PWA na iPhone fungujú bez reálneho overenia. Nikdy nevkladaj tajné kľúče do klienta. Nepoužívaj platené služby bez schválenia. Nevykonávaj produkčné nasadenie bez výslovného súhlasu.
