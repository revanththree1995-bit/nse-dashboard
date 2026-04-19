import * as cheerio from 'cheerio'

function parseTable($, id) {
  const selectors = [`#${id} table`, `section#${id} table`, `[id="${id}"] table`]
  let table = null
  for (const sel of selectors) {
    const el = $(sel).first()
    if (el.length) { table = el; break }
  }
  // Fallback: find by section heading text
  if (!table) {
    $('section, div.card, div.block').each((_, el) => {
      const heading = $(el).find('h2, h3, .card-header').first().text().toLowerCase()
      if (heading.includes(id.replace(/-/g, ' '))) {
        const t = $(el).find('table').first()
        if (t.length) { table = t; return false }
      }
    })
  }
  if (!table) return { headers: [], rows: [] }

  const headers = []
  table.find('thead tr th').each((i, el) => {
    if (i > 0) headers.push($(el).text().trim())
  })

  const rows = []
  table.find('tbody tr').each((_, tr) => {
    const cells = $(tr).find('td')
    const label = $(cells[0]).text().trim().replace(/\s*\+\s*$/, '').trim()
    if (!label) return
    const values = []
    cells.each((j, td) => { if (j > 0) values.push($(td).text().trim()) })
    rows.push({ label, values })
  })
  return { headers, rows }
}

function calcGrowth(values) {
  const nums = values.map(v => parseFloat(String(v).replace(/,/g, '')) || null).filter(n => n !== null)
  if (nums.length < 2) return null
  const first = nums[0], last = nums[nums.length - 1]
  if (!first || first === 0) return null
  return (((last - first) / Math.abs(first)) * 100).toFixed(1)
}

function calcQoQ(values) {
  const nums = values.map(v => parseFloat(String(v).replace(/,/g, '')) || null)
  return nums.map((v, i) => {
    if (i === 0 || v === null || nums[i - 1] === null || nums[i - 1] === 0) return null
    return (((v - nums[i - 1]) / Math.abs(nums[i - 1])) * 100).toFixed(1)
  })
}

