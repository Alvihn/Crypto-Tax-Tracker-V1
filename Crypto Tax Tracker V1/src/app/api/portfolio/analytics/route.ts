import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface AnalyticsInput {
  userId: string
  portfolioId?: string
  period: '1d' | '7d' | '30d' | '90d' | '1y' | 'all'
}

interface PortfolioAnalytics {
  totalValue: number
  totalGainLoss: number
  totalGainLossPercentage: number
  periodChange: number
  periodChangePercentage: number
  assetDistribution: Array<{
    symbol: string
    name: string
    value: number
    percentage: number
    amount: number
    averagePrice: number
  }>
  performanceHistory: Array<{
    date: string
    value: number
    change: number
    changePercentage: number
  }>
  topGainers: Array<{
    symbol: string
    name: string
    gain: number
    gainPercentage: number
  }>
  topLosers: Array<{
    symbol: string
    name: string
    loss: number
    lossPercentage: number
  }>
  transactionSummary: {
    totalTransactions: number
    buys: number
    sells: number
    transfers: number
    totalVolume: number
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyticsInput = await request.json()
    const { userId, portfolioId, period } = body

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required field: userId' },
        { status: 400 }
      )
    }

    // Calculate date range based on period
    const now = new Date()
    let startDate = new Date()

    switch (period) {
      case '1d':
        startDate.setDate(now.getDate() - 1)
        break
      case '7d':
        startDate.setDate(now.getDate() - 7)
        break
      case '30d':
        startDate.setDate(now.getDate() - 30)
        break
      case '90d':
        startDate.setDate(now.getDate() - 90)
        break
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1)
        break
      case 'all':
        startDate = new Date(0) // Beginning of time
        break
      default:
        startDate.setDate(now.getDate() - 30)
    }

    // Get transactions for the portfolio
    const whereClause: any = {
      userId,
      timestamp: {
        gte: startDate,
      },
    }

    if (portfolioId) {
      whereClause.portfolioId = portfolioId
    }

    const transactions = await db.transaction.findMany({
      where: whereClause,
      include: {
        cryptocurrency: true,
      },
      orderBy: {
        timestamp: 'asc',
      },
    })

    if (transactions.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          totalValue: 0,
          totalGainLoss: 0,
          totalGainLossPercentage: 0,
          periodChange: 0,
          periodChangePercentage: 0,
          assetDistribution: [],
          performanceHistory: [],
          topGainers: [],
          topLosers: [],
          transactionSummary: {
            totalTransactions: 0,
            buys: 0,
            sells: 0,
            transfers: 0,
            totalVolume: 0,
          },
        },
      })
    }

    // Calculate portfolio analytics
    const analytics = await calculatePortfolioAnalytics(transactions, startDate, now)

    return NextResponse.json({
      success: true,
      data: analytics,
    })
  } catch (error) {
    console.error('Error calculating portfolio analytics:', error)
    return NextResponse.json(
      { error: 'Failed to calculate portfolio analytics' },
      { status: 500 }
    )
  }
}

async function calculatePortfolioAnalytics(
  transactions: any[],
  startDate: Date,
  endDate: Date
): Promise<PortfolioAnalytics> {
  // Group transactions by cryptocurrency
  const assetHoldings: Record<string, any> = {}

  transactions.forEach(transaction => {
    const symbol = transaction.cryptocurrency.symbol
    const name = transaction.cryptocurrency.name

    if (!assetHoldings[symbol]) {
      assetHoldings[symbol] = {
        symbol,
        name,
        amount: 0,
        totalCost: 0,
        transactions: [],
      }
    }

    const holding = assetHoldings[symbol]

    if (transaction.type === 'BUY') {
      holding.amount += transaction.amount
      holding.totalCost += transaction.totalUsd
    } else if (transaction.type === 'SELL') {
      holding.amount -= transaction.amount
      holding.totalCost -= transaction.totalUsd
    }

    holding.transactions.push(transaction)
  })

  // Calculate current values (mock prices for demo)
  const mockPrices: Record<string, number> = {
    'BTC': 45000,
    'ETH': 3200,
    'ADA': 0.85,
    'DOT': 7.5,
    'SOL': 120,
    'MATIC': 0.95,
    'LINK': 15.5,
    'UNI': 8.2,
  }

  let totalValue = 0
  let totalCost = 0
  const assetDistribution = []

  for (const symbol in assetHoldings) {
    const holding = assetHoldings[symbol]
    const currentPrice = mockPrices[symbol] || 1
    const currentValue = holding.amount * currentPrice

    if (holding.amount > 0) {
      totalValue += currentValue
      totalCost += holding.totalCost

      assetDistribution.push({
        symbol,
        name: holding.name,
        value: currentValue,
        amount: holding.amount,
        averagePrice: holding.totalCost / holding.amount,
        percentage: 0, // Will be calculated later
      })
    }
  }

  // Calculate percentages
  assetDistribution.forEach(asset => {
    asset.percentage = totalValue > 0 ? (asset.value / totalValue) * 100 : 0
  })

  // Sort by value
  assetDistribution.sort((a, b) => b.value - a.value)

  // Calculate gains/losses
  const totalGainLoss = totalValue - totalCost
  const totalGainLossPercentage = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0

  // Calculate period change (mock calculation)
  const periodChange = totalValue * 0.05 // Mock 5% change
  const periodChangePercentage = 5

  // Generate performance history (mock data)
  const performanceHistory = []
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  let runningValue = totalValue * 0.8 // Start at 80% of current value

  for (let i = 0; i <= Math.min(days, 30); i++) {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
    const change = runningValue * (Math.random() * 0.1 - 0.05) // Random change
    runningValue += change

    performanceHistory.push({
      date: date.toISOString().split('T')[0],
      value: runningValue,
      change,
      changePercentage: (change / (runningValue - change)) * 100,
    })
  }

  // Calculate top gainers and losers
  const topGainers = assetDistribution
    .filter(asset => asset.value > asset.averagePrice * asset.amount)
    .map(asset => ({
      symbol: asset.symbol,
      name: asset.name,
      gain: asset.value - asset.averagePrice * asset.amount,
      gainPercentage: ((asset.value - asset.averagePrice * asset.amount) / (asset.averagePrice * asset.amount)) * 100,
    }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 5)

  const topLosers = assetDistribution
    .filter(asset => asset.value < asset.averagePrice * asset.amount)
    .map(asset => ({
      symbol: asset.symbol,
      name: asset.name,
      loss: asset.averagePrice * asset.amount - asset.value,
      lossPercentage: ((asset.averagePrice * asset.amount - asset.value) / (asset.averagePrice * asset.amount)) * 100,
    }))
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 5)

  // Calculate transaction summary
  const transactionSummary = {
    totalTransactions: transactions.length,
    buys: transactions.filter(t => t.type === 'BUY').length,
    sells: transactions.filter(t => t.type === 'SELL').length,
    transfers: transactions.filter(t => t.type.includes('TRANSFER')).length,
    totalVolume: transactions.reduce((sum, t) => sum + t.totalUsd, 0),
  }

  return {
    totalValue,
    totalGainLoss,
    totalGainLossPercentage,
    periodChange,
    periodChangePercentage,
    assetDistribution,
    performanceHistory,
    topGainers,
    topLosers,
    transactionSummary,
  }
}