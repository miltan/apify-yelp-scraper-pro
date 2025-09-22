import { PlaywrightCrawler, log } from 'crawlee';
import { CONSTANTS } from '../constants.js';
import { extractBusinessDetails } from '../extractors/yelpExtractor.js';
import { Actor } from 'apify';
import { saveScreenshot } from '../utils/helpers.js';

export async function createYelpCrawler({ input, proxyConfiguration, startUrl }) {
    const dataset = await Actor.openDataset();
    let businessCount = 0;
    const maxResults = input.maxResults || 50;

    // Select a random user agent
    const userAgent = CONSTANTS.USER_AGENTS[Math.floor(Math.random() * CONSTANTS.USER_AGENTS.length)];

    // Build base crawler options
    const crawlerOptions = {
        maxConcurrency: 1, // Keep it at 1 for maximum stealth
        maxRequestRetries: CONSTANTS.MAX_RETRIES,
        navigationTimeoutSecs: CONSTANTS.NAVIGATION_TIMEOUT / 1000,
        
        // Disable automatic blocking detection
        blockRequestsHandlers: [],
        
        launchContext: {
            launchOptions: {
                headless: false, // Headful mode
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--window-size=1920,1080',
                    '--user-agent=' + userAgent,
                ],
                ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=AutomationControlled'],
            },
        },

        preNavigationHooks: [
            async ({ page, request, crawler }) => {
                // Set up request interception to modify headers
                await page.route('**/*', async (route, req) => {
                    const headers = {
                        ...req.headers(),
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Sec-Ch-Ua': '"Chromium";v="120", "Not(A:Brand";v="24", "Google Chrome";v="120"',
                        'Sec-Ch-Ua-Mobile': '?0',
                        'Sec-Ch-Ua-Platform': '"Windows"',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1',
                        'Upgrade-Insecure-Requests': '1',
                    };
                    
                    await route.continue({ headers });
                });
                
                // Inject stealth scripts
                await page.addInitScript(() => {
                    // Override webdriver
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined,
                    });
                    
                    // Mock plugins
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => [
                            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                            { name: 'Native Client', filename: 'internal-nacl-plugin' },
                        ],
                    });
                    
                    // Chrome runtime
                    window.chrome = {
                        runtime: {},
                        loadTimes: function() {},
                        csi: function() {},
                    };
                    
                    // Languages
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['en-US', 'en'],
                    });
                    
                    // Platform
                    Object.defineProperty(navigator, 'platform', {
                        get: () => 'Win32',
                    });
                });
                
                // Add delay to seem more human
                await page.waitForTimeout(Math.random() * 3000 + 2000);
            },
        ],

        requestHandler: async ({ request, page, crawler, response }) => {
            const { url, userData } = request;
            
            // Check the response status but don't throw on 403
            const status = response?.status();
            log.info(`Got response status ${status} for ${url}`);
            
            if (status === 403 || status === 503) {
                log.warning(`Got ${status} response, checking page content...`);
                
                // Wait for page to load anyway
                await page.waitForTimeout(5000);
                
                // Get page content
                const content = await page.content();
                const title = await page.title();
                
                log.info(`Page title: ${title}`);
                
                // Check if it's a captcha/verification page
                if (content.includes('captcha') || content.includes('verify') || 
                    content.includes('unusual traffic') || title.includes('Verify')) {
                    log.error('Captcha/Verification page detected');
                    if (input.debugScreenshots) {
                        await saveScreenshot(page, `captcha-${Date.now()}.png`);
                    }
                    
                    // Try to wait and see if we can proceed
                    log.info('Waiting 30 seconds for potential manual intervention...');
                    await page.waitForTimeout(30000);
                    
                    // Try to reload
                    await page.reload({ waitUntil: 'domcontentloaded' });
                    await page.waitForTimeout(5000);
                }
                
                // Check if content loaded despite 403
                const hasBusinesses = await page.evaluate(() => {
                    return document.querySelectorAll('a[href*="/biz/"]').length > 0;
                });
                
                if (!hasBusinesses) {
                    log.error('No businesses found on blocked page');
                    if (input.debugScreenshots) {
                        await saveScreenshot(page, `blocked-${Date.now()}.png`);
                    }
                    return; // Skip processing this page
                }
                
                log.info('Found businesses despite block status, continuing...');
            }
            
            log.info(`Processing ${userData.type || 'search'} page: ${url}`);

            try {
                await page.waitForTimeout(Math.random() * 2000 + 1000);
                
                if (!userData.type || userData.type === 'search') {
                    // Wait for content
                    await page.waitForLoadState('domcontentloaded');
                    await page.waitForTimeout(3000);
                    
                    // Smooth scroll
                    await page.evaluate(async () => {
                        for (let i = 0; i < document.body.scrollHeight; i += 100) {
                            window.scrollTo(0, i);
                            await new Promise(r => setTimeout(r, 50));
                        }
                    });
                    
                    await page.waitForTimeout(2000);
                    
                    // Extract businesses
                    const businesses = await page.evaluate(() => {
                        const results = [];
                        const links = document.querySelectorAll('a[href*="/biz/"]');
                        
                        links.forEach(link => {
                            const href = link.href;
                            if (href && href.includes('/biz/') && 
                                !href.includes('/writeareview') && 
                                !href.includes('/questions') &&
                                !href.includes('/photos')) {
                                
                                let name = link.textContent;
                                const heading = link.querySelector('h3, h4') || link.closest('h3, h4');
                                if (heading) {
                                    name = heading.textContent;
                                }
                                
                                if (name && name.trim()) {
                                    results.push({
                                        url: href,
                                        name: name.trim(),
                                    });
                                }
                            }
                        });
                        
                        // Deduplicate
                        const unique = [];
                        const seen = new Set();
                        for (const item of results) {
                            if (!seen.has(item.url)) {
                                seen.add(item.url);
                                unique.push(item);
                            }
                        }
                        
                        return unique;
                    });

                    log.info(`Found ${businesses.length} businesses`);
                    
                    if (businesses.length === 0 && input.debugScreenshots) {
                        await saveScreenshot(page, `no-businesses-${Date.now()}.png`);
                    }

                    // Queue business pages
                    for (const business of businesses) {
                        if (businessCount >= maxResults) {
                            log.info(`Reached max results: ${maxResults}`);
                            break;
                        }

                        await page.waitForTimeout(Math.random() * 2000 + 1000);
                        
                        await crawler.addRequests([{
                            url: business.url,
                            userData: { type: 'detail', businessName: business.name },
                        }]);

                        businessCount++;
                    }

                    // Look for next page
                    if (businessCount < maxResults) {
                        const nextLink = await page.evaluate(() => {
                            const next = document.querySelector('a[aria-label="Next"], a.next-link');
                            return next ? next.href : null;
                        });

                        if (nextLink) {
                            log.info('Queueing next page...');
                            await page.waitForTimeout(Math.random() * 5000 + 5000);
                            await crawler.addRequests([{
                                url: nextLink,
                                userData: { type: 'search' },
                            }]);
                        }
                    }

                } else if (userData.type === 'detail') {
                    await page.waitForLoadState('domcontentloaded');
                    await page.waitForTimeout(2000);
                    
                    const businessData = await extractBusinessDetails(page);
                    
                    if (businessData) {
                        businessData.yelpUrl = url;
                        businessData.scrapedAt = new Date().toISOString();
                        businessData.emails = [];
                        businessData.phonesFromWebsite = [];
                        businessData.socialLinks = [];
                        
                        await dataset.pushData(businessData);
                        log.info(`Saved: ${businessData.name}`);
                    }
                }

            } catch (error) {
                log.error(`Error: ${error.message}`);
                if (input.debugScreenshots) {
                    await saveScreenshot(page, `error-${Date.now()}.png`);
                }
            }
        },

        failedRequestHandler: async ({ request }, error) => {
            // Don't log 403s as failures since we handle them
            if (!error.message.includes('403')) {
                log.error(`Request failed: ${error.message}`);
            }
        },

        // Override navigation to not throw on blocked status codes
        navigationTimeoutSecs: 60,
        handlePageTimeoutSecs: 120,
        
        // Disable throwing on blocked requests
        autoscaledPoolOptions: {
            systemStatusOptions: {
                maxEventLoopOverloadedRatio: 0.9,
            },
        },
    };

    // Only add proxyConfiguration if it exists
    if (proxyConfiguration !== null && proxyConfiguration !== undefined) {
        crawlerOptions.proxyConfiguration = proxyConfiguration;
    }

    const crawler = new PlaywrightCrawler(crawlerOptions);

    // Override the internal method that throws on blocked requests
    crawler._throwOnBlockedRequest = async () => {
        // Do nothing - we'll handle blocked requests ourselves
        return;
    };

    return crawler;
}