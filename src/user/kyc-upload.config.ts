import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { diskStorage } from 'multer';

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function buildKycUploadOptions() {
  return {
    storage: diskStorage({
      destination: (request, _file, callback) => {
        const userId = request?.user?.sub ?? 'anonymous';
        const uploadDir = join(process.cwd(), 'uploads', 'kyc', userId);
        mkdirSync(uploadDir, { recursive: true });
        callback(null, uploadDir);
      },
      filename: (_request, file, callback) => {
        const extension = extname(file.originalname || '');
        const baseName = sanitizeFileName(
          extension
            ? file.originalname.slice(0, -extension.length)
            : file.originalname || 'document',
        );
        const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        callback(null, `${uniquePrefix}-${baseName}${extension}`);
      },
    }),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 5,
    },
  };
}
