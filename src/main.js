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

const helloVideoCandidates = [
  `${API_BASE_URL}/hello.mp4`,
  `${API_BASE_URL}/videos/hello.mp4`,
  `${API_BASE_URL}/media/hello.mp4`,
];

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
  helloVideoUrl: helloVideoCandidates[0],
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
  editingDishId: '',
  editingMovieId: '',
};

const routes = {
  '/': renderHome,
  '/dishes': renderDishesPage,
  '/movies': renderMoviesPage,
};

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

function buildUserPhotoCandidates(name) {
  const safeName = encodeURIComponent(name);
  return [
    `${API_BASE_URL}/users/${safeName}.jpg`,
    `${API_BASE_URL}/users/${safeName}.png`,
    `${API_BASE_URL}/photos/${safeName}.jpg`,
    `${API_BASE_URL}/photos/${safeName}.png`,
    `${API_BASE_URL}/profile/${safeName}.jpg`,
    `${API_BASE_URL}/profile/${safeName}.png`,
    `${API_BASE_URL}/avatars/${safeName}.jpg`,
    `${API_BASE_URL}/avatars/${safeName}.png`,
  ];
}

function preloadMedia(urls, kind) {
  return new Promise((resolve) => {
    if (!urls.length) {
      resolve('');
      return;
    }

    const [current, ...rest] = urls;
    if (kind === 'image') {
      const image = new Image();
      image.onload = () => resolve(current);
      image.onerror = () => resolve(preloadMedia(rest, kind));
      image.src = current;
      return;
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadeddata = () => resolve(current);
    video.onerror = () => resolve(preloadMedia(rest, kind));
    video.src = current;
  });
}

async function hydrateWelcomeMedia() {
  if (!isSignedIn()) {
    state.userPhotoUrl = '';
    return;
  }

  const [photoUrl, videoUrl] = await Promise.all([
    preloadMedia(buildUserPhotoCandidates(state.name), 'image'),
    preloadMedia(helloVideoCandidates, 'video'),
  ]);

  state.userPhotoUrl = photoUrl || '';
  state.helloVideoUrl = videoUrl || helloVideoCandidates[0];
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
              <span class="user-pill">${escapeHtml(state.name || 'User')}</span>
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
    return pageTemplate(`
      <section class="panel auth-layout">
        <div>
          <span class="badge">Welcome back</span>
          <h1>Hi, ${escapeHtml(state.name || 'friend')}!</h1>
          <p class="muted">Use the dishes and movies tabs to manage all items, only your items, and a randomized pick from the API.</p>
          <p class="muted">API status: ${escapeHtml(state.apiStatus || 'Ready')}</p>
          <div class="welcome-media">
            <div class="profile-card">
              ${state.userPhotoUrl
                ? `<img class="profile-photo" src="${escapeAttribute(state.userPhotoUrl)}" alt="${escapeAttribute(state.name || 'Logged user')}" />`
                : `<div class="profile-photo profile-fallback">${escapeHtml((state.name || 'U').slice(0, 1).toUpperCase())}</div>`}
              <div>
                <strong>${escapeHtml(state.name || 'User')}</strong>
                <p class="muted">Logged-in user profile</p>
              </div>
            </div>
            <video class="hello-video" src="${escapeAttribute(state.helloVideoUrl)}" controls autoplay muted loop playsinline></video>
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
            <label>
              ${imageLabel}
              <input name="image" type="url" placeholder="${imagePlaceholder}" value="${escapeAttribute(getEditingValue(kind, imageField))}" />
            </label>
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

function renderMediaList({ kind, items, itemField, imageField, emptyText }) {
  if (!items.length) {
    return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
  }

  return `
    <ul class="media-list">
      ${items
        .map((item) => {
          const title = item[itemField] || 'Untitled';
          const image = item[imageField];
          const addedBy = item.addedBy ? `<span class="meta-tag">Added by ${escapeHtml(item.addedBy)}</span>` : '';
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
    itemField: 'title',
    imageField: 'poster',
    imageLabel: 'Poster URL',
    inputPlaceholder: 'The Lord of the Rings',
    imagePlaceholder: 'https://example.com/poster.jpg',
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
      } else {
        state.editingMovieId = itemId;
        state.showMovieForm = true;
        state.moviesView = 'mine';
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

async function handleSaveItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const kind = form.getAttribute('data-add-form');
  const formData = new FormData(form);
  const primary = String(formData.get('primary') || '').trim();
  const image = String(formData.get('image') || '').trim();

  if (!primary) {
    return;
  }

  const isDish = kind === 'dishes';
  const endpoint = isDish ? endpoints.dishes : endpoints.movies;
  const payload = isDish ? { name: primary, photo: image } : { title: primary, poster: image };
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
