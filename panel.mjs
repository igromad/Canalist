import { defaultSince, fetchChannels, fetchVideoDetails, fetchViewCounts, parseChannel, readArchive, selectVideos } from "./catalog.mjs";

const byId = (id) => document.getElementById(id);
const channel = byId("channel");
const recentChannels = byId("recent-channels");
const period = byId("period");
const customSince = byId("custom-since");
const since = byId("since");
since.value = defaultSince();
const order = byId("order");
const queueSortMenu = byId("queue-sort-menu");
let queueOrder = "newest";
const search = byId("search");
const apiKey = byId("api-key");
const trackOutside = byId("track-outside");
const language = byId("language");
const localizedText = [...document.querySelectorAll("[data-en]")].map((element) =>
  [element, element.textContent, element.dataset.en]);
const localizedLabels = [...document.querySelectorAll("[data-en-label]")].map((element) =>
  [element, element.getAttribute("aria-label"), element.dataset.enLabel]);
let recentEntries = [];
let library = { watched: [], queue: null, lastMarked: null };
let catalog = null;
let activeSearch = null;
let channels = [];
let dismissedQueue;
let resumeCheck = 0;
let playbackCheck = 0;
let playbackState = "unknown";
let queueBusy = false;
let historyBusy = false;
const details = new Map();
const detailsRequested = new Set();
const queuePageSize = 50;
let queuePage = 0;
let queueCursor = "";
let displayedQueueToken = null;

function tr(portuguese, english) {
  return language.value === "en" ? english : portuguese;
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function publicationCutoff() {
  if (period.value === "all") return "";
  if (period.value === "custom") {
    if (!since.value) throw new Error("Escolha uma data de início válida.");
    return since.value;
  }

  const today = new Date();
  const start = period.value === "month" ?
    new Date(today.getFullYear(), today.getMonth(), 1) :
    new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (period.value === "7days") start.setDate(start.getDate() - 6);
  if (period.value === "30days") start.setDate(start.getDate() - 29);
  return localDateValue(start);
}

function updatePeriodControl() {
  const isCustom = period.value === "custom";
  customSince.hidden = !isCustom;
  since.required = isCustom;
}

const playbackIconPaths = {
  play: "M8 5v14l11-7z",
  pause: "M6 5h4v14H6z M14 5h4v14h-4z"
};

const englishErrors = new Map([
  ["Não foi possível conectar à API do YouTube.", "Could not connect to the YouTube API."],
  ["Limite de consultas da API do YouTube atingido. Tente mais tarde.", "YouTube API quota reached. Try again later."],
  ["A API recusou a consulta. Confira a chave e se a YouTube Data API v3 está ativada.", "The API rejected the request. Check your key and make sure YouTube Data API v3 is enabled."],
  ["Canal ou playlist de uploads indisponível.", "The channel or uploads playlist is unavailable."],
  ["Escolha uma data de início válida.", "Choose a valid start date."],
  ["Canal não encontrado ou sem playlist de uploads.", "The channel could not be found or has no uploads playlist."],
  ["O YouTube repetiu uma página de uploads. Tente atualizar a consulta.", "YouTube returned the same page of uploads twice. Try searching again."],
  ["Abra o próximo vídeo pelo botão Abrir vídeo.", "Use Open video to open the next video."],
  ["Nenhum vídeo pendente para reproduzir.", "There are no unwatched videos to play."],
  ["A fila avançou durante a ordenação. Tente novamente.", "The queue advanced while sorting. Try again."],
  ["Não foi possível iniciar o vídeo. Use o player do YouTube.", "Could not start the video. Use the YouTube player."],
  ["Não foi possível controlar o vídeo. Atualize a aba do YouTube.", "Could not control the video. Refresh the YouTube tab."]
]);

function errorText(error) {
  if (language.value !== "en") return error.message;
  if (error.channel && error.cause) return `Check the channel ${error.channel}. ${errorText(error.cause)}`;
  const status = /^A consulta ao YouTube falhou \(HTTP (\d+)\)\.$/.exec(error.message);
  if (status) return `The YouTube request failed (HTTP ${status[1]}).`;
  return englishErrors.get(error.message) ?? error.message;
}

function applyLanguage(value) {
  language.value = value === "pt-BR" ? "pt-BR" : "en";
  document.documentElement.lang = language.value;
  for (const [element, pt, en] of localizedText) element.textContent = tr(pt, en);
  for (const [element, pt, en] of localizedLabels) {
    element.setAttribute("aria-label", tr(pt, en));
    if (element.classList?.contains("media-control")) element.title = tr(pt, en);
  }
  for (const element of document.querySelectorAll("[data-locale]")) {
    element.hidden = element.dataset.locale !== language.value;
  }
}

function feedback(id, text, error = false) {
  const element = byId(id);
  element.textContent = text;
  element.toggleAttribute("data-error", error);
}

async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || tr(
    "A extensão não respondeu. Reabra o painel.", "The extension did not respond. Reopen the panel."
  ));
  return result.value;
}

