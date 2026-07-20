# Estrategia Combinada con Trading Avizor

> **Documento dos bloques:**
> - **Parte I** (secciones 1-11): Metodología Trading Avizor — análisis de 295 videos (2024-07-01 a 2026-07-06)
> - **Parte II** (secciones 12+): Estrategia propia de Bittick — ejecución automatizada de posiciones
> 
> Última actualización: 2026-07-20
> 
> Documento complementario: [Zonas de Trading Avizor](zonas-trading-avizor.md)

---

## 1. Filosofía Central

El mercado está compuesto por **participantes institucionales** (ballenas, exchanges, market makers) y **retail** (minoristas). Los institucionales mueven el precio usando **liquidez global** como combustible. El retail es la **liquidez de salida** de los institucionales.

**Premisa clave:** Si aprendes a medir la liquidez global y detectar dónde están las órdenes institucionales, puedes operar con ellos en lugar de ser su liquidez de salida.

La estrategia NO es smart money, NO es imbalances, NO es order flow tradicional. Es un método propio del Avizor basado en **medición de liquidez a través de datos on-chain y de mercado**.

---

## 2. Medición de Liquidez: Los Presupuestos / Deudas

El Avizor mide la **liquidez global** (no solo M2) asignando un **presupuesto** a cada periodo de tiempo. Cuando el presupuesto de un periodo se agota, aparece una **deuda** — un nivel de precio donde el mercado "debe" ir para rebalancear esa liquidez.

### Timeframes de Presupuestos

| Timeframe | Cambio | Deuda asociada | Impacto |
|-----------|--------|----------------|---------|
| **Anual** | 1 de enero | Deuda anual | Nivel macro más importante. El mercado tiende a visitarla al menos 1 vez al año |
| **Mensual** | 1 de cada mes | Deuda mensual | Marca el rango del mes. Suele visitarse durante el mes |
| **Semanal** | Lunes | Deuda semanal | Define el movimiento de la semana |
| **Diario** | Cada día | Deuda diaria | Niveles intradía |

### Cómo se generan

1. Al cerrar un periodo (ej. fin de mes), se calcula el **presupuesto del siguiente periodo**
2. El presupuesto se calcula usando datos de:
   - **Open Interest agregado** (futuros + spot)
   - **Deltas de compra/venta** (Coin Alice metrics)
   - **Liquidaciones acumuladas**
   - **Flujo de liquidez global on-chain**
3. La **deuda** es el nivel de precio donde el presupuesto se desequilibra
4. Cuando el precio alcanza la deuda, se "paga" — el mercado reacciona

### Lectura de Deudas

- **Deuda alcista** (soporte): Si el precio está arriba y va a buscar la deuda abajo → esperar rebote
- **Deuda bajista** (resistencia): Si el precio está abajo y va a buscar la deuda arriba → esperar rechazo
- **Deuda pagada**: Cuando el precio ya tocó ese nivel, la deuda ya no tiene efecto
- **Deuda pendiente**: Aún no visitada, el mercado probablemente irá a buscarla

---

## 3. EL CONCEPTO CLAVE: Zonas como Imanes

> **IMPORTANTE**: Las zonas NO son solo obstáculos — son **IMANES**.

El mercado se mueve entre zonas. Cada zona tiene un **ancho** (startPrice - endPrice). El precio es atraído por la **siguiente zona** en su dirección de viaje, como un imán.

### Anatomía de una Zona

```
                    ← dirección del precio (ej: subiendo)
                    
  [MAGNET ZONE]     ← próxima deuda (el imán que atrae al precio)
  ┌────────────────┐
  │   Zona B       │  ← rango de la zona (ej: $55,000 - $57,000)
  └────────────────┘
         ↑
    "back" de la zona A
    (parte de atrás)
         
  ┌────────────────┐
  │   Zona A       │  ← zona actual que el precio debe romper (obstáculo)
  └────────────────┘
         ↑
    precio acercándose desde abajo
```

### El Mecanismo del Imán

1. **Precio se mueve en una dirección** (ej: hacia arriba)
2. **La siguiente zona** (próxima deuda) actúa como IMÁN — atrae al precio
3. **Entre el precio y el imán** hay una zona "obstáculo" (la zona que el precio está alcanzando ahora)
4. Para que el precio **continue hacia el imán**, debe ROMPER LA PARTE DE ATRÁS del obstáculo:
   - Si sube: romper `obstáculo.endPrice + buffer` (~0.8-1% extra)
   - Si baja: romper `obstáculo.startPrice - buffer`
