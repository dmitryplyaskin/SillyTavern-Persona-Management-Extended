# Persona Management Extended (SillyTavern Extension)

Этот файл — **“спека”/контекст проекта** для расширения `Persona Management Extended`.  
Цель — чтобы между сессиями разработки можно было быстро восстановить: **что делаем, где в коде ST смотреть, как интегрируемся и какие инварианты соблюдаем**.

---

## 0) TL;DR

Расширение добавляет **расширенный режим Persona Management** прямо в табе Persona Management:

- **Normal mode**: работает штатный UI SillyTavern.
- **Advanced mode**: штатный контент Persona Management **скрывается**, и показывается наш UI (наш “Persona Manager v2”).

В Advanced mode сейчас реализовано:

- **Список персон** слева: поиск, сортировки, превью описания, бейдж _Lorebook_.
- **Панель текущей персоны** справа (вместо штатной): редактирование Persona Description + Position (+ Depth/Role при `In-chat @ Depth`), токены, кнопки rename/duplicate/delete/image/lore и т.п.
- **Sync with original persona (toggle)**: можно “отвязать” расширенную версию описания от оригинальной (редактировать локально) и затем снова “привязать”, выбрав источник истины.
- **Connections & Global Settings**: перенесены из штатного UI путём **перемещения реальных DOM‑нод** (чтобы сохранить обработчики ST).
- **Additional Descriptions**: редактор блоков (item/group) с enable/disable, collapse, удалением, и **ручным reorder** (стрелки вверх/вниз), плюс fullscreen‑режим.
- **Settings**: настройки сборки промпта (wrapper + joiner для Additional Descriptions).

Важно: **инжект в промпт на генерации реализован через runtime‑подмену**:

- при старте генерации (после выполнения slash‑команд) расширение временно подменяет `power_user.persona_description` (и при необходимости position/depth/role),
- добавляет **Additional Descriptions** (только enabled) в конец текста,
- затем гарантированно откатывает значения на `GENERATION_ENDED`/`GENERATION_STOPPED`.

Это нужно, чтобы:

- **не засорять “оригинальную” персону** служебными шаблонами/переменными расширения,
- но при этом **влиять на итоговый prompt** ровно на время генерации.

Дополнительно:

- Advanced UI переведён на архитектуру **mount один раз → update точечно** (без постоянного полного ререндера).
- В Advanced UI перенесены штатные блоки **Connections & Global Settings** (перемещаем реальные DOM-ноды ST, чтобы не ломать обработчики).
- Additional Descriptions реализованы как **упорядоченные blocks[]** (item/group) — порядок важен для будущей сборки промпта.

См. отдельный гайд по UI/рендеру: `UI_RENDER_GUIDE.md`.

---

## 1) Главные цели

- **Чистый UI**: убрать “грязь” от смешивания двух интерфейсов (штатного и нашего).
- **Additional Descriptions v2**:
  - группы (folders/sets) с массовым enable/disable;
  - блоки внутри групп;
  - быстрые действия (reorder уже есть; остальное — постепенно).
- **Управление Persona Description без ломания штатного UI**:
  - расширенный редактор (токены, удобные контролы);
  - опциональное “отвязывание” (локальная версия описания/позиции/глубины/роли на персону).
- **Никакой порчи базового описания на диск**: любые будущие инжекты должны быть только runtime.
- **Переживает перезапуски**: данные сохраняются и восстанавливаются.
- **Совместимость с backup/restore персон**: данные хранятся внутри `power_user.persona_descriptions[avatarId]` и попадают в бэкап персон штатно.

---

## 2) Негативные цели (что НЕ делаем)

- Не патчим core-файлы SillyTavern.
- Не делаем “идеальный публичный API” — используем внутренние модули/DOM, но **минимизируем хрупкость** (не удаляем штатный DOM, а скрываем).
- Не переписываем весь Persona Management 1:1 сразу. Сначала делаем ядро: модель данных + UI + безопасный инжект.

---

## 3) Термины (внутри проекта)

- **Persona**: сущность ST, идентифицируется `avatarId` (файл в `User Avatars/`), текущая — `user_avatar`.
- **Base persona description**: значение `power_user.persona_description` и UI-поле `#persona_description`.
- **Additional Description**: дополнительный блок текста, включаемый/выключаемый.
- **Group**: группа блоков Additional Descriptions, тоже включаемая/выключаемая.
- **Override (planned)**: правило активации (например “в этом чате включить группу X”). Сейчас override’ы не реализованы.
- **Advanced mode**: наш UI внутри `#PersonaManagement`.

---

## 4) Инварианты (важно не сломать)

1. **Normal mode полностью сохраняет штатное поведение ST**.
2. Advanced mode **не должен удалять/перестраивать** штатные элементы, только:
   - скрывать `#persona-management-block`,
   - показывать наш контейнер.
