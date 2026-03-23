import { API_BASE_URL, endpoints } from './constants.js';
import { ApiService } from './services/api-service.js';
import { DataMapper } from './services/data-mapper.js';

const app = document.querySelector('#app');

function formatLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Keep the UI usable even when storage is blocked.
  }
}

function removeStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Keep the UI usable even when storage is blocked.
  }
}

const initialStoredName = readStorage('familyapp.name');
const initialStoredTheme = readStorage('familyapp.theme') || 'dark';

const state = {
  route: window.location.hash.replace(/^#/, '') || '/',
  authMode: 'login',
  name: initialStoredName,
  authToken: readStorage('familyapp.authToken'),
  authStatus: '',
  apiStatus: '',
  userPhotoUrl: readStorage(`familyapp.userPhoto.${initialStoredName}`),
  usersByName: new Map(),
  usersById: new Map(),
  userBackgroundByName: new Map(),
  userBackgroundById: new Map(),
  userColorByName: new Map(),
  userColorById: new Map(),
  dishes: [],
  myDishes: [],
  randomDish: null,
  movies: [],
  myMovies: [],
  randomMovie: null,
  travels: [],
  myTravels: [],
  randomTravel: null,
  history: [],
  dishesStatus: '',
  moviesStatus: '',
  travelsStatus: '',
  historyStatus: '',
  dishesView: 'all',
  moviesView: 'all',
  travelsView: 'all',
  showDishForm: false,
  showMovieForm: false,
  showTravelForm: false,
  dishMediaMode: 'link',
  movieMediaMode: 'link',
  travelMediaMode: 'link',
  editingDishId: '',
  editingMovieId: '',
  editingTravelId: '',
  dishDraft: { name: '', photo: '' },
  movieDraft: { name: '', photo: '' },
  travelDraft: { name: '', photo: '', dateStart: '', dateEnd: '' },
  historyMonthCursor: (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  })(),
  historyPreviewKey: '',
  editorContext: null,
  profileEditorMode: 'link',
  profilePhotoPreviewUrl: '',
  profilePasswordDraft: '',
  profileStatus: '',
  collectionMenuOpen: false,
  theme: initialStoredTheme === 'light' ? 'light' : 'dark',
  userDarkMode: 0,
  userBackground: '',
  userColor: '',
};

const routes = {
  '/': renderHome,
  '/dishes': renderDishesPage,
  '/movies': renderMoviesPage,
  '/travel': renderTravelPage,
  '/history': renderHistoryPage,
  '/editor': renderEditorPage,
  '/profile': renderProfilePage,
};

const protectedMediaCache = new Map();
const pendingProtectedMedia = new Map();

function isSignedIn() {
  return Boolean(state.authToken);
}

function navigate(route) {
  window.location.hash = route;
}

window.addEventListener('hashchange', () => {
  state.route = window.location.hash.replace(/^#/, '') || '/';
  render();
});

function ensureProtectedRoute() {
  if (!isSignedIn() && state.route !== '/') {
    state.route = '/';
    window.location.hash = '/';
  }
}

const apiService = new ApiService({
  baseUrl: API_BASE_URL,
  getAuthToken: () => state.authToken,
  onApiStatus: (status) => {
    state.apiStatus = status;
  },
});

async function apiRequest(path, options = {}) {
  return apiService.request(path, options);
}

function persistSession(token, name) {
  if (state.authToken !== token) {
    clearProtectedMediaCache();
  }

  state.authToken = token || '';
  state.name = name || '';

  if (token) {
    writeStorage('familyapp.authToken', token);
    writeStorage('familyapp.name', name || '');
  } else {
    removeStorage('familyapp.authToken');
    removeStorage('familyapp.name');
  }
}

function extractPathValue(payload) {
  return DataMapper.extractPathValue(payload);
}

function clearProtectedMediaCache() {
  protectedMediaCache.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  protectedMediaCache.clear();
  pendingProtectedMedia.clear();
}

async function fetchProtectedMedia(cacheKey, requestUrl) {
  if (!isSignedIn() || !cacheKey || protectedMediaCache.has(cacheKey) || pendingProtectedMedia.has(cacheKey)) {
    return;
  }

  const request = fetch(requestUrl, {
    headers: state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {},
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const previousUrl = protectedMediaCache.get(cacheKey);
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }

      protectedMediaCache.set(cacheKey, URL.createObjectURL(blob));
      render();
    })
    .catch(() => {
      // Keep the existing placeholder UI when protected media cannot be loaded.
    })
    .finally(() => {
      pendingProtectedMedia.delete(cacheKey);
    });

  pendingProtectedMedia.set(cacheKey, request);
  await request;
}

function resolveProtectedEndpointUrl(cacheKey, requestUrl) {
  if (!cacheKey || !requestUrl) {
    return '';
  }

  const cachedUrl = protectedMediaCache.get(cacheKey);
  if (cachedUrl) {
    return cachedUrl;
  }

  void fetchProtectedMedia(cacheKey, requestUrl);
  return '';
}

function resolveMediaUrl(value) {
  const path = extractPathValue(value);
  if (!path) {
    return '';
  }

  if (/^(data:|blob:|https?:\/\/)/i.test(path)) {
    return path;
  }

  if (/^\/?File\/HelloVideo$/i.test(path)) {
    return resolveProtectedEndpointUrl(path, `${API_BASE_URL}/${path.replace(/^\/+/, '')}`);
  }

  if (/^\/?File\//i.test(path)) {
    return resolveProtectedEndpointUrl(path, `${API_BASE_URL}/${path.replace(/^\/+/, '')}`);
  }

  return resolveProtectedEndpointUrl(path, `${API_BASE_URL}${endpoints.fileBase}/${encodeURIComponent(path)}`);
}

async function hydrateWelcomeMedia() {
  if (!isSignedIn()) {
    state.usersByName = new Map();
    state.usersById = new Map();
    state.userBackgroundByName = new Map();
    state.userBackgroundById = new Map();
    state.userColorByName = new Map();
    state.userColorById = new Map();
    state.userPhotoUrl = '';
    setProfilePhotoPreviewUrl('');
    state.userColor = '';
    return;
  }
  render();
}

function normalizeSingleItem(payload) {
  if (!payload || Array.isArray(payload)) {
    return null;
  }

  return typeof payload === 'object' ? payload : null;
}

function getItemId(item) {
  return item?.id;
}

async function refreshProtectedData() {
  if (!isSignedIn()) {
    state.usersByName = new Map();
    state.usersById = new Map();
    state.userBackgroundByName = new Map();
    state.userBackgroundById = new Map();
    state.userColorByName = new Map();
    state.userColorById = new Map();
    state.userColor = '';
    state.dishes = [];
    state.myDishes = [];
    state.randomDish = null;
    state.movies = [];
    state.myMovies = [];
    state.randomMovie = null;
    state.travels = [];
    state.myTravels = [];
    state.randomTravel = null;
    state.history = [];
    state.dishesStatus = '';
    state.moviesStatus = '';
    state.travelsStatus = '';
    state.historyStatus = '';
    render();
    return;
  }

  state.dishesStatus = 'Loading dishes...';
  state.moviesStatus = 'Loading movies...';
  state.travelsStatus = 'Loading travel destinations...';
  state.historyStatus = 'Loading history...';
  render();

  try {
    const [users, dishes, myDishes, randomDish, movies, myMovies, randomMovie, travels, myTravels, randomTravel, history] = await Promise.all([
      apiRequest(endpoints.listUsers).catch(() => []),
      apiRequest(endpoints.dishes),
      apiRequest(endpoints.myDishes).catch((error) => ({ error: error.message })),
      apiRequest(endpoints.randomDish).catch(() => null),
      apiRequest(endpoints.movies),
      apiRequest(endpoints.myMovies).catch((error) => ({ error: error.message })),
      apiRequest(endpoints.randomMovie).catch(() => null),
      apiRequest(endpoints.travels),
      apiRequest(endpoints.myTravels).catch((error) => ({ error: error.message })),
      apiRequest(endpoints.randomTravel).catch(() => null),
      apiRequest(endpoints.history).catch((error) => ({ error: error.message })),
    ]);

    const normalizedUsers = DataMapper.normalizeUsers(users);
    state.usersByName = new Map(
      normalizedUsers
        .filter((user) => user.Name)
        .map((user) => [user.Name.toLowerCase(), user.Photo]),
    );
    state.usersById = new Map(
      normalizedUsers
        .filter((user) => user.Id)
        .map((user) => [String(user.Id), user.Photo]),
    );
    state.userBackgroundByName = new Map(
      normalizedUsers
        .filter((user) => user.Name)
        .map((user) => [user.Name.toLowerCase(), sanitizeHexColor(user.Background)]),
    );
    state.userBackgroundById = new Map(
      normalizedUsers
        .filter((user) => user.Id)
        .map((user) => [String(user.Id), sanitizeHexColor(user.Background)]),
    );
    state.userColorByName = new Map(
      normalizedUsers
        .filter((user) => user.Name)
        .map((user) => [user.Name.toLowerCase(), sanitizeHexColor(user.Color)]),
    );
    state.userColorById = new Map(
      normalizedUsers
        .filter((user) => user.Id)
        .map((user) => [String(user.Id), sanitizeHexColor(user.Color)]),
    );
    const currentUser = normalizedUsers.find((user) => String(user.Name || '').toLowerCase() === String(state.name || '').toLowerCase());
    if (currentUser) {
      if (currentUser.Photo) {
        state.userPhotoUrl = currentUser.Photo;
        writeStorage(`familyapp.userPhoto.${state.name}`, currentUser.Photo);
      }
      state.userDarkMode = currentUser.DarkMode ?? 0;
      state.userBackground = sanitizeHexColor(currentUser.Background);
      state.userColor = sanitizeHexColor(currentUser.Color);
      await applyUserThemePreference();
    }
    state.dishes = DataMapper.normalizeItems(dishes);
    state.myDishes = DataMapper.normalizeItems(myDishes);
    state.randomDish = DataMapper.normalizeItem(normalizeSingleItem(randomDish));
    state.movies = DataMapper.normalizeItems(movies);
    state.myMovies = DataMapper.normalizeItems(myMovies);
    state.randomMovie = DataMapper.normalizeItem(normalizeSingleItem(randomMovie));
    state.travels = DataMapper.normalizeItems(travels);
    state.myTravels = DataMapper.normalizeItems(myTravels);
    state.randomTravel = DataMapper.normalizeItem(normalizeSingleItem(randomTravel));
    state.history = DataMapper.normalizeItems(history);
    state.dishesStatus = myDishes?.error ? `All dishes loaded. ${myDishes.error}` : '';
    state.moviesStatus = myMovies?.error ? `All movies loaded. ${myMovies.error}` : '';
    state.travelsStatus = myTravels?.error ? `All travel destinations loaded. ${myTravels.error}` : '';
    state.historyStatus = history?.error ? `History loaded with warnings. ${history.error}` : '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.dishesStatus = `Unable to load dishes. ${message}`;
    state.moviesStatus = `Unable to load movies. ${message}`;
    state.travelsStatus = `Unable to load travel destinations. ${message}`;
    state.historyStatus = `Unable to load history. ${message}`;
  }

  render();
}

