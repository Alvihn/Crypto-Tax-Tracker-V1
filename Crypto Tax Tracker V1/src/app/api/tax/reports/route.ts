import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const taxYear = searchParams.get('taxYear')

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required parameter: userId' },
        { status: 400 }
      )
    }

    const whereClause: any = { userId }
    
    if (taxYear) {
      whereClause.taxYear = parseInt(taxYear)
    }

    const taxReports = await db.taxReport.findMany({
      where: whereClause,
      include: {
        calculations: true,
      },
      orderBy: {
        taxYear: 'desc',
      },
    })

    return NextResponse.json({
      success: true,
      data: taxReports,
    })
  } catch (error) {
    console.error('Error fetching tax reports:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tax reports' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, taxYear, name } = body

    if (!userId || !taxYear || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, taxYear, and name' },
        { status: 400 }
      )
    }

    // Check if user exists
    const user = await db.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if report already exists for this user, year, and name
    const existingReport = await db.taxReport.findUnique({
      where: {
        userId_taxYear_name: {
          userId,
          taxYear,
          name,
        },
      },
    })

    if (existingReport) {
      return NextResponse.json(
        { error: 'Tax report with this name already exists for the specified year' },
        { status: 409 }
      )
    }

    // Create the tax report
    const taxReport = await db.taxReport.create({
      data: {
        userId,
        taxYear,
        name,
        status: 'DRAFT',
      },
    })

    return NextResponse.json({
      success: true,
      data: taxReport,
    })
  } catch (error) {
    console.error('Error creating tax report:', error)
    return NextResponse.json(
      { error: 'Failed to create tax report' },
      { status: 500 }
    )
  }
}