3. **Никогда не сохраняем “инжектнутый” текст в `power_user.persona_description` на диск**.
4. Инжект **только на генерацию**, с гарантированным откатом даже при ошибках/прерывании.

---

## 5) Где смотреть в исходниках SillyTavern (карта)

### 5.1 Разметка Persona Management (DOM)

Файл: `public/index.html`

Ключевые элементы:

- `#persona-management-button` — кнопка/дровер.
- `#PersonaManagement` — контейнер дровера.
- `#persona-management-block` — **весь штатный контент**, который мы будем скрывать в Advanced mode.
- `#user_avatar_block` — список персон (левая колонка).
- `#persona_description` — textarea описания.
- Кнопки: `#persona_rename_button`, `#persona_duplicate_button`, `#persona_delete_button`, `#lock_user_name`, `#lock_persona_to_char`, `#lock_persona_default`, и т.д.

### 5.2 Логика Persona Management

Файл: `public/scripts/personas.js`

Здесь важно:

- `export let user_avatar` — текущая персона (avatarId).
- `export async function setUserAvatar(...)` — переключение персоны.
- `export async function getUserAvatars(...)` — список персон.
- `export function setPersonaDescription()` — синхронизация UI ←→ `power_user`.
- `power_user.personas` и `power_user.persona_descriptions` — основные структуры хранения персон.
- Локи: chat/character/default (см. `togglePersonaLock`, `isPersonaLocked`, `loadPersonaForCurrentChat`).

### 5.3 Система расширений + хранилища/метаданные

Файл: `public/scripts/extensions.js`

Полезное:

- `extension_settings` — глобальные настройки расширений (персистентно).
- `saveMetadataDebounced()` — сохранение `chat_metadata` безопасно при смене чата/персонажа.
- `runGenerationInterceptors(...)` + `manifest.generate_interceptor` — механизм хуков “на генерацию”.
- `writeExtensionField(characterId, key, value)` — запись extension-полей в **character card** (это для персонажей, не для persona).

### 5.4 Глобальные состояния / события

Файл: `public/script.js` (точка сборки фронта)

Важно:

- `eventSource`, `event_types` — события приложения.
- `power_user`, `chat_metadata`, текущие `characterId/groupId` через `getContext()` (импорт из `scripts/extensions.js`).

---

## 6) Точки интеграции (как мы встраиваемся)

### 6.1 Встраивание UI

Мы добавляем в `#PersonaManagement`:

- **переключатель режимов** Normal/Advanced (лучше в верхней панели рядом с `Backup/Restore`, но можно и в отдельной строке).
- контейнер `#pme_root` (наш UI).

Поведение:

- Normal: `#persona-management-block` visible, `#pme_root` hidden.
- Advanced: `#persona-management-block` hidden, `#pme_root` visible.

### 6.2 Отслеживание переключений (персона/чат/персонаж)

События/сигналы:

- `event_types.APP_READY` — можно создавать DOM-обвязку.
- `event_types.CHAT_CHANGED` — реагировать на смену чата и/или авто-переключение персоны.
- Клик по `#persona-management-button` — удобный момент, чтобы “достроить UI”, если DOM ещё не готов.

### 6.3 Инжект в промпт (главная идея v2)

Состояние на текущий момент:

- В `manifest.json` задан `generate_interceptor: "pmeGenerateInterceptor"`.
- Реальная подмена применяется **раньше**, чем вызывается `runGenerationInterceptors()` (см. ниже), чтобы попасть в `persona`, вычисляемую SillyTavern.
- `globalThis.pmeGenerateInterceptor` остаётся как “safety net” (если ранний хук не сработал).

Стратегия (как реализовано сейчас):

- Не трогаем содержимое `#persona_description` как источник истины.
- Храним **состояние** отдельно (наша модель данных).
- На генерации вычисляем итоговый текст:
  - `finalPersonaText = basePersonaText + enabledAdditions(...)`,
  - временно подменяем **runtime** значения `power_user.persona_description` (+ при разлинковке также position/depth/role),
  - после генерации откатываем.

Технические варианты “хука на генерацию”:

- **A (реально используемая точка для применения патча)**: `event_types.GENERATION_AFTER_COMMANDS` — это важно, потому что SillyTavern вычисляет `persona` через `getCharacterCardFields()` **до** `runGenerationInterceptors()`.
- **B (safety net)**: `manifest.generate_interceptor` (`runGenerationInterceptors`) — поздняя стадия, но может быть полезна для совместимости.

Почему это важно: так мы избегаем классов багов “дублирование при переключении персон/чатов” и “персистентная порча описания”.

#### 6.3.1 Как работает `generate_interceptor` (практика)

