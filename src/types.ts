export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline' | 'error'

export type Market = {
  symbol: string
  name: string
  pip_size?: number
  underlying_symbol?: string
  underlying_symbol_name?: string
  underlying_symbol_type?: string
  type?: string
}

export type TickRecord = {
  quote: number
  timestamp: number
  digit: number
  symbol: string
}

export type DigitFrequencyMap = Record<number, number>

export type MarketAnalysis = {
  symbol: string
  name: string
  deviation: number
  sampleSize: number
  activity: number
  topDigit: number
  topFrequency: number
  recentDeviation: number
  score: number
  rank: number
  status: 'Applied' | 'Standby'
}
