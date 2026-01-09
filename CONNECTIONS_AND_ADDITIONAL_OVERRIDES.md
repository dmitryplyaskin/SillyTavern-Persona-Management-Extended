# Connections (SillyTavern) и как перенести идею на PME Additional Descriptions

Этот документ — **конспект/контекст** для задачи: “сделать так, чтобы `Additional Descriptions` (PME) можно было привязывать к чату / персонажу / группе (аналогично тому, как ST делает Persona Connections)”.

Цель: чтобы позже можно было быстро вернуться и сразу иметь:

- как в ST устроены Connections/locks,
- где это хранится,
- когда применяется,
- какие API доступны расширению,
- варианты реализации override’ов для PME (trade-offs, хранение, интеграция в injector/UI).

---

## 1) Важное уточнение терминов: “Connections” в ST — это НЕ универсальный механизм

В Persona Management SillyTavern “Connections” = **механизм выбора/фиксации user persona** (имя+аватар) относительно:

- **Default persona** (для новых/не-локнутых чатов)
- **Chat lock** (персона закреплена за конкретным чатом)
- **Character/Group connection** (персона “подключена” к конкретному персонажу или group-chat)

То есть Connections — это, по сути, набор правил “какую персону выбирать”, а не “привяжи произвольный кусок данных к чему угодно”.

---

## 2) Где смотреть в исходниках SillyTavern

Основной файл:

- `public/scripts/personas.js`

DOM в Persona Management:

- `public/index.html` (блок `#persona-management-block`, секция `<h4 data-i18n="Connections">`)

Контекст/SDK для расширений (что можно дергать из extension-кода):

- `public/scripts/st-context.js` (функция `getContext()`)
- `public/scripts/extensions.js` (в т.ч. `saveMetadataDebounced`, `writeExtensionField`, `runGenerationInterceptors`)

---

## 3) Модель данных ST для persona connections/locks

### 3.1 Chat lock (привязка к конкретному чату)

- **Хранение**: `chat_metadata['persona'] = <avatarId>`
- **Сохранение**: через `saveMetadata()` / `saveMetadataDebounced()`

Почему важно: это _чат-специфично_, то есть “в этом чате всегда используй вот эту персону”.

### 3.2 Default persona (глобальный дефолт)

- **Хранение**: `power_user.default_persona = <avatarId>`
- **Сохранение**: через `saveSettingsDebounced()`

### 3.3 Character/Group connections (привязка к персонажу/группе)

- **Хранение**: `power_user.persona_descriptions[avatarId].connections = [{type:'character'|'group', id:<key>}, ...]`
  - для character `id` = `characters[<chid>].avatar` (строка-ключ аватара персонажа)
  - для group `id` = `selected_group` (group id)
- **Сохранение**: `saveSettingsDebounced()`

Ключевые функции в ST:

- `getCurrentConnectionObj()` → возвращает `{type,id}` для текущего чата (character или group)
- `togglePersonaLock(type)` / `lockPersona(type)` / `unlockPersona(type)`
- `loadPersonaForCurrentChat()` → автоселект персоны при смене чата

---

## 4) Когда ST “применяет” Connections (логика выбора персоны)

На событии смены чата (`CHAT_CHANGED`) ST вызывает `loadPersonaForCurrentChat()` и выбирает персону по приоритету:

1. **chat_metadata['persona']** (chat lock)
2. **connections** к текущему character/group (если несколько — может появиться попап выбора)
3. **power_user.default_persona** (default)

Важно: это работает именно для **выбора user persona**, а не для сборки текста prompt напрямую.

---

## 5) Что может расширение (важное для override’ов PME)

Расширение в браузере может:

### 5.1 Работать с chat metadata (привязки “к чату”)

Через `getContext()` доступно:

- `context.chatMetadata` (это `chat_metadata`)
- `context.saveMetadataDebounced()` / `context.saveMetadata()`

Это подходит для override’ов вида: “в этом конкретном чате включи/выключи некоторые Additional blocks”.

### 5.2 Работать с character card extension fields (привязки “к персонажу”, переносимые вместе с карточкой)

Доступно:

- `writeExtensionField(characterId, key, value)` из `public/scripts/extensions.js`

Это пишет в `data.extensions.<key>` на карточке персонажа и сохраняет на сервер.

Плюс: переносится вместе с персонажем/карточкой (как часть character data).
Минус: для **group** это не применимо напрямую (группы хранятся отдельно).

### 5.3 Хранить глобальные настройки расширения (fallback)

Через `extension_settings` можно хранить глобальные данные расширения.

Плюс: просто.
Минус: не переносится с карточкой персонажа; хуже для шаринга/экспорта.

---

## 6) Как перенести идею на PME: “Override rules” для Additional Descriptions

Сейчас в PME:

- **базовые данные** Additional Descriptions хранятся _на персону_:
  - `power_user.persona_descriptions[avatarId].pme.blocks`
- применяются _на генерации_ через runtime-patch:
  - `src/injector.js` вычисляет `finalPersonaText = base + enabledAdditions`
  - и временно подменяет `power_user.persona_description`, потом откатывает

Чтобы “привязать” Additional Descriptions, нужен слой **override’ов** поверх базы.

### 6.1 Минимально полезный функционал (MVP)

Сделать возможность:

- в **текущем чате** включить/выключить определённые blocks/items (override на chat)
- для **текущего персонажа** (character) включить/выключить blocks/items (override на character)

UI-уровень: кнопки вроде “Применять в этом чате” / “Привязать к этому персонажу”, плюс индикатор “override активен”.

### 6.2 Что именно оверрайдить (самый дешёвый и понятный вариант)

