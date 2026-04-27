
export interface YouTubeSearchResult {
    videoId: string;
    title: string;
    thumbnail: string;
    channelTitle: string;
}

export const buscarYouTube = async (query: string): Promise<YouTubeSearchResult[]> => {
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
        throw new Error('NETWORK_ERROR');
    }
};