function selectedVideos() {
  return catalog ? selectVideos(catalog.videos, library.watched, order.value) : [];
}

function renderResults() {
  const videos = selectedVideos();
  const results = byId("results");
  if (!catalog) {
    results.textContent = "";
    return;
  }
  const title = catalog.sources.length === 1 ? catalog.sources[0].title :
    tr(`${catalog.sources.length} canais`, `${catalog.sources.length} channels`);
  results.textContent = tr(
    `${title} · ${videos.length} pendentes de ${catalog.videos.length} no período`,
    `${title} · ${videos.length} of ${catalog.videos.length} unwatched in this period`
  );
}

function renderChannels() {
  const list = byId("selected-channels");
  list.hidden = !channels.length;
  list.replaceChildren(...channels.map((entry) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "channel-chip";
    button.textContent = `${entry.title} ×`;
    button.setAttribute("aria-label", tr(`Remover ${entry.title}`, `Remove ${entry.title}`));
    button.addEventListener("click", () => {
      channels = channels.filter((candidate) => candidate !== entry);
      renderChannels();
      clearSearch();
      channel.focus();
    });
    item.append(button);
    return item;
  }));
}

function addChannel(input, title = input) {
  if (!parseChannel(input)) {
    feedback("search-status", tr("Digite um @canal ou cole um link de canal ou de uploads.",
      "Enter an @handle or paste a channel or uploads link."), true);
    return;
  }
  const draft = channel.value.trim();
  if (draft !== input && parseChannel(draft) && !channels.some((entry) => entry.input === draft)) {
    channels.push({ input: draft, title: draft });
  }
  if (!channels.some((entry) => entry.input === input)) channels.push({ input, title });
  channel.value = "";
  clearSearch();
  renderChannels();
}

async function offerResume() {
  const check = ++resumeCheck;
  const { queue } = library;
  const card = byId("resume-card");
  if (queueBusy || !queue?.ids[queue.index] || dismissedQueue === queue.token) {
    card.hidden = true;
    return;
  }
  try {
    const interrupted = await send({ type: "resume-status" });
    if (check !== resumeCheck) return;
    card.hidden = !interrupted;
    if (!interrupted) return;
    const seconds = library.queue?.progress?.seconds ?? 0;
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    byId("resume-description").textContent = tr(
      `Vídeo ${queue.index + 1} de ${queue.ids.length} · ${time}`,
      `Video ${queue.index + 1} of ${queue.ids.length} · ${time}`
    );
  } catch {
    if (check === resumeCheck) card.hidden = true;
  }
}

function renderRecent(entries) {
  recentEntries = entries;
  recentChannels.replaceChildren(new Option(tr("Canais recentes", "Recent channels"), "", true, true));
  for (const { input, title } of entries) recentChannels.add(new Option(title, input));
  recentChannels.hidden = entries.length === 0;
}

