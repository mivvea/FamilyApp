# FamilyApp

FamilyApp is a GitHub Pages frontend for the public FamilyApi backend.?

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

It uses these controller routes:
- `POST /User/register`
- `POST /User/login`
- `GET /Dishes`
- `GET /Dishes/MyDishes`
- `POST /Dishes`
- `GET /Movies`
- `GET /Movies/MyMovies`
- `POST /Movies`

The auth payload is:
```json
{
  "name": "your-name",
  "password": "your-password"
}
```

The app stores the returned JWT token in `localStorage` and sends it as a Bearer token for protected endpoints.
