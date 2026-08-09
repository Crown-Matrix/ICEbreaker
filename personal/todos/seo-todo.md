# no meta desc 
```html
<!-- Homepage -->
<link rel="canonical" href="https://icebreaker-u70b.onrender.com/">

<!-- Single player -->
<link rel="canonical" href="https://icebreaker-u70b.onrender.com/singlePlayer">

<!-- Multiplayer -->
<link rel="canonical" href="https://icebreaker-u70b.onrender.com/multiPlayer">

```

# no og desc
```html
<meta property="og:title" content="ICEbreaker">
<meta property="og:description" content="...">
<meta property="og:image" content="https://icebreaker-u70b.onrender.com/images/og-image.png">
<meta property="og:url" content="https://icebreaker-u70b.onrender.com/">
<meta property="og:type" content="website">
```

# no strucuted data
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "ICEbreaker",
  "url": "https://icebreaker-u70b.onrender.com/"
}
</script>
```


# maybe consider doing a sitemap.xml
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://icebreaker-u70b.onrender.com/</loc>
    </url>
    <url>
        <loc>https://icebreaker-u70b.onrender.com/singlePlayer</loc>
    </url>
    <url>
        <loc>https://icebreaker-u70b.onrender.com/multiPlayer</loc>
    </url>
</urlset>

```

## and in robots.txt:

```text
Sitemap: https://icebreaker-u70b.onrender.com/sitemap.xml
```

# no meta description
titles are already unique per page — no change needed there
```html
<meta name="description" content="ICEbreaker — a browser-based cyberpunk hacking minigame. Decode the matrix, beat the clock, challenge friends in real-time multiplayer.">
```

# og tags above are missing twitter card + locale/type
```html
<meta property="og:locale" content="en_US">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@icebreaker">
<meta name="twitter:creator" content="@icebreaker">
```

# no alt text on images
zero images site-wide have alt text right now — real gap, not a nice-to-have
```html
<img src="/imgs/nettech.png" alt="ICEbreaker netrunner logo">
```

# sitemap.xml above is missing lastmod/changefreq/priority
```xml
<url>
    <loc>https://icebreaker-u70b.onrender.com/</loc>
    <lastmod>2026-08-09</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
</url>
```

# no domain / trailing-slash enforcement
canonical link tags are above — this is the server-side half. can extend the existing /login -> /log-in alias-redirect pattern
```js
app.use((req, res, next) => {
  if (req.hostname.startsWith('www.')) {
    return res.redirect(301, `https://${req.hostname.slice(4)}${req.originalUrl}`);
  }
  next();
});
```

# no canonical header / staging noindex
per-path noindex for admin/profile/banned/result already exists via X-Robots-Tag — no change needed there
```js
res.setHeader('Link', '<https://icebreaker-u70b.onrender.com/>; rel="canonical"');
```

# structured data above only covers WebSite — still need these variants
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Crown Matrix",
  "url": "https://icebreaker-u70b.onrender.com/"
}
</script>
```
also test: WebPage, BreadcrumbList, FAQPage

# CI check for structured data
no CI pipeline exists yet — needs to be set up before this is possible
```text
add JSON-LD validation step, save failing examples per page type
```

# no social share images
```text
/public/imgs/og-image-1200x630.png   OG
/public/imgs/og-image-1200x600.png   Twitter summary_large_image
```

# no compression middleware; static caching exists but is deliberately no-cache (rate-limited paths set Cache-Control: no-cache) — revisit maxAge intentionally, don't just add blindly
```js
const compression = require('compression');
app.use(compression());
```

# no preconnect/preload hints
CSP, X-Frame-Options, and HSTS are already configured via helmet — no change needed there
```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://cdn.jsdelivr.net">
```

# 404 status wiring already done (main.cjs catch-all: res.status(404).sendFile(...)) — no change needed there. still no 5xx page
```js
app.use((err, req, res, next) => {
  res.status(500).sendFile('500.html', { root: './public' });
});
```

# internal linking audit
```text
crawl all routes, list broken links + orphan pages, fix before next deploy
```

# search console / bing verification
```html
<meta name="google-site-verification" content="TODO">
<meta name="msvalidate.01" content="TODO">
```

# core web vitals remediation
```text
run Lighthouse against each route, log baseline LCP/INP/CLS,
track fixes against target thresholds
```

# monitoring
```text
uptime checks, crawl-error alerts, index-coverage checks,
scheduled SEO audit (weekly/monthly)
```

# SEO checklist in CI
depends on a CI pipeline existing first
```text
gate on: title/meta-desc present, canonical present, og/twitter present,
robots meta correct, expected status codes
```

# redirect strategy docs
```text
document preferred domain (apex vs www) + trailing-slash policy,
extend existing alias-redirect pattern (/login -> /log-in, /register -> /sign-up)
```

# social preview testing
```text
Facebook sharing debugger, Twitter card validator —
run after OG/Twitter tags ship, save snapshots
```