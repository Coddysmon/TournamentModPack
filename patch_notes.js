// Патчноуты главного меню Nova. Читается MainMenu.lua по сети.
// Содержание сверено с тегом 12.2a репозитория движка, а не написано по памяти.
// ФОРМАТ ПРИДИРЧИВ: после каждой обратной кавычки обязательна запятая,
// в ключе не может быть пробела, обратных кавычек в тексте быть не должно.
const patchNotes = {
  ru: {
    versions: {
      "Nova": `
ЧЕМ ЭТОТ МОД ОТЛИЧАЕТСЯ ОТ TOURNAMENT MOD 12.2a

Nova собрана на основе Tournament Mod 12.2a и продолжает её развивать.
Общими остаются игровой движок как основа, карты и интерфейс EUI.
Расходятся содержимое и баланс.

Сверено по данным, а не по памяти: 158 таблиц с отличиями,
1887 строк добавлено, 399 убрано, 312 изменено.
В движке 81 новая механика, 45 изменённых файлов.

Разделы ниже — что именно изменилось. В конце — история версий.
`,
      "Нации": `
ЭРА-БОНУСЫ
  - У каждой нации появился свой эра-бонус: при входе в свою эпоху выбор
    становится не из трёх вариантов, а из четырёх, и четвёртый доступен
    только этой нации. Всего 43 таких бонуса плюс 22 общих.

ПЕРЕРАБОТАННЫЕ СПОСОБНОСТИ
  - Изменены 16 национальных черт. Испания живёт морем, Швеция —
    национальными чудесами, Сиаму фермы считаются стоящими у воды,
    Сонгай ходит вдоль рек как по дороге, Полинезия и Ассирия переделаны.
  - У шестнадцати наций сняты уникальные здания — они строят обычные.
  - У шести уникальных юнитов сняты встроенные способности.
  - Цивилизация Solaria удалена.
`,
      "Политики": `
ТРИ НОВЫЕ ВЕТКИ
  - Наследие: 22 политики, эра-бонусы наций живут здесь.
  - Пути: 7 политик — дороги, караваны, постоялые дворы, торговая хартия.
  - Бастион: 7 политик — оборонительная ветка средневековья, слоты
    специалистов в стенах и замках, вдвое дешёвые оборонительные постройки,
    доход с рек, урон по площади в закрытии.
  - Отдельно добавлены Свободный разум, Железный кулак и Народная армия.

Всего 82 новые политики и 87 переработанных.
`,
      "Религия": `
ВЕРОВАНИЯ
  - Добавлено 58 новых верований, 10 убрано, 6 переработано.
  - Среди новых — Кузница богов, Дары земли, Пустынное гостеприимство,
    Крепость веры, Странствующие проповедники, Фукудзин и другие.
  - Переработаны выдачи верований от зданий и от ресурсов:
    152 новые строки по зданиям и 80 по ресурсам.
`,
      "Ресурсы": `
ПЯТНАДЦАТЬ НОВЫХ РЕСУРСОВ
  - Роскошь: ячмень, пиво, коньяк, икра, красная икра, сыр, мёд, перья,
    ананас, платина, картофель, рис.
  - Стратегические и прочие: известняк, сталь, сера.
  - Шесть прежних переделаны: медь, самоцветы, золото, соль, серебро, вино.
  - Появление на местности переписано: 37 новых правил размещения.
  - Асимметричная торговля: рис, ячмень и картофель дают три довольства,
    пиво, коньяк и вино — пять.
`,
      "Здания": `
СОРОК ОДНО НОВОЕ ЗДАНИЕ
  - Роскошь в дело: монетный двор, ювелирная мастерская, фруктовые ряды,
    зерновой двор, кузнечный двор, ткацкая мануфактура, винокурня,
    придорожная закусочная, резчики по кости.
  - Уникальные: Гимнасий у Греции, Аниме-магазин у Японии, Конюшни орду
    у Монголии, Фундук у Марокко, Улица красных фонарей у Голландии,
    Ост-Индские компании у Голландии и Венеции.
  - Швеция получила собственную линейку национальных чудес: своя Оксфордская
    академия, Эрмитаж, Национальный колледж, Ироический эпос и другие.
  - Религиозные: церковь, синагога, ступа.
  - Культурные: зал искусств, зал письма, вокальная камера.
  - Обогатительный завод на уране, нефтеперерабатывающий завод.
  - Сняты: амбар и угольная станция.

Ещё 43 здания переработаны.
`,
      "Чудеса": `
НОВЫЕ
  - Альтинг, Панамский канал, Великий колизей, Плотина Гувера.

ПЕРЕРАБОТАННЫЕ
  - Великая библиотека больше не даёт технологию, Оракл даёт свободный
    институт вместо скидки, Великая стена ставит стены во все города.
  - Ангкор-Ват и Фарфоровая пагода переделаны.
  - Фаросский маяк даёт великого флотоводца.
  - Терракотовая армия удваивает боевые юниты в своём городе.
  - Статуя Свободы даёт довольство, культуру и сразу четырёх жителей.
  - У Египта каждое чудо даёт +1 довольства.
`,
      "Юниты": `
ДЕВЯТЬ НОВЫХ
  - Флот: датский кнорр, португальская каррака, тяжёлый крейсер,
    океанская трирема.
  - Суша и воздух: ударный вертолёт.
  - Великие люди: интендант, маршал, меценат, караван-посланник.

ДВАДЦАТЬ ТРИ ПЕРЕРАБОТАННЫХ
  - Вся бронетехника сменила врождённую прокачку: +50% против сухопутных
    вместо +20% к атаке. Цены подняты, ГДР усилен до 240.
  - XCOM: 110 боевой мощи и одноразовый выстрел на 90.
  - Ядерная ракета бьёт на 100% в первом радиусе и 50% во втором,
    стоит 1000 молотков и не покупается за золото.
  - Галера стреляет на две клетки.
  - Рабочий выходит в море с Мореходства и обрабатывает морские клетки.
`,
      "Клетки": `
НОВЫЕ УЛУЧШЕНИЯ
  - Адмиралтейство: великий флотоводец оседает на прибрежной клетке.
  - Концерт: великий музыкант даёт +4 культуры, +2 после Радио.
  - Схрон интенданта: +5 еды и лечение города.
  - Бастион, поместье, типи, горный тоннель.
  - Понтонный и океанский мосты, водяной польдер.

ЧТО УМЕЕТ РАБОЧИЙ
  - Рыбацкие лодки и морские платформы без гибели.
  - Тринадцать новых построек всего.
`,
      "Движок": `
81 НОВАЯ МЕХАНИКА В САМОМ ДВИЖКЕ
  - 45 изменённых файлов, свыше семи тысяч строк кода.
  - Затухание урона ядерного удара по радиусу.
  - Одноразовый дальний выстрел у юнита.
  - Высадка на воду от отдельной технологии у выбранных юнитов.
  - Захват клеток улучшением только в свою сторону границы.
  - Технология за захват города, выдачи за расход великого человека.
  - Шахты на роскоши после Горного дела, посольства с начала игры.

Формат сохранений совместим: старые партии продолжают загружаться.
`,
      "Интерфейс": `
  - Колесо быстрых фраз на клавишу H с собственной озвучкой.
  - Эра-бонус нации виден при её выборе и на загрузочном экране.
  - Патчноуты этого окна теперь свои, а не чужие.
  - Свои курсоры, выбираются в лаунчере.
  - Русский перевод веток политик и переработанных описаний.
`,
      "1.0.0": `
СВОЯ НУМЕРАЦИЯ
  - Отсчёт начинается с 1.0.0, прежняя 12.x осталась в прошлом.
  - Модпак переименован в Nova. Папка обязана идти по алфавиту после
    Expansion2 — иначе игра падает в загрузчике базы ещё до меню.
`,
      "1.1.0": `
НАЦИИ ПЕРЕРАБОТАНЫ
  - У 34 наций появился свой эра-бонус.
  - Способности 18 цивилизаций переработаны.
  - Цивилизация Solaria удалена.
`,
      "1.1.3": `
УНИКАЛЬНЫЕ ЗДАНИЯ НАЦИЙ
  - У шестнадцати наций уникальные здания сняты.
  - Появились Гимнасий, Аниме-магазин, Конюшни орду и Фундук.
  - Пять зданий сменили роль.
  - У ацтеков починены висячие сады.
`,
      "1.1.5": `
СПОСОБНОСТИ И УНИКАЛЬНЫЕ ЮНИТЫ
  - Испания и Швеция переработаны целиком.
  - У шести уникальных юнитов сняты встроенные способности.
`,
      "1.1.8": `
ПЕРЕБОРКА ЧУДЕС СВЕТА
  - Изменены девятнадцать чудес.
  - Добавлены Альтинг и Панамский канал.
`,
      "1.1.9": `
ЧУДЕСА ДОДЕЛАНЫ
  - Фаросский маяк даёт великого флотоводца, тот строит адмиралтейство.
  - Новый колизей за веткой Пути.
  - Переработаны награды Международных игр.
`,
      "1.2.0": `
ГОЛЛАНДИЯ, ВЕНЕЦИЯ, ШОШОНЫ И ЗУЛУСЫ
  - Улица красных фонарей и Ост-Индская компания у Голландии.
  - Венеция получила свою Ост-Индскую и прибавки к таможням.
  - Шошоны и зулусы переработаны.
`,
      "1.3.0": `
НАЦИИ, ЗДАНИЯ И ИНТЕРФЕЙС
  - Эра-бонусы теперь есть у ВСЕХ наций.
  - Починены культурные бонусы Австрии, гуннов и Полинезии.
  - Рабочие обрабатывают морские клетки, музыкант даёт концерт.
  - Ядерная ракета переработана. Колесо быстрых фраз на клавишу H.
`,
      "1.4.0": `
ПЛОТИНА, ОБОГАТИТЕЛЬНЫЙ ЗАВОД И БРОНЯ
  - Чудо Плотина Гувера на Электричестве: бесплатная ГЭС, +5 производства,
    +5 золота и +1 золота с речных клеток города.
  - Здание Обогатительный завод: +4 производства и +4 науки с клетки урана.
  - Вся бронетехника: +50% против сухопутных вместо +20% к атаке.
  - XCOM: 110 боевой мощи и одноразовый выстрел на 90.
  - Строй открывается от Шока I или Муштры I и бьёт по броне.
  - Рабочие выходят в море с Мореходства.
  - Лесопилки перенесены в Обработку бронзы.
`,
    }
  },
  en: {
    versions: {
      "Nova": `
HOW THIS MOD DIFFERS FROM TOURNAMENT MOD 12.2a

Nova is built on Tournament Mod 12.2a and keeps developing it.
The game DLL as a base, the maps and the EUI interface are shared.
The content and the balance are not.

Measured against the data, not from memory: 158 tables differ,
1887 rows added, 399 removed, 312 changed.
The DLL carries 81 new mechanics across 45 changed files.

The sections below are what changed. Version history is at the end.
`,
      "Civilizations": `
ERA BONUSES
  - Every civilization gained an era bonus of its own: on entering its era
    the choice is four options instead of three, and the fourth is theirs
    alone. 43 such bonuses plus 22 shared ones.

REWORKED ABILITIES
  - 16 civilization traits changed. Spain lives off the sea, Sweden off
    national wonders, Siamese farms count as riverside, Songhai move along
    rivers as on roads, Polynesia and Assyria reworked.
  - Sixteen civilizations lost their unique buildings.
  - Six unique units lost their built-in abilities.
  - The Solaria civilization is removed.
`,
      "Policies": `
THREE NEW BRANCHES
  - Legacy: 22 policies, home of the civilization era bonuses.
  - Wayfaring: 7 policies — roads, caravans, waystations, charter of trade.
  - Bulwark: 7 policies — a medieval defensive branch with specialist slots
    in walls and castles, half-price defensive buildings, income from rivers
    and area damage on completion.
  - Also added: Free Mind, Iron Fist and Peoples Army.

82 new policies and 87 reworked in total.
`,
      "Religion": `
BELIEFS
  - 58 new beliefs added, 10 removed, 6 reworked.
  - Among the new ones: God of the Forge, Gifts of the Earth, Desert
    Hospitality, Fortress of Faith, Distant Faithful, Fukujin and more.
  - Belief yields from buildings and resources rewritten: 152 new rows
    for buildings and 80 for resources.
`,
      "Resources": `
FIFTEEN NEW RESOURCES
  - Luxuries: barley, beer, cognac, caviar, red caviar, cheese, honey,
    feathers, pineapple, platinum, potato, rice.
  - Strategic and other: limestone, steel, sulfur.
  - Six existing ones reworked: copper, gems, gold, salt, silver, wine.
  - Placement rewritten: 37 new terrain rules.
  - Asymmetric trade: rice, barley and potato give three Happiness,
    beer, cognac and wine give five.
`,
      "Buildings": `
FORTY-ONE NEW BUILDINGS
  - Luxuries put to work: mint, jewellers workshop, fruit rows, grain yard,
    forge yard, weavers manufactory, distillery, roadside diner,
    ivory carvers workshop.
  - Uniques: Gymnasion for Greece, Anime Shop for Japan, Ordu Stables for
    Mongolia, Funduq for Morocco, Red Light District for the Netherlands,
    East India Companies for the Netherlands and Venice.
  - Sweden gained its own line of national wonders.
  - Religious: church, synagogue, stupa.
  - Cultural: art hall, writing auditorium, vocal chamber.
  - Enrichment plant on Uranium, oil refinery.
  - Removed: barn and charcoal plant.

43 more buildings reworked.
`,
      "Wonders": `
NEW
  - The Althing, the Panama Canal, the Great Colosseum, the Hoover Dam.

REWORKED
  - The Great Library no longer grants a technology, the Oracle gives a free
    policy instead of a discount, the Great Wall puts walls in every city.
  - Angkor Wat and the Porcelain Tower reworked.
  - The Great Lighthouse grants a Great Admiral.
  - The Terracotta Army doubles military units in its city.
  - The Statue of Liberty gives Happiness, Culture and four Population.
  - Every wonder gives Egypt +1 Happiness.
`,
      "Units": `
NINE NEW
  - Naval: Danish Knarr, Portuguese Carrack, Heavy Cruiser, Ocean Trireme.
  - Air: Attack Helicopter.
  - Great people: Quartermaster, Marshal, Maecenas, Envoy Caravan.

TWENTY-THREE REWORKED
  - All armour swapped its innate promotion: +50% versus land units
    instead of +20% Attack. Costs raised, the GDR is up to 240.
  - XCOM Squad: 110 Strength and a single 90-strength ranged shot.
  - Nuclear missiles: 100% damage in the first ring, 50% in the second,
    1000 Production, no Gold purchase.
  - The Galley fires two tiles.
  - Workers embark from Sailing and improve water tiles.
`,
      "Tiles": `
NEW IMPROVEMENTS
  - Admiralty: a Great Admiral settles on a coastal tile.
  - Concert: a Great Musician gives +4 Culture, +2 more after Radio.
  - Quartermaster Cache: +5 Food and healing for the city.
  - Bastion, estate, tipi, mountain tunnel.
  - Pontoon and ocean bridges, water polder.

WHAT THE WORKER CAN DO
  - Fishing boats and offshore platforms without being consumed.
  - Thirteen new builds in total.
`,
      "Engine": `
81 NEW MECHANICS IN THE DLL ITSELF
  - 45 changed files, over seven thousand lines of code.
  - Nuclear damage falls off with range.
  - A single-use ranged attack per unit.
  - Embarkation from a per-unit technology.
  - Improvement culture bombs only towards your own border.
  - A technology for taking a city, yields for expending a Great Person.
  - Mines on luxuries after Mining, embassies from the start of the game.

Save format stays compatible: old games keep loading.
`,
      "Interface": `
  - A quick-phrase chat wheel on the H key with its own voice lines.
  - The era bonus is visible when picking a civilization and on the load screen.
  - These patch notes are now ours rather than borrowed.
  - Custom cursors, chosen in the launcher.
`,
      "1.0.0": `
OUR OWN NUMBERING
  - Versions start at 1.0.0; the old 12.x line is retired.
  - The modpack is renamed to Nova.
`,
      "1.1.0": `
CIVILIZATIONS REWORKED
  - 34 civilizations gained an era bonus of their own.
  - 18 civilization abilities reworked.
`,
      "1.1.3": `
UNIQUE BUILDINGS
  - Sixteen civilizations lost their unique buildings.
  - Gymnasion, Anime Shop, Ordu Stables and Funduq added.
`,
      "1.1.5": `
ABILITIES AND UNIQUE UNITS
  - Spain and Sweden reworked outright.
  - Six unique units lost their built-in abilities.
`,
      "1.1.8": `
WORLD WONDERS OVERHAUL
  - Nineteen wonders changed.
  - The Althing and the Panama Canal added.
`,
      "1.1.9": `
WONDERS FINISHED
  - The Great Lighthouse grants a Great Admiral, who builds an Admiralty.
  - A new Colosseum behind the Wayfaring branch.
`,
      "1.2.0": `
THE NETHERLANDS, VENICE, SHOSHONE AND ZULU
  - Red Light District and East India Company for the Netherlands.
  - Venice gained its own East India Company.
`,
      "1.3.0": `
CIVILIZATIONS, BUILDINGS AND INTERFACE
  - EVERY civilization now has an era bonus.
  - Culture bonuses of Austria, the Huns and Polynesia fixed.
  - Workers improve water tiles; a Musician can hold a Concert.
  - Nuclear missiles reworked. Chat wheel on the H key.
`,
      "1.4.0": `
DAM, ENRICHMENT PLANT AND ARMOUR
  - Hoover Dam at Electricity: a free Hydro Plant, +5 Production, +5 Gold
    and +1 Gold from the citys river tiles.
  - Enrichment Plant: +4 Production and +4 Science from each Uranium tile.
  - All armour: +50% versus land units instead of +20% Attack.
  - XCOM Squad: 110 Strength and a single 90-strength shot.
  - Formation unlocks from Shock I or Drill I and hits armour.
  - Workers embark from Sailing. Lumber mills moved to Bronze Working.
`,
    }
  }
}
