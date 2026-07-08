const fs = require('fs');
const path = require('path');
const { YoutubeTranscript } = require('youtube-transcript');

const CHANNEL_URL = 'https://www.youtube.com/@tradingavizor';
const OUTPUT_FILE = '/tmp/avizor_data.json';
const PROGRESS_FILE = '/tmp/avizor_progress.json';
const DATE_CUTOFF = '20240701'; // July 1, 2024
const BATCH_SIZE = 5;
const DELAY_MS = 1500;

const ZONE_KEYWORDS = [
    'zona de compra', 'zona compra', 'zona de venta', 'zona venta',
    'zona institucional', 'demanda institucional', 'oferta institucional',
    'zona de acumulacion', 'zona de distribucion', 'zona de demanda',
    'zona de oferta', 'acumulación', 'distribución',
    'deuda', 'presupuesto', 'imán', 'imantación',
    'nivel clave', 'nivel crítico', 'soporte', 'resistencia',
    'zona verde', 'zona roja', 'zona amarilla',
    'señal de compra', 'señal de venta', 'entrada larga', 'entrada corta',
    'long', 'short', 'compra institucional', 'venta institucional',
    'renko', 'ladrillo', 'señal', 'rebalanceo',
    'liquidez', 'ballena', 'institucional'
];