function currentSectionItems(kind) {
  const allItems = kind === 'dishes' ? state.dishes : kind === 'movies' ? state.movies : state.travels;
  const myItems = kind === 'dishes' ? state.myDishes : kind === 'movies' ? state.myMovies : state.myTravels;
  const randomItem = kind === 'dishes' ? state.randomDish : kind === 'movies' ? state.randomMovie : state.randomTravel;
  const view = kind === 'dishes' ? state.dishesView : kind === 'movies' ? state.moviesView : state.travelsView;

  if (view === 'mine') {
    return myItems;
  }

  if (view === 'random') {
    return randomItem ? [randomItem] : [];
  }

  return allItems;
}

function getAllKnownItems(kind) {
  const collections = kind === 'dishes'
    ? [state.dishes, state.myDishes, state.randomDish ? [state.randomDish] : []]
    : kind === 'movies'
      ? [state.movies, state.myMovies, state.randomMovie ? [state.randomMovie] : []]
      : [state.travels, state.myTravels, state.randomTravel ? [state.randomTravel] : []];

  const seen = new Map();
  collections.flat().forEach((item) => {
    seen.set(getItemKey(kind, item), item);
  });
  return Array.from(seen.values());
}

function getItemKey(kind, item) {
  return [
    kind,
    getItemId(item) || '',
    item?.Name || '',
    item?.Photo || '',
    item?.AddedBy || '',
    item?.AddedById || '',
  ].join('::');
}

function findItemByKey(kind, itemKey) {
  return getAllKnownItems(kind).find((item) => getItemKey(kind, item) === itemKey) || null;
}

function historyTypeToKind(type) {
  const normalizedType = String(type || '').trim().toLowerCase();
  if (normalizedType === 'dish' || normalizedType === 'dishes') {
    return 'dishes';
  }
  if (normalizedType === 'movie' || normalizedType === 'movies') {
    return 'movies';
  }
  if (normalizedType === 'travel' || normalizedType === 'travels') {
    return 'travel';
  }
  return '';
}

function parseUtcDateKey(value) {
  const source = String(value || '').trim();
  if (!source) {
    return '';
  }

  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) {
    const match = source.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return formatLocalDateKey(new Date(`${match[1]}T00:00:00.000Z`));
    }
    return '';
  }
  return formatLocalDateKey(parsed);
}