async function loadQueueDetails(ids) {
  const missing = ids.filter((id) => details.get(id)?.views === undefined && !detailsRequested.has(id));
  if (!missing.length) return;
  for (const id of missing) detailsRequested.add(id);
  try {
    const { key } = await chrome.storage.local.get("key");
    if (!key) return;
    for (const video of await fetchVideoDetails(missing, key)) {
      const existing = details.get(video.id);
      details.set(video.id, { ...video, published: existing?.published ?? video.published });
    }
    renderQueue();
  } catch {
    // The queue can still navigate using video IDs if the metadata request fails.
  }
}

async function reorderQueue() {
  const queue = library.queue;
  if (!queue || queueBusy) return;
  const current = queue.ids[queue.index];
  const eligible = queue.ids.filter((id) => id !== current && !library.watched.includes(id));
  const needsViews = queueOrder === "views";
  const missing = eligible.filter((id) => {
    const video = details.get(id);
    return !video || !Number.isFinite(video.published) || (needsViews && !Number.isFinite(video.views));
  });
  try {
    if (missing.length) {
      const { key } = await chrome.storage.local.get("key");
      if (!key) throw new Error(tr("Configure a chave da API para ordenar a fila.", "Set an API key to sort the queue."));
      feedback("queue-feedback", tr("Carregando dados para reordenar…", "Loading data to reorder the queue…"));
      for (let offset = 0; offset < missing.length; offset += 50) {
        const batch = missing.slice(offset, offset + 50);
        for (const video of await fetchVideoDetails(batch, key)) {
          const existing = details.get(video.id);
          details.set(video.id, { ...video, published: video.published ?? existing?.published, views: video.views ?? existing?.views });
        }
      }
    }
    const rest = selectVideos(eligible.map((id) => details.get(id) ?? { id, published: 0 }), [], queueOrder);
    const ids = [...(!library.watched.includes(current) ? [current] : []), ...rest.map(({ id }) => id)];
    await queueAction({ type: "reorder", token: queue.token, currentId: current, ids });
  } catch (error) {
    feedback("queue-feedback", errorText(error), true);
  }
}

function jumpTo(index) {
  const { queue } = library;
  if (queue) void queueAction({ type: "jump", token: queue.token, from: queue.index, index });
}

function videoRow(id, index, isCurrent, watched) {
  const video = details.get(id);
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "video-row";
  button.disabled = queueBusy;
  if (isCurrent) button.setAttribute("aria-current", "true");
  button.addEventListener("click", () => jumpTo(index));

  const number = document.createElement("span");
  number.className = "video-number";
  number.textContent = String(index + 1);
  const thumb = document.createElement("span");
  thumb.className = "video-thumb";
  if (video?.thumbnail) {
    const image = document.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.remove(), { once: true });
    image.src = video.thumbnail;
    thumb.append(image);
  }
  const copy = document.createElement("span");
  const title = document.createElement("span");
  title.className = "video-title";
  title.textContent = video?.title || id;
  button.title = title.textContent;
  copy.append(title);
  const metadata = [];
  if (Number.isFinite(video?.published)) {
    metadata.push(new Intl.DateTimeFormat(language.value, {
      day: "2-digit", month: "2-digit", year: "numeric"
    }).format(video.published));
  }
  if (Number.isFinite(video?.views)) {
    const count = new Intl.NumberFormat(language.value).format(video.views);
    metadata.push(tr(`${count} visualizações`, `${count} views`));
  }
  if (metadata.length) {
    const info = document.createElement("span");
    info.className = "video-label";
    info.textContent = metadata.join(" · ");
    copy.append(info);
  }
  const status = document.createElement("span");
  status.className = "video-status";
  const labels = [];
  if (isCurrent) labels.push(tr("Selecionado", "Selected"));
  if (watched) labels.push(tr("Assistido", "Watched"));
  for (const [visible, symbol] of [[isCurrent, "▶"], [watched, "✓"]]) {
    if (!visible) continue;
    const icon = document.createElement("span");
    icon.className = "status-icon";
    icon.textContent = symbol;
    icon.setAttribute("aria-hidden", "true");
    status.append(icon);
  }
  if (labels.length) {
    button.setAttribute("aria-label", `${title.textContent} · ${labels.join(" · ")}`);
    button.title = `${title.textContent} · ${labels.join(" · ")}`;
  }
  button.append(number, thumb, copy, status);
  item.append(button);
  return item;
}

