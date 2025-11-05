import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface CryptocurrencyInput {
  symbol: string
  name: string
  coingeckoId?: string
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')

    let whereClause: any = {}
    
    if (search) {
      whereClause = {
        OR: [
          { symbol: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      }
    }

    const cryptocurrencies = await db.cryptocurrency.findMany({
      where: whereClause,
      orderBy: {
        symbol: 'asc',
      },
      take: limit,
    })

    return NextResponse.json({
      success: true,
      data: cryptocurrencies,
    })
  } catch (error) {
    console.error('Error fetching cryptocurrencies:', error)
    return NextResponse.json(
      { error: 'Failed to fetch cryptocurrencies' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CryptocurrencyInput = await request.json()

    // Validate required fields
    if (!body.symbol || !body.name) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol and name' },
        { status: 400 }
      )
    }

    // Check if cryptocurrency already exists
    const existingCrypto = await db.cryptocurrency.findFirst({
      where: {
        OR: [
          { symbol: body.symbol.toUpperCase() },
          { name: { equals: body.name, mode: 'insensitive' } },
        ],
      },
    })

    if (existingCrypto) {
      return NextResponse.json(
        { error: 'Cryptocurrency with this symbol or name already exists' },
        { status: 409 }
      )
    }

    // Create the cryptocurrency
    const cryptocurrency = await db.cryptocurrency.create({
      data: {
        symbol: body.symbol.toUpperCase(),
        name: body.name,
        coingeckoId: body.coingeckoId,
      },
    })

    return NextResponse.json({
      success: true,
      data: cryptocurrency,
    })
  } catch (error) {
    console.error('Error creating cryptocurrency:', error)
    return NextResponse.json(
      { error: 'Failed to create cryptocurrency' },
      { status: 500 }
    )
  }
}