// NSE India direct API — company info, peers, quote
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300')

  const { symbol, type } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const sym = symbol.toUpperCase()

  // NSE needs a session cookie first
  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.nseindia.com/',
    'Origin': 'https://www.nseindia.com',
    'Connection': 'keep-alive',
  }

  try {
    // Step 1: Get NSE session cookie
    const sessionRes = await fetch('https://www.nseindia.com', { headers: baseHeaders })
    const cookies = sessionRes.headers.get('set-cookie') || ''
    const cookie = cookies.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ')
    const authHeaders = { ...baseHeaders, Cookie: cookie }

    if (type === 'quote') {
      // Real-time quote + company info
      const r = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(sym)}`, { headers: authHeaders })
      if (!r.ok) throw new Error(`NSE returned ${r.status}`)
      const data = await r.json()
      return res.status(200).json(data)
    }

    if (type === 'peers') {
      // Get sector peers via NSE indices
      const r = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(sym)}`, { headers: authHeaders })
      if (!r.ok) throw new Error(`NSE returned ${r.status}`)
      const data = await r.json()
      const industry = data?.industryInfo?.industry || data?.metadata?.industry || ''

      // Get sector stocks
      const sectorMap = {
        'IT': 'NIFTY%20IT', 'BANKING': 'NIFTY%20BANK', 'BANK': 'NIFTY%20BANK',
        'PHARMA': 'NIFTY%20PHARMA', 'AUTO': 'NIFTY%20AUTO', 'FMCG': 'NIFTY%20FMCG',
        'METAL': 'NIFTY%20METAL', 'REALTY': 'NIFTY%20REALTY', 'ENERGY': 'NIFTY%20ENERGY',
        'FINANCIAL': 'NIFTY%20FINANCIAL%20SERVICES', 'OIL': 'NIFTY%20OIL%20%26%20GAS',
      }
      let indexKey = null
      for (const [k, v] of Object.entries(sectorMap)) {
        if (industry.toUpperCase().includes(k)) { indexKey = v; break }
      }
      if (!indexKey) return res.status(200).json({ companyInfo: data, peers: [] })

      const peerRes = await fetch(`https://www.nseindia.com/api/equity-stockIndices?index=${indexKey}`, { headers: authHeaders })
      const peerData = peerRes.ok ? await peerRes.json() : {}
      return res.status(200).json({ companyInfo: data, peers: peerData?.data || [] })
    }

    // Default: full company info
    const r = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(sym)}`, { headers: authHeaders })
    if (!r.ok) throw new Error(`NSE returned ${r.status}`)
    const data = await r.json()
    return res.status(200).json(data)

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
