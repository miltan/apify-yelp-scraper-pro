import { Actor } from 'apify';
import { log } from 'crawlee';

export async function saveScreenshot(page, filename) {
    try {
        const keyValueStore = await Actor.openKeyValueStore();
        const screenshot = await page.screenshot({ fullPage: true });
        await keyValueStore.setValue(filename, screenshot, { contentType: 'image/png' });
        log.info(`Screenshot saved: ${filename}`);
    } catch (error) {
        log.error(`Failed to save screenshot: ${error.message}`);
    }
}

export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function normalizeUrl(url) {
    if (!url) return null;
    
    // Add protocol if missing
    if (!url.startsWith('http')) {
        url = `https://${url}`;
    }
    
    try {
        const parsed = new URL(url);
        // Remove trailing slash
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return url;
    }
}