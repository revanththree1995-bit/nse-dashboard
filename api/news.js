// Google News RSS — India-specific, filtered by company name
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300')

  const { symbol, company } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  try {
    // Build targeted India query
    const companyName = company ? decodeURIComponent(company) : symbol
    const query = encodeURIComponent(`"${companyName}" OR "${symbol}" NSE stock India`)

    const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      }
    })

    if (!r.ok) throw new Error(`Google News returned ${r.status}`)
    const xml = await r.text()

    // Parse RSS XML manually (no xml2js dependency needed)
    const items = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match

    while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
      const item = match[1]
      const get = tag => {
        const m = item.match(new RegExp(`<${tag}[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/${tag}>`))
        return m ? m[1].trim() : ''
      }
      const title = get('title').replace(/\s*-\s*[^-]*$/, '').trim()
      const link = get('link') || (item.match(/https?:\/\/[^\s<"]+/)?.[0] || '')
      const pubDate = get('pubDate')
      const source = get('source') || get('author') || item.match(/<source[^>]*>([^<]*)/)?.[1] || 'Google News'
      const description = get('description').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim()

      // Filter out non-relevant news
      const titleLower = title.toLowerCase()
      const symLower = symbol.toLowerCase()
      const compLower = companyName.toLowerCase().split(' ')[0].toLowerCase()
      if (title && (titleLower.includes(symLower) || titleLower.includes(compLower) || description.toLowerCase().includes(symLower))) {
        items.push({ title, link, pubDate, source, description: description.slice(0, 200) })
      }
    }

    // If filtered too aggressively, include all
    if (items.length < 3) {
      const allItems = []
      const itemRegex2 = /<item>([\s\S]*?)<\/item>/g
      let m2
      while ((m2 = itemRegex2.exec(xml)) !== null && allItems.length < 12) {
        const item = m2[1]
        const get = tag => { const mx = item.match(new RegExp(`<${tag}[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/${tag}>`)); return mx ? mx[1].trim() : '' }
        const title = get('title').replace(/\s*-\s*[^-]*$/, '').trim()
        const link = get('link') || (item.match(/https?:\/\/[^\s<"]+/)?.[0] || '')
        const pubDate = get('pubDate')
        const source = get('source') || 'Google News'
        if (title) allItems.push({ title, link, pubDate, source })
      }
      return res.status(200).json({ news: allItems })
    }

    return res.status(200).json({ news: items })
  } catch (err) {
    return res.status(500).json({ error: err.message, news: [] })
  }
}
