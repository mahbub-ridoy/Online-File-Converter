import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileArchive,
  Gauge,
  ImageIcon,
  ImagePlus,
  Layers,
  Maximize2,
  PackageOpen,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {AnimatePresence, motion} from 'motion/react';
import JSZip from 'jszip';

type TargetFormat = 'image/jpeg' | 'image/png' | 'image/webp';
type QueueStatus = 'idle' | 'converting' | 'success' | 'error';

interface ImageDimensions {
  width: number;
  height: number;
}

interface FileQueueItem {
  id: string;
  originalFile: File;
  targetFormat: TargetFormat;
  status: QueueStatus;
  previewUrl: string;
  originalDimensions?: ImageDimensions;
  outputDimensions?: ImageDimensions;
  outputUrl?: string;
  outputName?: string;
  outputBlob?: Blob;
  outputSize?: number;
  errorMessage?: string;
}

interface ResizePreset {
  label: string;
  width: number;
  height: number;
  enabled: boolean;
}

const SUPPORTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/gif',
  'image/svg+xml',
  'image/avif',
];

const SUPPORTED_EXTENSIONS = /\.(jpe?g|png|webp|bmp|gif|svg|avif)$/i;

const FORMAT_OPTIONS: {label: string; value: TargetFormat; detail: string}[] = [
  {label: 'JPG', value: 'image/jpeg', detail: 'Small, shareable photos'},
  {label: 'PNG', value: 'image/png', detail: 'Sharp with transparency'},
  {label: 'WEBP', value: 'image/webp', detail: 'Modern web delivery'},
];

const RESIZE_PRESETS: ResizePreset[] = [
  {label: 'Original', width: 1920, height: 1080, enabled: false},
  {label: '4K', width: 3840, height: 2160, enabled: true},
  {label: 'HD', width: 1920, height: 1080, enabled: true},
  {label: 'Social', width: 1080, height: 1080, enabled: true},
];

function getFormatExt(mime: string) {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/bmp':
      return 'bmp';
    case 'image/gif':
      return 'gif';
    case 'image/svg+xml':
      return 'svg';
    case 'image/avif':
      return 'avif';
    default:
      return 'img';
  }
}

function getSourceLabel(file: File) {
  const knownType = getFormatExt(file.type);
  if (knownType !== 'img') return knownType.toUpperCase();

  const extension = file.name.match(/\.([^.]+)$/)?.[1];
  return extension ? extension.toUpperCase() : 'IMAGE';
}

function getBaseName(fileName: string) {
  const extensionIndex = fileName.lastIndexOf('.');
  return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
}

