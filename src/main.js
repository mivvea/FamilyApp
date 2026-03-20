const API_BASE_URL = 'https://mivvea.runasp.net';
const endpoints = {
  login: '/User/login',
  register: '/User/register',
  dishes: '/Dishes',
  myDishes: '/Dishes/my',
  randomDish: '/Dishes/random',
  movies: '/Movies',
  myMovies: '/Movies/my',
  randomMovie: '/Movies/random',
};

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

const state = {
  route: window.location.hash.replace(/^#/, '') || '/',
  authMode: 'login',
  name: readStorage('familyapp.name'),
  authToken: readStorage('familyapp.authToken'),
  authStatus: '',
  apiStatus: '',
  userPhotoUrl: '',
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
};

const routes = {
  '/': renderHome,
  '/dishes': renderDishesPage,
  '/movies': renderMoviesPage,
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

function getHeaders(extraHeaders = {}) {
  return {
    'Content-Type': 'application/json',
    ...(state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}),
    ...extraHeaders,
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: getHeaders(options.headers),
    ...options,
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      (typeof data === 'object' && (data?.Message || data?.message || data?.title || data?.error)) ||
      (typeof data === 'string' && data) ||
      `HTTP ${response.status}`;
    throw new Error(message);
  }

  state.apiStatus = `Connected to ${path}`;
  return data;
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

function normalizeCollection(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.$values)) {
    return payload.$values;
  }

  return [];
}

function extractPathValue(payload) {
  if (typeof payload === 'string') {
    return payload.trim();
  }

  if (!payload || typeof payload !== 'object') {
    return '';
  }

  return String(
    payload.filePath ||
    payload.FilePath ||
    payload.path ||
    payload.Path ||
    payload.photo ||
    payload.Photo ||
    payload.url ||
    payload.Url ||
    '',
  ).trim();
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

  if (/^\/?File\/GetVideo$/i.test(path)) {
    return resolveProtectedEndpointUrl(path, `${API_BASE_URL}/${path.replace(/^\/+/, '')}`);
  }

  if (/^\/?File\//i.test(path)) {
    return resolveProtectedEndpointUrl(path, `${API_BASE_URL}/${path.replace(/^\/+/, '')}`);
  }

  return resolveProtectedEndpointUrl(path, `${API_BASE_URL}/File/${encodeURIComponent(path)}`);
}

async function hydrateWelcomeMedia() {
  if (!isSignedIn()) {
    state.userPhotoUrl = '';
    return;
  }

  const photoPayload = await apiRequest('/User/Photo').catch(() => null);
  state.userPhotoUrl = extractPathValue(photoPayload);
  render();
}

function normalizeSingleItem(payload) {
  if (!payload || Array.isArray(payload)) {
    return null;
  }

  return typeof payload === 'object' ? payload : null;
}

function getItemId(item) {
  return item?.id || item?.Id || item?._id || '';
}

