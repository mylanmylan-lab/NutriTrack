# NutriTrack

Slovenská aplikácia pre osobný nutričný denník. Údaje zostávajú v IndexedDB na danom zariadení a v danom prehliadači. Miestny katalóg obsahuje vlastné a uložené potraviny. Predpripravený výber základných surovín je dostupný offline v samostatnej časti.

## Lokálne spustenie

V koreňovom priečinku projektu spustite s Node.js 24 LTS a npm:

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Otvorte `http://127.0.0.1:5173` alebo adresu, ktorú vypíše Vite. Na overenie PWA spustite produkčný build a náhľad na samostatnom pôvode:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Otvorte `http://127.0.0.1:4173`, cez **Pridať** vytvorte vlastnú potravinu a zapíšte množstvo do denníka. Prázdne polia živín môžete ponechať prázdne. Pre kontrolu offline režimu počkajte na aktiváciu service workera a vypnite sieť cez vývojárske nástroje. Obnovte kartu, pridajte záznam a porovnajte súčty. Testovací zápis môžete po kontrole zmazať v denníku.

Na fyzickom iPhone použite dôveryhodný HTTPS pôvod dostupný zo zariadenia. V Safari otvorte aplikáciu a z ponuky Zdieľať ju pridajte na plochu. V Safari aj v samostatnej PWA vyskúšajte **Pridať → Čiarový kód → Spustiť kameru**. Overte povolenie aj zamietnutie kamery, načítanie kódu z obalu a uvoľnenie kamery po zatvorení. Po úvodnom online otvorení odpojte sieť a skontrolujte základné suroviny, uložený kód, denník a zdieľanie zálohy do Súborov.

## Offline jadro

- **Pridať** umožňuje spravovať miestny katalóg, vyhľadávať podľa názvu, značky a GTIN a zapisovať gramy, mililitre, kusy a pomenované porcie. Prevod g/ml používa zadanú hustotu. Pri opakovanom výbere sa predvolí posledné množstvo, jednotka a kategória, ak sú dostupné.
- **Dnes** a **Denník** zobrazujú denné súčty a záznamy podľa kategórií. V denníku možno upraviť dátum, čas, kategóriu a množstvo, kopírovať záznam alebo ho po potvrdení zmazať. Hodnoty použité pri zápise zostávajú uložené aj po úprave alebo odstránení potraviny. Po zmene množstva sa pomerne prepočíta uložená snímka.
- **Recepty** používajú zaznamenaný stav suroviny a výslednú hmotnosť alebo počet porcií. Ak živina chýba v časti záznamov alebo surovín, zobrazuje sa dostupný čiastkový súčet s uvedením neúplnosti. Nula je explicitná hodnota zo vstupu alebo zdroja.
- **Analýza** zobrazuje prehľady za 7, 30 a 90 dní, denný detail a graf vývoja hmotnosti a pásu. **Merania** ukladajú hmotnosť, obvod pásu a voliteľné aktivity. Odhad výdaja z jednotlivých aktivít sa nepripočítava k odhadu z profilu.
- **Nastavenia** obsahujú profil, odhad výdaja pre dospelých, samostatné potvrdenie cieľa s históriou, kategórie jedál, tému a zálohy. Zmena profilu sama o sebe nemení potvrdený cieľ.

## Katalógy, skenovanie a rýchly zápis

