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
    await Promise.all(transactions.map(t => tx.store.put(t)));
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
        for (const t of data.transactions) await tx.store.put(t);
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
