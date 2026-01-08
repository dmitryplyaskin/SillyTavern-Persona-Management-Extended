## Persona Management Extended — UI/Render Guide (актуально)

Этот документ описывает **как устроен обновлённый UI**, как работает **рендер/обновления без полного ререндера**, и где править код, чтобы между сессиями быстро восстановить контекст.

---

## 1) Главная идея: mount один раз, дальше update точечно

В Advanced UI мы **не делаем постоянный `root.innerHTML = ""`**.

- **Mount**: DOM создаётся один раз при первом показе Advanced UI.
- **Update**: при событиях (смена персоны, ввод, изменения нативного UI ST) обновляются **только нужные компоненты**.

Это убирает класс проблем:
- сброс скролла/фокуса,
- “прыжки” списка,
- отвалившиеся нативные элементы SillyTavern при переносе DOM‑нод,
- лишние перерисовки.

---

## 2) Точки входа и жизненный цикл UI

### 2.1 Оркестратор режима (Normal/Advanced)

Файл: `src/ui/personaManagementTab.js`

Отвечает за:
- инжект переключателя **Advanced** в шапку Persona Management,
- hide/show штатного блока `#persona-management-block`,
- создание контейнера `#pme_root`,
- открытие/закрытие Advanced UI,
- авто‑скролл к активной персоне **только при открытии** дровера,
- наблюдение за нативным списком персон ST (`#user_avatar_block`) и “инвалидирование” нашего списка.

Публичные функции (используются entrypoint’ом `index.js`):
- `ensurePersonaManagementUI()`
- `applyMode()`
- `refreshAdvancedUIIfVisible()`

### 2.2 Сборка Advanced UI

Файл: `src/ui/advancedApp.js`

Отвечает за:
- создание структуры layout (левая колонка + правая колонка),
- инициализацию компонентов,
- подписку на события через `uiBus`,
- методы:
  - `open({autoScroll})` — показать/обновить UI,
  - `refreshPersonas(...)`,
  - `refreshAll()`,
  - `destroy()` — очистка и возврат нативных нод ST назад.

---

## 3) Компоненты UI (где что править)

Папка: `src/ui/components/`

### 3.1 `personaList.js`

Компонент списка персон (левая колонка):
- поиск/фильтр,
- сортировки,
- сохранение `scrollTop`,
- кэш списка `getUserAvatars(false)` (инвалидируется при изменениях),
- выбор персоны через `setUserAvatar(...)`.

Дополнительно:
- рисует бейдж **Lorebook** (тёмно‑зелёный), если у персоны есть `persona_descriptions[avatarId].lorebook`.

### 3.2 `currentPersonaPanel.js`

Панель текущей персоны (правый верх):
- имя персоны в заголовке,
- кнопки управления (rename/duplicate/delete/image/…),
- Persona Description + токены,
- Position + Depth/Role (включается только при `In-chat @ Depth`).

Важное:
- поддержан ST‑механизм “Expand editor”: SillyTavern использует `jQuery.trigger('input')`, поэтому обработчик подписан и на native input, и на jQuery input.

### 3.3 `personaLinksGlobalSettings.js`

Карточка **Connections & Global Settings**:
- контент берётся из **оригинального DOM SillyTavern**, мы **перемещаем реальные ноды**, чтобы сохранить обработчики ST.
- есть коллапс.
- при закрытии Advanced UI — ноды возвращаются назад.

### 3.4 `additionalDescriptions.js`

Карточка **Additional Descriptions**:
- коллапс (сохраняется),
- кнопки:
  - **+** — создать item (block типа `item`),
  - **G+** — создать group (block типа `group`),
  - fullscreen — открыть редактор в модальном окне (через `callGenericPopup`).

Ключевой инвариант: **порядок блоков важен** (будет влиять на сборку итогового промпта), поэтому UI рендерит строго по порядку данных.

### 3.5 `dom.js`

Мелкие DOM‑утилиты (`el`, `setHidden`, …) — чтобы компоненты оставались “чистыми” и маленькими.

---

## 4) Событийная шина UI (uiBus)

Файл: `src/ui/uiBus.js`

Мини‑pub/sub, чтобы компоненты не импортировали друг друга.

Основные события (`UI_EVENTS`):
- `PERSONA_CHANGED` — выбор другой персоны,
- `PERSONA_DESC_CHANGED` — изменение persona description,
- `PERSONA_LIST_INVALIDATED` — нативные изменения списка (rename/duplicate/delete/image),
- `UI_OPEN`, `UI_CLOSE`,
- `LINKS_TOGGLED`.

`advancedApp.js` подписывается на события и вызывает точечные `update()`.

---

## 5) Модель данных Additional Descriptions (важно)

Хранилище: `power_user.persona_descriptions[avatarId].pme`

Текущая схема (clean start):

- `version: 1`
- `blocks: PmeBlock[]`

`PmeBlock` бывает:
- `type: "item"` + поля item (`id/title/text/enabled/collapsed`)
- `type: "group"` + поля group (`id/title/enabled/collapsed/items: PmeItem[]`)

Инварианты:
- **Нельзя автоматически сортировать `blocks`**.
- `collapsed` хранится в данных, чтобы UI не раскрывал всё заново при повторном открытии.

---

## 6) Где менять “как обновляется UI”

Правило:
- “структурные” изменения → `advancedApp.open(...)` / `destroy()`
- обычные изменения (ввод, чекбоксы, коллапсы) → `patch*` в store + локальный `render()` внутри компонента или `bus.emit(...)`.

Если ты добавляешь новый блок:
- создаёшь новый компонент в `src/ui/components/...`,
- подключаешь в `advancedApp.js`,
- добавляешь 1–2 события в `uiBus` (если нужно),
- и держишь API компонента в стиле `mount()/update()/destroy()`.

