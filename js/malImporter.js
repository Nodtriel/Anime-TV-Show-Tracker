// MyAnimeList XML Import/Export functionality
class MALImporter {
    static shouldUpdateOnImport(show) {
        return 1;
    }

    // Map MAL status to extension status
    static mapMALStatus(malStatus) {
        const statusMap = {
            'watching': 'watching',
            'completed': 'completed',
            'on-hold': 'break',
            'dropped': 'dropped',
            'plan to watch': 'watching'
        };
        return statusMap[malStatus.toLowerCase()] || 'watching';
    }

    // Map extension status to MAL status
    static mapToMALStatus(extensionStatus) {
        const statusMap = {
            'watching': 'Watching',
            'ongoing': 'Watching',
            'break': 'On-Hold',
            'hiatus': 'On-Hold',
            'completed': 'Completed',
            'dropped': 'Dropped'
        };
        return statusMap[extensionStatus] || 'Watching';
    }

    static async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static async fetchJsonWithRetry(url) {
        try {
            const response = await fetch(url);
            if (response.status === 429) {
                await this.sleep(1200);
                const retryResponse = await fetch(url);
                if (!retryResponse.ok) {
                    return null;
                }
                return retryResponse.json();
            }

            if (!response.ok) {
                return null;
            }

            return response.json();
        } catch (_error) {
            return null;
        }
    }

    static getJikanImageUrl(animeNode) {
        if (!animeNode || !animeNode.images) {
            return '';
        }

        return animeNode.images.jpg?.large_image_url
            || animeNode.images.jpg?.image_url
            || animeNode.images.webp?.large_image_url
            || animeNode.images.webp?.image_url
            || '';
    }

    static async fetchCoverFromMalId(malId) {
        if (!malId || Number.isNaN(Number(malId))) {
            return '';
        }

        const data = await this.fetchJsonWithRetry(`https://api.jikan.moe/v4/anime/${malId}`);
        if (!data || !data.data) {
            return '';
        }

        return this.getJikanImageUrl(data.data);
    }

    static async fetchCoverFromTitle(title) {
        if (!title || !title.trim()) {
            return '';
        }

        const query = encodeURIComponent(title.trim());
        const data = await this.fetchJsonWithRetry(`https://api.jikan.moe/v4/anime?q=${query}&limit=1`);

        if (!data || !Array.isArray(data.data) || data.data.length === 0) {
            return '';
        }

        return this.getJikanImageUrl(data.data[0]);
    }

    static async enrichShowWithCover(show) {
        if (show.posterImage && show.posterImage.trim()) {
            return show;
        }

        let coverUrl = '';
        if (show.malId) {
            coverUrl = await this.fetchCoverFromMalId(show.malId);
            await this.sleep(350);
        }

        if (!coverUrl) {
            coverUrl = await this.fetchCoverFromTitle(show.name);
            await this.sleep(350);
        }

        if (!coverUrl) {
            return show;
        }

        return {
            ...show,
            posterImage: coverUrl
        };
    }

    // Parse MAL XML and convert to extension format
    static parseMALXML(xmlString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

        if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
            throw new Error('Invalid XML format');
        }

        const animeList = [];
        const animeElements = xmlDoc.getElementsByTagName('anime');

        for (let elem of animeElements) {
            const malIdRaw = elem.getElementsByTagName('series_animedb_id')[0]?.textContent || '';
            const malId = parseInt(malIdRaw, 10);
            const seriesTitle = elem.getElementsByTagName('series_title')[0]?.textContent || 'Unknown';
            const myWatchedEpisodes = parseInt(elem.getElementsByTagName('my_watched_episodes')[0]?.textContent || '0');
            const myStatus = elem.getElementsByTagName('my_status')[0]?.textContent || 'Plan to Watch';

            // MAL XML import is anime-only, so keep everything in the Anime category.
            const type = 'anime';

            // Estimate season/episode from watched episodes
            // Assume roughly 12-25 episodes per season
            let season = Math.max(1, Math.ceil(myWatchedEpisodes / 12));
            let episode = myWatchedEpisodes > 0 ? ((myWatchedEpisodes - 1) % 12) + 1 : 1;

            const show = {
                id: `mal_${Date.now()}_${Math.random()}`,
                name: seriesTitle,
                type: type,
                season: season,
                episode: episode,
                status: this.mapMALStatus(myStatus),
                watchLink: '',
                posterImage: '',
                notes: `Imported from MAL - S${season}E${episode}`,
                malId: Number.isNaN(malId) ? null : malId,
                importSource: 'mal',
                importedAt: new Date().toISOString(),
                modifiedAfterImport: false
            };

            animeList.push(show);
        }

        return animeList;
    }

    // Convert extension shows to MAL XML format
    static generateMALXML(shows) {
        const animeShows = shows.filter(show => show.type === 'anime');

        let xml = '<?xml version="1.0" encoding="UTF-8" ?>\n';
        xml += '<!-- Exported from Anime & Show Tracker -->\n';
        xml += '<myanimelist>\n';
        xml += '\t<myinfo>\n';
        xml += '\t\t<user_export_type>1</user_export_type>\n';
        xml += `\t\t<user_total_anime>${animeShows.length}</user_total_anime>\n`;
        xml += `\t\t<user_total_watching>${animeShows.filter(s => s.status === 'watching').length}</user_total_watching>\n`;
        xml += `\t\t<user_total_completed>${animeShows.filter(s => s.status === 'completed').length}</user_total_completed>\n`;
        xml += `\t\t<user_total_dropped>${animeShows.filter(s => s.status === 'dropped').length}</user_total_dropped>\n`;
        xml += '\t</myinfo>\n\n';

        animeShows.forEach(show => {
            const totalEpisodes = (show.season - 1) * 12 + show.episode;
            xml += '\t<anime>\n';
            xml += `\t\t<series_animedb_id>${show.malId || 0}</series_animedb_id>\n`;
            xml += `\t\t<series_title><![CDATA[${show.name}]]></series_title>\n`;
            xml += `\t\t<series_type>TV</series_type>\n`;
            xml += `\t\t<series_episodes>0</series_episodes>\n`;
            xml += `\t\t<my_watched_episodes>${totalEpisodes}</my_watched_episodes>\n`;
            xml += `\t\t<my_start_date>0000-00-00</my_start_date>\n`;
            xml += `\t\t<my_finish_date>0000-00-00</my_finish_date>\n`;
            xml += `\t\t<my_score>0</my_score>\n`;
            xml += `\t\t<my_status>${this.mapToMALStatus(show.status)}</my_status>\n`;
            xml += `\t\t<update_on_import>1</update_on_import>\n`;
            xml += '\t</anime>\n\n';
        });

        xml += '</myanimelist>';
        return xml;
    }

    // Export shows as MAL XML
    static async exportAsMAL(shows) {
        const xmlContent = this.generateMALXML(shows);
        const blob = new Blob([xmlContent], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `animelist_export_${Date.now()}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Import MAL XML file
    static async importMALFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const xmlString = e.target.result;
                    const shows = this.parseMALXML(xmlString);
                    resolve(shows);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }
}
