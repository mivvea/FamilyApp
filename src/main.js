import { API_BASE_URL, endpoints } from './constants.js';
import { ApiService } from './services/api-service.js';
import { DataMapper } from './services/data-mapper.js';

const app = document.querySelector('#app');

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
  dishes: [],
  myDishes: [],
  randomDish: null,
  movies: [],
  myMovies: [],
  randomMovie: null,
  dishesStatus: '',
  moviesStatus: '',
  dishesView: 'all',
  moviesView: 'all',
  showDishForm: false,
  showMovieForm: false,
  dishMediaMode: 'link',
  movieMediaMode: 'link',
  editingDishId: '',
  editingMovieId: '',
  dishDraft: { name: '', photo: '' },
  movieDraft: { name: '', photo: '' },
  editorContext: null,
  profileEditorMode: 'link',
  profilePasswordDraft: '',
  profileStatus: '',
};

const routes = {
  '/': renderHome,
  '/dishes': renderDishesPage,
  '/movies': renderMoviesPage,
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

function normalizeItem(payload) {
  return DataMapper.normalizeItem(payload);
}

function normalizeItems(payload) {
  return DataMapper.normalizeItems(payload);
}

function normalizeUsers(payload) {
  return DataMapper.normalizeUsers(payload);
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
    state.userPhotoUrl = '';
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
    state.dishes = [];
    state.myDishes = [];
    state.randomDish = null;
    state.movies = [];
    state.myMovies = [];
    state.randomMovie = null;
    state.dishesStatus = '';
    state.moviesStatus = '';
    render();
    return;
  }

  state.dishesStatus = 'Loading dishes...';
  state.moviesStatus = 'Loading movies...';
  render();

  try {
    const [users, dishes, myDishes, randomDish, movies, myMovies, randomMovie] = await Promise.all([
      apiRequest(endpoints.listUsers).catch(() => []),
      apiRequest(endpoints.dishes),
      apiRequest(endpoints.myDishes).catch((error) => ({ error: error.message })),
      apiRequest(endpoints.randomDish).catch(() => null),
      apiRequest(endpoints.movies),
      apiRequest(endpoints.myMovies).catch((error) => ({ error: error.message })),
      apiRequest(endpoints.randomMovie).catch(() => null),
    ]);

    const normalizedUsers = normalizeUsers(users);
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
    state.dishes = normalizeItems(dishes);
    state.myDishes = normalizeItems(myDishes);
    state.randomDish = normalizeItem(normalizeSingleItem(randomDish));
    state.movies = normalizeItems(movies);
    state.myMovies = normalizeItems(myMovies);
    state.randomMovie = normalizeItem(normalizeSingleItem(randomMovie));
    state.dishesStatus = myDishes?.error ? `All dishes loaded. ${myDishes.error}` : '';
    state.moviesStatus = myMovies?.error ? `All movies loaded. ${myMovies.error}` : '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.dishesStatus = `Unable to load dishes. ${message}`;
    state.moviesStatus = `Unable to load movies. ${message}`;
  }

  render();
}

