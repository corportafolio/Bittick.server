# Bittick Ordinals Gating - Documentación para Hermes

## Resumen
Sistema de gating de funcionalidades premium mediante propiedad de inscripciones Ordinals de la colección **"Bittick Agent"** (100 bots, Bot #00–#99).

---

## Ubicación de Recursos en el Servidor

### Imágenes de los Bots
- **Directorio origen**: `/home/candela/bittick-server/Bittick-agent-imagenes/` (100 archivos PNG 200×200)
- **Directorio servido**: `/home/candela/bittick-server/public/bots/`
- **Nomenclatura**: `bot_00.png` ... `bot_99.png`
- **Endpoint público**: `GET /api/auth/bot-image/:num` (num = 0-99)

### IDs de la Colección (Documento 04)
- **Archivo**: `/home/candela/bittick-server/docs/04_IDs-coleccion-Bittick-Agent.md`
- **Contenido**: 100 inscripciones con `ID` (inscription_id completo con sufijo `i0`), `tx genesis`, `altura genesis`
- **Parseado en código**: `src/auth/bittickCollection.js`

---

## Arquitectura del Sistema

### Flujo de Verificación
```
1. App Android → GET /api/auth/nonce?address=bc1p...
2. App → unisat://request?method=signMessage&data=...&nonce=...&callback=unisat://response&from=bittick
3. UniSat → Firma "Conectar a Bittick" → Callback unisat://response
4. App → POST /api/auth/verify-wallet {address, signature, nonce}
5. Server → Verifica firma ECDSA + nonce
6. Server → GET https://api.ordiscan.io/v1/address/{address}/inscription-ids
7. Server → Busca match con INSCRIPTION_ID_SET (100 IDs de la colección)
8. Si match → INSERT/REPLACE verified_owners {address, bot_num, inscription_id}
9. Server → Response {verified: true, botNum, botImageUrl: /api/auth/bot-image/{num}}
10. App → Descarga imagen → Cache local → Muestra como avatar
```

### Endpoints Nuevos (authRouter.js)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/auth/nonce` | GET | Genera nonce único para sesión de firma |
| `/api/auth/verify-wallet` | POST | Verifica firma + ownership de bot via Ordiscan |
| `/api/auth/bot-image/:num` | GET | Sirve imagen PNG del bot (cache 24h) |
| `/api/auth/verify-status` | GET | Consulta estado de verificación de una address |

---

## Gating de Funcionalidades Premium

### Endpoints Protegidos (requieren `x-wallet-address` header + verified_owners)

**Trading API** (`/api/trading/*`):
- `GET /opportunities` → Filtra score < 7 si no verificado
- `GET /opportunities/:id` → 403 si score ≥ 7 y no verificado
- `GET /positions` → Requiere verificación
- `POST /positions/:id/cancel` → Requiere verificación
- `DELETE /positions/:id` → Requiere verificación
- `GET /bot/status` → Requiere verificación
- `GET/POST /bot/config` → Requiere verificación

**Chart API** (`/api/chart/*`):
- `GET /klines` → **Protegido** (gráficos completos)
- `GET /avizor-zones` → **Protegido** (zonas Avizor)
- `POST /avizor-zones/reload` → **Protegido**
- `GET /ticker` → **Público** (precio actual)
- `GET /zones` → **Público** (Renko zones básicos)

---

## Base de Datos

### Tabla `verified_owners`
```sql
CREATE TABLE verified_owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL UNIQUE,      -- bc1p... (lowercase)
  bot_num INTEGER NOT NULL,          -- 0-99
  inscription_id TEXT NOT NULL,      -- inscription ID completo
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT                    -- opcional, para re-verificación periódica
);
```

### Métodos en tradingStore.js
- `setVerifiedOwner(address, botNum, inscriptionId)` - INSERT OR REPLACE
- `getVerifiedOwner(address)` - SELECT por address
- `isVerifiedOwner(address)` - boolean

---

## Android - Integración Requerida

### Archivos Nuevos (`com.bittick.wallet`)
| Archivo | Responsabilidad |
|---------|-----------------|
| `DeepLinkBuilder.kt` | Construye URIs `unisat://request` (signMessage, getAddresses) |
| `WalletDeepLinkHandler.kt` | Verifica UniSat instalada, abre deep link, fallback Play Store |
| `UnisatWalletCallbackActivity.kt` | Recibe `unisat://response`, valida nonce, emite evento |
| `WalletViewModel.kt` | Orquesta flujo: nonce → signMessage → callback → getAddresses → callback → verify-wallet |
| `WalletScreen.kt` | UI: botón "Conectar UniSat", estado loading/error, muestra bot conectado + imagen |

### Modificaciones Android Existentes
- `AndroidManifest.xml` → `<queries>` para UniSat + `UnisatWalletCallbackActivity` con intent-filter `unisat://response`
- `BittickPreferences.kt` → prefs wallet (address, botNum, inscriptionId, verified)
- `MainActivity.kt` → ruta NavHost "wallet"
- `TradingScreen.kt` → Menu hamburguesa item "Wallet"
- `SettingsScreen.kt` → Sección "Wallet Bitcoin" con avatar del bot
- `ApiService.kt` → endpoints auth + header `X-Wallet-Address` en requests gateados

---

## Verificación de Firma (Server)

El mensaje a firmar es fijo: `"Conectar a Bittick"`

Algoritmo: ECDSA secp256k1 (Bitcoin)
- App envía `signature` en Base64 (65 bytes: r(32) + s(32) + recovery(1))
- Server recupera public key con `secp256k1.ecdsaRecover`
- Deriva address y compara con `address` enviado

---

## Rate Limits & Consideraciones

- **Ordiscan API**: 1,000 req/mes gratis (1 req por verificación)
- **Nonce TTL**: 5 minutos (memoria, `NONCE_STORE` Map)
- **Re-verificación**: Sugerido semanal o al abrir app (implementar `expires_at` en DB)
- **Imágenes**: Servidas estáticamente con `Cache-Control: public, max-age=86400`

---

## Archivos Clave Modificados/Creados en Server

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `src/auth/bittickCollection.js` | NEW | Dataset estático 100 bots + helpers |
| `src/auth/authRouter.js` | NEW | Endpoints auth + verificación Ordiscan |
| `src/trading/tradingStore.js` | MOD | Tabla `verified_owners` + métodos |
| `src/trading/tradingRouter.js` | MOD | Middleware `requireVerifiedWallet` + filtro opportunities |
| `src/chart/chartRouter.js` | MOD | Middleware `requireVerifiedWallet` en klines/avizor-zones |
| `index.js` | MOD | Registra `app.use('/api/auth', authRouter)` |
| `public/bots/bot_00.png`...`bot_99.png` | NEW | 100 imágenes PNG servidas estáticamente |

---

## Testing Rápido

```bash
# 1. Generar nonce
curl "http://localhost:4001/api/auth/nonce?address=bc1pTESTADDRESS"

# 2. Verificar wallet (requiere firma real de UniSat)
curl -X POST http://localhost:4001/api/auth/verify-wallet \
  -H "Content-Type: application/json" \
  -d '{"address":"bc1p...","signature":"BASE64_SIG","nonce":"NONCE_FROM_STEP_1"}'

# 3. Obtener imagen del bot
curl http://localhost:4001/api/auth/bot-image/42

# 4. Consultar oportunidades (con wallet verificada)
curl -H "X-Wallet-Address: bc1p..." http://localhost:4001/api/trading/opportunities

# 5. Consultar klines (requiere verificación)
curl -H "X-Wallet-Address: bc1p..." http://localhost:4001/api/chart/klines?interval=1h
```