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

const sha256 = async (message) => {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
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

const detectBrowserName = () => {
  const brands = navigator.userAgentData?.brands || [];
  const real = brands.filter((b) => !/Not.?A.?Brand/i.test(b.brand));
  const specific = real.find((b) => b.brand !== 'Chromium');
  if (specific) return `${specific.brand} ${specific.version}`;
  if (real[0]) return `${real[0].brand} ${real[0].version}`;

  const ua = navigator.userAgent;
  let m;
  if ((m = ua.match(/Firefox\/(\d+(?:\.\d+)?)/))) return `Firefox ${m[1]}`;
  if ((m = ua.match(/Edg\/(\d+(?:\.\d+)?)/))) return `Microsoft Edge ${m[1]}`;
  if (/Safari/.test(ua) && !/Chrome|Chromium/.test(ua)) {
    if ((m = ua.match(/Version\/(\d+(?:\.\d+)?)/))) return `Safari ${m[1]}`;
    return 'Safari (version unknown)';
  }
  if ((m = ua.match(/Chrome\/(\d+(?:\.\d+)?)/))) return `Chromium-based ${m[1]}`;
  return 'Unknown';
};

const loadBrowserData = async () => {
  const ua = navigator.userAgent;
  let uaBrands = '';

  if (navigator.userAgentData?.brands) {
    uaBrands = `\nBrands: ${navigator.userAgentData.brands.map((b) => `${b.brand} ${b.version}`).join(', ')}`;
  }

  setValue('browser-name', detectBrowserName());
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

const loadCanvasFingerprint = async () => {
  try {
    const canvas = document.getElementById('canvas-fp');
    if (!canvas) return 'unsupported';
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, 200, 40);
    ctx.fillStyle = '#e04040';
    ctx.font = '14px Arial';
    ctx.fillText('whoami canvas 🚀', 2, 15);
    ctx.fillStyle = 'rgba(0,80,200,0.7)';
    ctx.beginPath();
    ctx.arc(170, 20, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#30d050';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 30);
    ctx.bezierCurveTo(80, 5, 120, 35, 150, 10);
    ctx.stroke();
    const dataUrl = canvas.toDataURL();
    const hash = await sha256(dataUrl);
    setValue('canvas-hash', hash.slice(0, 16) + '…');
    return hash;
  } catch (e) {
    setValue('canvas-hash', 'Blocked or unsupported');
    return 'blocked';
  }
};

const loadWebGLFingerprint = async () => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      setValue('webgl-info', 'WebGL not supported');
      return 'unsupported';
    }
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown';
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown';
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    const extensions = gl.getSupportedExtensions() || [];
    const summary = `${vendor} — ${renderer}\nMax texture: ${maxTexture}, Max viewport: ${maxViewport[0]}x${maxViewport[1]}\n${extensions.length} extensions supported`;
    setValue('webgl-info', summary);
    const raw = `${vendor}|${renderer}|${maxTexture}|${extensions.join(',')}`;
    return await sha256(raw);
  } catch (e) {
    setValue('webgl-info', 'Blocked or unsupported');
    return 'blocked';
  }
};

const loadAudioFingerprint = async () => {
  try {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(10000, ctx.currentTime);
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, ctx.currentTime);
    compressor.knee.setValueAtTime(40, ctx.currentTime);
    compressor.ratio.setValueAtTime(12, ctx.currentTime);
    compressor.attack.setValueAtTime(0, ctx.currentTime);
    compressor.release.setValueAtTime(0.25, ctx.currentTime);
    oscillator.connect(compressor);
    compressor.connect(ctx.destination);
    oscillator.start(0);
    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0);
    const sample = data.slice(4500, 5000).reduce((a, b) => a + Math.abs(b), 0).toString();
    const hash = await sha256(sample);
    setValue('audio-hash', hash.slice(0, 16) + '…');
    return hash;
  } catch (e) {
    setValue('audio-hash', 'Blocked or unsupported');
    return 'blocked';
  }
};

const loadFontDetection = async () => {
  const testFonts = [
    'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia',
    'Impact', 'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype',
    'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'MS Gothic',
    'MS PGothic', 'MS UI Gothic', 'Meiryo', 'Yu Gothic', 'Segoe UI',
    'Consolas', 'Cambria', 'Calibri', 'Candara', 'Constantia',
    'Helvetica', 'Helvetica Neue', 'Futura', 'Gill Sans', 'Optima',
    'American Typewriter', 'Baskerville', 'Didot', 'Garamond',
    'Monaco', 'Menlo', 'SF Pro', 'SF Mono', 'Avenir', 'Avenir Next',
    'Ubuntu', 'DejaVu Sans', 'Liberation Sans', 'Noto Sans',
    'Roboto', 'Droid Sans', 'Fira Sans', 'Source Sans Pro',
    'Cascadia Code', 'JetBrains Mono', 'Inconsolata', 'Hack'
  ];
  const baseFonts = ['monospace', 'sans-serif', 'serif'];
  const testString = 'mmmmmmmmmmlli';
  const testSize = '72px';

  const span = document.createElement('span');
  span.style.position = 'absolute';
  span.style.left = '-9999px';
  span.style.fontSize = testSize;
  span.style.lineHeight = 'normal';
  span.textContent = testString;
  document.body.appendChild(span);

  const baseWidths = {};
  for (const base of baseFonts) {
    span.style.fontFamily = base;
    baseWidths[base] = span.offsetWidth;
  }

  const detected = [];
  for (const font of testFonts) {
    let found = false;
    for (const base of baseFonts) {
      span.style.fontFamily = `'${font}', ${base}`;
      if (span.offsetWidth !== baseWidths[base]) {
        found = true;
        break;
      }
    }
    if (found) detected.push(font);
  }

  document.body.removeChild(span);
  const label = detected.length ? `${detected.length} fonts: ${detected.join(', ')}` : 'No extra fonts detected';
  setValue('fonts', label);
  return await sha256(detected.join(','));
};

