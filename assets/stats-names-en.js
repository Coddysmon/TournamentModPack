/* ---------------------------------------------------------------------------
   Названия цивилизаций и типов побед ПО-АНГЛИЙСКИ для страницы статистики.
   Подключается только английской страницей (en/stats.html); русская работает
   со стандартным stats-names.js.

   Названия — как в английской Civilization V (Ottomans, Shoshone, Songhai…),
   а не перевод русских подписей: игрок ищет глазами то имя, которое видит
   в своей игре. Ключи те же, что в stats-names.js, — они приходят из журнала
   партии.

   VICTORY_SCRAP — не победа игры, а свёрнутая голосованием партия; в Civ5
   такого типа нет, поэтому подпись своя.
   --------------------------------------------------------------------------- */
'use strict';
const NOVA_STATS_NAMES_EN = {
  civs: {
    "CIVILIZATION_AMERICA": "America", "CIVILIZATION_ARABIA": "Arabia", "CIVILIZATION_AZTEC": "Aztecs",
    "CIVILIZATION_CHINA": "China", "CIVILIZATION_EGYPT": "Egypt", "CIVILIZATION_ENGLAND": "England",
    "CIVILIZATION_FRANCE": "France", "CIVILIZATION_GERMANY": "Germany", "CIVILIZATION_GREECE": "Greece",
    "CIVILIZATION_INDIA": "India", "CIVILIZATION_IROQUOIS": "Iroquois", "CIVILIZATION_JAPAN": "Japan",
    "CIVILIZATION_OTTOMAN": "Ottomans", "CIVILIZATION_PERSIA": "Persia", "CIVILIZATION_ROME": "Rome",
    "CIVILIZATION_RUSSIA": "Russia", "CIVILIZATION_SIAM": "Siam", "CIVILIZATION_SONGHAI": "Songhai",
    "CIVILIZATION_MONGOL": "Mongolia", "CIVILIZATION_INCA": "Inca", "CIVILIZATION_SPAIN": "Spain",
    "CIVILIZATION_POLYNESIA": "Polynesia", "CIVILIZATION_DENMARK": "Denmark", "CIVILIZATION_KOREA": "Korea",
    "CIVILIZATION_BABYLON": "Babylon", "CIVILIZATION_AUSTRIA": "Austria", "CIVILIZATION_BYZANTIUM": "Byzantium",
    "CIVILIZATION_CARTHAGE": "Carthage", "CIVILIZATION_CELTS": "Celts", "CIVILIZATION_ETHIOPIA": "Ethiopia",
    "CIVILIZATION_HUNS": "Huns", "CIVILIZATION_MAYA": "Maya", "CIVILIZATION_NETHERLANDS": "Netherlands",
    "CIVILIZATION_SWEDEN": "Sweden", "CIVILIZATION_ASSYRIA": "Assyria", "CIVILIZATION_BRAZIL": "Brazil",
    "CIVILIZATION_INDONESIA": "Indonesia", "CIVILIZATION_MOROCCO": "Morocco", "CIVILIZATION_POLAND": "Poland",
    "CIVILIZATION_PORTUGAL": "Portugal", "CIVILIZATION_SHOSHONE": "Shoshone", "CIVILIZATION_VENICE": "Venice",
    "CIVILIZATION_ZULU": "Zulu"
  },
  victories: {
    "VICTORY_TIME": "Time", "VICTORY_SPACE_RACE": "Science", "VICTORY_DOMINATION": "Domination",
    "VICTORY_CULTURAL": "Culture", "VICTORY_DIPLOMATIC": "Diplomatic", "VICTORY_SCRAP": "Match scrapped"
  },
};
