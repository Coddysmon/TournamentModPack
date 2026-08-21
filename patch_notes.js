// Патчноуты главного меню Nova. Читается MainMenu.lua по сети.
// ФОРМАТ ПРИДИРЧИВ: у каждой записи обязательна запятая после обратной кавычки,
// в ключе версии не может быть пробела, обратных кавычек в тексте быть не должно.
const patchNotes = {
  ru: {
    versions: {
      "12.2a": `
Точка отсчёта. Ниже — всё, чем Nova отличается от Tournament Mod 12.2a.

Мод собран на его основе и продолжает её развивать: движок, карты и EUI общие,
расходятся содержимое и баланс.
`,
      "1.0.0": `
СВОЯ НУМЕРАЦИЯ
  - Отсчёт начинается с 1.0.0, прежняя 12.x осталась в прошлом.
  - Модпак переименован в Nova. Папка обязана идти по алфавиту после Expansion2 —
    иначе игра падает в загрузчике базы ещё до меню.
`,
      "1.1.0": `
НАЦИИ ПЕРЕРАБОТАНЫ
  - У 34 наций появился свой эра-бонус: при входе в свою эпоху выбор становится
    не из трёх вариантов, а из четырёх, и четвёртый доступен только этой нации.
  - Способности 18 цивилизаций переработаны — от стен Вавилона и садов Ассирии
    до овец Англии, растущих с каждой эпохой, и датского кнорра, который
    работает в море и не расходуется.
  - Цивилизация Solaria удалена.

Старые сохранения продолжают загружаться: формат сейва не менялся.
`,
      "1.1.3": `
УНИКАЛЬНЫЕ ЗДАНИЯ НАЦИЙ
  - У шестнадцати наций уникальные здания сняты — они строят обычные постройки.
  - Появились четыре новых: Гимнасий у Греции, Аниме-магазин у Японии,
    Конюшни орду у Монголии и Фундук у Марокко.
  - Пять зданий сменили роль: французский ресторан стал рынком, па и термы —
    акведуками, Торре-де-Белем — морским портом, испанская миссия — гаванью.
  - У ацтеков починены висячие сады: +15% еды считались от избытка, а не от
    всего урожая.
`,
      "1.1.5": `
СПОСОБНОСТИ НАЦИЙ И УНИКАЛЬНЫЕ ЮНИТЫ
  - Испания и Швеция переработаны целиком: испанцы живут морем, шведы —
    национальными чудесами, каждое из которых кормит ещё и класс построек.
  - Сиаму фермы считаются стоящими у воды, сонгайцы ходят вдоль рек как по дороге,
    кельтам добавлен дворец и роскошь, османам — производство к вере.
  - У шести уникальных юнитов сняты встроенные способности: пикты, йомены,
    самураи, кобуксон, бессмертные и легион. Бессмертным возвращена мощь 12.
`,
      "1.1.7": `
ЕГИПЕТ И СНЯТЫЕ ЗДАНИЯ
  - У Египта каждое чудо света и национальное чудо даёт +1 довольства.
  - Сняты уникальные здания у Австрии, ацтеков, Египта, Германии и Сиама.
`,
      "1.1.8": `
ПЕРЕБОРКА ЧУДЕС СВЕТА
  - Изменены девятнадцать чудес. Великая библиотека больше не даёт технологию,
    Оракл — свободный институт вместо скидки, Великая стена ставит стены
    во все города.
  - Добавлены Альтинг и Панамский канал.
  - Ангкор-Ват и Фарфоровая пагода переделаны.
`,
      "1.1.9": `
ЧУДЕСА ДОДЕЛАНЫ
  - Фаросский маяк даёт великого флотоводца, а тот может осесть на прибрежной
    клетке: получается адмиралтейство с +6 производства.
  - Новый колизей за веткой Пути.
  - Терракотовая армия удваивает боевые юниты в своём городе.
  - Переработаны награды Международных игр.
`,
      "1.2.0": `
ГОЛЛАНДИЯ, ВЕНЕЦИЯ, ШОШОНЫ И ЗУЛУСЫ
  - У Голландии Улица красных фонарей и эра-бонус на Ост-Индскую компанию.
  - Венеция получила свою Ост-Индскую и прибавки к таможням.
  - Шошоны — дешёвого разведчика и ускорение конницы, зулусы — еду с пастбищ.
  - Уникальные ГЭС, исибая и стеклодувная мастерская сняты.
`,
      "1.3.0": `
НАЦИИ, ЗДАНИЯ И ИНТЕРФЕЙС
  - Эра-бонусы теперь есть у ВСЕХ наций: добавлены Дания, Япония, Османы,
    Персия и Индонезия.
  - Починены культурные бонусы Австрии, гуннов и Полинезии — они уходили мимо
    счётчика культуры и не работали с самого начала.
  - Зулусы лечат юнит на 5 при каждой прокачке, Эфиопия получила +3 довольства.
  - Рабочие сами обрабатывают морские клетки: рыбацкие лодки и морские платформы.
  - Великий музыкант даёт концерт: +4 культуры на клетке, +2 после Радио.
  - Ядерная ракета бьёт на 100% в первом радиусе и на 50% во втором, стоит
    1000 молотков и больше не покупается за золото.
  - Колесо быстрых фраз на клавишу H.
`,
      "1.4.0": `
ПЛОТИНА, ОБОГАТИТЕЛЬНЫЙ ЗАВОД И БРОНЯ
  - Чудо Плотина Гувера на Электричестве: бесплатная ГЭС, +5 производства,
    +5 золота и +1 золота с речных клеток города.
  - Здание Обогатительный завод: +4 производства и +4 науки с клетки урана.
  - Вся бронетехника сменила врождённую прокачку: вместо +20% к атаке теперь
    +50% против сухопутных.
  - Танкетка, танк и модерн подорожали, ГДР усилен до 240.
  - XCOM: 110 боевой мощи и одноразовый выстрел на 90.
  - Строй открывается от первого уровня Шока или Муштры и бьёт по броне.
  - Рабочие выходят в море с Мореходства: один ход по воде, пока нет Оптики.
  - Лесопилки перенесены в Обработку бронзы.
  - Концерт и адмиралтейство ставятся за один ход.
`,
    }
  },
  en: {
    versions: {
      "12.2a": `
Baseline. Everything below is how Nova differs from Tournament Mod 12.2a.

Nova is built on it and keeps developing it: the DLL, the maps and EUI are shared,
the content and the balance are not.
`,
      "1.0.0": `
OUR OWN NUMBERING
  - Versions start at 1.0.0; the old 12.x line is retired.
  - The modpack is renamed to Nova. Its folder must sort after Expansion2, or the
    game dies in the database loader before the menu.
`,
      "1.1.0": `
CIVILIZATIONS REWORKED
  - 34 civilizations gained an era bonus of their own: on entering their era the
    choice is four options instead of three, and the fourth is theirs alone.
  - 18 civilization abilities reworked — from Babylons walls and Assyrias gardens
    to Englands sheep that grow with every era, and the Danish Knarr that works
    at sea and is not consumed.
  - The Solaria civilization is removed.

Old saves keep loading: the save format did not change.
`,
      "1.1.3": `
UNIQUE BUILDINGS
  - Sixteen civilizations lost their unique buildings and now build the ordinary ones.
  - Four new ones appeared: Gymnasion for Greece, Anime Shop for Japan,
    Ordu Stables for Mongolia and Funduq for Morocco.
  - Five buildings changed role: the French restaurant became a market, the Pa and
    the Baths became aqueducts, Torre de Belem a seaport, the Spanish mission a harbour.
  - Aztec Hanging Gardens fixed: +15% Food counted the surplus, not the whole yield.
`,
      "1.1.5": `
ABILITIES AND UNIQUE UNITS
  - Spain and Sweden reworked outright: Spain lives off the sea, Sweden off national
    wonders, each of which also feeds a whole class of buildings.
  - Siamese farms count as riverside, Songhai move along rivers as on roads, the Celts
    gained a palace and a luxury, the Ottomans production from Faith.
  - Six unique units lost their built-in abilities: Pictish Warrior, Longbowman,
    Samurai, Turtle Ship, Immortal and Legion. The Immortal is back to 12 Strength.
`,
      "1.1.7": `
EGYPT AND REMOVED BUILDINGS
  - Every World and National Wonder gives Egypt +1 Happiness.
  - Unique buildings removed for Austria, the Aztecs, Egypt, Germany and Siam.
`,
      "1.1.8": `
WORLD WONDERS OVERHAUL
  - Nineteen wonders changed. The Great Library no longer grants a technology, the
    Oracle gives a free social policy instead of a discount, the Great Wall puts
    walls in every city.
  - Added: the Althing and the Panama Canal.
  - Angkor Wat and the Porcelain Tower reworked.
`,
      "1.1.9": `
WONDERS FINISHED
  - The Great Lighthouse grants a Great Admiral, who can settle on a coastal tile:
    an Admiralty with +6 Production.
  - A new Colosseum behind the Wayfaring branch.
  - The Terracotta Army doubles military units in its city.
  - World Games rewards reworked.
`,
      "1.2.0": `
THE NETHERLANDS, VENICE, SHOSHONE AND ZULU
  - The Netherlands gained the Red Light District and an era bonus on the East India Company.
  - Venice gained its own East India Company and customs house bonuses.
  - Shoshone: a cheaper Pathfinder and faster mounted units. Zulu: Food from pastures.
  - Unique Hydro Plant, Ikhanda and Glassworks removed.
`,
      "1.3.0": `
CIVILIZATIONS, BUILDINGS AND INTERFACE
  - EVERY civilization now has an era bonus: Denmark, Japan, the Ottomans, Persia
    and Indonesia were added.
  - Fixed the Culture bonuses of Austria, the Huns and Polynesia — they were routed
    past the Culture counter and never worked at all.
  - Zulu units heal 5 on every promotion; Ethiopia gained +3 Happiness.
  - Workers can improve water tiles themselves: fishing boats and offshore platforms.
  - A Great Musician can hold a Concert: +4 Culture on the tile, +2 more after Radio.
  - Nuclear missiles deal 100% damage in the first ring and 50% in the second, cost
    1000 Production and can no longer be bought with Gold.
  - A quick-phrase chat wheel on the H key.
`,
      "1.4.0": `
DAM, ENRICHMENT PLANT AND ARMOUR
  - Hoover Dam at Electricity: a free Hydro Plant, +5 Production, +5 Gold and
    +1 Gold from the citys river tiles.
  - Enrichment Plant: +4 Production and +4 Science from every worked Uranium tile.
  - All armour swapped its innate promotion: +50% versus land units instead of
    +20% Attack.
  - Landship, Tank and Modern Armour cost more; the Giant Death Robot is up to 240.
  - XCOM Squad: 110 Strength and a single 90-strength ranged shot.
  - Formation unlocks from Shock I or Drill I and now hits armour too.
  - Workers can embark from Sailing: one move at sea until Optics.
  - Lumber mills moved to Bronze Working.
  - Concert and Admiralty are placed in a single turn.
`,
    }
  }
}