const loadSpeechVoices = () => {
  return new Promise((resolve) => {
    const getVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length === 0) {
        setValue('voices', 'No voices available');
        resolve('none');
        return;
      }
      const names = voices.map(v => `${v.name} (${v.lang})`);
      setValue('voices', `${voices.length} voices: ${names.join(', ')}`);
      resolve(voices.map(v => v.name).join(','));
    };

    if (typeof speechSynthesis === 'undefined') {
      setValue('voices', 'Speech synthesis not supported');
      resolve('unsupported');
      return;
    }

    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      getVoices();
    } else {
      speechSynthesis.onvoiceschanged = getVoices;
      setTimeout(() => {
        if (speechSynthesis.getVoices().length === 0) {
          setValue('voices', 'No voices loaded');
          resolve('timeout');
        }
      }, 3000);
    }
  });
};

const loadPlugins = () => {
  const plugins = Array.from(navigator.plugins || []);
  if (plugins.length === 0) {
    setValue('plugins', 'None reported (modern browsers hide this)');
    return 'none';
  }
  const names = plugins.map(p => p.name);
  setValue('plugins', `${names.length} plugins: ${names.join(', ')}`);
  return names.join(',');
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

const loadCSSPreferences = () => {
  const detect = (query, values) => {
    for (const v of values) {
      if (window.matchMedia(`(${query}: ${v})`).matches) return v;
    }
    return 'no-preference';
  };
  setValue('pref-color-scheme', detect('prefers-color-scheme', ['dark', 'light']));
  setValue('pref-reduced-motion', detect('prefers-reduced-motion', ['reduce']));
  setValue('pref-contrast', detect('prefers-contrast', ['more', 'less']));
  setValue('pref-forced-colors', detect('forced-colors', ['active']));
};

const loadMediaDevices = async () => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    setValue('media-devices', 'Not supported');
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const counts = {};
    for (const d of devices) {
      counts[d.kind] = (counts[d.kind] || 0) + 1;
    }
    const parts = Object.entries(counts).map(([kind, count]) => `${kind}: ${count}`);
    setValue('media-devices', parts.join(', ') || 'No devices found');
  } catch (e) {
    setValue('media-devices', 'Blocked');
  }
};

const loadStorageEstimate = async () => {
  if (!navigator.storage?.estimate) {
    setValue('storage-estimate', 'Not supported');
    return;
  }
  try {
    const est = await navigator.storage.estimate();
    const fmt = (bytes) => {
      if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
      if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
      return `${bytes} bytes`;
    };
    setValue('storage-estimate', `Quota: ${fmt(est.quota)} • Used: ${fmt(est.usage)}`);
  } catch (e) {
    setValue('storage-estimate', 'Blocked');
  }
};

const loadPermissionsStatus = async () => {
  if (!navigator.permissions?.query) {
    setValue('permissions', 'Permissions API not supported');
    return;
  }
  const names = ['geolocation', 'notifications', 'camera', 'microphone', 'clipboard-read'];
  const results = [];
  for (const name of names) {
    try {
      const status = await navigator.permissions.query({ name });
      results.push(`${name}: ${status.state}`);
    } catch (e) {
      results.push(`${name}: unsupported`);
    }
  }
  setValue('permissions', results.join(' • '));
};

