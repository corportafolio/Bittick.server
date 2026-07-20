# 06 — Sistema y Registro de Preferencias por Bot

## Vinculación entre documentos

| Documento | Rol |
|-----------|-----|
| [03 — Sistema Spot BTC](03_sistema-spot-btc.md) | Implementación actual — ejecución global sin distinción por bot |
| [04 — IDs Colección Bittick Agent](04_IDs-coleccion-Bittick-Agent.md) | Catálogo — 100 bots, número, inscription ID, tier |
| **Este documento** | Extensión — sistema de preferencias individuales por bot |

---

## 1. Problema actual

El sistema de trading actual es **global**: una sola estrategia, una sola configuración, ejecutándose para todos los bots por igual. No distingue entre el bot #88 (FOUNDER) y el bot #13 (STANDARD).

**Consecuencias:**
- Todos los bots operan con los mismos parámetros
- No se puede personalizar estrategia por bot
- Las posiciones no se vinculan a un bot/usuario específico
- El servidor no sabe qué bot está activo en cada momento

---

## 2. Objetivo

Implementar un sistema donde **cada bot tenga sus propias preferencias de trading**, independientes para cada modo (SPOT y FUTUROS). El servidor debe:

1. **Saber qué bot está conectado** en todo momento
2. **Guardar preferencias por bot por modo** (parámetros de estrategia, límites, etc.)
3. **Ejecutar estrategias personalizadas** por bot
4. **Vincular cada posición** a un bot/usuario específico

---

## 3. Schema: tabla `bot_strategies`

```sql
CREATE TABLE IF NOT EXISTS bot_strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inscription_id TEXT NOT NULL,
    mode TEXT NOT NULL,                    -- 'spot' o 'futures'
    strategy_name TEXT NOT NULL,           -- 'rangeStrategy', 'maCrossStrategy', etc.
    enabled INTEGER NOT NULL DEFAULT 1,    -- 0=off, 1=on
    parameters TEXT DEFAULT '{}',          -- JSON con parámetros de la estrategia
    position_size_usdt REAL NOT NULL DEFAULT 10.0,
    max_positions INTEGER NOT NULL DEFAULT 5,
    min_confidence INTEGER NOT NULL DEFAULT 5,
    leverage INTEGER DEFAULT 1,           -- solo futures, default 1x
    stop_loss_percent REAL DEFAULT 2.0,   -- futures: % de stop loss
    take_profit_percent REAL DEFAULT 4.0, -- % de take profit
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(inscription_id, mode)
);
```

### Campos explicados

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `inscription_id` | TEXT | ID de la inscripción (identifica al bot dueño) |
| `mode` | TEXT | `'spot'` o `'futures'` — cada bot tiene 2 configs |
| `strategy_name` | TEXT | Nombre de la estrategia a ejecutar |
| `enabled` | INTEGER | Si este agente está activo para este bot |
| `parameters` | TEXT | JSON con parámetros específicos de la estrategia |
| `position_size_usdt` | REAL | Cuánto USD apostar por posición |
| `max_positions` | INTEGER | Máximo de posiciones abiertas simultáneamente |
| `min_confidence` | INTEGER | Confianza mínima de la señal para ejecutar |
| `leverage` | INTEGER | Apalancamiento (solo futures, 1x = sin apalancamiento) |
| `stop_loss_percent` | REAL | % de stop loss (solo futures) |
| `take_profit_percent` | REAL | % de take profit |

---

## 4. Ejemplo de configuración por bot

### Bot #88 (FOUNDER) — SPOT

```json
{
    "inscription_id": "abc123...xyz",
    "mode": "spot",
    "strategy_name": "rangeStrategy",
    "enabled": 1,
    "parameters": {
        "rsi_oversold": 25,
        "rsi_overbought": 75,
        "supportZoneBuffer": 0.005,
        "minVolumeRatio": 1.2
    },
    "position_size_usdt": 15.0,
    "max_positions": 3,
    "min_confidence": 6,
    "take_profit_percent": 5.0
}
```

