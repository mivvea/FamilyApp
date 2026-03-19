# FamilyApp

FamilyApp is a GitHub Pages frontend for the public FamilyApi backend.

## Stack
- HTML + CSS + Vanilla JavaScript
- Hash-based routing that works on GitHub Pages
- `fetch` for backend communication

## Build
1. `npm install`
2. `npm run build`

The build output is written to `dist/`.

## Deployment
The repository is configured for GitHub Pages through GitHub Actions. Make sure the repository setting is:
- **Settings → Pages → Source = GitHub Actions**

Default application URL:
- `https://mivvea.github.io/FamilyApp/`

## API integration
This frontend is aligned with the public `mivvea/FamilyApi` repository.

Supported backend functions in the UI:
- `POST /User/register`
- `POST /User/login`
- `GET /Dishes`
- `GET /Dishes/MyDishes`
- `POST /Dishes`
- `GET /Movies`
- `GET /Movies/MyMovies`
- `POST /Movies`

## UX changes
- The home page is now dedicated to login/register.
- Dishes and Movies navigation is shown only after login.
- Each collection page includes a left-side menu with `All items`, `Only my items`, and `Randomized` views.
- Items render as equal-sized media rows, and adding a new item is handled through a plus button next to the list.
