export const getErrorMessage = (t, error, fallbackKey = 'errors.SERVER_ERROR') => {
  const code = error?.code || 'SERVER_ERROR';

  if (code === 'FILE_TOO_LARGE') {
    const maxMb = error?.details?.max_mb || 20;
    return t('errors.FILE_TOO_LARGE', { maxMb });
  }

  const key = `errors.${code}`;
  const translated = t(key);
  if (translated !== key) {
    return translated;
  }

  return error?.message || t(fallbackKey);
};
