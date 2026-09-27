import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3, Gauge, Menu, Radar, ShieldCheck, Target, TrendingUp, Zap } from 'lucide-react'
import { Link, Route, Routes } from 'react-router-dom'
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { derivWebSocket } from './services/derivSocket'
import {
  calculateDeviationFromUniform,
  calculateEvenOdd,
  calculateOverUnder,
  computeDigitFrequency,
  extractLastDigit,
  getRecentDigits,
  rankMarkets
} from './lib/analysisEngine'
import type { ConnectionStatus, Market, TickRecord } from './types'

const DEFAULT_MARKET = '1HZ100V'

function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const [marketList, setMarketList] = useState<Market[]>([])
  const [selectedMarket, setSelectedMarket] = useState<string>(DEFAULT_MARKET)
  const [marketName, setMarketName] = useState('Volatility 100 (1s) Index')
  const [latestQuote, setLatestQuote] = useState<number>(0)
  const [tickRate, setTickRate] = useState<number>(0)
  const [ticks, setTicks] = useState<TickRecord[]>([])
  const [digits, setDigits] = useState<number[]>([])
  const [lastDigits, setLastDigits] = useState<number[]>([])
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    derivWebSocket.onConnect(() => {
      setConnectionStatus('online')
      setErrorMessage('')
      derivWebSocket.requestActiveSymbols()
    })

    derivWebSocket.onError((message) => {
      setConnectionStatus('error')
      setErrorMessage(message)
    })

    derivWebSocket.connect().catch(() => {
      setConnectionStatus('offline')
    })

    derivWebSocket.onMessage((payload) => {
      if (Array.isArray(payload.active_symbols)) {
        const symbols = payload.active_symbols
          .filter((item: any) => {
            const symbol = item.symbol || item.underlying_symbol || ''
            const name = item.display_name || item.underlying_symbol_name || ''
            const type = item.underlying_symbol_type || item.type || ''
            return (
              /(?:1HZ|1V|R_|10|25|50|75|100)/i.test(symbol) ||
              name.toLowerCase().includes('volatility') ||
              type.toLowerCase().includes('volatility')
            )
          })
          .map((item: any) => ({
            symbol: item.symbol || item.underlying_symbol || DEFAULT_MARKET,
            name: item.display_name || item.underlying_symbol_name || 'Volatility Index',
            pip_size: item.pip_size ?? 0.01,
            underlying_symbol: item.underlying_symbol,
            underlying_symbol_name: item.underlying_symbol_name,
            underlying_symbol_type: item.underlying_symbol_type,
            type: item.type
          }))
          .slice(0, 12)

        if (symbols.length) {
          setMarketList(symbols)
          const match = symbols.find((m) => m.symbol === selectedMarket) ?? symbols[0]
          setSelectedMarket(match.symbol)
          setMarketName(match.name)
          derivWebSocket.requestHistory(match.symbol, 250)
        }
      }

      if (payload.msg_type === 'history') {
        const prices = payload.history?.prices ?? []
        if (prices.length) {
          const quote = Number(prices[prices.length - 1])
          const digit = extractLastDigit(quote)
          const tick: TickRecord = {
            quote,
            timestamp: Date.now(),
            digit,
            symbol: selectedMarket
          }
          setLatestQuote(quote)
          setTicks((prev) => {
            const next = [...prev, tick].slice(-250)
            const recentDigits = next.map((item) => item.digit)
            setDigits(recentDigits)
            setLastDigits(recentDigits.slice(-10))
            return next
          })
        }
      }

      if (payload.msg_type === 'tick') {
        const quote = Number(payload.ticks?.quote ?? 0)
        if (Number.isFinite(quote) && quote > 0) {
          const digit = extractLastDigit(quote)
          const tick: TickRecord = {
            quote,
            timestamp: Date.now(),
            digit,
            symbol: selectedMarket
          }
          setLatestQuote(quote)
          setTicks((prev) => {
            const next = [...prev, tick].slice(-250)
            const recentDigits = next.map((item) => item.digit)
            setDigits(recentDigits)
            setLastDigits(recentDigits.slice(-10))
            return next
          })
        }
      }
    })

    return () => {
      derivWebSocket.disconnect()
    }
  }, [selectedMarket])

  useEffect(() => {
    if (!selectedMarket) return
    derivWebSocket.subscribeToMarket(selectedMarket)
  }, [selectedMarket])

  useEffect(() => {
    if (!ticks.length) return
    const sampleWindow = Math.max(1, (ticks[ticks.length - 1].timestamp - ticks[0].timestamp) / 1000)
    setTickRate(Math.max(0, ticks.length / sampleWindow))
  }, [ticks])

  const digitFrequency = useMemo(() => {
    const freq = computeDigitFrequency(digits)
    return Object.entries(freq).map(([key, value]) => ({
      digit: Number(key),
      count: value,
      percentage: (value / Math.max(1, digits.length)) * 100
    }))
  }, [digits])

  const topDigit = digitFrequency.reduce((best, item) => {
    if (item.percentage > best.percentage) return item
    return best
  }, digitFrequency[0] ?? { digit: 0, count: 0, percentage: 0 })

  const evenOdd = useMemo(() => calculateEvenOdd(digits), [digits])
  const underOver = useMemo(() => calculateOverUnder(digits, 4), [digits])
  const deviation = useMemo(() => calculateDeviationFromUniform(computeDigitFrequency(digits), digits.length), [digits])
  const recentDigits = useMemo(() => getRecentDigits(digits, 0.6), [digits])
  const recentDeviation = useMemo(() => calculateDeviationFromUniform(computeDigitFrequency(recentDigits), recentDigits.length), [recentDigits])

  const rankedMarkets = useMemo(() => {
    const scanSet = marketList.length
      ? marketList.map((market) => ({
          symbol: market.symbol,
          name: market.name,
          ticks: ticks.filter((tick) => tick.symbol === market.symbol)
        }))
      : [{ symbol: selectedMarket, name: marketName, ticks: ticks }]
    return rankMarkets(scanSet).slice(0, 10)
  }, [marketList, ticks, selectedMarket, marketName])

  return (
    <div className="min-h-screen bg-lavender text-slate-900">
      <Header isMenuOpen={isMenuOpen} onToggleMenu={() => setIsMenuOpen(!isMenuOpen)} />

      <div className="max-w-6xl mx-auto px-4 pb-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] mt-4">
          <span className={`status-dot ${connectionStatus === 'online' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="text-slate-700 font-semibold">{connectionStatus === 'online' ? 'ONLINE' : 'CONNECTING'}</span>
          <span className="text-sky-600 font-semibold">FEED LIVE</span>
        </div>

        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                marketName={marketName}
                selectedMarket={selectedMarket}
                marketList={marketList}
                onMarketChange={setSelectedMarket}
                quote={latestQuote}
                tickRate={tickRate}
                digits={lastDigits}
                digitFrequency={digitFrequency}
                deviation={deviation}
                recentDeviation={recentDeviation}
                topDigit={topDigit}
                evenOdd={evenOdd}
                underOver={underOver}
                errorMessage={errorMessage}
                connectionStatus={connectionStatus}
              />
            }
          />
          <Route path="/matches" element={<MatchesPage digits={digits} />} />
          <Route path="/even-odd" element={<EvenOddPage digits={digits} />} />
          <Route path="/over-under" element={<OverUnderPage digits={digits} />} />
          <Route path="/volatility-scanner" element={<VolatilityScanner marketList={marketList} rankedMarkets={rankedMarkets} />} />
          <Route path="/frequency" element={<FrequencyPage digitFrequency={digitFrequency} />} />
          <Route path="/support" element={<SupportPage />} />
        </Routes>
      </div>

      {isMenuOpen && <MobileMenu onClose={() => setIsMenuOpen(false)} />}
    </div>
  )
}

type HeaderProps = {
  isMenuOpen: boolean
  onToggleMenu: () => void
}

function Header({ onToggleMenu }: HeaderProps) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-brand-500 w-10 h-10 flex items-center justify-center text-white shadow-md">
            <Zap size={18} />
          </div>
          <div className="text-lg font-black tracking-tight text-slate-900">derivproanalyser</div>
        </div>

        <button
          type="button"
          onClick={onToggleMenu}
          className="w-10 h-10 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center"
          aria-label="Menu"
        >
          <Menu size={18} className="text-slate-700" />
        </button>
      </div>
    </header>
  )
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const items = [
    { to: '/', label: 'DASHBOARD', icon: <Activity size={16} /> },
    { to: '/matches', label: 'MATCHES / DIFFERS', icon: <TrendingUp size={16} /> },
    { to: '/even-odd', label: 'EVEN / ODD', icon: <Gauge size={16} /> },
    { to: '/over-under', label: 'OVER / UNDER', icon: <Target size={16} /> },
    { to: '/volatility-scanner', label: 'VOLATILITY SCANNER', icon: <Radar size={16} /> },
    { to: '/frequency', label: 'FREQUENCY GRAPH', icon: <BarChart3 size={16} /> },
    { to: '/support', label: 'SUPPORT', icon: <ShieldCheck size={16} /> }
  ]

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50">
      <div className="w-[85%] max-w-sm h-full bg-white p-4 shadow-2xl">
        <div className="flex justify-between items-center pb-3 border-b">
          <div className="font-bold text-lg text-slate-900">Menu</div>
          <button onClick={onClose} className="text-slate-500">Close</button>
        </div>

        <nav className="mt-4 space-y-2">
          {items.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-slate-700 hover:bg-sky-50 hover:text-sky-700 transition"
            >
              {item.icon}
              <span className="font-semibold text-sm uppercase">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

type DashboardProps = {
  marketName: string
  selectedMarket: string
  marketList: Market[]
  onMarketChange: (symbol: string) => void
  quote: number
  tickRate: number
  digits: number[]
  digitFrequency: { digit: number; count: number; percentage: number }[]
  deviation: number
  recentDeviation: number
  topDigit: { digit: number; count: number; percentage: number }
  evenOdd: { even: number; odd: number; sample: number }
  underOver: { over: number; under: number }
  errorMessage: string
  connectionStatus: ConnectionStatus
}

function Dashboard({
  marketName,
  selectedMarket,
  marketList,
  onMarketChange,
  quote,
  tickRate,
  digits,
  digitFrequency,
  deviation,
  recentDeviation,
  topDigit,
  evenOdd,
  underOver,
  errorMessage,
  connectionStatus
}: DashboardProps) {
  return (
    <div className="space-y-5 mt-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Dashboard</div>
          <h1 className="text-2xl font-black mt-1">Live market data and analysis modules</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard title="SYSTEM" value={connectionStatus === 'online' ? 'ONLINE' : 'CONNECTING'} accent="sky" />
        <StatusCard title="TICK FEED" value={connectionStatus === 'online' ? 'CONNECTED' : 'WAITING'} accent="emerald" />
        <StatusCard title="MARKET" value={marketName} accent="blue" />
      </div>

      <div className="card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Select volatility market</label>
            <select
              value={selectedMarket}
              onChange={(e) => onMarketChange(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900"
            >
              {marketList.length ? (
                marketList.map((market) => (
                  <option key={market.symbol} value={market.symbol}>{market.name}</option>
                ))
              ) : (
                <option value={selectedMarket}>{selectedMarket}</option>
              )}
            </select>
          </div>

          <Link
            to="/volatility-scanner"
            className="mt-3 md:mt-0 bg-brand-500 hover:bg-brand-600 text-white rounded-xl px-5 py-3 text-sm font-semibold shadow-md"
          >
            SCAN VOLATILITY
          </Link>
        </div>

        {errorMessage && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm px-3 py-2">
            {errorMessage}
          </div>
        )}
      </div>

      <div className="panel-dark p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">DERIV TICK FEED</div>
            <div className="text-lg font-bold mt-1">{selectedMarket}</div>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>{digits.length} ticks</div>
            <div>{tickRate.toFixed(2)} t/s</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">QUOTE</div>
          <div className="text-3xl font-black mt-2">{Number(quote || 0).toFixed(2)}</div>
        </div>

        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">LAST DIGITS</div>
          <div className="flex gap-2 mt-2">
            {digits.slice(-5).map((digit, index) => (
              <span key={`${digit}-${index}`} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm">{digit}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">DIGIT FREQUENCY</div>
          <button className="text-xs uppercase tracking-[0.18em] text-brand-600 font-bold">FULL GRAPH</button>
        </div>

        <div className="mt-4">
          <div className="text-sm text-slate-600">{marketName}</div>
          <div className="text-xs text-slate-500 mt-1">{digits.length} ticks in sample</div>
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
          {digitFrequency.slice(0, 10).map((item) => (
            <div key={item.digit} className="border border-slate-200 rounded-xl p-2 bg-slate-50">
              <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">{item.digit}</div>
              <div className="font-bold text-sm mt-1">{item.percentage.toFixed(1)}%</div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <MiniStat label="Deviation" value={`${deviation.toFixed(2)}`} />
          <MiniStat label="Recent deviation" value={`${recentDeviation.toFixed(2)}`} />
          <MiniStat label="Latest digit" value={`${digits[digits.length - 1] ?? 0}`} />
          <MiniStat label="Top digit" value={`${topDigit.digit} (${topDigit.percentage.toFixed(1)}%)`} />
        </div>
      </div>

      <div className="responsive-grid">
        <PanelBox title="EVEN / ODD" value={`${evenOdd.even.toFixed(1)}% / ${evenOdd.odd.toFixed(1)}%`} />
        <PanelBox title="OVER / UNDER" value={`${underOver.over.toFixed(1)}% / ${underOver.under.toFixed(1)}%`} />
      </div>
    </div>
  )
}

function StatusCard({ title, value, accent }: { title: string; value: string; accent: 'sky' | 'emerald' | 'blue' }) {
  const accentClass = {
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    blue: 'bg-brand-50 text-brand-700 border-brand-100'
  }[accent]

  return (
    <div className={`rounded-2xl border p-3 ${accentClass}`}>
      <div className="text-[10px] uppercase tracking-[0.2em] font-semibold">{title}</div>
      <div className="mt-2 text-lg font-black">{value}</div>
    </div>
  )
}

function PanelBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{title}</div>
      <div className="mt-2 text-xl font-black text-slate-900">{value}</div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-bold text-slate-900">{value}</div>
    </div>
  )
}

function VolatilityScanner({ marketList, rankedMarkets }: { marketList: Market[]; rankedMarkets: any[] }) {
  return (
    <div className="space-y-5 mt-6">
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-brand-100 p-2 text-brand-600"><Radar size={18} /></div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Volatility scanner</div>
            <h2 className="text-2xl font-black">Scan every volatility market</h2>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Select volatility market</label>
          <select className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
            {marketList.map((market) => (
              <option key={market.symbol} value={market.symbol}>{market.name}</option>
            ))}
          </select>
        </div>

        <button className="mt-4 w-full rounded-xl bg-brand-500 hover:bg-brand-600 text-white py-3 font-bold">
          SCAN VOLATILITY
        </button>
      </div>

      <div className="card p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Scanner results</div>
        <div className="mt-4 space-y-3">
          {rankedMarkets.map((item) => (
            <div key={item.symbol} className="flex items-center justify-between border border-slate-200 rounded-xl px-3 py-3">
              <div>
                <div className="font-bold text-sm">{item.name}</div>
                <div className="text-xs text-slate-500">Rank #{item.rank}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-brand-600">{item.deviation.toFixed(2)}</div>
                <div className="text-xs text-slate-500">{item.activity.toFixed(2)} t/s</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FrequencyPage({ digitFrequency }: { digitFrequency: { digit: number; count: number; percentage: number }[] }) {
  return (
    <div className="space-y-5 mt-6">
      <div className="card p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Frequency graph</div>
        <h2 className="text-2xl font-black mt-1">Digit frequency</h2>
      </div>

      <div className="card p-5">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={digitFrequency}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="digit" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="percentage" fill="#1c78ff" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function MatchesPage({ digits }: { digits: number[] }) {
  const latest = digits.length ? digits[digits.length - 1] : 0

  return (
    <div className="space-y-5 mt-6">
      <div className="card p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Matches / differs</div>
        <h2 className="text-2xl font-black mt-1">Match pattern analysis</h2>
      </div>

      <div className="panel-dark p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Latest digit</span>
          <span className="text-3xl font-black">{latest}</span>
        </div>
      </div>

      <div className="card p-5">
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <div className="font-bold text-lg">{i}</div>
              <div className="text-[10px] text-slate-500">{digits.filter((d) => d === i).length}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EvenOddPage({ digits }: { digits: number[] }) {
  const evenOdd = calculateEvenOdd(digits)

  return (
    <div className="space-y-5 mt-6">
      <div className="card p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Even / odd</div>
        <h2 className="text-2xl font-black mt-1">Live parity analysis</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Even</div>
          <div className="text-3xl font-black mt-2">{evenOdd.even.toFixed(1)}%</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Odd</div>
          <div className="text-3xl font-black mt-2">{evenOdd.odd.toFixed(1)}%</div>
        </div>
      </div>
    </div>
  )
}

function OverUnderPage({ digits }: { digits: number[] }) {
  const overUnder = calculateOverUnder(digits, 4)

  return (
    <div className="space-y-5 mt-6">
      <div className="card p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Over / under</div>
        <h2 className="text-2xl font-black mt-1">Threshold analysis</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Over 4</div>
          <div className="text-3xl font-black mt-2">{overUnder.over.toFixed(1)}%</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Under 5</div>
          <div className="text-3xl font-black mt-2">{overUnder.under.toFixed(1)}%</div>
        </div>
      </div>
    </div>
  )
}

function SupportPage() {
  return (
    <div className="space-y-5 mt-6">
      <div className="card p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Support</div>
        <h2 className="text-2xl font-black mt-1">How the analyzer works</h2>
      </div>

      <div className="card p-5 space-y-3 text-slate-700">
        <p>This application provides statistical market analysis from observed Deriv tick data.</p>
        <p>It connects to the public Deriv WebSocket and reads live tick feeds without requiring a Deriv account.</p>
        <p>Matches, Even/Odd, and Over/Under are analytical modules using recent and historical digit patterns.</p>
        <p>Statistical analysis only. Market data and historical patterns do not guarantee future tick outcomes. This application does not execute trades.</p>
      </div>
    </div>
  )
}

export default App