function parseUtcDateTime(value) {
  const source = String(value || '').trim();
  if (!source) {
    return null;
  }
  const parsed = new Date(source);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const dateOnlyMatch = source.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!dateOnlyMatch) {
    return null;
  }

  const fallback = new Date(`${dateOnlyMatch[1]}T00:00:00.000Z`);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function dateKeyToLocalDate(dateKey) {
  if (!dateKey) {
    return null;
  }
  const parsed = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateDiffInDays(startDate, endDate) {
  if (!startDate || !endDate) {
    return 1;
  }
  const millis = endDate.getTime() - startDate.getTime();
  return Math.max(1, Math.floor(millis / 86400000) + 1);
}

function formatHistoryDateTime(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return 'Unknown';
  }
  return value.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function areDatesConsecutive(startDate, endDate) {
  if (!startDate || !endDate) {
    return false;
  }
  const millis = startDate.getTime() - endDate.getTime();
  return millis <= 86400000;
}

function buildHistoryEntries() {
  const normalizedEntries = state.history
    .map((entry) => {
      const kind = historyTypeToKind(entry.Type);
      const startKey = parseUtcDateKey(entry.DateStart);
      const endKey = parseUtcDateKey(entry.DateEnd) || startKey;
      if (!startKey || !endKey) {
        return null;
      }

      const startDate = dateKeyToLocalDate(startKey);
      const endDate = dateKeyToLocalDate(endKey);
      if (!startDate || !endDate) {
        return null;
      }

      const startAt = parseUtcDateTime(entry.DateStart) || parseUtcDateTime(entry.DateEnd) || startDate;
      const endAt = parseUtcDateTime(entry.DateEnd) || parseUtcDateTime(entry.DateStart) || endDate;
      const normalizedStartDate = startDate <= endDate ? startDate : endDate;
      const normalizedEndDate = startDate <= endDate ? endDate : startDate;
      const normalizedStartAt = startAt <= endAt ? startAt : endAt;
      const normalizedEndAt = startAt <= endAt ? endAt : startAt;
      const normalizedStartKey = formatLocalDateKey(normalizedStartDate);
      const normalizedEndKey = formatLocalDateKey(normalizedEndDate);
      const title = String(entry.Name || 'Untitled').trim() || 'Untitled';
      const itemKey = resolveHistoryEntryItemKey(entry, kind);
      const groupIdentity = itemKey || title.toLowerCase();
      const groupKey = [kind, groupIdentity].join('::');

      return {
        entry,
        groupKey,
        kind,
        itemKey,
        startKey: normalizedStartKey,
        endKey: normalizedEndKey,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        startAt: normalizedStartAt,
        endAt: normalizedEndAt,
        durationDays: dateDiffInDays(normalizedStartDate, normalizedEndDate),
        title,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.startKey !== right.startKey) {
        return left.startKey.localeCompare(right.startKey);
      }
      return left.title.localeCompare(right.title);
    });

  const mergedEntries = [];
  normalizedEntries.forEach((entry) => {
    const previous = mergedEntries[mergedEntries.length - 1];
    const canMerge = previous
      && previous.groupKey === entry.groupKey
      && areDatesConsecutive(entry.startDate, previous.endDate);

    if (!canMerge) {
      mergedEntries.push({
        ...entry,
        historyKey: [entry.groupKey, entry.startKey, entry.endKey].join('::'),
        sourceEntries: [entry],
      });
      return;
    }

    previous.endDate = previous.endDate >= entry.endDate ? previous.endDate : entry.endDate;
    previous.endKey = formatLocalDateKey(previous.endDate);
    previous.endAt = previous.endAt >= entry.endAt ? previous.endAt : entry.endAt;
    previous.startAt = previous.startAt <= entry.startAt ? previous.startAt : entry.startAt;
    previous.durationDays = dateDiffInDays(previous.startDate, previous.endDate);
    previous.historyKey = [previous.groupKey, previous.startKey, previous.endKey].join('::');
    previous.sourceEntries.push(entry);
  });

  return mergedEntries;
}

function resolveHistoryEntryItemKey(entry, kind) {
  if (!kind) {
    return '';
  }

  const itemIdCandidates = [
    entry?.ItemId,
    entry?.itemId,
    entry?.SourceId,
    entry?.sourceId,
    entry?.ReferenceId,
    entry?.referenceId,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const allItems = getAllKnownItems(kind);
  if (itemIdCandidates.length) {
    const idMatch = allItems.find((item) => itemIdCandidates.includes(String(getItemId(item) || '')));
    if (idMatch) {
      return getItemKey(kind, idMatch);
    }
  }

  const entryName = String(entry?.Name || '').trim().toLowerCase();
  const entryPhoto = extractPathValue(entry?.Photo || entry?.photo);
  const exactMatch = allItems.find((item) => {
    const sameName = String(item?.Name || '').trim().toLowerCase() === entryName;
    const samePhoto = entryPhoto ? String(item?.Photo || '').trim() === entryPhoto : true;
    return sameName && samePhoto;
  });

  if (exactMatch) {
    return getItemKey(kind, exactMatch);
  }

  const nameMatch = allItems.find((item) => String(item?.Name || '').trim().toLowerCase() === entryName);
  return nameMatch ? getItemKey(kind, nameMatch) : '';
}

function getAddedByPhotoPath(item) {
  const byId = state.usersById.get(String(item?.AddedById || ''));
  const byName = state.usersByName.get(String(item?.AddedBy || '').toLowerCase());
  return extractPathValue(
    item?.AddedByPhoto || byId || byName || '',
  );
}

function getAddedByBackground(item) {
  const byId = state.userBackgroundById.get(String(item?.AddedById || ''));
  const byName = state.userBackgroundByName.get(String(item?.AddedBy || '').toLowerCase());
  return sanitizeHexColor(item?.AddedByBackground || byId || byName || '');
}

function getAddedByColor(item) {
  const byId = state.userColorById.get(String(item?.AddedById || ''));
  const byName = state.userColorByName.get(String(item?.AddedBy || '').toLowerCase());
  return sanitizeHexColor(item?.AddedByColor || byId || byName || '');
}

function getHistorySurfaceStyle(historyEntry) {
  const background = getAddedByBackground(historyEntry?.entry || historyEntry);
  const color = getAddedByColor(historyEntry?.entry || historyEntry);
  const styles = [];
  if (background) {
    styles.push(`--profile-surface-background:${background}`);
    styles.push(`--item-color:${background}`);
  }
  if (color) {
    styles.push(`color:${color}`);
    styles.push(`--item-text-color:${color}`);
  }
  return styles.join(';');
}

function getItemCardStyle(item) {
  const background = getAddedByBackground(item);
  const color = getAddedByColor(item);
  if (!background && !color) {
    return '';
  }

  const styles = [];
  if (background) {
    styles.push(`--media-row-added-background:${background}`);
  }
  if (color) {
    styles.push(`--media-row-added-color:${color}`);
  }
  return ` style="${escapeAttribute(styles.join(';'))};"`;
}

function getProfileSurfaceStyle() {
  const styles = [];
  if (state.userBackground) {
    styles.push(`--profile-surface-background:${state.userBackground}`);
  }
  if (state.userColor) {
    styles.push(`color:${state.userColor}`);
  }
  if (!styles.length) {
    return '';
  }
  return `${styles.join(';')};`;
}

function getProfilePhotoPreview() {
  return resolveMediaUrl(state.profilePhotoPreviewUrl || state.userPhotoUrl);
}

function setProfilePhotoPreviewUrl(nextUrl) {
  const previous = state.profilePhotoPreviewUrl;
  if (previous && previous.startsWith('blob:') && previous !== nextUrl) {
    URL.revokeObjectURL(previous);
  }
  state.profilePhotoPreviewUrl = nextUrl;
}

function updateProfilePreviewElements() {
  const surfaceStyle = getProfileSurfaceStyle();
  const surfaceTextStyle = state.userColor ? `color:${state.userColor};` : '';
  const surfaceNodes = document.querySelectorAll('[data-profile-surface]');
  surfaceNodes.forEach((node) => {
    const element = node;
    if (surfaceStyle) {
      element.setAttribute('style', surfaceStyle);
    } else {
      element.removeAttribute('style');
    }
  });

  const textNodes = document.querySelectorAll('[data-profile-text]');
  textNodes.forEach((node) => {
    if (surfaceTextStyle) {
      node.setAttribute('style', surfaceTextStyle);
    } else {
      node.removeAttribute('style');
    }
  });

  const profilePreviewButton = document.querySelector('[data-profile-photo-preview]');
  if (profilePreviewButton) {
    const photoPreview = getProfilePhotoPreview();
    profilePreviewButton.innerHTML = photoPreview
      ? `<img class="media-thumb" src="${escapeAttribute(photoPreview)}" alt="${escapeAttribute(state.name || 'Profile photo')}" />`
      : '<div class="media-thumb placeholder-thumb">No image</div>';
  }
}

function renderUserIdentity(name) {
  const userPhotoUrl = resolveMediaUrl(state.userPhotoUrl);
  return `
      ${userPhotoUrl
        ? `<img class="user-mini-photo nav-avatar" src="${escapeAttribute(userPhotoUrl)}" alt="${escapeAttribute(name)}" />`
        : `<span class="user-mini-photo user-mini-fallback nav-avatar">${escapeHtml(name.slice(0, 1).toUpperCase())}</span>`}
  `;
}

function pageTemplate(content) {
  const logoActive = state.route === '/' ? 'active' : '';
  const shellStyles = [];
  if (state.userBackground) {
    shellStyles.push(`--user-surface-background:${state.userBackground}`);
  }
  if (state.userColor) {
    shellStyles.push(`--user-surface-color:${state.userColor}`);
  }
  const shellStyle = shellStyles.length ? ` style="${escapeAttribute(shellStyles.join(';'))};"` : '';
  return `
    <div class="app-shell"${shellStyle}>
      <header class="topbar">
        ${isSignedIn()
          ? `
            <div class="topbar-main">
              <nav class="topbar-nav">
                <ul class="nav-list">
                  <li><a class="${logoActive}" href="#/" aria-label="Home" title="Home">🏡</a></li>
                  <li><a class="${state.route === '/dishes' ? 'active' : ''}" href="#/dishes" aria-label="Dishes" title="Dishes">🍽️</a></li>
                  <li><a class="${state.route === '/movies' ? 'active' : ''}" href="#/movies" aria-label="Movies" title="Movies">🎬</a></li>
                  <li><a class="${state.route === '/travel' ? 'active' : ''}" href="#/travel" aria-label="Travel" title="Travel">✈️</a></li>
                  <li><a class="${state.route === '/history' ? 'active' : ''}" href="#/history" aria-label="History" title="History">📅</a></li>
                  <li><a class="${state.route === '/profile' ? 'active' : ''} nav-avatar-link" href="#/profile" aria-label="Profile" title="Profile">${renderUserIdentity(state.name || 'User')}</a></li>
                </ul>
              </nav>
            </div>`
          : '<span class="muted">Sign in to browse your family lists.</span>'}
      </header>
      <main class="page-content">${content}</main>
    </div>
  `;
}

function renderHome() {
  if (isSignedIn()) {
    const userPhotoUrl = getProfilePhotoPreview();
    const helloVideoUrl = resolveProtectedEndpointUrl('__hello_video__', `${API_BASE_URL}${endpoints.helloVideo}`);
    const profileSurfaceStyle = getProfileSurfaceStyle();
    const profileTextStyle = state.userColor ? `style="color:${escapeAttribute(state.userColor)};"` : '';
    return pageTemplate(`
      <section class="panel auth-layout auth-layout-single">
        <div class="welcome-media">
          <div class="home-top-grid home-top-grid-single">
            <div class="profile-card profile-card-large equal-card user-profile-surface" data-profile-surface ${profileSurfaceStyle ? `style="${escapeAttribute(profileSurfaceStyle)}"` : ''}>
              ${userPhotoUrl
                ? `<img class="profile-photo profile-photo-large" src="${escapeAttribute(userPhotoUrl)}" alt="${escapeAttribute(state.name || 'Logged user')}" />`
                : `<div class="profile-photo profile-photo-large profile-fallback">${escapeHtml((state.name || 'U').slice(0, 1).toUpperCase())}</div>`}
              <div data-profile-text ${profileTextStyle}>
                <strong>${escapeHtml(state.name || 'User')}</strong>
              </div>
            </div>
          </div>
          ${helloVideoUrl
            ? `<video class="hello-video" src="${escapeAttribute(helloVideoUrl)}" controls autoplay muted loop playsinline>
                Your browser does not support the hello video.
              </video>`
            : '<div class="empty-state">Loading hello video...</div>'}
        </div>
      </section>
    `);
  }

  return pageTemplate(`
    <section class="panel auth-layout">
      <div>
        <span class="badge">FamilyApi access</span>
        <h1>${state.authMode === 'login' ? 'Login to FamilyApp' : 'Create your FamilyApp account'}</h1>
        <p class="muted">
          The home page is now dedicated to authentication. Dishes, movies, travel, and history are available only after login.
        </p>
        <p class="muted">API status: ${escapeHtml(state.apiStatus || 'Waiting for login...')}</p>
      </div>

      <section class="auth-card">
        <div class="auth-tabs">
          <button class="tab-button ${state.authMode === 'login' ? 'active' : ''}" data-auth-mode="login">Login</button>
          <button class="tab-button ${state.authMode === 'register' ? 'active' : ''}" data-auth-mode="register">Register</button>
        </div>

        <form class="stack" id="auth-form">
          <label>
            Name
            <input name="name" type="text" placeholder="Your name" value="${escapeAttribute(state.name)}" required />
          </label>
          <label>
            Password
            <input name="password" type="password" placeholder="Password" required />
          </label>
          <button class="button primary" type="submit">
            ${state.authMode === 'login' ? 'Login' : 'Register'}
          </button>
        </form>

        ${state.authStatus ? `<p class="message ${state.authStatus.startsWith('Unable') ? 'error' : 'success'}">${escapeHtml(state.authStatus)}</p>` : ''}
      </section>
    </section>
  `);
}

function renderEditorPage() {
  const context = state.editorContext;
  const isHistoryEditor = context?.target === 'history';
  const item = !isHistoryEditor && context ? findItemByKey(context.kind, context.itemKey) : null;
  const historyEntry = isHistoryEditor ? context?.historyEntry : null;

  if (!context || (!item && !historyEntry)) {
    return pageTemplate(`
      <section class="panel">
        <span class="badge">Editor</span>
        <h1>Item editor unavailable</h1>
        <p class="muted">Select a dish, movie, travel destination, or history event first.</p>
        <button class="button primary" type="button" data-go-route="/dishes">Back to lists</button>
      </section>
    `);
  }

  const kindLabel = isHistoryEditor
    ? 'History event'
    : context.kind === 'dishes'
      ? 'Dish'
      : context.kind === 'movies'
        ? 'Movie'
        : 'Travel destination';
  const sourcePhoto = isHistoryEditor ? historyEntry?.entry?.Photo : item.Photo;
  const image = resolveMediaUrl(context.photoDraft ?? sourcePhoto);
  const currentPhoto = context.photoDraft ?? sourcePhoto ?? '';
  const mediaMode = context.mediaMode || 'link';
  const dateStartValue = String(context.dateStartDraft ?? '').slice(0, 16);
  const dateEndValue = String(context.dateEndDraft ?? '').slice(0, 16);
  const cancelRoute = isHistoryEditor
    ? '/history'
    : context.kind === 'dishes'
      ? '/dishes'
      : context.kind === 'movies'
        ? '/movies'
        : '/travel';
  const previewName = isHistoryEditor ? historyEntry?.title : item.Name;

  return pageTemplate(`
    <section class="panel auth-layout editor-layout-surface">
      <div class="stack">
        <h1>Edit ${kindLabel.toLowerCase()}</h1>
        <button class="thumb-shell thumb-button editor-preview" type="button" data-editor-photo-click="true">
          ${image ? `<img class="media-thumb" src="${escapeAttribute(image)}" alt="${escapeAttribute(previewName || 'Preview')}" />` : '<div class="media-thumb placeholder-thumb">No image</div>'}
        </button>
      </div>
      <section class="auth-card">
        <form class="stack" id="editor-form">
          <label>
            ${kindLabel} name
            <input name="primary" type="text" value="${escapeAttribute(context.primaryDraft ?? item.Name ?? '')}" required />
          </label>
          <div class="media-mode-switch">
            <button class="tab-button ${mediaMode === 'link' ? 'active' : ''}" type="button" data-editor-mode="link">Use link</button>
            <button class="tab-button ${mediaMode === 'file' ? 'active' : ''}" type="button" data-editor-mode="file">Upload file</button>
          </div>
          ${mediaMode === 'file'
            ? `<label>
                Photo file
                <input id="editor-file-input" name="imageFile" type="file" accept="image/*" />
              </label>`
            : `<label>
                Photo path or URL
                <input id="editor-link-input" name="image" type="text" value="${escapeAttribute(currentPhoto)}" />
              </label>`}
          ${isHistoryEditor
            ? `<div class="travel-dates-grid">
                <label>
                  Start (local time)
                  <input name="dateStart" type="datetime-local" value="${escapeAttribute(dateStartValue)}" />
                </label>
                <label>
                  End (local time)
                  <input name="dateEnd" type="datetime-local" value="${escapeAttribute(dateEndValue)}" />
                </label>
              </div>`
            : ''}
          ${context.status ? `<p class="message ${context.status.startsWith('Unable') ? 'error' : 'success'}">${escapeHtml(context.status)}</p>` : ''}
          <div class="row-actions">
            <button class="button primary" type="submit">Save changes</button>
            <button class="button danger" type="button" data-editor-delete="true">Delete item</button>
            <button class="button ghost" type="button" data-go-route="${cancelRoute}">Cancel</button>
          </div>
        </form>
      </section>
    </section>
  `);
}

function renderProfilePage() {
  const photoPreview = getProfilePhotoPreview();
  const profileSurfaceStyle = getProfileSurfaceStyle();
  const profileTextStyle = state.userColor ? `style="color:${escapeAttribute(state.userColor)};"` : '';
  return pageTemplate(`
    <section class="panel auth-layout">
      <div class="stack profile-preview user-profile-surface" data-profile-surface ${profileSurfaceStyle ? `style="${escapeAttribute(profileSurfaceStyle)}"` : ''}>
        <h1 data-profile-text ${profileTextStyle}>Edit profile</h1>
        <button class="thumb-shell thumb-button editor-preview" type="button" data-profile-photo-click="true" data-profile-photo-preview>
          ${photoPreview ? `<img class="media-thumb" src="${escapeAttribute(photoPreview)}" alt="${escapeAttribute(state.name || 'Profile photo')}" />` : '<div class="media-thumb placeholder-thumb">No image</div>'}
        </button>
      </div>
      <section class="auth-card">
        <form class="stack" id="profile-form">
          <label>
            Name
            <input name="name" type="text" value="${escapeAttribute(state.name)}" required />
          </label>
          <label>
            Password
            <input name="password" type="password" value="${escapeAttribute(state.profilePasswordDraft)}" placeholder="Optional: leave blank to keep current password" data-profile-password="true" />
          </label>
          <label>
            Dark mode
            <select name="darkMode">
              <option value="0" ${state.userDarkMode === 0 ? 'selected' : ''}>Off</option>
              <option value="1" ${state.userDarkMode === 1 ? 'selected' : ''}>Always on</option>
              <option value="2" ${state.userDarkMode === 2 ? 'selected' : ''}>After sunset (fallback after 6pm)</option>
            </select>
          </label>
          <label>
            Profile background (hex)
            <input name="background" type="text" placeholder="#2F4F4F" value="${escapeAttribute(state.userBackground)}" />
          </label>
          <label>
            Pick background color
            <input name="backgroundPicker" type="color" value="${escapeAttribute(state.userBackground || '#1f2a44')}" />
          </label>
          <label>
            Profile text color (hex)
            <input name="color" type="text" placeholder="#FFFFFF" value="${escapeAttribute(state.userColor)}" />
          </label>
          <label>
            Pick text color
            <input name="colorPicker" type="color" value="${escapeAttribute(state.userColor || '#ffffff')}" />
          </label>
          <div class="media-mode-switch">
            <button class="tab-button ${state.profileEditorMode === 'link' ? 'active' : ''}" type="button" data-profile-mode="link">Use link</button>
            <button class="tab-button ${state.profileEditorMode === 'file' ? 'active' : ''}" type="button" data-profile-mode="file">Upload file</button>
          </div>
          ${state.profileEditorMode === 'file'
            ? `<label>
                Profile photo
                <input id="profile-file-input" name="photoFile" type="file" accept="image/*" />
              </label>`
            : `<label>
                Photo path or URL
                <input id="profile-link-input" name="photo" type="text" value="${escapeAttribute(state.userPhotoUrl)}" />
              </label>`}
          ${state.profileStatus ? `<p class="message ${state.profileStatus.startsWith('Unable') ? 'error' : 'success'}">${escapeHtml(state.profileStatus)}</p>` : ''}
          <div class="row-actions">
            <button class="button primary" type="submit">Save profile</button>
            <button class="button danger" type="button" data-action="logout">Logout</button>
            <button class="button ghost" type="button" data-go-route="/">Back home</button>
          </div>
        </form>
      </section>
    </section>
  `);
}

function renderCollectionPage({ kind, title, badge, status, itemField, imageField, imageLabel, inputPlaceholder, imagePlaceholder }) {
  const view = kind === 'dishes' ? state.dishesView : kind === 'movies' ? state.moviesView : state.travelsView;
  const showForm = kind === 'dishes' ? state.showDishForm : kind === 'movies' ? state.showMovieForm : state.showTravelForm;
  const editingId = kind === 'dishes' ? state.editingDishId : kind === 'movies' ? state.editingMovieId : state.editingTravelId;
  const mediaMode = kind === 'dishes' ? state.dishMediaMode : kind === 'movies' ? state.movieMediaMode : state.travelMediaMode;
  const items = currentSectionItems(kind);
  return pageTemplate(`
    <section class="panel collection-layout">
      <div class="mobile-filter-bar">
        <button class="mobile-filter-link ${view === 'all' ? 'active' : ''}" type="button" data-view-kind="${kind}" data-view="all">ALL</button>
        <button class="mobile-filter-link ${view === 'mine' ? 'active' : ''}" type="button" data-view-kind="${kind}" data-view="mine">MINE</button>
        <button class="mobile-filter-link ${view === 'random' ? 'active' : ''}" type="button" data-view-kind="${kind}" data-view="random">PROP</button>
        <button class="button primary add-item-button mobile-add-button" type="button" data-toggle-form="${kind}" aria-label="Add ${title.toLowerCase().slice(0, -1)}">+</button>
      </div>

      <aside class="side-menu ${state.collectionMenuOpen ? 'open' : ''}">
        <h2>${badge}</h2>
        <button class="side-link ${view === 'all' ? 'active' : ''}" data-view-kind="${kind}" data-view="all">ALL</button>
        <button class="side-link ${view === 'mine' ? 'active' : ''}" data-view-kind="${kind}" data-view="mine">MINE</button>
        <button class="side-link ${view === 'random' ? 'active' : ''}" data-view-kind="${kind}" data-view="random">PROP</button>
      </aside>

      <div class="content-panel route-transition">
        <div class="list-toolbar">
          <div>
            <h3>${view === 'all' ? `All ${title.toLowerCase()}` : view === 'mine' ? `My ${title.toLowerCase()}` : `Random ${title.toLowerCase().slice(0, -1)}`}</h3>
          </div>
          <button class="button primary add-item-button desktop-add-button" type="button" data-toggle-form="${kind}" aria-label="Add ${title.toLowerCase().slice(0, -1)}">+</button>
        </div>

        ${showForm ? `
          <form class="add-form" data-add-form="${kind}">
            <label>
              ${title === 'Dishes' ? 'Dish name' : title === 'Movies' ? 'Movie title' : 'Destination'}
              <input name="primary" type="text" placeholder="${inputPlaceholder}" value="${escapeAttribute(getEditingValue(kind, itemField))}" required />
            </label>
            <div class="media-mode-switch">
              <button class="tab-button ${mediaMode === 'link' ? 'active' : ''}" type="button" data-media-mode-kind="${kind}" data-media-mode="link">Use link</button>
              <button class="tab-button ${mediaMode === 'file' ? 'active' : ''}" type="button" data-media-mode-kind="${kind}" data-media-mode="file">Upload file</button>
            </div>
            ${mediaMode === 'file'
              ? `<label>
                  ${imageLabel}
                  <input name="imageFile" type="file" accept="image/*" />
                </label>`
              : `<label>
                  ${imageLabel}
                  <input name="image" type="url" placeholder="${imagePlaceholder}" value="${escapeAttribute(getEditingValue(kind, imageField))}" />
                </label>`}
            <button class="button primary" type="submit">${editingId ? 'Save changes' : 'Save'}</button>
          </form>
        ` : ''}

        ${renderMediaList({ kind, items, itemField, imageField, emptyText: title === 'Dishes' ? 'No dishes to display.' : title === 'Movies' ? 'No movies to display.' : 'No travel destinations to display.' })}
      </div>
    </section>
  `);
}

function getEditingValue(kind, field) {
  const normalizedField = String(field || '').toLowerCase();
  const draft = kind === 'dishes' ? state.dishDraft : kind === 'movies' ? state.movieDraft : state.travelDraft;
  if (normalizedField === 'name' && draft.name) {
    return draft.name;
  }
  if (normalizedField === 'photo' && draft.photo) {
    return draft.photo;
  }
  if (normalizedField === 'datestart' && draft.dateStart) {
    return draft.dateStart;
  }
  if (normalizedField === 'dateend' && draft.dateEnd) {
    return draft.dateEnd;
  }

  const collection = getAllKnownItems(kind);
  const editingId = kind === 'dishes' ? state.editingDishId : kind === 'movies' ? state.editingMovieId : state.editingTravelId;
  const item = collection.find((entry) => getItemId(entry) === editingId);
  if (normalizedField === 'name') {
    return item?.Name || '';
  }
  if (normalizedField === 'photo') {
    return item?.Photo || '';
  }
  if (normalizedField === 'datestart') {
    return toDateInputLocalValue(item?.DateStart);
  }
  if (normalizedField === 'dateend') {
    return toDateInputLocalValue(item?.DateEnd);
  }
  return '';
}

function updateCollectionDraft(kind, field, value) {
  const target = kind === 'dishes' ? state.dishDraft : kind === 'movies' ? state.movieDraft : state.travelDraft;
  target[field] = value;
}

function renderAddedBy(item) {
  const name = item?.AddedBy || 'Unknown';
  const explicitPhotoUrl = resolveMediaUrl(getAddedByPhotoPath(item));
  const userPhotoUrl = resolveMediaUrl(state.userPhotoUrl);
  const avatarUrl = explicitPhotoUrl || (name === state.name ? userPhotoUrl : '');
  return `
    <span class="meta-tag meta-user">
      ${avatarUrl
        ? `<img class="meta-avatar" src="${escapeAttribute(avatarUrl)}" alt="${escapeAttribute(name)}" />`
        : `<span class="meta-avatar meta-avatar-fallback">${escapeHtml((name || 'U').slice(0, 1).toUpperCase())}</span>`}
      <span>${escapeHtml(name)}</span>
    </span>
  `;
}

function renderMediaList({ kind, items, itemField, imageField, emptyText }) {
  if (!items.length) {
    return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
  }

  return `
    <ul class="media-list">
      ${items
        .map((item) => {
          const title = item[itemField] || 'Untitled';
          const image = resolveMediaUrl(item[imageField]);
          const addedBy = item.AddedBy ? renderAddedBy(item) : '';
          const itemKey = getItemKey(kind, item);
          const itemCardStyle = getItemCardStyle(item);
          return `
            <li class="media-row"${itemCardStyle}>
              <button class="thumb-shell thumb-button" type="button" data-edit-kind="${kind}" data-item-key="${escapeAttribute(itemKey)}" data-photo-edit="true">
                ${image ? `<img class="media-thumb" src="${escapeAttribute(image)}" alt="${escapeAttribute(title)}" />` : '<div class="media-thumb placeholder-thumb">No image</div>'}
              </button>
              <div class="media-copy">
                <strong>${escapeHtml(title)}</strong>
                ${addedBy}
                <div class="row-actions">
                  <button class="button secondary" type="button" data-edit-kind="${kind}" data-item-key="${escapeAttribute(itemKey)}">Edit</button>
                  <button class="button danger" type="button" data-delete-kind="${kind}" data-item-key="${escapeAttribute(itemKey)}">Delete</button>
                  <button class="button primary" type="button" data-pick-kind="${kind}" data-item-key="${escapeAttribute(itemKey)}">Pick</button>
                  <button class="button secondary" type="button" data-pick-delete-kind="${kind}" data-item-key="${escapeAttribute(itemKey)}">Pick & delete</button>
                </div>
                ${kind === 'travel'
                  ? `<div class="travel-pick-dates">
                      <label class="inline-date">
                        Start
                        <input type="date" data-travel-date-start="${escapeAttribute(itemKey)}" />
                      </label>
                      <label class="inline-date">
                        End
                        <input type="date" data-travel-date-end="${escapeAttribute(itemKey)}" />
                      </label>
                    </div>`
                  : ''}
              </div>
            </li>
          `;
        })
        .join('')}
    </ul>
  `;
}

function renderDishesPage() {
  return renderCollectionPage({
    kind: 'dishes',
    title: 'Dishes',
    badge: 'Family menu',
    status: state.dishesStatus,
    itemField: 'Name',
    imageField: 'Photo',
    imageLabel: 'Photo URL',
    inputPlaceholder: 'Homemade pizza',
    imagePlaceholder: 'https://example.com/dish.jpg',
  });
}

function renderMoviesPage() {
  return renderCollectionPage({
    kind: 'movies',
    title: 'Movies',
    badge: 'Family cinema',
    status: state.moviesStatus,
    itemField: 'Name',
    imageField: 'Photo',
    imageLabel: 'Photo URL',
    inputPlaceholder: 'The Lord of the Rings',
    imagePlaceholder: 'https://example.com/movie.jpg',
  });
}

function renderTravelPage() {
  return renderCollectionPage({
    kind: 'travel',
    title: 'Travel',
    badge: 'Family adventures',
    status: state.travelsStatus,
    itemField: 'Name',
    imageField: 'Photo',
    imageLabel: 'Photo URL',
    inputPlaceholder: 'Barcelona',
    imagePlaceholder: 'https://example.com/travel.jpg',
  });
}

function renderHistoryPage() {
  return pageTemplate(`
    <section class="panel">
      <div class="content-panel route-transition">
        <div class="list-toolbar">
          <div>
            <h3>History calendar</h3>
            <p class="muted">${escapeHtml(state.historyStatus || 'All picked items are shown by your local date/time.')}</p>
          </div>
        </div>
        ${renderHistoryCalendar()}
        ${renderHistoryDetailsSection()}
      </div>
    </section>
    ${renderHistoryDetailsModal()}
  `);
}

function renderHistoryDetailsModal() {
  if (!state.historyPreviewKey) {
    return '';
  }

  const historyItem = buildHistoryEntries().find((entry) => entry.historyKey === state.historyPreviewKey);
  if (!historyItem) {
    return '';
  }

  const itemType = String(historyItem.entry?.Type || historyItem.kind || 'item').trim() || 'item';
  const addedBy = String(
    historyItem.entry?.AddedBy
    || historyItem.entry?.AddedByName
    || historyItem.entry?.UserName
    || historyItem.entry?.CreatedBy
    || ''
  ).trim() || 'Unknown';
  const photoUrl = resolveMediaUrl(historyItem.entry?.Photo || '');
  const historyId = String(historyItem.entry?.id || historyItem.entry?.Id || '').trim();
  const historySurfaceStyle = getHistorySurfaceStyle(historyItem);
  const textStyle = historySurfaceStyle ? ` style="${escapeAttribute(historySurfaceStyle)};"` : '';

  return `
    <div class="history-detail-overlay">
      <section class="history-detail-modal user-profile-surface" data-profile-surface ${historySurfaceStyle ? `style="${escapeAttribute(historySurfaceStyle)}"` : ''}>
        <div class="history-detail-header">
          <h4${textStyle}>${escapeHtml(historyItem.title)}</h4>
          <button class="button secondary" type="button" data-history-detail-close>Close</button>
        </div>
        ${photoUrl
          ? `<img class="history-detail-photo" src="${escapeAttribute(photoUrl)}" alt="${escapeAttribute(`${historyItem.title} photo`)}" loading="lazy" />`
          : '<div class="history-detail-photo-placeholder">No photo</div>'}
        <div class="history-detail-grid"${textStyle}>
          <p><strong>Type:</strong> ${escapeHtml(itemType)}</p>
          <p><strong>Added by:</strong> ${escapeHtml(addedBy)}</p>
          <p><strong>Start:</strong> ${escapeHtml(formatHistoryDateTime(historyItem.startAt))}</p>
          <p><strong>End:</strong> ${escapeHtml(formatHistoryDateTime(historyItem.endAt))}</p>
        </div>
        <div class="history-detail-actions">
          <button class="button secondary" type="button" data-history-detail-edit="${escapeAttribute(historyItem.historyKey)}">Edit</button>
          <button class="button danger" type="button" data-history-detail-delete="${escapeAttribute(historyId)}">Delete</button>
        </div>
      </section>
    </div>
  `;
}

function renderHistoryDetailsSection() {
  return renderHistoryDetailsModal();
}

function renderHistoryCalendar() {
  if (!state.history.length) {
    return '<div class="empty-state">No history yet.</div>';
  }

  const historyEntries = buildHistoryEntries();

  const cursor = new Date(state.historyMonthCursor);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthLabel = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const getWeekdayIndex = (dateValue) => (dateValue.getDay() + 6) % 7;
  const firstDayOfWeek = getWeekdayIndex(monthStart);
  const monthEnd = new Date(year, month, daysInMonth);
  const trailingDaysCount = 6 - getWeekdayIndex(monthEnd);
  const calendarStart = new Date(year, month, 1 - firstDayOfWeek);
  const calendarEnd = new Date(year, month, daysInMonth + trailingDaysCount);
  const cells = [];
  for (let dayPointer = new Date(calendarStart); dayPointer <= calendarEnd; dayPointer.setDate(dayPointer.getDate() + 1)) {
    const date = new Date(dayPointer);
    cells.push({
      date,
      inCurrentMonth: date.getMonth() === month,
    });
  }

  const colors = {
    dishes: '#f59e0b',
    movies: '#8b5cf6',
    travel: '#06b6d4',
  };

  const formatTooltipDateTime = (value) => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return 'Unknown';
    }
    return value.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderHistoryTooltip = (historyItem) => {
    const itemType = String(historyItem.entry?.Type || historyItem.kind || 'item').trim() || 'item';
    const addedBy = String(
      historyItem.entry?.AddedBy
      || historyItem.entry?.AddedByName
      || historyItem.entry?.UserName
      || historyItem.entry?.CreatedBy
      || ''
    ).trim() || 'Unknown';
    const photoUrl = resolveMediaUrl(historyItem.entry?.Photo || '');
    const photoMarkup = photoUrl
      ? `<img class="calendar-tooltip-photo" src="${escapeAttribute(photoUrl)}" alt="${escapeAttribute(`${historyItem.title} photo`)}" loading="lazy" />`
      : '<div class="calendar-tooltip-photo placeholder" aria-hidden="true">No photo</div>';

    return `
      <span class="calendar-item-tooltip" role="tooltip">
        <strong>${escapeHtml(historyItem.title)}</strong>
        ${photoMarkup}
        <span><b>Type:</b> ${escapeHtml(itemType)}</span>
        <span><b>Added by:</b> ${escapeHtml(addedBy)}</span>
        <span><b>Start:</b> ${escapeHtml(formatTooltipDateTime(historyItem.startAt))}</span>
        <span><b>End:</b> ${escapeHtml(formatTooltipDateTime(historyItem.endAt))}</span>
      </span>
    `;
  };

  const buildCalendarWeeks = () => {
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) {
      const weekDays = cells.slice(i, i + 7).map((cell) => ({ ...cell }));
      const weekStart = weekDays[0]?.date || null;
      const weekEnd = weekDays[6]?.date || null;
      weeks.push({ weekDays, weekStart, weekEnd });
    }
    return weeks;
  };

  const placeSegmentsInLanes = (segments) => {
    const lanes = [];
    segments.forEach((segment) => {
      let laneIndex = lanes.findIndex((lane) => lane.every((existing) => segment.startCol > existing.endCol || segment.endCol < existing.startCol));
      if (laneIndex < 0) {
        laneIndex = lanes.length;
        lanes.push([]);
      }
      lanes[laneIndex].push(segment);
    });
    return lanes;
  };

  const renderWeekSegments = (weekStart, weekEnd) => {
    if (!weekStart || !weekEnd) {
      return '<tr class="calendar-event-row"><td class="calendar-day-empty-cell" colspan="7">—</td></tr>';
    }

    const weekStartKey = formatLocalDateKey(weekStart);
    const weekEndKey = formatLocalDateKey(weekEnd);

    const segments = historyEntries
      .filter((historyItem) => historyItem.endKey >= weekStartKey && historyItem.startKey <= weekEndKey)
      .map((historyItem) => {
        const visibleStart = historyItem.startKey < weekStartKey ? weekStartKey : historyItem.startKey;
        const visibleEnd = historyItem.endKey > weekEndKey ? weekEndKey : historyItem.endKey;
        const visibleStartDate = dateKeyToLocalDate(visibleStart);
        const visibleEndDate = dateKeyToLocalDate(visibleEnd);
        if (!visibleStartDate || !visibleEndDate) {
          return null;
        }

        const startCol = Math.max(0, getWeekdayIndex(visibleStartDate));
        const endCol = Math.min(6, getWeekdayIndex(visibleEndDate));
        return {
          historyItem,
          startCol,
          endCol,
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.startCol !== right.startCol) {
          return left.startCol - right.startCol;
        }
        if (right.historyItem.durationDays !== left.historyItem.durationDays) {
          return right.historyItem.durationDays - left.historyItem.durationDays;
        }
        return left.historyItem.title.localeCompare(right.historyItem.title);
      });

    if (!segments.length) {
      return '<tr class="calendar-event-row"><td class="calendar-day-empty-cell" colspan="7">—</td></tr>';
    }

    const lanes = placeSegmentsInLanes(segments);

    return lanes
      .map((lane) => {
        const sortedLane = [...lane].sort((left, right) => left.startCol - right.startCol);
        let currentColumn = 0;
        const columns = [];

        sortedLane.forEach((segment) => {
          const gap = segment.startCol - currentColumn;
          if (gap > 0) {
            columns.push(`<td colspan="${gap}" class="calendar-empty-event-slot"></td>`);
          }

          const span = segment.endCol - segment.startCol + 1;
          const { historyItem } = segment;
          const editAttributes = historyItem.kind
            ? ` data-history-preview-key="${escapeAttribute(historyItem.historyKey)}"`
            : '';
          const labelMarkup = `<span class="calendar-item-label">${escapeHtml(historyItem.title)}</span>`;
          const tooltipMarkup = renderHistoryTooltip(historyItem);
          const itemSurfaceStyle = getHistorySurfaceStyle(historyItem);
          const fallbackColor = colors[historyItem.kind] || '#94a3b8';
          const styleTokens = [`--item-color:${fallbackColor}`];
          if (itemSurfaceStyle) {
            styleTokens.push(itemSurfaceStyle);
          }
          const styleAttribute = ` style="${escapeAttribute(styleTokens.join(';'))};"`;
          const content = historyItem.kind
            ? `<button class="calendar-item-chip calendar-item-span-chip" type="button"${editAttributes}${styleAttribute}>${labelMarkup}</button>`
            : `<span class="calendar-item-chip calendar-item-span-chip static"${styleAttribute}>${labelMarkup}</span>`;

          columns.push(`<td colspan="${span}" class="calendar-event-slot">${content}</td>`);
          currentColumn = segment.endCol + 1;
        });

        if (currentColumn < 7) {
          columns.push(`<td colspan="${7 - currentColumn}" class="calendar-empty-event-slot"></td>`);
        }

        return `<tr class="calendar-event-row">${columns.join('')}</tr>`;
      })
      .join('');
  };

  const weeks = buildCalendarWeeks();

  return `
    <div class="history-calendar-wrap">
      <div class="calendar-toolbar">
      <button class="button secondary" type="button" data-history-nav="-1">←</button>
      <strong>${escapeHtml(monthLabel)}</strong>
      <button class="button secondary" type="button" data-history-nav="1">→</button>
    </div>
    <div class="calendar-legend">
      <span><i style="background:#f59e0b"></i> Dish</span>
      <span><i style="background:#8b5cf6"></i> Movie</span>
      <span><i style="background:#06b6d4"></i> Travel</span>
    </div>
    <table class="history-calendar-table">
      <thead>
        <tr>
          ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((weekday) => `<th class="calendar-weekday">${weekday}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${weeks.map(({ weekDays, weekStart, weekEnd }) => `
          <tr class="calendar-day-number-row">
            ${weekDays.map(({ date, inCurrentMonth }) => {
              const className = inCurrentMonth ? 'calendar-day' : 'calendar-day muted-day';
              return `<td class="${className}"><div class="calendar-day-number">${date.getDate()}</div></td>`;
            }).join('')}
          </tr>
          ${renderWeekSegments(weekStart, weekEnd)}
        `).join('')}
      </tbody>
    </table>
    </div>
  `;
}

function render() {
  applyTheme();
  ensureProtectedRoute();
  const view = routes[state.route] || renderHome;
  app.innerHTML = view();

  const logoutButton = document.querySelector('[data-action="logout"]');
  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      persistSession('', '');
      state.authStatus = 'You have been signed out.';
      state.apiStatus = '';
      state.showDishForm = false;
      state.showMovieForm = false;
      state.showTravelForm = false;
      state.editingDishId = '';
      state.editingMovieId = '';
      state.editingTravelId = '';
      setProfilePhotoPreviewUrl('');
      await refreshProtectedData();
      await hydrateWelcomeMedia();
      navigate('/');
    });
  }

  document.querySelectorAll('[data-go-route]').forEach((button) => {
    button.addEventListener('click', () => {
      navigate(button.getAttribute('data-go-route') || '/');
    });
  });

  document.querySelectorAll('[data-auth-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.authMode = button.getAttribute('data-auth-mode') || 'login';
      state.authStatus = '';
      render();
    });
  });

  const authForm = document.querySelector('#auth-form');
  if (authForm) {
    authForm.addEventListener('submit', handleAuthSubmit);
  }

  const editorForm = document.querySelector('#editor-form');
  if (editorForm) {
    editorForm.addEventListener('submit', handleEditorFormSubmit);
  }

  const profileForm = document.querySelector('#profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', handleProfileFormSubmit);
  }

  document.querySelectorAll('[data-view-kind]').forEach((button) => {
    button.addEventListener('click', async () => {
      const kind = button.getAttribute('data-view-kind');
      const viewName = button.getAttribute('data-view');
      if (kind === 'dishes') {
        state.dishesView = viewName || 'all';
        if (state.dishesView === 'random') {
          state.randomDish = DataMapper.normalizeItem(normalizeSingleItem(await apiRequest(endpoints.randomDish).catch(() => state.randomDish)));
        }
      } else if (kind === 'movies') {
        state.moviesView = viewName || 'all';
        if (state.moviesView === 'random') {
          state.randomMovie = DataMapper.normalizeItem(normalizeSingleItem(await apiRequest(endpoints.randomMovie).catch(() => state.randomMovie)));
        }
      } else {
        state.travelsView = viewName || 'all';
        if (state.travelsView === 'random') {
          state.randomTravel = DataMapper.normalizeItem(normalizeSingleItem(await apiRequest(endpoints.randomTravel).catch(() => state.randomTravel)));
        }
      }
      state.collectionMenuOpen = false;
      render();
    });
  });

  document.querySelectorAll('[data-toggle-side-menu]').forEach((button) => {
    button.addEventListener('click', () => {
      state.collectionMenuOpen = !state.collectionMenuOpen;
      render();
    });
  });

  document.querySelectorAll('[data-media-mode-kind]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.getAttribute('data-media-mode-kind');
      const mode = button.getAttribute('data-media-mode') || 'link';
      if (kind === 'dishes') {
        state.dishMediaMode = mode;
      } else if (kind === 'movies') {
        state.movieMediaMode = mode;
      } else {
        state.travelMediaMode = mode;
      }
      render();
    });
  });

  document.querySelectorAll('[data-toggle-form]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.getAttribute('data-toggle-form');
      if (kind === 'dishes') {
        state.showDishForm = !state.showDishForm;
        state.editingDishId = state.showDishForm ? state.editingDishId : '';
        if (!state.showDishForm) {
          state.dishDraft = { name: '', photo: '' };
        }
      } else if (kind === 'movies') {
        state.showMovieForm = !state.showMovieForm;
        state.editingMovieId = state.showMovieForm ? state.editingMovieId : '';
        if (!state.showMovieForm) {
          state.movieDraft = { name: '', photo: '' };
        }
      } else {
        state.showTravelForm = !state.showTravelForm;
        state.editingTravelId = state.showTravelForm ? state.editingTravelId : '';
        if (!state.showTravelForm) {
          state.travelDraft = { name: '', photo: '', dateStart: '', dateEnd: '' };
        }
      }
      render();
    });
  });

  document.querySelectorAll('[data-edit-user-photo]').forEach((button) => {
    button.addEventListener('click', () => {
      state.profileStatus = '';
      navigate('/profile');
    });
  });

  document.querySelectorAll('[data-profile-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.profileEditorMode = button.getAttribute('data-profile-mode') || 'link';
      state.profileStatus = '';
      render();
    });
  });

  document.querySelectorAll('[data-editor-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.editorContext) {
        return;
      }
      state.editorContext.mediaMode = button.getAttribute('data-editor-mode') || 'link';
      state.editorContext.status = '';
      render();
    });
  });

  document.querySelectorAll('[data-edit-kind]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.getAttribute('data-edit-kind');
      const itemKey = button.getAttribute('data-item-key') || '';
      openEditorPage(kind || '', itemKey, button.hasAttribute('data-photo-edit'));
    });
  });

  document.querySelectorAll('[data-delete-kind]').forEach((button) => {
    button.addEventListener('click', async () => {
      const kind = button.getAttribute('data-delete-kind');
      const itemKey = button.getAttribute('data-item-key') || '';
      await handleDeleteItem(kind || '', itemKey);
    });
  });

  document.querySelectorAll('[data-pick-kind]').forEach((button) => {
    button.addEventListener('click', async () => {
      const kind = button.getAttribute('data-pick-kind');
      const itemKey = button.getAttribute('data-item-key') || '';
      await handlePickItem(kind || '', itemKey, false);
    });
  });

  document.querySelectorAll('[data-pick-delete-kind]').forEach((button) => {
    button.addEventListener('click', async () => {
      const kind = button.getAttribute('data-pick-delete-kind');
      const itemKey = button.getAttribute('data-item-key') || '';
      await handlePickItem(kind || '', itemKey, true);
    });
  });

  document.querySelectorAll('[data-history-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      const delta = Number(button.getAttribute('data-history-nav') || '0');
      const cursor = new Date(state.historyMonthCursor);
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
      state.historyMonthCursor = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
      render();
    });
  });

  document.querySelectorAll('[data-history-preview-key]').forEach((element) => {
    element.addEventListener('click', () => {
      state.historyPreviewKey = element.getAttribute('data-history-preview-key') || '';
      render();
    });
  });

  document.querySelectorAll('[data-history-detail-close]').forEach((button) => {
    button.addEventListener('click', () => {
      state.historyPreviewKey = '';
      render();
    });
  });

  document.querySelectorAll('[data-history-detail-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const historyKey = button.getAttribute('data-history-detail-edit') || '';
      state.historyPreviewKey = '';
      openHistoryEditorPage(historyKey);
    });
  });

  document.querySelectorAll('[data-history-detail-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const historyId = button.getAttribute('data-history-detail-delete') || '';
      if (!historyId) {
        state.apiStatus = 'Unable to delete history event. Missing history id.';
        render();
        return;
      }

      if (!window.confirm('Delete this history event?')) {
        return;
      }

      try {
        await apiRequest(`${endpoints.history}/${historyId}`, { method: 'DELETE' });
        state.historyPreviewKey = '';
        state.apiStatus = 'History event deleted.';
        await refreshProtectedData();
        render();
      } catch (error) {
        state.apiStatus = `Unable to delete history event. ${error.message}`;
        render();
      }
    });
  });

  document.querySelectorAll('[data-add-form]').forEach((form) => {
    form.addEventListener('submit', handleSaveItem);
    form.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      const kind = form.getAttribute('data-add-form');
      if (!kind) {
        return;
      }
      if (target.name === 'primary') {
        updateCollectionDraft(kind, 'name', target.value);
      }
      if (target.name === 'image') {
        updateCollectionDraft(kind, 'photo', target.value);
      }
      if (target.name === 'dateStart') {
        updateCollectionDraft(kind, 'dateStart', target.value);
      }
      if (target.name === 'dateEnd') {
        updateCollectionDraft(kind, 'dateEnd', target.value);
      }
    });
  });

  const profilePasswordInput = document.querySelector('[data-profile-password]');
  if (profilePasswordInput) {
    profilePasswordInput.addEventListener('input', (event) => {
      state.profilePasswordDraft = event.target.value;
    });
  }

  const backgroundInput = document.querySelector('input[name="background"]');
  const backgroundPickerInput = document.querySelector('input[name="backgroundPicker"]');
  if (backgroundInput && backgroundPickerInput) {
    backgroundInput.addEventListener('input', () => {
      const safeColor = sanitizeHexColor(backgroundInput.value);
      if (safeColor) {
        backgroundPickerInput.value = safeColor;
        state.userBackground = safeColor;
      } else {
        state.userBackground = '';
      }
      updateProfilePreviewElements();
    });
    backgroundPickerInput.addEventListener('input', () => {
      backgroundInput.value = backgroundPickerInput.value;
      state.userBackground = backgroundPickerInput.value;
      updateProfilePreviewElements();
    });
  }

  const colorInput = document.querySelector('input[name="color"]');
  const colorPickerInput = document.querySelector('input[name="colorPicker"]');
  if (colorInput && colorPickerInput) {
    colorInput.addEventListener('input', () => {
      const safeColor = sanitizeHexColor(colorInput.value);
      if (safeColor) {
        colorPickerInput.value = safeColor;
        state.userColor = safeColor;
      } else {
        state.userColor = '';
      }
      updateProfilePreviewElements();
    });
    colorPickerInput.addEventListener('input', () => {
      colorInput.value = colorPickerInput.value;
      state.userColor = colorPickerInput.value;
      updateProfilePreviewElements();
    });
  }

  const darkModeSelect = document.querySelector('select[name="darkMode"]');
  if (darkModeSelect) {
    darkModeSelect.addEventListener('change', async () => {
      state.userDarkMode = Number(darkModeSelect.value);
      await applyUserThemePreference();
      applyTheme();
    });
  }

  const profilePhotoLinkInput = document.querySelector('#profile-link-input');
  if (profilePhotoLinkInput) {
    profilePhotoLinkInput.addEventListener('input', () => {
      setProfilePhotoPreviewUrl('');
      state.userPhotoUrl = profilePhotoLinkInput.value;
      updateProfilePreviewElements();
    });
  }

  const profileFileInput = document.querySelector('#profile-file-input');
  if (profileFileInput) {
    profileFileInput.addEventListener('change', () => {
      const nextFile = profileFileInput.files?.[0];
      setProfilePhotoPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : '');
      updateProfilePreviewElements();
    });
  }

  const editorDeleteButton = document.querySelector('[data-editor-delete]');
  if (editorDeleteButton) {
    editorDeleteButton.addEventListener('click', async () => {
      if (!state.editorContext) {
        return;
      }
      if (state.editorContext.target === 'history') {
        const historyEntry = state.editorContext.historyEntry;
        const historyId = String(historyEntry?.entry?.id || historyEntry?.entry?.Id || '').trim();
        if (!historyId) {
          return;
        }
        try {
          await apiRequest(`${endpoints.history}/${historyId}`, { method: 'DELETE' });
          await refreshProtectedData();
          navigate('/history');
        } catch (error) {
          state.editorContext.status = `Unable to delete history event. ${error.message}`;
        }
        render();
        return;
      }
      await handleDeleteItem(state.editorContext.kind, state.editorContext.itemKey, true);
    });
  }

  const editorPhotoButton = document.querySelector('[data-editor-photo-click]');
  if (editorPhotoButton) {
    editorPhotoButton.addEventListener('click', () => {
      if (!state.editorContext) {
        return;
      }
      state.editorContext.mediaMode = 'file';
      render();
      const fileInput = document.querySelector('#editor-file-input');
      if (fileInput) {
        fileInput.click();
      }
    });
  }

  const profilePhotoButton = document.querySelector('[data-profile-photo-click]');
  if (profilePhotoButton) {
    profilePhotoButton.addEventListener('click', () => {
      state.profileEditorMode = 'file';
      render();
      const fileInput = document.querySelector('#profile-file-input');
      if (fileInput) {
        fileInput.click();
      }
    });
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const name = String(formData.get('name') || '').trim();
  const password = String(formData.get('password') || '').trim();

  try {
    if (state.authMode === 'register') {
      await apiRequest(endpoints.register, {
        method: 'POST',
        body: JSON.stringify({ name, password }),
      });
      state.authStatus = 'Registration completed. You can now log in.';
      state.authMode = 'login';
      state.name = name;
      render();
      return;
    }

    const data = await apiRequest(endpoints.login, {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    });

    const token = data?.Token || data?.token || '';
    if (!token) {
      throw new Error('The backend did not return a JWT token.');
    }

    persistSession(token, name);
    state.authStatus = 'Login successful.';
    await refreshProtectedData();
    await hydrateWelcomeMedia();
    navigate('/');
  } catch (error) {
    state.authStatus = `Unable to ${state.authMode === 'login' ? 'login' : 'register'}. ${error.message}`;
  }
  render();
}

async function handleEditorFormSubmit(event) {
  event.preventDefault();
  if (!state.editorContext) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const primary = String(formData.get('primary') || '').trim();
  const imageFile = formData.get('imageFile');
  const image = String(formData.get('image') || '').trim();
  const dateStart = String(formData.get('dateStart') || '').trim();
  const dateEnd = String(formData.get('dateEnd') || '').trim();
  const { kind, itemKey, target } = state.editorContext;

  if (target === 'history') {
    const historyEntry = state.editorContext.historyEntry;
    if (!historyEntry) {
      return;
    }
    const historyId = String(historyEntry.entry.id || historyEntry.entry.Id || '').trim();
    if (!historyId) {
      state.editorContext.status = 'Unable to update history event. Missing history id.';
      render();
      return;
    }

    const parseLocalDateTimeToIso = (value, fallback) => {
      if (!value) {
        return fallback;
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
    };

    let photoPath = image;
    if (imageFile instanceof File && imageFile.size > 0) {
      const uploadFormData = new FormData();
      uploadFormData.append('file', imageFile);
      const uploadResponse = await apiRequest(endpoints.fileUpload, {
        method: 'POST',
        body: uploadFormData,
      });
      photoPath = uploadResponse.filePath;
    }

    const body = {
      ...historyEntry.entry,
      Name: primary,
      Photo: photoPath,
      DateStart: parseLocalDateTimeToIso(dateStart, historyEntry.entry.DateStart || new Date().toISOString()),
      DateEnd: parseLocalDateTimeToIso(dateEnd, historyEntry.entry.DateEnd || new Date().toISOString()),
      Type: historyEntry.entry.Type || (kind === 'dishes' ? 'dish' : kind === 'movies' ? 'movie' : 'travel'),
    };

    try {
      await apiRequest(`${endpoints.history}/${historyId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      state.editorContext.status = 'History event updated.';
      await refreshProtectedData();
      navigate('/history');
      render();
    } catch (error) {
      state.editorContext.status = `Unable to update history event. ${error.message}`;
      render();
    }
    return;
  }

  const item = findItemByKey(kind, itemKey);
  if (!item) {
    return;
  }

  const id = getItemId(item);
  const endpoint = `/${kind}/${id}`;
  const body = {
    ...(kind === 'travel' ? item : {}),
    name: primary,
    photo: image,
  };

  try {
    if (imageFile instanceof File && imageFile.size > 0) {
      const uploadFormData = new FormData();
      uploadFormData.append('file', imageFile);
      const uploadResponse = await apiRequest(endpoints.fileUpload, {
        method: 'POST',
        body: uploadFormData,
      });
      body.photo = uploadResponse.filePath;
    }

    await apiRequest(endpoint, {
      method: 'PUT',
      body: JSON.stringify({
        ...body,
      }),
    });

    state.editorContext.status = 'Item updated.';
    await refreshProtectedData();
    render();
  } catch (error) {
    state.editorContext.status = `Unable to update item. ${error.message}`;
    render();
  }
}

