const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const channelIdPattern = /^UC[A-Za-z0-9_-]{22}$/;
const uploadsIdPattern = /^UU[A-Za-z0-9_-]{22}$/;
const apiBase = "https://www.googleapis.com/youtube/v3/";

export const isVideoId = (value) => typeof value === "string" && videoIdPattern.test(value);
export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

export function defaultSince(today = new Date()) {
  const firstDay = new Date(today);
  firstDay.setDate(firstDay.getDate() - 6);
  const month = String(firstDay.getMonth() + 1).padStart(2, "0");
  const day = String(firstDay.getDate()).padStart(2, "0");
  return `${firstDay.getFullYear()}-${month}-${day}`;
}

export function parseChannel(input) {
  const value = input.trim();
  if (channelIdPattern.test(value)) return { id: value };
  if (uploadsIdPattern.test(value)) return { uploads: value };
  if (/^@[^\s/?#]+$/u.test(value)) return { forHandle: value };

  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
      return null;
    }
    const [kind, identifier] = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (kind === "channel" && channelIdPattern.test(identifier)) return { id: identifier };
    if (kind === "user" && identifier) return { forUsername: identifier };
    if (kind && /^@[^\s/?#]+$/u.test(kind)) return { forHandle: kind };
    const list = url.searchParams.get("list");
    if (kind === "playlist" && uploadsIdPattern.test(list)) return { uploads: list };
  } catch {
    return null;
  }
  return null;
}

export function readArchive(text) {
  const ids = new Set();
  let ignored = 0;
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    const id = value.replace(/^youtube\s+/i, "");
    if (isVideoId(id)) ids.add(id);
    else ignored += 1;
  }
  return { ids: [...ids], ignored };
}

export function selectVideos(videos, watchedIds, order) {
  const watched = new Set(watchedIds);
  const direction = order === "oldest" ? 1 : -1;
  return videos
    .filter(({ id }) => !watched.has(id))
    .sort((left, right) => {
      if (order === "views") {
        const difference = (right.views ?? -1) - (left.views ?? -1);
        if (difference) return difference;
      }
      return direction * (left.published - right.published) || left.id.localeCompare(right.id);
    });
}

async function request(resource, parameters, key, signal) {
  const url = new URL(resource, apiBase);
  url.search = new URLSearchParams({ ...parameters, key });
  let response;
  try {
    response = await fetch(url, { signal, cache: "no-store" });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Não foi possível conectar à API do YouTube.");
  }
  const data = await response.json().catch(() => null);
  if (response.ok && Array.isArray(data?.items)) return data;

  const reason = data?.error?.errors?.[0]?.reason;
  if (["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"].includes(reason) ||
      response.status === 429) {
    throw new Error("Limite de consultas da API do YouTube atingido. Tente mais tarde.");
  }
  if ([400, 401, 403].includes(response.status)) {
    throw new Error("A API recusou a consulta. Confira a chave e se a YouTube Data API v3 está ativada.");
  }
  if (response.status === 404) throw new Error("Canal ou playlist de uploads indisponível.");
  throw new Error(`A consulta ao YouTube falhou (HTTP ${response.status}).`);
}

function videoDetails(id, snippet) {
  return {
    id,
    title: snippet?.title || id,
    thumbnail: snippet?.thumbnails?.medium?.url ?? snippet?.thumbnails?.default?.url
  };
}

export async function fetchVideoDetails(ids, key) {
  const data = await request("videos", {
    id: ids.join(","),
    part: "snippet,statistics",
    fields: "items(id,snippet(title,publishedAt,thumbnails(medium/url,default/url)),statistics/viewCount)"
  }, key);
  return data.items.map(({ id, snippet, statistics }) => {
    const published = Date.parse(snippet?.publishedAt);
    const views = statistics?.viewCount === undefined ? undefined : Number(statistics.viewCount);
    return {
      ...videoDetails(id, snippet),
      published: Number.isFinite(published) ? published : undefined,
      views: Number.isFinite(views) && views >= 0 ? views : undefined
    };
  });
}

export async function fetchViewCounts(ids, key, signal) {
  const counts = new Map();
  for (let offset = 0; offset < ids.length; offset += 50) {
    const data = await request("videos", {
      id: ids.slice(offset, offset + 50).join(","),
      part: "statistics",
      fields: "items(id,statistics/viewCount)"
    }, key, signal);
    for (const { id, statistics } of data.items) {
      const views = Number(statistics?.viewCount);
      if (Number.isFinite(views) && views >= 0) counts.set(id, views);
    }
  }
  return counts;
}

export async function fetchUploads(channel, key, { since, signal, onProgress } = {}) {
  const cutoff = since ? new Date(`${since}T00:00:00`).getTime() : -Infinity;
  if (Number.isNaN(cutoff)) throw new Error("Escolha uma data de início válida.");
  let playlistId = channel.uploads;
  let title = playlistId;
  if (!playlistId) {
    const data = await request("channels", {
      ...channel,
      part: "contentDetails,snippet",
      fields: "items(snippet/title,contentDetails/relatedPlaylists/uploads)"
    }, key, signal);
    playlistId = data.items[0]?.contentDetails?.relatedPlaylists?.uploads;
    title = data.items[0]?.snippet?.title ?? playlistId;
    if (!playlistId) throw new Error("Canal não encontrado ou sem playlist de uploads.");
  }

  const videos = new Map();
  const pageTokens = new Set();
  let pageToken = "";
  let olderPages = 0;
  do {
    const data = await request("playlistItems", {
      playlistId,
      part: "snippet,contentDetails,status",
      fields: "nextPageToken,items(snippet(title,channelTitle,videoOwnerChannelTitle,thumbnails(medium/url,default/url)),contentDetails(videoId,videoPublishedAt),status/privacyStatus)",
      maxResults: 50,
      ...(pageToken && { pageToken })
    }, key, signal);
    if (title === playlistId) {
      const snippet = data.items[0]?.snippet;
      title = snippet?.videoOwnerChannelTitle || snippet?.channelTitle || playlistId;
    }
    let hasDatedVideos = false;
    let hasVideosInRange = false;
    for (const item of data.items) {
      const id = item.contentDetails?.videoId;
      const published = Date.parse(item.contentDetails?.videoPublishedAt);
      if (!isVideoId(id) || !Number.isFinite(published) || item.status?.privacyStatus === "private") continue;
      hasDatedVideos = true;
      if (published < cutoff) continue;
      hasVideosInRange = true;
      videos.set(id, { ...videoDetails(id, item.snippet), published });
    }
    onProgress?.(videos.size);
    // Allow one older page before stopping in case publication dates are out of order.
    olderPages = hasDatedVideos && !hasVideosInRange ? olderPages + 1 : 0;
    if (olderPages === 2) break;
    pageToken = data.nextPageToken;
    if (pageToken && pageTokens.has(pageToken)) {
      throw new Error("O YouTube repetiu uma página de uploads. Tente atualizar a consulta.");
    }
    if (pageToken) pageTokens.add(pageToken);
  } while (pageToken);

  return { playlistId, title, videos: [...videos.values()] };
}

export async function fetchChannels(entries, key, { since, signal, onProgress }) {
  const videos = new Map();
  const channels = new Map();
  for (const [index, entry] of entries.entries()) {
    try {
      const result = await fetchUploads(parseChannel(entry.input), key, {
        since, signal, onProgress: (count) => onProgress?.(index + 1, count)
      });
      channels.set(result.playlistId, { input: entry.input, title: result.title, playlistId: result.playlistId });
      for (const video of result.videos) videos.set(video.id, video);
    } catch (error) {
      if (signal?.aborted) throw error;
      const channel = entry.title ?? entry.input;
      const failure = new Error(`Confira o canal ${channel}. ${error.message}`, { cause: error });
      failure.channel = channel;
      throw failure;
    }
  }
  return { channels: [...channels.values()], videos: [...videos.values()] };
}