function currentSectionItems(kind) {
  const allItems = kind === 'dishes' ? state.dishes : state.movies;
  const myItems = kind === 'dishes' ? state.myDishes : state.myMovies;
  const randomItem = kind === 'dishes' ? state.randomDish : state.randomMovie;
  const view = kind === 'dishes' ? state.dishesView : state.moviesView;

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
    : [state.movies, state.myMovies, state.randomMovie ? [state.randomMovie] : []];

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

function getAddedByPhotoPath(item) {
  const byId = state.usersById.get(String(item?.AddedById || ''));
  const byName = state.usersByName.get(String(item?.AddedBy || '').toLowerCase());
  return extractPathValue(
    item?.AddedByPhoto || byId || byName || '',
  );
}

function renderUserIdentity(name) {
  const userPhotoUrl = resolveMediaUrl(state.userPhotoUrl);
  return `
    <span class="user-mini">
      ${userPhotoUrl
        ? `<img class="user-mini-photo" src="${escapeAttribute(userPhotoUrl)}" alt="${escapeAttribute(name)}" />`
        : `<span class="user-mini-photo user-mini-fallback">${escapeHtml(name.slice(0, 1).toUpperCase())}</span>`}
      <span>${escapeHtml(name)}</span>
    </span>
  `;
}

function pageTemplate(content) {
  return `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#/">FamilyApp</a>
        ${isSignedIn()
          ? `
            <nav>
              <ul class="nav-list">
                <li><a class="${state.route === '/dishes' ? 'active' : ''}" href="#/dishes">Dishes</a></li>
                <li><a class="${state.route === '/movies' ? 'active' : ''}" href="#/movies">Movies</a></li>
              </ul>
            </nav>
            <div class="topbar-actions">
              <button class="user-pill" type="button" data-edit-user-photo="true">${renderUserIdentity(state.name || 'User')}</button>
              <button class="button ghost" data-action="logout">Logout</button>
            </div>`
          : '<span class="muted">Sign in to browse your family lists.</span>'}
      </header>
      <main class="page-content">${content}</main>
    </div>
  `;
}

function renderHome() {
  if (isSignedIn()) {
    const userPhotoUrl = resolveMediaUrl(state.userPhotoUrl);
    const helloVideoUrl = resolveProtectedEndpointUrl('__hello_video__', `${API_BASE_URL}${endpoints.helloVideo}`);
    return pageTemplate(`
      <section class="panel auth-layout">
        <div>
          <span class="badge">Welcome back</span>
          <h1>Hi, ${escapeHtml(state.name || 'friend')}!</h1>
          <div class="welcome-media">
            <div class="profile-card profile-card-large">
              ${userPhotoUrl
                ? `<img class="profile-photo profile-photo-large" src="${escapeAttribute(userPhotoUrl)}" alt="${escapeAttribute(state.name || 'Logged user')}" />`
                : `<div class="profile-photo profile-photo-large profile-fallback">${escapeHtml((state.name || 'U').slice(0, 1).toUpperCase())}</div>`}
              <div>
                <strong>${escapeHtml(state.name || 'User')}</strong>
              </div>
            </div>
            ${helloVideoUrl
              ? `<video class="hello-video" src="${escapeAttribute(helloVideoUrl)}" controls autoplay muted loop playsinline>
                  Your browser does not support the hello video.
                </video>`
              : '<div class="empty-state">Loading hello video...</div>'}
          </div>
        </div>

        <section class="auth-card">
          <h2>Quick actions</h2>
          <div class="stack">
            <button class="button primary" type="button" data-go-route="/dishes">Open dishes</button>
            <button class="button ghost" type="button" data-go-route="/movies">Open movies</button>
          </div>
        </section>
      </section>
    `);
  }

  return pageTemplate(`
    <section class="panel auth-layout">
      <div>
        <span class="badge">FamilyApi access</span>
        <h1>${state.authMode === 'login' ? 'Login to FamilyApp' : 'Create your FamilyApp account'}</h1>
        <p class="muted">
          The home page is now dedicated to authentication. Dishes and movies are available only after login.
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
  const item = context ? findItemByKey(context.kind, context.itemKey) : null;

  if (!context || !item) {
    return pageTemplate(`
      <section class="panel">
        <span class="badge">Editor</span>
        <h1>Item editor unavailable</h1>
        <p class="muted">Select a dish or movie from the list first.</p>
        <button class="button primary" type="button" data-go-route="/dishes">Back to lists</button>
      </section>
    `);
  }

  const kindLabel = context.kind === 'dishes' ? 'Dish' : 'Movie';
  const image = resolveMediaUrl(context.photoDraft ?? item.Photo);
  const currentPhoto = context.photoDraft ?? item.Photo ?? '';
  const mediaMode = context.mediaMode || 'link';

  return pageTemplate(`
    <section class="panel auth-layout">
      <div class="stack">
        <span class="badge">${kindLabel} editor</span>
        <h1>Edit ${kindLabel.toLowerCase()}</h1>
        <p class="muted">Update the title first. To change the image, click the preview card or switch to upload mode.</p>
        <button class="thumb-shell thumb-button editor-preview" type="button" data-editor-photo-click="true">
          ${image ? `<img class="media-thumb" src="${escapeAttribute(image)}" alt="${escapeAttribute(item.Name || 'Preview')}" />` : '<div class="media-thumb placeholder-thumb">No image</div>'}
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
          ${context.status ? `<p class="message ${context.status.startsWith('Unable') ? 'error' : 'success'}">${escapeHtml(context.status)}</p>` : ''}
          <div class="row-actions">
            <button class="button primary" type="submit">Save changes</button>
            <button class="button danger" type="button" data-editor-delete="true">Delete item</button>
            <button class="button ghost" type="button" data-go-route="${context.kind === 'dishes' ? '/dishes' : '/movies'}">Cancel</button>
          </div>
        </form>
      </section>
    </section>
  `);
}

function renderProfilePage() {
  const photoPreview = resolveMediaUrl(state.userPhotoUrl);
  return pageTemplate(`
    <section class="panel auth-layout">
      <div class="stack">
        <span class="badge">User profile</span>
        <h1>Edit profile</h1>
        <button class="thumb-shell thumb-button editor-preview" type="button" data-profile-photo-click="true">
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
            <button class="button ghost" type="button" data-go-route="/">Back home</button>
          </div>
        </form>
      </section>
    </section>
  `);
}

function renderCollectionPage({ kind, title, badge, status, itemField, imageField, imageLabel, inputPlaceholder, imagePlaceholder }) {
  const view = kind === 'dishes' ? state.dishesView : state.moviesView;
  const showForm = kind === 'dishes' ? state.showDishForm : state.showMovieForm;
  const editingId = kind === 'dishes' ? state.editingDishId : state.editingMovieId;
  const mediaMode = kind === 'dishes' ? state.dishMediaMode : state.movieMediaMode;
  const items = currentSectionItems(kind);
  return pageTemplate(`
    <section class="panel collection-layout">
      <aside class="side-menu">
        <span class="badge">${badge}</span>
        <h2>${title}</h2>
        <button class="side-link ${view === 'all' ? 'active' : ''}" data-view-kind="${kind}" data-view="all">All</button>
        <button class="side-link ${view === 'mine' ? 'active' : ''}" data-view-kind="${kind}" data-view="mine">Only mine</button>
        <button class="side-link ${view === 'random' ? 'active' : ''}" data-view-kind="${kind}" data-view="random">Proposition</button>
      </aside>

      <div class="content-panel">
        <div class="list-toolbar">
          <div>
            <h3>${view === 'all' ? `All ${title.toLowerCase()}` : view === 'mine' ? `My ${title.toLowerCase()}` : `Random ${title.toLowerCase().slice(0, -1)}`}</h3>
          </div>
          <button class="icon-button" type="button" data-toggle-form="${kind}" aria-label="Add ${title.toLowerCase().slice(0, -1)}">+</button>
        </div>

        ${showForm ? `
          <form class="add-form" data-add-form="${kind}">
            <label>
              ${title === 'Dishes' ? 'Dish name' : 'Movie title'}
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

        ${renderMediaList({ kind, items, itemField, imageField, emptyText: title === 'Dishes' ? 'No dishes to display.' : 'No movies to display.' })}
      </div>
    </section>
  `);
}

function getEditingValue(kind, field) {
  const normalizedField = String(field || '').toLowerCase();
  const draft = kind === 'dishes' ? state.dishDraft : state.movieDraft;
  if (normalizedField === 'name' && draft.name) {
    return draft.name;
  }
  if (normalizedField === 'photo' && draft.photo) {
    return draft.photo;
  }

  const collection = getAllKnownItems(kind);
  const editingId = kind === 'dishes' ? state.editingDishId : state.editingMovieId;
  const item = collection.find((entry) => getItemId(entry) === editingId);
  return normalizedField === 'name' ? (item?.Name || '') : (item?.Photo || '');
}

function updateCollectionDraft(kind, field, value) {
  const target = kind === 'dishes' ? state.dishDraft : state.movieDraft;
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
      <span>Added by ${escapeHtml(name)}</span>
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
          return `
            <li class="media-row">
              <button class="thumb-shell thumb-button" type="button" data-edit-kind="${kind}" data-item-key="${escapeAttribute(itemKey)}" data-photo-edit="true">
                ${image ? `<img class="media-thumb" src="${escapeAttribute(image)}" alt="${escapeAttribute(title)}" />` : '<div class="media-thumb placeholder-thumb">No image</div>'}
              </button>
              <div class="media-copy">
                <strong>${escapeHtml(title)}</strong>
                ${addedBy}
                <div class="row-actions">
                  <button class="button secondary" type="button" data-edit-kind="${kind}" data-item-key="${escapeAttribute(itemKey)}">Edit</button>
                  <button class="button danger" type="button" data-delete-kind="${kind}" data-item-key="${escapeAttribute(itemKey)}">Delete</button>
                </div>
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

function render() {
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
      state.editingDishId = '';
      state.editingMovieId = '';
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
          state.randomDish = normalizeItem(normalizeSingleItem(await apiRequest(endpoints.randomDish).catch(() => state.randomDish)));
        }
      } else {
        state.moviesView = viewName || 'all';
        if (state.moviesView === 'random') {
          state.randomMovie = normalizeItem(normalizeSingleItem(await apiRequest(endpoints.randomMovie).catch(() => state.randomMovie)));
        }
      }
      render();
    });
  });

  document.querySelectorAll('[data-media-mode-kind]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.getAttribute('data-media-mode-kind');
      const mode = button.getAttribute('data-media-mode') || 'link';
      if (kind === 'dishes') {
        state.dishMediaMode = mode;
      } else {
        state.movieMediaMode = mode;
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
      } else {
        state.showMovieForm = !state.showMovieForm;
        state.editingMovieId = state.showMovieForm ? state.editingMovieId : '';
        if (!state.showMovieForm) {
          state.movieDraft = { name: '', photo: '' };
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
    });
  });

  const profilePasswordInput = document.querySelector('[data-profile-password]');
  if (profilePasswordInput) {
    profilePasswordInput.addEventListener('input', (event) => {
      state.profilePasswordDraft = event.target.value;
    });
  }

  const editorDeleteButton = document.querySelector('[data-editor-delete]');
  if (editorDeleteButton) {
    editorDeleteButton.addEventListener('click', async () => {
      if (!state.editorContext) {
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
  const { kind, itemKey } = state.editorContext;
  const item = findItemByKey(kind, itemKey);
  if (!item) {
    return;
  }

  const id = getItemId(item);
  const endpoint = `/${kind}/${id}`;
  const body = { name: primary, photo: image };

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
      body: JSON.stringify(body),
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

    const payload = { name, photo: photoPath };
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
    state.profilePasswordDraft = password;
    writeStorage('familyapp.name', name);
    writeStorage(`familyapp.userPhoto.${name}`, photoPath);
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

  const editingId = kind === 'dishes' ? state.editingDishId : state.editingMovieId;
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
      await apiRequest(`/${kind}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: primary, photo: photoPath }),
      });
    } else {
      await apiRequest(`/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ name: primary, photo: photoPath }),
      });
    }

    if (kind === 'dishes') {
      state.showDishForm = false;
      state.editingDishId = '';
      state.dishDraft = { name: '', photo: '' };
    } else {
      state.showMovieForm = false;
      state.editingMovieId = '';
      state.movieDraft = { name: '', photo: '' };
    }

    await refreshProtectedData();
    render();
  } catch (error) {
    state.apiStatus = `Unable to save ${kind === 'dishes' ? 'dish' : 'movie'}. ${error.message}`;
    render();
  }
}

function openEditorPage(kind, itemKey, isPhotoEdit) {
  const item = findItemByKey(kind, itemKey);
  if (!item) {
    return;
  }

  state.editorContext = {
    kind,
    itemKey,
    primaryDraft: item.Name,
    photoDraft: isPhotoEdit ? null : item.Photo,
    mediaMode: isPhotoEdit ? 'file' : null,
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttribute(text) {
  return escapeHtml(text).replace(/\'/g, '&#39;').replace(/\\/g, '&#92;').replace(/\`/g, '&#96;');
}

// Ensure data is loaded on page load if signed in
if (isSignedIn()) {
  refreshProtectedData();
}

render();
