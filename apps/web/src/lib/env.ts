declare global {
  interface Window {
    __env__?: {
      PET_NAME?: string;
      SITE_NAME?: string;
    };
  }
}

export function getPetName(): string {
  const value = window.__env__?.PET_NAME || import.meta.env.VITE_PET_NAME;
  return value && value !== 'undefined' ? (value as string) : 'Pet';
}

export function getSiteName(): string {
  const value = window.__env__?.SITE_NAME || import.meta.env.VITE_SITE_NAME;
  return value && value !== 'undefined' ? (value as string) : 'ManlyCam';
}