function renderQueue() {
  const { queue } = library;
  const token = queue?.token ?? null;
  if (token !== displayedQueueToken) {
    byId("catalog-panel").open = !queue;
    displayedQueueToken = token;
  }
  byId("resume-choice").disabled = queueBusy;
  byId("queue-card").hidden = !queue;
  if (!queue) {
    queueCursor = "";
    return;
  }
  const list = byId("queue-items");
  const current = queue.ids[queue.index];
  const cursor = `${queue.token}:${queue.index}`;
  const cursorChanged = cursor !== queueCursor;
  if (cursorChanged) {
    queueCursor = cursor;
    queuePage = Math.floor(Math.min(queue.index, queue.ids.length - 1) / queuePageSize);
  }
  byId("queue-status").textContent = current ?
    tr(`Vídeo ${queue.index + 1} de ${queue.ids.length}`, `Video ${queue.index + 1} of ${queue.ids.length}`) :
    tr("Fim da fila.", "End of queue.");
  byId("previous").disabled = queueBusy || queue.index === 0;
  for (const id of ["resume", "skip"]) byId(id).disabled = queueBusy || !current;
  byId("stop").disabled = queueBusy;
  byId("queue-sort-toggle").disabled = queueBusy || !current;
  for (const option of queueSortMenu.querySelectorAll("button")) {
    option.disabled = queueBusy;
    option.setAttribute("aria-pressed", String(option.dataset.order === queueOrder));
  }
  const label = playbackState === "playing" ? tr("Pausar vídeo", "Pause video") :
    playbackState === "paused" ? tr("Continuar vídeo", "Play video") : tr("Abrir vídeo", "Open video");
  byId("resume").setAttribute("aria-label", label);
  byId("resume").title = label;
  byId("play-icon").firstElementChild.setAttribute(
    "d", playbackIconPaths[playbackState === "playing" ? "pause" : "play"]
  );

  const start = queuePage * queuePageSize;
  const ids = queue.ids.slice(start, start + queuePageSize);
  const watched = new Set(library.watched);
  list.start = start + 1;
  list.replaceChildren(...ids.map((id, offset) =>
    videoRow(id, start + offset, id === current, watched.has(id))));
  if (cursorChanged) {
    const row = list.querySelector('[aria-current="true"]')?.parentElement;
    list.scrollTop = Math.max(0, (row?.offsetTop ?? 0) - list.clientHeight / 3);
  }
  byId("queue-pages").hidden = queue.ids.length <= queuePageSize;
  byId("list-range").textContent = tr(
    `${start + 1}–${start + ids.length} de ${queue.ids.length}`,
    `${start + 1}–${start + ids.length} of ${queue.ids.length}`
  );
  byId("list-back").disabled = queueBusy || queuePage === 0;
  byId("list-forward").disabled = queueBusy || start + ids.length >= queue.ids.length;
  void loadQueueDetails(ids);
}

async function refreshPlayback() {
  const check = ++playbackCheck;
  const queue = library.queue;
  if (!queue?.ids[queue.index]) return;
  try {
    const result = await send({ type: "playback-status", token: queue.token, id: queue.ids[queue.index] });
    if (check !== playbackCheck) return;
    playbackState = result?.state ?? "unknown";
    renderQueue();
  } catch {
    if (check === playbackCheck) {
      playbackState = "unknown";
      renderQueue();
    }
  }
}