5. **Break RÁPIDO y con VOLUMEN** = señal fuerte de continuación hacia el imán
6. **Break lento o fallido** = el precio se mantiene en rango o revierte

### Ejemplo concreto

```
Zona A (obstáculo): $50,000 - $52,000
Zona B (imán):     $55,000 - $57,000
Precio actual:      $49,500 (subiendo)

El precio es atraído por la Zona B ($55k-$57k).
Pero primero debe romper la Zona A.
La "back" de la Zona A = $52,000 + buffer ≈ $52,400 - $52,500

Si el precio rompe $52,500 RÁPIDO → señal de continuación hacia $55k+
Si el precio llega a $52,000 pero no rompe → se mantiene en rango o revierte
```

---

## 4. Cómo se Dibujan las Zonas en el Chart

Cada zona tiene:

| Propiedad | Descripción |
|-----------|-------------|
| `startPrice` | Precio inferior de la zona |
| `endPrice` | Precio superior de la zona |
| `midPrice` | Precio medio de la zona |
| `strength` | Fuerza de la zona (1-10) |
| `zoneType` | `"buy"` si está debajo del precio, `"sell"` si está arriba |
| `label` | `"Zona Compra"` o `"Zona Venta"` |

### Colores en el Chart
- **ZONAS VERDES** (Zonas de Compra / Demanda Institucional): Áreas donde hay órdenes de compra. Están por debajo del precio actual.
- **ZONAS ROJAS** (Zonas de Venta / Oferta Institucional): Áreas donde hay órdenes de venta. Están por encima del precio actual.

### Tipos de Zonas

| Tipo | Origen | Fuerza típica |
|------|--------|---------------|
| `resistencia` | Swings máximos agrupados | 4-8 |
| `soporte` | Swings mínimos agrupados | 4-8 |
| `volumen` | Velas con alto volumen | 5-6 |
| `dinamico` | EMAs (50/200) | 6-8 |

---

## 5. Velas Renko

Las velas Renko son **transaccionales** (se crean por movimiento de precio, no por tiempo). Su uso en la estrategia:

1. **Filtran ruido**: Al ignorar el tiempo, solo muestran movimientos significativos
2. **Identifican tendencia**: Secuencia de velas del mismo color = tendencia fuerte
3. **Definen acumulación**: Rango lateral en Renko = zona de acumulación/distribución

### Configuración Recomendada

- **Tamaño de ladrillo**: Variable según el timeframe que se analice
  - Escalpe: 0.1% del precio
  - Diario: 0.5% del precio
  - Semanal: 1-2% del precio
- **Tipo**: Renko clásico (basado en cierre)
- **Alineación**: Usar Renko junto con velas tradicionales para confirmación

### Señales con Renko

- **Cambio de color** en la "back" de una zona → confirmación de break
- **Secuencia de 3+ velas del mismo color** después del break → tendencia confirmada hacia el imán
- **Rango lateral en Renko dentro de una zona** → acumulación/distribución

---

## 6. Sistema de Scoring

Cada señal tiene dos componentes:

### Score (0-10)

| Score | Significado | Acción |
|-------|-------------|--------|
| 0-5 | Señal débil o inválida | No operar |
| 6 | Cuestionable | Esperar confirmación |
| 7 | Aceptable | Entrada parcial |
| 8 | Buena señal — zona rota rápido | Entrada completa |
| 9 | Mejor señal — break + volumen + imán cerca | Entrada agresiva |
| 10 | Mejor señal posible | Entrada máxima |

### Factores del Score

| Factor | Peso |
|--------|------|
| Break de la "parte de atrás" de la zona | +4 si es rápido, +2 si solo break |
| Cercanía a la zona (efecto imán) | +3 si <0.5%, +2 si <2%, +1 si <5% |
| Fuerza de la zona | +2 si strength >=7, +1 si >=4 |
| Volumen alto en el break | +2 |
| Movimiento rápido (vela grande) | +2 si hay break, +1 si no |
| Zona imán alcanzable | +1 |

### Confianza (0-10)

- Break rápido + volumen: +2
- Break rápido: +1
- Zona obstáculo fuerte (>=6): +1
- Zona imán fuerte (>=6): +1

