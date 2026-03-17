// Popup view logic
class PopupTracker {
    constructor() {
        this.currentFilter = 'all';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadShows();
    }

    setupEventListeners() {
        document.getElementById('openFullView').addEventListener('click', () => {
            const fullPageUrl = chrome.runtime.getURL('fullpage.html');
            chrome.tabs.create({ url: fullPageUrl });
        });

        document.getElementById('addShowBtn').addEventListener('click', () => {
            const fullPageUrl = chrome.runtime.getURL('fullpage.html');
            chrome.tabs.create({ url: fullPageUrl });
        });

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.loadShows();
            });
        });
    }

    async loadShows() {
        const shows = await storage.getAllShows();
        const filtered = this.filterShows(shows);
        this.renderShows(filtered);
    }

    filterShows(shows) {
        let filtered = shows;
        
        if (this.currentFilter !== 'all') {
            filtered = shows.filter(show => show.type === this.currentFilter);
        }

        // Sort by status priority
        const statusPriority = {
            'watching': 0,
            'ongoing': 1,
            'break': 2,
            'hiatus': 3,
            'completed': 4,
            'dropped': 5
        };

        return filtered.sort((a, b) => {
            const priorityA = statusPriority[a.status] ?? 99;
            const priorityB = statusPriority[b.status] ?? 99;
            return priorityA - priorityB;
        });
    }

    renderShows(shows) {
        const tbody = document.getElementById('showsBody');
        
        if (shows.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No shows added</td></tr>';
            return;
        }

        tbody.innerHTML = shows.map(show => this.createShowRow(show)).join('');

        // Attach event listeners for quick actions
        document.querySelectorAll('.btn-next-ep').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const showId = e.target.dataset.id;
                this.quickNextEpisode(showId);
            });
        });

        document.querySelectorAll('.btn-next-season').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const showId = e.target.dataset.id;
                this.quickNextSeason(showId);
            });
        });

        // Attach event listeners for editable cells
        document.querySelectorAll('.editable-title').forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                const showId = e.target.dataset.id;
                this.editShowInFullpage(showId);
            });
        });

        document.querySelectorAll('.editable-season').forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                this.enableSeasonEdit(e.target);
            });
        });

        document.querySelectorAll('.editable-episode').forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                this.enableEpisodeEdit(e.target);
            });
        });

        document.querySelectorAll('.editable-status').forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.showStatusDropdown(e.target);
            });
        });
    }

    createShowRow(show) {
        const linkCell = show.watchLink
            ? `<a href="${this.escapeHtml(show.watchLink)}" target="_blank">🔗 Link</a>`
            : '—';

        const statusLabel = show.status ? show.status.charAt(0).toUpperCase() + show.status.slice(1) : 'Unknown';
        const statusEmojis = {
            'ongoing': '▶️',
            'break': '⏸️',
            'hiatus': '⏸️',
            'completed': '✅',
            'dropped': '❌'
        };
        const statusDisplay = `${statusEmojis[show.status] || '📌'} ${statusLabel}`;

        return `
            <tr data-show-id="${show.id}">
                <td class="show-title editable-title" data-id="${show.id}" title="Click to edit">${this.escapeHtml(show.name)}</td>
                <td class="editable-season" data-id="${show.id}" title="Click to edit">${show.season}</td>
                <td class="editable-episode" data-id="${show.id}" title="Click to edit">${show.episode}</td>
                <td class="status-cell editable-status" data-id="${show.id}" data-status="${show.status}" title="Click to change">${statusDisplay}</td>
                <td class="show-link-cell">${linkCell}</td>
                <td class="action-buttons">
                    <button class="btn-quick btn-next-ep" data-id="${show.id}" title="Next Episode">➕</button>
                    <button class="btn-quick btn-next-season" data-id="${show.id}" title="Next Season">⏭️</button>
                </td>
            </tr>
        `;
    }

    async quickNextEpisode(showId) {
        try {
            const shows = await storage.getAllShows();
            const show = shows.find(s => s.id === showId);
            
            if (show) {
                await storage.updateShow(showId, {
                    episode: show.episode + 1
                });
                this.loadShows();
            }
        } catch (error) {
            console.error('Error updating episode:', error);
        }
    }

    async quickNextSeason(showId) {
        try {
            const shows = await storage.getAllShows();
            const show = shows.find(s => s.id === showId);
            
            if (show) {
                await storage.updateShow(showId, {
                    season: show.season + 1,
                    episode: 1
                });
                this.loadShows();
            }
        } catch (error) {
            console.error('Error updating season:', error);
        }
    }

    editShowInFullpage(showId) {
        chrome.storage.local.set({ editShowId: showId });
        const fullPageUrl = chrome.runtime.getURL('fullpage.html');
        chrome.tabs.create({ url: fullPageUrl });
    }

    enableSeasonEdit(cell) {
        const showId = cell.dataset.id;
        const currentValue = cell.textContent;
        
        cell.textContent = '';
        const input = document.createElement('input');
        input.type = 'number';
        input.value = currentValue;
        input.min = '1';
        input.className = 'inline-input';
        cell.appendChild(input);
        input.focus();
        input.select();

        const saveEdit = async () => {
            const newValue = parseInt(input.value);
            if (newValue >= 1) {
                await storage.updateShow(showId, { season: newValue });
                this.loadShows();
            } else {
                this.loadShows();
            }
        };

        input.addEventListener('blur', saveEdit);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveEdit();
            }
        });
    }

    enableEpisodeEdit(cell) {
        const showId = cell.dataset.id;
        const currentValue = cell.textContent;
        
        cell.textContent = '';
        const input = document.createElement('input');
        input.type = 'number';
        input.value = currentValue;
        input.min = '1';
        input.className = 'inline-input';
        cell.appendChild(input);
        input.focus();
        input.select();

        const saveEdit = async () => {
            const newValue = parseInt(input.value);
            if (newValue >= 1) {
                await storage.updateShow(showId, { episode: newValue });
                this.loadShows();
            } else {
                this.loadShows();
            }
        };

        input.addEventListener('blur', saveEdit);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveEdit();
            }
        });
    }

    closeStatusDropdown() {
        const existing = document.getElementById('statusDropdownMenu');
        if (existing) existing.remove();
        if (this._statusDropdownClose) {
            document.removeEventListener('click', this._statusDropdownClose);
            this._statusDropdownClose = null;
        }
    }

    showStatusDropdown(cell) {
        // Toggle off if already open for this cell
        const existing = document.getElementById('statusDropdownMenu');
        if (existing) {
            this.closeStatusDropdown();
            return;
        }

        const showId = cell.dataset.id;
        const currentStatus = cell.dataset.status;

        const statusOptions = [
            { value: 'watching', label: 'Watching', emoji: '👀' },
            { value: 'ongoing', label: 'Ongoing', emoji: '▶️' },
            { value: 'break', label: 'Break', emoji: '⏸️' },
            { value: 'hiatus', label: 'Hiatus', emoji: '⏸️' },
            { value: 'completed', label: 'Completed', emoji: '✅' },
            { value: 'dropped', label: 'Dropped', emoji: '❌' }
        ];

        const dropdown = document.createElement('div');
        dropdown.className = 'status-dropdown-menu';
        dropdown.id = 'statusDropdownMenu';

        statusOptions.forEach(option => {
            const item = document.createElement('div');
            item.className = 'status-dropdown-item' + (option.value === currentStatus ? ' current' : '');
            item.textContent = `${option.emoji} ${option.label}`;

            // mousedown fires before blur so the cell doesn't lose its data-id
            item.addEventListener('mousedown', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closeStatusDropdown();
                await storage.updateShow(showId, { status: option.value });
                this.loadShows();
            });

            dropdown.appendChild(item);
        });

        // Position below the cell
        const rect = cell.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + window.scrollY}px`;
        dropdown.style.left = `${rect.left + window.scrollX}px`;
        document.body.appendChild(dropdown);

        // Close when clicking anywhere outside the dropdown or the trigger cell
        this._statusDropdownClose = (e) => {
            if (!dropdown.contains(e.target) && e.target !== cell) {
                this.closeStatusDropdown();
            }
        };
        setTimeout(() => document.addEventListener('click', this._statusDropdownClose), 0);
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new PopupTracker();
    });
} else {
    new PopupTracker();
}