function renderHistory() {
  const count = library.watched.length;
  byId("watched-count").textContent = tr(
    count === 1 ? "1 ID registrado" : `${count} IDs registrados`,
    count === 1 ? "1 video ID saved" : `${count} video IDs saved`
  );
  byId("import").disabled = historyBusy;
  byId("export").disabled = !library.watched.length || historyBusy;
  byId("undo").disabled = !library.lastMarked || historyBusy;
}

function render() {
  renderResults();
  renderQueue();
  renderHistory();
}

function clearSearch() {
  activeSearch?.abort();
  activeSearch = null;
  search.disabled = false;
  order.disabled = false;
  catalog = null;
  feedback("search-status", "");
  renderResults();
}

async function useTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !parseChannel(tab.url)) return false;
  channel.value = tab.url;
  clearSearch();
  return true;
}

async function queueAction(message) {
  queueBusy = true;
  render();
  feedback("queue-feedback", "");
  try {
    await send(message);
    return true;
  } catch (error) {
    feedback("queue-feedback", errorText(error), true);
    return false;
  } finally {
    queueBusy = false;
    render();
    void offerResume();
  }
}

async function historyAction(action) {
  historyBusy = true;
  renderHistory();
  feedback("history-feedback", "");
  try {
    feedback("history-feedback", await action());
  } catch (error) {
    feedback("history-feedback", errorText(error), true);
  } finally {
    historyBusy = false;
    renderHistory();
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.key) byId("api-recommended").hidden = !!changes.key.newValue;
  if (changes.recentChannels) renderRecent(changes.recentChannels.newValue ?? []);
  if (changes.library) {
    const previous = library.queue;
    library = changes.library.newValue ?? { watched: [], queue: null, lastMarked: null };
    const current = library.queue;
    const cursorChanged = previous?.token !== current?.token || previous?.index !== current?.index;
    if (cursorChanged || changes.library.oldValue?.watched?.length !== library.watched.length ||
        changes.library.oldValue?.lastMarked !== library.lastMarked) render();
    if (cursorChanged || previous?.progress?.paused !== current?.progress?.paused) {
      void offerResume();
      void refreshPlayback();
    }
  }
});

byId("catalog-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (activeSearch) return;
  const entries = [...channels];
  const draft = channel.value.trim();
  if (draft && !entries.some(({ input }) => input === draft)) entries.push({ input: draft });
  if (!entries.length || entries.some(({ input }) => !parseChannel(input))) {
    feedback("search-status", tr("Use um @handle, ID de canal ou link de uploads UU…",
      "Enter an @handle, a channel ID, or a UU… uploads link."), true);
    return;
  }
  const request = new AbortController();
  clearSearch();
  activeSearch = request;
  search.disabled = true;
  order.disabled = true;
  feedback("search-status", tr("Consultando o YouTube…", "Searching YouTube…"));
  try {
    const searchSince = publicationCutoff();
    const { key } = await chrome.storage.local.get("key");
    if (!key) {
      byId("settings").open = true;
      apiKey.focus();
      throw new Error(tr("Salve uma chave da API antes de buscar uploads.",
        "Save an API key before searching for uploads."));
    }
    const { channels: used, videos } = await fetchChannels(entries, key, {
      since: searchSince,
      signal: request.signal,
      onProgress: (index, count) => {
        if (activeSearch === request) {
          feedback("search-status", tr(
            `Canal ${index} de ${entries.length} · ${count} vídeos no período`,
            `Channel ${index} of ${entries.length} · ${count} videos in this period`
          ));
        }
      }
    });
    if (activeSearch !== request) return;
    const result = { sources: used, videos };
    if (order.value === "views" && videos.length) {
      feedback("search-status", tr("Consultando visualizações…", "Loading view counts…"));
      const counts = await fetchViewCounts(videos.map(({ id }) => id), key, request.signal);
      if (activeSearch !== request) return;
      for (const video of videos) video.views = counts.get(video.id);
    }
    catalog = result;
    if (used.length > 1 || channels.length) {
      channels = used;
      channel.value = "";
      renderChannels();
    }
    for (const video of result.videos) details.set(video.id, video);
    feedback("search-status", "");
    void send({
      type: "remember-channels", entries: used
    }).catch((error) => {
      if (catalog === result && order.value !== "views") {
        feedback("search-status", tr("Não foi possível salvar o canal recente.",
          "Could not save the recent channel.") + ` ${errorText(error)}`, true);
      }
    });
    const ids = selectedVideos().map(({ id }) => id);
    if (!ids.length) {
      feedback("search-status", tr("Nenhum vídeo pendente neste período.", "No unwatched videos in this period."));
      return;
    }
    await queueAction({ type: "start", ids });
  } catch (error) {
    if (activeSearch === request) feedback("search-status", errorText(error), true);
  } finally {
    if (activeSearch === request) {
      activeSearch = null;
      search.disabled = false;
      order.disabled = false;
      render();
    }
  }
});

