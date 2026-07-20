# Cómo traer imágenes y detectar inscripciones de Bittick Agents desde ordinals.com

## Fuente de la verdad

**La fuente oficial y definitiva de los 100 IDs de Bittick Agents es:**

```
docs/03_IDs-coleccion-Bittick-Agent.md
```

Este documento contiene los 100 bots (Bot #00 a Bot #99) con su número de inscripción, ID de inscripción, tx genesis y altura genesis. **Si hay alguna duda sobre un ID, siempre consultar el documento 03.**

---

## Dónde está la lista en el código

La lista de los 100 IDs está hardcodeada en el servidor Node.js:

```
bittick-server/src/auth/bittickCollection.js
```

Este archivo contiene:
- `BOTS` — Array con los 100 objetos bot (num, inscriptionId, txGenesis, blockHeight, tier)
- `INSCRIPTION_ID_SET` — Set de los 100 inscriptionId para búsqueda rápida
- Funciones helper: `getBotByInscriptionId()`, `hasInscriptionId()`, `getAllInscriptionIds()`, `getAllInscriptionsWithInfo()`
- `FOUNDER_NUMS = [0, 11, 22, 33, 44, 55, 66, 77, 88, 99]` — Los 10 bots FOUNDER

**IMPORTANTE:** Este archivo JS es la versión en código de la lista del documento 03. Deben estar sincronizados. Si se agrega o modifica un bot en el doc 03, se debe actualizar también en `bittickCollection.js`.

---

## Dónde está la lista en la documentación

| Archivo | Contenido |
|---------|-----------|
| `docs/03_IDs-coleccion-Bittick-Agent.md` | **FUENTE DE LA VERDAD** — Los 100 bots completos con número, ID, tx genesis, altura |
| `docs/07_como-traer-imagenes-Bittick-agents-desde-el-servidor-ordinals.md` (este archivo) | Referencia y flujo de obtención de imágenes |
| `bittick-server/docs/04_IDs-coleccion-Bittick-Agent.md` | Copia del doc 03 en el directorio del servidor |

---

## URL base para imágenes

```
https://ordinals.com/content/{inscriptionId}
```

Retorna los bytes PNG directamente. No requiere API key. No requiere autenticación.

---

## Cómo obtener las inscripciones de una wallet

### Fuente: ordinals.com

Para saber qué inscripciones posee una wallet, se consulta:

```
https://ordinals.com/address/{bitcoin-address}
```

Esta página retorna un HTML con todas las inscripciones de la wallet. Las inscripciones están en los atributos `href` de los enlaces `<a href=/inscription/{id}>`.

### Flujo en el servidor

1. El servidor recibe la dirección de la wallet
2. Hace fetch de `https://ordinals.com/address/{address}`
3. Parsea el HTML y extrae los inscription IDs de los href `/inscription/{id}`
4. Compara contra los 100 IDs de `bittickCollection.js` usando `hasInscriptionId()`
5. Retorna solo las que coinciden con la colección Bittick Agent

### Flujo en la app Android

1. Al conectar wallet → llamar `GET /api/auth/wallet-inscriptions` con header `x-wallet-address`
2. El servidor retorna las inscripciones que coinciden con la colección
3. La app muestra las inscripciones en la UI (InscriptionList en WalletScreen.kt)
4. El usuario selecciona una → llamar `POST /api/auth/select-inscription`

---

## Código Kotlin para traer UNA imagen

```kotlin
import android.graphics.BitmapFactory
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

fun fetchBittickImage(inscriptionId: String): android.graphics.Bitmap? {
    val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    val request = Request.Builder()
        .url("https://ordinals.com/content/$inscriptionId")
        .get()
        .build()

    val response = client.newCall(request).execute()
    val bytes = response.body?.bytes() ?: return null

    if (bytes.isEmpty()) return null

    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
}
```

---

## Traer las 100 imágenes en paralelo (rápido)

Descargar 10 a la vez con `Semaphore` para no saturar ordinals.com:

```kotlin
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

suspend fun fetchAllBittickImages(
    ids: List<String>
): Map<String, android.graphics.Bitmap> = coroutineScope {

    val semaphore = Semaphore(10) // máximo 10 descargas concurrentes
    val results = mutableMapOf<String, android.graphics.Bitmap>()

    ids.map { id ->
        async(Dispatchers.IO) {
            semaphore.withPermit {
                try {
                    val bitmap = fetchBittickImage(id)
                    if (bitmap != null) {
                        synchronized(results) {
                            results[id] = bitmap
                        }
                    }
                    delay(50) // pausa 50ms entre descargas para no bloquear
                } catch (e: Exception) {
                    // ignorar errores individuales
                }
            }
        }
    }.awaitAll()

    results
}
```

---

## Guardar en SharedPreferences de la app

Las imágenes se guardan como **Base64** en SharedPreferences:

```kotlin
import android.content.Context
import android.graphics.Bitmap
import android.util.Base64
import java.io.ByteArrayOutputStream

fun saveBittickImageToPrefs(
    context: Context,
    inscriptionId: String,
    bitmap: Bitmap
) {
    val prefs = context.getSharedPreferences("bittick_images", Context.MODE_PRIVATE)
    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
    val base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    prefs.edit().putString(inscriptionId, base64).apply()
}

fun loadBittickImageFromPrefs(
    context: Context,
    inscriptionId: String
): Bitmap? {
    val prefs = context.getSharedPreferences("bittick_images", Context.MODE_PRIVATE)
    val base64 = prefs.getString(inscriptionId, null) ?: return null
    val bytes = Base64.decode(base64, Base64.NO_WRAP)
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
}
```

---

## Flujo completo

1. Al conectar wallet → servidor fetch `ordinals.com/address/{wallet}` → obtiene inscripciones
2. Servidor filtra contra los 100 IDs de `bittickCollection.js`
3. Servidor retorna solo las que coinciden con la colección Bittick Agent
4. App muestra inscripciones en la UI (InscriptionList)
5. Para cada inscripción que NO esté en caché → descargar imagen de `ordinals.com/content/{id}`
6. Guardar imagen en SharedPreferences como Base64
7. Para mostrar → leer de SharedPreferences (instantáneo, sin red)

---

## Notas importantes

- ordinals.com no tiene API key ni rate limit documentado, pero 10 concurrentes es seguro
- Las imágenes son PNG de ~200x200px, pesan entre 5KB y 50KB cada una
- SharedPreferences soporta hasta ~1MB por archivo, 100 imágenes de 50KB = ~5MB total. Si excede, usar Room o caché en disco
- La primera carga tarda ~5-10 segundos. Después es instantáneo desde caché
- La lista de IDs en `bittickCollection.js` DEBE coincidir con la del documento 03
