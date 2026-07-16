# Sistema de Trading Spot BTC

## Vinculación entre documentos

| Documento | Rol |
|-----------|-----|
| [Estrategia Trading Avizor](estrategia-trading-avizor.md) | Metodología — define el QUÉ: zonas como imanes, scoring, reglas de entrada/salida |
| [Zonas Trading Avizor](zonas-trading-avizor.md) | Catálogo — define el DÓNDE: precios exactos de zonas, deudas, patrones Renko |
| **Este documento** | Implementación — define el CÓMO: sistema que ejecuta la estrategia en spot BTC |

**Los 3 deben leerse en conjunto.** La estrategia sin implementación es teoría. El sistema sin estrategia opera sin dirección. Las zonas sin sistema no generan órdenes.

---

## Responsabilidad del sistema

Este sistema es el **único responsable de ejecutar órdenes de compra y venta spot en BTCUSDT** de forma automática. Sus responsabilidades son:

1. **Evaluar señales** — Recibir señales de las estrategias, filtrar por nivel mínimo (score>=6, confidence>=6), determinar si aplica apertura.
2. **Asignar capital por nivel** — Distribuir el presupuesto según el nivel de la señal (10/20/40/20/10%).
3. **Garantizar 1 posición por nivel** — No abrir múltiples posiciones en el mismo rango.
4. **Monitorear posiciones abiertas** — Cerrar por take profit (spot NO tiene stop loss — HODL en bajada).
5. **Cancelar operaciones** — Vender todo el BTC de una posición cuando el usuario lo solicite.
6. **Notificar resultados** — Reportar aperturas, cierres, PnL al usuario vía app.

**No es responsable de:** operar futuros, calcular zonas (sistema separado), analizar IA (sistema separado), gestión de riesgo multi-activo.

---

## Pipeline completo (señal → orden)

```
Estrategia (renkoAccumulation, spotFib, etc.)
  → e valúa klines + precio actual
  → genera señal { score, entryZone, target, stopLoss }
      ↓
AI Analyzer (aiAnalyzer.js)
  → analiza señal con IA
  → añade { confidence, explicacion, factores }
      ↓
Trading Manager (tradingManager.js)
  → recibe señal enriquecida
  → llama a evaluateAndExecute()
      ↓
Bot Manager (botManager.js)
  → evaluateAndExecute()
  → filtra: score>=6 && confidence>=6
  → nivel = min(score, confidence)
  → verifica 1 posición por nivel
  → calcula usdAmount = budget * tier.percent / 100
  → ejecuta orden MARKET BUY via executionEngine
      ↓
Execution Engine (executionEngine.js)
  → redondea cantidad al step size
  → valida mínimo notional ($5 spot)
  → llama a Binance API (testnet)
      ↓
Binance (testnet.binance.vision)
  → ejecuta MARKET BUY
  → devuelve orden llena con precio y cantidad
      ↓
Posición almacenada en SQLite (trading.db)
  → status='open', con score, confidence, entryPrice, quantity, usdAmount

--- cada 60 segundos ---

Monitor Positions (botManager.js:monitorPositions)
  → consulta posiciones abiertas
  → actualiza precio actual + PnL en DB
  → check take profit: si precio >= target, vende (MARKET SELL)
  → NO check stop loss en spot (HODL)
```

---

## Funciones clave del servidor

### `botManager.js:evaluateAndExecute(signal)`

**Propósito:** Evalúa una señal entrante, determina si debe abrir posición y la ejecuta.

**Por qué se mejoró:** Antes cada señal abría una posición sin verificar si ya existía una en el mismo nivel. Además usaba `getTierConfig` con `>=` que devolvía el primer tier coincidente sin exigir que ambos marcadores estén en el mismo número.

**Qué pasa sin esta función:** Sin ella, el sistema no puede filtrar señales ni ejecutar órdenes. Si se usara la versión anterior (sin check 1-por-nivel), con 10 señales en 10 minutos se abrirían hasta 5 posiciones en el mismo nivel, sobre-asignando capital y acumulando BTC sin control.

**Por qué esta implementación y no otra:** Se usa `Math.min(score, confidence)` como nivel y se verifica contra posiciones existentes in-memory (`openPositions.some(...)`) en vez de una query SQL separada, porque las posiciones abiertas ya se cargan para el chequeo de `max_positions`. Esto evita una consulta adicional a SQLite manteniendo la atomicidad.

