const API_BASE_URL = 'http://mivvea.runasp.net';
const endpoints = {
  login: '/User/login',
  register: '/User/register',
  dishes: '/Dishes',
  myDishes: '/Dishes/MyDishes',
  movies: '/Movies',
  myMovies: '/Movies/MyMovies',
};

const app = document.querySelector('#app');

const state = {
  route: window.location.hash.replace(/^#/, '') || '/',
  name: localStorage.getItem('familyapp.name') || '',
  authToken: localStorage.getItem('familyapp.authToken') || '',
  dishes: [],
  myDishes: [],
  movies: [],
  myMovies: [],
  dishesStatus: '',
  moviesStatus: '',
  authStatus: '',
  apiStatus: '',
};

const routes = {
  '/': renderHome,
  '/login': renderLogin,
  '/dishes': renderDishes,
  '/movies': renderMovies,
};

function isSignedIn() {
  return Boolean(state.authToken);
}

function setStatus(key, message) {
  state[key] = message;
  render();
}

function navigate(route) {
  window.location.hash = route;
}

window.addEventListener('hashchange', () => {
  state.route = window.location.hash.replace(/^#/, '') || '/';
  render();
});

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
    localStorage.setItem('familyapp.authToken', token);
    localStorage.setItem('familyapp.name', name || '');
  } else {
    localStorage.removeItem('familyapp.authToken');
    localStorage.removeItem('familyapp.name');
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
    state.dishesStatus = 'Sign in to load dishes.';
    state.moviesStatus = 'Sign in to load movies.';
    render();
    return;
  }

  setStatus('dishesStatus', 'Loading dishes...');
  setStatus('moviesStatus', 'Loading movies...');

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
    state.dishesStatus = myDishes?.error ? `All dishes loaded. My dishes: ${myDishes.error}` : '';
    state.moviesStatus = myMovies?.error ? `All movies loaded. My movies: ${myMovies.error}` : '';
  } catch (error) {
    state.dishesStatus = `Unable to load dishes. ${error.message}`;
    state.moviesStatus = `Unable to load movies. ${error.message}`;
  }

  render();
}

function pageTemplate(content) {
  return `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#/">FamilyApp</a>
        <nav>
          <ul class="nav-list">
            <li><a class="${state.route === '/' ? 'active' : ''}" href="#/">Home</a></li>
            <li><a class="${state.route === '/dishes' ? 'active' : ''}" href="#/dishes">Dishes</a></li>
            <li><a class="${state.route === '/movies' ? 'active' : ''}" href="#/movies">Movies</a></li>
            <li><a class="${state.route === '/login' ? 'active' : ''}" href="#/login">Login</a></li>
          </ul>
        </nav>
        ${isSignedIn() ? '<button class="button ghost" data-action="logout">Logout</button>' : ''}
      </header>
      <main class="page-content">${content}</main>
    </div>
  `;
}

function renderHome() {
  return pageTemplate(`
    <section class="panel hero">
      <span class="badge">FamilyApi connected</span>
      <h1>FamilyApp now matches the actual controller routes in FamilyApi.</h1>
      <p>
        The frontend uses <code>/User/login</code>, <code>/User/register</code>, <code>/Dishes</code>, <code>/Dishes/MyDishes</code>, <code>/Movies</code>, and <code>/Movies/MyMovies</code>.
      </p>
      <div class="status-row">
        <strong>Status:</strong>
        <span>${isSignedIn() ? `Signed in as ${state.name}` : 'Not signed in'}</span>
      </div>
      <div class="status-row diagnostic-row">
        <strong>API:</strong>
        <span>${state.apiStatus || 'Waiting for the first successful API request...'}</span>
      </div>
      <div class="cta-row">
        <a class="button primary" href="#/dishes">Open dishes</a>
        <a class="button secondary" href="#/movies">Open movies</a>
      </div>
    </section>
  `);
}

function renderLogin() {
  return pageTemplate(`
    <section class="panel auth-panel">
      <h2>Login or register</h2>
      <p class="muted">FamilyApi expects a JSON body with <code>name</code> and <code>password</code>.</p>
      <form class="stack" id="auth-form">
        <label>
          Name
          <input name="name" type="text" placeholder="Your name" value="${escapeAttribute(state.name)}" required />
        </label>
        <label>
          Password
          <input name="password" type="password" placeholder="Password" required />
        </label>
        <div class="cta-row">
          <button class="button primary" type="submit" name="mode" value="login">Login</button>
          <button class="button secondary" type="submit" name="mode" value="register">Register</button>
        </div>
      </form>
      ${state.authStatus ? `<p class="message ${state.authStatus.startsWith('Unable') ? 'error' : 'success'}">${state.authStatus}</p>` : ''}
    </section>
  `);
}

