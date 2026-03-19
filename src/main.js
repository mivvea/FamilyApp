const API_BASE_URL = 'https://mivvea.runasp.net';
const endpoints = {
  login: '/User/login',
  register: '/User/register',
  dishes: '/Dishes',
  myDishes: '/Dishes/MyDishes',
  movies: '/Movies',
  myMovies: '/Movies/MyMovies',
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
  dishes: [],
  myDishes: [],
  movies: [],
  myMovies: [],
  dishesStatus: '',
  moviesStatus: '',
  dishesView: 'all',
  moviesView: 'all',
  showDishForm: false,
  showMovieForm: false,
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

async function refreshProtectedData() {
  if (!isSignedIn()) {
    state.dishes = [];
    state.myDishes = [];
    state.movies = [];
    state.myMovies = [];
    state.dishesStatus = '';
    state.moviesStatus = '';
    render();
    return;
  }

  state.dishesStatus = 'Loading dishes...';
  state.moviesStatus = 'Loading movies...';
  render();

  try {
    const [dishes, myDishes, movies, myMovies] = await Promise.all([
      apiRequest(endpoints.dishes),
      apiRequest(endpoints.myDishes).catch((error) => ({ error: error.message })),
      apiRequest(endpoints.movies),
      apiRequest(endpoints.myMovies).catch((error) => ({ error: error.message })),
    ]);

    state.dishes = normalizeCollection(dishes);
    state.myDishes = normalizeCollection(myDishes);
    state.movies = normalizeCollection(movies);
    state.myMovies = normalizeCollection(myMovies);
    state.dishesStatus = myDishes?.error ? `All dishes loaded. ${myDishes.error}` : '';
    state.moviesStatus = myMovies?.error ? `All movies loaded. ${myMovies.error}` : '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.dishesStatus = `Unable to load dishes. ${message}`;
    state.moviesStatus = `Unable to load movies. ${message}`;
  }

  render();
}

function pickRandom(items) {
  if (!items.length) {
    return [];
  }

  return [items[Math.floor(Math.random() * items.length)]];
}

function currentSectionItems(kind) {
  const allItems = kind === 'dishes' ? state.dishes : state.movies;
  const myItems = kind === 'dishes' ? state.myDishes : state.myMovies;
  const view = kind === 'dishes' ? state.dishesView : state.moviesView;

  if (view === 'mine') {
    return myItems;
  }

  if (view === 'random') {
    return pickRandom(allItems);
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
  const items = currentSectionItems(kind);

  return pageTemplate(`
    <section class="panel collection-layout">
      <aside class="side-menu">
        <span class="badge">${badge}</span>
        <h2>${title}</h2>
        <button class="side-link ${view === 'all' ? 'active' : ''}" data-view-kind="${kind}" data-view="all">All items</button>
        <button class="side-link ${view === 'mine' ? 'active' : ''}" data-view-kind="${kind}" data-view="mine">Only my items</button>
        <button class="side-link ${view === 'random' ? 'active' : ''}" data-view-kind="${kind}" data-view="random">Randomized</button>
        <p class="muted small-text">${escapeHtml(status || 'Choose a tab to browse the collection.')}</p>
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
              <input name="primary" type="text" placeholder="${inputPlaceholder}" required />
            </label>
            <label>
              ${imageLabel}
              <input name="image" type="url" placeholder="${imagePlaceholder}" />
            </label>
            <button class="button primary" type="submit">Save</button>
          </form>
        ` : ''}

        ${renderMediaList(items, itemField, imageField, title === 'Dishes' ? 'No dishes to display.' : 'No movies to display.')}
      </div>
    </section>
  `);
}

function renderMediaList(items, itemField, imageField, emptyText) {
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
          return `
            <li class="media-row">
              <div class="thumb-shell">
                ${image ? `<img class="media-thumb" src="${escapeAttribute(image)}" alt="${escapeAttribute(title)}" />` : '<div class="media-thumb placeholder-thumb">No image</div>'}
              </div>
              <div class="media-copy">
                <strong>${escapeHtml(title)}</strong>
                ${addedBy}
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
      await refreshProtectedData();
      navigate('/');
    });
  }

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
    button.addEventListener('click', () => {
      const kind = button.getAttribute('data-view-kind');
      const viewName = button.getAttribute('data-view');
      if (kind === 'dishes') {
        state.dishesView = viewName || 'all';
      } else {
        state.moviesView = viewName || 'all';
      }
      render();
    });
  });

  document.querySelectorAll('[data-toggle-form]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.getAttribute('data-toggle-form');
      if (kind === 'dishes') {
        state.showDishForm = !state.showDishForm;
      } else {
        state.showMovieForm = !state.showMovieForm;
      }
      render();
    });
  });

  document.querySelectorAll('[data-add-form]').forEach((form) => {
    form.addEventListener('submit', handleAddItem);
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
    navigate('/dishes');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.authStatus = `Unable to authenticate. ${message}`;
    render();
  }
}

async function handleAddItem(event) {
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

  try {
    await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (isDish) {
      state.showDishForm = false;
      state.dishesView = 'mine';
      state.dishesStatus = 'Dish added successfully.';
    } else {
      state.showMovieForm = false;
      state.moviesView = 'mine';
      state.moviesStatus = 'Movie added successfully.';
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
  render();
}

try {
  bootstrap();
} catch (error) {
  renderFatalError(error instanceof Error ? error.message : String(error));
}