Файл: `public/scripts/extensions.js` вызывает интерсепторы так:
`globalThis[manifest.generate_interceptor](chat, contextSize, abort, type)`

Что важно понимать про порядок выполнения в SillyTavern:

- SillyTavern вычисляет строку `persona` (через `getCharacterCardFields()`) **до** `runGenerationInterceptors()`.
- Поэтому если нужно, чтобы подмена повлияла на `persona`/story string/WI‑скан — подмену нужно сделать **раньше**, чем `getCharacterCardFields()`.

Как PME делает это сейчас (реальная реализация):

- **Основной путь (ранний, корректный)**: подписка на `event_types.GENERATION_AFTER_COMMANDS` → `applyPatch(...)`.
- **Откат**: на `event_types.GENERATION_ENDED` и `event_types.GENERATION_STOPPED` → `restorePatch(...)`.
- **Safety net**: `globalThis.pmeGenerateInterceptor` всё ещё регистрируется и вызывает `applyPatch(...)`, но это поздняя стадия (может не попасть в `persona`, но влияет на другие потребители `power_user.persona_description`).

Гейт:

- Если `extension_settings.personaManagementExtended.enabled === false` → **ничего не подменяем**, Additional Descriptions не применяются к prompt.

Технически, чтобы `runGenerationInterceptors()` видел интерсептор, нужно:

- В `manifest.json` иметь `generate_interceptor: "pmeGenerateInterceptor"` (у нас уже есть)
- Зарегистрировать в global scope функцию:
  - `globalThis.pmeGenerateInterceptor = async (chat, contextSize, abort, type) => { ... }` (делается в `src/injector.js`)

Важно (актуально):

- Мы мутируем только runtime‑значения `power_user.*` и **никогда не сохраняем** их на диск.
- Откат обязателен даже при abort/stop (для этого слушаем `GENERATION_STOPPED`).
- В `src/injector.js` есть “таймер‑страховка” отката на случай, если end‑ивенты не отработали.

#### 6.3.2 Алгоритм сборки итогового текста (PME)

Сборка `finalPersonaText` для генерации:

- **База**:
  - если persona “linked” (`pme.linkedToNative !== false`) → берём `power_user.persona_description`
  - если “unlinked” (`pme.linkedToNative === false`) → берём `pme.local.description` (там могут быть шаблоны/переменные, которые нельзя сохранять в “оригинал”)
- **Additional Descriptions**:

  - берём только `text` у enabled блоков,
  - порядок строго как в `pme.blocks` (и внутри group — как в `group.items`),
  - **title/названия групп не добавляются в prompt** (они UI-only),
  - пустые/пробельные тексты (по `trim()`) скипаются, но **в prompt вставляется исходный `text` без модификаций**,
  - склейка идёт через `pme.settings.additionalJoiner` (по умолчанию `\\n\\n`, поддерживает escape‑последовательности).

- **Wrapper (опционально)**:
  - если `pme.settings.wrapperEnabled === true`, итоговый текст оборачивается шаблоном `pme.settings.wrapperTemplate`,
  - в шаблоне заменяется плейсхолдер `{{PROMPT}}` на итоговый текст.

---

## 7) Хранилище данных (persist) — что и где хранить

На данный момент реально используется:

1. **На персону (persona-scoped)** — основной уровень.  
   Храним в `power_user.persona_descriptions[avatarId].pme` (единый namespace‑объект расширения).

Плюсы:

- переживает перезапуск;
- попадает в штатный Backup/Restore персон (там сохраняют `persona_descriptions` целиком).

2. **Глобальные настройки расширения** (`extension_settings.personaManagementExtended`):

   - `enabled: boolean`: **гейт для инжекта на генерации**. Если `enabled === false`, расширение не подменяет persona description и **не применяет Additional Descriptions** к prompt.
     (UI может оставаться доступным для редактирования данных, но на генерацию это не влияет.)

3. **Локальные UI‑предпочтения аккаунта** (`accountStorage`):
   - `pme_advanced_mode` — включён ли Advanced mode,
   - `pme_persona_sort` — режим сортировки списка персон.

---

## 8) Предлагаемая модель данных (черновик)

Namespace: `pme` (пример)

### 8.1 Персона-уровень (актуально на сейчас)

`power_user.persona_descriptions[avatarId].pme`:

- **Additional Descriptions**:
  - `version: 1`
  - `blocks: PmeBlock[]`
- **Sync/Unlink Persona Description**:
  - `linkedToNative: boolean` (по умолчанию `true`)
  - `local: { description, position, depth, role }` (используется, когда `linkedToNative === false`)
- **Settings**:
  - `settings.wrapperEnabled: boolean` (по умолчанию `false`)
  - `settings.wrapperTemplate: string` (по умолчанию `<tag>{{PROMPT}}</tag>`, заменяем `{{PROMPT}}` на итоговый текст)
  - `settings.additionalJoiner: string` (по умолчанию `\\n\\n`; поддерживаются escape-последовательности `\\n`, `\\t`, `\\r`, `\\\\`)

