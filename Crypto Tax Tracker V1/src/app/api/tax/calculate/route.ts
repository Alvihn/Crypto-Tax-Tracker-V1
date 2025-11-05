import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface TaxCalculationInput {
  userId: string
  taxYear: number
}

interface TaxLot {
  id: string
  amount: number
  costBasis: number
  acquiredAt: Date
  isClosed: boolean
  transaction: {
    type: string
    timestamp: Date
    cryptocurrency: {
      symbol: string
    }
  }
}

interface GainLossCalculation {
  shortTermGains: number
  longTermGains: number
  shortTermLosses: number
  longTermLosses: number
  totalGains: number
  totalLosses: number
  netGainLoss: number
  costBasis: number
  proceeds: number
  transactions: Array<{
    id: string
    type: string
    amount: number
    proceeds: number
    costBasis: number
    gainLoss: number
    term: 'short' | 'long'
    asset: string
    date: Date
  }>
}

export async function POST(request: NextRequest) {
  try {
    const body: TaxCalculationInput = await request.json()
    const { userId, taxYear } = body

    if (!userId || !taxYear) {
      return NextResponse.json(
        { error: 'Missing required fields: userId and taxYear' },
        { status: 400 }
      )
    }

    const yearStart = new Date(taxYear, 0, 1)
    const yearEnd = new Date(taxYear, 11, 31, 23, 59, 59)

    // Get all transactions for the user within the tax year
    const transactions = await db.transaction.findMany({
      where: {
        userId,
        timestamp: {
          gte: yearStart,
          lte: yearEnd,
        },
      },
      include: {
        cryptocurrency: true,
      },
      orderBy: {
        timestamp: 'asc',
      },
    })

    // Get all open tax lots from previous years
    const previousTaxLots = await db.taxLot.findMany({
      where: {
        transaction: {
          userId,
        },
        isClosed: false,
        acquiredAt: {
          lt: yearStart,
        },
      },
      include: {
        transaction: {
          include: {
            cryptocurrency: true,
          },
        },
      },
      orderBy: {
        acquiredAt: 'asc',
      },
    })

    // Calculate gains/losses using FIFO method
    const calculation = await calculateGainsLosses(
      transactions,
      previousTaxLots,
      yearStart,
      yearEnd
    )

    // Create or update tax report
    const taxReport = await db.taxReport.upsert({
      where: {
        userId_taxYear_name: {
          userId,
          taxYear,
          name: `${taxYear} Tax Report`,
        },
      },
      update: {
        status: 'COMPLETED',
        updatedAt: new Date(),
      },
      create: {
        userId,
        taxYear,
        name: `${taxYear} Tax Report`,
        status: 'COMPLETED',
      },
    })

    // Update tax calculations
    await db.taxCalculation.upsert({
      where: {
        taxReportId: taxReport.id,
      },
      update: {
        shortTermGains: calculation.shortTermGains,
        longTermGains: calculation.longTermGains,
        shortTermLosses: calculation.shortTermLosses,
        longTermLosses: calculation.longTermLosses,
        totalGains: calculation.totalGains,
        totalLosses: calculation.totalLosses,
        netGainLoss: calculation.netGainLoss,
        costBasis: calculation.costBasis,
        proceeds: calculation.proceeds,
      },
      create: {
        taxReportId: taxReport.id,
        shortTermGains: calculation.shortTermGains,
        longTermGains: calculation.longTermGains,
        shortTermLosses: calculation.shortTermLosses,
        longTermLosses: calculation.longTermLosses,
        totalGains: calculation.totalGains,
        totalLosses: calculation.totalLosses,
        netGainLoss: calculation.netGainLoss,
        costBasis: calculation.costBasis,
        proceeds: calculation.proceeds,
      },
    })

    return NextResponse.json({
      success: true,
      data: calculation,
      taxReportId: taxReport.id,
    })
  } catch (error) {
    console.error('Tax calculation error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate taxes' },
      { status: 500 }
    )
  }
}

async function calculateGainsLosses(
  transactions: any[],
  previousTaxLots: TaxLot[],
  yearStart: Date,
  yearEnd: Date
): Promise<GainLossCalculation> {
  const result: GainLossCalculation = {
    shortTermGains: 0,
    longTermGains: 0,
    shortTermLosses: 0,
    longTermLosses: 0,
    totalGains: 0,
    totalLosses: 0,
    netGainLoss: 0,
    costBasis: 0,
    proceeds: 0,
    transactions: [],
  }

  // Combine previous tax lots with new buy transactions
  let availableLots: TaxLot[] = [...previousTaxLots]

  // Process transactions in chronological order
  for (const transaction of transactions) {
    if (transaction.type === 'BUY') {
      // Create new tax lot for buy transactions
      const newLot: TaxLot = {
        id: `lot-${transaction.id}`,
        amount: transaction.amount,
        costBasis: transaction.totalUsd,
        acquiredAt: transaction.timestamp,
        isClosed: false,
        transaction: transaction,
      }
      availableLots.push(newLot)
    } else if (transaction.type === 'SELL') {
      // Process sell transactions using FIFO
      let remainingAmount = transaction.amount
      let totalCostBasis = 0
      let totalProceeds = transaction.totalUsd

      while (remainingAmount > 0 && availableLots.length > 0) {
        const lot = availableLots[0]
        const lotAmount = Math.min(remainingAmount, lot.amount)
        const lotCostBasis = (lot.costBasis / lot.amount) * lotAmount
        const lotProceeds = (totalProceeds / transaction.amount) * lotAmount
        const gainLoss = lotProceeds - lotCostBasis

        // Determine if short-term or long-term
        const holdingPeriod = transaction.timestamp.getTime() - lot.acquiredAt.getTime()
        const daysHeld = holdingPeriod / (1000 * 60 * 60 * 24)
        const isLongTerm = daysHeld > 365

        // Update totals
        totalCostBasis += lotCostBasis

        if (gainLoss > 0) {
          result.totalGains += gainLoss
          if (isLongTerm) {
            result.longTermGains += gainLoss
          } else {
            result.shortTermGains += gainLoss
          }
        } else {
          result.totalLosses += Math.abs(gainLoss)
          if (isLongTerm) {
            result.longTermLosses += Math.abs(gainLoss)
          } else {
            result.shortTermLosses += Math.abs(gainLoss)
          }
        }

        // Add to transaction details
        result.transactions.push({
          id: transaction.id,
          type: transaction.type,
          amount: lotAmount,
          proceeds: lotProceeds,
          costBasis: lotCostBasis,
          gainLoss,
          term: isLongTerm ? 'long' : 'short',
          asset: transaction.cryptocurrency.symbol,
          date: transaction.timestamp,
        })

        // Update or remove the lot
        if (lotAmount === lot.amount) {
          availableLots.shift() // Remove fully used lot
        } else {
          // Partially use the lot
          lot.amount -= lotAmount
          lot.costBasis -= lotCostBasis
        }

        remainingAmount -= lotAmount
      }

      result.costBasis += totalCostBasis
      result.proceeds += totalProceeds
    }
  }

  // Calculate net gain/loss
  result.netGainLoss = result.totalGains - result.totalLosses

  return result
}