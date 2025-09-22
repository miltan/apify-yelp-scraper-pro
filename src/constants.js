export const CONSTANTS = {
    // Yelp specific selectors - Updated for current Yelp structure
    YELP_SELECTORS: {
        // Search page selectors
        BUSINESS_CARD: '[data-testid*="serp-ia-card"], div[class*="container__"] > div[class*="businessName__"]',
        BUSINESS_NAME: 'h3 a, a h3, div[class*="businessName"] a',
        RATING: '[aria-label*="star rating"], div[aria-label*="rating"]',
        REVIEW_COUNT: 'span:has-text("review"), span:contains("review")',
        PRICE_LEVEL: 'span[class*="priceRange"], span:contains("$")',
        CATEGORIES: 'span[class*="businessCategories"] a, a[class*="category"]',
        NEXT_PAGE: 'a[aria-label="Next"], a[class*="next-link"], a:contains("Next")',
        
        // Business detail page selectors
        DETAIL_NAME: 'h1[class*="heading"], h1',
        DETAIL_RATING: 'div[aria-label*="star rating"], span[aria-label*="rating"]',
        DETAIL_REVIEWS: 'a[href*="#reviews"], span:contains("review")',
        DETAIL_PRICE: 'span[aria-label*="Price range"], span:contains("$")',
        DETAIL_CATEGORIES: 'span[class*="category"] a, a[class*="category"]',
        DETAIL_PHONE: 'a[href^="tel:"], p:contains("(")',
        DETAIL_ADDRESS: 'address, div[class*="address"]',
        DETAIL_WEBSITE: 'a:contains("Business website"), a[href*="biz_redir"], a:contains("Website")',
    },

    // Regex patterns for contact extraction
    CONTACT_PATTERNS: {
        EMAIL: /[a-zA-Z0-9][a-zA-Z0-9._%+-]{0,63}@[a-zA-Z0-9][a-zA-Z0-9.-]{0,62}\.[a-zA-Z]{2,}/gi,
        PHONE: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
        SOCIAL: {
            FACEBOOK: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[A-Za-z0-9.]+/gi,
            INSTAGRAM: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[A-Za-z0-9._]+/gi,
            TWITTER: /(?:https?:\/\/)?(?:www\.)?(twitter|x)\.com\/[A-Za-z0-9_]+/gi,
            LINKEDIN: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9-]+/gi,
            YOUTUBE: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:channel|user|c|@)[A-Za-z0-9_-]+/gi,
        }
    },

    // Crawl settings
    DEFAULT_TIMEOUT: 30000,
    NAVIGATION_TIMEOUT: 30000,
    REQUEST_TIMEOUT: 10000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,

    // User agents for stealth
    USER_AGENTS: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ],
};