const PRICE_PATTERN = /(\d{2,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(?:k|K|dólares|usd|dolares|\$)?/g;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function extractPrices(text) {
    const prices = new Set();
    let match;
    const numPattern = /\b(\d{2,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(k|K|dólares|usd|dolares|\$)?/g;
    while ((match = numPattern.exec(text)) !== null) {
        let num = match[1].replace(/[.,]/g, '');
        if (num.length >= 4 && num.length <= 7) {
            prices.add(parseInt(num));
        }
    }
    return [...prices].sort((a, b) => a - b);
}

function classifyZone(text) {
    const lower = text.toLowerCase();
    const result = {
        isBuyZone: false,
        isSellZone: false,
        isDemandZone: false,
        isSupplyZone: false,
        isKeyLevel: false,
        zoneTypes: []
    };

    if (/compra|comprar|long|acumulación|demanda/i.test(lower)) {
        result.isBuyZone = true;
        result.zoneTypes.push('compra');
    }
    if (/venta|vender|short|distribución|oferta/i.test(lower)) {
        result.isSellZone = true;
        result.zoneTypes.push('venta');
    }
    if (/demanda institucional|zona amarilla|demanda.*institucional/i.test(lower)) {
        result.isDemandZone = true;
        result.zoneTypes.push('demanda_institucional');
    }
    if (/nivel clave|nivel crítico|soporte|resistencia/i.test(lower)) {
        result.isKeyLevel = true;
        if (/soporte/i.test(lower)) result.zoneTypes.push('soporte');
        if (/resistencia/i.test(lower)) result.zoneTypes.push('resistencia');
    }
    return result;
}

function detectRenkoSignal(text) {
    const lower = text.toLowerCase();
    const patterns = [];
    if (/renko/.test(lower)) patterns.push('menciona_renko');
    if (/ladrillo/.test(lower)) patterns.push('menciona_ladrillo');
    if (/cambio de color/.test(lower)) patterns.push('cambio_color_renko');
    if (/3 velas/.test(lower) || /tres velas/.test(lower)) patterns.push('secuencia_velas');
    if (/rango lateral/.test(lower)) patterns.push('rango_lateral');
    if (/rompe|break|ruptura/.test(lower)) patterns.push('break_zona');
    if (/volumen/.test(lower)) patterns.push('menciona_volumen');
    if (/señal/.test(lower)) patterns.push('menciona_senal');
    return patterns;
}

function chunkText(text, windowSize = 500) {
    const words = text.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += windowSize) {
        chunks.push(words.slice(i, i + windowSize).join(' '));
    }
    return chunks;
}

async function getUploadDate(videoId) {
    try {
        const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = await resp.text();
        const match = html.match(/"uploadDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
        if (match) return match[1].replace(/-/g, '');
        const match2 = html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
        if (match2) return match2[1].replace(/-/g, '');
        return null;
    } catch (e) {
        return null;
    }
}

async function processVideo(videoId, videoTitle, videoIndex, total) {
    console.log(`[${videoIndex}/${total}] ${videoId} - ${(videoTitle || '').substring(0, 50)}`);
    
    let transcript = null;
    try {
        const result = await YoutubeTranscript.fetchTranscript(videoId);
        if (result && result.length > 0) {
            transcript = result.map(t => t.text).join(' ');
        }
    } catch (e) {
        // Try to get upload date even if transcript fails
    }

    const fullText = transcript || '';
    const zoneInfo = classifyZone(fullText);
    const prices = extractPrices(fullText);
    const renkoSignals = detectRenkoSignal(fullText);
    const containsZoneKeywords = ZONE_KEYWORDS.some(kw => fullText.toLowerCase().includes(kw));

    return {
        videoId,
        title: videoTitle || '',
        transcriptLength: transcript ? fullText.length : 0,
        hasTranscript: transcript !== null,
        containsZoneKeywords,
        zoneInfo,
        prices,
        renkoSignals,
        textPreview: transcript ? fullText.substring(0, 200) : ''
    };
}

async function main() {
    console.log('=== EXTRACCION DE ZONAS - TRADING AVIZOR ===');
    console.log('Canal:', CHANNEL_URL);
    console.log('Desde:', DATE_CUTOFF);
    console.log('');

    // Load existing progress if any
    let results = [];
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            results = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
            console.log(`Progreso cargado: ${results.length} videos procesados`);
        } catch (e) {
            console.log('Error cargando progreso, empezando de 0');
            results = [];
        }
    }

    // Get video list from local file
    const urlsPath = '/tmp/avizor_urls.txt';
    if (!fs.existsSync(urlsPath)) {
        console.error('No se encuentra /tmp/avizor_urls.txt');
        process.exit(1);
    }

    const urls = fs.readFileSync(urlsPath, 'utf8').trim().split('\n');
    const processedIds = new Set(results.map(r => r.videoId));
    
    console.log(`Total videos en lista: ${urls.length}`);
    console.log(`Ya procesados: ${processedIds.size}`);
    console.log('');

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const batch = urls.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (url) => {
            const videoId = new URL(url).searchParams.get('v') || url.split('=').pop();
            if (processedIds.has(videoId)) return null;
            
            const result = await processVideo(videoId, '', videoId, urls.length);
            await sleep(DELAY_MS);
            return result;
        });

        const batchResults = await Promise.all(promises);
        for (const r of batchResults) {
            if (r) results.push(r);
        }

        if (batchResults.some(r => r !== null)) {
            fs.writeFileSync(PROGRESS_FILE, JSON.stringify(results, null, 2));
        }

        console.log(`Progreso: ${results.length}/${urls.length} procesados`);
    }

    // Get upload dates for videos with zone keywords
    console.log('');
    console.log('Obteniendo fechas de publicacion para videos con zonas...');
    const videosWithZones = results.filter(r => r.containsZoneKeywords || r.zoneInfo.zoneTypes.length > 0);
    console.log(`Videos con posibles zonas: ${videosWithZones.length}`);

    for (let i = 0; i < videosWithZones.length; i += 3) {
        const batch = videosWithZones.slice(i, i + 3);
        const promises = batch.map(async (v) => {
            if (v.uploadDate) return;
            const date = await getUploadDate(v.videoId);
            if (date) v.uploadDate = date;
            await sleep(500);
        });
        await Promise.all(promises);
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(results, null, 2));
    }

    // Filter to last 2 years
    const filtered = results.filter(r => {
        if (!r.uploadDate) return r.containsZoneKeywords || r.zoneInfo.zoneTypes.length > 0;
        return r.uploadDate >= DATE_CUTOFF;
    });

    console.log(`Videos en rango (>=${DATE_CUTOFF}): ${filtered.length}`);

    // Generate summary
    const zoneVideos = filtered.filter(r => r.zoneInfo.zoneTypes.length > 0 || r.containsZoneKeywords);
    console.log(`Videos con contenido de zonas: ${zoneVideos.length}`);
    
    // Save final results
    const output = {
        channelUrl: CHANNEL_URL,
        channelName: 'Trading Avizor',
        totalVideos: urls.length,
        videosInRange: filtered.length,
        zoneVideos: zoneVideos.length,
        videos: filtered
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log('');
    console.log('=== EXTRACCION COMPLETADA ===');
    console.log(`Resultados guardados en: ${OUTPUT_FILE}`);
    console.log(`Total: ${filtered.length} videos, ${zoneVideos.length} con zonas`);
}

main().catch(console.error);