`Block` бывает двух типов:

- `type: "item"`: `{ id, title, text, enabled, collapsed }`
- `type: "group"`: `{ id, title, enabled, collapsed, items: Item[] }`

Где `Item` = `{ id, title, text, enabled, collapsed }`.

Ключевой инвариант: **порядок `blocks[]` — это канонический порядок**, его нельзя автоматически сортировать, потому что он будет влиять на сборку итогового persona prompt (и позже появится ручной reorder).

### 8.2 Чат-уровень (override)

Не реализовано.

### 8.3 Персонаж/группа (character/group) overrides

Не реализовано.

---

## 9) План реализации (roadmap)

### Этап 0 — каркас (сделано)

- `index.js`: инициализация + подписки на события ST.
- `ui/`: контейнер + переключатель Normal/Advanced + Advanced UI.
- `store/`: persist `pme` (blocks, linked/local).
- `injector`: инжект на генерации + гарантированный откат.

### Этап 1 — UI Advanced (сделано базовое)

- Список персон: поиск/сорт/превью.
- Панель текущей персоны: описание + position/depth/role + sync/unlink.
- Additional Descriptions: item/group, enable/disable, reorder, fullscreen.
- Перенос нативных Connections & Global Settings.

### Этап 2 — безопасный инжект на генерацию (сделано)

- Реализовать injector/хуки (реализовано: `src/injector.js`).
- Гарантированный откат при abort/ошибках.
- Зафиксировать инвариант: `#persona_description` не меняем автоматически.

### Этап 3 — привязки

Пока не реализовано (override’ы на чат/character/group отсутствуют).

### Этап 4 — QoL

- фильтр/поиск по группам/элементам,
- сортировка, drag&drop,
- импорт/экспорт (JSON),
- quick actions: “enable only this group”, “disable all”, “clone group”, “copy to another persona”.

---

## 10) Отладка и диагностика

Рекомендуемые практики:

- Все логи — с префиксом `[PME]`.
- При каждом вычислении итогового текста логировать:
  - `avatarId`,
  - сколько активных групп/элементов,
  - длину/токены (опционально).
- Счётчик “сколько раз подряд сработал инжект без отката” — должен быть всегда 0.

Типовые места для поиска багов:

- гонки на `CHAT_CHANGED` (персона может меняться авто-логикой ST),
- генерация abort/stop — убедиться, что откат выполняется.

---

## 11) Структура файлов расширения (как мы будем раскладывать код)

Актуальная структура:

- `index.js` — entrypoint: подписки на события ST, инициализация UI.
- `style.css` — стили Advanced UI (namespace `.pme-*`).
- `src/ui/personaManagementTab.js` — оркестратор режимов Normal/Advanced и lifecycle UI.
- `src/ui/advancedApp.js` — сборка Advanced UI и подключение компонентов.
- `src/ui/uiBus.js` — мини pub/sub (события UI) для декуплинга компонентов.
- `src/ui/components/*`:
  - `personaList.js` — список персон (поиск/сорт/скролл + badge Lorebook),
  - `currentPersonaPanel.js` — текущая персона (описание/position/depth/role + поддержка Expand),
  - `personaLinksGlobalSettings.js` — Connections & Global Settings (перенос нативных DOM-ноды ST),
  - `additionalDescriptions.js` — Additional Descriptions (blocks item/group, коллапс, fullscreen modal),
  - `dom.js` — DOM helpers.
- `src/store/personaStore.js` — persona-scoped persist для `pme` (blocks[]).
- `src/injector.js` — инжект на генерацию: runtime‑подмена `power_user.persona_description` + Additional Descriptions + откат.
- `settings.html` / `settings.js` — настройки расширения (enable, import legacy, clear data).

---

## 12) Совместимость и будущие риски

- Мы используем внутренние id/модули ST (`/scripts/personas.js`, `#persona-management-block` и т.п.).  
  При обновлениях ST возможны поломки — поэтому **держим интеграцию поверхностной** (hide/show) и избегаем глубоких патчей.
- Данные в `power_user.persona_descriptions[avatarId].pme` должны быть версионированы (`version`) и мигрируемы.

Примечание: сейчас проект в активной разработке, поэтому мы держим схему простой. Когда начнётся стабильное использование — добавим миграции.

---

## 13) Ссылки

- `manifest.json`: `data/default-user/extensions/SillyTavern-Persona-Management-Extended/manifest.json`
- UI Persona Management: `public/index.html` (блок `#PersonaManagement`)
- Логика персон: `public/scripts/personas.js`
- Extensions SDK-ish: `public/scripts/extensions.js`
