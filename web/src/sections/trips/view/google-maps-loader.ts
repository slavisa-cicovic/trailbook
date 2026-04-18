"use client";

type GoogleWindow = Window & {
  __trailbookGoogleMapsPromise?: Promise<unknown>;
  google?: {
    maps: any;
  };
};

export function loadGoogleMaps() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return Promise.reject(new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY."));
  }

  const googleWindow = window as GoogleWindow;

  if (googleWindow.google?.maps) {
    return Promise.resolve(googleWindow.google.maps);
  }

  if (googleWindow.__trailbookGoogleMapsPromise) {
    return googleWindow.__trailbookGoogleMapsPromise;
  }

  googleWindow.__trailbookGoogleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-trailbook-google-maps="true"]');

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(googleWindow.google?.maps));
      existingScript.addEventListener("error", () => reject(new Error("Unable to load Google Maps script.")));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.defer = true;
    script.dataset.trailbookGoogleMaps = "true";
    script.onload = () => resolve(googleWindow.google?.maps);
    script.onerror = () => reject(new Error("Unable to load Google Maps script."));
    document.head.appendChild(script);
  });

  return googleWindow.__trailbookGoogleMapsPromise;
}
