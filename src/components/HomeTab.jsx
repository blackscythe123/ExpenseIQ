import { useState, useEffect, useMemo } from 'react'
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    RadialBarChart, RadialBar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, Legend
} from 'recharts'
import { TrendingDown, TrendingUp, Wallet, Calendar, ArrowUpRight, ArrowDownLeft, ShoppingBag, Utensils, Plane, Smartphone, Film, Book, Stethoscope, Lightbulb, CreditCard, Coins, Landmark, Gamepad2, Car, Coffee, Briefcase } from 'lucide-react'
import { getAllTransactions, getAllCategories, upsertTransactions, upsertCategory } from '../lib/db'
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

// Custom eyelash icons — works perfectly with any color theme
function EyeOpen({ className = 'w-5 h-5', style }) {
    return (
        <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {/* eyelashes top */}
            <line x1="12" y1="2" x2="12" y2="4.5" />
            <line x1="16.5" y1="3.2" x2="15.5" y2="5.5" />
            <line x1="7.5" y1="3.2" x2="8.5" y2="5.5" />
            {/* eye outline */}
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
            {/* pupil */}
            <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </svg>
    )
}

function EyeClosed({ className = 'w-5 h-5', style }) {
    return (
        <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {/* eyelashes pointing down */}
            <line x1="12" y1="22" x2="12" y2="19.5" />
            <line x1="16.5" y1="20.8" x2="15.5" y2="18.5" />
            <line x1="7.5" y1="20.8" x2="8.5" y2="18.5" />
            {/* closed lid arc */}
            <path d="M1 12s4-5 11-5 11 5 11 5" />
            <path d="M3.5 14.5 Q12 19 20.5 14.5" />
        </svg>
    )
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

const DEFAULT_CATEGORIES = ['Food', 'Shopping', 'Travel', 'Recharge', 'Entertainment', 'Education', 'Health', 'Utilities', 'Loan/EMI', 'Others']

const CATEGORY_ICONS = {
    '🛍️': ShoppingBag, '🍔': Utensils, '✈️': Plane, '📱': Smartphone, '🎬': Film,
    '📚': Book, '🏥': Stethoscope, '💡': Lightbulb, '💳': CreditCard, '💰': Coins,
    '🏦': Landmark, '🎮': Gamepad2, '🚗': Car, '☕': Coffee, '💼': Briefcase
}

function TxItem({ tx, i, categories, transactions, expandedTx, setExpandedTx, handleUpdateTx, fmt }) {
    const isExpanded = expandedTx === tx.id
    const catInfo = categories[tx.upiId]
    const defaultDisplayName = catInfo?.name || tx.upiId?.split('@')?.[0]?.slice(0, 18) || tx.description?.slice(0, 18) || 'Unknown'
    const displayName = tx.overrideName || defaultDisplayName
    const initial = catInfo?.emoji || displayName[0]?.toUpperCase() || '?'
    const isDebit = tx.type === 'debit'
    const finalCategory = tx.overrideCategory || catInfo?.categoryTag || tx.category || 'Others'
    const bgColors = ['hsl(var(--primary))', '#2563eb', '#dc2626', '#16a34a', '#d97706', '#0891b2', '#9333ea', '#db2777']
    const bubbleBg = bgColors[(displayName.charCodeAt(0) || 0) % bgColors.length]
    
    const [editName, setEditName] = useState(displayName)
    const [editCategory, setEditCategory] = useState(finalCategory)

    useEffect(() => {
        if (isExpanded) {
            setEditName(displayName)
            setEditCategory(finalCategory)
        }
    }, [isExpanded, displayName, finalCategory])

    const saveChanges = (e) => {
        if (e) e.stopPropagation()
        handleUpdateTx(tx, { overrideName: editName.trim() || undefined, overrideCategory: editCategory.trim() || undefined })
        setExpandedTx(null)
    }

    const allAvailableCategories = Array.from(new Set([
        ...DEFAULT_CATEGORIES, 
        ...Object.values(categories).map(c => c.categoryTag).filter(Boolean),
        ...(transactions || []).map(t => t.overrideCategory).filter(Boolean)
    ]))

    return (
        <motion.div
            key={tx.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02 }}
            className="tx-item"
            onClick={() => setExpandedTx(isExpanded ? null : tx.id)}
            style={{ cursor: isExpanded ? 'default' : 'pointer' }}
        >
            <div className="upi-bubble flex items-center justify-center text-lg" style={{ background: `${bubbleBg}22`, border: `1px solid ${bubbleBg}44`, color: bubbleBg, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setExpandedTx(isExpanded ? null : tx.id) }}>
                {(() => {
                    const IconComp = CATEGORY_ICONS[initial];
                    return IconComp ? <IconComp className="w-5 h-5 opacity-80" /> : <span>{initial}</span>;
                })()}
            </div>
            <div className="flex-1 min-w-0" onClick={(e) => { if (!isExpanded) { e.stopPropagation(); setExpandedTx(tx.id); } }}>
                {!isExpanded ? (
                    <>
                        <p className="text-xs font-semibold truncate cursor-pointer">{displayName}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 cursor-pointer">
                            <span className="px-1.5 py-0.5 rounded-full text-[9px]"
                                style={{ background: `${bubbleBg}22`, color: bubbleBg }}>
                                {finalCategory}
                            </span>
                            <span>{tx.date}</span>
                        </p>
                    </>
                ) : (
                    <div className="flex flex-col gap-2 relative z-10">
                        <div className="relative">
                            <input
                                type="text"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                placeholder="Display Name..."
                                className="w-full bg-input border border-border rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                onClick={e => e.stopPropagation()}
                            />
                            {editName.trim().length > 0 && editName !== displayName && (
                                <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto hidden-scrollbar">
                                    {Array.from(new Map(Object.values(categories).filter(c => c.name && c.name.toLowerCase().includes(editName.toLowerCase()) && c.name.toLowerCase() !== editName.toLowerCase()).map(c => [c.name.toLowerCase(), c])).values()).slice(0, 5).map(s => (
                                        <button
                                            key={s.name}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setEditName(s.name)
                                                setEditCategory(s.categoryTag || 'Others')
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-primary/20 hover:text-primary transition-colors flex items-center gap-2"
                                            type="button"
                                        >
                                                <span className="font-medium flex items-center gap-2">
                                                    {(() => {
                                                        const DropIco = CATEGORY_ICONS[s.emoji];
                                                        return DropIco ? <DropIco className="w-4 h-4 opacity-70" /> : <span>{s.emoji}</span>;
                                                    })()}
                                                    {s.name}
                                                </span>
                                            <span className="ml-2 text-[10px] text-muted-foreground">{s.categoryTag}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-2"
                        >
                            <p className="text-[9px] text-muted-foreground break-all mb-2 cursor-auto" onClick={e => e.stopPropagation()}>
                                {tx.description}
                                <span className="block mt-0.5 opacity-50">{tx.upiId}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground mb-1 cursor-auto" onClick={e => e.stopPropagation()}>Select Category:</p>
                            <div className="flex flex-wrap gap-1 items-center mb-3">
                                {allAvailableCategories.map(c => (
                                    <button 
                                        key={c}
                                        onClick={(e) => { e.stopPropagation(); setEditCategory(c) }}
                                        className={`px-2 py-0.5 rounded-full text-[9px] transition-colors ${editCategory === c ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-primary/20'}`}
                                    >
                                        {c}
                                    </button>
                                ))}
                                <input 
                                    type="text" 
                                    placeholder="Add Custom..." 
                                    value={!allAvailableCategories.includes(editCategory) ? editCategory : ''}
                                    onChange={e => setEditCategory(e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    className="px-2 py-0.5 rounded-full text-[9px] bg-input border border-border w-24 focus:outline-none focus:border-primary"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={saveChanges} className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white transition-all" style={{ background: 'var(--grad-primary)' }}>
                                    Save Apperance
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setExpandedTx(null); }} className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:bg-secondary/80 transition-all">
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <div className="text-right flex-shrink-0" style={{ marginTop: isExpanded ? '4px' : '0' }}>
                <p className={`text-sm font-bold ${isDebit ? 'debit-text' : 'credit-text'}`}>
                    {isDebit ? '-' : '+'}{fmt(tx.amount)}
                </p>
                <p className="text-[10px] text-muted-foreground">{isDebit ? '↑ Debit' : '↓ Credit'}</p>
            </div>
        </motion.div>
    )
}

let gUnlocked = false;

export default function HomeTab() {
    const [transactions, setTransactions] = useState([])
    const [categories, setCategories] = useState({})
    const [filter, setFilter] = useState('all')
    const [view, setView] = useState('debit') // debit | credit | compare
    const [txSort, setTxSort] = useState('recent') // recent | oldest | highest | lowest
    const [displayLimit, setDisplayLimit] = useState(20)
    const [customStart, setCustomStart] = useState('')
    const [customEnd, setCustomEnd] = useState('')
    const [showCustom, setShowCustom] = useState(false)
    const [loading, setLoading] = useState(true)
    const [expandedTx, setExpandedTx] = useState(null)
    const [unlocked, setUnlocked] = useState(() => {
        const isReloading = performance?.getEntriesByType?.('navigation')?.[0]?.type === 'reload';
        if (isReloading) return sessionStorage.getItem('eiq_unlocked') === 'true';
        return gUnlocked;
    });

    useEffect(() => {
        gUnlocked = unlocked;
        sessionStorage.setItem('eiq_unlocked', unlocked);
    }, [unlocked]);

    useEffect(() => {
        const handler = () => {
            if (document.visibilityState === 'hidden') setUnlocked(false);
        };
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, []);

    const togglePrivacy = async () => {
        if (unlocked) {
            setUnlocked(false);
            return;
        }

        // Check if platform authenticator (device PIN/biometrics) is available
        const hasPlatformAuth = window.PublicKeyCredential &&
            await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);

        if (!hasPlatformAuth) {
            // No device auth available – unlock directly (e.g. old desktop without PIN)
            setUnlocked(true);
            return;
        }

        try {
            const storedId = localStorage.getItem('eiq_platform_cred');
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            if (!storedId) {
                // First time: register a platform credential (uses device PIN/face/fingerprint only)
                const cred = await navigator.credentials.create({
                    publicKey: {
                        challenge,
                        rp: { name: "ExpenseIQ", id: location.hostname },
                        user: { id: window.crypto.getRandomValues(new Uint8Array(16)), name: "expenseiq_user", displayName: "ExpenseIQ User" },
                        pubKeyCredParams: [
                            { type: "public-key", alg: -7 },
                            { type: "public-key", alg: -257 }
                        ],
                        authenticatorSelection: {
                            authenticatorAttachment: "platform",  // ← device only, NO QR / phone passkey
                            userVerification: "required",
                            residentKey: "discouraged",
                        },
                        timeout: 60000,
                        excludeCredentials: [],
                    }
                });
                // Store raw credential ID for future authentications
                const idBytes = new Uint8Array(cred.rawId);
                let bin = '';
                idBytes.forEach(b => bin += String.fromCharCode(b));
                localStorage.setItem('eiq_platform_cred', btoa(bin));
                setUnlocked(true);
            } else {
                // Subsequent: verify with the stored platform credential
                const bin = atob(storedId);
                const idBytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) idBytes[i] = bin.charCodeAt(i);

                await navigator.credentials.get({
                    publicKey: {
                        challenge,
                        allowCredentials: [{ type: "public-key", id: idBytes.buffer }],
                        userVerification: "required",
                        timeout: 60000,
                    }
                });
                setUnlocked(true);
            }
        } catch (e) {
            // If credential is lost/invalid, clear and let user re-register on next tap
            if (e.name === 'NotAllowedError') return;
            if (e.name === 'InvalidStateError' || e.name === 'NotFoundError') {
                localStorage.removeItem('eiq_platform_cred');
            }
            // Fallback: unlock directly if platform auth truly unsupported
            if (e.name === 'NotSupportedError') setUnlocked(true);
        }
    }
    useEffect(() => {
        Promise.all([getAllTransactions(), getAllCategories()]).then(([txs, cats]) => {
            setTransactions(txs)
            const catMap = {}
            cats.forEach(c => { catMap[c.upiId] = c })
            setCategories(catMap)
            setLoading(false)
        })
    }, [])

    const handleUpdateTx = async (tx, updates) => {
        const updated = { ...tx, ...updates }
        await upsertTransactions([updated])
        setTransactions(prev => prev.map(t => t.id === tx.id ? updated : t))

        // --- Sync ONLY the display name to the categories store ---
        // Do NOT sync overrideCategory here — individual transactions can each have
        // their own category independent of the UPI-level default label.
        if (tx.upiId && updates.overrideName !== undefined) {
            const existingCat = categories[tx.upiId] || { upiId: tx.upiId }
            const mergedCat   = { ...existingCat, name: updates.overrideName }
            await upsertCategory(mergedCat)
            setCategories(prev => ({ ...prev, [tx.upiId]: mergedCat }))
            window.dispatchEvent(new CustomEvent('eiq:categories-updated'))
        }
    }

    useEffect(() => {
        const reload = () => {
            getAllCategories().then(cats => {
                const catMap = {}
                cats.forEach(c => { catMap[c.upiId] = c })
                setCategories(catMap)
            })
        }
        window.addEventListener('eiq:categories-updated', reload)
        return () => window.removeEventListener('eiq:categories-updated', reload)
    }, [])

    // Filter transactions by date range
    const filtered = useMemo(() => {
        const { start, end } = getDateRange(filter, customStart, customEnd)
        return transactions.filter(tx => {
            const [y, m, d] = tx.date.split('-')
            const txDate = new Date(y, m - 1, d)
            return txDate >= start && txDate <= end
        })
    }, [transactions, filter, customStart, customEnd])

    const debits = useMemo(() => filtered.filter(t => t.type === 'debit'), [filtered])
    const credits = useMemo(() => filtered.filter(t => t.type === 'credit'), [filtered])

    const totalDebit = useMemo(() => debits.reduce((s, t) => s + Math.abs(t.amount), 0), [debits])
    const totalCredit = useMemo(() => credits.reduce((s, t) => s + Math.abs(t.amount), 0), [credits])
    const netAmount = totalCredit - totalDebit
    const currentBalance = useMemo(() => {
        const sortDesc = (a, b) => {
            const parse = t => { const [y,m,d] = t.date.split('-'); return new Date(y, m-1, d) }
            const da = parse(a), db = parse(b)
            if (db.getTime() !== da.getTime()) return db - da
            return (b.createdAt || '').localeCompare(a.createdAt || '')
        }

        if (filter === 'custom') {
            // Custom range: balance at the END of the selected range
            if (!filtered.length) return 0
            const sorted = [...filtered].sort(sortDesc)
            const found = sorted.find(t => t.balance > 0)
            if (found) return found.balance
        }
        // All other filters (12h, 24h, 7d, 1m, all):
        // Always show the most recent balance from ALL transactions regardless of the view window
        if (!transactions.length) return 0
        const sorted = [...transactions].sort(sortDesc)
        const found = sorted.find(t => t.balance > 0)
        if (found) return found.balance
        // Arithmetic fallback
        const allDebits  = transactions.reduce((s, t) => t.type === 'debit'  ? s + Math.abs(t.amount) : s, 0)
        const allCredits = transactions.reduce((s, t) => t.type === 'credit' ? s + Math.abs(t.amount) : s, 0)
        return allCredits - allDebits
    }, [transactions, filtered, filter])

    // Hourly or daily data for the spending chart
    const isHourlyFilter = ['12h', '24h', '48h'].includes(filter)
    const dailyData = useMemo(() => {
        const txs = view === 'debit' ? debits : view === 'credit' ? credits : filtered

        if (isHourlyFilter) {
            // Build per-hour buckets covering the full time window
            const now = new Date()
            const windowHours = filter === '12h' ? 12 : filter === '24h' ? 24 : 48
            // Determine actual span of data
            const times = txs.map(tx => {
                const [y,m,d] = tx.date.split('-')
                return new Date(y, m-1, d)
            })
            const minTime = times.length ? Math.min(...times.map(t => t.getTime())) : now.getTime() - windowHours*3600000
            const maxTime = now.getTime()
            const spanHours = Math.max(windowHours, Math.ceil((maxTime - minTime) / 3600000))
            // Choose bucket size: 1h if span<=24h, 2h if <=48h, 4h otherwise
            const bucketH = spanHours <= 24 ? 1 : spanHours <= 48 ? 2 : 4
            const map = {}
            // Initialise all buckets in the window
            const startSlot = Math.floor(minTime / (bucketH * 3600000)) * bucketH
            for (let h = startSlot; h * 3600000 <= maxTime; h += bucketH) {
                const label = `${String(h % 24).padStart(2,'0')}:00`
                map[h] = { hour: h, label, debit: 0, credit: 0 }
            }
            txs.forEach(tx => {
                const [y,m,d] = tx.date.split('-')
                const txTime = new Date(y, m-1, d)
                const slot = Math.floor(txTime.getTime() / (bucketH * 3600000)) * bucketH
                const key = slot
                if (!map[key]) {
                    const label = `${String((slot*bucketH) % 24).padStart(2,'0')}:00`
                    map[key] = { hour: key, label, debit: 0, credit: 0 }
                }
                map[key][tx.type === 'debit' ? 'debit' : 'credit'] += Math.abs(tx.amount)
            })
            return Object.values(map)
                .sort((a,b) => a.hour - b.hour)
                .map(d => ({ ...d, date: d.label, amount: view === 'debit' ? d.debit : view === 'credit' ? d.credit : (d.debit + d.credit) }))
        }

        // Daily buckets for 7d / 1m / all / custom
        const map = {}
        txs.forEach(tx => {
            const d = tx.date
            if (!map[d]) map[d] = { date: d, debit: 0, credit: 0 }
            map[d][tx.type === 'debit' ? 'debit' : 'credit'] += Math.abs(tx.amount)
        })
        return Object.values(map)
            .sort((a, b) => {
                const [aD, aM, aY] = a.date.split('-')
                const [bD, bM, bY] = b.date.split('-')
                return new Date(aY, aM - 1, aD) - new Date(bY, bM - 1, bD)
            })
            .map(d => ({
                ...d,
                date: d.date.slice(5), // MM-DD
                amount: view === 'debit' ? d.debit : view === 'credit' ? d.credit : (d.debit + d.credit),
            }))
    }, [filtered, debits, credits, view, filter, isHourlyFilter])

    // Category breakdown for pie
    const categoryData = useMemo(() => {
        const source = view === 'debit' ? debits : view === 'credit' ? credits : filtered
        const map = {}
        source.forEach(tx => {
            const catName = tx.overrideCategory || categories[tx.upiId]?.categoryTag || tx.category || 'Others'
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
            const label = tx.overrideName || categories[tx.upiId]?.name || tx.upiId?.split('@')?.[0]?.slice(0, 12) || tx.description?.slice(0, 12) || 'Unknown'
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
                <p className="text-xs text-primary opacity-80 font-medium mb-1">Current Balance</p>
                <div className="flex items-center gap-3 mb-4">
                    <p className={`text-3xl font-black text-foreground transition-all duration-300 ${!unlocked ? 'blur-md opacity-20 select-none' : ''}`}>
                        {!unlocked ? '₹•••••' : fmt(Math.abs(currentBalance))}
                    </p>
                    <button
                        onClick={togglePrivacy}
                        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:bg-white/20 active:scale-90"
                        title={unlocked ? 'Lock balance' : 'Unlock balance'}
                    >
                        {unlocked
                            ? <EyeOpen className="w-5 h-5 text-primary drop-shadow-sm" />
                            : <EyeClosed className="w-5 h-5 text-primary/50 drop-shadow-sm" />
                        }
                    </button>
                </div>
                <div className={`grid grid-cols-2 gap-4 transition-all duration-300 ${!unlocked ? 'blur-md opacity-20 select-none' : ''}`}>
                    <div>
                        <p className="text-xs flex items-center gap-1 mb-1" style={{ color: 'hsl(var(--destructive))' }}>
                            <ArrowUpRight className="w-3 h-3" /> Total Debited
                        </p>
                        <p className="text-base font-bold debit-text">{!unlocked ? '₹***' : fmt(totalDebit)}</p>
                    </div>
                    <div>
                        <p className="text-xs flex items-center gap-1 mb-1" style={{ color: 'hsl(var(--credit))' }}>
                            <ArrowDownLeft className="w-3 h-3" /> Total Credited
                        </p>
                        <p className="text-base font-bold credit-text">{!unlocked ? '₹***' : fmt(totalCredit)}</p>
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
                        <p className={`text-xs font-bold truncate transition-all duration-300 ${!unlocked ? 'blur-[4px] opacity-30 select-none' : ''}`} style={{ color }}>
                            {!unlocked ? '***' : value}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                    </motion.div>
                ))}
            </div>

            {/* Area Chart */}
            <div className={`chart-container mb-4 transition-all duration-300 ${!unlocked ? 'blur-md opacity-20 pointer-events-none' : ''}`}>
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
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => fmtShort(v)} />
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
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => fmtShort(v)} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="amount" name={view === 'credit' ? 'Income' : 'Spending'} stroke={view === 'credit' ? '#22c55e' : '#ef4444'} fill="url(#gradArea)" strokeWidth={2} />
                        </AreaChart>
                    )}
                </ResponsiveContainer>
            </div>

            {/* Bar chart: Top UPIs */}
            <div className={`chart-container mb-4 transition-all duration-300 ${!unlocked ? 'blur-md opacity-20 pointer-events-none' : ''}`}>
                <p className="text-sm font-semibold mb-3">Top UPIs</p>
                <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={topUpiData} margin={{ top: 5, right: 5, bottom: 20, left: -20 }} barSize={14}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} angle={-25} textAnchor="end" />
                        <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => fmtShort(v)} />
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
                <div className={`chart-container mb-0 transition-all duration-300 ${!unlocked ? 'blur-md opacity-20 pointer-events-none' : ''}`}>
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
                                contentStyle={{ background: 'hsl(var(--card))', color: 'hsl(var(--card-foreground))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '10px' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Radial bar chart */}
                <div className={`chart-container mb-0 transition-all duration-300 ${!unlocked ? 'blur-md opacity-20 pointer-events-none' : ''}`}>
                    <p className="text-xs font-semibold mb-2">Debit vs Credit</p>
                    <ResponsiveContainer width="100%" height={140}>
                        <RadialBarChart cx="50%" cy="50%" innerRadius={25} outerRadius={60} data={radialData} startAngle={90} endAngle={-270}>
                            <RadialBar dataKey="value" label={false} background={{ fill: 'hsl(var(--secondary))' }} />
                            <Tooltip
                                formatter={(v, n) => [fmtShort(v), n]}
                                contentStyle={{ background: 'hsl(var(--card))', color: 'hsl(var(--card-foreground))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '10px' }}
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
            <div className={`glass-card p-3 mb-4 transition-all duration-300 ${!unlocked ? 'blur-md opacity-20 pointer-events-none' : ''}`}>
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

            <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1">
                        <p className="text-sm font-semibold">Transactions</p>
                        <select 
                            value={txSort} 
                            onChange={e => setTxSort(e.target.value)}
                            className="bg-transparent text-xs text-muted-foreground outline-none border-b border-muted-foreground/30 focus:border-primary transition-colors cursor-pointer"
                        >
                            <option value="recent">Recent</option>
                            <option value="oldest">Oldest</option>
                            <option value="highest">Highest amount</option>
                            <option value="lowest">Lowest amount</option>
                        </select>
                    </div>
                    <span className="text-xs text-muted-foreground">{displayTxs.length} total</span>
                </div>
                <div className="flex flex-col gap-2">
                    <AnimatePresence>
                        {displayTxs.slice().sort((a, b) => {
                            if (txSort === 'highest') return Math.abs(b.amount) - Math.abs(a.amount)
                            if (txSort === 'lowest') return Math.abs(a.amount) - Math.abs(b.amount)
                            
                            const [aD, aM, aY] = a.date.split('-')
                            const [bD, bM, bY] = b.date.split('-')
                            const dA = new Date(aY, aM - 1, aD)
                            const dB = new Date(bY, bM - 1, bD)
                            
                            if (txSort === 'oldest') {
                                if (dB.getTime() !== dA.getTime()) return dA - dB
                                return a.createdAt.localeCompare(b.createdAt)
                            }
                            
                            // Default: 'recent'
                            if (dB.getTime() !== dA.getTime()) return dB - dA
                            return b.createdAt.localeCompare(a.createdAt)
                        }).slice(0, displayLimit).map((tx, i) => {
                            return <TxItem key={tx.id} tx={tx} i={i} categories={categories} transactions={transactions} expandedTx={expandedTx} setExpandedTx={setExpandedTx} handleUpdateTx={handleUpdateTx} fmt={fmt} />
                        })}
                    </AnimatePresence>
                </div>
                {displayTxs.length > displayLimit && (
                    <button 
                        onClick={() => setDisplayLimit(prev => prev + 20)}
                        className="w-full mt-3 py-2 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors rounded-xl"
                    >
                        Load More
                    </button>
                )}
            </div>
        </motion.div>
    )
}
