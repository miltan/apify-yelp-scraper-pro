# Yelp Business Scraper with Website Contact Enrichment

A powerful Apify Actor that scrapes Yelp business listings and enriches them with contact information extracted from business websites.

## Features

- 🔍 **Yelp Search Scraping**: Extract business data from Yelp search results
- 🌐 **Website Enrichment**: Visit business websites to extract emails, phones, and social media links
- 📊 **Comprehensive Data**: Collect business names, ratings, reviews, addresses, and contact information
- 🔄 **Pagination Support**: Automatically crawl through multiple pages of results
- 🛡️ **Proxy Support**: Use residential or datacenter proxies for better success rates
- 🐛 **Debug Mode**: Capture screenshots on failures for troubleshooting

## Input Configuration

### Basic Search Parameters
- **Search Query**: Business type or name to search (e.g., 'restaurant', 'plumber')
- **Location**: City, state, or address for the search
- **Yelp Search URL**: Alternative to search/location - provide a direct Yelp search URL

### Scraping Options
- **Max Results**: Maximum number of businesses to scrape (1-1000, default: 50)
- **Fetch Contacts from Website**: Enable website contact enrichment (default: true)
- **Contact Page Paths**: Additional paths to check on websites (default: /contact, /about, etc.)

### Performance Settings
- **Use Residential Proxy**: Use premium residential proxies for better success rates
- **Proxy Country Code**: Select proxy location (US, CA, GB, AU, DE, FR)
- **Max Concurrency**: Number of parallel browser sessions (1-10, default: 3)
- **Debug Screenshots**: Capture screenshots on failures

## Output Format

Each scraped business includes:
```json
{
  "scrapedAt": "2025-09-22T13:45:00.000Z",
  "name": "Business Name",
  "categories": ["Category1", "Category2"],
  "rating": 4.5,
  "reviewCount": 150,
  "priceLevel": "$$",
  "phone": "+1-555-123-4567",
  "address": "123 Main St",
  "city": "New York",
  "region": "NY",
  "postalCode": "10001",
  "country": "US",
  "yelpUrl": "https://www.yelp.com/biz/...",
  "website": "https://businesswebsite.com",
  "emails": ["info@business.com"],
  "phonesFromWebsite": ["+1-555-123-4567"],
  "socialLinks": [
    "https://facebook.com/business",
    "https://instagram.com/business"
  ]
}

Use Cases

Lead generation for B2B sales
Market research and competitor analysis
Building business directories
Contact information enrichment
Local business analysis

Best Practices

Start Small: Test with a small number of results first
Use Proxies: Enable residential proxies for better success rates
Respect Rate Limits: Don't set concurrency too high
Monitor Usage: Keep track of compute units consumed

Limitations

Yelp may implement anti-scraping measures
Some websites may block automated access
Contact extraction accuracy depends on website structure
Respect website terms of service

Support
For issues or questions, please create an issue in the repository or contact support.
