# Документация Plyra

Текущая версия: **0.7.0-rc.4**, 9 сентября 2026 года. Репозиторий: [Elpiti-Matt/Plyra](https://github.com/Elpiti-Matt/Plyra).

| Задача | Документ |
| --- | --- |
| Узнать доступные возможности | [README RU](../README.ru.md), [README EN](../README.md) |
| Посмотреть картинки и инструкции по функциям | [FEATURES](FEATURES.ru.md): обзор листов, связи, атрибуты, фильтры и ИИ |
| Открыть приложение и проверить изменения | [START-HERE](../START-HERE.ru.md) |
| Впервые обновить этот GitHub-репозиторий | [Подробная инструкция](../UPDATE-GITHUB.ru.md): Desktop, папки, ветка, PR, Pages |
| Продолжить разработку | [HANDOFF](../HANDOFF.md), [WORKSPACE](WORKSPACE-0.7.ru.md) |
| Формат проекта и импорт | [FORMAT](FORMAT.md) |
| Режимы и интерфейс | [REDESIGN](REDESIGN.ru.md), [LAYOUT](LAYOUT.ru.md) |
| Что проверено | [AUDIT](AUDIT.ru.md), [VALIDATION](VALIDATION.json), [сверка с main](REPOSITORY-UPDATE.json) |
| Ручная приёмка | [QA-MANUAL](QA-MANUAL.md) |
| Pages и скачиваемые релизы | [PUBLISHING](PUBLISHING.ru.md) |
| Будущие возможности и ограничения | [EXTENSIONS](EXTENSIONS.ru.md), [CROSS-NOTATION](CROSS-NOTATION.ru.md) |

[AI-промпт RU](AI-PROMPT.ru.txt) / [EN](AI-PROMPT.en.txt) и [пример RU](../data/ai-example-ru.json) / [EN](../data/ai-example-en.json) используют **v3**: словари, один тип и теги листов, атрибуты всех шести типов и общий узел. Они генерируются из встроенной справки командой `npm run ai:docs`; тест проверяет совпадение. Старые учебные JSON v2 продолжают открываться как совместимые входные файлы.

SVG и GIF — оригинальные учебные иллюстрации, не снимки браузера. [Исходники и пересборка картинок](images/README.md). Автономный HTML содержит свои встроенные иллюстрации и не обращается к картинкам в репозитории по сети.

`LICENSING.ru.md` и `DEPENDENCY-LICENSES.json` содержат датированный аудит 6 сентября; `LAYOUT-METRICS.json` и `metrics.json` — результаты соответствующих скриптов на учебных данных, не UX-исследование. CHANGELOG сохраняет историю. Черновики статей в `articles/` имеют отдельный редакторский статус.
