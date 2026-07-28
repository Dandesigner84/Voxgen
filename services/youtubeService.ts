
export interface YouTubeSearchResult {
    videoId: string;
    title: string;
    thumbnail: string;
    channelTitle: string;
}

/**
 * Extracts 11-character YouTube video ID from any link or string format
 */
export const extractYouTubeVideoId = (input: string): string | null => {
    if (!input) return null;
    const trimmed = input.trim();
    
    // Regex for youtu.be/, youtube.com/watch?v=, embed/, v/, shorts/, live/
    const ytRegExp = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/|live\/)|youtu\.be\/)([^"&?/\s]{11})/;
    const match = trimmed.match(ytRegExp);
    if (match && match[1]) {
        return match[1];
    }

    // Match query param v=XXXXXXXXXXX
    const vMatch = trimmed.match(/[?&]v=([^"&?/\s]{11})/);
    if (vMatch && vMatch[1]) {
        return vMatch[1];
    }

    // Direct 11-char video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
        return trimmed;
    }

    return null;
};

/**
 * Get YouTube metadata using oEmbed (no API Key required) or direct fallback
 */
export const getYouTubeMetadata = async (input: string): Promise<YouTubeSearchResult> => {
    const videoId = extractYouTubeVideoId(input);
    if (!videoId) {
        throw new Error('INVALID_URL');
    }

    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const response = await fetch(oembedUrl);
        if (response.ok) {
            const data = await response.json();
            return {
                videoId,
                title: data.title || `Trilha YouTube (${videoId})`,
                thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                channelTitle: data.author_name || 'YouTube'
            };
        }
    } catch (e) {
        console.warn('YouTube oEmbed unavailable, using fallback metadata', e);
    }

    return {
        videoId,
        title: `Trilha YouTube (${videoId})`,
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        channelTitle: 'YouTube'
    };
};

export const buscarYouTube = async (query: string): Promise<YouTubeSearchResult[]> => {
    const videoId = extractYouTubeVideoId(query);
    if (videoId) {
        const metadata = await getYouTubeMetadata(query);
        return [metadata];
    }

    const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
    
    if (!apiKey) {
        console.warn('VITE_YOUTUBE_API_KEY is not defined');
        throw new Error('API_KEY_MISSING');
    }

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5&key=${apiKey}`;

    try {
        const response = await fetch(url);
        
        if (response.status === 403) {
            throw new Error('LIMIT_EXCEEDED');
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            if (errorData.error?.message?.includes('API key not valid')) {
                throw new Error('INVALID_API_KEY');
            }
            throw new Error('NETWORK_ERROR');
        }

        const data = await response.json();
        
        return data.items.map((item: any) => ({
            videoId: item.id.videoId,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.default.url,
            channelTitle: item.snippet.channelTitle
        }));
    } catch (error: any) {
        console.error('Error fetching from YouTube API:', error);
        if (error.message === 'INVALID_API_KEY' || error.message === 'LIMIT_EXCEEDED' || error.message === 'API_KEY_MISSING') {
            throw error;
        }
        throw new Error('NETWORK_ERROR', { cause: error });
    }
};