---

## 7. Reglas de Entrada — El Método Completo

### Setup

1. **Identificar las zonas** actuales en el chart (verdes = compra, rojas = venta)
2. **Determinar la dirección actual** del precio (últimas 5 velas)
3. **Encontrar el obstáculo** = la zona más cercana en la dirección de viaje
4. **Encontrar el imán** = la siguiente zona más allá del obstáculo
5. **Calcular la "back"** del obstáculo = el lado opuesto + buffer
6. **Monitorear** si el precio rompe la back RÁPIDO

### Señal de COMPRA (Long)

```
1. Precio subiendo (dirección alcista)
2. Obstáculo: zona roja más cercana arriba del precio (ej: $50,000 - $52,000)
3. Imán: siguiente zona roja más arriba (ej: $55,000 - $57,000)
4. Back a romper: $52,000 + 0.8*ATR ≈ $52,400
5. Entrar si:
   - Precio rompe $52,400 RÁPIDO (vela grande)
   - Preferiblemente con volumen alto
   - Score >= 7
```

### Señal de VENTA (Short)

```
1. Precio bajando (dirección bajista)
2. Obstáculo: zona verde más cercana abajo del precio (ej: $48,000 - $46,000)
3. Imán: siguiente zona verde más abajo (ej: $44,000 - $42,000)
4. Back a romper: $46,000 - 0.8*ATR ≈ $45,600
5. Entrar si:
   - Precio rompe $45,600 RÁPIDO (vela grande)
   - Preferiblemente con volumen alto
   - Score >= 7
```

### Target (Take Profit)

- **Target primario**: La zona IMÁN (midPrice)
- **Target secundario**: Si el break es muy fuerte (score >= 9), dejar correr

### Stop Loss

- **SL**: Al otro lado de la zona obstáculo (startPrice - 1.5*ATR para longs, endPrice + 1.5*ATR para shorts)
- **Mover a breakeven**: Cuando el precio confirma 1-2 velas en dirección correcta

---

## 8. Gestión de Riesgo

- **Por operación**: No arriesgar más del 1-2% de la cuenta
- **Por día**: Máximo 2-3 operaciones simultáneas
- **Ratio riesgo/recompensa**: Mínimo 1:2, ideal 1:3+
- **Apalancamiento**: Solo usar cuando Score >= 8 y Confianza >= 70%

### Interpretar el Ciclo

El Avizor enfatiza saber en qué **fase del ciclo** estás:

| Fase | Característica | Estrategia |
|------|----------------|------------|
| **Acumulación** | Precio lateral entre zonas | Comprar en zonas verdes cuando no rompe la back |
| **Markup (subida)** | Rompe backs rápido hacia arriba | Entrar longs, mantener hasta próximo imán |
| **Distribución** | Zonas verdes se rompen lento | Vender en zonas rojas |
| **Markdown (bajada)** | Rompe backs rápido hacia abajo | Entrar shorts, mantener hasta próximo imán |

---

## 9. Implementación Técnica