**Código esencial:**
```js
if (score < 6 || confidence < 6) { /* skip */ }
const nivel = Math.min(score, confidence);
const tier = getTierConfig(nivel); // match exacto, no >=
const alreadyAtLevel = openPositions.some(p =>
  Math.min(Math.round(p.score), Math.round(p.confidence)) === nivel
);
if (alreadyAtLevel) { /* skip */ }
```

---

### `botManager.js:getTierConfig(nivel)`

**Propósito:** Devuelve la configuración de capital para un nivel exacto.

**Por qué se mejoró:** Antes usaba `if (nivel >= t.nivel)` que emparejaba nivel 8 con tier 8 (correcto) pero también emparejaba nivel 7 con tier 7 (correcto) y nivel 8 con tier 8 (correcto). El problema es que nivel 7 también emparejaba con tier 6 (incorrecto para la estrategia escalonada). Con match exacto cada nivel solo obtiene su porcentaje asignado.

**Qué pasa sin esta función:** `evaluateAndExecute` no podría determinar qué porcentaje de capital usar. Sin la mejora (usando `>=`), un nivel 7 podría usar el tier 6 si estuviera ordenado ascendentemente, o nivel 8 usaría tier 8 (45%) cuando debería usar 40%.

**Código esencial:**
```js
function getTierConfig(nivel) {
  return TIERS.find(t => t.nivel === nivel) || null;
}
```

---

### `botManager.js:monitorPositions()`

**Propósito:** Monitorea cada 60 segundos las posiciones abiertas para cerrar por take profit.

**Por qué spot NO tiene stop loss:** La filosofía del spot es HODL en bajada. Si el precio cae, la posición se mantiene esperando recuperación. Si se vendiera en stop loss, se materializaría la pérdida y se perdería el rebote. En spot no hay liquidación, no hay apalancamiento, no hay riesgo de pérdida total. El riesgo es oportunidad (tiempo fuera del mercado), no de capital.

**Qué pasa sin esta función:** Las posiciones quedarían abiertas para siempre, nunca se cerrarían en take profit. Sin la mejora (SL incluido para spot), las posiciones spot se cerrarían en stop loss, violando la filosofía HODL.

**Código esencial (spot):**
```js
// Spot: solo TP
if (pos.target && pos.strategy_type === 'long' && currentPrice >= pos.target) {
  shouldClose = true;
  closeReason = 'take profit';
}
// SL solo para futuros
if (!shouldClose && pos.bot_type !== 'spot') {
  if (pos.stop_loss && pos.strategy_type === 'long' && currentPrice <= pos.stop_loss) {
    shouldClose = true;
    closeReason = 'stop loss';
  }
}
```

---

### `botManager.js:cancelPositionById(id)`

**Propósito:** Cancela una operación abierta: vende todo el BTC de la posición en spot.

**Por qué se mejoró:** La versión anterior llamaba `executor.cancelPosition()` que ejecutaba `cancelOrder()` en Binance para TODO tipo. En spot, la orden original es MARKET BUY y se llena al instante, por lo que `cancelOrder()` sobre una orden ya llena devuelve error `-2011 UNKNOWN_ORDER`. La nueva versión coloca una orden SELL MARKET para salir de la posición.

**Qué pasa sin esta función:** El botón "CANCELAR OPERACION" en la app haría una petición HTTP que el servidor respondería con error 500 (por el `cancelOrder` fallido). La app no mostraría retroalimentación porque el `else` del `response.isSuccessful` no existía — el usuario toca el botón y no pasa nada visible.

**Código esencial:**
```js
if (position.bot_type === 'spot' && position.quantity > 0) {
  await binance.placeOrder('spot', position.asset, 'SELL', sellQty);
} else if (position.bot_type === 'futures') {
  if (position.order_id) {
    try {
      await executor.cancelPosition(...);
    } catch (_) {
      // orden ya llena, cerrar con orden opuesta
      await binance.placeOrder('futures', position.asset, closeSide, closeQty);
    }
  }
}
```

---

## Estrategia por niveles

Ambos **score** y **confidence** deben alcanzar el mismo número. Uno solo no es suficiente.

| Nivel | Score | Confianza | % Capital | USD (budget $100) | Regla |
|-------|-------|-----------|-----------|-------------------|-------|
| 6 | ≥6 | ≥6 | 10% | $10 | 1 posición máxima |
| 7 | ≥7 | ≥7 | 20% | $20 | 1 posición máxima |
| 8 | ≥8 | ≥8 | 40% | $40 | 1 posición máxima |
| 9 | ≥9 | ≥9 | 20% | $20 | 1 posición máxima |
| 10 | ≥10 | ≥10 | 10% | $10 | 1 posición máxima |

