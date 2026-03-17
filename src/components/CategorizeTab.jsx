import { useState, useEffect, useCallback } from 'react'
import { Tag, Check, Edit2, Search } from 'lucide-react'
import { getAllTransactions, getAllCategories, upsertCategory } from '../lib/db'
import { motion, AnimatePresence } from 'framer-motion'

const DEFAULT_CATEGORIES = ['Food', 'Shopping', 'Travel', 'Recharge', 'Entertainment', 'Education', 'Health', 'Utilities', 'Loan/EMI', 'Others']
const EMOJIS = ['🛍️', '🍔', '✈️', '📱', '🎬', '📚', '🏥', '💡', '💳', '💰', '🏦', '🎮', '🚗', '☕', '💼']
const BUBBLE_COLORS = ['hsl(var(--primary))', '#2563eb', '#dc2626', '#16a34a', '#d97706', '#0891b2', '#9333ea', '#db2777', '#0d9488', '#ea580c']

// ── UpiCard MUST be defined OUTSIDE CategorizeTab.
// When defined inside, React sees a new component type on every render,
// unmounting + remounting the card — this loses input focus on every keystroke.
function UpiCard({ upi, categories, editing, editName, editEmoji, editCategory,
    setEditName, setEditEmoji, setEditCategory, startEdit, saveEdit, setEditing }) {

    const cat = categories[upi.upiId]
    const isEditing = editing === upi.upiId
    const color = BUBBLE_COLORS[upi.upiId.charCodeAt(0) % BUBBLE_COLORS.length]
    const initial = cat?.emoji || (cat?.name?.[0] || upi.upiId[0]).toUpperCase()

    return (
        <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-3 mb-2">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: `${color}22`, border: `1px solid ${color}44` }}>
                    <span>{cat?.emoji || initial[0]}</span>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            {cat?.name
                                ? <p className="text-sm font-semibold">{cat.name}</p>
                                : <p className="text-xs text-amber-400 font-semibold">Uncategorized</p>
                            }
                            <p className="text-[10px] text-muted-foreground truncate">{upi.upiId}</p>
                        </div>
                        <button
                            onClick={() => isEditing ? setEditing(null) : startEdit(upi)}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors flex-shrink-0"
                        >
                            {isEditing ? <Check className="w-4 h-4" /> : <Edit2 className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span>{upi.count} tx</span>
                        {upi.totalDebit > 0 && <span className="debit-text">↑ ₹{upi.totalDebit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
                        {upi.totalCredit > 0 && <span className="credit-text">↓ ₹{upi.totalCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {isEditing && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-3 pt-3 border-t border-border flex flex-col gap-3">
                            <div className="relative">
                                <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    placeholder="e.g. Morning Coffee"
                                    autoFocus
                                    className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                {editName.trim().length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto hidden-scrollbar">
                                        {Array.from(new Map(Object.values(categories).filter(c => c.name && c.name.toLowerCase().includes(editName.toLowerCase()) && c.name.toLowerCase() !== editName.toLowerCase()).map(c => [c.name.toLowerCase(), c])).values()).slice(0, 5).map(s => (
                                            <button
                                                key={s.name}
                                                onClick={() => {
                                                    setEditName(s.name)
                                                    setEditEmoji(s.emoji || '💰')
                                                    setEditCategory(s.categoryTag || 'Others')
                                                }}
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-primary/20 hover:text-primary transition-colors flex items-center gap-2"
                                                type="button"
                                            >
                                                <span>{s.emoji} </span>
                                                <span className="font-medium">{s.name}</span>
                                                <span className="ml-2 text-[10px] text-muted-foreground">{s.categoryTag}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Icon</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {EMOJIS.map(e => (
                                        <button key={e} onClick={() => setEditEmoji(e)} type="button"
                                            className={`w-8 h-8 rounded-lg text-sm transition-all ${editEmoji === e ? 'bg-primary' : 'bg-secondary hover:bg-secondary/80'}`}>
                                            {e}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                                <div className="flex flex-wrap gap-1.5 items-center">
                                    {Array.from(new Set([...DEFAULT_CATEGORIES, ...Object.values(categories).map(c => c.categoryTag).filter(Boolean)])).map(c => (
                                        <button key={c} onClick={() => setEditCategory(c)} type="button"
                                            className={`px-2 py-1 rounded-full text-xs transition-all ${editCategory === c ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                                            {c}
                                        </button>
                                    ))}
                                    <input 
                                        type="text" 
                                        placeholder="Add Custom..." 
                                        value={!Array.from(new Set([...DEFAULT_CATEGORIES, ...Object.values(categories).map(c => c.categoryTag).filter(Boolean)])).includes(editCategory) ? editCategory : ''}
                                        onChange={e => setEditCategory(e.target.value)}
                                        className="px-2 py-1 rounded-full text-xs bg-input border border-border w-28 focus:outline-none focus:border-primary"
                                    />
                                </div>
                            </div>

                            <button onClick={() => saveEdit(upi.upiId)}
                                className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-all"
                                style={{ background: 'var(--grad-primary)' }}>
                                Save Label
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

export default function CategorizeTab({ onDataChange }) {
    const [upiList, setUpiList] = useState([])
    const [categories, setCategories] = useState({})
    const [search, setSearch] = useState('')
    const [editing, setEditing] = useState(null)
    const [editName, setEditName] = useState('')
    const [editEmoji, setEditEmoji] = useState('')
    const [editCategory, setEditCategory] = useState('')
    const [loading, setLoading] = useState(true)

    useEffect(() => { load() }, [])

    async function load() {
        const [txs, cats] = await Promise.all([getAllTransactions(), getAllCategories()])
        const catMap = {}
        cats.forEach(c => { catMap[c.upiId] = c })

        const upiMap = {}
        txs.forEach(tx => {
            if (!tx.upiId) return
            if (!upiMap[tx.upiId]) {
                upiMap[tx.upiId] = { upiId: tx.upiId, count: 0, totalDebit: 0, totalCredit: 0, lastDate: tx.date, autoCategory: tx.category }
            }
            upiMap[tx.upiId].count++
            if (tx.type === 'debit') upiMap[tx.upiId].totalDebit += tx.amount
            else upiMap[tx.upiId].totalCredit += tx.amount
            if (tx.date > upiMap[tx.upiId].lastDate) upiMap[tx.upiId].lastDate = tx.date
        })

        setCategories(catMap)
        setUpiList(Object.values(upiMap).sort((a, b) => (b.totalDebit + b.totalCredit) - (a.totalDebit + a.totalCredit)))
        setLoading(false)
    }

    const startEdit = useCallback((upi) => {
        const cat = categories[upi.upiId]
        setEditing(upi.upiId)
        setEditName(cat?.name || '')
        setEditEmoji(cat?.emoji || '💰')
        setEditCategory(cat?.categoryTag || upi.autoCategory || 'Others')
    }, [categories])

    const saveEdit = useCallback(async (upiId) => {
        const cat = { upiId, name: editName.trim() || upiId.split('@')[0], emoji: editEmoji, categoryTag: editCategory }
        await upsertCategory(cat)
        setCategories(prev => ({ ...prev, [upiId]: cat }))
        setEditing(null)
        onDataChange()
    }, [editName, editEmoji, editCategory, onDataChange])

    const filteredList = upiList.filter(u =>
        !search ||
        u.upiId.toLowerCase().includes(search.toLowerCase()) ||
        (categories[u.upiId]?.name || '').toLowerCase().includes(search.toLowerCase())
    )
    const uncategorized = filteredList.filter(u => !categories[u.upiId])
    const categorized = filteredList.filter(u => categories[u.upiId])

    const cardProps = { categories, editing, editName, editEmoji, editCategory, setEditName, setEditEmoji, setEditCategory, startEdit, saveEdit, setEditing }

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
    )

    if (!upiList.length) return (
        <div className="flex flex-col items-center justify-center h-96 px-8 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl balance-card flex items-center justify-center">
                <Tag className="w-8 h-8 opacity-60" />
            </div>
            <p className="text-base font-semibold">No UPIs Found</p>
            <p className="text-sm text-muted-foreground">Upload a bank statement first to see UPI IDs to categorize.</p>
        </div>
    )

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 pb-6">
            <div className="pt-4 pb-3">
                <h2 className="text-xl font-bold gradient-text">Categorize</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Name your UPI IDs for better analytics</p>
            </div>

            <div className="glass-card p-3 mb-4">
                <div className="flex justify-between text-xs mb-2">
                    <span className="font-medium">{categorized.length} labeled</span>
                    <span className="text-muted-foreground">{uncategorized.length} remaining</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${upiList.length ? (categorized.length / upiList.length * 100) : 0}%`, background: 'var(--grad-primary)' }} />
                </div>
            </div>

            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search UPI IDs..."
                    className="w-full bg-input border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>

            {uncategorized.length > 0 && (
                <>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-amber-400">⚠ Needs Label ({uncategorized.length})</span>
                    </div>
                    {uncategorized.map(upi => <UpiCard key={upi.upiId} upi={upi} {...cardProps} />)}
                </>
            )}

            {categorized.length > 0 && (
                <>
                    <div className="flex items-center gap-2 mt-4 mb-2">
                        <span className="text-xs font-semibold text-green-400">✓ Labeled ({categorized.length})</span>
                    </div>
                    {categorized.map(upi => <UpiCard key={upi.upiId} upi={upi} {...cardProps} />)}
                </>
            )}
        </motion.div>
    )
}