Оверрайдить **только включённость** (enabled/disabled) по `id` блоков/элементов:

- не копировать тексты (они остаются persona-scoped)
- override хранит только:
  - `disabledIds: string[]` (или `enabledIds`, но обычно удобнее `disabledIds`)

Это позволяет:

- не дублировать большие тексты
- сделать стабильные merge-правила
- минимизировать миграции

### 6.3 Приоритеты override’ов (аналогично ST)

Рекомендуемый порядок (сверху сильнее):

1. **chat override**
2. **character/group override**
3. **persona base** (`descriptor.pme.blocks`)

То есть: если block отключён в чате — он не попадёт в prompt даже если включён на персоне.

---

## 7) Варианты хранения override’ов (плюсы/минусы)

### Вариант A: Chat override в `chat_metadata`

**Где хранить** (пример):

- `chat_metadata.pme = { additionalOverrides: { disabledIds: [...] } }`

**Плюсы**

- идеально соответствует “привязке к конкретному чату”
- переживает перезапуск (если metadata сохраняется)
- не требует модификации core ST

**Минусы**

- metadata нужно аккуратно сохранять (debounced), учитывать смену чата

### Вариант B: Character override в character card extensions (рекомендуется для “привязки к персонажу”)

**Где хранить**:

- `character.data.extensions.pme = { additionalOverrides: { disabledIds: [...] } }`

**Как записывать**

- `writeExtensionField(characterId, 'pme', payload)`

**Плюсы**

- переносимо с карточкой персонажа
- “привязка к персонажу” становится реальной и шаримой

**Минусы**

- нужно аккуратно отличать `characterId` (индекс в массиве `characters`) и `character.avatar` (string key)
- для group не подходит напрямую

### Вариант C: Group override (только если нужно) — в chat metadata или extension_settings

Для group-chat в ST “connection id” = `selected_group`. Для PME можно:

- хранить group override в `chat_metadata` (если привязка нужна только к этому чату группы),
  или
- хранить глобально в `extension_settings.personaManagementExtended.groupOverrides[selected_group]`

Компромисс: начать с chat+character, group добавить позже.

---

## 8) Где интегрировать в PME (конкретные точки)

### 8.1 Injector (`src/injector.js`)

Сейчас `collectEnabledAdditionalTexts(descriptor)` берёт только `descriptor.pme.blocks`.

Нужно:

- получить текущий контекст (chat / current character / selected_group)
- загрузить overrides для чата/персонажа
- вычислить “effective enabled” для каждого item/group/item-in-group
- уже по effective enabled собрать тексты

Важно сохранить инвариант PME:

- **не сохранять** runtime-подмену `power_user.persona_description` на диск
- overrides — это отдельные данные, они могут сохраняться в metadata/character, но не должны приводить к записи “инжектнутого” текста в persona description.

### 8.2 UI (`src/ui/components/additionalDescriptions.js`)

Добавить:

- переключатель “Override mode: Chat / Character” (или две кнопки)
- действия:
  - “Сделать текущие enabled/disabled привязкой для этого чата”
  - “Сделать текущие enabled/disabled привязкой для этого персонажа”
  - “Сбросить override”
- индикатор статуса:
  - “override активен” + scope

### 8.3 Store / data-model (`src/store/personaStore.js`)

Текущее хранилище persona-scoped (`descriptor.pme`) можно оставить как есть.

Override данные лучше хранить отдельно:

- chat metadata: не в personaStore
- character: отдельный helper, использующий `writeExtensionField`

---

## 9) Предлагаемая схема данных (черновик)

### 9.1 Chat metadata (пример)

```js
chat_metadata.pme = {
  version: 1,
  additional: {
    disabledIds: ["blockId1", "itemId2", "..."],
  },
};
```

### 9.2 Character card extension field (пример)

```js
character.data.extensions.pme = {
  version: 1,
  additional: {
    disabledIds: ["blockId1", "itemId2", "..."],
  },
};
```

### 9.3 Что делать с group

Пока можно отложить.
Если понадобится:

- group override можно сделать как отдельный ключ `group:<selected_group>` в extension_settings,
  или хранить в metadata текущего group-чата (если поведение нужно “на этот чат группы”, а не глобально на группу).

---

## 10) Риски и нюансы

- **Стабильность ID**: override по `id` работает только если `id` у blocks/items стабилен. Сейчас `personaStore.makeId()` создаёт id на основе времени+rand — это ок, главное не пересоздавать id при нормализации/миграциях.
- **Смена чата**: для chat override нужно сохранять в правильный чат (использовать `saveMetadataDebounced()` и учитывать смену контекста).
- **Персонаж vs группа**: `getCurrentConnectionObj()` в ST различает `selected_group` и `characters[this_chid]`. В PME придётся повторить такую же развилку.
- **UI/UX**: важно показывать пользователю, что он сейчас меняет “персональные настройки персоны” или “override для чата/персонажа”.

---

## 11) Рекомендуемый план реализации (итеративно)

**Этап 1 (MVP, самый полезный):**

- Chat override:
  - хранение в `chat_metadata.pme.additional.disabledIds`
  - UI: “Сохранить для этого чата” / “Сбросить для этого чата”
  - injector: учитывать chat disabledIds при сборке enabled additions

**Этап 2:**

- Character override (переносимо):
  - хранение в `character.data.extensions.pme.additional.disabledIds` через `writeExtensionField`
  - UI: “Сохранить для этого персонажа” / “Сбросить для этого персонажа”
  - injector: учитывать character override вторым приоритетом

**Этап 3 (опционально):**

- Group override (если реально нужен)
- более продвинутые правила (например “в этом чате включить группу X целиком”, “снять override и вернуться к базе”)
