(() => {
  let playing = null;
  let lastReport = 0;

  async function sendPlaybackMessage(message) {
    try {
      await chrome.runtime.sendMessage(message);
    } catch {
      // A YouTube tab already open during an extension reload needs a page refresh.
    }
  }

  function report(paused) {
    if (!playing) return;
    const { id, video, source } = playing;
    if (video.currentSrc !== source || video.ended || !isMainVideo(video) ||
        !Number.isFinite(video.currentTime)) return;
    lastReport = Date.now();
    void sendPlaybackMessage({
      type: "progress", id, seconds: Math.floor(video.currentTime), paused
    });
  }

  function videoId() {
    if (location.pathname !== "/watch") return null;
    const id = new URLSearchParams(location.search).get("v");
    const mountedId = document.querySelector("ytd-watch-flexy[video-id]")?.getAttribute("video-id");
    if (mountedId && mountedId !== id) return null;
    return /^[A-Za-z0-9_-]{11}$/.test(id ?? "") ? id : null;
  }

  function isMainVideo(video) {
    const player = video.closest("#movie_player");
    return player && video.matches("video.html5-main-video") &&
      !player.matches(".ad-showing, .ad-interrupting");
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !["playback-state", "playback-toggle"].includes(message?.type)) return false;
    const video = document.querySelector("#movie_player video.html5-main-video");
    if (videoId() !== message.id || !(video instanceof HTMLVideoElement) || !isMainVideo(video)) {
      respond({ error: "player-unavailable" });
      return false;
    }
    if (message.type === "playback-state") {
      respond({ paused: video.paused });
      return false;
    }
    if (!video.paused) {
      video.pause();
      respond({ paused: true });
      return false;
    }
    video.play().then(() => respond({ paused: false }), () => respond({ error: "play-blocked" }));
    return true;
  });

  // Require a playback sample from the same media source and URL before trusting "ended".
  function observe(event) {
    const video = event.target;
    if (!event.isTrusted || !(video instanceof HTMLVideoElement)) return;
    const id = videoId();
    if (!id || !isMainVideo(video)) {
      if (playing?.video === video) playing = null;
      return;
    }
    if (video.paused || !video.currentSrc) return;
    const changed = playing?.id !== id || playing.source !== video.currentSrc;
    playing = { id, video, source: video.currentSrc };
    if (changed || event.type === "playing" || Date.now() - lastReport >= 8000) report(false);
  }

  document.addEventListener("playing", observe, true);
  document.addEventListener("timeupdate", observe, true);
  document.addEventListener("pause", (event) => {
    if (event.isTrusted && playing?.video === event.target && videoId() === playing.id) report(true);
  }, true);
  document.addEventListener("yt-navigate-start", () => {
    report(true);
    playing = null;
  }, true);
  window.addEventListener("pagehide", () => report(true));

  document.addEventListener("ended", (event) => {
    const video = event.target;
    if (!event.isTrusted || !playing || video !== playing.video || !video.ended ||
        videoId() !== playing.id || video.currentSrc !== playing.source || !isMainVideo(video)) {
      return;
    }
    const { id } = playing;
    playing = null;
    void sendPlaybackMessage({ type: "ended", id });
  }, true);
})();