const checkHashStability = (hashes) => {
  const tracked = ['canvas', 'webgl', 'audio'];

  let storage;
  try {
    const t = '__whoami_test__';
    localStorage.setItem(t, t);
    localStorage.removeItem(t);
    storage = localStorage;
  } catch (_) {
    setValue('fp-stability', 'localStorage unavailable — cannot compare across visits.');
    return;
  }

  const results = tracked.map((key) => {
    const cur = hashes[key];
    if (!cur || cur === 'blocked' || cur === 'unsupported') return { key, status: 'unavailable' };
    const storageKey = `whoami:prev:${key}`;
    const prev = storage.getItem(storageKey);
    storage.setItem(storageKey, cur);
    if (!prev) return { key, status: 'new' };
    return { key, status: prev === cur ? 'stable' : 'changed' };
  });

  const usable = results.filter((r) => r.status !== 'unavailable');
  if (usable.length === 0) {
    setValue('fp-stability', 'No comparable signals available.');
    return;
  }

  const newSig = usable.filter((r) => r.status === 'new');
  if (newSig.length === usable.length) {
    setValue('fp-stability', 'First visit — reload the page to compare canvas, WebGL, and audio hashes against this session.');
    return;
  }

  const stable = usable.filter((r) => r.status === 'stable');
  const changed = usable.filter((r) => r.status === 'changed');
  const fmt = (arr) => arr.map((r) => r.key).join(', ');

  if (changed.length === 0) {
    setValue('fp-stability', `${stable.length} of ${usable.length} hardware signals (${fmt(stable)}) match the previous visit. This browser is trackable across visits via these signals.`);
  } else if (stable.length === 0) {
    setValue('fp-stability', `All ${changed.length} hardware signals (${fmt(changed)}) changed since last visit — this browser is randomizing fingerprint signals (Brave farbling, JShelter, CanvasBlocker, Tor, etc.).`);
  } else {
    setValue('fp-stability', `Partial randomization: ${changed.length} changed (${fmt(changed)}), ${stable.length} stable (${fmt(stable)}).`);
  }
};

const detectBrowserClass = async (voicesData) => {
  if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
    try {
      if (await navigator.brave.isBrave()) return 'brave';
    } catch (_) {}
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : '';
      const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
      const noRealVoices = voicesData === 'none' || voicesData === 'timeout' || voicesData === 'unsupported';
      if (vendor === 'Mozilla' && renderer === 'Mozilla' && noRealVoices) return 'tor';
    }
  } catch (_) {}

  return 'standard';
};

const loadFingerprintSummary = async (hashes) => {
  const validHashes = Object.entries(hashes).filter(([, v]) => v && v !== 'blocked' && v !== 'unsupported' && v !== 'none' && v !== 'timeout');
  const signalCount = validHashes.length;
  setValue('fp-signals', `${signalCount} of ${Object.keys(hashes).length} signals`);

  if (signalCount === 0) {
    setValue('fp-hash', 'Unable to compute');
    setValue('fp-uniqueness', 'Insufficient data');
    return;
  }

  const combined = validHashes.map(([, v]) => v).join('|');
  const hash = await sha256(combined);
  setValue('fp-hash', hash.slice(0, 32) + '…');

  checkHashStability(hashes);

  const browserClass = await detectBrowserClass(hashes.voices);

  if (browserClass === 'tor') {
    setValue('fp-uniqueness', 'Tor Browser detected — your fingerprint is normalized to match other Tor users on this platform. The hash should be similar across Tor sessions running the same build.');
  } else if (browserClass === 'brave') {
    setValue('fp-uniqueness', 'Brave fingerprint protection detected — several signals are randomized ("farbled") per session, so this hash is not a stable cross-site identifier. Individual snapshots can still look unusual.');
  } else if (signalCount >= 5) {
    setValue('fp-uniqueness', `${signalCount} signals collected — high fingerprinting surface. Real-world uniqueness depends on how rare each value is in the wider population, which this page cannot measure (try AmIUnique or Panopticlick for that).`);
  } else if (signalCount >= 3) {
    setValue('fp-uniqueness', `${signalCount} signals collected — moderate fingerprinting surface.`);
  } else {
    setValue('fp-uniqueness', 'Low entropy — limited fingerprinting signals available.');
  }
};

const init = async () => {
  const renderTime = Math.round(performance.now());
  const ipLookup = loadIpData();
  await loadBrowserData();

  // Fingerprinting (collect hashes)
  const canvasHash = await loadCanvasFingerprint();
  const webglHash = await loadWebGLFingerprint();
  const audioHash = await loadAudioFingerprint();
  const fontsHash = await loadFontDetection();
  const voicesPromise = loadSpeechVoices();
  const pluginsData = loadPlugins();

  // Non-fingerprint sections
  loadScreenData();
  loadCSSPreferences();
  loadTimeData();
  loadVisitData();
  loadMediaDevices();
  loadStorageEstimate();
  loadPermissionsStatus();
  loadConnectionData();
  loadBatteryData();
  loadGeolocation();
  measureLatency();
  setupLatencyRefresh();
  setupWebRTCTest();

  // Wait for async fingerprint data, then compute summary
  const voicesData = await voicesPromise;
  const screenRaw = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
  const screenHash = await sha256(screenRaw);
  const uaHash = await sha256(navigator.userAgent);

  await loadFingerprintSummary({
    canvas: canvasHash,
    webgl: webglHash,
    audio: audioHash,
    fonts: fontsHash,
    voices: voicesData,
    plugins: pluginsData,
    screen: screenHash,
    ua: uaHash,
  });

  const ipDuration = await ipLookup;
  updatePerformanceData(renderTime, ipDuration);
};

document.addEventListener('DOMContentLoaded', init);
