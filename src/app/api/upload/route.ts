import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  isImageType,
  isVideoType,
  getFileExtension,
} from '@/lib/media-utils';
import fs from 'fs/promises';
import path from 'path';

const UPLOAD_BASE = path.join(process.cwd(), 'public', 'uploads');

async function ensureDir(dir: string) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Directory already exists
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: 'Please log in to upload files.' }, { status: 401 });
    }
    if (!auth.is_verified) {
      return NextResponse.json({ error: 'Please verify your account first.' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    const mimeType = file.type;
    const isImage = isImageType(mimeType);
    const isVideo = isVideoType(mimeType);

    if (!isImage && !isVideo) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${mimeType}. Accepted: ${[...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
    if (file.size > maxSize) {
      const limitMB = maxSize / (1024 * 1024);
      return NextResponse.json(
        { error: `File too large. Maximum size is ${limitMB}MB.` },
        { status: 400 }
      );
    }

    // Determine subdirectory
    const subDir = isImage ? 'images' : 'videos';
    const uploadDir = path.join(UPLOAD_BASE, subDir);
    await ensureDir(uploadDir);

    // Generate unique filename
    const ext = getFileExtension(file.name) || (isImage ? 'jpg' : 'mp4');
    const uniqueName = `${uuidv4()}.${ext}`;
    const filePath = path.join(uploadDir, uniqueName);

    // Write file to disk
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));

    // Build public URL
    const url = `/uploads/${subDir}/${uniqueName}`;

    return NextResponse.json({
      url,
      filename: file.name,
      media_type: isImage ? 'image' : 'video',
      file_size: file.size,
      mime_type: mimeType,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload file.' }, { status: 500 });
  }
}
