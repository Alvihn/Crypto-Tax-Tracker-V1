import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface ImportData {
  userId: string
  portfolioId?: string
  platform: string
  format: 'csv' | 'json'
  data: string
}

interface ParsedTransaction {
  date: string
  type: string
  asset: string
  amount: number
  price: number
  total: number
  fee?: number
  description?: string
  txHash?: string
  exchange?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: ImportData = await request.json()
    const { userId, portfolioId, platform, format, data } = body

    if (!userId || !platform || !format || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, platform, format, and data' },
        { status: 400 }
      )
    }

    // Parse the import data based on format
    let transactions: ParsedTransaction[] = []

    if (format === 'csv') {
      transactions = parseCSV(data, platform)
    } else if (format === 'json') {
      transactions = parseJSON(data, platform)
    } else {
      return NextResponse.json(
        { error: 'Unsupported format. Supported formats: csv, json' },
        { status: 400 }
      )
    }

    if (transactions.length === 0) {
      return NextResponse.json(
        { error: 'No valid transactions found in the import data' },
        { status: 400 }
      )
    }

    // Validate user and portfolio
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (portfolioId) {
      const portfolio = await db.portfolio.findFirst({
        where: { id: portfolioId, userId },
      })
      if (!portfolio) {
        return NextResponse.json(
          { error: 'Portfolio not found or does not belong to user' },
          { status: 404 }
        )
      }
    }

    // Process transactions
    const results = {
      success: 0,
      errors: 0,
      skipped: 0,
      errorDetails: [] as string[],
    }

    for (const transaction of transactions) {
      try {
        // Find or create cryptocurrency
        let cryptocurrency = await db.cryptocurrency.findFirst({
          where: { symbol: transaction.asset.toUpperCase() },
        })

        if (!cryptocurrency) {
          // Create new cryptocurrency
          cryptocurrency = await db.cryptocurrency.create({
            data: {
              symbol: transaction.asset.toUpperCase(),
              name: transaction.asset,
            },
          })
        }

        // Check for duplicate transaction
        const existingTransaction = await db.transaction.findFirst({
          where: {
            userId,
            cryptocurrencyId: cryptocurrency.id,
            timestamp: new Date(transaction.date),
            type: transaction.type.toUpperCase() as any,
            amount: transaction.amount,
            totalUsd: transaction.total,
          },
        })

        if (existingTransaction) {
          results.skipped++
          continue
        }

        // Create the transaction
        const newTransaction = await db.transaction.create({
          data: {
            type: transaction.type.toUpperCase() as any,
            amount: transaction.amount,
            priceUsd: transaction.price,
            feeUsd: transaction.fee,
            totalUsd: transaction.total,
            timestamp: new Date(transaction.date),
            description: transaction.description,
            exchange: transaction.exchange || platform,
            txHash: transaction.txHash,
            portfolioId,
            cryptocurrencyId: cryptocurrency.id,
            userId,
          },
        })

        // Create tax lot for BUY transactions
        if (transaction.type.toUpperCase() === 'BUY') {
          await db.taxLot.create({
            data: {
              transactionId: newTransaction.id,
              amount: transaction.amount,
              costBasis: transaction.total,
              acquiredAt: new Date(transaction.date),
              isClosed: false,
            },
          })
        }

        results.success++
      } catch (error) {
        results.errors++
        results.errorDetails.push(
          `Error processing transaction ${transaction.asset} ${transaction.amount}: ${error}`
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: `Import completed. ${results.success} transactions imported, ${results.skipped} skipped, ${results.errors} errors.`,
      results,
    })
  } catch (error) {
    console.error('Transaction import error:', error)
    return NextResponse.json(
      { error: 'Failed to import transactions' },
      { status: 500 }
    )
  }
}

function parseCSV(csvData: string, platform: string): ParsedTransaction[] {
  const lines = csvData.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const transactions: ParsedTransaction[] = []

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const row: any = {}

      headers.forEach((header, index) => {
        row[header] = values[index]
      })

      const transaction = mapCSVRowToTransaction(row, platform)
      if (transaction) {
        transactions.push(transaction)
      }
    } catch (error) {
      console.error(`Error parsing CSV line ${i}:`, error)
    }
  }

  return transactions
}

