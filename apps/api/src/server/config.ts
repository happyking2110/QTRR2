export interface ServerConfig {
  sessionSecret: string;
  appOrigin: string;
  trustedProxyIps: string[];
}

let cachedConfig: ServerConfig | null = null;

export function validateConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): ServerConfig {
  const sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('Biến môi trường SESSION_SECRET bị thiếu: bắt buộc phải cấu hình');
  }
  if (sessionSecret.length < 32) {
    throw new Error('Biến môi trường SESSION_SECRET không hợp lệ: độ dài phải từ 32 ký tự trở lên');
  }
  if (sessionSecret.startsWith('change-me')) {
    throw new Error('Biến môi trường SESSION_SECRET không hợp lệ: không được sử dụng giá trị mẫu bắt đầu bằng change-me');
  }

  const appOrigin = env.APP_ORIGIN?.trim();
  if (!appOrigin) {
    throw new Error('Biến môi trường APP_ORIGIN bị thiếu: bắt buộc phải cấu hình');
  }
  if (!appOrigin.startsWith('http://') && !appOrigin.startsWith('https://')) {
    throw new Error('Biến môi trường APP_ORIGIN không hợp lệ: phải bắt đầu bằng http:// hoặc https://');
  }

  const trustedProxyIpsRaw = env.TRUSTED_PROXY_IPS?.trim();
  if (!trustedProxyIpsRaw) {
    throw new Error('Biến môi trường TRUSTED_PROXY_IPS bị thiếu: bắt buộc phải cấu hình');
  }
  const trustedProxyIps = trustedProxyIpsRaw
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);

  return {
    sessionSecret,
    appOrigin,
    trustedProxyIps,
  };
}

export function loadConfig(): ServerConfig {
  cachedConfig = validateConfig(process.env);
  return cachedConfig;
}

export function getConfig(): ServerConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

export function getClientIp(req: {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const config = getConfig();
  const remoteIp = req.socket?.remoteAddress || req.ip || '127.0.0.1';

  const isTrusted = config.trustedProxyIps.some((trusted) => {
    return remoteIp === trusted || remoteIp.endsWith(`:${trusted}`);
  });

  if (isTrusted && req.headers?.['x-forwarded-for']) {
    const forwarded = req.headers['x-forwarded-for'];
    const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const clientIp = forwardedStr.split(',')[0].trim();
    if (clientIp) return clientIp;
  }

  return remoteIp;
}
