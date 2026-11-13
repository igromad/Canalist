# Canalist: Binge Your Channels

Canalist builds a queue from one or more YouTube channels and keeps track of watched videos locally. The queue plays in YouTube's standard video player.

## Installation

1. Download or clone this repository.
2. Open your browser's extensions page and enable developer mode.
3. Choose **Load unpacked** (or the browser's equivalent) and select the folder containing `manifest.json`.
4. In the [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com), enable **YouTube Data API v3** and create an API key under **APIs & Services → Credentials**. Restrict the key to YouTube Data API v3.
5. Open Canalist's **API settings**, enter the key, and save it. The key is stored in the browser profile and used for YouTube API requests.

## Create a queue

1. Enter a YouTube channel handle, channel URL, or uploads playlist URL. You can add multiple channels to the same queue.
2. Choose a **Published** period: the last 24 hours, the last 7 days (default), the last 30 days, this month, the last year, all time, or a custom start date.
3. Choose a sort order and click **Create queue**. Available orders include newest, oldest, and most viewed.
4. Select a video from the list or use the playback controls. The next control marks the current video as watched before advancing.

The extension opens videos in YouTube. When a video finishes, Canalist records its ID and advances to the next item. Use the sort icon beside the playback controls to reorder a queue that is already running; the current video stays first, and watched videos are removed. The refresh button in **Build a queue** repeats the queue's saved channel, date, and sort settings, adds newly uploaded videos, removes watched ones, reports both counts, and leaves the current video playing without interruption. If you return to an interrupted queue, you can resume it or build a new one. Playback position is saved when the video is paused or playing.

On the YouTube tab playing the current queue video, **P** plays the previous video and **N** marks the current video as watched and advances. These shortcuts do not apply while typing or watching other YouTube videos.

## Watched video history

Watched IDs are stored locally in the browser profile and excluded from future queues. Import or export a TXT file to transfer history between profiles. The import accepts one video ID per line and common downloader formats, such as `youtube VIDEO_ID`.

By default, Canalist tracks videos watched in its queue. An optional setting also tracks completed videos on standard YouTube watch pages. Existing YouTube watch history is not imported automatically.

## Settings

- **Language:** English or Brazilian Portuguese.
- **Published period:** choose the last 24 hours, the last 7 days (default), the last 30 days, this month, the last year, all time, or a custom start date.
- **Sort order:** newest, oldest, or most viewed.
- **Track videos outside the queue:** records completed videos on standard YouTube watch pages.

## Notes

- Video history and queue state remain in the current browser profile. Use the TXT export to move watched IDs to another profile.
- Titles, thumbnails, upload dates, and view counts are retrieved from YouTube Data API v3. Each user supplies and stores their own API key.
- Automatic playback tracking depends on YouTube's player behavior. If a video does not advance automatically, use the queue controls. Shorts are not supported.
- With a date filter, the search may stop after two consecutive pages containing only videos older than the selected date. If uploads are out of chronological order, later matching videos may be missed. Clear the date to scan the full uploads playlist.
