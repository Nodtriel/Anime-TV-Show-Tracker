// Fullpage view logic
class ShowTracker {
    constructor() {
        this.currentFilter = 'all';
        this.currentStatusFilter = 'all';
        this.currentEditId = null;
        this.initialFormState = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadShows();
        
        // Check if we need to open edit modal
        chrome.storage.local.get(['editShowId'], (result) => {
            if (result.editShowId) {
                this.openModal(result.editShowId);
                chrome.storage.local.remove(['editShowId']);
            }
        });
    }

    setupEventListeners() {
        // Add new show button
        document.getElementById('addBtn').addEventListener('click', () => this.openModal());

        // MAL export button
        document.getElementById('malExportBtn').addEventListener('click', () => this.exportToMAL());

        // MAL import button
        document.getElementById('malImportBtn').addEventListener('click', () => {
            document.getElementById('malImportFile').click();
        });

        // TV export button
        document.getElementById('tvExportBtn').addEventListener('click', () => this.exportTVShows());

        // TV import button
        document.getElementById('tvImportBtn').addEventListener('click', () => {
            document.getElementById('tvImportFile').click();
        });

        // Clear list button
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAllShows());

        // MAL import file handler
        document.getElementById('malImportFile').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.importFromMAL(e.target.files[0]);
            }
        });

        // TV import file handler
        document.getElementById('tvImportFile').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.importTVShows(e.target.files[0]);
            }
        });

        // Type filter buttons
        document.querySelectorAll('.filter-btn:not(.status-filter-btn)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn:not(.status-filter-btn)').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.loadShows();
            });
        });

        // Status filter buttons
        document.querySelectorAll('.status-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentStatusFilter = e.target.dataset.status;
                this.loadShows();
            });
        });

        // Modal controls
        document.querySelector('.close-btn').addEventListener('click', () => this.attemptCloseModal());
        document.querySelector('.btn-cancel').addEventListener('click', () => this.attemptCloseModal());
        document.getElementById('modalDeleteBtn').addEventListener('click', () => this.deleteCurrentShow());
        document.getElementById('showForm').addEventListener('submit', (e) => this.handleFormSubmit(e));
        document.getElementById('modal').addEventListener('click', (e) => {
            if (e.target.id === 'modal') {
                this.attemptCloseModal();
            }
        });

        // Image preview
        document.getElementById('posterImage').addEventListener('change', (e) => {
            this.updateImagePreview(e.target.value);
        });
    }

    async loadShows() {
        const shows = await storage.getAllShows();
        const filtered = this.filterShows(shows);
        this.renderShows(filtered);
    }

    showMALImportProgress(total) {
        const container = document.getElementById('malImportProgress');
        container.classList.remove('hidden');

        document.getElementById('importProgressTitle').textContent = 'MAL Import in progress...';
        document.getElementById('importProgressCount').textContent = `0 / ${total}`;
        document.getElementById('importProgressBar').style.width = '0%';
        document.getElementById('importProgressStatus').textContent = 'Preparing import...';
        document.getElementById('importProgressStats').textContent = 'Added: 0 | Covers: 0 | Failed: 0';
    }

    updateMALImportProgress(processed, total, importedCount, fetchedCoverCount, failedCount, statusText) {
        const safeTotal = Math.max(total, 1);
        const pct = Math.min(100, Math.round((processed / safeTotal) * 100));

        document.getElementById('importProgressCount').textContent = `${processed} / ${total}`;
        document.getElementById('importProgressBar').style.width = `${pct}%`;
        document.getElementById('importProgressStatus').textContent = statusText;
        document.getElementById('importProgressStats').textContent =
            `Added: ${importedCount} | Covers: ${fetchedCoverCount} | Failed: ${failedCount}`;
    }

    async completeMALImportProgress(total, importedCount, fetchedCoverCount, failedCount) {
        document.getElementById('importProgressTitle').textContent = 'MAL Import complete';
        this.updateMALImportProgress(
            total,
            total,
            importedCount,
            fetchedCoverCount,
            failedCount,
            'Finished importing entries.'
        );

        await new Promise(resolve => setTimeout(resolve, 1600));
        document.getElementById('malImportProgress').classList.add('hidden');
    }

    async yieldToUI() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    filterShows(shows) {
        let filtered = shows;

        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(show => show.type === this.currentFilter);
        }

        if (this.currentStatusFilter !== 'all') {
            filtered = filtered.filter(show => show.status === this.currentStatusFilter);
        }

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
        const contentArea = document.getElementById('contentArea');

        if (shows.length === 0) {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <p>${this.getEmptyMessage()}</p>
                </div>
            `;
            return;
        }

        const statusOrder = ['watching', 'ongoing', 'break', 'hiatus', 'completed', 'dropped'];
        const statusMeta = {
            watching:  { label: 'Watching',  emoji: '👀' },
            ongoing:   { label: 'Ongoing',   emoji: '▶️' },
            break:     { label: 'Break',     emoji: '⏸️' },
            hiatus:    { label: 'Hiatus',    emoji: '⏸️' },
            completed: { label: 'Completed', emoji: '✅' },
            dropped:   { label: 'Dropped',   emoji: '❌' }
        };

        // When filtering by a specific status, render flat (no group headers needed)
        if (this.currentStatusFilter !== 'all') {
            contentArea.innerHTML = `<div class="status-group-grid">${shows.map(show => this.createShowCard(show)).join('')}</div>`;
        } else {
            // Group by status and render a section header before each group
            const groups = {};
            for (const show of shows) {
                const key = show.status || 'unknown';
                if (!groups[key]) groups[key] = [];
                groups[key].push(show);
            }

            let html = '';
            for (const status of statusOrder) {
                if (!groups[status] || groups[status].length === 0) continue;
                const meta = statusMeta[status] || { label: status, emoji: '📌' };
                html += `<div class="status-group-header">${meta.emoji} ${meta.label} <span class="status-group-count">${groups[status].length}</span></div>`;
                html += `<div class="status-group-grid">${groups[status].map(show => this.createShowCard(show)).join('')}</div>`;
            }
            contentArea.innerHTML = html;
        }
        
        // Attach event listeners to cards
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const showId = e.target.dataset.id;
                this.editShow(showId);
            });
        });

        document.querySelectorAll('.btn-next-episode').forEach(btn => {
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

        // Add click handler to poster images
        document.querySelectorAll('.show-poster').forEach(poster => {
            poster.style.cursor = 'pointer';
            poster.addEventListener('click', (e) => {
                const showId = e.currentTarget.closest('.show-card').querySelector('.btn-edit').dataset.id;
                this.editShow(showId);
            });
        });
    }

    createShowCard(show) {
        const hasImage = show.posterImage && show.posterImage.trim();
        const imageHtml = hasImage 
            ? `<img src="${this.escapeHtml(show.posterImage)}" alt="${this.escapeHtml(show.name)}" onerror="this.style.display='none'">`
            : `<div>No Image</div>`;

        const linkHtml = show.watchLink 
            ? `<div class="show-link"><a href="${this.escapeHtml(show.watchLink)}" target="_blank">📍 Watch Link</a></div>`
            : '';

        const notesHtml = show.notes 
            ? `<div class="show-notes">${this.escapeHtml(show.notes)}</div>`
            : '';

        const statusLabel = show.status ? show.status.charAt(0).toUpperCase() + show.status.slice(1) : 'Unknown';
        const statusEmojis = {
            'watching': '👀',
            'ongoing': '▶️',
            'break': '⏸️',
            'hiatus': '⏸️',
            'completed': '✅',
            'dropped': '❌'
        };
        const statusBadge = `<span class="status-badge status-${show.status}">${statusEmojis[show.status] || '📌'} ${statusLabel}</span>`;

        return `
            <div class="show-card">
                <div class="show-poster">${imageHtml}</div>
                <div class="show-content">
                    <div class="show-header">
                        <span class="show-type ${show.type}">${show.type.toUpperCase()}</span>
                        ${statusBadge}
                    </div>
                    <div class="show-title">${this.escapeHtml(show.name)}</div>
                    <div class="show-progress-section">
                        <div class="show-progress">
                            📺 <span class="progress-badge">S${show.season} E${show.episode}</span>
                        </div>
                        <div class="quick-update-buttons">
                            <button class="btn-quick-update btn-next-episode" data-id="${show.id}" title="Next Episode">➕</button>
                            <button class="btn-quick-update btn-next-season" data-id="${show.id}" title="Next Season">⏭️</button>
                        </div>
                    </div>
                    ${linkHtml}
                    ${notesHtml}
                    <div class="show-actions">
                        <button class="btn-edit" data-id="${show.id}">✏️ Edit</button>
                    </div>
                </div>
            </div>
        `;
    }

    getEmptyMessage() {
        const messages = {
            'all': 'No shows added yet. Click "Add New" to get started!',
            'anime': 'No anime added yet. Start tracking your favorite anime!',
            'tv': 'No TV shows added yet. Track your favorite shows!'
        };
        return messages[this.currentFilter];
    }

    async openModal(showId = null) {
        const modal = document.getElementById('modal');
        const form = document.getElementById('showForm');
        const modalTitle = document.getElementById('modalTitle');
        const modalDeleteBtn = document.getElementById('modalDeleteBtn');

        form.reset();
        document.getElementById('imagePreview').innerHTML = '';
        document.getElementById('status').value = 'watching';
        this.currentEditId = showId;

        if (showId) {
            modalTitle.textContent = 'Edit Show';
            modalDeleteBtn.style.display = 'block';
            await this.loadShowIntoForm(showId);
        } else {
            modalTitle.textContent = 'Add New Show';
            modalDeleteBtn.style.display = 'none';
        }

        this.initialFormState = this.captureFormState();
        modal.classList.add('active');
    }

    async loadShowIntoForm(showId) {
        const shows = await storage.getAllShows();
        const show = shows.find(s => s.id === showId);

        if (show) {
            document.getElementById('showName').value = show.name;
            document.getElementById('showType').value = show.type;
            document.getElementById('status').value = show.status || 'watching';
            document.getElementById('season').value = show.season;
            document.getElementById('episode').value = show.episode;
            document.getElementById('watchLink').value = show.watchLink || '';
            document.getElementById('posterImage').value = show.posterImage || '';
            document.getElementById('notes').value = show.notes || '';

            if (show.posterImage) {
                this.updateImagePreview(show.posterImage);
            }
        }
    }

    closeModal() {
        document.getElementById('modal').classList.remove('active');
        this.currentEditId = null;
        this.initialFormState = null;
    }

    captureFormState() {
        return {
            name: document.getElementById('showName').value,
            type: document.getElementById('showType').value,
            status: document.getElementById('status').value,
            season: document.getElementById('season').value,
            episode: document.getElementById('episode').value,
            watchLink: document.getElementById('watchLink').value,
            posterImage: document.getElementById('posterImage').value,
            notes: document.getElementById('notes').value
        };
    }

    hasUnsavedChanges() {
        if (!this.initialFormState) return false;
        return JSON.stringify(this.captureFormState()) !== JSON.stringify(this.initialFormState);
    }

    async attemptCloseModal() {
        const modal = document.getElementById('modal');
        if (!modal.classList.contains('active')) return;

        if (this.hasUnsavedChanges()) {
            const shouldSave = confirm('You have unsaved changes. Do you want to save before closing?');

            if (shouldSave) {
                const saved = await this.saveFormData();
                if (!saved) return;
                this.loadShows();
            }
        }

        this.closeModal();
    }

    async saveFormData() {
        const showData = {
            name: document.getElementById('showName').value,
            type: document.getElementById('showType').value,
            status: document.getElementById('status').value,
            season: parseInt(document.getElementById('season').value),
            episode: parseInt(document.getElementById('episode').value),
            watchLink: document.getElementById('watchLink').value,
            posterImage: document.getElementById('posterImage').value,
            notes: document.getElementById('notes').value
        };

        try {
            if (this.currentEditId) {
                await storage.updateShow(this.currentEditId, showData);
            } else {
                await storage.addShow(showData);
            }
            return true;
        } catch (error) {
            alert('Error saving show: ' + error.message);
            return false;
        }
    }

    updateImagePreview(url) {
        const preview = document.getElementById('imagePreview');
        if (url.trim()) {
            preview.innerHTML = `<img src="${this.escapeHtml(url)}" alt="Preview" onerror="this.parentElement.innerHTML='Image failed to load'">`;
        } else {
            preview.innerHTML = '';
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        const saved = await this.saveFormData();
        if (saved) {
            this.closeModal();
            this.loadShows();
        }
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
            alert('Error updating episode: ' + error.message);
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
            alert('Error updating season: ' + error.message);
        }
    }

    
    async editShow(showId) {
        this.openModal(showId);
    }

    async deleteShow(showId) {
        if (confirm('Are you sure you want to delete this show?')) {
            try {
                await storage.deleteShow(showId);
                this.loadShows();
            } catch (error) {
                alert('Error deleting show: ' + error.message);
            }
        }
    }

    async deleteCurrentShow() {
        if (!this.currentEditId) return;

        const confirmed = confirm('Are you sure you want to delete this show?');
        if (!confirmed) return;

        try {
            await storage.deleteShow(this.currentEditId);
            this.closeModal();
            this.loadShows();
        } catch (error) {
            alert('Error deleting show: ' + error.message);
        }
    }

    async clearAllShows() {
        try {
            const shows = await storage.getAllShows();

            if (shows.length === 0) {
                alert('Your list is already empty.');
                return;
            }

            const firstConfirm = confirm(
                `This will permanently delete all ${shows.length} entries from your tracker. This cannot be undone.\n\n` +
                'Press OK only if you are sure.'
            );
            if (!firstConfirm) return;

            const typedConfirm = prompt('Type DELETE ALL to confirm permanent list deletion:');
            if (typedConfirm !== 'DELETE ALL') {
                alert('Clear list canceled. Confirmation text did not match.');
                return;
            }

            const finalConfirm = confirm('Final warning: delete everything now?');
            if (!finalConfirm) return;

            await storage.clearAllShows();
            this.loadShows();
            alert('All entries were deleted.');
        } catch (error) {
            alert('Error clearing list: ' + error.message);
        }
    }

    async exportToMAL() {
        try {
            const shows = await storage.getAllShows();
            const animeShows = shows.filter(show => show.type === 'anime');

            if (animeShows.length === 0) {
                alert('No Anime entries found to export in MAL format.');
                return;
            }

            await MALImporter.exportAsMAL(animeShows);
            alert(`MAL Export complete. Exported ${animeShows.length} Anime entries.`);
        } catch (error) {
            alert('Error exporting: ' + error.message);
        }
    }

    async importFromMAL(file) {
        try {
            const shows = await MALImporter.importMALFile(file);
            
            if (shows.length === 0) {
                alert('No anime found in the file');
                return;
            }

            const confirmImport = confirm(`Import ${shows.length} items? Existing items will not be replaced.`);
            if (!confirmImport) return;

            const shouldFetchCovers = confirm('Auto-fetch cover images online for imported anime without images? This may take longer.');
            let fetchedCoverCount = 0;
            let importedCount = 0;
            let failedCount = 0;

            this.showMALImportProgress(shows.length);
            await this.yieldToUI();

            for (let index = 0; index < shows.length; index++) {
                const show = shows[index];
                const currentItem = index + 1;

                this.updateMALImportProgress(
                    index,
                    shows.length,
                    importedCount,
                    fetchedCoverCount,
                    failedCount,
                    `Processing ${currentItem}/${shows.length}: ${show.name}`
                );
                await this.yieldToUI();

                try {
                    let showToSave = show;

                    if (shouldFetchCovers && (!show.posterImage || !show.posterImage.trim())) {
                        this.updateMALImportProgress(
                            index,
                            shows.length,
                            importedCount,
                            fetchedCoverCount,
                            failedCount,
                            `Fetching cover for ${show.name}...`
                        );
                        await this.yieldToUI();

                        showToSave = await MALImporter.enrichShowWithCover(show);
                        if (showToSave.posterImage && showToSave.posterImage.trim()) {
                            fetchedCoverCount += 1;
                        }
                    }

                    await storage.addShow(showToSave);
                    importedCount += 1;
                } catch (_entryError) {
                    failedCount += 1;
                }

                this.updateMALImportProgress(
                    currentItem,
                    shows.length,
                    importedCount,
                    fetchedCoverCount,
                    failedCount,
                    `Processed ${currentItem}/${shows.length}: ${show.name}`
                );
                await this.yieldToUI();
            }

            this.loadShows();
            await this.completeMALImportProgress(shows.length, importedCount, fetchedCoverCount, failedCount);
            alert(
                `Import complete. Added: ${importedCount}/${shows.length}. ` +
                `Auto-fetched covers: ${fetchedCoverCount}. Failed: ${failedCount}.`
            );
            document.getElementById('malImportFile').value = '';
        } catch (error) {
            alert('Error importing: ' + error.message);
            document.getElementById('malImportProgress').classList.add('hidden');
            document.getElementById('malImportFile').value = '';
        }
    }

    downloadTextFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async exportTVShows() {
        try {
            const shows = await storage.getAllShows();
            const tvShows = shows.filter(show => show.type === 'tv');

            if (tvShows.length === 0) {
                alert('No TV Show entries found to export.');
                return;
            }

            const payload = {
                format: 'anime-show-tracker-tv-v1',
                exportedAt: new Date().toISOString(),
                total: tvShows.length,
                shows: tvShows.map(show => ({
                    name: show.name || 'Untitled',
                    season: Number.isFinite(show.season) ? show.season : 1,
                    episode: Number.isFinite(show.episode) ? show.episode : 1,
                    status: show.status || 'watching',
                    watchLink: show.watchLink || '',
                    posterImage: show.posterImage || '',
                    notes: show.notes || ''
                }))
            };

            this.downloadTextFile(
                JSON.stringify(payload, null, 2),
                `tvshows_export_${Date.now()}.json`,
                'application/json'
            );

            alert(`TV Export complete. Exported ${tvShows.length} TV entries.`);
        } catch (error) {
            alert('Error exporting TV Shows: ' + error.message);
        }
    }

    normalizeTVShow(raw) {
        const season = parseInt(raw.season, 10);
        const episode = parseInt(raw.episode, 10);

        return {
            name: (raw.name || '').toString().trim() || 'Untitled TV Show',
            type: 'tv',
            status: (raw.status || 'watching').toString(),
            season: Number.isNaN(season) ? 1 : Math.max(1, season),
            episode: Number.isNaN(episode) ? 1 : Math.max(1, episode),
            watchLink: (raw.watchLink || '').toString(),
            posterImage: (raw.posterImage || '').toString(),
            notes: (raw.notes || '').toString(),
            importSource: 'tv-json',
            modifiedAfterImport: false,
            importedAt: new Date().toISOString()
        };
    }

    async importTVShows(file) {
        try {
            const content = await file.text();
            const parsed = JSON.parse(content);

            let sourceItems = [];
            if (Array.isArray(parsed)) {
                sourceItems = parsed;
            } else if (Array.isArray(parsed.shows)) {
                sourceItems = parsed.shows;
            } else {
                throw new Error('Invalid TV import file. Expected JSON array or { shows: [] }.');
            }

            if (sourceItems.length === 0) {
                alert('No TV entries found in the selected file.');
                return;
            }

            const confirmImport = confirm(`Import ${sourceItems.length} TV entries? Existing entries will not be replaced.`);
            if (!confirmImport) return;

            let importedCount = 0;
            let failedCount = 0;

            for (const item of sourceItems) {
                try {
                    const tvShow = this.normalizeTVShow(item);
                    await storage.addShow(tvShow);
                    importedCount += 1;
                } catch (_entryError) {
                    failedCount += 1;
                }
            }

            this.loadShows();
            alert(`TV Import complete. Added: ${importedCount}/${sourceItems.length}. Failed: ${failedCount}.`);
            document.getElementById('tvImportFile').value = '';
        } catch (error) {
            alert('Error importing TV Shows: ' + error.message);
            document.getElementById('tvImportFile').value = '';
        }
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
        new ShowTracker();
    });
} else {
    new ShowTracker();
}