- V časti **Pridať → Open Food Facts** vyhľadajte názov alebo značku a podľa potreby zvoľte Slovensko alebo Česko. Otvorte výsledok a skontrolujte výživové údaje na 100 g alebo 100 ml. Uložený výrobok možno otvoriť aj bez siete. Pri ďalšom online otvorení je dostupná aktualizácia údajov, ktorá zachová ručné nutričné hodnoty aj staršie snímky denníka.
- V časti **Pridať → Čiarový kód** použite kameru alebo zadajte EAN/GTIN ručne. Aplikácia skúsi najprv miestny katalóg. Pri neznámom kóde alebo nedostupnej službe ponúkne manuálne vytvorenie potraviny s predvyplneným kódom.
- **Základné suroviny** obsahujú 21 položiek z USDA FoodData Central, Foundation Foods z vydania 29. októbra 2026. V súbore `src/data/foundationFoods.json` je pri každej položke identifikátor FDC, pôvodný názov a vybrané publikované hodnoty na 100 g. Prázdne alebo iba hraničné údaje zostávajú nedostupné. Katalóg je súčasťou buildu a funguje bez USDA API kľúča. [Vydania USDA FoodData Central](https://fdc.nal.usda.gov/download-datasets/), [dokumentácia Foundation Foods](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/), [licencia CC0](https://fdc.nal.usda.gov/api-guide/#licensing)
- Na opakovaný zápis vyberte položku z **Obľúbených potravín** alebo **Nedávno použitých** a potvrďte predvolené množstvo. Po zadaní veľkosti balenia môžete vybrať 1/4, 1/3, 1/2 alebo celé balenie. Z kategórie dňa v denníku možno uložiť pomenovanú kombináciu. Pri jej ďalšom použití sa zapíšu všetky položky spolu do zvoleného dňa a kategórie.
- Kamera číta EAN, UPC a ITF‑14 cez ZXing z lokálneho videonáhľadu. Prehliadač musí povoliť prístup ku kamere z dôveryhodného HTTPS pôvodu alebo z localhostu. Licencia knižnice je v `public/licenses/zxing-library.txt`. [ZXing JS](https://github.com/zxing-js/library)

### Open Food Facts

Produktový detail používa API v3.6. Textové vyhľadávanie používa dokumentovaný legacy endpoint Product Opener, pretože testovaný Search-a-licious nepovolil prehliadačový pôvod cez CORS. Služba môže dočasne obmedziť alebo odmietnuť požiadavku. Aplikácia používa explicitné vyhľadávanie, krátku pamäť výsledkov a najviac 8 vyhľadávaní a 12 čítaní produktov za minútu v otvorenej aplikácii. Po odpovedi 429 alebo 503 pozastaví ďalšie pokusy. [Dokumentácia API a limity](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/)

Identifikácia klienta používa názov, verziu a pôvod aplikácie. Vlastný verejný kontaktný údaj možno nastaviť cez `VITE_OFF_CONTACT`. Pri verejnom sprístupnení je potrebné zohľadniť podmienky a registračný formulár Open Food Facts. Uložené produkty a zálohy nesú označenie zdroja. Pri ďalšom zdieľaní odvodených údajov dodržte podmienky ODbL a DbCL. [Licencie a atribúcia Open Food Facts](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/)

## Pokročilá analýza

V **Analýze** vyberte obdobie a posledný deň. Denník umožňuje označiť konkrétny deň ako kompletne zaznamenaný. Priemer energie, bielkovín, sacharidov, tukov alebo vlákniny používa iba kompletne označené dni s úplným údajom o príslušnej živine. Neúplné dni a kompletné dni s chýbajúcou energiou majú vlastný prehľad. Deň bez energetického zápisu zostáva bez údaja.

Bilancia počíta rozdiel príjmu a potvrdeného cieľa platného v daný deň. Podiely kategórií, zdroje energie, týždenné priemery a porovnanie pondelka až piatka so sobotou a nedeľou používajú dni s úplnou energiou. Graf hmotnosti a pásu zobrazuje existujúce merania vo zvolenom období. Pri opakovaných meraniach v rovnaký deň používa medián.

Pri zápise alebo úprave jedla môžete rozbaliť **Kontext jedla a označenia** a vybrať viac dôvodov alebo typov naraz. Sladkosti, slané pochutiny a kalorické nápoje sa určujú podľa vašich označení. Večerné občerstvenie zahŕňa zápisy kategórie Občerstvenie a označené typy od 20.00. Porovnanie situácií potrebuje najprv aspoň dva použiteľné dni v každej skupine. Zistené rozdiely opisujú súvislosti v zaznamenaných dňoch.

### Vitamíny a minerály

Aplikácia používa referencie EFSA pre zdravých dospelých podľa dostupného veku a pohlavia. Referencie pre tehotenstvo a dojčenie nie sú súčasťou profilu. Hodnoty a ich jednotky vychádzajú z tabuliek 3, 5, 7, 9 a 11 a z osobitných stanovísk pre sodík a chlorid. [Tabuľky EFSA](https://www.efsa.europa.eu/sites/default/files/assets/DRV_Summary_tables_jan_17.pdf), [Sodík](https://doi.org/10.2903/j.efsa.2019.5778), [Chlorid](https://doi.org/10.2903/j.efsa.2019.5779)

Deklarovaná nula sa počíta ako dostupná hodnota. Čiastkový súčet vyjadruje zaznamenané minimum delené počtom kompletne označených dní a nesie informáciu o neistote. Percento sa zobrazí pri úplnom pokrytí a porovnateľnej referencii. Pri železe pre ženy a zinku sa uvádza podmienené rozpätie. Pri údajoch vyžadujúcich konkrétnu chemickú formu alebo energetický základ aplikácia vysvetlí podmienku porovnania. Populačné referencie umožňujú orientačné porovnanie denníka. Diagnostika vyžaduje ďalšie údaje.

### Kalibrácia výdaja

Výdaj z profilu sa počíta zo vzorca Mifflin–St Jeor a zvolenej úrovne aktivity. Príjem pre kalibráciu je súčet zaznamenaných porcií a nutričných hodnôt. Aplikácia si pri kalibrácii vyžaduje nasledujúce podklady:

- Posledných 56 ukončených dní s aspoň 42 kompletne zaznamenanými dňami s úplnou energiou. V každom sedemdňovom úseku musia byť aspoň štyri použiteľné dni.
- Najmenej šesť rôznych dní s vážením v aspoň piatich týždňoch. Rozpätie vážení musí byť aspoň 35 dní a prvé i posledné váženie najviac 13 dní od príslušného konca obdobia.
- Najviac štvrtina energie z odhadnutých porcií a dostatočne stabilný trend týždenných mediánov. Pri výraznom kolísaní alebo nesúlade s odhadom z profilu sa aplikácia obmedzí na vysvetlenie.

Orientačný model odpočíta od zaznamenaného priemeru sklon hmotnosti v kg/deň krát 7 700 kcal/kg. Sklon je medián párových sklonov týždenných mediánov. Polovica odchýlky sa pripočíta k profilovému výdaju a úprava je obmedzená na 150 kcal/deň alebo 8 % profilového odhadu. Orientačné pásmo neistoty zahŕňa variabilitu sklonov aj možnú chybu zapisovania. Model nezaručuje predpoveď hmotnosti ani individuálnu presnosť výdaja. [Mifflin–St Jeor](https://pubmed.ncbi.nlm.nih.gov/2305711/), [NIDDK o dynamike energetickej bilancie](https://www.niddk.nih.gov/research-funding/at-niddk/labs-branches/laboratory-biological-modeling/integrative-physiology-section/research/body-weight-planner)

Automatický deficit je obmedzený na 300 kcal/deň a 15 % odhadu. Kalibrované návrhy používajú navyše dolnú hranicu 1 200 kcal/deň alebo pokojový výdaj, podľa toho, čo je vyššie. Pri nízkom BMI sa redukčný cieľ automaticky nenavrhuje. Kalibrácia môže zmeniť aktívny denný cieľ najviac o 150 kcal. Aplikácia pri potvrdení znova overí podklady a uloží vysvetlenie do histórie cieľov. Všetky výpočty sa uskutočňujú v zariadení.

## Zálohy

V **Nastavenia → Zálohy a export** pripravte JSON zálohu a stiahnite ju alebo zdieľajte do Súborov. JSON obsahuje všetky tabuľky a kontrolný súčet SHA-256. Obnova najprv overí súbor a zobrazí počty záznamov. Po potvrdení nahradí údaje v jednej transakcii. Export používa formát 3 so schémou IndexedDB 4 a zahŕňa aj označenia pri zápisoch a podklady potvrdených kalibrácií. Import podporuje formát 1 so schémou 2 a formát 2 so schémou 3.

CSV export vytvára samostatné súbory pre jedlá, denné nutričné súčty a merania. Formát používa UTF-8 s BOM, oddeľovač bodkočiarku, desatinnú čiarku a dátum YYYY-MM-DD. Chýbajúca hodnota je v CSV prázdna bunka.

## Automatizované testy

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Príkaz `test:e2e` vytvára vlastný produkčný build a spúšťa náhľad na porte 4173. Ak port používa manuálne spustený náhľad, najprv ho ukončite. Na Linuxe možno chýbajúce systémové knižnice doinštalovať príkazom `npx playwright install-deps chromium webkit`.

Vitest overuje aj filtre podľa úplnosti dní, historické ciele, živiny, kalibračné podmienky, integritu záloh a migráciu IndexedDB. Playwright spúšťa okrem denníka a katalógu aj offline analýzu pri šírke 390 px a potvrdenie kalibrovaného cieľa. Playwright overuje Chromium aj WebKit na Linuxe s emulovaným profilom iPhone 14 pri šírke 390 px. Testy Open Food Facts používajú kontrolované odpovede a test kamery dekóduje pripravené obrazové dáta. Overenie kamery, inštalácie na plochu a správania úložiska v samostatnej PWA na fyzickom iPhone zostáva otvorené.

## Kontrolný bod Etapy D

Na manuálnu kontrolu otvorte analýzu nad vlastnými lokálnymi údajmi. Skontrolujte označenie kompletných dní, výber obdobia a zobrazené pokrytie. Na fyzickom iPhone overte čitateľnosť a offline otvorenie v samostatnej PWA. Ďalší rozsah vyžaduje výslovné potvrdenie používateľa.

## GitHub Pages

Build pre projektovú adresu `/NutriTrack/` a lokálny náhľad pripravíte príkazmi:

```sh
npm ci
npm run build:pages
npm run preview -- --mode pages --host 127.0.0.1 --port 4173 --strictPort
```

Náhľad je na `http://127.0.0.1:4173/NutriTrack/`. Na automatizované overenie tej istej základnej cesty ukončite náhľad a spustite `NUTRITRACK_PAGES_TEST=1 npm run test:e2e`. Test overí aj rozsah service workera, manifest, ikonu a otvorenie trás offline.

Workflow **NutriTrack GitHub Pages** spúšťa kontroly pri pushi a pull requeste pre vetvu `main`. Na publikovanie vyberte v repozitári **Settings → Pages → Build and deployment → Source → GitHub Actions**. Potom v **Actions → NutriTrack GitHub Pages → Run workflow** vyberte vetvu `main` a spustite workflow ručne. Výsledná adresa je `https://mylanmylan-lab.github.io/NutriTrack/`. [Konfigurácia zdroja GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

NutriTrack ukladá údaje do IndexedDB v prehliadači podľa pôvodu. Na prechod z lokálneho náhľadu na adresu GitHub Pages použite export JSON z pôvodnej aplikácie a obnovu v publikovanej aplikácii.
