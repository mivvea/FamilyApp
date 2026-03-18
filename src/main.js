const API_BASE_URL = 'https://mivvea.runasp.net/api';
const app = document.querySelector('#app');

const state = {
  route: window.location.hash.replace(/^#/, '') || '/',
  isLoggedIn: false,
  username: '',
  dishes: [],
  movies: [],
  dishesStatus: '',
  moviesStatus: '',
  authStatus: '',
};

const routes = {
  '/': renderHome,
  '/login': renderLogin,
  '/dishes': renderDishes,
  '/movies': renderMovies,
};

function navigate(route) {
  window.location.hash = route;
}

window.addEventListener('hashchange', () => {
  state.route = window.location.hash.replace(/^#/, '') || '/';
  render();
});

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function loadDishes() {
  state.dishesStatus = 'Ładowanie dań...';
  render();
  try {
    const dishes = await apiRequest('/dishes');
    state.dishes = Array.isArray(dishes) ? dishes : [];
    state.dishesStatus = '';
  } catch (error) {
    state.dishesStatus = `Błąd pobierania dań: ${error.message}`;
  }
  render();
}

async function loadMovies() {
  state.moviesStatus = 'Ładowanie filmów...';
  render();
  try {
    const movies = await apiRequest('/movies');
    state.movies = Array.isArray(movies) ? movies : [];
    state.moviesStatus = '';
  } catch (error) {
    state.moviesStatus = `Błąd pobierania filmów: ${error.message}`;
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
        ${state.isLoggedIn ? '<button class="button ghost" data-action="logout">Logout</button>' : ''}
      </header>
      <main class="page-content">${content}</main>
    </div>
  `;
}

function renderHome() {
  return pageTemplate(`
    <section class="panel hero">
      <span class="badge">GitHub Pages ready</span>
      <h1>FamilyApp działa jako statyczny frontend dla FamilyApi.</h1>
      <p>
        Aplikacja używa hash routingu, więc działa poprawnie na GitHub Pages bez dodatkowej konfiguracji serwera.
      </p>
      <div class="status-row">
        <strong>Status:</strong>
        <span>${state.isLoggedIn ? `Zalogowano jako ${state.username}` : 'Niezalogowany użytkownik'}</span>
      </div>
      <div class="cta-row">
        <a class="button primary" href="#/dishes">Przejdź do dań</a>
        <a class="button secondary" href="#/movies">Przejdź do filmów</a>
      </div>
    </section>
  `);
}

function renderLogin() {
  return pageTemplate(`
    <section class="panel auth-panel">
      <h2>Logowanie lub rejestracja</h2>
      <p class="muted">Tryb GitHub Pages nie potrzebuje serwerowego routingu — wszystko działa w jednej statycznej aplikacji.</p>
      <form class="stack" id="auth-form">
        <label>
          Login
          <input name="username" type="text" placeholder="Username" required />
        </label>
        <label>
          Hasło
          <input name="password" type="password" placeholder="Password" required />
        </label>
        <div class="cta-row">
          <button class="button primary" type="submit" name="mode" value="login">Zaloguj</button>
          <button class="button secondary" type="submit" name="mode" value="register">Zarejestruj</button>
        </div>
      </form>
      ${state.authStatus ? `<p class="message ${state.authStatus.startsWith('Błąd') ? 'error' : 'success'}">${state.authStatus}</p>` : ''}
    </section>
  `);
}

function renderCollectionPage(title, badge, items, status, inputPlaceholder, actionName) {
  return pageTemplate(`
    <section class="panel">
      <div class="section-heading">
        <div>
          <span class="badge">${badge}</span>
          <h2>${title}</h2>
        </div>
        <p class="muted">${state.isLoggedIn ? 'Możesz dodawać nowe pozycje.' : 'Zaloguj się, aby dodawać nowe pozycje.'}</p>
      </div>

      ${status ? `<p class="message ${status.startsWith('Błąd') ? 'error' : 'loading'}">${status}</p>` : ''}

      <ul class="card-list">
        ${items.map((item) => `<li class="card-item">${item.name}</li>`).join('') || '<li class="card-item">Brak danych.</li>'}
      </ul>

      <div class="inline-form">
        <input id="new-item-name" type="text" placeholder="${inputPlaceholder}" ${state.isLoggedIn ? '' : 'disabled'} />
        <button class="button primary" type="button" data-action="${actionName}" ${state.isLoggedIn ? '' : 'disabled'}>Dodaj</button>
      </div>
    </section>
  `);
}

function renderDishes() {
  return renderCollectionPage('Dania', 'Family menu', state.dishes, state.dishesStatus, 'Nowe danie', 'add-dish');
}

function renderMovies() {
  return renderCollectionPage('Filmy', 'Family cinema', state.movies, state.moviesStatus, 'Nowy film', 'add-movie');
}

function renderNotFound() {
  return pageTemplate(`
    <section class="panel">
      <h2>Nie znaleziono strony</h2>
      <p class="muted">Ta trasa nie istnieje. Wróć na stronę główną.</p>
      <a class="button primary" href="#/">Wróć do Home</a>
    </section>
  `);
}

function render() {
  const view = routes[state.route] || renderNotFound;
  app.innerHTML = view();

  const logoutButton = document.querySelector('[data-action="logout"]');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      state.isLoggedIn = false;
      state.username = '';
      state.authStatus = 'Wylogowano.';
      navigate('/');
    });
  }

  const authForm = document.querySelector('#auth-form');
  if (authForm) {
    authForm.addEventListener('submit', handleAuthSubmit);
  }

  const addDishButton = document.querySelector('[data-action="add-dish"]');
  if (addDishButton) {
    addDishButton.addEventListener('click', () => handleAddItem('/dishes', 'dishes', 'dishesStatus', 'Dodano nowe danie.'));
  }

  const addMovieButton = document.querySelector('[data-action="add-movie"]');
  if (addMovieButton) {
    addMovieButton.addEventListener('click', () => handleAddItem('/movies', 'movies', 'moviesStatus', 'Dodano nowy film.'));
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const submitter = event.submitter;
  const formData = new FormData(event.currentTarget);
  const username = formData.get('username');
  const password = formData.get('password');

  try {
    if (submitter?.value === 'register') {
      await apiRequest('/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      state.authStatus = 'Konto utworzone. Możesz się zalogować.';
      render();
      return;
    }

    await apiRequest('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    state.isLoggedIn = true;
    state.username = username;
    state.authStatus = 'Zalogowano poprawnie.';
    navigate('/');
  } catch (error) {
    state.authStatus = `Błąd autoryzacji: ${error.message}`;
    render();
  }
}

async function handleAddItem(path, collectionKey, statusKey, successMessage) {
  const input = document.querySelector('#new-item-name');
  const value = input?.value.trim();

  if (!value) {
    return;
  }

  try {
    const createdItem = await apiRequest(path, {
      method: 'POST',
      body: JSON.stringify({ name: value }),
    });
    state[collectionKey] = [...state[collectionKey], createdItem?.name ? createdItem : { name: value }];
    state[statusKey] = successMessage;
    render();
  } catch (error) {
    state[statusKey] = `Błąd zapisu: ${error.message}`;
    render();
  }
}

loadDishes();
loadMovies();
render();