function cleanPrefix(prefix: string) {
  return prefix
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isSupportedImage(file: File) {
  return (
    SUPPORTED_TYPES.includes(file.type) ||
    file.type.startsWith('image/') ||
    SUPPORTED_EXTENSIONS.test(file.name)
  );
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDimensions(dimensions?: ImageDimensions) {
  if (!dimensions) return 'Reading size';
  return `${dimensions.width} x ${dimensions.height}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function revokeItemUrls(item: FileQueueItem, outputOnly = false) {
  if (!outputOnly) {
    URL.revokeObjectURL(item.previewUrl);
  }

  if (item.outputUrl) {
    URL.revokeObjectURL(item.outputUrl);
  }
}

export default function App() {
  const [queue, setQueue] = useState<FileQueueItem[]>([]);
  const [globalFormat, setGlobalFormat] = useState<TargetFormat>('image/webp');
  const [isDragging, setIsDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [quality, setQuality] = useState(0.86);
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [maxWidth, setMaxWidth] = useState(1920);
  const [maxHeight, setMaxHeight] = useState(1080);
  const [jpegBackground, setJpegBackground] = useState('#ffffff');
  const [filenamePrefix, setFilenamePrefix] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<FileQueueItem[]>([]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    return () => {
      queueRef.current.forEach(item => revokeItemUrls(item));
    };
  }, []);

  const readDimensions = useCallback((item: FileQueueItem) => {
    const img = new Image();
    img.onload = () => {
      setQueue(prev =>
        prev.map(queueItem =>
          queueItem.id === item.id
            ? {
                ...queueItem,
                originalDimensions: {
                  width: img.naturalWidth || img.width,
                  height: img.naturalHeight || img.height,
                },
              }
            : queueItem,
        ),
      );
    };
    img.src = item.previewUrl;
  }, []);

  const addFilesToQueue = useCallback(
    (files: FileList | File[]) => {
      const validFiles = Array.from(files).filter(isSupportedImage);
      if (validFiles.length === 0) return;

      const newItems: FileQueueItem[] = validFiles.map(file => ({
        id: createId(),
        originalFile: file,
        targetFormat: globalFormat,
        status: 'idle',
        previewUrl: URL.createObjectURL(file),
      }));

      setQueue(prev => [...prev, ...newItems]);
      newItems.forEach(readDimensions);
    },
    [globalFormat, readDimensions],
  );

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.some(isSupportedImage)) {
        addFilesToQueue(files);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addFilesToQueue]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);

      if (event.dataTransfer.files.length > 0) {
        addFilesToQueue(event.dataTransfer.files);
      }
    },
    [addFilesToQueue],
  );

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      addFilesToQueue(event.target.files);
      event.target.value = '';
    }
  };

  const resetItemOutput = (item: FileQueueItem): FileQueueItem => {
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);

    return {
      ...item,
      status: 'idle',
      errorMessage: undefined,
      outputUrl: undefined,
      outputBlob: undefined,
      outputName: undefined,
      outputSize: undefined,
      outputDimensions: undefined,
    };
  };

  const updateItemFormat = (id: string, format: TargetFormat) => {
    setQueue(prev =>
      prev.map(item =>
        item.id === id
          ? {
              ...resetItemOutput(item),
              targetFormat: format,
            }
          : item,
      ),
    );
  };

  const resetItem = (id: string) => {
    setQueue(prev => prev.map(item => (item.id === id ? resetItemOutput(item) : item)));
  };

  const removeItem = (id: string) => {
    setQueue(prev => {
      const item = prev.find(queueItem => queueItem.id === id);
      if (item) revokeItemUrls(item);
      return prev.filter(queueItem => queueItem.id !== id);
    });
  };

  const clearAll = () => {
    queue.forEach(item => revokeItemUrls(item));
    setQueue([]);
  };

  const clearCompleted = () => {
    setQueue(prev => {
      prev.filter(item => item.status === 'success').forEach(item => revokeItemUrls(item));
      return prev.filter(item => item.status !== 'success');
    });
  };

  const handleGlobalFormatChange = (newFormat: TargetFormat) => {
    setGlobalFormat(newFormat);
    setQueue(prev =>
      prev.map(item =>
        item.status === 'idle' || item.status === 'error'
          ? {
              ...resetItemOutput(item),
              targetFormat: newFormat,
            }
          : item,
      ),
    );
  };

  const applyResizePreset = (preset: ResizePreset) => {
    setResizeEnabled(preset.enabled);
    setMaxWidth(preset.width);
    setMaxHeight(preset.height);
  };

  const getTargetDimensions = (width: number, height: number): ImageDimensions => {
    if (!resizeEnabled) {
      return {width, height};
    }

    const widthLimit = Math.max(10, maxWidth);
    const heightLimit = Math.max(10, maxHeight);
    const ratio = Math.min(widthLimit / width, heightLimit / height, 1);

    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio)),
    };
  };

  const buildOutputName = (file: File, targetFormat: TargetFormat) => {
    const prefix = cleanPrefix(filenamePrefix);
    const baseName = getBaseName(file.name);
    const extension = getFormatExt(targetFormat);
    return `${prefix ? `${prefix}-` : ''}${baseName}.${extension}`;
  };

  const convertFile = async (item: FileQueueItem) => {
    return new Promise<{
      blob: Blob;
      dimensions: ImageDimensions;
      outputName: string;
      outputUrl: string;
      outputSize: number;
    }>((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const sourceWidth = img.naturalWidth || img.width;
        const sourceHeight = img.naturalHeight || img.height;

        if (!sourceWidth || !sourceHeight) {
          reject(new Error('The image has no readable dimensions.'));
          return;
        }

        const dimensions = getTargetDimensions(sourceWidth, sourceHeight);
        const canvas = document.createElement('canvas');
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;

        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('The browser could not create a canvas context.'));
          return;
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';

        if (item.targetFormat === 'image/jpeg') {
          context.fillStyle = jpegBackground;
          context.fillRect(0, 0, canvas.width, canvas.height);
        }

        context.drawImage(img, 0, 0, dimensions.width, dimensions.height);

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error('This browser could not export that format.'));
              return;
            }

            resolve({
              blob,
              dimensions,
              outputName: buildOutputName(item.originalFile, item.targetFormat),
              outputUrl: URL.createObjectURL(blob),
              outputSize: blob.size,
            });
          },
          item.targetFormat,
          item.targetFormat === 'image/png' ? undefined : quality,
        );
      };

      img.onerror = () => {
        reject(new Error('The image could not be decoded. Try a JPG, PNG, WEBP, SVG, BMP, GIF, or AVIF file.'));
      };

      img.src = item.previewUrl;
    });
  };

  const handleConvertAll = async () => {
    const itemsToConvert = queue.filter(item => item.status === 'idle' || item.status === 'error');
    if (itemsToConvert.length === 0) return;

    for (const item of itemsToConvert) {
      setQueue(prev =>
        prev.map(queueItem =>
          queueItem.id === item.id
            ? {...queueItem, status: 'converting', errorMessage: undefined}
            : queueItem,
        ),
      );

      try {
        const result = await convertFile(item);
        setQueue(prev =>
          prev.map(queueItem => {
            if (queueItem.id !== item.id) return queueItem;
            if (queueItem.outputUrl) URL.revokeObjectURL(queueItem.outputUrl);

            return {
              ...queueItem,
              status: 'success',
              outputBlob: result.blob,
              outputUrl: result.outputUrl,
              outputName: result.outputName,
              outputSize: result.outputSize,
              outputDimensions: result.dimensions,
            };
          }),
        );
      } catch (error) {
        setQueue(prev =>
          prev.map(queueItem =>
            queueItem.id === item.id
              ? {
                  ...queueItem,
                  status: 'error',
                  errorMessage: getErrorMessage(error),
                }
              : queueItem,
          ),
        );
      }
    }
  };

  const handleDownloadAllZip = async () => {
    const successItems = queue.filter(
      item => item.status === 'success' && item.outputBlob && item.outputName,
    );

    if (successItems.length === 0) return;

    const zip = new JSZip();
    successItems.forEach(item => {
      if (item.outputName && item.outputBlob) {
        zip.file(item.outputName, item.outputBlob);
      }
    });

    const content = await zip.generateAsync({type: 'blob', compression: 'DEFLATE'});
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `converted-images-${Date.now()}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const stats = useMemo(() => {
    const totalOriginal = queue.reduce((sum, item) => sum + item.originalFile.size, 0);
    const convertedOriginal = queue.reduce(
      (sum, item) => (item.status === 'success' ? sum + item.originalFile.size : sum),
      0,
    );
    const totalOutput = queue.reduce((sum, item) => sum + (item.outputSize ?? 0), 0);
    const success = queue.filter(item => item.status === 'success').length;
    const converting = queue.filter(item => item.status === 'converting').length;
    const error = queue.filter(item => item.status === 'error').length;
    const pending = queue.filter(item => item.status === 'idle').length;
    const savedBytes = convertedOriginal - totalOutput;
    const savedPercent = convertedOriginal ? Math.round((savedBytes / convertedOriginal) * 100) : 0;

    return {
      totalOriginal,
      totalOutput,
      success,
      converting,
      error,
      pending,
      savedBytes,
      savedPercent,
      completion: queue.length ? Math.round(((success + error) / queue.length) * 100) : 0,
    };
  }, [queue]);

  const canConvert = queue.some(item => item.status === 'idle' || item.status === 'error');
  const canDownloadAll = queue.some(item => item.status === 'success');
  const isWorking = queue.some(item => item.status === 'converting');
  const acceptValue = `${SUPPORTED_TYPES.join(',')},.jpg,.jpeg,.png,.webp,.bmp,.gif,.svg,.avif`;

  return (
    <div className="app-shell min-h-screen text-slate-950">
      <header className="app-header">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="brand-mark">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">LocalConvert</h1>
              <p className="text-sm text-slate-500">Private browser image conversion workspace</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="status-pill">
              <BadgeCheck className="h-4 w-4 text-teal-600" />
              No uploads
            </span>
            <span className="status-pill">
              <Sparkles className="h-4 w-4 text-amber-600" />
              {queue.length} queued
            </span>
            <span className="status-pill">
              <Gauge className="h-4 w-4 text-blue-600" />
              {stats.completion}% done
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8">
        <aside className="flex flex-col gap-4">
          <section
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`upload-zone ${isDragging ? 'upload-zone-active' : ''}`}
          >
            <input
              type="file"
              multiple
              accept={acceptValue}
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileInput}
            />

            <motion.div
              animate={{scale: isDragging ? 1.05 : 1, y: isDragging ? -4 : 0}}
              className="upload-icon"
            >
              <UploadCloud className="h-10 w-10" strokeWidth={1.7} />
            </motion.div>

            <div className="space-y-2 text-center">
              <h2 className="font-display text-2xl font-semibold">Drop images here</h2>
              <p className="text-sm text-slate-500">Click to browse, drag a batch, or paste images from clipboard.</p>
            </div>

            <div className="flex flex-wrap justify-center gap-2 text-xs font-semibold uppercase text-slate-500">
              <span className="format-chip">JPG</span>
              <span className="format-chip">PNG</span>
              <span className="format-chip">WEBP</span>
              <span className="format-chip">SVG</span>
              <span className="format-chip">AVIF</span>
            </div>
          </section>

          <section className="panel p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-slate-500" />
                <h2 className="font-display text-lg font-semibold">Conversion setup</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(value => !value)}
                className="icon-button"
                title={showSettings ? 'Hide settings' : 'Show settings'}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="control-label">Target format</label>
                <div className="segmented-control">
                  {FORMAT_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleGlobalFormatChange(option.value)}
                      className={globalFormat === option.value ? 'is-selected' : ''}
                      title={option.detail}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence initial={false}>
                {showSettings && (
                  <motion.div
                    initial={{height: 0, opacity: 0}}
                    animate={{height: 'auto', opacity: 1}}
                    exit={{height: 0, opacity: 0}}
                    className="overflow-hidden"
                  >
                    <div className="space-y-5 pt-1">
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <label className="control-label mb-0 flex items-center gap-2">
                            <SlidersHorizontal className="h-4 w-4" />
                            Quality
                          </label>
                          <span className="value-badge">{Math.round(quality * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.05"
                          value={quality}
                          onChange={event => setQuality(parseFloat(event.target.value))}
                          className="w-full"
                        />
                        <p className="mt-2 text-xs text-slate-500">Applies to JPG and WEBP output.</p>
                      </div>

                      <div>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <label className="control-label mb-0 flex items-center gap-2">
                            <Maximize2 className="h-4 w-4" />
                            Resize bounds
                          </label>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={resizeEnabled}
                              onChange={event => setResizeEnabled(event.target.checked)}
                            />
                            <span></span>
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mini-label">Max width</label>
                            <input
                              type="number"
                              min="10"
                              value={maxWidth}
                              disabled={!resizeEnabled}
                              onChange={event => setMaxWidth(Math.max(10, Number(event.target.value) || 10))}
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="mini-label">Max height</label>
                            <input
                              type="number"
                              min="10"
                              value={maxHeight}
                              disabled={!resizeEnabled}
                              onChange={event => setMaxHeight(Math.max(10, Number(event.target.value) || 10))}
                              className="input-field"
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-4 gap-2">
                          {RESIZE_PRESETS.map(preset => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => applyResizePreset(preset)}
                              className="preset-button"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3">
                        <div>
                          <label className="mini-label">JPG fill</label>
                          <input
                            type="color"
                            value={jpegBackground}
                            onChange={event => setJpegBackground(event.target.value)}
                            className="color-input"
                            title="JPEG background for transparent images"
                          />
                        </div>
                        <div>
                          <label className="mini-label">Filename prefix</label>
                          <input
                            type="text"
                            value={filenamePrefix}
                            onChange={event => setFilenamePrefix(event.target.value)}
                            placeholder="converted"
                            className="input-field"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          <section className="panel p-4">
            <div className="mb-4 flex items-center gap-2">
              <PackageOpen className="h-5 w-5 text-slate-500" />
              <h2 className="font-display text-lg font-semibold">Batch actions</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleConvertAll}
                disabled={!canConvert || isWorking}
                className="primary-button col-span-2"
              >
                <ImagePlus className="h-4 w-4" />
                {isWorking ? 'Converting...' : 'Convert ready files'}
              </button>
              <button
                type="button"
                onClick={handleDownloadAllZip}
                disabled={!canDownloadAll}
                className="secondary-button"
              >
                <FileArchive className="h-4 w-4" />
                ZIP
              </button>
              <button
                type="button"
                onClick={clearCompleted}
                disabled={!canDownloadAll}
                className="secondary-button"
              >
                <CheckCircle2 className="h-4 w-4" />
                Clear done
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={queue.length === 0}
                className="danger-button col-span-2"
              >
                <Trash2 className="h-4 w-4" />
                Clear queue
              </button>
            </div>
          </section>
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="metric-card">
              <span>Original size</span>
              <strong>{formatFileSize(stats.totalOriginal)}</strong>
            </div>
            <div className="metric-card">
              <span>Converted size</span>
              <strong>{formatFileSize(stats.totalOutput)}</strong>
            </div>
            <div className="metric-card">
              <span>Storage change</span>
              <strong className={stats.savedBytes >= 0 ? 'text-teal-700' : 'text-amber-700'}>
                {stats.savedBytes >= 0 ? '-' : '+'}
                {formatFileSize(Math.abs(stats.savedBytes))}
              </strong>
              <p>
                {stats.totalOutput
                  ? `${Math.abs(stats.savedPercent)}% ${stats.savedBytes >= 0 ? 'smaller' : 'larger'}`
                  : 'Waiting for output'}
              </p>
            </div>
            <div className="metric-card">
              <span>Completed</span>
              <strong>{stats.success}/{queue.length || 0}</strong>
            </div>
          </div>

          <section className="panel min-h-[560px] p-4">
            <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold">Conversion queue</h2>
                <p className="text-sm text-slate-500">
                  {stats.pending} ready, {stats.converting} running, {stats.success} done, {stats.error} errors
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="progress-track w-32 sm:w-44">
                  <div className="progress-fill" style={{width: `${stats.completion}%`}}></div>
                </div>
                <span className="value-badge">{stats.completion}%</span>
              </div>
            </div>

            {queue.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <ClipboardPaste className="h-8 w-8" />
                </div>
                <h3 className="font-display text-2xl font-semibold">Your batch is ready when you are</h3>
                <p className="max-w-md text-center text-sm text-slate-500">
                  Add images from your device or paste from the clipboard. Each file keeps its own target format,
                  status, preview, and output size.
                </p>
              </div>
            ) : (
              <ul className="queue-list">
                <AnimatePresence>
                  {queue.map(item => {
                    const outputDelta =
                      item.outputSize && item.originalFile.size
                        ? Math.round(((item.originalFile.size - item.outputSize) / item.originalFile.size) * 100)
                        : null;

                    return (
                      <motion.li
                        key={item.id}
                        initial={{opacity: 0, y: 8}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0, scale: 0.98}}
                        transition={{duration: 0.18}}
                        className="queue-item"
                      >
                        <div className="thumb-frame">
                          <img src={item.previewUrl} alt="" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold text-slate-950" title={item.originalFile.name}>
                              {item.originalFile.name}
                            </p>
                            <span className={`queue-status status-${item.status}`}>
                              {item.status === 'idle' && 'Ready'}
                              {item.status === 'converting' && 'Converting'}
                              {item.status === 'success' && 'Done'}
                              {item.status === 'error' && 'Error'}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                            <span>{formatFileSize(item.originalFile.size)}</span>
                            <span>{getSourceLabel(item.originalFile)}</span>
                            <span>{formatDimensions(item.originalDimensions)}</span>
                          </div>

                          {item.status === 'success' && item.outputSize && (
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                              <span className="text-slate-600">
                                Output {formatFileSize(item.outputSize)}
                              </span>
                              <span className="text-slate-600">{formatDimensions(item.outputDimensions)}</span>
                              {outputDelta !== null && (
                                <span className={outputDelta >= 0 ? 'text-teal-700' : 'text-amber-700'}>
                                  {outputDelta >= 0 ? `${outputDelta}% smaller` : `${Math.abs(outputDelta)}% larger`}
                                </span>
                              )}
                            </div>
                          )}

                          {item.status === 'error' && item.errorMessage && (
                            <p className="mt-2 text-sm text-red-600">{item.errorMessage}</p>
                          )}
                        </div>

                        <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[220px] sm:flex-row sm:items-center sm:justify-end">
                          <div className="flex items-center gap-2">
                            <ArrowRight className="hidden h-4 w-4 text-slate-400 sm:block" />
                            <select
                              value={item.targetFormat}
                              onChange={event => updateItemFormat(item.id, event.target.value as TargetFormat)}
                              disabled={item.status === 'converting'}
                              className="select-field"
                              title="Output format"
                            >
                              <option value="image/jpeg">JPG</option>
                              <option value="image/png">PNG</option>
                              <option value="image/webp">WEBP</option>
                            </select>
                          </div>

                          <div className="flex items-center justify-end gap-2">
                            {item.status === 'converting' && (
                              <span className="spinner" aria-label="Converting"></span>
                            )}

                            {item.status === 'success' && item.outputUrl && (
                              <a
                                href={item.outputUrl}
                                download={item.outputName}
                                className="icon-button success"
                                title="Download converted image"
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            )}

                            {(item.status === 'success' || item.status === 'error') && (
                              <button
                                type="button"
                                onClick={() => resetItem(item.id)}
                                className="icon-button"
                                title="Reset this file"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </button>
                            )}

                            {item.status === 'error' && (
                              <AlertCircle className="h-5 w-5 text-red-500" aria-hidden="true" />
                            )}

                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="icon-button danger"
                              title="Remove file"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </section>
        </section>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-sm text-slate-500 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-5">
          <ImageIcon className="h-4 w-4" />
          <span>All conversion work stays inside the browser tab.</span>
        </div>
      </footer>
    </div>
  );
}
