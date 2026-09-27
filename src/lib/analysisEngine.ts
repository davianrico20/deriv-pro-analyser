import type { DigitFrequencyMap, MarketAnalysis, TickRecord } from '../types'

export function extractLastDigit(quote: number, pipSize = 0.01): number {
  const safeQuote = Number.isFinite(quote) ? quote : 0
  const normalized = Number(safeQuote.toFixed(8))
  const stringValue = String(normalized)
  const digitsOnly = stringValue.replace('.', '').replace(/[^0-9]/g, '')
  if (!digitsOnly) return 0
  return Number(digitsOnly[digitsOnly.length - 1] ?? '0')
}

export function computeDigitFrequency(digits: number[]): DigitFrequencyMap {
  const map: DigitFrequencyMap = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
    9: 0
  }

  for (const digit of digits) {
    const safe = Number(digit)
    if (Number.isInteger(safe) && safe >= 0 && safe <= 9) {
      map[safe] += 1
    }
  }

  return map
}

export function computePercentages(freq: DigitFrequencyMap, sampleSize: number): DigitFrequencyMap {
  const percentages: DigitFrequencyMap = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 }
  if (sampleSize === 0) return percentages

  for (let d = 0; d <= 9; d += 1) {
    percentages[d] = (freq[d] / sampleSize) * 100
  }

  return percentages
}

export function calculateDeviationFromUniform(freq: DigitFrequencyMap, sampleSize: number): number {
  if (sampleSize === 0) return 0
  const percentages = computePercentages(freq, sampleSize)
  let total = 0
  for (let d = 0; d <= 9; d += 1) {
    total += Math.abs(percentages[d] - 10)
  }
  return total / 10
}

export function getRecentDigits(digits: number[], ratio = 0.6): number[] {
  if (digits.length <= 1) return digits
  const recentCount = Math.max(1, Math.ceil(digits.length * ratio))
  return digits.slice(-recentCount)
}

export function calculateEvenOdd(digits: number[]): { even: number; odd: number; sample: number } {
  if (!digits.length) return { even: 0, odd: 0, sample: 0 }
  let even = 0
  for (const d of digits) {
    if (d % 2 === 0) even += 1
  }
  return {
    even: (even / digits.length) * 100,
    odd: ((digits.length - even) / digits.length) * 100,
    sample: digits.length
  }
}

export function calculateOverUnder(digits: number[], threshold: number): { over: number; under: number } {
  if (!digits.length) return { over: 0, under: 0 }
  let over = 0
  for (const d of digits) {
    if (d > threshold) over += 1
  }
  return {
    over: (over / digits.length) * 100,
    under: ((digits.length - over) / digits.length) * 100
  }
}

export function calculateEntropy(digits: number[]): number {
  if (!digits.length) return 0
  const freq = computeDigitFrequency(digits)
  const sampleSize = digits.length
  let entropy = 0
  for (let d = 0; d <= 9; d += 1) {
    const p = freq[d] / sampleSize
    if (p > 0) entropy -= p * Math.log(p) / Math.log(10)
  }
  return entropy
}

export function calculateConcentration(digits: number[]): number {
  if (!digits.length) return 0
  const freq = computeDigitFrequency(digits)
  const total = Math.max(...Object.values(freq))
  return (total / digits.length) * 100
}

export function calculateMarketActivity(ticks: TickRecord[]): number {
  if (!ticks.length) return 0
  const oldest = ticks[0]?.timestamp ?? Date.now()
  const newest = ticks[ticks.length - 1]?.timestamp ?? Date.now()
  const elapsedSeconds = Math.max(1, (newest - oldest) / 1000)
  return ticks.length / elapsedSeconds
}

function concentrationScore(activity: number): number {
  return Math.min(100, activity * 60)
}

export function rankMarkets(markets: { symbol: string; name: string; ticks: TickRecord[] }[]): MarketAnalysis[] {
  const results: MarketAnalysis[] = markets
    .map((market) => {
      const digits = market.ticks.map((tick) => tick.digit)
      const sampleSize = digits.length
      const freq = computeDigitFrequency(digits)
      const deviation = calculateDeviationFromUniform(freq, sampleSize)
      const recentDigits = getRecentDigits(digits, 0.6)
      const recentFreq = computeDigitFrequency(recentDigits)
      const recentDeviation = calculateDeviationFromUniform(recentFreq, recentDigits.length)
      const activity = calculateMarketActivity(market.ticks)
      const topDigit = Number(
        Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
      )
      const topFrequency = (freq[topDigit] / Math.max(1, sampleSize)) * 100
      const score = deviation * 0.55 + recentDeviation * 0.25 + (100 - Math.min(100, concentrationScore(activity))) * 0.2

      return {
        symbol: market.symbol,
        name: market.name,
        deviation,
        recentDeviation,
        sampleSize,
        activity,
        topDigit,
        topFrequency,
        score,
        rank: 0,
        status: 'Standby'
      }
    })
    .sort((a, b) => b.score - a.score)

  return results.map((item, index) => ({ ...item, rank: index + 1 }))
}
