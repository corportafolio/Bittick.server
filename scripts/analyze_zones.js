const fs = require('fs');
const path = require('path');

const TRANSCRIPTS_DIR = '/tmp/avizor_subs';
const DATES_FILE = '/tmp/avizor_dates_clean.txt';
const OUTPUT_FILE = '/home/candela/Escritorio/zonas-trading-avizor.md';

const ZONE_PATTERNS = {
    compra_institucional: [
        'zona de compra', 'zona compra', 'comprar', 'long',
        'entrada larga', 'posición larga', 'señal de compra',
        'acumulación institucional', 'comprar en', 'zona verde'
    ],
    venta_institucional: [
        'zona de venta', 'zona venta', 'vender', 'short',
        'entrada corta', 'posición corta', 'señal de venta',
        'distribución institucional', 'vender en', 'zona roja'
    ],
    demanda_institucional: [
        'demanda institucional', 'zona de demanda', 'zona amarilla',
        'demanda', 'institucional comprando'
    ],
    oferta_institucional: [
        'oferta institucional', 'zona de oferta',
        'institucional vendiendo', 'presión vendedora'
    ],
    deuda: [
        'deuda anual', 'deuda mensual', 'deuda semanal', 'deuda diaria',
        'deuda alcista', 'deuda bajista', 'deuda pagada', 'deuda pendiente',
        'presupuesto anual', 'presupuesto mensual', 'presupuesto semanal'
    ],
    renko_signal: [
        'renko', 'ladrillo', 'cambio de color', 'vela renko',
        'secuencia de velas', 'rango lateral', 'break renko'
    ],
    institucional: [
        'institucional', 'ballena', 'market maker', 'liquidez',
        'ordenes institucionales', 'smart money'
    ]
};

function loadDates() {
    const map = {};
    const content = fs.readFileSync(DATES_FILE, 'utf8');
    for (const line of content.trim().split('\n')) {
        const [id, date] = line.trim().split(/\s+/);
        if (id && date) map[id] = date;
    }
    return map;
}

