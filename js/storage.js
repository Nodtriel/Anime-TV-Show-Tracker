// Storage management for the extension
class ShowStorage {
    constructor() {
        this.storageKey = 'animeShowTracker';
    }

    // Get all shows
    async getAllShows() {
        return new Promise((resolve) => {
            chrome.storage.local.get([this.storageKey], (result) => {
                resolve(result[this.storageKey] || []);
            });
        });
    }

    // Add a new show
    async addShow(show) {
        show.id = Date.now().toString();
        show.dateAdded = new Date().toISOString();

        // Mark entries created in the tracker as needing MAL update on export.
        // Imported entries explicitly pass importSource='mal' and modifiedAfterImport=false.
        if (!show.importSource) {
            show.importSource = 'local';
        }
        if (typeof show.modifiedAfterImport !== 'boolean') {
            show.modifiedAfterImport = show.importSource !== 'mal';
        }
        
        const shows = await this.getAllShows();
        shows.push(show);
        
        return new Promise((resolve) => {
            chrome.storage.local.set({ [this.storageKey]: shows }, () => {
                resolve(show);
            });
        });
    }

    // Update a show
    async updateShow(id, updatedShow) {
        const shows = await this.getAllShows();
        const index = shows.findIndex(show => show.id === id);
        
        if (index !== -1) {
            shows[index] = { ...shows[index], ...updatedShow };

            // Any edit to an imported entry should be exported as update_on_import=1.
            if (shows[index].importSource === 'mal') {
                shows[index].modifiedAfterImport = true;
                shows[index].lastModifiedAt = new Date().toISOString();
            }
            
            return new Promise((resolve) => {
                chrome.storage.local.set({ [this.storageKey]: shows }, () => {
                    resolve(shows[index]);
                });
            });
        }
        
        throw new Error('Show not found');
    }

    // Delete a show
    async deleteShow(id) {
        const shows = await this.getAllShows();
        const filtered = shows.filter(show => show.id !== id);
        
        return new Promise((resolve) => {
            chrome.storage.local.set({ [this.storageKey]: filtered }, () => {
                resolve();
            });
        });
    }

    // Get shows by type
    async getShowsByType(type) {
        const shows = await this.getAllShows();
        return shows.filter(show => show.type === type);
    }

    // Delete all stored shows
    async clearAllShows() {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [this.storageKey]: [] }, () => {
                resolve();
            });
        });
    }
}

// Create global instance
const storage = new ShowStorage();