**Regla fundamental:** "1 posición por rango". Si ya hay una posición abierta en nivel 6, no se abre otra en nivel 6 aunque lleguen más señales con score=6, confidence=6. Se espera al siguiente rango (nivel 7+).

**Capital total:** La suma de todos los niveles es 100% del presupuesto ($100 spot). Las posiciones son independientes — puedes tener hasta 5 posiciones simultáneas (una por nivel).

**Escenario completo:**
1. Señal: score=7, confianza=7 → nivel=7 → 20% ($20) → posición abierta
2. Señal: score=6, confianza=6 → nivel=6 → 10% ($10) → posición abierta (distinto nivel)
3. Señal: score=7, confianza=7 → nivel=7 → **NO** (ya hay posición en nivel 7)
4. Señal: score=9, confianza=9 → nivel=9 → 20% ($20) → posición abierta
5. Señal: score=8, confianza=8 → nivel=8 → 40% ($40) → posición abierta
6. Señal: score=10, confianza=10 → nivel=10 → 10% ($10) → posición abierta
7. Resultado: 5 posiciones abiertas usando 100% del capital ($100)

---

## Arquitectura de la app

La app Android (bittick) opera como cliente del servidor. Dos procesos independientes corren en paralelo:

```
BittickForegroundService (servicio en segundo plano)
  └── polling cada 60s → GET /api/trading/opportunities?since=
      └── filtra score>=6 && confidence>=6 → notificación + TTS

TradingViewModel (UI)
  └── loadAll() al iniciar → GET opportunities + positions + bot/status
  └── fetchNewOpportunities() cada 60s → nuevas oportunidades a la lista
  └── TradingScreen (Compose) muestra el estado
```

### `BittickForegroundService.kt` — Servicio en segundo plano

**Propósito:** Monitorear señales nuevas incluso cuando la app está minimizada. Ejecuta un polling cada 60 segundos al endpoint `GET /api/trading/opportunities?since=...` usando el timestamp de la última oportunidad vista (guardado en SharedPreferences via `BittickPreferences`).

**Qué pasa sin este servicio:** Si el usuario minimiza la app, no recibe notificaciones de nuevas señales hasta que vuelva a abrirla. Las oportunidades con score>=6 y confidence>=6 no se anunciarían, perdiendo oportunidades de entrada.

**Por qué polling y no WebSocket:** El servidor no tiene WebSocket. El polling cada 60s es suficiente para un sistema de señales donde las oportunidades duran horas.

**Flujo:**
1. Al arrancar, adquiere un `WakeLock` por 10 min para evitar suspensión
2. Cada 60s llama a `api.getTradingOpportunities(since = ultimoCreatedAt)`
3. Filtra `score >= 6 && confidence >= 6` (solo señales fuertes notifican)
4. Usa un `Set<Int>` (`announcedTradingIds`) para no notificar la misma señal dos veces
5. Notifica vía `NotificationHelper` con notificación + Text-to-Speech en español
6. Actualiza `trading_last_created_at` en SharedPreferences

**Código esencial:**
```kotlin
private val TRADING_POLL_INTERVAL = 60_000L

private fun startTradingPolling() {
    tradingPollingJob = scope.launch {
        while (isActive) {
            val response = api.getTradingOpportunities(since = prefs.getTradingLastCreatedAt())
            if (response.isSuccessful && response.body()?.exito == true) {
                val items = body.data.map { it.toItem() }
                for (item in items) {
                    if (item.id in announcedTradingIds) continue
                    if (item.score >= 6 && item.confidence >= 6) {
                        announcedTradingIds.add(item.id)
                        notifier.notifyTradingOpportunityByScore(...)
                        delay(3000)
                    }
                }
            }
            delay(TRADING_POLL_INTERVAL)
        }
    }
}
```

---

### `TradingViewModel.kt` — Estado y ciclo de vida

**Propósito:** Gestiona todo el estado de la pantalla de trading: carga inicial, polling de oportunidades, acciones del usuario (cancelar, eliminar), y errores.

**Por qué dos polls separados (ViewModel + Service):** El ViewModel actualiza la UI en tiempo real cuando la app está visible. El Service notifica en segundo plano cuando la app está minimizada. Cada uno tiene su propio filtro: el ViewModel muestra >=5, el Service notifica >=6.

**loadAll() — Carga inicial:**

Se ejecuta al crear el ViewModel. Carga 3 endpoints en paralelo dentro de una corrutina:

