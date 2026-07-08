const fs = require('fs');
const path = require('path');

const TRANSCRIPTS_DIR = '/tmp/avizor_subs';
const DATES_FILE = '/tmp/avizor_dates_clean.txt';
const OUTPUT_FILE = '/home/candela/Escritorio/zonas-trading-avizor.md';

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
    const m = dateStr.substring(4,6);
    const d = dateStr.substring(6,8);
    const y = dateStr.substring(0,4);
    return `${d}/${m}/${y}`;
}

// Normalize a price mention string to a clean number.
// Handles Spanish format: 63,720 = 63720, 63.100 = 63100, 65170 = 65170
// Also handles: "63 k" = 63000, "53" in price context = 53000
function normalizePrice(str, context) {
    let s = str.trim().replace(/^\$/, '').replace(/\s+/g, '');
    
    // Check for "k" or "mil" suffix
    let multiplier = 1;
    if (/[kK]/.test(s)) {
        multiplier = 1000;
        s = s.replace(/[kK]/g, '');
    }
    if (/mil/i.test(s)) {
        multiplier = 1000;
        s = s.replace(/mil/i, '');
    }
    
    // Handle "X.XXX" (dot as thousands sep) and "X,XXX" (comma as thousands sep)
    // If format is like "63,720" (6 digits with comma), remove comma -> 63720
    // If format is like "63.100" (dot sep), remove dot -> 63100
    if (s.includes(',') && !s.includes('.')) {
        // Spanish: comma is thousands separator
        s = s.replace(/,/g, '');
    } else if (s.includes('.') && !s.includes(',')) {
        // Spanish: dot is thousands separator
        s = s.replace(/\./g, '');
    } else if (s.includes(',') && s.includes('.')) {
        // Both - likely "63,720.50" or similar - remove comma, dot is decimal
        s = s.replace(/,/g, '');
        s = s.replace(/\.(\d+)/, '$1'); // keep decimal
    }
    
    let num = parseInt(s);
    if (!isNaN(num) && multiplier > 1) num *= multiplier;
    
    // If number is small (20-200) and context suggests thousands
    if (!isNaN(num) && num >= 20 && num <= 200 && context && 
        /mil|k|precio|deuda|zona|\$/i.test(context)) {
        num *= 1000;
    }
    
    // Validate: BTC price should be reasonable (1000 - 500000)
    if (!isNaN(num) && num >= 1000 && num <= 500000) return num;
    return null;
}

