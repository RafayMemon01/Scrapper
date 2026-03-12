// ============================================================
// LEAD AUDIT SCRAPER v1.1 - Single File Server
// FIXES: deeper crawling, social from all pages, pagespeed retry
// Deploy to Railway.app, connect to n8n
// ============================================================

import express from "express";
import cors from "cors";
import axios from "axios";
import * as cheerio from "cheerio";
import { generateReport } from "./report-generator.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3500;
const API_KEY = process.env.API_KEY;

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

async function fetchPage(url, retries = 2) {
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
// Crawls links from ALL pages, not just homepage
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
// Checks combined HTML from ALL pages
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
// SCRAPER 3: SOCIAL MEDIA FINDER
// Checks ALL crawled pages
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
// SCRAPER 4: PAGESPEED (with retry and delay)
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
// ENDPOINTS
// ============================================================

app.post("/scrape/full-audit", async (req, res) => {
  const { url, companyName } = req.body;
  if (!url || !companyName) {
    return res.status(400).json({ error: "Both url and companyName are required" });
  }

  console.log("\n" + "=".repeat(50));
  console.log("[AUDIT] Starting: " + companyName + " (" + url + ")");
  console.log("=".repeat(50));
  const startTime = Date.now();

  try {
    console.log("\n[1/3] Crawling website...");
    const websiteData = await scrapeWebsite(url, 15);

    let techData = { technologies: [], seoChecks: {} };
    let socialData = { found: {}, missing: [], totalFound: 0 };
    const htmlPages = websiteData._allHtmlPages || [];

    if (htmlPages.length > 0) {
      console.log("\n[2/3] Detecting tech stack and social links...");
      techData = detectTechStack(htmlPages);
      socialData = findSocialLinks(htmlPages);
    }

    delete websiteData._allHtmlPages;

    console.log("\n[3/3] Fetching PageSpeed scores...");
    const pageSpeedData = await fetchPageSpeed(url);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n" + "=".repeat(50));
    console.log("[AUDIT] Done in " + elapsed + "s | " + websiteData.totalPages + " pages | " + techData.technologies.length + " techs | " + socialData.totalFound + " social");
    console.log("=".repeat(50) + "\n");

    res.json({
      success: true,
      data: {
        meta: { companyName, url, scrapedAt: new Date().toISOString(), durationSeconds: parseFloat(elapsed) },
        website: websiteData,
        techStack: techData,
        socialMedia: socialData,
        pageSpeed: pageSpeedData,
      },
    });
  } catch (err) {
    console.error("[AUDIT] Error: " + err.message);
    res.json({ success: false, error: err.message, data: null });
  }
});

app.post("/scrape/website", async (req, res) => {
  try {
    const data = await scrapeWebsite(req.body.url, req.body.maxPages || 15);
    delete data._allHtmlPages;
    res.json({ success: true, data });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post("/scrape/pagespeed", async (req, res) => {
  try {
    const data = await fetchPageSpeed(req.body.url);
    res.json({ success: true, data });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.get("/health", (_, res) => res.json({ status: "ok", version: "1.1" }));
app.get("/", (_, res) => res.json({ service: "Lead Audit Scraper v1.1", usage: "POST /scrape/full-audit" }));
// REPORT GENERATOR ENDPOINT
// Takes Claude's audit JSON, returns a branded .docx file
// n8n calls this after getting Claude's analysis
// ============================================================
 
app.post("/generate/report", async (req, res) => {
  try {
    const auditData = req.body;
    
    if (!auditData || !auditData.lead) {
      return res.status(400).json({ error: "Invalid audit data. Must include 'lead' object." });
    }
 
    console.log("[REPORT] Generating docx for: " + (auditData.lead.companyName || "Unknown"));
 
    const buffer = await generateReport(auditData);
 
    // Set headers for file download
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

app.listen(PORT, () => {
  console.log("\n  Lead Audit Scraper v1.2 on port " + PORT);
  console.log("  POST /scrape/full-audit  - Full audit");
  console.log("  GET  /health             - Health check\n");
  console.log("  POST /generate/report     - Generate report\n");
});