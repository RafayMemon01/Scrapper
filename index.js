// ============================================================
// LEAD AUDIT SCRAPER v2.0 - Single File Server
// NEW: Google Maps/GMB, Instagram, Facebook, TikTok, YouTube
// Social: crawl-first, manual override fallback
// Deploy to Railway.app, connect to n8n
// ============================================================

import express from "express";
import cors from "cors";
import axios from "axios";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3500;
const API_KEY = process.env.API_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// --- Auth middleware ---
app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/") return next();
  if (req.headers["x-api-key"] !== API_KEY) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
});

// ============================================================
// UTILITIES
// ============================================================

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
];

function getUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function wait(min = 500, max = 1500) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((r) => setTimeout(r, ms));
}

function clean(text) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

async function fetchPage(url, retries = 2, extraHeaders = {}) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await axios.get(url, {
        timeout: 15000,
        maxRedirects: 5,
        headers: {
          "User-Agent": getUA(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate",
          Connection: "keep-alive",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          ...extraHeaders,
        },
        validateStatus: () => true,
      });
      if (resp.status === 403 || resp.status === 429) {
        if (i < retries) { await wait(2000, 4000); continue; }
        return null;
      }
      if (resp.status >= 400) return null;
      return resp;
    } catch {
      if (i < retries) { await wait(1000, 3000); continue; }
      return null;
    }
  }
  return null;
}

function extractInternalLinks($, pageUrl, domain) {
  const links = [];
  const baseUrl = "https://" + domain;

  $("a[href]").each((_, el) => {
    let href = $(el).attr("href") || "";
    if (/\.(pdf|jpg|jpeg|png|gif|css|js|zip|mp4|svg|webp|ico)$/i.test(href)) return;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;

    if (href.startsWith("/")) {
      href = baseUrl + href;
    } else if (!href.startsWith("http")) {
      return;
    }

    try {
      const linkDomain = new URL(href).hostname.replace(/^www\./, "");
      if (linkDomain === domain || linkDomain === "www." + domain) {
        const normalized = href.split("#")[0].split("?")[0].replace(/\/$/, "");
        if (normalized && !links.includes(normalized)) {
          links.push(normalized);
        }
      }
    } catch {}
  });

  return links;
}

// ============================================================
// SCRAPER 1: WEBSITE CRAWLER (DEEP)
// ============================================================

async function scrapeWebsite(startUrl, maxPages = 15) {
  let domain;
  try {
    domain = new URL(startUrl).hostname.replace(/^www\./, "");
  } catch {
    return { error: "Invalid URL", url: startUrl, pages: [] };
  }

  const visited = new Set();
  const pages = [];
  const allInternalLinks = new Set();
  const queue = [startUrl];
  const allHtmlPages = [];

  visited.add(startUrl.replace(/\/$/, ""));

  while (queue.length > 0 && pages.length < maxPages) {
    const currentUrl = queue.shift();
    if (pages.length > 0) await wait(600, 1200);

    console.log("  Crawling (" + (pages.length + 1) + "/" + maxPages + "): " + currentUrl);

    const resp = await fetchPage(currentUrl, 1);
    if (!resp || !resp.data) continue;

    const contentType = resp.headers["content-type"] || "";
    if (!contentType.includes("text/html")) continue;

    const html = resp.data;
    const $ = cheerio.load(html);
    const isHomepage = currentUrl === startUrl;

    const pageData = parsePage($, currentUrl, domain, isHomepage);
    pages.push(pageData);
    allHtmlPages.push({ url: currentUrl, html, headers: resp.headers || {} });

    const linksOnPage = extractInternalLinks($, currentUrl, domain);
    for (const link of linksOnPage) {
      allInternalLinks.add(link);
      const normalized = link.replace(/\/$/, "");
      if (!visited.has(normalized)) {
        visited.add(normalized);
        queue.push(link);
      }
    }
  }

  const totalWords = pages.reduce((s, p) => s + p.wordCount, 0);
  const totalImages = pages.reduce((s, p) => s + p.images.total, 0);
  const missingAlt = pages.reduce((s, p) => s + p.images.withoutAlt, 0);
  const allUrls = [...allInternalLinks, ...pages.map((p) => p.url)].map((u) => u.toLowerCase());

  return {
    url: startUrl,
    domain,
    totalPages: pages.length,
    internalLinksFound: allInternalLinks.size,
    summary: {
      totalWords,
      avgWordsPerPage: pages.length ? Math.round(totalWords / pages.length) : 0,
      totalImages,
      imagesWithoutAlt: missingAlt,
      pagesWithoutMeta: pages.filter((p) => !p.metaDescription || p.metaDescription.length < 10).length,
      pagesWithoutH1: pages.filter((p) => p.h1.length === 0).length,
    },
    keyPages: {
      about: allUrls.some((u) => u.includes("/about")),
      contact: allUrls.some((u) => u.includes("/contact")),
      blog: allUrls.some((u) => u.includes("/blog") || u.includes("/news")),
      privacy: allUrls.some((u) => u.includes("/privacy")),
      services: allUrls.some((u) => u.includes("/service")),
      portfolio: allUrls.some((u) => u.includes("/portfolio") || u.includes("/work") || u.includes("/case")),
      pricing: allUrls.some((u) => u.includes("/pricing") || u.includes("/plans")),
      faq: allUrls.some((u) => u.includes("/faq")),
      careers: allUrls.some((u) => u.includes("/career") || u.includes("/jobs")),
      testimonials: allUrls.some((u) => u.includes("/testimonial") || u.includes("/review")),
    },
    pages: pages.map((p) => ({
      url: p.url,
      title: p.title,
      metaDescription: p.metaDescription,
      h1: p.h1,
      h2: p.h2.slice(0, 8),
      h3: p.h3.slice(0, 5),
      wordCount: p.wordCount,
      images: p.images,
      isHomepage: p.isHomepage,
    })),
    _allHtmlPages: allHtmlPages,
  };
}