function formatDate(dateStr) {
    if (!dateStr) return 'Desconocida';
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${day}/${month}/${year}`;
}

function extractPriceLevels(text) {
    const prices = [];
    const patterns = [
        /(\d{2,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(?:k|K|dólares|usd|dolares|\$)/g,
        /\$\s*(\d{2,3}(?:[.,]\d{3})*(?:[.,]\d+)?)/g,
        /(\d{2,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(?:dólares|usd|dolares)/gi
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            let num = match[1].replace(/[.,]/g, '');
            const val = parseInt(num);
            if (val >= 10000 && val <= 500000) {
                prices.push(val);
            }
        }
    }

    const unique = [...new Set(prices)].sort((a, b) => a - b);
    return unique.slice(0, 5);
}

function analyzeTranscript(text, videoId) {
    const lower = text.toLowerCase();
    const results = {
        types: new Set(),
        renkoMentions: 0,
        priceLevels: [],
        signals: [],
        mentions: []
    };

    for (const [type, keywords] of Object.entries(ZONE_PATTERNS)) {
        for (const kw of keywords) {
            let idx = 0;
            while ((idx = lower.indexOf(kw, idx)) !== -1) {
                results.types.add(type);
                const snippet = text.substring(Math.max(0, idx - 40), idx + kw.length + 60);
                results.mentions.push({ type, keyword: kw, snippet });
                idx += kw.length;
            }
        }
    }

    results.priceLevels = extractPriceLevels(text);

    const signalPatterns = [
        { pat: /rompe|break|ruptura|supera/g, label: 'break' },
        { pat: /rebote|rebota|rechazo/g, label: 'rebote' },
        { pat: /acumulación|acumulando|comprando/g, label: 'acumulacion' },
        { pat: /distribución|distribuyendo|vendiendo/g, label: 'distribucion' },
        { pat: /volumen|alto volumen|volumen alto/g, label: 'volumen' },
        { pat: /liquidez|líquido|liquidación/g, label: 'liquidez' },
        { pat: /atr|volatilidad/g, label: 'volatilidad' },
        { pat: /soporte|resistencia|nivel clave|nivel crítico/g, label: 'nivel' },
        { pat: /confirmación|confirmado|confirma/g, label: 'confirmacion' },
    ];

    for (const { pat, label } of signalPatterns) {
        pat.lastIndex = 0;
        const count = (text.match(pat) || []).length;
        if (count > 0) {
            results.signals.push({ label, count });
        }
    }

    const renkoCount = (lower.match(/renko|ladrillo/g) || []).length;
    results.renkoMentions = renkoCount;

    return results;
}

async function main() {
    console.log('=== ANALISIS DE ZONAS - TRADING AVIZOR ===');
    
    const dates = loadDates();
    console.log(`Fechas cargadas: ${Object.keys(dates).length}`);

    const files = fs.readdirSync(TRANSCRIPTS_DIR).filter(f => f.endsWith('.txt'));
    console.log(`Transcripts: ${files.length}`);

    const allVideos = [];
    const zoneVideos = [];
    const zoneClasses = new Set();

    for (const file of files) {
        const videoId = file.replace('.txt', '');
        const text = fs.readFileSync(path.join(TRANSCRIPTS_DIR, file), 'utf8');
        const uploadDate = dates[videoId];
        const analysis = analyzeTranscript(text, videoId);

        for (const t of analysis.types) zoneClasses.add(t);

        const video = {
            videoId,
            uploadDate: uploadDate || '00000000',
            uploadDateFormatted: formatDate(uploadDate),
            transcriptLength: text.length,
            types: [...analysis.types],
            priceLevels: analysis.priceLevels,
            renkoMentions: analysis.renkoMentions,
            signals: analysis.signals,
            mentions: analysis.mentions.slice(0, 10),
            hasZoneInfo: analysis.types.size > 0
        };

        allVideos.push(video);
        if (analysis.types.size > 0) {
            zoneVideos.push(video);
        }
    }

    allVideos.sort((a, b) => b.uploadDate.localeCompare(a.uploadDate));

    console.log(`Total: ${allVideos.length}, con zonas: ${zoneVideos.length}`);
    console.log(`Clases detectadas: ${[...zoneClasses].join(', ')}`);

    // Generate MARKDOWN
    let md = `# Catálogo de Zonas — Trading Avizor

> Canal: [Trading Avizor](https://www.youtube.com/@tradingavizor)
> Últimos 2 años: ${formatDate('20240701')} — ${formatDate(allVideos[0]?.uploadDate || '20260706')}
> Videos analizados: ${allVideos.length} (${zoneVideos.length} con contenido de zonas)
> Generado: ${new Date().toISOString().split('T')[0]}

---

## Índice

1. [Clasificación de Zonas](#1-clasificación-de-zonas)
2. [Catálogo Cronológico de Zonas](#2-catálogo-cronológico-de-zonas)
3. [Patrones de Velas Renko por Tipo de Zona](#3-patrones-de-velas-renko-por-tipo-de-zona)
4. [Señales de Entrada/Salida](#4-señales-de-entradasalida)
5. [Estadísticas](#5-estadísticas)

---

## 1. Clasificación de Zonas

### 🟢 Zonas de Compra Institucional (Verde)

| Atributo | Descripción |
|----------|-------------|
| **Color** | \`#44FF66\` (verde) |
| **Tipo** | \`buy\`, \`compra_institucional\` |
| **Ubicación** | Por debajo del precio actual |
| **Significado** | Área donde hay órdenes de compra institucional acumuladas |
| **Señal Renko** | Cambio de color de rojo a verde en la "back" de la zona |

**Características de la vela Renko que señala una Zona de Compra:**
- Vela Renko **verde** que cierra por encima del rango lateral
- Secuencia de **3+ velas verdes consecutivas** después del break
- La vela de break tiene **cuerpo grande** (1.5x el tamaño del ladrillo)
- El precio **rompe la "back"** de la zona (lado superior + buffer)
- **Volumen alto** en la vela de confirmación

### 🔴 Zonas de Venta Institucional (Rojo)

| Atributo | Descripción |
|----------|-------------|
| **Color** | \`#FF4444\` (rojo) |
| **Tipo** | \`sell\`, \`venta_institucional\` |
| **Ubicación** | Por encima del precio actual |
| **Significado** | Área donde hay órdenes de venta institucional acumuladas |
| **Señal Renko** | Cambio de color de verde a rojo en la "back" de la zona |

**Características de la vela Renko que señala una Zona de Venta:**
- Vela Renko **roja** que rompe el soporte del rango lateral
- Secuencia de **3+ velas rojas consecutivas**
- Break con **vela grande** que supera el ancho promedio del ladrillo
- El precio **rompe la "back inferior"** de la zona
- **Aumento de volumen** en la dirección de la venta

### 🟡 Zonas de Demanda Institucional (Amarillo)

| Atributo | Descripción |
|----------|-------------|
| **Color** | \`#FFD700\` (amarillo) |
| **Tipo** | \`demanda_institucional\` |
| **Diferencia** | NO son zonas de compra/venta directas — son áreas donde el institucional **acumula posición** gradualmente |
| **Origen** | Swings de volumen + deltas de compra acumulados |
| **Señal Renko** | Rango lateral prolongado en Renko (10+ ladrillos) |

**Características de la vela Renko que señala Demanda Institucional:**
- **Rango lateral** en Renko de 10+ ladrillos (el precio se mueve sideways)
- Velas **alternando colores** sin dirección clara
- **Reducción progresiva** del tamaño de los ladrillos
- Aparición de **velas con mechas largas** en ambos lados
- **Volumen bajo** durante la acumulación, seguido de **explosión de volumen** al salir

### 📊 Niveles de Deuda (Presupuestos)

| Tipo | Periodo | Impacto |
|------|---------|---------|
| Deuda Anual | 1 de enero | Nivel macro más importante |
| Deuda Mensual | 1 de cada mes | Rango del mes |
| Deuda Semanal | Cada lunes | Movimiento semanal |
| Deuda Diaria | Cada día | Niveles intradía |

---

## 2. Catálogo Cronológico de Zonas

`;

    // Group by month
    const byMonth = {};
    for (const v of zoneVideos) {
        const month = v.uploadDate.substring(0, 6);
        if (!byMonth[month]) byMonth[month] = [];
        byMonth[month].push(v);
    }

    const sortedMonths = Object.keys(byMonth).sort();
    
    for (const month of sortedMonths) {
        const videos = byMonth[month].sort((a, b) => b.uploadDate.localeCompare(a.uploadDate));
        const year = month.substring(0, 4);
        const m = month.substring(4, 6);
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                           'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        
        md += `### ${monthNames[parseInt(m) - 1]} ${year}\n\n`;
        
        for (const v of videos) {
            const types = v.types.join(', ').replace(/_/g, ' ');
            const prices = v.priceLevels.length > 0 ? v.priceLevels.map(p => `\$${p.toLocaleString()}`).join(', ') : '—';
            const emoji = v.types.includes('compra_institucional') ? '🟢' :
                         v.types.includes('venta_institucional') ? '🔴' :
                         v.types.includes('demanda_institucional') ? '🟡' : '📊';
            
            md += `| ${v.uploadDateFormatted} | [${v.videoId}](https://www.youtube.com/watch?v=${v.videoId}) | ${emoji} ${types} | ${prices} | ${v.renkoMentions} |\n`;
        }
        md += '\n';
    }

    md += `---

## 3. Patrones de Velas Renko por Tipo de Zona

### 3.1 Señal de COMPRA en Renko

\`\`\`
1. El precio está en un rango lateral (alternancia de colores en Renko)
2. Aparece una vela RENKO VERDE que cierra FUERA del rango
3. La vela rompe la "back" de la zona (obstáculo superior + 0.8-1%)
4. CONFIRMACIÓN: 2da vela verde consecutiva
5. Señal FUERTE si: vela grande + volumen + 3+ velas verdes seguidas
\`\`\`

### 3.2 Señal de VENTA en Renko

\`\`\`
1. El precio está en un rango lateral
2. Aparece una vela RENKO ROJA que cierra FUERA del rango
3. La vela rompe la "back inferior" de la zona
4. CONFIRMACIÓN: 2da vela roja consecutiva
5. Señal FUERTE si: vela grande + volumen + 3+ velas rojas seguidas
\`\`\`

### 3.3 Señal de DEMANDA INSTITUCIONAL (Acumulación)

\`\`\`
1. Rango lateral de 10+ ladrillos Renko
2. Velas alternando colores sin dirección
3. Reducción del tamaño de ladrillos
4. Volumen disminuyendo
5. SALIDA: vela grande + volumen que rompe el rango
\`\`\`

### 3.4 Características generales de las velas señal

| Característica | Compra (🟢) | Venta (🔴) | Demanda (🟡) |
|---------------|-------------|-------------|--------------|
| Color vela | Verde | Roja | Alternante |
| Tamaño ladrillo | 1.5x+ normal | 1.5x+ normal | Reducción progresiva |
| Secuencia | 3+ verdes | 3+ rojas | Alternante 10+ |
| Volumen | Alto | Alto | Bajo→Alto |
| Break | Back superior | Back inferior | Fuera de rango |
| Confirmación | 2da vela | 2da vela | Vela grande+vol |

---

## 4. Señales de Entrada/Salida

### Score de Señal (0-10)

| Score | Significado |
|-------|-------------|
| 0-5 | Señal débil — No operar |
| 6 | Cuestionable — Esperar confirmación |
| 7 | Aceptable — Entrada parcial |
| 8 | Buena — Break rápido + volumen |
| 9 | Muy buena — Break + imán cerca |
| 10 | Excelente — Máxima confianza |

### Factores que aumentan el Score

- Break de la "back" de la zona: **+4 puntos**
- Cercanía al imán (<0.5%): **+3 puntos**
- Fuerza de zona >= 7: **+2 puntos**
- Volumen alto en break: **+2 puntos**
- Movimiento rápido: **+2 puntos**
- Zona imán alcanzable: **+1 punto**

---

## 5. Estadísticas

| Métrica | Valor |
|---------|-------|
| Total videos analizados | ${allVideos.length} |
| Videos con zonas identificadas | ${zoneVideos.length} |
| Rango de fechas | ${formatDate('20240701')} — ${formatDate(allVideos[0]?.uploadDate || '20260706')} |
| Canal | [Trading Avizor](https://www.youtube.com/@tradingavizor) |
| Clases de zonas detectadas | ${[...zoneClasses].map(c => c.replace(/_/g, ' ')).join(', ')} |

### Distribución por tipo de zona

`;

    const typeCounts = {};
    for (const v of zoneVideos) {
        for (const t of v.types) {
            typeCounts[t] = (typeCounts[t] || 0) + 1;
        }
    }

    for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
        const emoji = type === 'compra_institucional' ? '🟢' :
                     type === 'venta_institucional' ? '🔴' :
                     type === 'demanda_institucional' ? '🟡' : '📊';
        md += `- ${emoji} **${type.replace(/_/g, ' ')}**: ${count} videos\n`;
    }

    md += `
---

## 6. Enlaces de Referencia

- **Canal YouTube**: [Trading Avizor](https://www.youtube.com/@tradingavizor)
- **Telegram**: [@TradingAvizor](https://t.me/TradingAvizor)
- **Twitter/X**: [@TradingAvizor](https://x.com/TradingAvizor)
- **Estrategia**: [estrategia-trading-avizor.md](../Escritorio/estrategia-trading-avizor.md)

---

> Documento generado automáticamente a partir del análisis de ${allVideos.length} transcripciones del canal Trading Avizor.
> Incluye zonas de compra institucional (🟢), venta institucional (🔴) y demanda institucional (🟡).
`;

    fs.writeFileSync(OUTPUT_FILE, md, 'utf8');
    console.log(`\nDocumento generado: ${OUTPUT_FILE}`);
    console.log(`Tamaño: ${(md.length / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