```kotlin
fun loadAll() {
    viewModelScope.launch {
        val oppResponse = api.getTradingOpportunities()
        val posResponse = api.getTradingPositions()
        val botStatusResponse = api.getTradingBotStatus()

        val opportunities = oppResponse.body()!!.data.map { it.toItem() }
            .filter { it.score >= 5 && it.confidence >= 5 }

        val spotPos = posResponse.body()!!.data.filter { it.bot_type == "spot" }
        val futuresPos = posResponse.body()!!.data.filter { it.bot_type == "futures" }

        _state.value = _state.value.copy(
            opportunities = opportunities,
            spotPositions = spotPos,
            futuresPositions = futuresPos,
            ...
        )
    }
}
```

**fetchNewOpportunities() — Polling de UI:**

Similar al servicio pero actualiza la lista en vez de notificar. Filtra >=5. Las nuevas oportunidades se insertan ordenadas por id descendente.

**Qué pasa sin loadAll() + fetchNewOpportunities():** La pantalla de trading estaría vacía. No se verían las señales ni las posiciones abiertas. El usuario no sabría si el bot tiene posiciones activas o si hay oportunidades disponibles.

**Estado (`TradingUiState`):**

| Campo | Tipo | Fuente |
|-------|------|--------|
| `opportunities` | `List<TradingOpportunityItem>` | `GET /api/trading/opportunities` filtrado >=5 |
| `spotPositions` | `List<BotPosition>` | `GET /api/trading/positions?status=open` filtrado bot_type=="spot" |
| `futuresPositions` | `List<BotPosition>` | Mismo endpoint, filtrado bot_type=="futures" |
| `spotBotStatus` | `BotStatusItem?` | `GET /api/trading/bot/status` → data.spot |
| `futuresBotStatus` | `BotStatusItem?` | Mismo endpoint → data.futures |
| `error` | `String?` | Mensaje de error en operaciones fallidas |

**Errores sin manejo de estado:** Sin el campo `error` y su display en la UI, los errores de red, cancelación fallida, o carga fallida pasarían desapercibidos. El usuario vería una pantalla congelada sin saber por qué.

---

### `TradingViewModel.kt:cancelPosition(positionId)`

**Propósito:** Envía petición de cancelación al servidor y refresca la UI.

**Por qué se mejoró:** Faltaba el `else` para `response.isSuccessful`. Cuando el servidor devolvía HTTP 500 (por el `cancelOrder` fallido), `response.isSuccessful` era `false` pero no se ejecutaba ningún código — no había error visible, no había refresco, nada. El usuario creía que el botón no funcionaba.

**Qué pasa sin esta mejora:** El botón "CANCELAR OPERACION" parece no funcionar. El usuario toca y no ve ningún cambio ni mensaje de error. El error solo se mostraba si ocurría una excepción de red (timeout, conexión perdida), no para errores HTTP.

**Código esencial:**
```kotlin
fun cancelPosition(positionId: Int) {
    viewModelScope.launch {
        try {
            val response = api.cancelTradingPosition(positionId)
            if (response.isSuccessful) {
                loadAll()   // refresca toda la UI
            } else {
                _state.value = _state.value.copy(error = "Error al cancelar operación")
            }
        } catch (e: Exception) {
            _state.value = _state.value.copy(error = e.message ?: "Error al cancelar")
        }
    }
}
```

**Ejemplo de error sin el fix:** Usuario tiene una posición spot abierta. Toca "CANCELAR OPERACION". El servidor recibe la petición, intenta `cancelOrder()` sobre la MARKET BUY ya llena, falla con error Binance, devuelve HTTP 500. La app ve `response.isSuccessful = false`, pero como no hay `else`, no hace nada. Sin error, sin refresco, sin feedback.

---

### `TradingScreen.kt` — UI final

**Propósito:** Pantalla principal de trading. Muestra bots (SPOT + FUTUROS) y oportunidades detectadas.

**Layout final:**

```
┌─────────────────────────────┐
│  BOT SPOT BTC        ACTIVO │
│  Balance: $100 ($90 disp.)  │
│  Posiciones: 1/5  PnL: +$5 │
│  ┌───────────────────────┐  │
│  │ LONG BTCUSDT    +$5.20│  │
│  │ Entrada: $60,000      │  │
│  │ Actual: $61,000       │  │
│  │ Objetivo: $65,000     │  │
│  │ [CANCELAR OPERACION]  │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│  BOT FUTUROS BTC     ACTIVO │
│  ...                        │
├─────────────────────────────┤
│  ⚠ Error al conectar       │  ← solo si error != null
├─────────────────────────────┤
│  Oportunidades detectadas   │              │
│  ┌─ LONG BTC $61,200 ─────┐ │
│  │ Puntaje: 7/10 Conf: 8  │ │
│  │ Entrada: $60k-$61k     │ │
│  │ ...                    │ │
│  └────────────────────────┘ │
└─────────────────────────────┘
```

