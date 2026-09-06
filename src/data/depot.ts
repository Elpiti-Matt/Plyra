import type { EdgeKind, GEdge, GNode, Graph, NodeKind, Sheet } from "../model/types";
import { gridLayout } from "../lib/graph";

// Листы — каждый в своей нотации. Это и есть иллюстрация тезиса статьи:
// нотация заставляет жить внутри себя, а реальная сущность (парковка, котельная) не выбирает одну.
const SHEETS: Sheet[] = [
  { id: "ter", name: "Территория", notation: "план / объекты", color: "#0ea5e9", limit: 30, description: "Что физически стоит на 14,2 га бывшего трамвайного депо." },
  { id: "law", name: "Право", notation: "реестр требований", color: "#a855f7", limit: 32, description: "Статусы, зоны, нормы, согласования. Здесь всё — требование или процедура." },
  { id: "eco", name: "Экономика", notation: "модель / метрики", color: "#f97316", limit: 32, description: "CAPEX, доходы, окупаемость. Здесь всё измеряется в рублях и процентах." },
  { id: "ppl", name: "Люди", notation: "карта стейкхолдеров", color: "#f43f5e", limit: 26, description: "Кто решает, кто влияет, кто пострадает и кто заплатит." },
  { id: "tra", name: "Транспорт", notation: "потоки", color: "#14b8a6", limit: 20, description: "Как люди и грузы попадают на площадку и уезжают с неё." },
  { id: "env", name: "Среда", notation: "риски и гипотезы", color: "#84cc16", limit: 26, description: "Грунты, шум, деревья, микроклимат." },
  { id: "lea", name: "Аренда", notation: "процесс", color: "#eab308", limit: 20, description: "Как площади превращаются в арендаторов и деньги." },
  { id: "sta", name: "Этапы", notation: "дорожная карта", color: "#64748b", limit: 24, description: "Очереди, вехи, зависимости во времени." },
  { id: "dat", name: "Данные", notation: "источники", color: "#2563eb", limit: 18, description: "Откуда мы вообще что-то знаем про площадку." },
];

type N = [string, NodeKind, string, string[], string];