function parseJSON(jsonData: string, platform: string): ParsedTransaction[] {
  try {
    const data = JSON.parse(jsonData)
    const transactions: ParsedTransaction[] = []

    if (Array.isArray(data)) {
      data.forEach(item => {
        const transaction = mapJSONItemToTransaction(item, platform)
        if (transaction) {
          transactions.push(transaction)
        }
      })
    }

    return transactions
  } catch (error) {
    console.error('Error parsing JSON:', error)
    return []
  }
}

function mapCSVRowToTransaction(row: any, platform: string): ParsedTransaction | null {
  try {
    // Common mappings for different platforms
    const mappings: Record<string, Record<string, string>> = {
      coinbase: {
        date: 'timestamp',
        type: 'type',
        asset: 'asset',
        amount: 'quantity',
        price: 'price',
        total: 'total',
        fee: 'fees',
        txHash: 'transaction_id',
      },
      binance: {
        date: 'date',
        type: 'type',
        asset: 'coin',
        amount: 'amount',
        price: 'price',
        total: 'total',
        fee: 'fee',
        txHash: 'tx_id',
      },
      generic: {
        date: 'date',
        type: 'type',
        asset: 'asset' || 'symbol',
        amount: 'amount' || 'quantity',
        price: 'price',
        total: 'total',
        fee: 'fee',
        txHash: 'tx_hash' || 'transaction_id',
      },
    }

    const mapping = mappings[platform.toLowerCase()] || mappings.generic

    const date = row[mapping.date] || row.date
    const type = row[mapping.type] || row.type
    const asset = row[mapping.asset] || row.asset || row.symbol
    const amount = parseFloat(row[mapping.amount] || row.amount || row.quantity)
    const price = parseFloat(row[mapping.price] || row.price)
    const total = parseFloat(row[mapping.total] || row.total)
    const fee = row[mapping.fee] || row.fee ? parseFloat(row[mapping.fee] || row.fee) : undefined
    const txHash = row[mapping.txHash] || row.tx_hash || row.transaction_id

    if (!date || !type || !asset || isNaN(amount) || isNaN(price) || isNaN(total)) {
      return null
    }

    // Normalize transaction type
    let normalizedType = type.toUpperCase()
    if (normalizedType === 'SENT') normalizedType = 'SELL'
    if (normalizedType === 'RECEIVED') normalizedType = 'BUY'
    if (normalizedType === 'INCOME') normalizedType = 'BUY'

    return {
      date,
      type: normalizedType,
      asset,
      amount,
      price,
      total,
      fee,
      txHash,
      exchange: platform,
    }
  } catch (error) {
    console.error('Error mapping CSV row:', error)
    return null
  }
}

function mapJSONItemToTransaction(item: any, platform: string): ParsedTransaction | null {
  try {
    // Similar mapping logic for JSON format
    const date = item.timestamp || item.date || item.time
    const type = item.type || item.transaction_type
    const asset = item.asset || item.coin || item.symbol || item.currency
    const amount = parseFloat(item.amount || item.quantity || item.volume)
    const price = parseFloat(item.price || item.rate)
    const total = parseFloat(item.total || item.usd_total || item.fiat_total)
    const fee = item.fee ? parseFloat(item.fee) : undefined
    const txHash = item.tx_hash || item.transaction_id || item.id

    if (!date || !type || !asset || isNaN(amount) || isNaN(price) || isNaN(total)) {
      return null
    }

    // Normalize transaction type
    let normalizedType = type.toUpperCase()
    if (normalizedType === 'SENT') normalizedType = 'SELL'
    if (normalizedType === 'RECEIVED') normalizedType = 'BUY'
    if (normalizedType === 'INCOME') normalizedType = 'BUY'

    return {
      date,
      type: normalizedType,
      asset,
      amount,
      price,
      total,
      fee,
      txHash,
      exchange: platform,
    }
  } catch (error) {
    console.error('Error mapping JSON item:', error)
    return null
  }
}