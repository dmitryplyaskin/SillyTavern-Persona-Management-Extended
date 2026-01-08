# Persona Management Extended (SillyTavern Extension)

Этот файл — **“спека”/контекст проекта** для расширения `Persona Management Extended`.  
Цель — чтобы между сессиями разработки можно было быстро восстановить: **что делаем, где в коде ST смотреть, как интегрируемся и какие инварианты соблюдаем**.

---

## 0) TL;DR

Мы делаем **расширенный режим Persona Management** прямо в табе Persona Management:

- **Normal mode**: работает штатный UI SillyTavern.
- **Advanced mode**: штатный контент Persona Management **скрывается**, и показывается наш UI (наш “Persona Manager v2”).

Пользователь управляет **группами и блоками “Additional Descriptions”**, включением/выключением, привязками к чату/персонажу.  
Расширение **собирает итоговый persona prompt** и **инжектит его только на время генерации**, не “портя” поле `#persona_description` и не создавая дубли.

---

## 1) Главные цели

- **Чистый UI**: убрать “грязь” от смешивания двух интерфейсов (штатного и нашего).
- **Additional Descriptions v2**:
  - группы (folders/sets) с массовым enable/disable;
  - блоки внутри групп;
  - быстрые действия (toggle all, reorder, search по блокам, импорт/экспорт и т.д. — постепенно);
  - привязки: “на этот чат”, “на этого персонажа/группу” (character/group), плюс глобальные.
- **Никакой порчи базового описания**: advanced-настройки должны жить отдельно и применяться **только при сборке промпта**.
- **Переживает перезапуски**: данные сохраняются и восстанавливаются.
- **Совместимость с backup/restore персон** (если возможно) и предсказуемое поведение при переключении персон/чатов.

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
- **Override**: правило активации (например “в этом чате включить группу X”).
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

Ключевая стратегия:

- Не трогаем содержимое `#persona_description` как источник истины.
- Храним **состояние** отдельно (наша модель данных).
- На генерации вычисляем итоговый текст:
  - `finalPersonaText = basePersonaText + enabledAdditions(...)` (с учетом групп/override’ов),
  - временно подменяем **только runtime** значение (например `power_user.persona_description`) и/или нужные места, откуда ST собирает prompt,
  - после генерации откатываем.

Технические варианты “хука на генерацию”:

- **A (рекомендуется)**: использовать `manifest.generate_interceptor` (интерсептор запускается централизованно через `runGenerationInterceptors`).
- **B**: слушать `event_types.GENERATION_STARTED` и откатывать на событии завершения (нужно найти/зафиксировать, какие события гарантированно стреляют при abort/ошибках; если их нет — делать собственный watchdog/try/finally вокруг перехвата).

Почему это важно: так мы избегаем классов багов “дублирование при переключении персон/чатов” и “персистентная порча описания”.

#### 6.3.1 Как работает `generate_interceptor` (практика)

Файл: `public/scripts/extensions.js` вызывает интерсепторы так:
`globalThis[manifest.generate_interceptor](chat, contextSize, abort, type)`

Значит, для использования варианта A нужно:

- В `manifest.json` добавить поле:
  - `generate_interceptor`: строка-ключ, например `"pmeGenerateInterceptor"`
- В `index.js` зарегистрировать функцию в global scope:
  - `globalThis.pmeGenerateInterceptor = async (chat, contextSize, abort, type) => { ... }`

Важно:

- интерсептор может **мутировать runtime-состояния** перед сборкой промпта (например, временно подменить `power_user.persona_description`), но **обязан** сделать откат;
- `abort(true|false)` позволяет прервать генерацию (нам обычно не нужно, но полезно для fail-safe).

---

## 7) Хранилище данных (persist) — что и где хранить

У нас три уровня данных:

1. **На персону (persona-scoped)** — основной уровень  
   Храним в `power_user.persona_descriptions[avatarId]` под нашим namespace-ключом, например:
   - `power_user.persona_descriptions[avatarId].pme = { ... }`

