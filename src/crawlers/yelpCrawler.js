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
        maxConcurrency: Math.min(input.maxConcurrency || 3, 1), // Reduce concurrency for stealth
        maxRequestRetries: CONSTANTS.MAX_RETRIES,
        navigationTimeoutSecs: CONSTANTS.NAVIGATION_TIMEOUT / 1000,
        
        launchContext: {
            launchOptions: {
                headless: false, // Use headful mode for better stealth
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-site-isolation-trials',
                    '--disable-web-security',
                    '--disable-features=BlockInsecurePrivateNetworkRequests',
                    '--disable-features=OutOfBlinkCors',
                    '--window-size=1920,1080',
                    '--start-maximized',
                ],
                ignoreDefaultArgs: ['--enable-automation'],
            },
            // Set user agent at browser context level
            userAgent: userAgent,
            viewport: { width: 1920, height: 1080 },
            locale: 'en-US',
            // Add browser context options for better stealth
            contextOptions: {
                ignoreHTTPSErrors: true,
                javaScriptEnabled: true,
                bypassCSP: true,
                userAgent: userAgent,
                viewport: { width: 1920, height: 1080 },
                deviceScaleFactor: 1,
                isMobile: false,
                hasTouch: false,
                permissions: ['geolocation'],
                geolocation: { latitude: 40.7128, longitude: -74.0060 }, // NYC coordinates
                locale: 'en-US',
                timezoneId: 'America/New_York',
                extraHTTPHeaders: {
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                },
            },
        },

        browserPoolOptions: {
            useFingerprints: true, // Enable fingerprinting
            fingerprintOptions: {
                fingerprintGeneratorOptions: {
                    browsers: ['chrome'],
                    devices: ['desktop'],
                    operatingSystems: ['windows', 'macos'],
                },
            },
        },

        preNavigationHooks: [
            async ({ page, request }) => {
                // Enhanced stealth mode
                await page.addInitScript(() => {
                    // Override webdriver property
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined,
                    });
                    
                    // Override plugins to look more realistic
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => [
                            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                            { name: 'Native Client', filename: 'internal-nacl-plugin' },
                        ],
                    });
                    
                    // Override permissions
                    const originalQuery = window.navigator.permissions.query;
                    window.navigator.permissions.query = (parameters) => (
                        parameters.name === 'notifications' 
                            ? Promise.resolve({ state: Notification.permission }) 
                            : originalQuery(parameters)
                    );
                    
                    // Chrome specific
                    window.chrome = {
                        runtime: {},
                        loadTimes: function() {},
                        csi: function() {},
                        app: {},
                    };
                    
                    // Override language
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['en-US', 'en'],
                    });
                    
                    // Override hardware concurrency
                    Object.defineProperty(navigator, 'hardwareConcurrency', {
                        get: () => 4,
                    });
                    
                    // Override platform
                    Object.defineProperty(navigator, 'platform', {
                        get: () => 'Win32',
                    });
                    
                    // Override vendor
                    Object.defineProperty(navigator, 'vendor', {
                        get: () => 'Google Inc.',
                    });
                    
                    // Mock WebGL vendor
                    const getParameter = WebGLRenderingContext.prototype.getParameter;
                    WebGLRenderingContext.prototype.getParameter = function(parameter) {
                        if (parameter === 37445) {
                            return 'Intel Inc.';
                        }
                        if (parameter === 37446) {
                            return 'Intel Iris OpenGL Engine';
                        }
                        return getParameter.apply(this, arguments);
                    };
                    
                    // Hide automation indicators
                    ['webdriver', '__driver_evaluate', '__webdriver_evaluate', '__selenium_evaluate', 
                     '__fxdriver_evaluate', '__driver_unwrapped', '__webdriver_unwrapped', 
                     '__selenium_unwrapped', '__fxdriver_unwrapped', '__webdriver_script_function',
                     '__webdriver_script_func', '__webdriver_script_fn', '__fxdriver_script_fn',
                     '__selenium_script_fn', '__webdriver_evaluate_response', '__selenium_evaluate_response',
                     '__webdriver_script_response', '__selenium_script_response'].forEach(prop => {
                        delete window[prop];
                        delete document[prop];
                    });
                });
                
                // Set viewport
                await page.setViewportSize({ width: 1920, height: 1080 });
                
                // Add random delay before navigation
                await page.waitForTimeout(Math.random() * 2000 + 1000);
                
                log.debug(`Navigating to ${request.url}`);
            },
        ],

        postNavigationHooks: [
            async ({ page }) => {
                // Random delay after page load
                await page.waitForTimeout(Math.random() * 3000 + 2000);
                
                // Simulate human-like mouse movement
                await page.mouse.move(
                    Math.random() * 1920,
                    Math.random() * 1080
                );
                
                // Random scroll
                await page.evaluate(() => {
                    window.scrollTo(0, Math.random() * 500);
                });
            },
        ],

        requestHandler: async ({ request, page, crawler, response }) => {
            const { url, userData } = request;
            
            // Check if we got blocked
            if (response && response.status() === 403) {
                log.error(`Blocked with 403 at ${url}`);
                
                // Try to detect and handle captcha
                const hasCaptcha = await page.evaluate(() => {
                    return document.body.textContent.includes('verify') || 
                           document.body.textContent.includes('captcha') ||
                           document.body.textContent.includes('robot');
                });
                
                if (hasCaptcha) {
                    log.warning('Captcha detected, waiting for manual solve...');
                    if (input.debugScreenshots) {
                        await saveScreenshot(page, `captcha-${Date.now()}.png`);
                    }
                    // Wait longer with human interaction simulation
                    await page.waitForTimeout(30000);
                }
                
                return;
            }
            
            log.info(`Processing ${userData.type || 'search'} page: ${url}`);

            try {
                // Add random delays throughout to simulate human behavior
                await page.waitForTimeout(Math.random() * 2000 + 1000);
                
                if (!userData.type || userData.type === 'search') {
                    // Handle search results page
                    log.debug('Waiting for business cards to load...');
                    
                    // Wait for page to be fully loaded
                    await page.waitForLoadState('networkidle', { timeout: 30000 });
                    
                    // Try multiple selectors as Yelp might have different layouts
                    const selectors = [
                        '[data-testid*="serp-ia-card"]',
                        'div[class*="container__"] > div[class*="businessName"]',
                        'div[class*="hoverable"]',
                        'ul li div[class*="container"]',
                        'div[class*="searchResult"]',
                        'div[class*="businessListingContainer"]',
                        'section[aria-label*="search results"]',
                    ];
                    
                    let businessCardsSelector = null;
                    for (const selector of selectors) {
                        try {
                            await page.waitForSelector(selector, { timeout: 5000 });
                            businessCardsSelector = selector;
                            log.debug(`Found business cards with selector: ${selector}`);
                            break;
                        } catch (e) {
                            continue;
                        }
                    }
                    
                    if (!businessCardsSelector) {
                        log.error('Could not find business cards on page');
                        if (input.debugScreenshots) {
                            await saveScreenshot(page, `no-cards-${Date.now()}.png`);
                        }
                        return;
                    }

                    // Simulate human scrolling behavior
                    await page.evaluate(async () => {
                        // Smooth scroll to bottom
                        const scrollStep = 100;
                        const scrollDelay = 100;
                        const bottom = document.body.scrollHeight;
                        
                        for (let i = 0; i < bottom; i += scrollStep) {
                            window.scrollTo(0, i);
                            await new Promise(resolve => setTimeout(resolve, scrollDelay));
                        }
                    });
                    
                    // Wait for lazy-loaded content
                    await page.waitForTimeout(3000);

                    // Extract business listings
                    const businesses = await page.evaluate(() => {
                        const results = [];
                        
                        // Try different link selectors
                        const linkSelectors = [
                            'h3 a[href^="/biz/"]',
                            'a[href^="/biz/"] h3',
                            'a[href*="/biz/"]',
                            '[data-testid*="serp-ia-card"] a',
                        ];
                        
                        for (const selector of linkSelectors) {
                            const links = document.querySelectorAll(selector);
                            if (links.length > 0) {
                                links.forEach(link => {
                                    const href = link.href || link.closest('a')?.href;
                                    const name = link.textContent || link.querySelector('h3')?.textContent || 
                                               link.closest('[data-testid*="serp-ia-card"]')?.querySelector('h3')?.textContent;
                                    
                                    if (href && href.includes('/biz/') && name) {
                                        results.push({
                                            url: href,
                                            name: name.trim(),
                                        });
                                    }
                                });
                                break;
                            }
                        }
                        
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

                    log.info(`Found ${businesses.length} businesses on this page`);

                    // Queue business detail pages with delays
                    for (const business of businesses) {
                        if (businessCount >= maxResults) {
                            log.info(`Reached max results limit: ${maxResults}`);
                            break;
                        }

                        // Add delay between requests
                        await page.waitForTimeout(Math.random() * 3000 + 2000);

                        await crawler.addRequests([{
                            url: business.url,
                            userData: { type: 'detail', businessName: business.name },
                        }]);

                        businessCount++;
                    }

                    // Check for next page
                    if (businessCount < maxResults) {
                        const nextSelectors = [
                            'a[aria-label="Next"]',
                            'a.next-link',
                            '[class*="pagination"] a:has-text("Next")',
                            'a[class*="next"]',
                        ];
                        
                        let nextPageLink = null;
                        for (const selector of nextSelectors) {
                            try {
                                nextPageLink = await page.$eval(selector, el => el?.href);
                                if (nextPageLink) break;
                            } catch (e) {
                                continue;
                            }
                        }

                        if (nextPageLink) {
                            log.info('Found next page, queueing...');
                            // Add significant delay before next page
                            await page.waitForTimeout(Math.random() * 5000 + 5000);
                            
                            await crawler.addRequests([{
                                url: nextPageLink,
                                userData: { type: 'search' },
                            }]);
                        }
                    }

                } else if (userData.type === 'detail') {
                    // Handle business detail page
                    await page.waitForLoadState('networkidle');
                    await page.waitForTimeout(Math.random() * 3000 + 2000);
                    
                    const businessData = await extractBusinessDetails(page);
                    
                    if (businessData) {
                        businessData.yelpUrl = url;
                        businessData.scrapedAt = new Date().toISOString();
                        businessData.emails = [];
                        businessData.phonesFromWebsite = [];
                        businessData.socialLinks = [];
                        
                        await dataset.pushData(businessData);
                        log.info(`Saved business: ${businessData.name}`);
                    }
                }

            } catch (error) {
                log.error(`Error processing ${url}: ${error.message}`);
                
                if (input.debugScreenshots) {
                    await saveScreenshot(page, `error-${Date.now()}.png`);
                }
            }
        },

        failedRequestHandler: async ({ request }, error) => {
            log.error(`Request ${request.url} failed after ${request.retryCount} retries: ${error.message}`);
        },

        // Override the default blocked request behavior
        handleRequestFunction: async ({ request, response }) => {
            if (response && response.status() === 403) {
                log.warning(`Got 403 for ${request.url}, will retry with different strategy`);
                return false; // Don't throw, let it retry
            }
            return true;
        },
    };

    // Only add proxyConfiguration if it exists
    if (proxyConfiguration !== null && proxyConfiguration !== undefined) {
        crawlerOptions.proxyConfiguration = proxyConfiguration;
    }

    const crawler = new PlaywrightCrawler(crawlerOptions);

    return crawler;
}