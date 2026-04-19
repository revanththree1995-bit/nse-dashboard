export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { symbol, type } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })
  const base = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json', 'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://finance.yahoo.com', 'Referer': 'https://finance.yahoo.com/',
  }
  try {
    const cookieRes = await fetch('https://fc.yahoo.com', { headers: base, redirect: 'follow' })
    const rawCookie = cookieRes.headers.get('set-cookie') || ''
    const cookie = rawCookie.split(',').map(c => c.split(';')[0]).join('; ')
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { ...base, Cookie: cookie } })
    const crumb = await crumbRes.text()
    if (!crumb || crumb.includes('<')) throw new Error('Session error')
    const h = { ...base, Cookie: cookie }
    const c = encodeURIComponent(crumb)
    let url = ''
    if (type === 'chart') url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y&crumb=${c}`
    else url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=price,summaryDetail,defaultKeyStatistics&crumb=${c}`
    const r = await fetch(url, { headers: h })
    if (!r.ok) throw new Error(`Yahoo ${r.status}`)
    return res.status(200).json(await r.json())
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
