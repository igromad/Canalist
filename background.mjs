import { isVideoId, watchUrl } from "./catalog.mjs";

const stateKey = "library";
const youtubeOrigin = "https://www.youtube.com";
let pending = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(console.error);
});

async function sessionId() {
  const { session } = await chrome.storage.session.get("session");
  if (session) return session;
  const id = crypto.randomUUID();
  await chrome.storage.session.set({ session: id });
  return id;
}

async function openQueueItem(queue, { reuse = false, resume = false } = {}) {
  const id = queue.ids[queue.index];
  const url = watchUrl(id);
  const seconds = resume ? queue.progress?.seconds : 0;
  const target = seconds > 0 ? `${url}&t=${seconds}s` : url;
  const session = await sessionId();
  if (queue.session === session && Number.isInteger(queue.tabId)) {
    const tab = await chrome.tabs.get(queue.tabId).catch(() => null);
    if (tab?.url?.startsWith(`${youtubeOrigin}/`)) {
      if (reuse && (tab.url === url || tab.url === target)) {
        await chrome.tabs.update(tab.id, { active: true });
      } else {
        await chrome.tabs.update(tab.id, { url: target, ...(reuse && { active: true }) });
      }
      return;
    }
  }
  if (!reuse) throw new Error("Abra o próximo vídeo pelo botão Abrir vídeo.");
  const tab = await chrome.tabs.create({ url: target });
  queue.session = session;
  queue.tabId = tab.id;
}

