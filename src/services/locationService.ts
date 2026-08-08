/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LocationData {
  ip: string;
  city: string;
  region: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  postal?: string;
  timeZone?: string;
  isp?: string;
  source: 'ip_sensing' | 'gps' | 'fallback';
}

const STORAGE_KEY_LOCATION = 'relay_cached_location_v1';

class LocationService {
  private currentLocation: LocationData | null = null;
  private listeners: Array<(location: LocationData) => void> = [];

  constructor() {
    this.loadFromCache();
  }

  private loadFromCache() {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_LOCATION);
      if (cached) {
        this.currentLocation = JSON.parse(cached);
      }
    } catch {
      // Ignore
    }
  }

  private saveToCache(data: LocationData) {
    this.currentLocation = data;
    try {
      localStorage.setItem(STORAGE_KEY_LOCATION, JSON.stringify(data));
      this.listeners.forEach((fn) => fn(data));
    } catch {
      // Ignore
    }
  }

  public subscribe(listener: (location: LocationData) => void) {
    this.listeners.push(listener);
    if (this.currentLocation) {
      listener(this.currentLocation);
    }
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public getLocation(): LocationData | null {
    return this.currentLocation;
  }

  public async fetchLocationByIP(): Promise<LocationData> {
    try {
      // Primary IP sensing service
      const res = await fetch('https://ipapi.co/json/', { credentials: 'omit' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ip) {
          const loc: LocationData = {
            ip: data.ip,
            city: data.city || 'Unknown City',
            region: data.region || 'Unknown Region',
            country: data.country_name || 'Unknown Country',
            countryCode: data.country_code || 'US',
            latitude: data.latitude || 0,
            longitude: data.longitude || 0,
            postal: data.postal,
            timeZone: data.timezone,
            isp: data.org || data.asn,
            source: 'ip_sensing',
          };
          this.saveToCache(loc);
          return loc;
        }
      }
    } catch (err) {
      // Backup IP sensing API
      try {
        const backupRes = await fetch('https://ip-api.com/json/?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,query', { credentials: 'omit' });
        if (backupRes.ok) {
          const data = await backupRes.json();
          if (data && data.status === 'success') {
            const loc: LocationData = {
              ip: data.query,
              city: data.city || 'Unknown City',
              region: data.regionName || 'Unknown Region',
              country: data.country || 'Unknown Country',
              countryCode: data.countryCode || 'US',
              latitude: data.lat || 0,
              longitude: data.lon || 0,
              postal: data.zip,
              timeZone: data.timezone,
              isp: data.isp,
              source: 'ip_sensing',
            };
            this.saveToCache(loc);
            return loc;
          }
        }
      } catch {
        // Fallthrough
      }
    }

    // Default fallback
    const fallbackLoc: LocationData = {
      ip: '127.0.0.1',
      city: 'Local Area',
      region: 'Current Region',
      country: 'Global',
      countryCode: 'US',
      latitude: 37.7749,
      longitude: -122.4194,
      source: 'fallback',
    };
    this.saveToCache(fallbackLoc);
    return fallbackLoc;
  }

  public async fetchGPSLocation(): Promise<LocationData | null> {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          // Reverse lookup or IP merge
          const ipLoc = this.currentLocation || await this.fetchLocationByIP();
          const gpsLoc: LocationData = {
            ...ipLoc,
            latitude,
            longitude,
            source: 'gps',
          };
          this.saveToCache(gpsLoc);
          resolve(gpsLoc);
        },
        () => resolve(null),
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  }
}

export const locationService = new LocationService();