function findAllPrices(text) {
    const prices = [];
    
    // Pattern 1: Standard prices with separators - "63,720", "63.100", "65,170"
    const pat1 = /\b(\d{2,3}(?:[.,]\d{3}){1,2})\b/g;
    let m;
    while ((m = pat1.exec(text)) !== null) {
        const val = normalizePrice(m[1], '');
        if (val) {
            prices.push({ value: val, index: m.index, raw: m[1] });
        }
    }
    
    // Pattern 2: Compact numbers - "65170", "66780" (5 digits)
    const pat2 = /\b(\d{5,6})\b/g;
    while ((m = pat2.exec(text)) !== null) {
        const val = parseInt(m[1]);
        if (val >= 10000 && val <= 500000) {
            prices.push({ value: val, index: m.index, raw: m[1] });
        }
    }
    
    // Pattern 3: $ prefix
    const pat3 = /\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)/g;
    while ((m = pat3.exec(text)) !== null) {
        const val = normalizePrice(m[1], '$');
        if (val) {
            prices.push({ value: val, index: m.index, raw: m[0] });
        }
    }
    
    // Pattern 4: "X dólares" / "X usd"
    const pat4 = /(\d{1,3}(?:[.,]\d{3})*)\s*(?:dólares|dolares|usd|USD|k)/gi;
    while ((m = pat4.exec(text)) !== null) {
        const context = text.substring(Math.max(0, m.index - 30), m.index + 30);
        const val = normalizePrice(m[1], context);
        if (val) {
            prices.push({ value: val, index: m.index, raw: m[0] });
        }
    }
    
    // Pattern 5: Abbreviated prices with "mil" or "k"
    const pat5 = /(\d{2,3})\s*(?:mil|k)\b/gi;
    while ((m = pat5.exec(text)) !== null) {
        const val = parseInt(m[1]) * 1000;
        if (val >= 1000 && val <= 500000) {
            prices.push({ value: val, index: m.index, raw: m[0], isAbbrev: true });
        }
    }
    
    // Pattern 6: "en los X" or "en el X" where X is a round number like 53, 49, 45
    const pat6 = /(?:en\s+los|en\s+el|de\s+los|de\s+el|a\s+los|a\s+las)\s+(\d{2,3})\b/gi;
    while ((m = pat6.exec(text)) !== null) {
        const val = parseInt(m[1]);
        if (val >= 20 && val <= 200) {
            const priceVal = val * 1000;
            if (priceVal <= 500000) {
                const exists = prices.some(p => p.value === priceVal && Math.abs(p.index - m.index) < 50);
                if (!exists) {
                    prices.push({ value: priceVal, index: m.index, raw: m[0], isAbbrev: true });
                }
            }
        }
    }
    
    // Sort by position in text
    prices.sort((a, b) => a.index - b.index);
    
    // Deduplicate nearby same values
    const unique = [];
    for (const p of prices) {
        const last = unique[unique.length - 1];
        if (!last || Math.abs(last.index - p.index) > 20 || last.value !== p.value) {
            unique.push(p);
        }
    }
    
    return unique;
}