async function handleProfileFormSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const name = String(formData.get('name') || '').trim();
  const password = String(formData.get('password') || '').trim();
  const darkMode = Number(formData.get('darkMode') ?? state.userDarkMode ?? 0);
  const backgroundText = sanitizeHexColor(formData.get('background'));
  const backgroundPicker = sanitizeHexColor(formData.get('backgroundPicker'));
  const background = backgroundText || backgroundPicker;
  const colorText = sanitizeHexColor(formData.get('color'));
  const colorPicker = sanitizeHexColor(formData.get('colorPicker'));
  const color = colorText || colorPicker;
  state.profilePasswordDraft = password;
  const photoFile = formData.get('photoFile');
  const photo = String(formData.get('photo') || '').trim();

  try {
    let photoPath = state.userPhotoUrl;
    if (photoFile instanceof File && photoFile.size > 0) {
      const uploadFormData = new FormData();
      uploadFormData.append('file', photoFile);
      const uploadResponse = await apiRequest(endpoints.fileUpload, {
        method: 'POST',
        body: uploadFormData,
      });
      photoPath = uploadResponse.filePath;
    } else if (photo) {
      photoPath = photo;
    }

    const payload = { name, photo: photoPath, darkMode, background, color };
    if (password) {
      payload.password = password;
    }

    await apiRequest(endpoints.editUser, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    state.profileStatus = 'Profile updated.';
    state.name = name;
    state.userPhotoUrl = photoPath;
    setProfilePhotoPreviewUrl('');
    state.userDarkMode = Number.isFinite(darkMode) ? Math.max(0, Math.min(2, darkMode)) : 0;
    state.userBackground = background;
    state.userColor = color;
    state.profilePasswordDraft = password;
    writeStorage('familyapp.name', name);
    writeStorage(`familyapp.userPhoto.${name}`, photoPath);
    await applyUserThemePreference();
    await refreshProtectedData();
    render();
  } catch (error) {
    state.profileStatus = `Unable to update profile. ${error.message}`;
    render();
  }
}