### API Endpoints

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/chart/klines` | Datos OHLCV |
| `GET /api/chart/ticker` | Precio actual BTC |
| `GET /api/chart/zones` | Zonas de compra/venta calculadas |

### Estructura de Zones Response

```json
{
  "exito": true,
  "data": {
    "zones": [
      {
        "startPrice": 50000.0,
        "endPrice": 52000.0,
        "midPrice": 51000.0,
        "strength": 6,
        "zoneType": "sell",
        "type": "resistencia",
        "label": "Zona Venta"
      }
    ],
    "atr": 250.5
  }
}
```

### Chart HTML

El chart dibuja:
- **Velas** (serie de candlestick)
- **Zonas verdes** (rectángulos semitransparentes) = zonas de compra
- **Zonas rojas** (rectángulos semitransparentes) = zonas de venta
- **Línea discontinua** en el medio de cada zona con etiqueta

---

## 10. Glosario — Parte I (Trading Avizor)

> El glosario completo (incluyendo términos de la estrategia Bittick) está en la **sección 20** al final del documento.

| Término | Significado |
|---------|-------------|
| Deuda | Nivel de precio donde se desequilibra el presupuesto de liquidez |
| Presupuesto | Asignación de liquidez para un periodo (semana/mes/año) |
| Zona | Rango de precio (start-end) donde hay acumulación de órdenes |
| Obstáculo | Zona más cercana en la dirección del precio que debe romperse |
| Imán | Siguiente zona más allá del obstáculo que atrae al precio |
| Back (parte de atrás) | Lado opuesto de la zona en la dirección de viaje + buffer |
| Break rápido | Vela grande que rompe la back de golpe |
| Liquidez de salida | Retail comprando en tops, vendiendo en bottoms |
| Zona de compra | Área de demanda institucional (verde en chart) |
| Zona de venta | Área de oferta institucional (rojo en chart) |
| Delta de compra | Diferencia entre órdenes de compra y venta en un periodo |
| Renko | Gráfico de velas basado en movimiento de precio, no en tiempo |
| ATR | Average True Range — medida de volatilidad |
| Pardillo | Retail que pierde dinero por no entender el mercado |
| Ballena | Participante institucional con gran capital |
| Ciclo | Fases del mercado (acumulación → markup → distribución → markdown) |

---

## 11. Limitaciones y Advertencias

1. La estrategia requiere datos de **Coin Alice** (o similar) para deltas — sin eso, las zonas se calculan solo con price action y volumen
2. Las zonas NO son infalibles — a veces el mercado las ignora (especialmente con noticias macro)
3. Los presupuestos se recalculan cada periodo — las zonas cambian
4. El Avizor enfatiza que **no es un sistema mecánico** — necesita interpretación humana
5. Siempre priorizar la **gestión de riesgo** sobre la señal
6. El tamaño de zona debe ajustarse a la volatilidad del mercado
7. Cuando no hay un imán claro (siguiente zona lejana), la señal es más débil

---

---

# PARTE II — ESTRATEGIA PROPIA DE BITTICK

> **De aquí en adelante se documenta la estrategia de ejecución automática desarrollada por Bittick.**
> Esta estrategia usa como base la metodología Trading Avizor (Parte I) pero la complementa con reglas mecánicas de gestión de posiciones, sizing de órdenes y filtros de calidad que el Avizor no define de forma automatizada.

---

## 12. Filosofía de la Estrategia Bittick

Bittick toma del Avizor los conceptos de **zonas**, **imanes** y **scoring** (Parte I), y los convierte en señales ejecutables automáticamente. Donde el Avizor depende de interpretación humana, Bittick define reglas mecánicas:

| Componente | Avizor | Bittick |
|------------|--------|---------|
| Zonas e imanes | Manual, en chart | Automático, vía API |
| Scoring | Interpretativo (0-10) | Mecánico, con filtros |
| Entry/exit | Decisión del trader | Ejecución automática por bot |
| Position sizing | "No arriesgar más del 1-2%" | Sizing por nivel de score (ver sección 13) |
| Gestión de posiciones | Manual | Automática (TP/SL) + manual (botón cerrar) |
| Balance | No aplica (cuenta real) | Virtual: Presupuesto Inicial + PNL Realizado |

La estrategia propia de Bittick se ejecuta en **bots SPOT y FUTUROS**, cada uno con configuración independiente.

---

## 13. Position Sizing por Score

El monto de cada apuesta se calcula según el **nivel**, que es el mínimo entre score y confidence. Se usa una distribución tipo campana: más apuesta en los niveles medios-altos (8), menos en los extremos (6 y 10).

### Tabla de Sizing (presupuesto base: $100)

| Nivel (min(score,confidence)) | % del presupuesto | Apalancamiento | Monto con $100 |
|------|------|------|------|
| 10 | 10% | 3x | $10 |
| 9 | 20% | 3x | $20 |
| **8** | **40%** | **3x** | **$40** |
| 7 | 20% | 2x | $20 |
| 6 | 10% | 1x | $10 |
| <6 | No ejecuta | - | - |

### Ejemplo práctico

```
Señal: score=8, confidence=7
Nivel = min(8,7) = 7
Tier: 20%, leverage 2x
Monto: $100 × 20% = $20
Posición: $20 apalancada 2x = $40 exposición
```

### Configuración por bot

Cada bot (SPOT/FUTUROS) tiene su propio `max_positions` (default 5) y `min_confidence` (default 6). Si la confianza de la señal es menor que el mínimo configurado, el bot no ejecuta.

---

## 14. Semáforo de Calidad

Cada oportunidad que se muestra en la pantalla lleva un **indicador de color** (círculo al lado del nombre del activo) que clasifica la calidad de la señal:

| Color | Condición | Significado |
|-------|-----------|-------------|
| **Verde** | min(score, confidence) >= 8 | Señal fuerte — alta probabilidad |
| **Amarillo** | min(score, confidence) >= 7 **O** score == confidence | Señal aceptable —balanceada |
| **Rojo** | Todo lo demás | Señal débil — un factor arrastra la otra |

### Ejemplos

| Score | Confidence | Nivel | Color | Razón |
|-------|-----------|-------|-------|-------|
| 8 | 8 | 8 | **Verde** | Ambos >= 8 |
| 8 | 7 | 7 | **Amarillo** | min >= 7 |
| 7 | 7 | 7 | **Amarillo** | Son iguales (y min >= 7) |
| 6 | 6 | 6 | **Amarillo** | Son iguales |
| 9 | 10 | 9 | **Verde** | min >= 8 |
| 8 | 6 | 6 | **Rojo** | min < 7 y no son iguales |
| 5 | 4 | 4 | **Rojo** | min < 7 y no son iguales |

> **Nota:** Solo se muestran en pantalla oportunidades con score >= 5. Las de 4 o menos son descartadas automáticamente.

---

## 15. Filtros de Ejecución

Antes de ejecutar una posición, el bot aplica estos filtros en orden:

### 15.1 Filtro de nivel mínimo
Si `min(score, confidence)` < 6 → no ejecuta. La señal es demasiado débil.

### 15.2 Filtro de confianza mínima
Si `confidence` < `min_confidence` del bot (default 6) → no ejecuta. Cada bot tiene su propio umbral configurable.

### 15.3 Filtro de posiciones máximas
Si el bot ya tiene `max_positions` posiciones abiertas (default 5) → no ejecuta más.

### 15.4 Filtro de deduplicación
Si ya existe una posición abierta en el **mismo activo + mismo tipo de estrategia** (ej: BTCUSDT + long) → no abre otra. Evita exposición excesiva en un solo activo.

### 15.5 Filtro de tipo de estrategia por bot
- **Bot SPOT**: Solo ejecuta `long` (compra)
- **Bot FUTUROS**: Ejecuta `long` y `short`

---

## 16. Gestión de Balance

El balance que se muestra en la pantalla **no es el balance real de Binance**, es un balance virtual calculado por el servidor:

### Fórmula

```
Balance = Presupuesto Inicial + PNL Realizado
Disponible = Balance - USDT usado en posiciones abiertas
```

### Ejemplo numérico

```
Presupuesto inicial: $100
5 posiciones abiertas: -$100 (todo el presupuesto en uso)
Disponible: $0