### Bot #88 (FOUNDER) — FUTUROS

```json
{
    "inscription_id": "abc123...xyz",
    "mode": "futures",
    "strategy_name": "maCrossStrategy",
    "enabled": 1,
    "parameters": {
        "fastMA": 9,
        "slowMA": 21,
        "confirmationCandles": 2,
        "volumeFilter": true
    },
    "position_size_usdt": 20.0,
    "max_positions": 4,
    "min_confidence": 7,
    "leverage": 5,
    "stop_loss_percent": 3.0,
    "take_profit_percent": 8.0
}
```

### Bot #13 (STANDARD) — SPOT

```json
{
    "inscription_id": "def456...uvw",
    "mode": "spot",
    "strategy_name": "renkoAccumulation",
    "enabled": 1,
    "parameters": {
        "brickSize": 50,
        "reversalBricks": 3,
        "minScore": 7
    },
    "position_size_usdt": 10.0,
    "max_positions": 5,
    "min_confidence": 5,
    "take_profit_percent": 4.0
}
```

---

## 5. Flujo de ejecución per-bot

```
scanMarket()  (cada 1 minuto)
  │
  ├── 1. Consultar bots activos:
  │      SELECT * FROM user_inscriptions WHERE selected = 1
  │      → [{inscription_id: "abc123", bot_num: 88, address: "bc1pha..."}]
  │
  ├── 2. Para CADA bot activo:
  │      │
  │      ├── 3. Cargar preferencias SPOT:
  │      │      SELECT * FROM bot_strategies
  │      │      WHERE inscription_id = 'abc123' AND mode = 'spot'
  │      │      → {strategy_name, parameters, position_size, ...}
  │      │
  │      ├── 4. Si enabled = 0, skip
  │      │
  │      ├── 5. Ejecutar estrategia (strategy_name) con sus parameters
  │      │      → genera señal {score, entryZone, target, stopLoss}
  │      │
  │      ├── 6. Filtrar: score >= min_confidence
  │      │
  │      ├── 7. evaluateAndExecute() CON inscription_id y address
  │      │
  │      └── 8. insertPosition() ESCRIBE inscription_id y address en BD
  │
  ├── 9. Repetir paso 3-8 para mode = 'futures'
  │
  └── 10. Log resumen por bot
```

---

## 6. Cambios en el código

### 6.1 `tradingStore.js`

#### Nueva tabla
```javascript
// Al inicio de initDB()
db.run(`CREATE TABLE IF NOT EXISTS bot_strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inscription_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    strategy_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    parameters TEXT DEFAULT '{}',
    position_size_usdt REAL NOT NULL DEFAULT 10.0,
    max_positions INTEGER NOT NULL DEFAULT 5,
    min_confidence INTEGER NOT NULL DEFAULT 5,
    leverage INTEGER DEFAULT 1,
    stop_loss_percent REAL DEFAULT 2.0,
    take_profit_percent REAL DEFAULT 4.0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(inscription_id, mode)
)`);
```

#### `insertPosition()` — agregar inscription_id y address
```javascript
function insertPosition(pos) {
    const stmt = db.prepare(`INSERT INTO positions
        (bot_type, strategy_type, asset, entry_price, quantity, order_id,
         target, stop_loss, score, confidence, ai_explanation, factors,
         risks, signals, horizonte, usd_amount, status, pnl, pnl_percent,
         inscription_id, address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, 0, ?, ?)`);
    //                                                    ^^^^^^^^inscription_id^^address
}
```

#### `getPositions()` — filtrar por address
```javascript
function getPositions(botType = null, status = 'open', address = null) {
    let sql = "SELECT * FROM positions WHERE status = ?";
    const params = [status];
    if (botType) { sql += " AND bot_type = ?"; params.push(botType); }
    if (address) { sql += " AND address = ?"; params.push(address.toLowerCase()); }
    sql += " ORDER BY opened_at DESC";
    // ...
}
```

