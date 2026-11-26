# Pravidlá projektu NutriTrack

- Pracuj podľa `SPECIFICATION.md` a `IMPLEMENTATION_PLAN.md`. Pred zmenami si over aktuálne potvrdenú etapu. Každú etapu ukonči prehľadom zmien a výsledkami testov. Na pokračovanie počkaj na výslovné potvrdenie používateľa.
- Text aplikácie, používateľská dokumentácia a komunikácia sú po slovensky. Texty rozhrania píš neutrálnym, vecným tónom. Pri každej obrazovke ber do úvahy ovládanie jednou rukou, systémovú tému, klávesnicu a čítačku obrazovky.
- Údaje používateľa ukladaj lokálne do IndexedDB. Pri zmene schémy pridaj novú verziu Dexie a otestuj prechod zo starej verzie s existujúcimi údajmi. Zachovaj historické nutričné hodnoty a pôvod v snímke záznamu denníka.
- Vyjadruj chýbajúcu hodnotu ako `null`. Použi explicitné jednotky, oddel miestne kalendárne dátumy od UTC pečiatok a zachovaj pôvod údajov. Pri zmenách cieľa vyžiadaj potvrdenie používateľa.
- Over licencie, atribúciu, CORS a limity pred zapojením externého zdroja. Tajomstvá patria výlučne do zabezpečeného serverového prostredia. Frontend, premenné `VITE_*` a repozitár obsahujú iba verejné hodnoty.
- MVP používa statický HTTPS hosting, jeden lokálny profil a manuálne zálohy. Fotografovanie jedla, AI vyhodnocovanie fotografií a porcií, synchronizácia a platené služby sú mimo schváleného rozsahu. Produkčné nasadenie vyžaduje výslovný súhlas.
- Pred odovzdaním spusti `npm run typecheck`, `npm test`, `npm run build` a `npm run test:e2e`. Výsledky uvádzaj spolu s rozsahom skutočného overenia. Emulácia v Playwright pokrýva prehliadač a rozmery obrazovky. Inštaláciu PWA, iOS úložisko a kameru over na fyzickom zariadení, keď sa ich týka akceptačný test.

## Identita projektu a efektivita práce

- Pracuj výhradne v repozitári `mylanmylan-lab/NutriTrack`. Pred zmenou over pracovný adresár a Git remote; pri nesúlade zastav. Nepoužívaj požiadavky PHE Register.
- PROJECT_STATUS.md používaj ako stručný stav; SPECIFICATION.md a IMPLEMENTATION_PLAN.md zostávajú záväzné. Pri rozpore si vyžiadaj rozhodnutie.
- Čítaj len relevantné súbory, vykonaj minimálnu potrebnú zmenu, nerefactoruj nesúvisiace časti. Zachovaj všetky existujúce povinné testy uvedené vyššie.
- Stručne reportuj zmenené súbory, výsledky testov a neoverené časti. PROJECT_STATUS.md aktualizuj pri podstatnej zmene. Bez súhlasu necommituj, nepushuj ani nenasadzuj.
- Do verejného repozitára nevkladaj osobné nutričné záznamy, profily, merania, zálohy ani tajomstvá.
