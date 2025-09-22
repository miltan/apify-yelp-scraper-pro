export const CONSTANTS = {
    // Yelp specific selectors
    YELP_SELECTORS: {
        BUSINESS_CARD: '[data-testid*="serp-ia-card"], .container__09f24__FeTO6',
        BUSINESS_NAME: 'h3 a[href^="/biz/"], a[href^="/biz/"] h3',
        RATING: '[aria-label*="star rating"]',
        REVIEW_COUNT: 'span:has-text("review")',
        PRICE_LEVEL: 'span.priceRange__09f24__mmOuH, [aria-label*="Price range"]',
        CATEGORIES: 'span.css-chan6m, [class*="businessCategories"]',
        NEXT_PAGE: 'a[aria-label="Next"], .pagination-link-next',
        
        // Business detail page selectors
        DETAIL_NAME: 'h1',
        DETAIL_RATING: '[aria-label*="star rating"]',
        DETAIL_REVIEWS: 'a[href*="#reviews"] span',
        DETAIL_PRICE: '[aria-label*="Price range"]',
        DETAIL_CATEGORIES: '[aria-label*="Categories"] a, .categories a',
        DETAIL_PHONE: 'a[href^="tel:"]',
        DETAIL_ADDRESS: 'address',
        DETAIL_WEBSITE: 'a:has-text("Business website"), a[href*="biz_redir"]',
    },

    // Regex patterns for contact extraction
    CONTACT_PATTERNS: {
        EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
        PHONE: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
        SOCIAL: {
            FACEBOOK: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[A-Za-z0-9.]+/gi,
            INSTAGRAM: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[A-Za-z0-9._]+/gi,
            TWITTER: /(?:https?:\/\/)?(?:www\.)?twitter\.com\/[A-Za-z0-9_]+/gi,
            LINKEDIN: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9-]+/gi,
            YOUTUBE: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:channel|user|c)\/[A-Za-z0-9_-]+/gi,
        }
    },

    // Crawl settings
    DEFAULT_TIMEOUT: 60000,
    NAVIGATION_TIMEOUT: 30000,
    REQUEST_TIMEOUT: 10000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,

    // User agents for stealth
    USER_AGENTS: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ],
};