async function handleSaveItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const kind = form.getAttribute('data-add-form');
  const formData = new FormData(form);
  const primary = String(formData.get('primary') || '').trim();
  const imageFile = formData.get('imageFile');
  const image = String(formData.get('image') || '').trim();

  const editingId = kind === 'dishes' ? state.editingDishId : kind === 'movies' ? state.editingMovieId : state.editingTravelId;
  const collection = getAllKnownItems(kind);
  const item = editingId ? collection.find((entry) => getItemId(entry) === editingId) : null;

  try {
    let photoPath = image;
    if (imageFile instanceof File && imageFile.size > 0) {
      const uploadFormData = new FormData();
      uploadFormData.append('file', imageFile);
      const uploadResponse = await apiRequest(endpoints.fileUpload, {
        method: 'POST',
        body: uploadFormData,
      });
      photoPath = uploadResponse.filePath;
    }

    if (editingId && item) {
      const id = getItemId(item);
      const travelPayload = kind === 'travel'
        ? {
            ...item,
            name: primary,
            photo: photoPath,
          }
        : { name: primary, photo: photoPath };
      await apiRequest(`/${kind}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(travelPayload),
      });
    } else {
      const travelPayload = kind === 'travel'
        ? {
            name: primary,
            photo: photoPath,
          }
        : { name: primary, photo: photoPath };
      await apiRequest(`/${kind}`, {
        method: 'POST',
        body: JSON.stringify(travelPayload),
      });
    }

    if (kind === 'dishes') {
      state.showDishForm = false;
      state.editingDishId = '';
      state.dishDraft = { name: '', photo: '' };
    } else if (kind === 'movies') {
      state.showMovieForm = false;
      state.editingMovieId = '';
      state.movieDraft = { name: '', photo: '' };
    } else {
      state.showTravelForm = false;
      state.editingTravelId = '';
      state.travelDraft = { name: '', photo: '', dateStart: '', dateEnd: '' };
    }

    await refreshProtectedData();
    render();
  } catch (error) {
    const label = kind === 'dishes' ? 'dish' : kind === 'movies' ? 'movie' : 'travel destination';
    state.apiStatus = `Unable to save ${label}. ${error.message}`;
    render();
  }
}

function openEditorPage(kind, itemKey, isPhotoEdit) {
  const item = findItemByKey(kind, itemKey);
  if (!item) {
    return;
  }

  state.editorContext = {
    target: 'collection',
    kind,
    itemKey,
    primaryDraft: item.Name,
    photoDraft: isPhotoEdit ? null : item.Photo,
    dateStartDraft: toDateInputLocalValue(item.DateStart),
    dateEndDraft: toDateInputLocalValue(item.DateEnd),
    mediaMode: isPhotoEdit ? 'file' : null,
    status: '',
  };
  navigate('/editor');
}

function toDateTimeLocalValue(value) {
  const date = parseUtcDateTime(value);
  if (!date) {
    return '';
  }
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function toDateInputLocalValue(value) {
  const date = parseUtcDateTime(value);
  if (!date) {
    return '';
  }
  return formatLocalDateKey(date);
}

function openHistoryEditorPage(historyKey) {
  if (!historyKey) {
    return;
  }
  const historyEntry = buildHistoryEntries().find((entry) => entry.historyKey === historyKey);
  if (!historyEntry) {
    return;
  }
  state.editorContext = {
    target: 'history',
    kind: historyEntry.kind,
    itemKey: historyEntry.itemKey,
    historyEntry,
    primaryDraft: historyEntry.title,
    photoDraft: historyEntry.entry.Photo || '',
    dateStartDraft: toDateTimeLocalValue(historyEntry.entry.DateStart),
    dateEndDraft: toDateTimeLocalValue(historyEntry.entry.DateEnd),
    mediaMode: 'link',
    status: '',
  };
  navigate('/editor');
}

async function handleDeleteItem(kind, itemKey, isEditor) {
  const item = findItemByKey(kind, itemKey);
  if (!item) {
    return;
  }

  const id = getItemId(item).toString();
  if (!id) {
    return;
  }

  try {
    await apiRequest(`/${kind}/${id}`, { method: 'DELETE' });
    if (isEditor) {
      navigate('/');
    }
    await refreshProtectedData();
  } catch (error) {
    state.apiStatus = `Failed to delete item: ${error.message}`;
  }
  render();
}

function readTravelDates(itemKey) {
  const startInput = document.querySelector(`[data-travel-date-start="${CSS.escape(itemKey)}"]`);
  const endInput = document.querySelector(`[data-travel-date-end="${CSS.escape(itemKey)}"]`);
  const start = startInput instanceof HTMLInputElement ? startInput.value : '';
  const end = endInput instanceof HTMLInputElement ? endInput.value : '';
  return { start, end };
}

async function handlePickItem(kind, itemKey, deleteAfterPick) {
  const item = findItemByKey(kind, itemKey);
  if (!item) {
    return;
  }

  const nowIso = new Date().toISOString();
  const travelDates = kind === 'travel' ? readTravelDates(itemKey) : { start: '', end: '' };
  const travelStart = travelDates.start || travelDates.end;
  const travelEnd = travelDates.end || travelDates.start;
  const travelStartIso = travelStart ? `${travelStart}T00:00:00.000Z` : nowIso;
  const travelEndIso = travelEnd ? `${travelEnd}T23:59:59.000Z` : nowIso;

  const payload = {
    name: item.Name || '',
    photo: item.Photo || '',
    dateStart: kind === 'travel' ? travelStartIso : nowIso,
    dateEnd: kind === 'travel' ? travelEndIso : nowIso,
    type: kind === 'dishes' ? 'dish' : kind === 'movies' ? 'movie' : 'travel',
  };

  try {
    await apiRequest(endpoints.history, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (deleteAfterPick) {
      await handleDeleteItem(kind, itemKey);
      return;
    }
    state.apiStatus = 'Added to history.';
    await refreshProtectedData();
    render();
  } catch (error) {
    state.apiStatus = `Unable to add to history. ${error.message}`;
    render();
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttribute(text) {
  return escapeHtml(text).replace(/\'/g, '&#39;').replace(/\\/g, '&#92;').replace(/\`/g, '&#96;');
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
}

function sanitizeHexColor(value) {
  const candidate = String(value || '').trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate) ? candidate : '';
}

function getFallbackDarkModeByClock(date = new Date()) {
  return date.getHours() >= 18 || date.getHours() < 6;
}

async function resolveDarkModeBySunset() {
  const fallback = getFallbackDarkModeByClock();
  if (!('geolocation' in navigator)) {
    return fallback;
  }

  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 10 * 60 * 1000 });
  }).catch(() => null);

  if (!position) {
    return fallback;
  }

  const { latitude, longitude } = position.coords;
  const response = await fetch(`https://api.sunrise-sunset.org/json?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}&formatted=0`);
  const data = await response.json();
  const sunsetIso = data?.results?.sunset;
  if (!sunsetIso) {
    return fallback;
  }
  return Date.now() >= Date.parse(sunsetIso);
}

async function applyUserThemePreference() {
  if (state.userDarkMode === 1) {
    state.theme = 'dark';
  } else if (state.userDarkMode === 2) {
    const afterSunset = await resolveDarkModeBySunset().catch(() => getFallbackDarkModeByClock());
    state.theme = afterSunset ? 'dark' : 'light';
  } else {
    state.theme = 'light';
  }

  writeStorage('familyapp.theme', state.theme);
}

// Ensure data is loaded on page load if signed in
if (isSignedIn()) {
  refreshProtectedData();
}

render();
