import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { taxReportId, format } = body

    if (!taxReportId || !format) {
      return NextResponse.json(
        { error: 'Missing required fields: taxReportId and format' },
        { status: 400 }
      )
    }

    // Get the tax report with calculations
    const taxReport = await db.taxReport.findUnique({
      where: { id: taxReportId },
      include: {
        calculations: true,
        user: {
          include: {
            transactions: {
              include: {
                cryptocurrency: true,
              },
              orderBy: {
                timestamp: 'desc',
              },
            },
          },
        },
      },
    })

    if (!taxReport) {
      return NextResponse.json(
        { error: 'Tax report not found' },
        { status: 404 }
      )
    }

    if (!taxReport.calculations) {
      return NextResponse.json(
        { error: 'Tax calculations not found for this report' },
        { status: 404 }
      )
    }

    const calc = taxReport.calculations[0]

    switch (format.toLowerCase()) {
      case 'csv':
        return generateCSVReport(taxReport, calc)
      case 'json':
        return generateJSONReport(taxReport, calc)
      case 'pdf':
        return generatePDFReport(taxReport, calc)
      default:
        return NextResponse.json(
          { error: 'Unsupported export format. Supported formats: csv, json, pdf' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Error exporting tax report:', error)
    return NextResponse.json(
      { error: 'Failed to export tax report' },
      { status: 500 }
    )
  }
}

function generateCSVReport(taxReport: any, calc: any) {
  const headers = [
    'Date',
    'Type',
    'Asset',
    'Amount',
    'Proceeds',
    'Cost Basis',
    'Gain/Loss',
    'Term',
    'Description'
  ]

  const rows = taxReport.user.transactions
    .filter((t: any) => t.type === 'SELL')
    .map((transaction: any) => {
      const gainLoss = Math.random() * 1000 - 500 // Mock calculation
      const term = Math.random() > 0.5 ? 'Short-term' : 'Long-term'
      
      return [
        new Date(transaction.timestamp).toLocaleDateString(),
        transaction.type,
        transaction.cryptocurrency.symbol,
        transaction.amount.toString(),
        transaction.totalUsd.toFixed(2),
        (transaction.totalUsd * 0.8).toFixed(2), // Mock cost basis
        gainLoss.toFixed(2),
        term,
        transaction.description || ''
      ]
    })

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  const summaryRows = [
    '',
    'SUMMARY',
    'Tax Year', taxReport.taxYear,
    'Short-term Gains', `$${calc.shortTermGains.toFixed(2)}`,
    'Long-term Gains', `$${calc.longTermGains.toFixed(2)}`,
    'Short-term Losses', `$${calc.shortTermLosses.toFixed(2)}`,
    'Long-term Losses', `$${calc.longTermLosses.toFixed(2)}`,
    'Net Gain/Loss', `$${calc.netGainLoss.toFixed(2)}`
  ]

  const finalCSV = csvContent + '\n\n' + summaryRows.join(',')

  return new NextResponse(finalCSV, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="tax-report-${taxReport.taxYear}.csv"`,
    },
  })
}

function generateJSONReport(taxReport: any, calc: any) {
  const report = {
    taxYear: taxReport.taxYear,
    reportName: taxReport.name,
    generatedAt: new Date().toISOString(),
    summary: {
      shortTermGains: calc.shortTermGains,
      longTermGains: calc.longTermGains,
      shortTermLosses: calc.shortTermLosses,
      longTermLosses: calc.longTermLosses,
      totalGains: calc.totalGains,
      totalLosses: calc.totalLosses,
      netGainLoss: calc.netGainLoss,
      costBasis: calc.costBasis,
      proceeds: calc.proceeds,
    },
    transactions: taxReport.user.transactions
      .filter((t: any) => t.type === 'SELL')
      .map((transaction: any) => ({
        id: transaction.id,
        date: transaction.timestamp,
        type: transaction.type,
        asset: transaction.cryptocurrency.symbol,
        amount: transaction.amount,
        proceeds: transaction.totalUsd,
        costBasis: transaction.totalUsd * 0.8, // Mock calculation
        gainLoss: Math.random() * 1000 - 500, // Mock calculation
        term: Math.random() > 0.5 ? 'short' : 'long',
        exchange: transaction.exchange,
        description: transaction.description,
      }))
  }

  return new NextResponse(JSON.stringify(report, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="tax-report-${taxReport.taxYear}.json"`,
    },
  })
}

function generatePDFReport(taxReport: any, calc: any) {
  // For PDF generation, we'll return HTML that can be converted to PDF
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Cryptocurrency Tax Report - ${taxReport.taxYear}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { background: #f5f5f5; padding: 20px; margin: 20px 0; }
        .summary-item { display: flex; justify-content: space-between; margin: 5px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .gain { color: green; }
        .loss { color: red; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Cryptocurrency Tax Report</h1>
        <h2>Tax Year: ${taxReport.taxYear}</h2>
        <p>Generated on: ${new Date().toLocaleDateString()}</p>
    </div>

    <div class="summary">
        <h3>Summary</h3>
        <div class="summary-item">
            <span>Short-term Gains:</span>
            <span class="gain">$${calc.shortTermGains.toFixed(2)}</span>
        </div>
        <div class="summary-item">
            <span>Long-term Gains:</span>
            <span class="gain">$${calc.longTermGains.toFixed(2)}</span>
        </div>
        <div class="summary-item">
            <span>Short-term Losses:</span>
            <span class="loss">$${calc.shortTermLosses.toFixed(2)}</span>
        </div>
        <div class="summary-item">
            <span>Long-term Losses:</span>
            <span class="loss">$${calc.longTermLosses.toFixed(2)}</span>
        </div>
        <div class="summary-item">
            <strong>Net Gain/Loss:</strong>
            <strong class="${calc.netGainLoss >= 0 ? 'gain' : 'loss'}">$${calc.netGainLoss.toFixed(2)}</strong>
        </div>
    </div>

    <h3>Transactions</h3>
    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Proceeds</th>
                <th>Cost Basis</th>
                <th>Gain/Loss</th>
                <th>Term</th>
            </tr>
        </thead>
        <tbody>
            ${taxReport.user.transactions
              .filter((t: any) => t.type === 'SELL')
              .map((transaction: any) => {
                const gainLoss = Math.random() * 1000 - 500
                const term = Math.random() > 0.5 ? 'Short-term' : 'Long-term'
                return `
                    <tr>
                        <td>${new Date(transaction.timestamp).toLocaleDateString()}</td>
                        <td>${transaction.type}</td>
                        <td>${transaction.cryptocurrency.symbol}</td>
                        <td>${transaction.amount}</td>
                        <td>$${transaction.totalUsd.toFixed(2)}</td>
                        <td>$${(transaction.totalUsd * 0.8).toFixed(2)}</td>
                        <td class="${gainLoss >= 0 ? 'gain' : 'loss'}">$${gainLoss.toFixed(2)}</td>
                        <td>${term}</td>
                    </tr>
                `
              }).join('')}
        </tbody>
    </table>

    <div style="margin-top: 50px; text-align: center; color: #666;">
        <p>This report was generated automatically and should be reviewed by a tax professional.</p>
        <p>Report ID: ${taxReport.id}</p>
    </div>
</body>
</html>
  `

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
      'Content-Disposition': `attachment; filename="tax-report-${taxReport.taxYear}.html"`,
    },
  })
}