async function handle(message, sender) {
  if (message.type === "remember-channel" || message.type === "remember-channels") {
    const entries = message.entries ?? [{ input: message.input, title: message.title, playlistId: message.playlistId }];
    const { recentChannels = [] } = await chrome.storage.local.get("recentChannels");
    const ids = new Set(entries.map(({ playlistId }) => playlistId));
    const previous = recentChannels.filter((entry) => !ids.has(entry.playlistId));
    await chrome.storage.local.set({ lastChannels: entries, recentChannels: [...entries, ...previous].slice(0, 10) });
    return;
  }
  const { [stateKey]: state = { watched: [], queue: null, lastMarked: null } } =
    await chrome.storage.local.get(stateKey);
  const save = () => chrome.storage.local.set({ [stateKey]: state });
  const watched = new Set(state.watched);
  const mark = (id) => {
    if (watched.has(id)) return;
    watched.add(id);
    state.watched = [...watched];
    state.lastMarked = id;
  };
  const { queue } = state;
  const current = queue?.ids[queue.index];

  switch (message.type) {
    case "shortcut-status":
      return Boolean(current && current === message.id && queue.tabId === sender.tab?.id && queue.session === await sessionId());
    case "resume-status": {
      if (!current) return false;
      if (queue.session !== await sessionId()) return true;
      const tab = await chrome.tabs.get(queue.tabId).catch(() => null);
      if (!tab) return true;
      if (tab.status === "loading" && !tab.pendingUrl) return false;
      const targetUrl = tab.pendingUrl || tab.url;
      if (!targetUrl) return true;
      try {
        const url = new URL(targetUrl);
        return url.origin !== youtubeOrigin || url.pathname !== "/watch" ||
          url.searchParams.get("v") !== current;
      } catch {
        return true;
      }
    }
    case "playback-control":
    case "playback-status": {
      if (!current || message.token !== queue.token || message.id !== current) return { state: "missing" };
      let tab;
      if (queue.session === await sessionId() && Number.isInteger(queue.tabId)) {
        tab = await chrome.tabs.get(queue.tabId).catch(() => null);
      }
      let isCurrentVideo = false;
      try {
        const url = new URL(tab?.url);
        isCurrentVideo = url.origin === youtubeOrigin && url.pathname === "/watch" &&
          url.searchParams.get("v") === current;
      } catch {}
      if (!isCurrentVideo) {
        if (message.type === "playback-status") return { state: "missing" };
        await openQueueItem(queue, { reuse: true, resume: true });
        await save();
        return { state: "opening" };
      }
      const type = message.type === "playback-control" ? "playback-toggle" : "playback-state";
      const response = await chrome.tabs.sendMessage(tab.id, { type, id: current }).catch(() => null);
      if (response?.error || !response) {
        if (message.type === "playback-status") return { state: "unknown" };
        throw new Error(response?.error === "play-blocked" ?
          "Não foi possível iniciar o vídeo. Use o player do YouTube." :
          "Não foi possível controlar o vídeo. Atualize a aba do YouTube.");
      }
      return { state: response.paused ? "paused" : "playing" };
    }
    case "progress":
      if (queue?.tabId !== sender.tab.id || message.id !== current ||
          queue.session !== await sessionId() || !Number.isSafeInteger(message.seconds) ||
          message.seconds < 0) return;
      queue.progress = { seconds: message.seconds, paused: message.paused === true };
      await save();
      return;
    case "start": {
      const ids = [...new Set(message.ids)].filter((id) => isVideoId(id) && !watched.has(id));
      if (!ids.length) throw new Error("Nenhum vídeo pendente para reproduzir.");
      const periods = new Set(["7days", "30days", "month", "all", "custom"]);
      const sorts = new Set(["newest", "oldest", "views"]);
      state.queue = {
        ids,
        index: 0,
        token: crypto.randomUUID(),
        tabId: null,
        sources: Array.isArray(message.sources) ? message.sources : [],
        period: periods.has(message.period) ? message.period : "7days",
        customSince: typeof message.customSince === "string" ? message.customSince : "",
        sort: sorts.has(message.sort) ? message.sort : "newest",
        revision: 0
      };
      await openQueueItem(state.queue, { reuse: true });
      await save();
      return;
    }
    case "reorder": {
      if (!queue || message.token !== queue.token || !Array.isArray(message.ids)) return;
      if (queue.ids[queue.index] !== message.currentId) {
        throw new Error("A fila avançou durante a ordenação. Tente novamente.");
      }
      const allowed = new Set(queue.ids);
      const ids = [...new Set(message.ids)].filter((id) => isVideoId(id) && allowed.has(id) && !watched.has(id));
      if (!ids.length) throw new Error("Nenhum vídeo pendente para reproduzir.");
      queue.ids = ids;
      queue.index = 0;
      if (["newest", "oldest", "views"].includes(message.sort)) queue.sort = message.sort;
      queue.revision = (queue.revision ?? 0) + 1;
      delete queue.progress;
      await openQueueItem(queue, { reuse: true });
      await save();
      return;
    }
    case "refresh": {
      if (!queue || message.token !== queue.token || !Array.isArray(message.ids)) return;
      if (queue.ids[queue.index] !== message.currentId) {
        throw new Error("A fila avançou durante a atualização. Tente novamente.");
      }
      const previousIds = queue.ids;
      const previousSet = new Set(previousIds);
      const removedWatched = previousIds.filter((id) => watched.has(id) && id !== message.currentId).length;
      const ids = [...new Set(message.ids)].filter((id) => isVideoId(id) && (!watched.has(id) || id === message.currentId));
      const added = ids.filter((id) => !previousSet.has(id)).length;
      queue.ids = ids;
      queue.index = 0;
      if (["newest", "oldest", "views"].includes(message.sort)) queue.sort = message.sort;
      queue.revision = (queue.revision ?? 0) + 1;
      if (!message.currentId) delete queue.progress;
      if (!ids.length) {
        await save();
        return { added, removedWatched };
      }
      if (!message.currentId) await openQueueItem(queue, { reuse: true });
      await save();
      return { added, removedWatched };
    }
    case "resume":
      if (!current || message.token !== queue.token) return;
      await openQueueItem(queue, { reuse: true, resume: true });
      await save();
      return;
    case "shortcut-previous":
      if (!current || message.id !== current || queue.tabId !== sender.tab?.id || queue.session !== await sessionId() || queue.index <= 0 || !queue.ids[queue.index - 1]) return;
      delete queue.progress;
      queue.index -= 1;
      await openQueueItem(queue, { reuse: true });
      await save();
      return;
    case "jump":
      if (!queue || message.token !== queue.token || message.from !== queue.index ||
          !Number.isInteger(message.index) || !queue.ids[message.index]) return;
      const sameItem = queue.index === message.index;
      if (!sameItem) delete queue.progress;
      queue.index = message.index;
      await openQueueItem(queue, { reuse: true, resume: sameItem });
      await save();
      return;
    case "stop":
      if (!queue || message.token !== queue.token) return;
      state.queue = null;
      await save();
      return;
    case "import": {
      const before = watched.size;
      for (const id of message.ids) {
        if (isVideoId(id)) watched.add(id);
      }
      state.watched = [...watched];
      await save();
      return watched.size - before;
    }
    case "undo":
      if (!state.lastMarked || message.id !== state.lastMarked) return false;
      watched.delete(state.lastMarked);
      state.lastMarked = null;
      state.watched = [...watched];
      await save();
      return true;
    case "ended": {
      if (!isVideoId(message.id)) return;
      const queueTab = queue?.tabId === sender.tab.id && queue.session === await sessionId();
      if (!queueTab || message.id !== current) {
        const { trackOutsideQueue } = await chrome.storage.local.get("trackOutsideQueue");
        if (trackOutsideQueue && !watched.has(message.id)) {
          mark(message.id);
          await save();
        }
        return;
      }
      break;
    }
    case "complete":
    case "skip":
      if (!current || message.token !== queue.token || message.id !== current) return;
      break;
    case "shortcut-next":
      if (!current || message.id !== current || queue.tabId !== sender.tab?.id || queue.session !== await sessionId()) return;
      break;
    default:
      return;
  }

  mark(current);
  delete queue.progress;
  do {
    queue.index += 1;
  } while (queue.index < queue.ids.length && watched.has(queue.ids[queue.index]));
  await save();

  if (queue.index < queue.ids.length) {
    const manual = message.type !== "ended";
    await openQueueItem(queue, { reuse: manual });
    if (manual) await save();
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.library) return;
  const oldQueue = changes.library.oldValue?.queue;
  const queue = changes.library.newValue?.queue;
  void sessionId().then((session) => {
    for (const id of new Set([oldQueue?.tabId, queue?.tabId])) {
      if (!Number.isInteger(id)) continue;
      const current = queue?.tabId === id && queue.session === session ? queue.ids[queue.index] : null;
      void chrome.tabs.sendMessage(id, { type: "shortcut-context", id: current ?? null }).catch(() => {});
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || sender.id !== chrome.runtime.id) return false;
  if (["ended", "progress", "shortcut-status", "shortcut-previous", "shortcut-next"].includes(message.type)) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 ||
        sender.origin !== youtubeOrigin) return false;
  } else if (sender.url !== chrome.runtime.getURL("panel.html")) {
    return false;
  }

  const operation = pending.then(() => handle(message, sender));
  pending = operation.catch(() => {});
  operation.then(
    (value) => respond({ ok: true, value }),
    (error) => respond({ ok: false, error: error.message })
  );
  return true;
});