async function refreshProtectedData() {
  if (!isSignedIn()) {
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
    const [dishes, myDishes, randomDish, movies, myMovies, randomMovie] = await Promise.all([
      apiRequest(endpoints.dishes),
      apiRequest(endpoints.myDishes).catch((error) => ({ error: error.message })),
      apiRequest(endpoints.randomDish).catch(() => null),
      apiRequest(endpoints.movies),
      apiRequest(endpoints.myMovies).catch((error) => ({ error: error.message })),
      apiRequest(endpoints.randomMovie).catch(() => null),
    ]);

    state.dishes = normalizeCollection(dishes);
    state.myDishes = normalizeCollection(myDishes);
    state.randomDish = normalizeSingleItem(randomDish);
    state.movies = normalizeCollection(movies);
    state.myMovies = normalizeCollection(myMovies);
    state.randomMovie = normalizeSingleItem(randomMovie);
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
              <span class="user-pill">${renderUserIdentity(state.name || 'User')}</span>
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
    const helloVideoUrl = resolveProtectedEndpointUrl('__hello_video__', `${API_BASE_URL}/File/GetVideo`);
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
                <p class="muted">Logged-in user profile</p>
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

function renderCollectionPage({ kind, title, badge, status, itemField, imageField, imageLabel, inputPlaceholder, imagePlaceholder }) {
  const view = kind === 'dishes' ? state.dishesView : state.moviesView;
  const showForm = kind === 'dishes' ? state.showDishForm : state.showMovieForm;
  const editingId = kind === 'dishes' ? state.editingDishId : state.editingMovieId;
  const mediaMode = kind === 'dishes' ? state.dishMediaMode : state.movieMediaMode;
  const items = currentSectionItems(kind);
  const ownItems = kind === 'dishes' ? state.myDishes : state.myMovies;

  return pageTemplate(`
    <section class="panel collection-layout">
      <aside class="side-menu">
        <span class="badge">${badge}</span>
        <h2>${title}</h2>
        <button class="side-link ${view === 'all' ? 'active' : ''}" data-view-kind="${kind}" data-view="all">All items</button>
        <button class="side-link ${view === 'mine' ? 'active' : ''}" data-view-kind="${kind}" data-view="mine">Only my items</button>
        <button class="side-link ${view === 'random' ? 'active' : ''}" data-view-kind="${kind}" data-view="random">Randomized</button>
        <p class="muted small-text">${escapeHtml(status || 'Choose a tab to browse the collection.')}</p>
        <p class="muted small-text">Editable items available: ${ownItems.length}</p>
      </aside>

      <div class="content-panel">
        <div class="list-toolbar">
          <div>
            <h3>${view === 'all' ? `All ${title.toLowerCase()}` : view === 'mine' ? `My ${title.toLowerCase()}` : `Random ${title.toLowerCase().slice(0, -1)}`}</h3>
            <p class="muted">All thumbnails use a fixed format and size.</p>
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
  const collection = kind === 'dishes' ? state.myDishes : state.myMovies;
  const editingId = kind === 'dishes' ? state.editingDishId : state.editingMovieId;
  const item = collection.find((entry) => getItemId(entry) === editingId);
  return item?.[field] || '';
}

function renderAddedBy(name) {
  const userPhotoUrl = resolveMediaUrl(state.userPhotoUrl);
  const isOwnUser = name === state.name && userPhotoUrl;
  return `
    <span class="meta-tag meta-user">
      ${isOwnUser
        ? `<img class="meta-avatar" src="${escapeAttribute(userPhotoUrl)}" alt="${escapeAttribute(name)}" />`
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
          const addedBy = item.addedBy ? renderAddedBy(item.addedBy) : '';
          const isOwnItem = item.addedBy && item.addedBy === state.name;
          const itemId = getItemId(item);
          return `
            <li class="media-row">
              <div class="thumb-shell">
                ${image ? `<img class="media-thumb" src="${escapeAttribute(image)}" alt="${escapeAttribute(title)}" />` : '<div class="media-thumb placeholder-thumb">No image</div>'}
              </div>
              <div class="media-copy">
                <strong>${escapeHtml(title)}</strong>
                ${addedBy}
                ${isOwnItem ? `
                  <div class="row-actions">
                    <button class="button secondary" type="button" data-edit-kind="${kind}" data-item-id="${escapeAttribute(itemId)}">Edit</button>
                    <button class="button danger" type="button" data-delete-kind="${kind}" data-item-id="${escapeAttribute(itemId)}">Delete</button>
                  </div>
                ` : ''}
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
    itemField: 'name',
    imageField: 'photo',
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
    itemField: 'name',
    imageField: 'photo',
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

  document.querySelectorAll('[data-view-kind]').forEach((button) => {
    button.addEventListener('click', async () => {
      const kind = button.getAttribute('data-view-kind');
      const viewName = button.getAttribute('data-view');
      if (kind === 'dishes') {
        state.dishesView = viewName || 'all';
        if (state.dishesView === 'random') {
          state.randomDish = normalizeSingleItem(await apiRequest(endpoints.randomDish).catch(() => state.randomDish));
        }
      } else {
        state.moviesView = viewName || 'all';
        if (state.moviesView === 'random') {
          state.randomMovie = normalizeSingleItem(await apiRequest(endpoints.randomMovie).catch(() => state.randomMovie));
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
      } else {
        state.showMovieForm = !state.showMovieForm;
        state.editingMovieId = state.showMovieForm ? state.editingMovieId : '';
      }
      render();
    });
  });

  document.querySelectorAll('[data-edit-kind]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.getAttribute('data-edit-kind');
      const itemId = button.getAttribute('data-item-id') || '';
      if (kind === 'dishes') {
        state.editingDishId = itemId;
        state.showDishForm = true;
        state.dishesView = 'mine';
        state.dishMediaMode = 'link';
      } else {
        state.editingMovieId = itemId;
        state.showMovieForm = true;
        state.moviesView = 'mine';
        state.movieMediaMode = 'link';
      }
      render();
    });
  });

  document.querySelectorAll('[data-delete-kind]').forEach((button) => {
    button.addEventListener('click', async () => {
      const kind = button.getAttribute('data-delete-kind');
      const itemId = button.getAttribute('data-item-id') || '';
      await handleDeleteItem(kind || '', itemId);
    });
  });

  document.querySelectorAll('[data-add-form]').forEach((form) => {
    form.addEventListener('submit', handleSaveItem);
  });
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
    const message = error instanceof Error ? error.message : String(error);
    state.authStatus = `Unable to authenticate. ${message}`;
    render();
  }
}

async function uploadFileToServer(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/File/upload`, {
    method: 'POST',
    headers: state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {},
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.Message || `HTTP ${response.status}`);
  }

  const filePath = extractPathValue(data);
  if (filePath) {
    return filePath;
  }

  const fileName = data?.fileName || data?.FileName;
  if (!fileName) {
    throw new Error('The upload endpoint did not return a file path.');
  }

  return `/File/${fileName}`;
}

async function handleSaveItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const kind = form.getAttribute('data-add-form');
  const formData = new FormData(form);
  const primary = String(formData.get('primary') || '').trim();

  if (!primary) {
    return;
  }

  const isDish = kind === 'dishes';
  const endpoint = isDish ? endpoints.dishes : endpoints.movies;
  const mediaMode = isDish ? state.dishMediaMode : state.movieMediaMode;
  const file = formData.get('imageFile');
  const image = mediaMode === 'file' && file instanceof File && file.size > 0
    ? await uploadFileToServer(file)
    : String(formData.get('image') || '').trim();
  const payload = isDish ? { name: primary, photo: image } : { name: primary, photo: image };
  const editingId = isDish ? state.editingDishId : state.editingMovieId;

  try {
    if (editingId) {
      await apiRequest(`${endpoint}/${editingId}`, { method: 'DELETE' });
    }

    await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (isDish) {
      state.showDishForm = false;
      state.editingDishId = '';
      state.dishesView = 'mine';
      state.dishesStatus = editingId ? 'Dish updated successfully.' : 'Dish added successfully.';
    } else {
      state.showMovieForm = false;
      state.editingMovieId = '';
      state.moviesView = 'mine';
      state.moviesStatus = editingId ? 'Movie updated successfully.' : 'Movie added successfully.';
    }

    await refreshProtectedData();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isDish) {
      state.dishesStatus = `Unable to save dish. ${message}`;
    } else {
      state.moviesStatus = `Unable to save movie. ${message}`;
    }
    render();
  }
}

async function handleDeleteItem(kind, itemId) {
  if (!itemId) {
    return;
  }

  const isDish = kind === 'dishes';
  const endpoint = isDish ? endpoints.dishes : endpoints.movies;

  try {
    await apiRequest(`${endpoint}/${itemId}`, { method: 'DELETE' });
    if (isDish) {
      state.dishesStatus = 'Dish deleted successfully.';
      if (state.editingDishId === itemId) {
        state.editingDishId = '';
        state.showDishForm = false;
      }
    } else {
      state.moviesStatus = 'Movie deleted successfully.';
      if (state.editingMovieId === itemId) {
        state.editingMovieId = '';
        state.showMovieForm = false;
      }
    }
    await refreshProtectedData();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isDish) {
      state.dishesStatus = `Unable to delete dish. ${message}`;
    } else {
      state.moviesStatus = `Unable to delete movie. ${message}`;
    }
    render();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function renderFatalError(message) {
  if (!app) {
    return;
  }

  app.innerHTML = `
    <div class="app-shell">
      <section class="panel">
        <span class="badge">Startup error</span>
        <h1>FamilyApp could not start</h1>
        <p class="message error">${escapeHtml(message)}</p>
      </section>
    </div>
  `;
}

function bootstrap() {
  if (!app) {
    throw new Error('The #app container is missing from index.html.');
  }

  refreshProtectedData();
  hydrateWelcomeMedia();
  render();
}

try {
  bootstrap();
} catch (error) {
  renderFatalError(error instanceof Error ? error.message : String(error));
}