channel.addEventListener("input", clearSearch);
byId("add-channel").addEventListener("click", () => addChannel(channel.value.trim()));
recentChannels.addEventListener("change", () => {
  const option = recentChannels.selectedOptions[0];
  if (option?.value) addChannel(option.value, option.text);
  recentChannels.selectedIndex = 0;
});
byId("resume-choice").addEventListener("click", async () => {
  const { queue } = library;
  if (queue && await queueAction({ type: "resume", token: queue.token })) {
    resumeCheck += 1;
    byId("resume-card").hidden = true;
  }
});
byId("new-choice").addEventListener("click", () => {
  dismissedQueue = library.queue?.token;
  void offerResume();
  byId("catalog-panel").open = true;
  channel.focus();
});
window.addEventListener("focus", offerResume);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void offerResume();
});
chrome.tabs.onRemoved.addListener((id) => {
  if (library.queue?.tabId === id) { void offerResume(); void refreshPlayback(); }
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (library.queue?.tabId === id && (change.url || change.status === "complete")) {
    void offerResume();
    void refreshPlayback();
  }
});
period.addEventListener("change", () => {
  updatePeriodControl();
  clearSearch();
});
since.addEventListener("input", clearSearch);
order.addEventListener("change", renderResults);
byId("use-tab").addEventListener("click", async () => {
  try {
    if (!await useTab()) feedback("search-status", tr("Abra a página de um canal ou cole o link.",
      "Open a channel page or paste its link."), true);
  } catch (error) {
    feedback("search-status", errorText(error), true);
  }
});
byId("resume").addEventListener("click", async () => {
  const queue = library.queue;
  if (!queue?.ids[queue.index] || queueBusy) return;
  queueBusy = true;
  renderQueue();
  feedback("queue-feedback", "");
  try {
    const result = await send({ type: "playback-control", token: queue.token, id: queue.ids[queue.index] });
    playbackState = result?.state ?? "unknown";
  } catch (error) {
    feedback("queue-feedback", errorText(error), true);
  } finally {
    queueBusy = false;
    renderQueue();
    void refreshPlayback();
  }
});
for (const type of ["skip", "stop"]) {
  byId(type).addEventListener("click", () => {
    const { queue } = library;
    if (queue) void queueAction({ type, token: queue.token, id: queue.ids[queue.index] });
  });
}
byId("previous").addEventListener("click", () => {
  if (library.queue) jumpTo(library.queue.index - 1);
});
byId("queue-sort-toggle").addEventListener("click", () => {
  queueSortMenu.hidden = !queueSortMenu.hidden;
  byId("queue-sort-toggle").setAttribute("aria-expanded", String(!queueSortMenu.hidden));
  if (!queueSortMenu.hidden) queueSortMenu.querySelector(`[data-order="${queueOrder}"]`)?.focus();
});
queueSortMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-order]");
  if (!option || queueBusy) return;
  queueOrder = option.dataset.order;
  queueSortMenu.hidden = true;
  byId("queue-sort-toggle").setAttribute("aria-expanded", "false");
  renderQueue();
  void reorderQueue();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".sort-control")) {
    queueSortMenu.hidden = true;
    byId("queue-sort-toggle").setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !queueSortMenu.hidden) {
    queueSortMenu.hidden = true;
    byId("queue-sort-toggle").setAttribute("aria-expanded", "false");
    byId("queue-sort-toggle").focus();
  }
});
for (const [id, step] of [["list-back", -1], ["list-forward", 1]]) {
  byId(id).addEventListener("click", () => {
    queuePage += step;
    renderQueue();
    byId("queue-items").scrollTop = 0;
  });
}

