## Stack
- HTML + CSS + Vanilla JavaScript
- ES modules with lightweight service classes
- Hash-based routing that works on GitHub Pages
- `fetch` for backend communication
Default application URL:
- `https://mivvea.github.io/FamilyApp/`

## API integration
This frontend is aligned with the public `mivvea/FamilyApi` repository.

Supported backend functions in the UI:
- `POST /User/register`
- `POST /User/login`
- `PUT /User/edit`
- `GET /File/{filePath}`
- `GET /File/GetVideo`
- `POST /File/upload`
- `GET /Dishes`
- `GET /Dishes/my`
- `GET /Dishes/random`
- `POST /Dishes`
- `DELETE /Dishes/{id}`
- `GET /Movies`
- `GET /Movies/my`
- `GET /Movies/random`
- `POST /Movies`
- `DELETE /Movies/{id}`
- `GET /User/list`

## Code structure
- `src/main.js`: UI rendering, event binding, and page-level state transitions.
- `src/constants.js`: API base URL + endpoint constants.
- `src/services/api-service.js`: `ApiService` class for authenticated HTTP requests and unified error handling.
- `src/services/data-mapper.js`: `DataMapper` class for normalizing API payloads into stable fields used by the UI.

## Notes
- The home page greets logged-in users with `Hi, user!`, renders the locally stored user-photo path through `FileController`, and shows the hello video from `/File/GetVideo`.
- The top bar shows the logged-in user photo, clicking that top-right profile control opens a same-window profile editor page, and `addedBy` renders an avatar for every item when the backend provides one.
- Item create/edit forms now support both a direct link and a local file upload. Local files are uploaded to `/File/upload`, and the returned file path is what gets stored in the item payload.
- Stored file paths are rendered through the authorized `GET /File/{filePath}` endpoint, so the frontend fetches protected files with the JWT token and displays them via browser blob URLs.
- `User/list` is used to resolve avatars for all `AddedBy` users (name or id based), not only the currently logged-in user.
- The app now uses the current lowercase `/my` routes from `FamilyApi`.
- Item editing opens on a dedicated same-window editor page, and clicking the item thumbnail there is the default way to change the photo.
- Edit and delete actions are shown for all listed items.
