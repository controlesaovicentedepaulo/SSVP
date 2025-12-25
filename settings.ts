import { AppSettings } from './types';

const SETTINGS_KEY = 'ssvp_settings_v1';

const INITIAL_SETTINGS: AppSettings = {
  supabaseUrl: '',
  supabaseKey: ''
};

export const getSettings = (): AppSettings => {
  const data = localStorage.getItem(SETTINGS_KEY);
  return data ? JSON.parse(data) : INITIAL_SETTINGS;
};

export const saveSettings = (settings: AppSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};





