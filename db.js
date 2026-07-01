// IndexedDB wrapper for Assistant Vivo data persistence
class DeviceDatabase {
    constructor(dbName = 'assistant_vivo_db', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }

    open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (event) => {
                console.error('Database failed to open:', event);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store for app settings
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                // Store for chat messages
                if (!db.objectStoreNames.contains('messages')) {
                    db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                }

                // Store for agendas (daily schedule)
                if (!db.objectStoreNames.contains('agendas')) {
                    const agendaStore = db.createObjectStore('agendas', { keyPath: 'id' });
                    agendaStore.createIndex('time', 'time', { unique: false });
                }

                // Store for memory bubbles
                if (!db.objectStoreNames.contains('memories')) {
                    const memoryStore = db.createObjectStore('memories', { keyPath: 'id' });
                    memoryStore.createIndex('date', 'date', { unique: false });
                }
            };
        });
    }

    // --- Settings ---
    getSetting(key, defaultValue = null) {
        return new Promise((resolve) => {
            if (!this.db) return resolve(defaultValue);
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result ? request.result.value : defaultValue);
            };
            request.onerror = () => resolve(defaultValue);
        });
    }

    setSetting(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ key, value });

            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // --- Messages ---
    getMessages() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['messages'], 'readonly');
            const store = transaction.objectStore('messages');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    addMessage(role, content) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['messages'], 'readwrite');
            const store = transaction.objectStore('messages');
            const message = {
                role,
                content,
                timestamp: new Date().getTime()
            };
            const request = store.add(message);

            request.onsuccess = (e) => {
                message.id = e.target.result;
                resolve(message);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    clearMessages() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['messages'], 'readwrite');
            const store = transaction.objectStore('messages');
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // --- Agendas ---
    getAgendas() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['agendas'], 'readonly');
            const store = transaction.objectStore('agendas');
            const request = store.getAll();

            request.onsuccess = () => {
                // Sort by time
                const results = request.result || [];
                results.sort((a, b) => new Date(a.time) - new Date(b.time));
                resolve(results);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    saveAgenda(agenda) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['agendas'], 'readwrite');
            const store = transaction.objectStore('agendas');
            if (!agenda.id) {
                agenda.id = 'agenda_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 5);
            }
            const request = store.put(agenda);

            request.onsuccess = () => resolve(agenda);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    deleteAgenda(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['agendas'], 'readwrite');
            const store = transaction.objectStore('agendas');
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // --- Memories ---
    getMemories() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['memories'], 'readonly');
            const store = transaction.objectStore('memories');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    saveMemory(memory) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['memories'], 'readwrite');
            const store = transaction.objectStore('memories');
            if (!memory.id) {
                memory.id = 'memory_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 5);
            }
            if (!memory.date) {
                memory.date = new Date().toISOString().split('T')[0];
            }
            const request = store.put(memory);

            request.onsuccess = () => resolve(memory);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    deleteMemory(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['memories'], 'readwrite');
            const store = transaction.objectStore('memories');
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    }
}

const db = new DeviceDatabase();
// Export db instance globally for files loaded sequentially in scripts
window.appDb = db;