function parsePage($, url, domain, isHomepage) {
  const title = clean($("title").text());
  const metaDesc = $('meta[name="description"]').attr("content") || "";
  const h1 = $("h1").map((_, el) => clean($(el).text())).get().filter((t) => t);
  const h2 = $("h2").map((_, el) => clean($(el).text())).get().filter((t) => t);
  const h3 = $("h3").map((_, el) => clean($(el).text())).get().filter((t) => t);

  const $clone = cheerio.load($.html());
  $clone("script, style, noscript, nav, footer, header, aside").remove();
  const bodyText = clean($clone("main").text() || $clone("article").text() || $clone("body").text());
  const wordCount = bodyText.split(/\s+/).filter((w) => w).length;

  const imgs = $("img");
  let withoutAlt = 0;
  imgs.each((_, img) => {
    if (!$(img).attr("alt")?.trim()) withoutAlt++;
  });

  return {
    url, title, metaDescription: metaDesc, h1, h2, h3, wordCount,
    content: bodyText.substring(0, isHomepage ? 2000 : 1000),
    images: { total: imgs.length, withoutAlt }, isHomepage,
  };
}

// ============================================================
// SCRAPER 2: TECH STACK DETECTION
// ============================================================

function detectTechStack(htmlArray, headers = {}) {
  const combinedHtml = htmlArray.map((p) => p.html).join("\n");
  const found = [];
  const checks = [
    { name: "WordPress", cat: "cms", p: /wp-content|wp-includes|wordpress/i },
    { name: "Shopify", cat: "cms", p: /cdn\.shopify\.com|shopify/i },
    { name: "Wix", cat: "cms", p: /wix\.com|wixsite|parastorage/i },
    { name: "Squarespace", cat: "cms", p: /squarespace\.com|sqsp\.com/i },
    { name: "Webflow", cat: "cms", p: /webflow\.com|website-files\.com/i },
    { name: "Drupal", cat: "cms", p: /drupal\.js|sites\/default\/files/i },
    { name: "HubSpot CMS", cat: "cms", p: /hs-scripts\.com|hubspot\.net/i },
    { name: "Google Analytics 4", cat: "analytics", p: /gtag.*G-|google-analytics\.com/i },
    { name: "Google Tag Manager", cat: "analytics", p: /googletagmanager\.com\/gtm|GTM-/i },
    { name: "Facebook Pixel", cat: "analytics", p: /fbevents\.js|fbq\(|facebook\.com\/tr/i },
    { name: "Hotjar", cat: "analytics", p: /hotjar\.com|static\.hotjar/i },
    { name: "Microsoft Clarity", cat: "analytics", p: /clarity\.ms/i },
    { name: "HubSpot", cat: "marketing", p: /hs-scripts\.com|hbspt\.forms/i },
    { name: "Mailchimp", cat: "marketing", p: /mailchimp\.com|list-manage\.com/i },
    { name: "Intercom", cat: "marketing", p: /intercom\.io|widget\.intercom/i },
    { name: "Crisp Chat", cat: "marketing", p: /crisp\.chat/i },
    { name: "Tawk.to", cat: "marketing", p: /tawk\.to/i },
    { name: "Calendly", cat: "marketing", p: /calendly\.com/i },
    { name: "LiveChat", cat: "marketing", p: /livechatinc\.com|livechat/i },
    { name: "React", cat: "framework", p: /react\.production|react-root|reactroot/i },
    { name: "Next.js", cat: "framework", p: /__NEXT_DATA__|_next\/static/i },
    { name: "Vue.js", cat: "framework", p: /vue\.js|vue\.min\.js/i },
    { name: "jQuery", cat: "framework", p: /jquery[\.-]\d|jquery\.min\.js/i },
    { name: "Bootstrap", cat: "framework", p: /bootstrap\.min\.(css|js)/i },
    { name: "Tailwind CSS", cat: "framework", p: /tailwindcss|tailwind\.min/i },
    { name: "Elementor", cat: "framework", p: /elementor/i },
    { name: "WooCommerce", cat: "ecommerce", p: /woocommerce|wc-cart/i },
    { name: "Stripe", cat: "ecommerce", p: /js\.stripe\.com/i },
    { name: "PayPal", cat: "ecommerce", p: /paypal\.com\/sdk|paypalobjects/i },
  ];

  for (const c of checks) {
    if (c.p.test(combinedHtml)) found.push({ name: c.name, category: c.cat });
  }

  const firstHeaders = htmlArray[0]?.headers || headers;
  const server = (firstHeaders["server"] || "").toLowerCase();
  if (server.includes("cloudflare")) found.push({ name: "Cloudflare", category: "infrastructure" });
  if (server.includes("nginx")) found.push({ name: "Nginx", category: "infrastructure" });
  if (server.includes("apache")) found.push({ name: "Apache", category: "infrastructure" });
  if (firstHeaders["x-vercel-id"]) found.push({ name: "Vercel", category: "infrastructure" });

  const firstHtml = htmlArray[0]?.html || "";
  const seoChecks = {
    hasSSL: true,
    hasMobileViewport: /<meta[^>]*name=["']viewport["']/i.test(firstHtml),
    hasSchemaMarkup: firstHtml.includes("schema.org") || firstHtml.includes("application/ld+json"),
    hasFavicon: /<link[^>]*rel=["'](?:shortcut )?icon["']/i.test(firstHtml),
    hasOpenGraph: /<meta[^>]*property=["']og:title["']/i.test(firstHtml),
    hasCanonical: /<link[^>]*rel=["']canonical["']/i.test(firstHtml),
    hasCookieConsent: /cookie[\s-]?(consent|notice|banner)|gdpr|cookiebot|onetrust/i.test(firstHtml),
  };

  return { technologies: found, seoChecks };
}

// ============================================================
// SCRAPER 3: SOCIAL MEDIA FINDER (from crawled pages)
// ============================================================

function findSocialLinks(htmlArray) {
  const social = {};
  const platforms = [
    { name: "facebook", p: /href=["'](https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|share|dialog)[^"'#\s]+)/i },
    { name: "instagram", p: /href=["'](https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|explore)[^"'#\s]+)/i },
    { name: "twitter", p: /href=["'](https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!intent|share)[^"'#\s]+)/i },
    { name: "linkedin", p: /href=["'](https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"'#\s]+)/i },
    { name: "youtube", p: /href=["'](https?:\/\/(?:www\.)?youtube\.com\/[^"'#\s]+)/i },
    { name: "tiktok", p: /href=["'](https?:\/\/(?:www\.)?tiktok\.com\/@[^"'#\s]+)/i },
    { name: "pinterest", p: /href=["'](https?:\/\/(?:www\.)?pinterest\.com\/[^"'#\s]+)/i },
    { name: "yelp", p: /href=["'](https?:\/\/(?:www\.)?yelp\.com\/biz\/[^"'#\s]+)/i },
    { name: "whatsapp", p: /href=["'](https?:\/\/(?:api\.)?whatsapp\.com\/[^"'#\s]+)/i },
  ];

  for (const pageObj of htmlArray) {
    for (const pl of platforms) {
      if (social[pl.name]) continue;
      const match = pageObj.html.match(pl.p);
      if (match) {
        social[pl.name] = match[1].split('"')[0].split("'")[0].replace(/\/$/, "");
      }
    }
  }

  const allPlatforms = platforms.map((p) => p.name);
  return {
    found: social,
    missing: allPlatforms.filter((p) => !social[p]),
    totalFound: Object.keys(social).length,
    totalChecked: allPlatforms.length,
  };
}

// ============================================================
// SCRAPER 4: PAGESPEED
// ============================================================

async function fetchPageSpeed(targetUrl) {
  const urlsToTry = [targetUrl];
  try {
    const domain = new URL(targetUrl).hostname;
    urlsToTry.push("https://" + domain + "/us");
  } catch {}

  for (const testUrl of urlsToTry) {
    await wait(2000, 3000);
    try {
      const psKey = process.env.PAGESPEED_API_KEY ? `&key=${process.env.PAGESPEED_API_KEY}` : "";
      const apiUrl = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=" +
        encodeURIComponent(testUrl) +
        "&strategy=mobile&category=PERFORMANCE&category=ACCESSIBILITY&category=BEST_PRACTICES&category=SEO" +
        psKey;

      console.log("  PageSpeed testing: " + testUrl);
      const resp = await axios.get(apiUrl, { timeout: 45000 });

      if (resp.status === 429) {
        console.log("  Rate limited, waiting 5s...");
        await wait(5000, 7000);
        const retry = await axios.get(apiUrl, { timeout: 45000 });
        if (retry.status !== 200) continue;
        return parsePageSpeed(retry.data, testUrl);
      }
      if (resp.status !== 200) continue;
      return parsePageSpeed(resp.data, testUrl);
    } catch (err) {
      if (err.response?.status === 429) {
        await wait(5000, 7000);
        continue;
      }
      continue;
    }
  }

  return {
    testedUrl: targetUrl,
    scores: { performance: null, accessibility: null, bestPractices: null, seo: null },
    vitals: {}, opportunities: [],
    error: "PageSpeed unavailable (rate limited)",
  };
}

function parsePageSpeed(data, testedUrl) {
  const cats = data.lighthouseResult?.categories || {};
  const audits = data.lighthouseResult?.audits || {};

  const scores = {
    performance: cats.performance ? Math.round(cats.performance.score * 100) : null,
    accessibility: cats.accessibility ? Math.round(cats.accessibility.score * 100) : null,
    bestPractices: cats["best-practices"] ? Math.round(cats["best-practices"].score * 100) : null,
    seo: cats.seo ? Math.round(cats.seo.score * 100) : null,
  };

  const vitals = {
    lcp: audits["largest-contentful-paint"]?.displayValue || "N/A",
    tbt: audits["total-blocking-time"]?.displayValue || "N/A",
    cls: audits["cumulative-layout-shift"]?.displayValue || "N/A",
    fcp: audits["first-contentful-paint"]?.displayValue || "N/A",
    speedIndex: audits["speed-index"]?.displayValue || "N/A",
  };

  const opportunities = [];
  const oppIds = [
    "render-blocking-resources", "uses-optimized-images", "uses-webp-images",
    "uses-text-compression", "offscreen-images", "unminified-css",
    "unused-css-rules", "unused-javascript", "server-response-time",
  ];
  for (const id of oppIds) {
    const a = audits[id];
    if (a && a.score !== null && a.score < 1) {
      opportunities.push({ title: a.title, savings: a.displayValue || "", impact: a.score < 0.5 ? "high" : "medium" });
    }
  }

  return { testedUrl, scores, vitals, opportunities: opportunities.slice(0, 8) };
}

// ============================================================
// SCRAPER 5: GOOGLE MAPS / GMB
// Searches by company name + location
// ============================================================

async function scrapeGoogleMaps(companyName, location) {
  const result = {
    found: false,
    name: null,
    rating: null,
    reviewCount: null,
    category: null,
    address: null,
    phone: null,
    website: null,
    hours: null,
    isClaimed: null,
    hasOwnerResponses: null,
    description: null,
    photoCount: null,
    error: null,
  };

  try {
    const query = encodeURIComponent(companyName + (location ? " " + location : ""));
    const searchUrl = "https://www.google.com/maps/search/" + query;

    console.log("  Google Maps searching: " + companyName);
    await wait(1000, 2000);

    const resp = await fetchPage(searchUrl, 2, {
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.google.com/",
    });

    if (!resp || !resp.data) {
      result.error = "Could not fetch Google Maps";
      return result;
    }

    const html = resp.data;

    // Extract rating
    const ratingMatch = html.match(/(\d\.\d)\s*(?:stars?|out of 5|\([\d,]+\s*reviews?\))/i)
      || html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/i)
      || html.match(/rated\s+([\d.]+)\s+(?:out of|\/)\s*5/i);
    if (ratingMatch) result.rating = parseFloat(ratingMatch[1]);

    // Extract review count
    const reviewMatch = html.match(/([\d,]+)\s*(?:Google\s+)?reviews?/i)
      || html.match(/"reviewCount"\s*:\s*"?([\d,]+)"?/i);
    if (reviewMatch) result.reviewCount = parseInt(reviewMatch[1].replace(/,/g, ""));

    // Extract business name from title or structured data
    const nameMatch = html.match(/<title>([^<]+?)\s*[-|]\s*Google Maps/i)
      || html.match(/"name"\s*:\s*"([^"]{3,80})"/);
    if (nameMatch) result.name = clean(nameMatch[1]);

    // Extract category
    const catMatch = html.match(/aria-label="([^"]+?)"[^>]*data-value="category"/i)
      || html.match(/"category"\s*:\s*"([^"]+)"/i)
      || html.match(/jslog[^>]*>\s*<span[^>]*>\s*([A-Za-z\s&]+)\s*<\/span>\s*<\/div>\s*<div[^>]*class="[^"]*rating/i);
    if (catMatch) result.category = clean(catMatch[1]);

    // Extract address
    const addrMatch = html.match(/"streetAddress"\s*:\s*"([^"]+)"/i)
      || html.match(/data-tooltip="Copy address"[^>]*>\s*([^<]{5,100})<\/span>/i);
    if (addrMatch) result.address = clean(addrMatch[1]);

    // Extract phone
    const phoneMatch = html.match(/tel:([\d\s\-\+\(\)]{7,20})/i)
      || html.match(/"telephone"\s*:\s*"([^"]+)"/i);
    if (phoneMatch) result.phone = clean(phoneMatch[1]);

    // Extract website from listing
    const websiteMatch = html.match(/data-tooltip="Open website"[^>]*href="([^"]+)"/i)
      || html.match(/"url"\s*:\s*"(https?:\/\/[^"]+)"/i);
    if (websiteMatch) result.website = websiteMatch[1];

    // Claimed status: unclaimed listings show "Claim this business"
    result.isClaimed = !html.includes("Claim this business") && !html.includes("Own this business");

    // Owner responses: check if "Owner" appears near review text
    result.hasOwnerResponses = /Response from the owner|Owner's reply|replied to this review/i.test(html);

    // Description
    const descMatch = html.match(/"description"\s*:\s*"([^"]{10,500})"/i);
    if (descMatch) result.description = clean(descMatch[1]);

    // Photo count
    const photoMatch = html.match(/([\d,]+)\s*photos?/i);
    if (photoMatch) result.photoCount = parseInt(photoMatch[1].replace(/,/g, ""));

    // Consider found if we got at least a rating or name
    result.found = !!(result.rating || result.name || result.reviewCount);

  } catch (err) {
    result.error = "Google Maps scrape failed: " + err.message;
  }

  return result;
}

// ============================================================
// SCRAPER 6: INSTAGRAM PUBLIC PROFILE
// ============================================================

async function scrapeInstagram(profileUrl) {
  const result = {
    url: profileUrl,
    found: false,
    username: null,
    followers: null,
    following: null,
    postCount: null,
    bio: null,
    isVerified: false,
    isBusinessAccount: false,
    error: null,
  };

  if (!profileUrl) {
    result.error = "No Instagram URL provided";
    return result;
  }

  try {
    // Extract username from URL
    const usernameMatch = profileUrl.match(/instagram\.com\/([^/?#]+)/i);
    if (usernameMatch) result.username = usernameMatch[1];

    console.log("  Instagram scraping: " + (result.username || profileUrl));
    await wait(1000, 2000);

    const resp = await fetchPage(profileUrl, 2, {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Referer": "https://www.instagram.com/",
      "Sec-Fetch-Site": "same-origin",
    });

    if (!resp || !resp.data) {
      result.error = "Could not fetch Instagram profile";
      return result;
    }

    const html = resp.data;

    // Try extracting from meta tags first (most reliable)
    const metaDesc = html.match(/<meta\s+(?:name|property)="description"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+(?:name|property)="description"/i);

    if (metaDesc) {
      const desc = metaDesc[1];
      // Instagram meta format: "123K Followers, 456 Following, 789 Posts - See Instagram photos..."
      const followersMatch = desc.match(/([\d,.]+[KkMm]?)\s*Followers/i);
      const followingMatch = desc.match(/([\d,.]+[KkMm]?)\s*Following/i);
      const postsMatch = desc.match(/([\d,.]+[KkMm]?)\s*Posts/i);

      if (followersMatch) result.followers = followersMatch[1];
      if (followingMatch) result.following = followingMatch[1];
      if (postsMatch) result.postCount = postsMatch[1];
    }

    // Try JSON data embedded in page
    const jsonMatch = html.match(/"edge_followed_by":\{"count":(\d+)\}/);
    const jsonFollowMatch = html.match(/"edge_follow":\{"count":(\d+)\}/);
    const jsonPostMatch = html.match(/"edge_owner_to_timeline_media":\{"count":(\d+)/);

    if (jsonMatch) result.followers = jsonMatch[1];
    if (jsonFollowMatch) result.following = jsonFollowMatch[1];
    if (jsonPostMatch) result.postCount = jsonPostMatch[1];

    // Bio
    const bioMatch = html.match(/"biography":"([^"]+)"/i)
      || html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
    if (bioMatch) result.bio = clean(bioMatch[1].replace(/\\n/g, " "));

    // Verified
    result.isVerified = html.includes('"is_verified":true') || html.includes("verified_icon");

    // Business account
    result.isBusinessAccount = html.includes('"is_business_account":true')
      || html.includes('"business_category_name"');

    result.found = !!(result.followers || result.postCount);

  } catch (err) {
    result.error = "Instagram scrape failed: " + err.message;
  }

  return result;
}

// ============================================================
// SCRAPER 7: FACEBOOK PUBLIC PAGE
// ============================================================

async function scrapeFacebook(pageUrl) {
  const result = {
    url: pageUrl,
    found: false,
    pageName: null,
    likes: null,
    followers: null,
    category: null,
    about: null,
    isVerified: false,
    error: null,
  };

  if (!pageUrl) {
    result.error = "No Facebook URL provided";
    return result;
  }

  try {
    console.log("  Facebook scraping: " + pageUrl);
    await wait(1000, 2000);

    // Use mbasic.facebook.com for simpler HTML (less JS blocking)
    let mbasicUrl = pageUrl
      .replace("https://www.facebook.com", "https://mbasic.facebook.com")
      .replace("https://facebook.com", "https://mbasic.facebook.com");

    const resp = await fetchPage(mbasicUrl, 2, {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.facebook.com/",
    });

    if (!resp || !resp.data) {
      result.error = "Could not fetch Facebook page";
      return result;
    }

    const html = resp.data;
    const $ = cheerio.load(html);

    // Page name from title
    const titleText = clean($("title").text());
    if (titleText && !titleText.toLowerCase().includes("facebook")) {
      result.pageName = titleText.replace(/\s*\|\s*Facebook.*$/i, "").trim();
    }

    // Likes and followers from meta description or page text
    const metaDesc = $('meta[name="description"]').attr("content") || "";
    const likesMatch = html.match(/([\d,]+)\s*(?:people\s+)?likes?/i);
    const followersMatch = html.match(/([\d,]+)\s*(?:people\s+)?followers?/i);

    if (likesMatch) result.likes = likesMatch[1];
    if (followersMatch) result.followers = followersMatch[1];

    // Category
    const catMatch = html.match(/category[^>]*>([^<]{3,50})<\/a>/i)
      || html.match(/"contentType"\s*:\s*"([^"]+)"/i);
    if (catMatch) result.category = clean(catMatch[1]);

    // About section
    const aboutEl = $('[data-key="tab_about"]').text()
      || $("div#pages_msite_body_contents").text()
      || "";
    if (aboutEl) result.about = clean(aboutEl).substring(0, 300);
    if (!result.about && metaDesc) result.about = clean(metaDesc).substring(0, 300);

    // Verified
    result.isVerified = html.includes("VerifiedBadge") || html.includes("verified_account");

    result.found = !!(result.pageName || result.likes || result.followers);

  } catch (err) {
    result.error = "Facebook scrape failed: " + err.message;
  }

  return result;
}

// ============================================================
// SCRAPER 8: TIKTOK PUBLIC PROFILE
// ============================================================

async function scrapeTikTok(profileUrl) {
  const result = {
    url: profileUrl,
    found: false,
    username: null,
    displayName: null,
    followers: null,
    following: null,
    totalLikes: null,
    bio: null,
    isVerified: false,
    error: null,
  };

  if (!profileUrl) {
    result.error = "No TikTok URL provided";
    return result;
  }

  try {
    const usernameMatch = profileUrl.match(/tiktok\.com\/@([^/?#]+)/i);
    if (usernameMatch) result.username = usernameMatch[1];

    console.log("  TikTok scraping: " + (result.username || profileUrl));
    await wait(1500, 2500);

    const resp = await fetchPage(profileUrl, 2, {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Referer": "https://www.tiktok.com/",
    });

    if (!resp || !resp.data) {
      result.error = "Could not fetch TikTok profile";
      return result;
    }

    const html = resp.data;

    // TikTok embeds user data in __UNIVERSAL_DATA__ or __NEXT_DATA__
    const universalMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>({.+?})<\/script>/s)
      || html.match(/window\.__INIT_PROPS__\s*=\s*({.+?});<\/script>/s);

    if (universalMatch) {
      try {
        const jsonData = JSON.parse(universalMatch[1]);
        // Navigate TikTok's nested structure
        const userInfo = jsonData?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo
          || jsonData?.userInfo
          || jsonData?.user;

        if (userInfo) {
          const stats = userInfo.stats || userInfo.statsV2 || {};
          const user = userInfo.user || userInfo;

          result.displayName = user.nickname || user.displayName || null;
          result.bio = clean(user.signature || user.bio || "");
          result.isVerified = user.verified || false;
          result.followers = stats.followerCount || stats.fans || null;
          result.following = stats.followingCount || null;
          result.totalLikes = stats.heartCount || stats.heart || stats.diggCount || null;
        }
      } catch {}
    }

    // Fallback: meta tag parsing
    if (!result.followers) {
      const metaDesc = html.match(/<meta\s+(?:name|property)="description"\s+content="([^"]+)"/i);
      if (metaDesc) {
        const desc = metaDesc[1];
        const followersMatch = desc.match(/([\d,.]+[KkMm]?)\s*Followers/i);
        const likesMatch = desc.match(/([\d,.]+[KkMm]?)\s*Likes/i);
        if (followersMatch) result.followers = followersMatch[1];
        if (likesMatch) result.totalLikes = likesMatch[1];
      }
    }

    // Display name from og:title
    if (!result.displayName) {
      const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
      if (ogTitle) result.displayName = clean(ogTitle[1].replace(/\(@[^)]+\)/g, "").replace(/\s*-\s*TikTok.*$/i, ""));
    }

    result.found = !!(result.followers || result.displayName);

  } catch (err) {
    result.error = "TikTok scrape failed: " + err.message;
  }

  return result;
}

// ============================================================
// SCRAPER 9: YOUTUBE CHANNEL (via free YouTube Data API v3)
// Env var required: YOUTUBE_API_KEY
// ============================================================

async function scrapeYouTube(channelUrl) {
  const result = {
    url: channelUrl,
    found: false,
    channelName: null,
    subscribers: null,
    totalViews: null,
    videoCount: null,
    description: null,
    country: null,
    publishedAt: null,
    error: null,
  };

  if (!channelUrl) {
    result.error = "No YouTube URL provided";
    return result;
  }

  try {
    console.log("  YouTube scraping: " + channelUrl);

    // First try to get channel ID from the URL directly
    let channelId = null;
    let handle = null;

    const channelIdMatch = channelUrl.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/i);
    const handleMatch = channelUrl.match(/youtube\.com\/@([^/?#]+)/i);
    const customMatch = channelUrl.match(/youtube\.com\/c\/([^/?#]+)/i)
      || channelUrl.match(/youtube\.com\/user\/([^/?#]+)/i);

    if (channelIdMatch) {
      channelId = channelIdMatch[1];
    } else if (handleMatch) {
      handle = handleMatch[1];
    } else if (customMatch) {
      handle = customMatch[1];
    }

    // If we have an API key, use YouTube Data API
    if (YOUTUBE_API_KEY) {
      // Resolve handle to channel ID if needed
      if (!channelId && handle) {
        const searchResp = await axios.get(
          "https://www.googleapis.com/youtube/v3/search", {
            params: {
              part: "snippet",
              q: handle,
              type: "channel",
              maxResults: 1,
              key: YOUTUBE_API_KEY,
            },
            timeout: 10000,
          }
        );
        if (searchResp.data?.items?.[0]) {
          channelId = searchResp.data.items[0].snippet.channelId;
        }
      }

      if (channelId) {
        const statsResp = await axios.get(
          "https://www.googleapis.com/youtube/v3/channels", {
            params: {
              part: "snippet,statistics",
              id: channelId,
              key: YOUTUBE_API_KEY,
            },
            timeout: 10000,
          }
        );

        const channel = statsResp.data?.items?.[0];
        if (channel) {
          const snippet = channel.snippet || {};
          const stats = channel.statistics || {};

          result.channelName = snippet.title || null;
          result.description = clean((snippet.description || "").substring(0, 300));
          result.country = snippet.country || null;
          result.publishedAt = snippet.publishedAt || null;
          result.subscribers = stats.hiddenSubscriberCount ? "Hidden" : (stats.subscriberCount || null);
          result.totalViews = stats.viewCount || null;
          result.videoCount = stats.videoCount || null;
          result.found = true;
          return result;
        }
      }
    }

    // Fallback: scrape the page HTML (no API key needed)
    await wait(1000, 2000);
    const resp = await fetchPage(channelUrl, 2, {
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.youtube.com/",
    });

    if (!resp || !resp.data) {
      result.error = "Could not fetch YouTube channel";
      return result;
    }

    const html = resp.data;

    // Channel name from meta
    const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (ogTitle) result.channelName = clean(ogTitle[1]);

    // Subscriber count from page data
    const subMatch = html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/i)
      || html.match(/([\d,.]+[KkMm]?)\s*subscribers/i);
    if (subMatch) result.subscribers = subMatch[1];

    // Description
    const descMatch = html.match(/"description":\{"simpleText":"([^"]+)"/i);
    if (descMatch) result.description = clean(descMatch[1].substring(0, 300));

    // Video count
    const videoMatch = html.match(/"videoCountText":\{"runs":\[\{"text":"(\d+)"/i)
      || html.match(/([\d,]+)\s*videos/i);
    if (videoMatch) result.videoCount = videoMatch[1];

    result.found = !!(result.channelName || result.subscribers);

  } catch (err) {
    result.error = "YouTube scrape failed: " + err.message;
  }

  return result;
}

// ============================================================
// SOCIAL PROFILE ORCHESTRATOR
// Crawl-first, manual override fallback
// ============================================================

async function scrapeSocialProfiles(crawledSocialLinks, manualOverrides = {}) {
  // Merge: manual overrides take priority over crawled links
  const links = { ...crawledSocialLinks, ...manualOverrides };

  console.log("\n[SOCIAL] Scraping public profiles...");
  console.log("  Available links:", Object.keys(links).join(", ") || "none");

  const results = {};

  // Run all scrapers in parallel for speed
  const tasks = [];

  if (links.instagram) {
    tasks.push(
      scrapeInstagram(links.instagram).then((r) => { results.instagram = r; })
    );
  } else {
    results.instagram = { found: false, error: "No Instagram URL found" };
  }

  if (links.facebook) {
    tasks.push(
      scrapeFacebook(links.facebook).then((r) => { results.facebook = r; })
    );
  } else {
    results.facebook = { found: false, error: "No Facebook URL found" };
  }

  if (links.tiktok) {
    tasks.push(
      scrapeTikTok(links.tiktok).then((r) => { results.tiktok = r; })
    );
  } else {
    results.tiktok = { found: false, error: "No TikTok URL found" };
  }

  if (links.youtube) {
    tasks.push(
      scrapeYouTube(links.youtube).then((r) => { results.youtube = r; })
    );
  } else {
    results.youtube = { found: false, error: "No YouTube URL found" };
  }

  await Promise.all(tasks);

  const profilesFound = Object.values(results).filter((r) => r.found).length;
  console.log("  Social profiles scraped: " + profilesFound + "/" + Object.keys(results).length);

  return results;
}

// ============================================================
// MAIN ENDPOINT: FULL AUDIT v2
// ============================================================

app.post("/scrape/full-audit", async (req, res) => {
  const { url, companyName, location, socialOverrides } = req.body;

  // url and companyName are required; location and socialOverrides are optional
  if (!url || !companyName) {
    return res.status(400).json({ error: "Both url and companyName are required" });
  }

  console.log("\n" + "=".repeat(50));
  console.log("[AUDIT] Starting: " + companyName + " (" + url + ")");
  if (location) console.log("[AUDIT] Location: " + location);
  console.log("=".repeat(50));
  const startTime = Date.now();

  try {
    // STEP 1: Website crawl
    console.log("\n[1/5] Crawling website...");
    const websiteData = await scrapeWebsite(url, 15);

    // STEP 2: Tech stack + social link detection
    let techData = { technologies: [], seoChecks: {} };
    let crawledSocialLinks = {};
    const htmlPages = websiteData._allHtmlPages || [];

    if (htmlPages.length > 0) {
      console.log("\n[2/5] Detecting tech stack and social links...");
      techData = detectTechStack(htmlPages);
      const socialResult = findSocialLinks(htmlPages);
      crawledSocialLinks = socialResult.found || {};

      // Attach social summary to website data
      websiteData.socialMedia = {
        found: socialResult.found,
        missing: socialResult.missing,
        totalFound: socialResult.totalFound,
        totalChecked: socialResult.totalChecked,
      };
    }

    delete websiteData._allHtmlPages;

    // STEP 3: Google Maps / GMB
    console.log("\n[3/5] Fetching Google Maps / GMB data...");
    const googleMapsData = await scrapeGoogleMaps(companyName, location || "");

    // STEP 4: Social profile scraping
    // socialOverrides from request body allows manual URL input
    console.log("\n[4/5] Scraping social media profiles...");
    const socialProfilesData = await scrapeSocialProfiles(
      crawledSocialLinks,
      socialOverrides || {}
    );

    // STEP 5: PageSpeed
    console.log("\n[5/5] Fetching PageSpeed scores...");
    const pageSpeedData = await fetchPageSpeed(url);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n" + "=".repeat(50));
    console.log("[AUDIT] Done in " + elapsed + "s");
    console.log("  Pages crawled:   " + websiteData.totalPages);
    console.log("  Techs detected:  " + techData.technologies.length);
    console.log("  GMB found:       " + (googleMapsData.found ? "Yes" : "No"));
    console.log("  Social profiles: " + Object.values(socialProfilesData).filter((r) => r.found).length);
    console.log("=".repeat(50) + "\n");

    res.json({
      success: true,
      data: {
        meta: {
          companyName,
          url,
          location: location || null,
          scrapedAt: new Date().toISOString(),
          durationSeconds: parseFloat(elapsed),
        },
        website: websiteData,
        techStack: techData,
        googleMaps: googleMapsData,
        socialProfiles: socialProfilesData,
        pageSpeed: pageSpeedData,
      },
    });

  } catch (err) {
    console.error("[AUDIT] Error: " + err.message);
    res.json({ success: false, error: err.message, data: null });
  }
});

// ============================================================
// INDIVIDUAL ENDPOINTS (for testing / n8n granular use)
// ============================================================

app.post("/scrape/website", async (req, res) => {
  try {
    const data = await scrapeWebsite(req.body.url, req.body.maxPages || 15);
    delete data._allHtmlPages;
    res.json({ success: true, data });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post("/scrape/google-maps", async (req, res) => {
  const { companyName, location } = req.body;
  if (!companyName) return res.status(400).json({ error: "companyName is required" });
  try {
    const data = await scrapeGoogleMaps(companyName, location || "");
    res.json({ success: true, data });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post("/scrape/instagram", async (req, res) => {
  if (!req.body.url) return res.status(400).json({ error: "url is required" });
  try {
    const data = await scrapeInstagram(req.body.url);
    res.json({ success: true, data });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post("/scrape/facebook", async (req, res) => {
  if (!req.body.url) return res.status(400).json({ error: "url is required" });
  try {
    const data = await scrapeFacebook(req.body.url);
    res.json({ success: true, data });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post("/scrape/tiktok", async (req, res) => {
  if (!req.body.url) return res.status(400).json({ error: "url is required" });
  try {
    const data = await scrapeTikTok(req.body.url);
    res.json({ success: true, data });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post("/scrape/youtube", async (req, res) => {
  if (!req.body.url) return res.status(400).json({ error: "url is required" });
  try {
    const data = await scrapeYouTube(req.body.url);
    res.json({ success: true, data });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post("/scrape/pagespeed", async (req, res) => {
  try {
    const data = await fetchPageSpeed(req.body.url);
    res.json({ success: true, data });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ============================================================
// REPORT GENERATOR ENDPOINT
// ============================================================

app.post("/generate/report", async (req, res) => {
  try {
    const auditData = req.body;
    if (!auditData || !auditData.lead) {
      return res.status(400).json({ error: "Invalid audit data. Must include 'lead' object." });
    }

    console.log("[REPORT] Generating docx for: " + (auditData.lead.companyName || "Unknown"));

    const { generateReport } = await import("./report-generator.js");
    const buffer = await generateReport(auditData);

    const filename = (auditData.lead.companyName || "Audit")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .replace(/\s+/g, "_");

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}_Audit_Report.docx"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);

    console.log("[REPORT] Done: " + filename + "_Audit_Report.docx (" + buffer.length + " bytes)");

  } catch (err) {
    console.error("[REPORT] Error: " + err.message);
    res.status(500).json({ error: "Failed to generate report: " + err.message });
  }
});

// ============================================================
// HEALTH
// ============================================================

app.get("/health", (_, res) => res.json({
  status: "ok",
  version: "2.0",
  youtube_api: YOUTUBE_API_KEY ? "configured" : "not configured (fallback active)",
}));

app.get("/", (_, res) => res.json({
  service: "Lead Audit Scraper v2.0",
  endpoints: {
    "POST /scrape/full-audit": "Full audit (website + GMB + social + pagespeed)",
    "POST /scrape/google-maps": "Google Maps / GMB only",
    "POST /scrape/instagram": "Instagram profile only",
    "POST /scrape/facebook": "Facebook page only",
    "POST /scrape/tiktok": "TikTok profile only",
    "POST /scrape/youtube": "YouTube channel only",
    "POST /scrape/website": "Website crawl only",
    "POST /scrape/pagespeed": "PageSpeed only",
    "POST /generate/report": "Generate audit report docx",
  },
}));

app.listen(PORT, () => {
  console.log("\n  Lead Audit Scraper v2.0 on port " + PORT);
  console.log("  POST /scrape/full-audit  - Full audit (all sources)");
  console.log("  GET  /health             - Health check");
  console.log("  POST /generate/report    - Generate report");
  console.log("  YouTube API:             " + (YOUTUBE_API_KEY ? "Configured" : "Not configured (HTML fallback active)") + "\n");
});