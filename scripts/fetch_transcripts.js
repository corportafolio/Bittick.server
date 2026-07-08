const fs = require('fs');
const { YoutubeTranscript } = require('youtube-transcript');

const URLS_FILE = '/tmp/avizor_300.txt';
const OUTPUT_DIR = '/tmp/avizor_subs';
const PROGRESS_FILE = '/tmp/avizor_progress.json';
const BATCH = 5;
const DELAY = 1000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTranscript(videoId) {
    try {
        const result = await YoutubeTranscript.fetchTranscript(videoId);
        if (result && result.length > 0) {
            return result.map(t => t.text).join(' ');
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function main() {
    console.log('=== FETCH TRANSCRIPTS ===');
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    let progress = {};
    if (fs.existsSync(PROGRESS_FILE)) {
        try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch (e) {}
    }

    const urls = fs.readFileSync(URLS_FILE, 'utf8').trim().split('\n').filter(Boolean);
    console.log('Total:', urls.length, 'Procesados:', Object.keys(progress).length);

    for (let i = 0; i < urls.length; i += BATCH) {
        const batch = urls.slice(i, i + BATCH);
        
        await Promise.all(batch.map(async (url) => {
            const videoId = new URL(url).searchParams.get('v') || url.split('=').pop();
            if (progress[videoId]) return;
            
            const text = await fetchTranscript(videoId);
            progress[videoId] = { id: videoId, hasTranscript: text !== null, length: text ? text.length : 0 };
            if (text) fs.writeFileSync(`${OUTPUT_DIR}/${videoId}.txt`, text);
            console.log(`${i + batch.indexOf(url) + 1}/${urls.length} ${videoId} ${text ? `OK(${text.length}c)` : 'NO_SUBS'}`);
        }));

        await sleep(DELAY);

        if (i % 25 === 0) {
            fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
            const ok = Object.values(progress).filter(v => v.hasTranscript).length;
            console.log(`[CHECKPOINT ${i}/${urls.length}] con subs: ${ok}/${Object.keys(progress).length}`);
        }
    }

    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    const ok = Object.values(progress).filter(v => v.hasTranscript).length;
    console.log(`\nHecho: ${Object.keys(progress).length} videos, ${ok} con transcripcion`);
}

main().catch(console.error);
