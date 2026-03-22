export class DataMapper {
  static normalizeCollection(payload) {
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

  static extractPathValue(payload) {
    if (typeof payload === 'string') {
      return payload.trim();
    }

    if (!payload || typeof payload !== 'object') {
      return '';
    }

    return String(payload.Photo || payload.photo || payload.Path || '').trim();
  }

  static pickFirstString(payload, keys) {
    for (const key of keys) {
      const value = payload?.[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }
    return '';
  }

  static normalizeItem(payload) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const id = payload.id ?? payload.Id ?? '';
    const Name = this.pickFirstString(payload, ['Name', 'name', 'Title', 'title']);
    const Photo = this.extractPathValue(payload.Photo ?? payload.photo ?? payload.Image ?? payload.image ?? payload.FilePath);
    const AddedBy = this.pickFirstString(payload, ['AddedBy', 'addedBy', 'UserName', 'userName', 'CreatedBy']);
    const AddedById = this.pickFirstString(payload, ['AddedById', 'addedById', 'UserId', 'userId']);
    const AddedByPhoto = this.extractPathValue(
      payload.AddedByPhoto ?? payload.addedByPhoto ?? payload.UserPhoto ?? payload.userPhoto ?? payload.ProfilePhoto,
    );

    return {
      ...payload,
      id,
      Name,
      Photo,
      AddedBy,
      AddedById,
      AddedByPhoto,
    };
  }

  static normalizeItems(payload) {
    return this.normalizeCollection(payload).map((entry) => this.normalizeItem(entry)).filter(Boolean);
  }

  static normalizeUser(payload) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const Id = this.pickFirstString(payload, ['Id', 'id', 'UserId', 'userId']);
    const Name = this.pickFirstString(payload, ['Name', 'name', 'UserName', 'userName']);
    const Photo = this.extractPathValue(
      payload.Photo ?? payload.photo ?? payload.UserPhoto ?? payload.userPhoto ?? payload.ProfilePhoto ?? payload.profilePhoto,
    );
    const DarkModeRaw = payload.DarkMode ?? payload.darkMode ?? payload.ThemeMode ?? payload.themeMode;
    const darkModeNumber = Number(DarkModeRaw);
    const DarkMode = Number.isFinite(darkModeNumber) ? Math.max(0, Math.min(2, Math.round(darkModeNumber))) : 0;
    const Background = this.pickFirstString(payload, ['Background', 'background', 'ProfileBackground', 'profileBackground']);

    if (!Name && !Id) {
      return null;
    }

    return { Id, Name, Photo, DarkMode, Background };
  }

  static normalizeUsers(payload) {
    return this.normalizeCollection(payload).map((entry) => this.normalizeUser(entry)).filter(Boolean);
  }
}