const NODES: N[] = [
  // ---- Территория ----
  ["site", "entity", "Площадка депо, 14,2 га", ["ter", "law", "eco"], "Бывшее трамвайное депо. Три корпуса, котельная, поворотный круг, 1,8 км путей.\n\n| Параметр | Значение |\n|---|---|\n| Площадь | 14,2 га |\n| Застройка | 31 % |\n| Год основания | 1912 |"],
  ["boiler", "entity", "Котельная 1932", ["ter", "law", "eco", "env", "sta"], `Краснокирпичная котельная с трубой 42 м. Единственный объект, который одновременно памятник, актив, источник загрязнения и веха графика.\n\n| Лист | Чем является |\n|---|---|\n| Территория | здание 1 240 м² |\n| Право | предмет охраны ОКН |\n| Экономика | лот под фудхолл, 2,1 млрд аренды за 10 лет |\n| Среда | мазутный грунт под фундаментом |\n| Этапы | веха «конец очереди 1» |`],
  ["bld_A", "entity", "Корпус А (вагоноремонтный)", ["ter", "lea", "sta"], "Пролёт 18 м, 6 800 м². Лофт-офисы и мастерские. Первый корпус, который начинает приносить деньги."],
  ["bld_B", "entity", "Корпус Б (кузнечный)", ["ter", "env"], "2 300 м², следы масел в полах. Судьба зависит от результата изысканий."],
  ["bld_V", "entity", "Корпус В", ["ter"], "Склад 1978 года, ценности не представляет. Под снос. Контрольный одно-листовой узел: у него нет позвоночника в стопке."],
  ["turntable", "entity", "Поворотный круг", ["ter", "law", "ppl", "eco", "sta"], "Чугунный круг 1912 года диаметром 16 м. Технически бесполезен, но именно за него борются градозащитники, он попадает в предмет охраны, вокруг него собирается площадь и он держит график первой очереди."],
  ["rails", "entity", "Подъездные пути", ["ter", "tra", "law"], "1,8 км путей, часть — действующая ветка РЖД. Сохранить как променад или демонтировать — вопрос сервитута."],
  ["square", "entity", "Центральная площадь", ["ter", "ppl", "sta"], "Пространство вокруг поворотного круга. Главный аргумент для публичных слушаний."],
  ["park", "entity", "Линейный парк вдоль путей", ["ter", "env", "eco"], "Полоса 30 × 600 м. В экономике — это «плюс 6 % к цене жилья», в среде — 84 взрослых дерева."],
  ["parking", "entity", "Парковка", ["ter", "tra", "law", "eco", "ppl"], "Один и тот же объект, который каждая нотация видит по-своему.\n\n| Лист | Кто и что имеет в виду |\n|---|---|\n| Территория | 2 подземных уровня, 640 мест |\n| Транспорт | генератор 1 900 поездок/сутки |\n| Право | норматив 1 место / 80 м² |\n| Экономика | CAPEX 1,1 млрд, доход 38 млн/год |\n| Люди | «во дворе не будет машин» — обещание жителям |\n\nВ дереве этот узел пришлось бы продублировать пять раз."],
  ["water_tower", "entity", "Водонапорная башня", ["ter", "law"], "Башня 1914 года, 28 м. Смотровая площадка — если экспертиза разрешит лестницу."],
  ["soil", "risk", "Загрязнённые грунты", ["ter", "env", "eco", "sta"], "Мазут, тяжёлые металлы под котельной и корпусом Б. Объём выемки 18–40 тыс. м³ — разброс в 2 раза, и это разброс в 600 млн."],
  ["gate", "entity", "Главные ворота", ["ter", "tra"], "Исторический въезд с улицы Депутатской. Единственная точка заезда стройки."],
  ["fence", "rule", "Периметр и ограждение", ["ter", "sta"], "Временное ограждение стройки не должно закрывать проход к трамвайной остановке."],
  ["plan_master", "note", "Мастер-план 1:2000", ["ter", "dat"], "Версия 4.2 от архбюро. Актуальная — в BIM, а не в PDF."],
  // ---- Право ----
  ["heritage", "rule", "Статус ОКН регионального значения", ["law", "sta"], "Предмет охраны: котельная, башня, поворотный круг, фасады корпуса А. Любые работы — только после экспертизы."],
  ["pzz", "rule", "ПЗЗ: зона П-2 → Ж-3", ["law", "sta", "eco"], "Смена территориальной зоны — процедура на 8–14 месяцев. Без неё жильё невозможно, а без жилья не сходится IRR."],
  ["sanzone", "rule", "Санитарно-защитная зона ТЭЦ", ["law", "env", "ter"], "Восточные 2,1 га попадают в СЗЗ соседней ТЭЦ. Жильё там запрещено, офисы — можно."],
  ["heritage_expert", "process", "Историко-культурная экспертиза", ["law", "sta"], "- выбор аттестованного эксперта\n- акт ГИКЭ\n- общественное обсуждение 15 дней\n- согласование КГИОП"],
  ["gpzu", "process", "ГПЗУ и ТУ на сети", ["law", "sta"], "Градплан и технические условия. Электричество — узкое место: свободной мощности 1,2 МВт при потребности 4."],
  ["servitude", "rule", "Сервитут РЖД на путях", ["law", "tra"], "Ветка формально действующая. Снять сервитут можно только через федеральную комиссию."],
  ["pp_norm", "rule", "Норматив парковочных мест 1/80 м²", ["law", "tra"], "Региональный норматив. Даёт 640 мест — вдвое больше, чем показывает транспортная модель."],
  ["noise_norm", "rule", "СанПиН по шуму 45 дБА ночью", ["law", "env"], "Для жилья ночью — 45 дБА у фасада. Событийная площадка в котельной даёт 58."],
  ["lawyer", "person", "Юрист по земле (Ковалёва)", ["law", "ppl"], "Ведёт смену зоны и сервитут. Единственная, кто читал все 14 томов."],
  ["kgiop", "person", "Комитет по охране памятников", ["law", "ppl"], "Согласующий орган. Позиция: «сохраняем всё, что видно с улицы»."],
  // ---- Экономика ----
  ["capex", "metric", "CAPEX 4,8 млрд ₽", ["eco", "sta"], "| Статья | млрд ₽ |\n|---|---|\n| Рекультивация | 0,6–1,2 |\n| Реставрация ОКН | 0,9 |\n| Корпуса А, Б | 1,1 |\n| Парковка | 1,1 |\n| Сети и парк | 0,7 |"],
  ["irr", "metric", "IRR проекта", ["eco"], "Базовый сценарий 17,2 %. Без жилья — 9,4 %. Без парковки — 18,1 % (да, парковка убыточна)."],
  ["rent_rate", "metric", "Ставка аренды офис/лофт", ["eco", "lea"], "1 950 ₽/м²/мес в базе. Брокер обещает 2 300 при якоре."],
  ["resi_price", "metric", "Цена м² жилья", ["eco", "dat"], "285 тыс. ₽/м² по аналогам. Парк даёт +6 %, вид на трубу котельной — спорно."],
  ["bank", "entity", "Проектное финансирование", ["eco", "ppl"], "Банк требует 30 % предпродаж и снятый статус СЗЗ до открытия лимита."],
  ["phase_econ", "note", "Экономика по очередям", ["eco", "sta"], "Очередь 1 (аренда) выходит в плюс на 4-й год и финансирует изыскания под очередь 3."],
  ["remediation_cost", "metric", "Стоимость рекультивации", ["eco", "env"], "От 600 млн до 1,2 млрд. Главная неопределённость модели."],
  ["parking_rev", "metric", "Доход от парковки", ["eco"], "38 млн ₽/год при загрузке 55 %. Окупаемость 29 лет."],
  ["anchor", "entity", "Якорный арендатор (фудхолл)", ["eco", "lea", "ppl"], "Оператор фудхолла на 3 200 м² в котельной. Условие: открытие не позже 2028."],
  ["subsidy", "hypothesis", "Субсидия на ОКН", ["eco", "law"], "Гипотеза: региональная программа компенсирует до 40 % реставрации. Пока подтверждений нет."],
  ["h_mixed", "hypothesis", "Mixed-use окупается быстрее", ["eco", "lea"], "Гипотеза: смесь аренды и жилья даёт денежный поток раньше, чем чистое жильё."],
  ["d_keep_boiler", "decision", "Решение: сохранить котельную", ["eco", "ter", "sta"], "Принято 14.03. Аргументы: статус ОКН, якорь, идентичность места. Цена решения — +0,9 млрд CAPEX."],
  // ---- Люди ----
  ["residents", "person", "Жители соседних кварталов", ["ppl", "env", "tra"], "~6 000 человек. Боятся шума, машин и того, что парк не построят."],
  ["rzd", "person", "РЖД (собственник путей)", ["ppl", "tra", "law"], "Формально не против, но комиссия по сервитуту собирается дважды в год."],
  ["investor", "person", "Инвестор (фонд)", ["ppl", "eco"], "Горизонт 12 лет, целевой IRR ≥ 15 %."],
  ["city", "person", "Администрация города", ["ppl", "law"], "Хочет парк и площадь. Готова помочь с ПЗЗ, если будет социальная нагрузка."],
  ["activists", "person", "Градозащитники", ["ppl", "law"], "Защищают поворотный круг и башню. Могут остановить экспертизу жалобой."],
  ["tenants", "person", "Будущие арендаторы", ["ppl", "lea"], "Мастерские, студии, IT-команды. Хотят въехать до окончания стройки."],
  ["architect", "person", "Архбюро (ГАП)", ["ppl", "sta"], "Ведёт мастер-план и BIM. Отвечает за согласование с КГИОП."],
  ["night_noise", "risk", "Ночной шум", ["ppl", "env", "law", "tra", "lea"], "Понятие без физического носителя. Его нет ни в одном здании, но он связывает жителей, СанПиН, событийную площадку, грузовой заезд и договоры аренды. 9 связей в четыре листа."],
  ["public_hearing", "process", "Публичные слушания", ["ppl", "law", "sta"], "Обязательны для смены зоны. Ключевая карта — площадь и парк."],
  ["conflict_pp", "risk", "Конфликт: парковка vs двор", ["ppl", "ter"], "Жителям обещан двор без машин, норматив требует 640 мест. Единственный выход — подземная парковка за 1,1 млрд."],
  ["pm", "person", "Руководитель проекта", ["ppl", "sta"], "Держит график и эту карту."],
  // ---- Транспорт ----
  ["tram", "entity", "Трамвайная линия №6", ["tra", "ter"], "Остановка у главных ворот. 11 000 пассажиров в сутки — главный аргумент против 640 парковочных мест."],
  ["traffic_model", "process", "Транспортная модель", ["tra", "dat"], "Модель на PTV Visum. Показывает потребность 310 мест, а не 640."],
  ["bike", "entity", "Велодорожка", ["tra", "env"], "Вдоль путей через линейный парк, связь с городской сетью."],
  ["trucks", "process", "Грузовой заезд стройки", ["tra", "sta", "env"], "До 120 самосвалов в сутки на этапе выемки грунта. Только через главные ворота, только днём."],
  ["metro", "entity", "Метро 900 м", ["tra", "eco"], "Станция «Заводская» в 12 минутах пешком. В экономике — коэффициент к ставке аренды."],
  ["pp_demand", "metric", "Спрос на парковку", ["tra", "dat"], "310 мест в пике по модели; 640 по нормативу."],
  ["crossing", "entity", "Переезд через пути", ["tra", "law", "ter"], "Единственная связь с южной частью. Устройство переезда — согласование с РЖД."],
  ["logistics", "process", "Логистика арендаторов", ["tra", "lea"], "Разгрузка для мастерских и фудхолла: окно 7:00–10:00, чтобы не пересекаться с жителями."],
  // ---- Среда ----
  ["trees", "entity", "Взрослые деревья (84 шт.)", ["env", "ter"], "Тополя и клёны вдоль путей. Компенсационная посадка 1:3 при сносе."],
  ["storm", "entity", "Ливневая канализация", ["env", "ter", "sta"], "Существующая сеть 1960-х не примет сток с новых кровель. Нужна новая — до первой очереди."],
  ["ecology_report", "process", "Инженерно-экологические изыскания", ["env", "dat"], "142 скважины. Отчёт — основа для оценки рекультивации."],
  ["microclimate", "hypothesis", "Ветровой комфорт двора", ["env"], "Гипотеза: корпус Б защищает двор от северного ветра. Проверяется CFD-расчётом."],
  ["heat_island", "risk", "Тепловой остров", ["env"], "Площадь и парковка без тени дают +4 °C летом."],
  ["green_roof", "hypothesis", "Зелёные кровли", ["env", "eco"], "Гипотеза: кровли снимают 30 % стока и окупаются через ливнёвку."],
  ["dust", "risk", "Пыль при сносе", ["env", "ppl", "sta"], "Снос корпуса В и выемка грунта — 4 месяца пыли у жилых домов."],
  // ---- Аренда ----
  ["lease_process", "process", "Процесс сдачи в аренду", ["lea"], "- лист ожидания\n- показ\n- LOI\n- отделка\n- договор\n- въезд"],
  ["lot_plan", "entity", "Нарезка лотов корпуса А", ["lea", "ter"], "38 лотов от 60 до 800 м². Гибкая нарезка по сетке колонн 6 м."],
  ["fitout", "process", "Отделка под арендатора", ["lea", "sta"], "Shell&core + 12 недель. Критично для якоря."],
  ["vacancy", "metric", "Вакантность", ["lea", "eco"], "Целевая 8 %. В модели банка заложено 15 %."],
  ["coworking", "entity", "Коворкинг 2 400 м²", ["lea", "eco"], "Оператор сетевой, ставка ниже рынка, но заполняет корпус А на старте."],
  ["events", "entity", "Событийная площадка в котельной", ["lea", "ppl", "env"], "Концерты и ярмарки в машинном зале. Источник дохода и ночного шума одновременно."],
  ["lease_rules", "rule", "Правила дома для арендаторов", ["lea"], "Шум после 23:00 запрещён, разгрузка только утром, вывески по дизайн-коду."],
  ["broker", "person", "Брокер", ["lea", "ppl"], "Консультант по коммерческой аренде. Привёл якоря и коворкинг."],
  // ---- Этапы ----
  ["st0", "process", "Этап 0: изыскания и право", ["sta"], "2025–2026. Экспертиза, ПЗЗ, изыскания, слушания."],
  ["st1", "process", "Этап 1: очистка и котельная", ["sta"], "2026–2028. Рекультивация, реставрация котельной, ливнёвка, площадь."],
  ["st2", "process", "Этап 2: корпуса А, Б и парк", ["sta"], "2027–2029. Аренда, коворкинг, парк, велодорожка."],
  ["st3", "process", "Этап 3: жильё и площадь", ["sta"], "2029–2032. Жилые корпуса после смены зоны, подземная парковка."],
  ["gantt", "note", "Сводный график", ["sta", "dat"], "MS Project, 1 140 задач. Критический путь идёт через экспертизу."],
  ["risk_delay", "risk", "Риск: экспертиза +9 мес", ["sta", "law"], "Жалоба градозащитников или отказ КГИОП сдвигают всё на 9 месяцев и якорь уходит."],
  ["d_phasing", "decision", "Решение: сначала аренда, потом жильё", ["sta", "eco", "lea"], "Очередь 1–2 без смены зоны, очередь 3 после ПЗЗ. Принято, чтобы не ждать 14 месяцев без денежного потока."],
  ["permit", "process", "Разрешение на строительство", ["sta", "law"], "Отдельно на каждую очередь. Первое — по котельной, после ГИКЭ."],
  // ---- Данные ----
  ["gis", "entity", "ГИС-слои города", ["dat"], "Кадастр, зоны, сети, СЗЗ. Обновляются раз в квартал."],
  ["survey", "process", "Топосъёмка и обмеры", ["dat", "ter"], "Лазерное сканирование корпусов и котельной, точность 5 мм."],
  ["census", "process", "Соцопрос жителей", ["dat", "ppl"], "812 анкет. 71 % за парк, 64 % против парковки во дворе, 40 % против концертов."],
  ["bim", "entity", "BIM-модель корпусов", ["dat", "sta"], "Revit, LOD 300. Источник для смет и графика."],
  ["sensors", "entity", "Датчики шума и пыли", ["dat", "env"], "6 постов по периметру, данные раз в минуту. Основа для разговора с жителями."],
  ["kpi", "metric", "Дашборд KPI проекта", ["dat", "eco"], "IRR, CAPEX факт/план, вакантность, срок экспертизы."],
  ["archive", "entity", "Архив чертежей депо", ["dat", "law"], "Чертежи 1912–1938 из городского архива. Нужны для предмета охраны."],
  ["data_rules", "rule", "Правила именования и версий", ["dat"], "Одна версия мастер-плана — одна папка. Никаких «final_v3_fix»."],
];

