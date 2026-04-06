'use client';

import { useCallback, useRef, useState } from 'react';

export interface ImageItem {
  data: string;
  mimeType: string;
  name: string;
}

interface ImageUploadProps {
  images: ImageItem[];
  onAdd: (img: ImageItem) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  maxImages?: number;
  maxSizeBytes?: number;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const DEFAULT_MAX_IMAGES = 5;
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:...;base64, prefix
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function useImageUpload(maxImages = DEFAULT_MAX_IMAGES, maxSizeBytes = DEFAULT_MAX_SIZE) {
  const [images, setImages] = useState<ImageItem[]>([]);

  const addImage = useCallback(
    (img: ImageItem) => {
      setImages((prev) => (prev.length >= maxImages ? prev : [...prev, img]));
    },
    [maxImages],
  );

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearImages = useCallback(() => setImages([]), []);

  const processFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) return;
      if (file.size > maxSizeBytes) return;
      const data = await fileToBase64(file);
      addImage({ data, mimeType: file.type, name: file.name });
    },
    [addImage, maxSizeBytes],
  );

  return { images, onAdd: addImage, onRemove: removeImage, onClear: clearImages, processFile };
}

export default function ImageUpload({
  images,
  onAdd,
  onRemove,
  onClear,
  maxImages = DEFAULT_MAX_IMAGES,
  maxSizeBytes = DEFAULT_MAX_SIZE,
  disabled = false,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const isFull = images.length >= maxImages;

  const processFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) return;
      if (file.size > maxSizeBytes) return;
      const data = await fileToBase64(file);
      onAdd({ data, mimeType: file.type, name: file.name });
    },
    [onAdd, maxSizeBytes],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      const remaining = maxImages - images.length;
      arr.slice(0, remaining).forEach((f) => processFile(f));
    },
    [images.length, maxImages, processFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled || isFull) return;
      handleFiles(e.dataTransfer.files);
    },
    [disabled, isFull, handleFiles],
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled && !isFull) setDragOver(true);
    },
    [disabled, isFull],
  );

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (disabled || isFull) return;
      const items = Array.from(e.clipboardData.items);
      const imageFiles = items
        .filter((item) => item.kind === 'file' && ACCEPTED_TYPES.includes(item.type))
        .map((item) => item.getAsFile())
        .filter(Boolean) as File[];
      if (imageFiles.length > 0) {
        e.preventDefault();
        handleFiles(imageFiles);
      }
    },
    [disabled, isFull, handleFiles],
  );

  const onClickBrowse = useCallback(() => {
    if (!disabled && !isFull) inputRef.current?.click();
  }, [disabled, isFull]);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) handleFiles(e.target.files);
      e.target.value = '';
    },
    [handleFiles],
  );

  return (
    <div onPaste={onPaste}>
      {/* Thumbnails */}
      {images.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {images.map((img, i) => (
            <div
              key={`${img.name}-${i}`}
              style={{
                position: 'relative',
                width: 64,
                height: 64,
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid #e0e0e0',
              }}
            >
              <img
                src={`data:${img.mimeType};base64,${img.data}`}
                alt={img.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`移除 ${img.name}`}
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  fontSize: 12,
                  lineHeight: '18px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
          {images.length > 1 && (
            <button
              type="button"
              onClick={onClear}
              style={{
                alignSelf: 'center',
                fontSize: 12,
                color: '#888',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              清除全部
            </button>
          )}
        </div>
      )}

      {/* Drop zone */}
      {!isFull && (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={onClickBrowse}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClickBrowse(); }}
          aria-label="上传图片"
          style={{
            border: `2px dashed ${dragOver ? '#3b82f6' : '#d1d5db'}`,
            borderRadius: 8,
            padding: '8px 12px',
            textAlign: 'center',
            fontSize: 13,
            color: '#888',
            cursor: disabled ? 'not-allowed' : 'pointer',
            background: dragOver ? 'rgba(59,130,246,0.05)' : 'transparent',
            transition: 'border-color 0.15s, background 0.15s',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          拖拽、粘贴或点击上传图片（最多 {maxImages} 张，每张 ≤ {Math.round(maxSizeBytes / 1024 / 1024)}MB）
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        onChange={onFileChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
    </div>
  );
}