--- Las 5 posiciones cierran con +$4.19 de ganancia ---

PNL Realizado: +$4.19
Balance: $100 + $4.19 = $104.19
Disponible: $104.19 (sin posiciones abiertas)

--- Se abre 1 nueva posición de $20 ---

Balance: $104.19
Disponible: $104.19 - $20 = $84.19
```

### Si hay pérdidas

```
PNL Realizado: -$5.00
Balance: $100 - $5.00 = $95.00
Disponible: $95.00
```

El balance **suma si ganás y resta si perdés** — refleja el rendimiento acumulado de todas las posiciones cerradas.

---

## 17. Bot SPOT vs FUTUROS

| Característica | Bot SPOT | Bot FUTUROS |
|----------------|----------|-------------|
| Tipo de orden | Compra/Venta de BTC real | Contratos de futuro |
| Estrategias | Solo LONG | LONG y SHORT |
| Apalancamiento | 1x (sin apalancamiento) | 2x-3x según nivel |
| Configuración independiente | Sí (`bot_config` type=spot) | Sí (`bot_config` type=futures) |
| Max posiciones | Configurable (default 5) | Configurable (default 5) |
| Min confidence | Configurable (default 6) | Configurable (default 6) |

Cada bot tiene su propio presupuesto (`BOT_SPOT_BUDGET` / `BOT_FUTURES_BUDGET`) y se configura independientemente.

---

## 18. Cierre de Posiciones

Las posiciones se pueden cerrar de tres formas:

### 18.1 Take Profit automático
Cuando el precio alcanza el `target` calculado por el scoring, el bot cierra la posición y registra la ganancia.

### 18.2 Stop Loss automático
Cuando el precio toca el `stop_loss`, el bot cierra la posición para limitar pérdidas.

### 18.3 Cierre manual
El usuario puede cerrar cualquier posición desde la app presionando el botón **"CERRAR POSICION"** en la PositionCard. Se muestra un diálogo de confirmación antes de ejecutar.

### Registro del cierre
Cada cierre guarda en la DB:
- `status`: `"closed"` o `"cancelled"`
- `pnl`: Ganancia/pérdida en USDT
- `pnl_percent`: Porcentaje de retorno
- `close_reason`: `"take_profit"`, `"stop_loss"`, o `"manual"`
- `closed_at`: Timestamp del cierre

---

## 19. Endpoints de la API de Trading

| Endpoint | Método | Descripción | Autenticación |
|----------|--------|-------------|---------------|
| `/api/trading/opportunities` | GET | Oportunidades de trading (premium: todas, free: filtradas) | `x-wallet-address` |
| `/api/trading/positions` | GET | Posiciones abiertas del usuario | `x-wallet-address` |
| `/api/trading/bot/status` | GET | Estado de bots SPOT/FUTUROS + balance | `x-wallet-address` |
| `/api/trading/strategies` | GET/POST | Configurar estrategia por bot (CRUD) | `x-wallet-address` |
| `/api/trading/cancel-position` | POST | Cerrar posición manual | `x-wallet-address` |

### Respuesta de /bot/status

```json
{
  "exito": true,
  "data": {
    "spot": {
      "enabled": true,
      "openPositions": 2,
      "maxPositions": 5,
      "totalPnl": 4.19,
      "balance": {
        "total": 104.19,
        "available": 64.19
      }
    },
    "futures": {
      "enabled": false,
      "openPositions": 0,
      "maxPositions": 5,
      "totalPnl": 0,
      "balance": {
        "total": 100.00,
        "available": 100.00
      }
    }
  }
}
```

---

## 20. Glosario (Actualizado)

| Término | Significado |
|---------|-------------|
| Deuda | Nivel de precio donde se desequilibra el presupuesto de liquidez (Avizor) |
| Presupuesto | Asignación de liquidez para un periodo (Avizor) |
| Zona | Rango de precio (start-end) donde hay acumulación de órdenes (Avizor) |
| Obstáculo | Zona más cercana en la dirección del precio que debe romperse (Avizor) |
| Imán | Siguiente zona más allá del obstáculo que atrae al precio (Avizor) |
| Back (parte de atrás) | Lado opuesto de la zona en la dirección de viaje + buffer (Avizor) |
| Break rápido | Vela grande que rompe la back de golpe (Avizor) |
| Liquidez de salida | Retail comprando en tops, vendiendo en bottoms (Avizor) |
| Zona de compra | Área de demanda institucional (verde en chart) (Avizor) |
| Zona de venta | Área de oferta institucional (rojo en chart) (Avizor) |
| Delta de compra | Diferencia entre órdenes de compra y venta en un periodo (Avizor) |
| Renko | Gráfico de velas basado en movimiento de precio, no en tiempo (Avizor) |
| ATR | Average True Range — medida de volatilidad (Avizor) |
| Pardillo | Retail que pierde dinero por no entender el mercado (Avizor) |
| Ballena | Participante institucional con gran capital (Avizor) |
| Ciclo | Fases del mercado (acumulación → markup → distribución → markdown) (Avizor) |
| **Position Sizing** | **Cálculo del monto a apostar según el nivel de score (Bittick)** |
| **Nivel** | **Mínimo entre score y confidence — determina el tier de sizing (Bittick)** |
| **Semáforo de Calidad** | **Indicador visual (verde/amarillo/rojo) de la calidad de una señal (Bittick)** |
| **Dedup** | **Filtro que evita abrir segunda posición en mismo activo+estrategia (Bittick)** |
| **PNL Realizado** | **Suma de ganancias/pérdidas de posiciones cerradas (Bittick)** |
| **Balance** | **Presupuesto Inicial + PNL Realizado (Bittick)** |
| **Close Reason** | **Razón del cierre: take_profit, stop_loss o manual (Bittick)** |
| **min_confidence** | **Confianza mínima requerida para ejecutar (default 6) (Bittick)** |

---

> **Parte I:** Documento generado a partir del análisis de 295 videos del canal Trading Avizor.
> **Parte II:** Documento generado a partir de la implementación técnica de Bittick.