byId("import").addEventListener("click", () => byId("archive").click());
byId("archive").addEventListener("change", (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  void historyAction(async () => {
    const { ids, ignored } = readArchive(await file.text());
    const added = ids.length ? await send({ type: "import", ids }) : 0;
    return tr(`${added} novos IDs importados. ${ignored} linhas inválidas ignoradas.`,
      `Imported ${added} new IDs. Skipped ${ignored} invalid lines.`);
  });
});

byId("export").addEventListener("click", () => {
  const file = new Blob([`${[...library.watched].sort().join("\n")}\n`], { type: "text/plain" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = tr("assistidos.txt", "watched.txt");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
});

byId("undo").addEventListener("click", () => historyAction(async () => {
  if (!await send({ type: "undo", id: library.lastMarked })) {
    throw new Error(tr("A última marcação mudou. Clique em Desfazer novamente para removê-la.",
      "The last watched mark changed. Select Undo again to remove it."));
  }
  return tr("Marcação desfeita. Atualize a fila para incluir o vídeo novamente.",
    "Watched mark removed. Rebuild the queue to include the video again.");
}));

trackOutside.addEventListener("change", async () => {
  const checked = trackOutside.checked;
  trackOutside.disabled = true;
  try {
    await chrome.storage.local.set({ trackOutsideQueue: checked });
    feedback("history-feedback", "");
  } catch (error) {
    trackOutside.checked = !checked;
    feedback("history-feedback", errorText(error), true);
  } finally {
    trackOutside.disabled = false;
  }
});

byId("key-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = apiKey.value.trim();
  if (!key) return;
  try {
    await chrome.storage.local.set({ key });
    feedback("key-feedback", tr("Chave salva.", "Key saved."));
  } catch (error) {
    feedback("key-feedback", errorText(error), true);
  }
});

language.addEventListener("change", async () => {
  const value = language.value;
  applyLanguage(value);
  renderRecent(recentEntries);
  renderChannels();
  render();
  void offerResume();
  void refreshPlayback();
  for (const id of ["search-status", "queue-feedback", "history-feedback", "key-feedback"]) feedback(id, "");
  if (activeSearch) feedback("search-status", tr("Consultando o YouTube…", "Searching YouTube…"));
  try {
    await chrome.storage.local.set({ language: value });
  } catch (error) {
    feedback("queue-feedback", errorText(error), true);
  }
});

try {
  updatePeriodControl();
  const saved = await chrome.storage.local.get(["library", "key", "trackOutsideQueue", "recentChannels", "lastChannels", "language"]);
  applyLanguage(saved.language);
  if (saved.library) library = saved.library;
  apiKey.value = saved.key ?? "";
  byId("api-recommended").hidden = !!saved.key;
  trackOutside.checked = !!saved.trackOutsideQueue;
  const entries = saved.recentChannels ?? [];
  renderRecent(entries);
  const last = saved.lastChannels ?? entries.slice(0, 1);
  if (last.length > 1) channels = last;
  else if (!channel.value && last.length) channel.value = last[0].input;
  if (!channel.value && !channels.length) await useTab();
  renderChannels();
  render();
  void offerResume();
} catch (error) {
  feedback("search-status", errorText(error), true);
}