**Qué se eliminó:** El chart con velas, zonas, selector de intervalos y precio actual. Solo quedan bots y oportunidades.

**Por qué se eliminó el chart:** La app se enfoca en ser un visor de señales y gestor de posiciones, no un charting tool. Las zonas y velas se pueden consultar en plataformas especializadas (TradingView). La app solo necesita mostrar qué hacer y cuándo.

---

### `ApiService.kt` — Endpoints usados para spot

| Método | Endpoint | Uso en spot |
|--------|----------|-------------|
| `GET` | `api/trading/positions?status=open` | Lista posiciones abiertas (filtro `bot_type=="spot"` en ViewModel) |
| `POST` | `api/trading/positions/{id}/cancel` | Cancelar posición spot |
| `GET` | `api/trading/bot/status` | Estado del bot spot (balance, PnL, posiciones) |
| `GET` | `api/trading/opportunities` | Señales detectadas (filtradas >=5 en UI, >=6 en notificaciones) |
| `DELETE` | `api/trading/opportunities/{id}` | Eliminar oportunidad manualmente |

**Qué pasa si un endpoint falla:** Cada llamada en `loadAll()` maneja su error individualmente. Si `getTradingPositions()` falla pero `getTradingOpportunities()` funciona, las oportunidades se muestran pero las posiciones no — el ViewModel setea `error` y el usuario ve el mensaje en la tarjeta roja.

---

### `Models.kt` — Modelos de datos para spot

| Modelo | Campos clave para spot |
|--------|------------------------|
| `BotPosition` | `bot_type` ("spot"), `strategy_type` ("long"), `entry_price`, `quantity`, `usd_amount`, `pnl` |
| `BotStatusItem` | `enabled`, `balance.total/available`, `openPositions`, `totalPnl` |
| `TradingOpportunity` | `score`, `confidence`, `strategy_type`, `entry_zone`, `target` |
| `CancelPositionResponse` | `exito`, `message` |

**Por qué `BotPosition` tiene `usd_amount`:** Permite a la app mostrar cuánto capital se usó en cada posición sin tener que consultar el budget del servidor. Es el valor real de la orden ejecutada.

---

## Relación con otros archivos y skills

### Archivos directos del sistema spot

| Archivo | Rol en el sistema spot |
|---------|------------------------|
| `src/trading/botManager.js` | Núcleo: evalúa señales, ejecuta órdenes, monitorea, cancela |
| `src/trading/executionEngine.js` | Ejecuta órdenes MARKET y cancelaciones en Binance |
| `src/trading/binanceClient.js` | Cliente HTTP para API REST de Binance (testnet) |
| `src/trading/tradingStore.js` | Persistencia SQLite (oportunidades, posiciones, config) |
| `src/trading/tradingManager.js` | Orquestador: llama estrategias, IA, y botManager |
| `src/trading/tradingScheduler.js` | Cron: ejecuta scanMarket() cada 60s, monitor cada 60s |
| `src/trading/tradingRouter.js` | API REST: expone posiciones, cancelar, status al cliente |
| `.env` | Config: `BOT_SPOT_BUDGET=100`, claves API Binance testnet |

### Skills de arquitectura relacionados (`.opencode/skills/`)

| Skill | Relación con sistema spot |
|-------|--------------------------|
| `01_arquitectura` | Define la arquitectura client-server que este sistema utiliza |
| `02_motor_ejecucion` | El motor que ejecuta las órdenes spot (executionEngine) |
| `03_binance_api` | La API de Binance que este sistema llama para comprar/vender |
| `04_ai_trading` | El AI Analyzer que genera el `confidence` usado en los niveles |
| `05_chart_api` | Las zonas del chart que alimentan las estrategias que generan señales |
| `00_indice` | Índice general de todos los skills |

### Flujo de coordinación entre skills

```
05_chart_api (zonas)
  → estrategias (renkoAccumulation, spotFib, etc.)
      → 04_ai_trading (confidence)
          → SISTEMA SPOT (botManager.evaluateAndExecute)
              → 02_motor_ejecucion (executionEngine.executeOrder)
                  → 03_binance_api (placeOrder MARKET BUY)
                      → SQLite (tradingStore.insertPosition)
```

Este sistema spot es el **consumidor final** de la cadena: todo el pipeline (zonas → estrategias → IA) converge aquí para decidir si se ejecuta o no una orden.