#### Nuevas funciones CRUD
```javascript
function getBotStrategy(inscriptionId, mode) { ... }
function saveBotStrategy(strategy) { ... }  // INSERT OR REPLACE
function getAllBotStrategies(inscriptionId) { ... }
function deleteBotStrategy(inscriptionId, mode) { ... }
```

### 6.2 `botManager.js`

#### `evaluateAndExecute()` — recibir context
```javascript
async function evaluateAndExecute(signal, context = {}) {
    // context = { inscriptionId, address, botNum }
    // ...
    const position = await executor.executeOrder(botType, signal, { usdAmount, leverage });
    position.inscription_id = context.inscriptionId || null;
    position.address = context.address || null;
    const id = store.insertPosition(position);
    // ...
}
```

#### `monitorPositions()` — filtrar por address
```javascript
async function monitorPositions() {
    // Ahora recibe address para filtrar posiciones de ESTE usuario
    const positions = store.getPositions(botType, 'open', address);
    // ...
}
```

### 6.3 `tradingManager.js`

#### `scanMarket()` — iterar bots activos
```javascript
async function scanMarket() {
    // 1. Obtener bots activos
    const activeBots = store.getActiveInscriptions();
    // [{inscription_id, bot_num, address}]

    for (const bot of activeBots) {
        // 2. Cargar preferencias SPOT
        const spotConfig = store.getBotStrategy(bot.inscription_id, 'spot');
        if (spotConfig && spotConfig.enabled) {
            await executeStrategyForBot(bot, 'spot', spotConfig);
        }

        // 3. Cargar preferencias FUTUROS
        const futuresConfig = store.getBotStrategy(bot.inscription_id, 'futures');
        if (futuresConfig && futuresConfig.enabled) {
            await executeStrategyForBot(bot, 'futures', futuresConfig);
        }
    }
}

async function executeStrategyForBot(bot, mode, config) {
    // Cargar estrategia por nombre
    const strategy = strategies[config.strategy_name];
    if (!strategy) return;

    // Ejecutar con parámetros personalizados
    const params = JSON.parse(config.parameters);
    const signal = strategy.evaluate(klines, currentPrice, params);

    // Filtrar por min_confidence
    if (signal.confidence < config.min_confidence) return;

    // Verificar max_positions para este bot
    const currentPositions = store.getPositions(mode, 'open', bot.address);
    if (currentPositions.length >= config.max_positions) return;

    // Ejecutar con context del bot
    await botManager.evaluateAndExecute(signal, {
        inscriptionId: bot.inscription_id,
        address: bot.address,
        botNum: bot.bot_num
    });
}
```

### 6.4 `tradingRouter.js`

#### Nuevos endpoints CRUD

```
GET    /api/bot-strategies/:inscriptionId     → listar preferencias de un bot
POST   /api/bot-strategies                    → crear/actualizar preferencia
DELETE /api/bot-strategies/:inscriptionId/:mode → eliminar preferencia
```

#### Modificar endpoints existentes

```
GET /api/trading/positions
  → filtrar por address (del header x-wallet-address)

GET /api/trading/bot/status
  → filtrar posiciones por address
  → retornar status SOLO del bot activo de ese usuario
```

---

## 7. API Endpoints

### Crear/Actualizar preferencia

```
POST /api/bot-strategies
Header: x-wallet-address: bc1pha...

Body:
{
    "inscription_id": "abc123...xyz",
    "mode": "spot",
    "strategy_name": "rangeStrategy",
    "enabled": 1,
    "parameters": { "rsi_oversold": 25 },
    "position_size_usdt": 15,
    "max_positions": 3,
    "min_confidence": 6,
    "take_profit_percent": 5
}

Response:
{ "exito": true, "data": { ...preferencia guardada... } }
```

### Listar preferencias de un bot

```
GET /api/bot-strategies/abc123...xyz
Header: x-wallet-address: bc1pha...

Response:
{
    "exito": true,
    "data": {
        "spot": { ...config spot... },
        "futures": { ...config futures... }
    }
}
```

### Eliminar preferencia

