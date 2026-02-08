import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import it from './it.json';
import en from './en.json';

const supportedLanguages = ['it', 'en'];

const detectLanguage = () => {
  const stored = localStorage.getItem('flussio_lang');
  if (stored && supportedLanguages.includes(stored)) {
    return stored;
  }
  const browser = navigator.language?.split('-')[0];
  if (browser && supportedLanguages.includes(browser)) {
    return browser;
  }
  return 'it';
};

i18n.use(initReactI18next).init({
  resources: { it: { translation: it }, en: { translation: en } },
  lng: detectLanguage(),
  fallbackLng: 'it',
  interpolation: { escapeValue: false },
});

export const setLanguage = (lang) => {
  if (supportedLanguages.includes(lang)) {
    i18n.changeLanguage(lang);
    localStorage.setItem('flussio_lang', lang);
  }
};

export default i18n;