function renderCollectionPage({
  title,
  badge,
  items,
  myItems,
  status,
  itemField,
  imageField,
  itemPlaceholder,
  imagePlaceholder,
  action,
}) {
  return pageTemplate(`
    <section class="panel">
      <div class="section-heading">
        <div>
          <span class="badge">${badge}</span>
          <h2>${title}</h2>
        </div>
        <p class="muted">${isSignedIn() ? 'The backend requires a valid JWT for all list endpoints.' : 'Sign in first because these endpoints are protected by JWT auth.'}</p>
      </div>

      ${status ? `<p class="message ${status.startsWith('Unable') ? 'error' : 'loading'}">${status}</p>` : ''}

      <section class="subsection">
        <h3>All items</h3>
        ${renderCards(items, itemField, imageField, 'No items returned yet.')}
      </section>

      <section class="subsection">
        <h3>My items</h3>
        ${renderCards(myItems, itemField, imageField, 'No personal items returned yet.')}
      </section>

      <div class="stack compact">
        <label>
          ${title === 'Dishes' ? 'Dish name' : 'Movie title'}
          <input id="item-name" type="text" placeholder="${itemPlaceholder}" ${isSignedIn() ? '' : 'disabled'} />
        </label>
        <label>
          ${title === 'Dishes' ? 'Photo URL' : 'Poster URL'}
          <input id="item-image" type="url" placeholder="${imagePlaceholder}" ${isSignedIn() ? '' : 'disabled'} />
        </label>
        <button class="button primary" type="button" data-action="${action}" ${isSignedIn() ? '' : 'disabled'}>Add</button>
      </div>
    </section>
  `);
}

function renderCards(items, itemField, imageField, emptyText) {
  if (!items.length) {
    return `<ul class="card-list"><li class="card-item">${emptyText}</li></ul>`;
  }

  return `
    <ul class="card-list">
      ${items
        .map((item) => {
          const title = item[itemField] || 'Untitled';
          const image = item[imageField];
          const addedBy = item.addedBy ? `<p class="card-meta">Added by ${item.addedBy}</p>` : '';
          return `
            <li class="card-item media-card">
              ${image ? `<img class="media-thumb" src="${escapeAttribute(image)}" alt="${escapeAttribute(title)}" />` : ''}
              <div>
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

function renderDishes() {
  return renderCollectionPage({
    title: 'Dishes',
    badge: 'Family menu',
    items: state.dishes,
    myItems: state.myDishes,
    status: state.dishesStatus,
    itemField: 'name',
    imageField: 'photo',
    itemPlaceholder: 'Homemade pizza',
    imagePlaceholder: 'https://example.com/dish.jpg',
    action: 'add-dish',
  });
}

function renderMovies() {
  return renderCollectionPage({
    title: 'Movies',
    badge: 'Family cinema',
    items: state.movies,
    myItems: state.myMovies,
    status: state.moviesStatus,
    itemField: 'title',
    imageField: 'poster',
    itemPlaceholder: 'The Lord of the Rings',
    imagePlaceholder: 'https://example.com/poster.jpg',
    action: 'add-movie',
  });
}

function renderNotFound() {
  return pageTemplate(`
    <section class="panel">
      <h2>Page not found</h2>
      <p class="muted">This route does not exist. Use the button below to go back home.</p>
      <a class="button primary" href="#/">Back to home</a>
    </section>
  `);
}

function render() {
  const view = routes[state.route] || renderNotFound;
  app.innerHTML = view();

  const logoutButton = document.querySelector('[data-action="logout"]');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      persistSession('', '');
      state.authStatus = 'You have been signed out.';
      state.apiStatus = '';
      refreshProtectedData();
      navigate('/');
    });
  }

  const authForm = document.querySelector('#auth-form');
  if (authForm) {
    authForm.addEventListener('submit', handleAuthSubmit);
  }

  const addDishButton = document.querySelector('[data-action="add-dish"]');
  if (addDishButton) {
    addDishButton.addEventListener('click', () => handleCreateItem({
      endpoint: endpoints.dishes,
      payload: {
        name: document.querySelector('#item-name')?.value.trim(),
        photo: document.querySelector('#item-image')?.value.trim(),
      },
      successMessage: 'Dish added successfully.',
      statusKey: 'dishesStatus',
    }));
  }

  const addMovieButton = document.querySelector('[data-action="add-movie"]');
  if (addMovieButton) {
    addMovieButton.addEventListener('click', () => handleCreateItem({
      endpoint: endpoints.movies,
      payload: {
        title: document.querySelector('#item-name')?.value.trim(),
        poster: document.querySelector('#item-image')?.value.trim(),
      },
      successMessage: 'Movie added successfully.',
      statusKey: 'moviesStatus',
    }));
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const submitter = event.submitter;
  const formData = new FormData(event.currentTarget);
  const name = String(formData.get('name') || '').trim();
  const password = String(formData.get('password') || '').trim();

  try {
    if (submitter?.value === 'register') {
      await apiRequest(endpoints.register, {
        method: 'POST',
        body: JSON.stringify({ name, password }),
      });
      state.authStatus = 'Registration completed. You can now log in.';
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
    state.authStatus = 'Login successful. Protected endpoints are now available.';
    await refreshProtectedData();
    navigate('/');
  } catch (error) {
    state.authStatus = `Unable to authenticate. ${error.message}`;
    render();
  }
}

async function handleCreateItem({ endpoint, payload, successMessage, statusKey }) {
  const cleanedPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value));

  if (!Object.values(cleanedPayload)[0]) {
    setStatus(statusKey, 'Please fill in the main text field before sending the request.');
    return;
  }

  try {
    await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(cleanedPayload),
    });
    setStatus(statusKey, successMessage);
    await refreshProtectedData();
  } catch (error) {
    setStatus(statusKey, `Unable to save the item. ${error.message}`);
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

refreshProtectedData();
render();