function detectZoneRanges(text, prices) {
    const lower = text.toLowerCase();
    const zones = [];
    
    // Zone keyword patterns with strong context
    const keywords = [
        // Compra
        { type: 'compra', pat: /zona de compra\s*(?:institucional)?|zon[ae]\s+de\s+acumulaci[óo]n|zona\s+verde|compr[ae]\s+institucional|entrada\s+(en\s+)?larga|señal\s+de\s+compra/gi },
        // Venta
        { type: 'venta', pat: /zona de venta\s*(?:institucional)?|zon[ae]\s+de\s+distribuci[óo]n|zona\s+roja|vent[ae]\s+institucional|entrada\s+(en\s+)?corta|señal\s+de\s+venta/gi },
        // Demanda
        { type: 'demanda', pat: /demanda institucional|zona de demanda|zona amarilla/gi },
        // Oferta
        { type: 'oferta', pat: /oferta institucional|zona de oferta/gi },
        // Buy/Sell zones (English mixed in)
        { type: 'compra', pat: /\b(?:buy|long)\s+zone\b/gi },
        { type: 'venta', pat: /\b(?:sell|short)\s+zone\b/gi },
    ];
    
    // Deuda patterns - these are always important
    const deudaPats = [
        /deuda anual/gi, /deuda mensual/gi, /deuda semanal/gi, /deuda diaria/gi,
        /nueva deuda|nuev[oa]\s+presupuesto|presupuesto mensual|presupuesto semanal/gi,
        /deuda alcista|deuda bajista|deuda de acumulación|deuda pendiente/gi,
    ];
    
    for (const dp of deudaPats) {
        let idx = 0;
        while ((idx = lower.search(dp)) !== -1 || (idx = dp.lastIndex || 0) && false) {
            // Actually use exec
            const re = new RegExp(dp.source, 'gi');
            let m;
            while ((m = re.exec(text)) !== null) {
                idx = m.index;
                break;
            }
            if (!m) break;
        }
    }
    
    // Better approach: simple loop
    for (const kw of keywords) {
        const re = new RegExp(kw.pat.source, 'gi');
        let m;
        while ((m = re.exec(text)) !== null) {
            const idx = m.index;
            
            // Get prices within 150 chars before and 150 chars after the keyword
            const windowStart = Math.max(0, idx - 150);
            const windowEnd = Math.min(text.length, idx + m[0].length + 150);
            
            const nearbyPrices = prices.filter(p => 
                p.index >= windowStart && p.index <= windowEnd
            );
            
            const contextSample = text.substring(idx, Math.min(text.length, idx + 100));
            
            let rangeLow = null, rangeHigh = null;
            
            if (nearbyPrices.length >= 2) {
                // Take min and max of nearby prices as the zone range
                const vals = nearbyPrices.map(p => p.value);
                rangeLow = Math.min(...vals);
                rangeHigh = Math.max(...vals);
            } else if (nearbyPrices.length === 1) {
                rangeLow = rangeHigh = nearbyPrices[0].value;
            }
            
            // Also check for explicit range patterns near the keyword
            const context = text.substring(windowStart, windowEnd);
            const rangePat = /entre\s+.*?(\d{2,3}(?:[.,]\d{3})*|\d{5,6}).*?(?:y|a|hasta)\s+.*?(\d{2,3}(?:[.,]\d{3})*|\d{5,6})/gi;
            let r;
            while ((r = rangePat.exec(context)) !== null) {
                const a = normalizePrice(r[1], '');
                const b = normalizePrice(r[2], '');
                if (a && b) {
                    rangeLow = Math.min(a, b);
                    rangeHigh = Math.max(a, b);
                }
            }
            
            zones.push({
                type: kw.type,
                keyword: m[0],
                index: idx,
                nearbyPrices: nearbyPrices.slice(0, 8),
                rangeLow,
                rangeHigh,
                contextSample: contextSample.replace(/\n/g, ' ').trim().substring(0, 120)
            });
        }
    }
    
    // Deuda detection
    for (const dp of deudaPats) {
        const re = new RegExp(dp.source, 'gi');
        let m;
        while ((m = re.exec(text)) !== null) {
            const idx = m.index;
            const windowStart = Math.max(0, idx - 150);
            const windowEnd = Math.min(text.length, idx + m[0].length + 150);
            
            const nearbyPrices = prices.filter(p => 
                p.index >= windowStart && p.index <= windowEnd
            );
            
            const contextSample = text.substring(idx, Math.min(text.length, idx + 100));
            
            let rangeLow = null, rangeHigh = null;
            
            if (nearbyPrices.length >= 2) {
                const vals = nearbyPrices.map(p => p.value);
                rangeLow = Math.min(...vals);
                rangeHigh = Math.max(...vals);
            } else if (nearbyPrices.length === 1) {
                rangeLow = rangeHigh = nearbyPrices[0].value;
            }
            
            // Check for explicit range
            const context = text.substring(windowStart, windowEnd);
            const rangePat = /entre\s+.*?(\d{2,3}(?:[.,]\d{3})*|\d{5,6}).*?(?:y|a|hasta)\s+.*?(\d{2,3}(?:[.,]\d{3})*|\d{5,6})/gi;
            let r;
            while ((r = rangePat.exec(context)) !== null) {
                const a = normalizePrice(r[1], '');
                const b = normalizePrice(r[2], '');
                if (a && b) {
                    rangeLow = Math.min(a, b);
                    rangeHigh = Math.max(a, b);
                }
            }
            
            zones.push({
                type: 'deuda',
                keyword: m[0].substring(0, 30),
                index: idx,
                nearbyPrices: nearbyPrices.slice(0, 8),
                rangeLow,
                rangeHigh,
                contextSample: contextSample.replace(/\n/g, ' ').trim().substring(0, 120)
            });
        }
    }
    
    // Sort by position and deduplicate
    zones.sort((a, b) => a.index - b.index);
    const unique = [];
    for (const z of zones) {
        const last = unique[unique.length - 1];
        if (!last || Math.abs(last.index - z.index) > 50 || last.type !== z.type) {
            unique.push(z);
        }
    }
    
    // Deduplicate by proximity
    const deduped = [];
    for (const z of unique) {
        const tooClose = deduped.some(d => Math.abs(d.index - z.index) < 60);
        if (!tooClose) deduped.push(z);
    }
    
    return deduped;
}