Плюсы:

- переживает перезапуск;
- попадает в штатный Backup/Restore персон (там сохраняют `persona_descriptions` целиком).

2. **На чат (chat-scoped overrides)**  
   Храним в `chat_metadata`, сохраняем через `saveMetadataDebounced()`.

3. **Глобальные настройки расширения** (UI prefs, дефолты, флаги)
   Храним в `extension_settings.<ourKey>` (персистентно).

---

## 8) Предлагаемая модель данных (черновик)

Namespace: `pme` (пример)

### 8.1 Персона-уровень

`power_user.persona_descriptions[avatarId].pme`:

- `version: number` — версия схемы данных.
- `groups: Group[]`
- `items: Item[]` _(или items внутри groups — на выбор)_
- `ui: { ... }` _(не обязательно, можно в extension_settings)_

`Group`:

- `id: string`
- `title: string`
- `enabled: boolean`
- `order: number`
- `items: Item[]`

`Item`:

- `id: string`
- `title: string`
- `text: string`
- `enabled: boolean`
- `order: number`
- `tags?: string[]` _(опционально для будущих фильтров)_

### 8.2 Чат-уровень (override)

`chat_metadata.pme`:

- `enabledGroupIds?: string[]` _(или “diff”: включить/выключить относительно базы)_
- `enabledItemIds?: string[]`

### 8.3 Персонаж/группа (character/group) overrides

Опции:

- **A**: хранить маппинг у персоны: `pme.bindings[characterKey] = { ... }`
- **B**: хранить маппинг глобально в `extension_settings.pme.bindings` (если привязки общие)

На старте проще A: “всё, что про эту персону” — внутри этой персоны.

---

## 9) План реализации (roadmap)

### Этап 0 — каркас

- Создать `index.js` инициализацию.
- Создать `ui/` слой: рендер контейнера + переключатель Normal/Advanced.
- Создать `store/` слой: чтение/запись `pme` в `power_user.persona_descriptions[user_avatar]` + миграции схем.
- Создать `engine/` слой: сборка `finalPersonaText` по активным группам/блокам + overrides.

### Этап 1 — UI Advanced (минимальный)

- В advanced показать:
  - список групп,
  - внутри — элементы,
  - toggle enable,
  - add/remove,
  - редактирование текста.

### Этап 2 — безопасный инжект на генерацию

- Реализовать interceptor/хуки.
- Гарантированный откат при abort/ошибках.
- Зафиксировать инвариант: `#persona_description` не меняем автоматически.

### Этап 3 — привязки

- На чат: сохранять overrides в `chat_metadata.pme`.
- На character/group: хранить маппинг и применять при `CHAT_CHANGED` / смене персонажа.

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

Текущее расширение пока пустое, но планируем так:

- `index.js` — точка входа: инициализация, подписки на события, переключение режимов.
- `style.css` — стили advanced UI (без конфликта со штатными, через namespace-класс на root).
- `src/ui/*` — построение DOM, рендер, обработчики UI.
- `src/store/*` — чтение/запись `pme` в persona/chat/global, миграции схем.
- `src/engine/*` — сборка финального текста, применение override’ов.
- `src/injector/*` — hook на генерацию + откат.

_(Файлов ещё нет — это план раскладки.)_

---

## 12) Совместимость и будущие риски

- Мы используем внутренние id/модули ST (`/scripts/personas.js`, `#persona-management-block` и т.п.).  
  При обновлениях ST возможны поломки — поэтому **держим интеграцию поверхностной** (hide/show) и избегаем глубоких патчей.
- Данные в `power_user.persona_descriptions[avatarId].pme` должны быть версионированы (`version`) и мигрируемы.

---

## 13) Ссылки

- `manifest.json`: `data/default-user/extensions/SillyTavern-Persona-Management-Extended/manifest.json`
- UI Persona Management: `public/index.html` (блок `#PersonaManagement`)
- Логика персон: `public/scripts/personas.js`
- Extensions SDK-ish: `public/scripts/extensions.js`
