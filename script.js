const setValue = (id, value) => {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value ?? '—';
  }
};

const formatList = (list) => Array.isArray(list) ? list.join(', ') : String(list || 'Unknown');

const formatLocation = (data) => {
  if (!data) return 'Unavailable';
  const parts = [data.city, data.region, data.country_name || data.country];
  const filtered = parts.filter(Boolean);
  return filtered.length ? filtered.join(', ') : 'Unavailable';
};

const loadIpData = async () => {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) throw new Error('IP lookup failed');
    const data = await response.json();
    setValue('ip', data.ip || 'Unavailable');
    setValue('ip-location', `${formatLocation(data)}${data.postal ? ` ${data.postal}` : ''}`);
    setValue('asn', data.org || data.asn || 'Unavailable');
    setValue('hostname', data.hostname || 'Unavailable');
  } catch (error) {
    setValue('ip', 'Unavailable');
    setValue('ip-location', 'Unable to fetch IP-based location');
    setValue('asn', 'Unavailable');
    setValue('hostname', 'Unavailable');
  }
};

const loadBrowserData = async () => {
  const ua = navigator.userAgent;
  let uaBrands = '';

  if (navigator.userAgentData?.brands) {
    uaBrands = `\nBrands: ${navigator.userAgentData.brands.map((b) => `${b.brand} ${b.version}`).join(', ')}`;
  }

  setValue('user-agent', `${ua}${uaBrands}`.trim());

  let platform = navigator.platform || 'Unknown';

  if (navigator.userAgentData?.getHighEntropyValues) {
    try {
      const { architecture, bitness, platform: uaPlatform } = await navigator.userAgentData.getHighEntropyValues([
        'architecture',
        'bitness',
        'platform'
      ]);

      const platformParts = [uaPlatform || platform];
      if (architecture) platformParts.push(architecture);
      if (bitness) platformParts.push(`${bitness}-bit`);
      platform = platformParts.filter(Boolean).join(' ');
    } catch (_) {
      // Fall back to the classic platform string if high entropy hints are blocked
    }
  }

  setValue('platform', platform);
  setValue('languages', formatList(navigator.languages || navigator.language));
  setValue('dnt', navigator.doNotTrack === '1' ? 'Enabled' : 'Disabled or not reported');
  setValue('cookies', navigator.cookieEnabled ? 'Yes' : 'No');
  setValue('cores', navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} logical cores` : 'Unknown');
  setValue('memory', navigator.deviceMemory ? `${navigator.deviceMemory} GB (approx)` : 'Unknown');
  setValue('touch', `${navigator.maxTouchPoints || 0} touch points`);
  setValue('webdriver', navigator.webdriver ? 'Likely automated' : 'No');
};

const loadScreenData = () => {
  const { width, height, availWidth, availHeight, colorDepth } = window.screen;
  setValue('screen', `${width} x ${height} (available ${availWidth} x ${availHeight})`);
  setValue('viewport', `${window.innerWidth} x ${window.innerHeight}`);
  setValue('pixel-ratio', window.devicePixelRatio || 1);
  setValue('color-depth', `${colorDepth}-bit`);
};

const loadTimeData = () => {
  setValue('local-time', new Date().toLocaleString());
  setValue('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown');
  setValue('referrer', document.referrer || 'None');
  setValue('page-url', window.location.href);
};

const loadConnectionData = () => {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection) {
    const parts = [connection.effectiveType && `Type: ${connection.effectiveType}`,
      connection.downlink && `Downlink: ${connection.downlink}Mb/s`,
      connection.rtt && `RTT: ${connection.rtt}ms`,
      connection.saveData ? 'Data saver: On' : null];
    setValue('connection', parts.filter(Boolean).join(' \u2022 '));
  } else {
    setValue('connection', 'Not exposed');
  }
};

const loadBatteryData = async () => {
  if (!navigator.getBattery) {
    setValue('battery', 'Battery information not exposed');
    return;
  }

  try {
    const battery = await navigator.getBattery();
    const level = `${Math.round(battery.level * 100)}%`;
    const charging = battery.charging ? 'Charging' : 'Not charging';
    const parts = [level, charging];
    if (battery.chargingTime && battery.chargingTime !== Infinity) {
      parts.push(`Full in ${Math.round(battery.chargingTime / 60)} min`);
    }
    if (battery.dischargingTime && battery.dischargingTime !== Infinity) {
      parts.push(`Estimated ${Math.round(battery.dischargingTime / 60)} min remaining`);
    }
    setValue('battery', parts.join(' \u2022 '));
  } catch (error) {
    setValue('battery', 'Battery information blocked');
  }
};

const loadGeolocation = () => {
  if (!navigator.geolocation) {
    setValue('geo-status', 'Geolocation not supported');
    return;
  }

  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude, accuracy, altitude } = pos.coords;
    setValue('geo-status', `Location shared at ${new Date(pos.timestamp).toLocaleTimeString()}`);
    setValue('geo-coords', `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    setValue('geo-accuracy', `${Math.round(accuracy)} meters`);
    setValue('geo-altitude', altitude != null ? `${altitude.toFixed(2)} meters` : 'Not provided');
  }, (err) => {
    setValue('geo-status', `Denied or unavailable (${err.message})`);
  }, { enableHighAccuracy: true, timeout: 10000 });
};

const init = () => {
  loadIpData();
  loadBrowserData();
  loadScreenData();
  loadTimeData();
  loadConnectionData();
  loadBatteryData();
  loadGeolocation();
};

document.addEventListener('DOMContentLoaded', init);
