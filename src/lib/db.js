import { openDB } from 'idb';

const DB_NAME = 'expenseiq';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                // Transactions store
                if (!db.objectStoreNames.contains('transactions')) {
                    const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
                    txStore.createIndex('date', 'date');
                    txStore.createIndex('type', 'type');
                    txStore.createIndex('upiId', 'upiId');
                }
                // Categories store (UPI ID -> display name)
                if (!db.objectStoreNames.contains('categories')) {
                    db.createObjectStore('categories', { keyPath: 'upiId' });
                }
                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            },
        });
    }
    return dbPromise;
}

// ── Smart Deduplication Helpers ────────────────────────────────────────────────
function extractRefNumber(desc) {
    if (!desc) return null;
    const m = desc.match(/(?:UPI|IMPS|NEFT)[^0-9]*(\d{12})/i);
    return m ? m[1] : null;
}

function getDedupKeys(t) {
    const keys = [];
    if (!t) return keys;
    const rrn = extractRefNumber(t.description);
    if (rrn) {
        keys.push(`rrn:${rrn}|${Number(t.amount || 0).toFixed(2)}|${t.type}`);
    }
    if (t.description) {
        const normDesc = t.description.replace(/\s+/g, '').substring(0, 100).toLowerCase();
        keys.push(`desc:${t.date}|${normDesc}|${Number(t.amount || 0).toFixed(2)}|${t.type}`);
    }
    return keys;
}

async function smartUpsertTx(txStore, incomingList) {
    const existing = await txStore.getAll();
    const byId = new Map();
    const byDedupKey = new Map();

    for (const t of existing) {
        byId.set(t.id, t);
        for (const k of getDedupKeys(t)) {
            if (!byDedupKey.has(k)) byDedupKey.set(k, t);
        }
    }

    for (const inc of incomingList) {
        let match = byId.get(inc.id);
        if (!match) {
            for (const k of getDedupKeys(inc)) {
                if (byDedupKey.has(k)) {
                    match = byDedupKey.get(k);
                    break;
                }
            }
        }

        if (match) {
            // Overwrite existing record with latest data, but retain existing ID, user custom category, and createdAt
            const merged = {
                ...inc,
                id: match.id,
                createdAt: match.createdAt || inc.createdAt,
                category: match.category || inc.category
            };
            await txStore.put(merged);
        } else {
            await txStore.put(inc);
            byId.set(inc.id, inc);
            for (const k of getDedupKeys(inc)) {
                if (!byDedupKey.has(k)) byDedupKey.set(k, inc);
            }
        }
    }
}

// --- Transactions ---
export async function getAllTransactions() {
    const db = await getDB();
    return db.getAll('transactions');
}

export async function getTransactionsByDateRange(start, end) {
    const db = await getDB();
    const all = await db.getAll('transactions');
    return all.filter(tx => {
        const d = new Date(tx.date);
        return d >= start && d <= end;
    });
}

export async function upsertTransactions(transactions) {
    const db = await getDB();
    const tx = db.transaction('transactions', 'readwrite');
    await smartUpsertTx(tx.store, transactions);
    await tx.done;
}

export async function clearTransactions() {
    const db = await getDB();
    return db.clear('transactions');
}

export async function getTransactionCount() {
    const db = await getDB();
    return db.count('transactions');
}

// --- Categories ---
export async function getAllCategories() {
    const db = await getDB();
    return db.getAll('categories');
}

export async function upsertCategory(category) {
    const db = await getDB();
    return db.put('categories', category);
}

export async function deleteCategory(upiId) {
    const db = await getDB();
    return db.delete('categories', upiId);
}

// --- Settings ---
export async function getSetting(key) {
    const db = await getDB();
    const record = await db.get('settings', key);
    return record ? record.value : null;
}

export async function setSetting(key, value) {
    const db = await getDB();
    return db.put('settings', { key, value });
}

// --- Export / Import ---
export async function exportAllData() {
    const db = await getDB();
    const transactions = await db.getAll('transactions');
    const categories = await db.getAll('categories');
    const settings = await db.getAll('settings');
    return { transactions, categories, settings, exportedAt: new Date().toISOString() };
}

export async function importAllData(data) {
    const db = await getDB();

    if (data.transactions) {
        const tx = db.transaction('transactions', 'readwrite');
        await smartUpsertTx(tx.store, data.transactions);
        await tx.done;
    }
    if (data.categories) {
        const tx = db.transaction('categories', 'readwrite');
        for (const c of data.categories) await tx.store.put(c);
        await tx.done;
    }
    if (data.settings) {
        const tx = db.transaction('settings', 'readwrite');
        for (const s of data.settings) await tx.store.put(s);
        await tx.done;
    }
}

// --- Unique UPI IDs ---
export async function getUniqueUpiIds() {
    const db = await getDB();
    const all = await db.getAll('transactions');
    const upiIds = new Set(all.map(t => t.upiId).filter(Boolean));
    return Array.from(upiIds);
}
