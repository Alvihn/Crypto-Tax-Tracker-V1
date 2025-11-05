import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface TransactionInput {
  type: 'BUY' | 'SELL' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'MINING_REWARD' | 'STAKING_REWARD' | 'AIRDROP' | 'FEE' | 'OTHER'
  amount: number
  priceUsd: number
  feeUsd?: number
  totalUsd: number
  timestamp: string
  description?: string
  exchange?: string
  txHash?: string
  portfolioId?: string
  cryptocurrencyId: string
  userId: string
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const portfolioId = searchParams.get('portfolioId')
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required parameter: userId' },
        { status: 400 }
      )
    }

    const whereClause: any = { userId }
    
    if (portfolioId) {
      whereClause.portfolioId = portfolioId
    }
    
    if (type && type !== 'all') {
      whereClause.type = type.toUpperCase()
    }

    const transactions = await db.transaction.findMany({
      where: whereClause,
      include: {
        cryptocurrency: true,
        portfolio: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
      skip: offset,
    })

    const total = await db.transaction.count({ where: whereClause })

    return NextResponse.json({
      success: true,
      data: transactions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: TransactionInput = await request.json()

    // Validate required fields
    const requiredFields = ['type', 'amount', 'priceUsd', 'totalUsd', 'timestamp', 'cryptocurrencyId', 'userId']
    for (const field of requiredFields) {
      if (!body[field as keyof TransactionInput]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        )
      }
    }

    // Validate transaction type
    const validTypes = ['BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT', 'MINING_REWARD', 'STAKING_REWARD', 'AIRDROP', 'FEE', 'OTHER']
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid transaction type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Check if cryptocurrency exists
    const cryptocurrency = await db.cryptocurrency.findUnique({
      where: { id: body.cryptocurrencyId },
    })

    if (!cryptocurrency) {
      return NextResponse.json(
        { error: 'Cryptocurrency not found' },
        { status: 404 }
      )
    }

    // Check if user exists
    const user = await db.user.findUnique({
      where: { id: body.userId },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // If portfolioId is provided, check if it exists and belongs to the user
    if (body.portfolioId) {
      const portfolio = await db.portfolio.findFirst({
        where: {
          id: body.portfolioId,
          userId: body.userId,
        },
      })

      if (!portfolio) {
        return NextResponse.json(
          { error: 'Portfolio not found or does not belong to user' },
          { status: 404 }
        )
      }
    }

    // Create the transaction
    const transaction = await db.transaction.create({
      data: {
        type: body.type,
        amount: body.amount,
        priceUsd: body.priceUsd,
        feeUsd: body.feeUsd,
        totalUsd: body.totalUsd,
        timestamp: new Date(body.timestamp),
        description: body.description,
        exchange: body.exchange,
        txHash: body.txHash,
        portfolioId: body.portfolioId,
        cryptocurrencyId: body.cryptocurrencyId,
        userId: body.userId,
      },
      include: {
        cryptocurrency: true,
        portfolio: true,
      },
    })

    // If it's a BUY transaction, create a tax lot
    if (body.type === 'BUY') {
      await db.taxLot.create({
        data: {
          transactionId: transaction.id,
          amount: body.amount,
          costBasis: body.totalUsd,
          acquiredAt: new Date(body.timestamp),
          isClosed: false,
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: transaction,
    })
  } catch (error) {
    console.error('Error creating transaction:', error)
    return NextResponse.json(
      { error: 'Failed to create transaction' },
      { status: 500 }
    )
  }
}