```
DELETE /api/bot-strategies/abc123...xyz/spot
Header: x-wallet-address: bc1pha...

Response:
{ "exito": true, "message": "Preferencia eliminada" }
```

---

## 8. Cambios en Android

### `TradingUiState` — agregar botNumber

```kotlin
data class TradingUiState(
    // ... existente ...
    val botNumber: Int? = null,    // NUEVO
)
```

### `TradingViewModel.loadAll()` — leer botNumber

```kotlin
fun loadAll() {
    val botNum = prefs.getBotNumber()
    _state.value = _state.value.copy(botNumber = botNum)
    // ... resto de loadAll ...
}
```

### `BotSection` — mostrar número

```kotlin
// Antes:
Text("BOT $label BTC", ...)

// Después:
Text("BOT ${state.botNumber ?: "?"} $label BTC", ...)
```

### `TradingScreen` — pasar botNumber al TopAppBar

```kotlin
TopAppBar(
    title = {
        Text("Bot ${state.botNumber ?: ""} — bittick", ...)
    },
    // ...
)
```

---

## 9. Migración de datos existentes

### Paso 1: Crear configs default para bots existentes

```javascript
// Script de migración
const activeBots = db.prepare(
    "SELECT DISTINCT inscription_id, address FROM user_inscriptions WHERE selected = 1"
).all();

for (const bot of activeBots) {
    // SPOT default
    db.prepare(`INSERT OR IGNORE INTO bot_strategies
        (inscription_id, mode, strategy_name, enabled, parameters, position_size_usdt)
        VALUES (?, 'spot', 'rangeStrategy', 1, '{}', 10)`).run(bot.inscription_id);

    // FUTURES default
    db.prepare(`INSERT OR IGNORE INTO bot_strategies
        (inscription_id, mode, strategy_name, enabled, parameters, position_size_usdt, leverage)
        VALUES (?, 'futures', 'maCrossStrategy', 1, '{}', 10, 1)`).run(bot.inscription_id);
}
```

### Paso 2: Las posiciones existentes quedan sin inscription_id

Las posiciones ya creadas no se modifican. Las nuevas sí llevarán `inscription_id` y `address`.

---

## 10. Estrategias soportadas

| Nombre | Modo | Descripción |
|--------|------|-------------|
| `rangeStrategy` | SPOT/FUTUROS | Zonas de soporte/resistencia + RSI |
| `maCrossStrategy` | SPOT/FUTUROS | Cruce de medias móviles |
| `renkoAccumulation` | SPOT | Acumulación en patrones Renko |
| `spotFib` | SPOT | Fibonacci en soportes |

Cada estrategia acepta un objeto `parameters` con sus propios campos. El sistema es extensible: agregar una nueva estrategia solo requiere crear la función y registrar el nombre.

---

## 11. Seguridad

- Cada bot solo puede modificar sus propias preferencias
- El `inscription_id` debe coincidir con una inscripción verificada del usuario
- El `address` del header debe coincidir con el owner de la inscripción
- Endpoints de trading filtran por `address` — un usuario no ve posiciones de otro

---

## 12. Referencia de código

| Archivo | Cambio | Estado |
|---------|--------|--------|
| `tradingStore.js` | Tabla `bot_strategies` + CRUD | Pendiente |
| `tradingStore.js` | `insertPosition()` con inscription_id/address | Pendiente |
| `tradingStore.js` | `getPositions()` con filtro address | Pendiente |
| `botManager.js` | `evaluateAndExecute()` con context | Pendiente |
| `botManager.js` | `monitorPositions()` con address | Pendiente |
| `tradingManager.js` | `scanMarket()` per-bot | Pendiente |
| `tradingRouter.js` | Endpoints CRUD strategies | Pendiente |
| `tradingRouter.js` | Modificar positions/status endpoints | Pendiente |
| `TradingUiState` | Agregar `botNumber` | Pendiente |
| `TradingViewModel` | Leer botNumber de prefs | Pendiente |
| `TradingScreen` | BotSection con número | Pendiente |
