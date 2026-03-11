import { useState, useEffect, useMemo } from 'react'
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    RadialBarChart, RadialBar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, Legend
} from 'recharts'
import { TrendingDown, TrendingUp, Wallet, Calendar, ChevronRight, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { getAllTransactions, getAllCategories } from '../lib/db'
import { getDateRange } from '../lib/parser'
import { motion, AnimatePresence } from 'framer-motion'

const FILTERS = ['12h', '24h', '48h', '7d', '1m', 'all', 'custom']
const FILTER_LABELS = { '12h': '12H', '24h': '24H', '48h': '48H', '7d': '7D', '1m': '1M', all: 'All', custom: 'Custom' }

const DEBIT_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#dc2626', '#b45309']
const CREDIT_COLORS = ['#22c55e', '#10b981', '#06b6d4', '#14b8a6', '#84cc16']

const fmt = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtShort = (n) => {
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`
    return `₹${n.toFixed(0)}`
}

function CustomTooltip({ active, payload, label }) {
    if (active && payload?.length) {
        return (
            <div className="glass-card p-3 text-xs">
                <p className="font-semibold mb-1 opacity-70">{label}</p>
                {payload.map((p, i) => (
                    <p key={i} style={{ color: p.color }}>
                        {p.name}: {fmtShort(p.value)}
                    </p>
                ))}
            </div>
        )
    }
    return null
}

export default function HomeTab() {
    const [transactions, setTransactions] = useState([])
    const [categories, setCategories] = useState({})
    const [filter, setFilter] = useState('all')
    const [view, setView] = useState('debit') // debit | credit | compare
    const [customStart, setCustomStart] = useState('')
    const [customEnd, setCustomEnd] = useState('')
    const [showCustom, setShowCustom] = useState(false)
    const [loading, setLoading] = useState(true)
    const [expandedTx, setExpandedTx] = useState(null)
    useEffect(() => {
        Promise.all([getAllTransactions(), getAllCategories()]).then(([txs, cats]) => {
            setTransactions(txs)
            const catMap = {}
            cats.forEach(c => { catMap[c.upiId] = c })
            setCategories(catMap)
            setLoading(false)
        })
    }, [])

    // Filter transactions by date range
    const filtered = useMemo(() => {
        const { start, end } = getDateRange(filter, customStart, customEnd)
        return transactions.filter(tx => {
            const d = new Date(tx.date)
            return d >= start && d <= end
        })
    }, [transactions, filter, customStart, customEnd])

    const debits = useMemo(() => filtered.filter(t => t.type === 'debit'), [filtered])
    const credits = useMemo(() => filtered.filter(t => t.type === 'credit'), [filtered])

    const totalDebit = useMemo(() => debits.reduce((s, t) => s + Math.abs(t.amount), 0), [debits])
    const totalCredit = useMemo(() => credits.reduce((s, t) => s + Math.abs(t.amount), 0), [credits])
    const netAmount = totalCredit - totalDebit
    const currentBalance = useMemo(() => {
        // Use the filtered set if a date filter is active; otherwise use all transactions
        const pool = filter === 'all' ? transactions : filtered
        if (!pool.length) return 0
        // Sort by date desc, find the last transaction that has a valid (non-zero) balance.
        // The very last row in the PDF sometimes has balance=0 because the footer text
        // Sort by date desc, then by createdAt desc to preserve exact PDF sequence
        // This guarantees we find the true daily closing balance when multiple txs happen on the same day.
        const sorted = [...pool].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        const lastWithBalance = sorted.find(t => t.balance > 0)
        if (lastWithBalance) return lastWithBalance.balance
        // Fallback: arithmetic (approximate, ignores opening balance)
        const allDebits = transactions.reduce((s, t) => t.type === 'debit' ? s + Math.abs(t.amount) : s, 0)
        const allCredits = transactions.reduce((s, t) => t.type === 'credit' ? s + Math.abs(t.amount) : s, 0)
        return allCredits - allDebits
    }, [transactions, filtered, filter])

    // Daily spending data for charts
    const dailyData = useMemo(() => {
        const map = {}
        const txs = view === 'debit' ? debits : view === 'credit' ? credits : filtered
        txs.forEach(tx => {
            const d = tx.date
            if (!map[d]) map[d] = { date: d, debit: 0, credit: 0 }
            map[d][tx.type === 'debit' ? 'debit' : 'credit'] += Math.abs(tx.amount)
        })
        return Object.values(map)
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(d => ({
                ...d,
                date: d.date.slice(5), // MM-DD
                amount: view === 'debit' ? d.debit : view === 'credit' ? d.credit : (d.debit + d.credit),
            }))
    }, [filtered, debits, credits, view])

    // Category breakdown for pie
    const categoryData = useMemo(() => {
        const source = view === 'debit' ? debits : view === 'credit' ? credits : filtered
        const map = {}
        source.forEach(tx => {
            const catName = categories[tx.upiId]?.name || tx.category || 'Others'
            map[catName] = (map[catName] || 0) + Math.abs(tx.amount)
        })
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, value]) => ({ name, value }))
    }, [view, debits, credits, filtered, categories])

    // Top UPIs for bar chart
    const topUpiData = useMemo(() => {
        const source = view === 'debit' ? debits : view === 'credit' ? credits : filtered
        const map = {}
        source.forEach(tx => {
            const label = categories[tx.upiId]?.name || tx.upiId.split('@')[0].slice(0, 12)
            map[label] = (map[label] || 0) + Math.abs(tx.amount)
        })
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([name, value]) => ({ name, value }))
    }, [view, debits, credits, filtered, categories])

    // Radial compare data
    const radialData = [
        { name: 'Debit', value: totalDebit, fill: '#ef4444' },
        { name: 'Credit', value: totalCredit, fill: '#22c55e' },
    ]

    const displayTxs = view === 'debit' ? debits : view === 'credit' ? credits : filtered
    const COLORS = view === 'credit' ? CREDIT_COLORS : DEBIT_COLORS

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-muted-foreground text-sm">Loading analytics...</p>
            </div>
        )
    }

    if (!transactions.length) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-6 px-8 text-center">
                <div className="w-20 h-20 rounded-2xl balance-card flex items-center justify-center">
                    <Wallet className="w-10 h-10 opacity-60" />
                </div>
                <div>
                    <p className="text-lg font-bold mb-2">No Data Yet</p>
                    <p className="text-muted-foreground text-sm">Upload your bank statement in the Upload tab to get started.</p>
                </div>
            </div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-4 pb-4"
        >
            {/* Header */}
            <div className="pt-4 pb-2">
                <h1 className="text-xl font-bold gradient-text">ExpenseIQ</h1>
                <p className="text-xs text-muted-foreground mt-0.5">{transactions.length} transactions loaded</p>
            </div>

            {/* Balance Card */}
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="balance-card rounded-2xl p-5 mb-4 relative z-10"
            >
                <p className="text-xs text-primary opacity-80 mb-1 font-medium">Current Balance</p>
                <p className="text-3xl font-black text-white mb-4">{fmt(Math.abs(currentBalance))}</p>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-xs text-red-300 flex items-center gap-1 mb-1">
                            <ArrowUpRight className="w-3 h-3" /> Total Debited
                        </p>
                        <p className="text-base font-bold debit-text">{fmt(totalDebit)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-green-300 flex items-center gap-1 mb-1">
                            <ArrowDownLeft className="w-3 h-3" /> Total Credited
                        </p>
                        <p className="text-base font-bold credit-text">{fmt(totalCredit)}</p>
                    </div>
                </div>
            </motion.div>

            {/* Time filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 no-scrollbar">
                {FILTERS.map(f => (
                    <button
                        key={f}
                        className={`filter-pill ${filter === f ? 'active' : ''}`}
                        onClick={() => {
                            setFilter(f)
                            setShowCustom(f === 'custom')
                        }}
                    >
                        {FILTER_LABELS[f]}
                    </button>
                ))}
            </div>

            {/* Custom date range */}
            <AnimatePresence>
                {showCustom && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="glass-card p-3 mb-4 flex gap-2"
                    >
                        <input
                            type="date"
                            value={customStart}
                            onChange={e => setCustomStart(e.target.value)}
                            className="flex-1 bg-transparent text-xs border border-border rounded-lg px-2 py-1.5"
                        />
                        <span className="text-muted-foreground text-xs self-center">→</span>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={e => setCustomEnd(e.target.value)}
                            className="flex-1 bg-transparent text-xs border border-border rounded-lg px-2 py-1.5"
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* View toggle */}
            <div className="glass-card p-1 flex gap-1 mb-4">
                {[
                    { id: 'debit', label: 'Debit', color: 'debit-card' },
                    { id: 'credit', label: 'Credit', color: 'credit-card' },
                    { id: 'compare', label: 'Compare', color: 'balance-card' },
                ].map(({ id, label, color }) => (
                    <button
                        key={id}
                        onClick={() => setView(id)}
                        className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all duration-200 ${view === id
                            ? `${color} text-white`
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Summary mini-cards */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                    {
                        label: 'Transactions',
                        value: displayTxs.length,
                        icon: Calendar,
                        color: 'hsl(var(--primary))',
                    },
                    {
                        label: view === 'compare' ? 'Total Spent' : view === 'debit' ? 'Total Spent' : 'Total Earned',
                        value: fmtShort(view === 'debit' ? totalDebit : view === 'credit' ? totalCredit : totalDebit),
                        icon: view !== 'credit' ? TrendingDown : TrendingUp,
                        color: view !== 'credit' ? '#ef4444' : '#22c55e',
                    },
                    {
                        label: 'Net Flow',
                        value: fmtShort(Math.abs(netAmount)),
                        icon: Wallet,
                        color: netAmount >= 0 ? '#22c55e' : '#ef4444',
                    },
                ].map(({ label, value, icon: Icon, color }, i) => (
                    <motion.div
                        key={label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="glass-card p-3 text-center"
                    >
                        <Icon className="w-4 h-4 mx-auto mb-1" style={{ color }} />
                        <p className="text-xs font-bold truncate" style={{ color }}>{value}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                    </motion.div>
                ))}
            </div>

            {/* Area Chart */}
            <div className="chart-container mb-4">
                <p className="text-sm font-semibold mb-3">
                    {view === 'compare' ? 'Daily Flow' : `Daily ${view === 'debit' ? 'Spending' : 'Income'}`}
                </p>
                <ResponsiveContainer width="100%" height={160}>
                    {view === 'compare' ? (
                        <AreaChart data={dailyData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                            <defs>
                                <linearGradient id="gradDebit" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gradCredit2" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }} />
                            <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }} tickFormatter={v => fmtShort(v)} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="debit" name="Debit" stroke="#ef4444" fill="url(#gradDebit)" strokeWidth={2} />
                            <Area type="monotone" dataKey="credit" name="Credit" stroke="#22c55e" fill="url(#gradCredit2)" strokeWidth={2} />
                        </AreaChart>
                    ) : (
                        <AreaChart data={dailyData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                            <defs>
                                <linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={view === 'credit' ? '#22c55e' : '#ef4444'} stopOpacity={0.5} />
                                    <stop offset="100%" stopColor={view === 'credit' ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }} />
                            <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }} tickFormatter={v => fmtShort(v)} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="amount" name={view === 'credit' ? 'Income' : 'Spending'} stroke={view === 'credit' ? '#22c55e' : '#ef4444'} fill="url(#gradArea)" strokeWidth={2} />
                        </AreaChart>
                    )}
                </ResponsiveContainer>
            </div>

            {/* Bar chart: Top UPIs */}
            <div className="chart-container mb-4">
                <p className="text-sm font-semibold mb-3">Top UPIs</p>
                <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={topUpiData} margin={{ top: 5, right: 5, bottom: 20, left: -20 }} barSize={14}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)' }} angle={-25} textAnchor="end" />
                        <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }} tickFormatter={v => fmtShort(v)} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" name="Amount" radius={[4, 4, 0, 0]}>
                            {topUpiData.map((_, index) => (
                                <Cell key={index} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Pie + Radial side by side */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                {/* Pie chart */}
                <div className="chart-container mb-0">
                    <p className="text-xs font-semibold mb-2">By Category</p>
                    <ResponsiveContainer width="100%" height={140}>
                        <PieChart>
                            <Pie data={categoryData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3} dataKey="value">
                                {categoryData.map((_, i) => (
                                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                formatter={(v, n) => [fmtShort(v), n]}
                                contentStyle={{ background: 'rgba(10,10,20,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Radial bar chart */}
                <div className="chart-container mb-0">
                    <p className="text-xs font-semibold mb-2">Debit vs Credit</p>
                    <ResponsiveContainer width="100%" height={140}>
                        <RadialBarChart cx="50%" cy="50%" innerRadius={25} outerRadius={60} data={radialData} startAngle={90} endAngle={-270}>
                            <RadialBar dataKey="value" label={false} background={{ fill: 'rgba(255,255,255,0.04)' }} />
                            <Tooltip
                                formatter={(v, n) => [fmtShort(v), n]}
                                contentStyle={{ background: 'rgba(10,10,20,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                            />
                        </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-1 mt-1">
                        {radialData.map(d => (
                            <div key={d.name} className="flex items-center gap-1.5 text-[9px]">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                                <span className="truncate text-muted-foreground">{d.name}: {fmtShort(d.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Category legend */}
            <div className="glass-card p-3 mb-4">
                <p className="text-xs font-semibold mb-2">Category Breakdown</p>
                <div className="flex flex-col gap-2">
                    {categoryData.slice(0, 6).map((d, i) => {
                        const pct = view === 'debit' ? (d.value / totalDebit * 100) : view === 'credit' ? (d.value / totalCredit * 100) : (d.value / (totalDebit + totalCredit) * 100)
                        return (
                            <div key={d.name} className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                                <span className="text-xs flex-1 truncate">{d.name}</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: COLORS[i % COLORS.length] }} />
                                    </div>
                                    <span className="text-xs text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Transaction list */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold">Recent Transactions</p>
                    <span className="text-xs text-muted-foreground">{displayTxs.length} total</span>
                </div>
                <div className="flex flex-col gap-2">
                    <AnimatePresence>
                        {displayTxs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).map((tx, i) => {
                            const catInfo = categories[tx.upiId]
                            const displayName = catInfo?.name || tx.upiId.split('@')[0].slice(0, 18)
                            const initial = displayName[0]?.toUpperCase() || '?'
                            const isDebit = tx.type === 'debit'
                            const bgColors = ['hsl(var(--primary))', '#2563eb', '#dc2626', '#16a34a', '#d97706', '#0891b2', '#9333ea', '#db2777']
                            const bubbleBg = bgColors[displayName.charCodeAt(0) % bgColors.length]

                            return (
                                <motion.div
                                    key={tx.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.02 }}
                                    className="tx-item"
                                    onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}
                                >
                                    <div className="upi-bubble" style={{ background: `${bubbleBg}22`, border: `1px solid ${bubbleBg}44` }}>
                                        <span style={{ color: bubbleBg }}>{initial}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold truncate">{displayName}</p>
                                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                            <span className="px-1.5 py-0.5 rounded-full text-[9px]"
                                                style={{ background: `${bubbleBg}22`, color: bubbleBg }}>
                                                {tx.category}
                                            </span>
                                            <span>{tx.date}</span>
                                        </p>
                                        <AnimatePresence>
                                            {expandedTx === tx.id && (
                                                <motion.p
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="text-[9px] text-muted-foreground mt-1 break-all"
                                                >
                                                    {tx.description}
                                                </motion.p>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className={`text-sm font-bold ${isDebit ? 'debit-text' : 'credit-text'}`}>
                                            {isDebit ? '-' : '+'}{fmt(tx.amount)}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">{isDebit ? '↑ Debit' : '↓ Credit'}</p>
                                    </div>
                                </motion.div>
                            )
                        })}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    )
}
