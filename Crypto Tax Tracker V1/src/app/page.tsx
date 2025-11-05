'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Bitcoin, Plus, Download, FileText, Upload } from 'lucide-react'

interface Transaction {
  id: string
  type: string
  amount: number
  priceUsd: number
  totalUsd: number
  timestamp: string
  description?: string
  exchange?: string
  txHash?: string
  cryptocurrency: {
    symbol: string
    name: string
  }
}

interface Portfolio {
  id: string
  name: string
  totalValue: number
  change24h: number
}

interface TaxReport {
  id: string
  name: string
  taxYear: number
  status: string
  calculations?: {
    shortTermGains: number
    longTermGains: number
    shortTermLosses: number
    longTermLosses: number
    netGainLoss: number
  }
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

const mockPortfolioData: Portfolio[] = [
  { id: '1', name: 'Main Portfolio', totalValue: 45230.50, change24h: 5.2 },
  { id: '2', name: 'Trading Portfolio', totalValue: 12890.75, change24h: -2.1 },
]

const assetDistribution = [
  { name: 'Bitcoin', value: 65, symbol: 'BTC' },
  { name: 'Ethereum', value: 20, symbol: 'ETH' },
  { name: 'Cardano', value: 10, symbol: 'ADA' },
  { name: 'Others', value: 5, symbol: 'OTH' },
]

const monthlyGains = [
  { month: 'Jan', gains: 5000, losses: 1200 },
  { month: 'Feb', gains: 3200, losses: 800 },
  { month: 'Mar', gains: 7800, losses: 2100 },
  { month: 'Apr', gains: 4500, losses: 1500 },
  { month: 'May', gains: 6200, losses: 900 },
  { month: 'Jun', gains: 8900, losses: 3200 },
]

export default function Home() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>(mockPortfolioData)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [taxReports, setTaxReports] = useState<TaxReport[]>([])
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedTaxReport, setSelectedTaxReport] = useState<string>('')
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'pdf'>('csv')

  // Mock user ID - in a real app, this would come from authentication
  const userId = 'user-1'

  useEffect(() => {
    fetchTransactions()
    fetchTaxReports()
  }, [])

  const fetchTransactions = async () => {
    try {
      const response = await fetch(`/api/transactions?userId=${userId}&limit=50`)
      if (response.ok) {
        const data = await response.json()
        setTransactions(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching transactions:', error)
    }
  }

  const fetchTaxReports = async () => {
    try {
      const response = await fetch(`/api/tax/reports?userId=${userId}`)
      if (response.ok) {
        const data = await response.json()
        setTaxReports(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching tax reports:', error)
    }
  }

  const handleGenerateTaxReport = async (taxYear: number) => {
    setLoading(true)
    try {
      const response = await fetch('/api/tax/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, taxYear }),
      })

      if (response.ok) {
        await fetchTaxReports()
        alert('Tax report generated successfully!')
      } else {
        alert('Failed to generate tax report')
      }
    } catch (error) {
      console.error('Error generating tax report:', error)
      alert('Error generating tax report')
    } finally {
      setLoading(false)
    }
  }

  const handleExportData = async () => {
    try {
      const response = await fetch(`/api/transactions?userId=${userId}&limit=1000`)
      if (response.ok) {
        const data = await response.json()
        const csv = convertToCSV(data.data)
        downloadCSV(csv, 'transactions.csv')
      }
    } catch (error) {
      console.error('Error exporting data:', error)
      alert('Error exporting data')
    }
  }

  const handleExportTaxReport = async () => {
    if (!selectedTaxReport) {
      alert('Please select a tax report to export')
      return
    }

    try {
      const response = await fetch('/api/tax/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxReportId: selectedTaxReport, format: exportFormat }),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `tax-report-${exportFormat}`
        a.click()
        window.URL.revokeObjectURL(url)
      } else {
        alert('Failed to export tax report')
      }
    } catch (error) {
      console.error('Error exporting tax report:', error)
      alert('Error exporting tax report')
    }
  }

  const handleImportTransactions = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      const content = e.target?.result as string
      const format = file.name.endsWith('.csv') ? 'csv' : 'json'

      try {
        const response = await fetch('/api/transactions/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            platform: 'generic',
            format,
            data: content,
          }),
        })

        if (response.ok) {
          const result = await response.json()
          alert(result.message)
          await fetchTransactions()
        } else {
          const error = await response.json()
          alert(error.error || 'Import failed')
        }
      } catch (error) {
        console.error('Error importing transactions:', error)
        alert('Error importing transactions')
      }
    }
    reader.readAsText(file)
  }

  const convertToCSV = (data: Transaction[]) => {
    const headers = ['Date', 'Type', 'Asset', 'Amount', 'Price', 'Total', 'Exchange', 'Description']
    const rows = data.map(t => [
      new Date(t.timestamp).toLocaleDateString(),
      t.type,
      t.cryptocurrency.symbol,
      t.amount.toString(),
      t.priceUsd.toString(),
      t.totalUsd.toString(),
      t.exchange || '',
      t.description || ''
    ])
    
    return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
  }

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const totalPortfolioValue = portfolios.reduce((sum, portfolio) => sum + portfolio.totalValue, 0)
  const totalChange24h = portfolios.reduce((sum, portfolio) => sum + portfolio.change24h, 0) / portfolios.length

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'BUY': return 'bg-green-100 text-green-800'
      case 'SELL': return 'bg-red-100 text-red-800'
      case 'TRANSFER_IN': return 'bg-blue-100 text-blue-800'
      case 'TRANSFER_OUT': return 'bg-orange-100 text-orange-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Crypto Tax Tracker</h1>
            <p className="text-muted-foreground">Manage your cryptocurrency portfolio and tax reporting</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportData}>
              <Download className="mr-2 h-4 w-4" />
              Export Data
            </Button>
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Transactions</DialogTitle>
                  <DialogDescription>
                    Upload a CSV or JSON file with your transaction data
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="file-upload">Choose file</Label>
                    <Input
                      id="file-upload"
                      type="file"
                      accept=".csv,.json"
                      onChange={handleImportTransactions}
                    />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={isAddTransactionOpen} onOpenChange={setIsAddTransactionOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Transaction
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Transaction</DialogTitle>
                  <DialogDescription>
                    Enter your transaction details manually
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="type">Type</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="buy">Buy</SelectItem>
                          <SelectItem value="sell">Sell</SelectItem>
                          <SelectItem value="transfer">Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="asset">Asset</Label>
                      <Input id="asset" placeholder="BTC" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="amount">Amount</Label>
                      <Input id="amount" type="number" placeholder="0.5" />
                    </div>
                    <div>
                      <Label htmlFor="price">Price (USD)</Label>
                      <Input id="price" type="number" placeholder="45000" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" placeholder="Optional description" />
                  </div>
                  <Button className="w-full">Add Transaction</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Portfolio Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalPortfolioValue)}</div>
              <p className="text-xs text-muted-foreground">
                {totalChange24h >= 0 ? (
                  <span className="text-green-600 flex items-center">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    +{totalChange24h.toFixed(2)}%
                  </span>
                ) : (
                  <span className="text-red-600 flex items-center">
                    <TrendingDown className="h-3 w-3 mr-1" />
                    {totalChange24h.toFixed(2)}%
                  </span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
              <Bitcoin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{transactions.length}</div>
              <p className="text-xs text-muted-foreground">+12% from last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tax Year Gains</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(28450)}</div>
              <p className="text-xs text-muted-foreground">Short-term: {formatCurrency(18450)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tax Year Losses</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(9700)}</div>
              <p className="text-xs text-muted-foreground">Short-term: {formatCurrency(6200)}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="tax-reports">Tax Reports</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Portfolio Distribution</CardTitle>
                  <CardDescription>Asset allocation across your portfolios</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={assetDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {assetDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Monthly Gains/Losses</CardTitle>
                  <CardDescription>Your trading performance over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={monthlyGains}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="gains" fill="#22c55e" name="Gains" />
                      <Bar dataKey="losses" fill="#ef4444" name="Losses" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Your Portfolios</CardTitle>
                <CardDescription>Overview of all your cryptocurrency portfolios</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {portfolios.map((portfolio) => (
                    <div key={portfolio.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-semibold">{portfolio.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {portfolio.change24h >= 0 ? (
                            <span className="text-green-600">+{portfolio.change24h.toFixed(2)}%</span>
                          ) : (
                            <span className="text-red-600">{portfolio.change24h.toFixed(2)}%</span>
                          )}{' '}
                          24h change
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatCurrency(portfolio.totalValue)}</div>
                        <Button variant="outline" size="sm" className="mt-2">
                          View Details
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
                <CardDescription>Your latest cryptocurrency transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex gap-4">
                  <Input placeholder="Search transactions..." className="max-w-sm" />
                  <Select>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="buy">Buy</SelectItem>
                      <SelectItem value="sell">Sell</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>{formatDate(transaction.timestamp)}</TableCell>
                        <TableCell>
                          <Badge className={getTransactionTypeColor(transaction.type)}>
                            {transaction.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{transaction.cryptocurrency.symbol}</div>
                            <div className="text-sm text-muted-foreground">
                              {transaction.cryptocurrency.name}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{transaction.amount}</TableCell>
                        <TableCell>{formatCurrency(transaction.priceUsd)}</TableCell>
                        <TableCell>{formatCurrency(transaction.totalUsd)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">Edit</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tax-reports" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Tax Reports</CardTitle>
                <CardDescription>Generate and manage your tax reports</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">2024 Tax Report</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(18750)}</div>
                        <p className="text-xs text-muted-foreground">Net gains</p>
                        <Button 
                          className="mt-2 w-full" 
                          onClick={() => handleGenerateTaxReport(2024)}
                          disabled={loading}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          {loading ? 'Generating...' : 'Generate Report'}
                        </Button>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">2023 Tax Report</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(32400)}</div>
                        <p className="text-xs text-muted-foreground">Net gains</p>
                        <Button variant="outline" className="mt-2 w-full">
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Create New Report</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-2">
                          Generate tax report for any year
                        </p>
                        <Button variant="outline" className="w-full">
                          <Plus className="mr-2 h-4 w-4" />
                          New Report
                        </Button>
                      </CardContent>
                    </Card>
                  </div>

                  {taxReports.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Your Tax Reports</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {taxReports.map((report) => (
                            <div key={report.id} className="flex items-center justify-between p-3 border rounded">
                              <div>
                                <div className="font-medium">{report.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  Year: {report.taxYear} | Status: {report.status}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
                                  <DialogTrigger asChild>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => setSelectedTaxReport(report.id)}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Export Tax Report</DialogTitle>
                                      <DialogDescription>
                                        Choose export format for your tax report
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                      <div>
                                        <Label htmlFor="format">Format</Label>
                                        <Select value={exportFormat} onValueChange={(value: any) => setExportFormat(value)}>
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="csv">CSV</SelectItem>
                                            <SelectItem value="json">JSON</SelectItem>
                                            <SelectItem value="pdf">PDF</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <Button onClick={handleExportTaxReport} className="w-full">
                                        Export Report
                                      </Button>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Portfolio Analytics</CardTitle>
                <CardDescription>Detailed analysis of your cryptocurrency investments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Advanced analytics features coming soon...</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}