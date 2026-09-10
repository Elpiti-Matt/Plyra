# Репозиторий, демо и релизы Plyra

Актуально для **0.7.0-rc.4**, 9 сентября 2026 года. Репозиторий — [Elpiti-Matt/Plyra](https://github.com/Elpiti-Matt/Plyra), основная ветка — `main`. Публичные файлы и запуски проверены на коммите `581b3b1`. Для первого обновления используйте [пошаговую инструкцию](../UPDATE-GITHUB.ru.md).

| Часть | Источник и действие |
| --- | --- |
| Исходники | Содержимое `Plyra/` из архива в корень рабочей копии, ветка и PR в main |
| Проверка | **Checks**: npm ci, npm test, npm run build; по push, PR и вручную |
| Веб-демо | **Publish demo to GitHub Pages**: ручной запуск на main, сборка и публикация dist |
| Автономный файл | `demo/index.html`, идентичен отдельному `Plyra-0.7.0-rc.4.html` |
| Скачиваемый релиз | Необязательный prerelease `v0.7.0-rc.4`, HTML прикрепляется отдельно |
| Документация | README, FEATURES с SVG/GIF, FORMAT, HANDOFF и VALIDATION |

На момент проверки Checks для `581b3b1` успешен, есть успешный запуск Pages, сайт [elpiti-matt.github.io/Plyra](https://elpiti-matt.github.io/Plyra/) отвечает. Публичных Releases нет. Это состояние существующего репозитория, а не подтверждение публикации rc.4.

## Pages

После объединения обновления откройте **Actions → Publish demo to GitHub Pages → Run workflow**, выберите **main**, запустите и дождитесь зелёного результата. `pages.yml` не публикует по push. Если Pages требует настройки, проверьте **Settings → Pages → Source → GitHub Actions**; действующие настройки не нужно пересоздавать без причины. [Официальный порядок](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

После публикации проверьте фактический сайт и сценарии [QA-MANUAL](QA-MANUAL.md). Локальные тесты и сборка не подтверждают успешную публикацию.

## Состав и настройки

Архив не содержит `.git`, `node_modules`, `dist` и временные файлы проверок. История и настройки аккаунта остаются в существующем репозитории. Закрытые правила веток, права, секреты и административные параметры Pages не проверены. В прочитанном коммите `CNAME` и `REPOSITORY.json` отсутствуют; комплект добавляет `REPOSITORY.json` с адресом Elpiti-Matt/Plyra и готовые ссылки README/статей.

Старую `.github/issue_template` заменяет `.github/ISSUE_TEMPLATE`; два пустых `test.txt` удалены. Порядок переноса, включая регистр папки на Windows/Mac, подробно описан в [UPDATE-GITHUB](../UPDATE-GITHUB.ru.md). Если main изменился после сверки, проверьте новые отличия до объединения.

`python scripts/configure_repo.py Elpiti-Matt --repo Plyra` обновляет локальные ссылки и ничего не публикует. `scripts/github_stats.py Elpiti-Matt/Plyra` читает скачивания release assets; бейдж считает файлы релизов, а не пользователей. Эти скрипты не входят в автономный HTML.

## Лицензия и материалы

`LICENSE` и package.json указывают MIT. Сторонние notices включены в HTML и `THIRD_PARTY_NOTICES.txt`. [LICENSING](LICENSING.ru.md) и DEPENDENCY-LICENSES.json — датированные результаты предыдущего аудита. Черновики статей в articles синхронизированы с текущими возможностями, но не являются опубликованными материалами или исследованием удобства.

Из этой рабочей копии не выполнялись commit, push, PR, release или публикация сайта.
