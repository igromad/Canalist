# Canalist

A browser extension for Vivaldi, Chrome, and Edge that builds a queue of unwatched channel uploads and plays each video in YouTube's regular player.

## Local installation

1. If you received a ZIP file, extract it.
2. Open `vivaldi://extensions` in Vivaldi, `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
3. Enable **Developer mode**, click **Load unpacked**, and select the folder containing `manifest.json`.
4. In the [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com), enable **YouTube Data API v3** in a project. Under **APIs & Services → Credentials**, create an API key and restrict it to YouTube Data API v3.
5. Click the extension icon. Under **API settings**, paste the key and click **Save**. The key is stored in your browser profile and sent to Google with requests. Use your own key for this local installation.

## Usage

1. Enter a channel `@handle`, a channel URL, or an [uploads playlist URL](https://www.youtube.com/playlist?list=UUJx5KP-pCUmL9eZUv-mIcNw). **Use current tab** copies the address of the channel or playlist currently open. The field is prefilled with the last successfully searched channel. Use **Recent channels** to choose from the last 10.
2. **Published since** defaults to the last seven calendar days, including today. Change the date or clear the field to include all uploads. The cutoff starts at midnight on the selected date in your local time zone. Choose a sort order and click **Create queue**.
3. The queue appears in the panel with titles, thumbnails, and a highlight on the selected video. Click any item to open it in the same playback tab. The next button marks the current video as watched before advancing. Use the arrows below the list to browse more videos.
4. When a video ends in the playback tab, the extension records its ID and opens the next video. If the browser requires a click to start playback, use the player button. If you close the tab or restart the browser, **Open video** reopens the current item. **End queue** clears the selection without deleting your history.
5. **Also track videos completed outside the queue** records viewing sessions on regular YouTube `/watch` pages in the same profile. It is off by default. After installing or reloading the extension, refresh YouTube tabs that were already open to enable tracking on them.

## Watched videos file

**Export TXT** downloads `watched.txt` with one video ID per line. **Import TXT** merges IDs into your local history and accepts lines in the Stacher/yt-dlp downloads format, such as `youtube dQw4w9WgXcQ`. Imported IDs are excluded from future queues. The original file is left unchanged. To undo a recent completion, use **Undo last mark** and create the queue again.

## Panel features

- Choose **PT-BR** or **English** in the header. The extension starts in English and saves the preference in this browser profile.
- Use **Add** or **Recent channels** to select multiple channels. **Create queue** combines their results and applies the same date and sort order to all of them. The panel remembers your last selection.
- When you return after closing the queue tab or navigating to another video, choose **Resume queue** or **Build a new queue**. The extension saves the position while a video plays and when it is paused. If the tab was closed, it reopens the video near the saved position. The previous queue remains available until you start another one or click **End queue**.
- Open **Local history** to import or export IDs. Under **API settings → How to create an API key**, you will find step-by-step instructions with links to Google Cloud.

## Scope and limitations

- History is stored in the browser profile. Use the TXT file to transfer it to another installation. Your existing YouTube account watch history is not imported automatically; import IDs or mark videos in this extension to add them.
- The extension manages the queue and plays it on `youtube.com/watch`. It stays in this browser until replaced or ended. Titles and thumbnails come from the YouTube API and are fetched again when you reopen the panel.
- Automatic detection depends on YouTube's player structure. If a video is unavailable or the player does not signal completion, use the queue controls. Automatic tracking covers `/watch` pages; the vertical Shorts interface is outside the current scope.
- **Create queue** reads the uploads playlist in pages of up to 50 and only counts videos within the selected date range. When a date is set, the search stops after two consecutive pages of dated videos that are all older than the cutoff. An out-of-order video appearing later in the playlist may therefore be missed. Clear the date to scan the entire playlist.
- **Most viewed** sorts selected videos by public YouTube view count, highest first. Ties are sorted by newest first.
