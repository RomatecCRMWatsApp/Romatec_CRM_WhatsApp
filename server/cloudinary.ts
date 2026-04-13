/**
 * Upload de arquivos via Cloudinary
 * Cloud: drooexltp
 */

import crypto from 'crypto';

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'drooexltp';
const API_KEY = process.env.CLOUDINARY_API_KEY || '454146681184898';
const API_SECRET = process.env.CLOUDINARY_API_SECRET || 'soDNjdzXi2Hhd9NLvLuZmxrBi4g';

function generateSignature(params: Record<string, string>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  return crypto
    .createHash('sha256')
    .update(sortedParams + API_SECRET)
    .digest('hex');
}

export async function uploadToCloudinary(
  buffer: Buffer,
  fileType: string,
  fileName: string
): Promise<{ url: string; publicId: string }> {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Determinar resource_type
  let resourceType = 'image';
  if (fileType.startsWith('video/')) resourceType = 'video';
  else if (fileType === 'application/pdf') resourceType = 'raw';

  // Gerar public_id único
  const safeName = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 40);
  const folder = 'romatec_imoveis';
  const publicId = `${folder}/${Date.now()}_${safeName}`;

  // Parâmetros para assinar — access_mode=public garante acesso sem autenticação
  const paramsToSign: Record<string, string> = {
    access_mode: 'public',
    public_id: publicId,
    timestamp,
  };
  const signature = generateSignature(paramsToSign);

  // Montar multipart/form-data manualmente (sem dependência externa)
  const boundary = `----FormBoundary${Math.random().toString(36).substring(2)}`;

  function addField(name: string, value: string): Buffer {
    return Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    );
  }

  function addFile(name: string, fileBuffer: Buffer, fname: string, mimeType: string): Buffer {
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${fname}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const footer = Buffer.from('\r\n');
    return Buffer.concat([header, fileBuffer, footer]);
  }

  const parts: Buffer[] = [
    addFile('file', buffer, fileName, fileType),
    addField('api_key', API_KEY),
    addField('timestamp', timestamp),
    addField('public_id', publicId),
    addField('access_mode', 'public'),
    addField('signature', signature),
    Buffer.from(`--${boundary}--\r\n`),
  ];

  const body = Buffer.concat(parts);
  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

  console.log(`[Cloudinary] Enviando: ${fileName} (${resourceType}, ${(buffer.length / 1024).toFixed(1)}KB)`);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloudinary upload falhou (${response.status}): ${error}`);
  }

  const data = await response.json() as { secure_url: string; public_id: string };
  console.log(`[Cloudinary] ✅ ${data.secure_url}`);

  return {
    url: data.secure_url,
    publicId: data.public_id,
  };
}