function formatPrice(num) {
    if (!num) return '—';
    return '$' + num.toLocaleString('es-ES');
}

async function main() {
    console.log('=== EXTRACCION DE PRECIOS EXACTOS ===');
    
    const dates = loadDates();
    const files = fs.readdirSync(TRANSCRIPTS_DIR).filter(f => f.endsWith('.txt')).sort();
    console.log(`Procesando ${files.length} transcripts...`);

    const allVideos = [];
    let totalRanged = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const videoId = file.replace('.txt', '');
        const text = fs.readFileSync(path.join(TRANSCRIPTS_DIR, file), 'utf8');
        const uploadDate = dates[videoId] || '00000000';

        const prices = findAllPrices(text);
        const zones = detectZoneRanges(text, prices);
        
        const uniqueTypes = [...new Set(zones.map(z => z.type))];
        const hasRanges = zones.some(z => z.rangeLow && z.rangeHigh);
        
        // For the catalog, group zones by type and get best price ranges
        const typeGroups = {};
        for (const z of zones) {
            if (!typeGroups[z.type]) typeGroups[z.type] = [];
            typeGroups[z.type].push(z);
        }
        
        const zoneSummaries = [];
        for (const [type, zlist] of Object.entries(typeGroups)) {
            // Get the price range that spans all zones of this type
            const lows = zlist.filter(z => z.rangeLow).map(z => z.rangeLow);
            const highs = zlist.filter(z => z.rangeHigh).map(z => z.rangeHigh);
            const allPrices = [...new Set(zlist.flatMap(z => z.nearbyPrices.map(p => p.value)))].sort((a, b) => a - b);
            
            zoneSummaries.push({
                type,
                count: zlist.length,
                rangeLow: lows.length > 0 ? Math.min(...lows) : null,
                rangeHigh: highs.length > 0 ? Math.max(...highs) : null,
                allPrices: allPrices.slice(0, 6)
            });
        }
        
        const allZonePrices = zones.flatMap(z => z.nearbyPrices.map(p => p.value));
        const dedupPrices = [...new Set(allZonePrices)].sort((a, b) => a - b);
        
        const video = {
            videoId,
            uploadDate,
            uploadDateFormatted: formatDate(uploadDate),
            types: uniqueTypes,
            zones: zoneSummaries,
            allPrices: dedupPrices.slice(0, 10),
            hasRanges,
            totalZones: zones.length
        };

        if (zones.length > 0) {
            allVideos.push(video);
            if (hasRanges) totalRanged++;
        }

        if (i % 50 === 0) console.log(`  ${i}/${files.length} (${allVideos.length} con zonas, ${totalRanged} con rangos)`);
    }

    allVideos.sort((a, b) => b.uploadDate.localeCompare(a.uploadDate));
    console.log(`\nTotal con zonas: ${allVideos.length}, con rangos: ${totalRanged}`);

    // Count types
    const typeCounts = {};
    for (const v of allVideos) {
        for (const zs of v.zones) {
            typeCounts[zs.type] = (typeCounts[zs.type] || 0) + 1;
        }
    }
    console.log('Distribucion:', typeCounts);

    // === GENERATE DOCUMENT ===
    const SATS_PER_BTC = 100000000;

    let md = `# Catálogo de Zonas — Trading Avizor

> Canal: [Trading Avizor](https://www.youtube.com/@tradingavizor)
> Período: 01/07/2024 — ${allVideos.length > 0 ? formatDate(allVideos[0].uploadDate) : '06/07/2026'}
> Videos analizados: ${files.length} (${allVideos.length} con zonas identificadas, ${totalRanged} con rangos de precio exactos)
> Generado: ${new Date().toISOString().split('T')[0]}

---

## Índice

1. [Clasificación de Zonas](#1-clasificación-de-zonas)
2. [Catálogo Cronológico de Zonas con Precios Exactos](#2-catálogo-cronológico-de-zonas-con-precios-exactos)
3. [Patrones de Velas Renko por Tipo de Zona](#3-patrones-de-velas-renko-por-tipo-de-zona)
4. [Estadísticas](#4-estadísticas)

---

## 1. Clasificación de Zonas

### 🟢 Zonas de Compra Institucional

| Atributo | Descripción |
|----------|-------------|
| **Color** | Verde |
| **Ubicación** | Por debajo del precio actual |
| **Significado** | Órdenes de compra institucional acumuladas |
| **Señal Renko** | Vela verde rompiendo back superior |

### 🔴 Zonas de Venta Institucional

| Atributo | Descripción |
|----------|-------------|
| **Color** | Rojo |
| **Ubicación** | Por encima del precio actual |
| **Significado** | Órdenes de venta institucional acumuladas |
| **Señal Renko** | Vela roja rompiendo back inferior |

### 🟡 Zonas de Demanda Institucional

| Atributo | Descripción |
|----------|-------------|
| **Color** | Amarillo |
| **Significado** | Área de acumulación gradual |
| **Señal Renko** | Rango lateral 10+ ladrillos |

### 📊 Niveles de Deuda

| Tipo | Frecuencia | Descripción |
|------|-----------|-------------|
| Anual | 1/ene | Nivel macro más importante del año |
| Mensual | 1/mes | Presupuesto mensual |
| Semanal | lunes | Movimiento semanal |
| Diaria | cada día | Niveles intradía |

---

## 2. Catálogo Cronológico de Zonas con Precios Exactos

> **Leyenda:**
> - 🟢 = Compra Institucional  🔴 = Venta Institucional  🟡 = Demanda  📊 = Deuda/Nivel Clave
> - **Rango** = Límite inferior — superior de la zona
> - **Precios** = Cotizaciones mencionadas relacionadas con la zona

`;

    // Group by month
    const byMonth = {};
    for (const v of allVideos) {
        const month = v.uploadDate.substring(0, 6);
        if (!byMonth[month]) byMonth[month] = [];
        byMonth[month].push(v);
    }

    const sortedMonths = Object.keys(byMonth).sort();
    const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    for (const month of sortedMonths) {
        const videos = byMonth[month].sort((a, b) => a.uploadDate.localeCompare(b.uploadDate));
        const year = month.substring(0, 4);
        const mNum = parseInt(month.substring(4, 6));
        
        // Count types this month
        const monthTypes = {};
        for (const v of videos) {
            for (const zs of v.zones) {
                monthTypes[zs.type] = (monthTypes[zs.type] || 0) + 1;
            }
        }
        const typeStr = Object.entries(monthTypes)
            .map(([t, c]) => { 
                const e = t === 'compra' ? '🟢' : t === 'venta' ? '🔴' : t === 'demanda' ? '🟡' : '📊';
                return `${e}${t}: ${c}`;
            })
            .join(' · ');

        md += `### ${monthNames[mNum]} ${year} — ${typeStr}\n\n`;
        md += `| Fecha | Tipo | Rango USD | Rango BTC | Precios clave |\n`;
        md += `|-------|------|-----------|-----------|---------------|\n`;

        for (const v of videos) {
            // Build type column
            const parts = [];
            for (const zs of v.zones) {
                const e = zs.type === 'compra' ? '🟢' : zs.type === 'venta' ? '🔴' : zs.type === 'demanda' ? '🟡' : '📊';
                const label = zs.type.charAt(0).toUpperCase() + zs.type.slice(1);
                parts.push(`${e}${label}`);
            }
            const typeCol = parts.length > 0 ? parts.join('<br>') : '—';
            
            // Best range
            const rangedZones = v.zones.filter(z => z.rangeLow && z.rangeHigh);
            let rangeUsd = '—';
            let rangeBtc = '—';
            if (rangedZones.length > 0) {
                const allLow = Math.min(...rangedZones.map(z => z.rangeLow));
                const allHigh = Math.max(...rangedZones.map(z => z.rangeHigh));
                rangeUsd = `\$${allLow.toLocaleString('es-ES')} — \$${allHigh.toLocaleString('es-ES')}`;
                rangeBtc = `${(allLow / SATS_PER_BTC).toFixed(8)} — ${(allHigh / SATS_PER_BTC).toFixed(8)}`;
            }
            
            // Prices
            const priceStr = v.allPrices.length > 0 
                ? v.allPrices.slice(0, 5).map(p => `\$${p.toLocaleString('es-ES')}`).join(', ')
                : '—';
            
            md += `| ${v.uploadDateFormatted} | ${typeCol} | ${rangeUsd} | ${rangeBtc} | ${priceStr} |\n`;
        }
        md += '\n';
    }

    md += `---

## 3. Patrones de Velas Renko por Tipo de Zona

### 3.1 Señal de COMPRA 🟢

1. Rango lateral → vela Renko verde cierra fuera del rango
2. Rompe la **"back" de la zona** (techo + 0.8-1% buffer)
3. Confirmación: 2ª vela verde consecutiva
4. Fuerte si: vela grande + volumen alto + 3+ verdes

### 3.2 Señal de VENTA 🔴

1. Rango lateral → vela Renko roja cierra fuera del rango
2. Rompe la **"back inferior"** de la zona
3. Confirmación: 2ª vela roja
4. Fuerte si: vela grande + volumen + 3+ rojas

### 3.3 Señal de DEMANDA 🟡

1. Rango lateral de 10+ ladrillos
2. Velas alternando sin dirección dominante
3. Reducción progresiva del tamaño de ladrillos
4. Volumen bajo → explosión al salir

### 3.4 Tabla de señales

| Característica | Compra 🟢 | Venta 🔴 | Demanda 🟡 |
|---------------|-----------|----------|------------|
| Color vela | Verde | Roja | Alternante |
| Tamaño ladrillo | 1.5x+ normal | 1.5x+ normal | Reducción progresiva |
| Secuencia | 3+ verdes | 3+ rojas | 10+ alternantes |
| Volumen | Alto en break | Alto en break | Bajo→Alto |
| Break | Back superior | Back inferior | Fuera de rango |

---

## 4. Estadísticas

| Métrica | Valor |
|---------|-------|
| Total videos analizados | ${files.length} |
| Videos con zonas identificadas | ${allVideos.length} |
| Zonas con rango de precio exacto | ${totalRanged} |
| Rango de fechas | 01/07/2024 — ${allVideos.length > 0 ? formatDate(allVideos[0].uploadDate) : '06/07/2026'} |
| Canal | [Trading Avizor](https://www.youtube.com/@tradingavizor) |

### Distribución por tipo

`;

    for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
        const e = type === 'compra' ? '🟢' : type === 'venta' ? '🔴' : type === 'demanda' ? '🟡' : '📊';
        const label = type.charAt(0).toUpperCase() + type.slice(1);
        const pct = ((count / allVideos.length) * 100).toFixed(1);
        md += `| ${e} ${label} | ${count} | ${pct}% |\n`;
    }

    md += `
---

## 5. Enlaces

- **Canal**: [Trading Avizor](https://www.youtube.com/@tradingavizor)
- **Telegram**: [@TradingAvizor](https://t.me/TradingAvizor)
- **Estrategia**: [estrategia-trading-avizor.md](estrategia-trading-avizor.md)

---

> Generado automáticamente a partir de ${files.length} transcripciones del canal Trading Avizor.
> Los rangos de precio se determinan agrupando las cotizaciones mencionadas junto a cada tipo de zona.
`;

    fs.writeFileSync(OUTPUT_FILE, md, 'utf8');
    console.log(`\nDocumento generado: ${OUTPUT_FILE}`);
    console.log(`Tamaño: ${(md.length / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
