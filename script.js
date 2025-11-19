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
  const start = performance.now();
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
  } finally {
    return Math.round(performance.now() - start);
  }
};

const measureLatency = async () => {
  const button = document.getElementById('latency-refresh');
  if (button) button.disabled = true;
  setValue('latency', 'Measuring…');
  const url = window.location.href.split('#')[0];
  const target = `${url}${url.includes('?') ? '&' : '?'}ping=${Date.now()}`;
  const start = performance.now();

  try {
    await fetch(target, { method: 'GET', cache: 'no-store', mode: 'cors' });
    const duration = Math.round(performance.now() - start);
    setValue('latency', `${duration} ms (page fetch)`);
  } catch (error) {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.rtt) {
      setValue('latency', `Estimated ${connection.rtt} ms (network API)`);
    } else {
      setValue('latency', 'Unable to measure (blocked by network or CORS)');
    }
  }

  if (button) button.disabled = false;
};

const runWebRTCTest = async () => {
  if (!window.RTCPeerConnection) {
    setValue('webrtc-ip', 'WebRTC not supported in this browser');
    return;
  }

  setValue('webrtc-ip', 'Gathering ICE candidates…');

  const ips = new Set();
  let resolved = false;

  const done = (message) => {
    if (resolved) return;
    resolved = true;
    setValue('webrtc-ip', message);
  };

  try {
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel('whoami-local');

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        if (ips.size === 0) {
          done('No local IPs exposed via WebRTC');
        } else {
          done(`Local IPs: ${Array.from(ips).join(', ')}`);
        }
        pc.close();
        return;
      }

      const parts = event.candidate.candidate.split(' ');
      const ip = parts[4];
      if (ip) {
        ips.add(ip);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    setTimeout(() => {
      if (resolved) return;
      pc.close();
      done(ips.size ? `Local IPs: ${Array.from(ips).join(', ')}` : 'Timed out without revealing local IPs');
    }, 5000);
  } catch (error) {
    done('WebRTC test failed or was blocked');
  }
};

const setupWebRTCTest = () => {
  const button = document.getElementById('webrtc-run');
  if (!button) return;

  if (!window.RTCPeerConnection) {
    setValue('webrtc-ip', 'WebRTC not supported in this browser');
    button.disabled = true;
    return;
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = 'Testing…';
    await runWebRTCTest();
    button.disabled = false;
    button.textContent = originalText;
  });
};

const setupLatencyRefresh = () => {
  const button = document.getElementById('latency-refresh');
  if (!button) return;
  button.addEventListener('click', () => measureLatency());
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

const getCookie = (name) => {
  const match = document.cookie.match(new RegExp(`(^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
};

const setCookie = (name, value, maxAgeSeconds) => {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=Lax`;
};

const loadVisitData = () => {
  if (!navigator.cookieEnabled) {
    setValue('visit-count', 'Cookies disabled');
    setValue('last-visit', 'Cookies disabled');
    return;
  }

  const COOKIE_NAME = 'whoami_visit';
  const MAX_AGE = 60 * 60 * 24 * 365; // one year
  const existing = getCookie(COOKIE_NAME);
  const now = new Date();

  try {
    const parsed = existing ? JSON.parse(existing) : { count: 0, last: null };
    const nextData = { count: parsed.count + 1, last: now.toISOString() };
    setCookie(COOKIE_NAME, JSON.stringify(nextData), MAX_AGE);

    setValue('visit-count', `${nextData.count} time${nextData.count === 1 ? '' : 's'}`);
    setValue('last-visit', parsed.last ? new Date(parsed.last).toLocaleString() : 'This is your first visit');
  } catch (error) {
    setValue('visit-count', 'Unable to read visit data');
    setValue('last-visit', 'Try reloading the page');
  }
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

const updatePerformanceData = (renderTime, ipLookupDuration) => {
  const parts = [`Render ready in ${renderTime} ms`];
  if (typeof ipLookupDuration === 'number' && !Number.isNaN(ipLookupDuration)) {
    parts.push(`IP lookup in ${ipLookupDuration} ms`);
  }
  setValue('performance', parts.join(' • '));
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

const init = async () => {
  const renderTime = Math.round(performance.now());
  const ipLookup = loadIpData();
  await loadBrowserData();
  loadScreenData();
  loadTimeData();
  loadVisitData();
  loadConnectionData();
  loadBatteryData();
  loadGeolocation();
  measureLatency();
  setupLatencyRefresh();
  setupWebRTCTest();

  const ipDuration = await ipLookup;
  updatePerformanceData(renderTime, ipDuration);
};

document.addEventListener('DOMContentLoaded', init);