function calcYoY(values) {
  const nums = values.map(v => parseFloat(String(v).replace(/,/g, '')) || null)
  return nums.map((v, i) => {
    if (i < 4 || v === null || nums[i - 4] === null || nums[i - 4] === 0) return null
    return (((v - nums[i - 4]) / Math.abs(nums[i - 4])) * 100).toFixed(1)
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=900')

  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.screener.in/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  }

  const sym = symbol.toUpperCase()
  const urls = [
    `https://www.screener.in/company/${sym}/consolidated/`,
    `https://www.screener.in/company/${sym}/`,
  ]

  let html = null, isConsolidated = false
  for (let i = 0; i < urls.length; i++) {
    try {
      const r = await fetch(urls[i], { headers })
      if (r.ok) { html = await r.text(); isConsolidated = i === 0; break }
    } catch (_) {}
  }

  if (!html) return res.status(404).json({ error: `"${sym}" not found on Screener.in. Check exact symbol.` })

  try {
    const $ = cheerio.load(html)

    const name = $('h1').first().text().trim() || sym
    const about = $('#company-info p').first().text().trim() || $('section.row p').first().text().trim() || ''

    // Key ratios
    const ratios = {}
    $('#top-ratios li').each((_, el) => {
      const k = $(el).find('.name').first().text().trim()
      const v = $(el).find('.number').first().text().trim()
      if (k && v) ratios[k] = v
    })
    // Fallback
    if (Object.keys(ratios).length < 3) {
      $('ul li').each((_, el) => {
        const spans = $(el).find('span')
        if (spans.length >= 2) {
          const k = $(spans[0]).text().trim()
          const v = $(spans[spans.length - 1]).text().trim()
          if (k && v && !ratios[k]) ratios[k] = v
        }
      })
    }

    // Quarterly P&L with QoQ and YoY
    const quarterly = parseTable($, 'quarters')
    quarterly.rows = quarterly.rows.map(row => ({
      ...row,
      qoq: calcQoQ(row.values),
      yoy: calcYoY(row.values),
    }))

    // Annual P&L with growth
    const annual = parseTable($, 'profit-loss')
    annual.rows = annual.rows.map(row => ({
      ...row,
      growth: calcGrowth(row.values),
    }))

    // Balance sheet + cash flow + ratios table
    const balanceSheet = parseTable($, 'balance-sheet')
    const cashFlow = parseTable($, 'cash-flow')
    const ratiosTable = parseTable($, 'ratios')

    // Shareholding trend
    const shareholdingTrend = { headers: [], rows: [] }
    const shTable = $('#shareholding table').first()
    if (shTable.length) {
      shTable.find('thead tr th').each((i, el) => { if (i > 0) shareholdingTrend.headers.push($(el).text().trim()) })
      shTable.find('tbody tr').each((_, tr) => {
        const cells = $(tr).find('td')
        const label = $(cells[0]).text().trim()
        if (!label) return
        const values = []
        cells.each((j, td) => { if (j > 0) values.push($(td).text().trim()) })
        shareholdingTrend.rows.push({ label, values })
      })
    }
    const shareholding = {}
    shareholdingTrend.rows.forEach(row => {
      const latest = row.values[row.values.length - 1]
      if (row.label && latest) shareholding[row.label] = latest
    })

    // PEERS — very aggressive multi-strategy parsing
    const peers = []
    const peerHeaders = []

    // Strategy 1: Look for #peers section specifically
    let peerTable = $('#peers table').first()

    // Strategy 2: Find table with stock-like headers
    if (!peerTable.length) {
      $('table').each((_, t) => {
        const headerText = $(t).find('thead th').map((_, th) => $(th).text().trim()).get().join(' ')
        if ((headerText.includes('CMP') || headerText.includes('P/E') || headerText.includes('Sales')) && headerText.includes('Name')) {
          peerTable = $(t); return false
        }
      })
    }

    // Strategy 3: Any section with word "peer" or "competitors"
    if (!peerTable.length) {
      $('section, .card, .block').each((_, el) => {
        const text = $(el).find('h2, h3, h4').first().text().toLowerCase()
        if (text.includes('peer') || text.includes('compet') || text.includes('similar')) {
          const t = $(el).find('table').first()
          if (t.length) { peerTable = t; return false }
        }
      })
    }

    if (peerTable && peerTable.length) {
      peerTable.find('thead tr th').each((_, th) => peerHeaders.push($(th).text().trim()))
      peerTable.find('tbody tr').each((_, tr) => {
        const cells = $(tr).find('td')
        if (!cells.length) return
        const peer = {}
        cells.each((j, td) => { peer[peerHeaders[j] || `col${j}`] = $(td).text().trim().replace(/\s+/g, ' ') })
        if (Object.values(peer)[0]) peers.push(peer)
      })
    }

    // Revenue breakdown (segment data from company-info or any breakdown section)
    const segments = []
    $('.segment, #segments, [id*="segment"]').each((_, el) => {
      const text = $(el).text().trim()
      if (text.length > 20) segments.push(text.slice(0, 500))
    })

    // Guidance / documents
    const guidance = []
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || ''
      const title = $(el).text().trim()
      if ((href.includes('annual') || href.includes('concall') || href.includes('report') || href.includes('presentation') || href.includes('investor') || href.includes('transcript')) && title && title.length > 5) {
        guidance.push({
          title,
          href: href.startsWith('http') ? href : `https://www.screener.in${href}`,
          type: href.includes('concall') || href.includes('transcript') ? 'Concall' : href.includes('annual') ? 'Annual Report' : href.includes('presentation') ? 'Presentation' : 'Document'
        })
      }
    })

    return res.status(200).json({
      name, about, isConsolidated, ratios,
      quarterly, annual, balanceSheet, cashFlow, ratiosTable,
      peers, peerHeaders, shareholding, shareholdingTrend,
      segments, guidance: [...new Map(guidance.map(g => [g.title, g])).values()].slice(0, 20),
    })
  } catch (err) {
    return res.status(500).json({ error: 'Parse error: ' + err.message })
  }
}