type E = [string, string, EdgeKind, string?];

const EDGES: E[] = [
  // территория
  ["site", "boiler", "flow"], ["site", "bld_A", "flow"], ["site", "bld_B", "flow"], ["site", "bld_V", "flow"], ["site", "turntable", "flow"],
  ["site", "rails", "flow"], ["site", "water_tower", "flow"], ["turntable", "square", "supports", "центр площади"], ["rails", "park", "supports", "трасса парка"],
  ["parking", "square", "depends", "под площадью"], ["gate", "rails", "ref"], ["fence", "gate", "depends"], ["plan_master", "site", "ref"],
  ["trees", "park", "supports"], ["soil", "boiler", "depends", "под фундаментом"], ["soil", "bld_B", "depends"], ["bld_V", "square", "flow", "снос → площадь"],
  ["park", "bike", "flow"], ["gate", "tram", "ref", "остановка"], ["survey", "plan_master", "supports"], ["lot_plan", "bld_A", "depends"],
  // право
  ["heritage", "boiler", "depends"], ["heritage", "turntable", "depends"], ["heritage", "water_tower", "depends"], ["heritage", "bld_A", "depends", "фасады"],
  ["heritage_expert", "heritage", "flow"], ["heritage_expert", "permit", "flow"], ["kgiop", "heritage_expert", "depends", "согласует"],
  ["activists", "heritage_expert", "contradicts", "жалоба"], ["activists", "turntable", "supports", "защищают"], ["pzz", "st3", "depends"],
  ["lawyer", "pzz", "flow", "ведёт"], ["lawyer", "servitude", "flow"], ["servitude", "rails", "depends"], ["rzd", "servitude", "depends"],
  ["pp_norm", "parking", "depends", "640 мест"], ["noise_norm", "night_noise", "depends"], ["sanzone", "site", "depends", "восток"],
  ["sanzone", "st3", "contradicts", "жильё на востоке"], ["gpzu", "permit", "flow"], ["city", "pzz", "supports"], ["public_hearing", "pzz", "flow"],
  ["archive", "heritage", "supports", "предмет охраны"], ["crossing", "rzd", "depends"], ["subsidy", "heritage", "depends"], ["risk_delay", "heritage_expert", "depends"],
  ["gis", "sanzone", "supports"], ["gis", "pzz", "supports"],
  // экономика
  ["capex", "irr", "flow"], ["remediation_cost", "capex", "flow"], ["soil", "remediation_cost", "depends"], ["parking", "capex", "flow", "1,1 млрд"],
  ["parking_rev", "parking", "depends"], ["parking_rev", "irr", "flow"], ["rent_rate", "irr", "flow"], ["resi_price", "irr", "flow"],
  ["park", "resi_price", "supports", "+6 %"], ["metro", "rent_rate", "supports"], ["anchor", "rent_rate", "supports"], ["anchor", "boiler", "depends", "лот"],
  ["bank", "irr", "depends"], ["bank", "sanzone", "depends", "снять статус"], ["investor", "bank", "flow"], ["investor", "irr", "depends", "≥ 15 %"],
  ["subsidy", "capex", "supports"], ["h_mixed", "d_phasing", "supports"], ["d_keep_boiler", "boiler", "flow"], ["d_keep_boiler", "capex", "flow", "+0,9 млрд"],
  ["phase_econ", "d_phasing", "supports"], ["vacancy", "rent_rate", "depends"], ["coworking", "vacancy", "supports", "заполняет"], ["green_roof", "storm", "supports"],
  ["kpi", "irr", "ref"], ["kpi", "capex", "ref"], ["pzz", "resi_price", "depends"],
  // люди
  ["residents", "night_noise", "depends", "жалобы"], ["residents", "conflict_pp", "depends"], ["residents", "park", "supports", "71 % за"],
  ["residents", "public_hearing", "flow"], ["census", "residents", "supports"], ["conflict_pp", "parking", "depends"], ["conflict_pp", "pp_norm", "depends"],
  ["city", "square", "supports"], ["city", "public_hearing", "flow"], ["architect", "plan_master", "flow"], ["architect", "kgiop", "flow", "согласует"],
  ["pm", "gantt", "flow"], ["pm", "architect", "ref"], ["tenants", "lease_process", "flow"], ["tenants", "fitout", "depends"], ["broker", "anchor", "flow", "привёл"],
  ["broker", "coworking", "flow"], ["night_noise", "events", "depends", "источник"], ["night_noise", "trucks", "depends"], ["night_noise", "lease_rules", "depends", "ограничивает"],
  ["night_noise", "st3", "contradicts", "жильё рядом"], ["night_noise", "sensors", "ref", "измеряется"], ["night_noise", "residents", "ref"], ["night_noise", "noise_norm", "ref"],
  ["dust", "residents", "depends"], ["dust", "trucks", "depends"], ["events", "anchor", "ref"],
  // транспорт
  ["tram", "pp_demand", "supports", "снижает"], ["traffic_model", "pp_demand", "flow"], ["pp_demand", "pp_norm", "contradicts", "310 vs 640"],
  ["pp_demand", "parking", "depends"], ["trucks", "gate", "depends"], ["trucks", "soil", "depends", "вывоз"], ["metro", "pp_demand", "supports"],
  ["crossing", "rails", "depends"], ["logistics", "gate", "depends"], ["logistics", "lease_rules", "depends"], ["bike", "tram", "ref"],
  // среда
  ["ecology_report", "soil", "flow"], ["ecology_report", "remediation_cost", "supports"], ["microclimate", "bld_B", "depends"],
  ["heat_island", "square", "depends"], ["heat_island", "trees", "contradicts", "тень"], ["storm", "st1", "depends"], ["sensors", "dust", "ref"],
  ["storm", "park", "ref", "биодренаж"],
  // аренда
  ["lease_process", "fitout", "flow"], ["lease_process", "lot_plan", "depends"], ["fitout", "anchor", "flow"], ["events", "boiler", "depends"],
  ["lease_rules", "logistics", "ref"], ["coworking", "bld_A", "depends"], ["rent_rate", "lease_process", "ref"],
  // этапы
  ["st0", "st1", "flow"], ["st1", "st2", "flow"], ["st2", "st3", "flow"], ["st0", "heritage_expert", "depends"], ["st0", "ecology_report", "depends"],
  ["st0", "public_hearing", "depends"], ["st1", "soil", "depends"], ["st1", "boiler", "depends"], ["st1", "square", "depends"], ["st1", "turntable", "depends"],
  ["st2", "bld_A", "depends"], ["st2", "park", "depends"], ["st2", "fitout", "depends"], ["st3", "parking", "depends"], ["st3", "pzz", "depends"],
  ["gantt", "st0", "ref"], ["risk_delay", "anchor", "contradicts", "якорь уходит"], ["d_phasing", "st1", "flow"], ["d_phasing", "st3", "flow"],
  ["permit", "st1", "flow"], ["bim", "capex", "supports", "сметы"], ["bim", "gantt", "supports"], ["fence", "st1", "depends"], ["capex", "st1", "ref"],
  // данные
  ["gis", "plan_master", "supports"], ["data_rules", "plan_master", "depends"], ["data_rules", "bim", "depends"], ["survey", "bim", "flow"],
  ["sensors", "kpi", "flow"], ["census", "public_hearing", "supports"], ["traffic_model", "gis", "depends"], ["archive", "survey", "ref"],
  // закрываем «сиротские членства» и даём пример membership-candidate (ГИС → Право)
  ["turntable", "capex", "flow", "реставрация 40 млн"], ["ecology_report", "sanzone", "supports"], ["pm", "lawyer", "flow"], ["gis", "resi_price", "supports", "аналоги"],
  ["city", "rzd", "ref", "переговоры"], ["broker", "tenants", "flow", "приводит"], ["ecology_report", "data_rules", "depends"], ["green_roof", "capex", "flow", "+40 млн"],
  ["census", "data_rules", "depends"], ["gis", "servitude", "supports"], ["gis", "heritage", "supports", "границы ОКН"],
];

export function makeDemo(): Graph {
  const counters = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const n of NODES) for (const s of n[3]) totals.set(s, (totals.get(s) ?? 0) + 1);
  const nodes: GNode[] = NODES.map(([id, kind, name, sheets, body]) => {
    const pos: GNode["pos"] = {};
    for (const s of sheets) {
      const i = counters.get(s) ?? 0;
      counters.set(s, i + 1);
      pos[s] = gridLayout(totals.get(s) ?? 1, i, id + s);
    }
    return { id, kind, name, sheets: [...sheets], pos, body };
  });
  const seen = new Set<string>();
  const edges: GEdge[] = [];
  EDGES.forEach(([from, to, kind, label], i) => {
    const k = [from, to].sort().join("|");
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ id: "e_" + (i + 1), from, to, kind, label });
  });
  return {
    version: 2,
    title: "Депо-квартал",
    description: "Вымышленный учебный набор. Числа и требования не проверены. Реконструкция трамвайного депо в городской квартал: одна площадка, девять листов в разных нотациях.",
    sheets: SHEETS.map((s) => ({ ...s })),
    nodes,
    edges,
  };
}
