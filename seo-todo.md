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