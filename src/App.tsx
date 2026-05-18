import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardPaste,
  Crop,
  Download,
  FileArchive,
  FlipHorizontal,
  FlipVertical,
  Gauge,
  ImageIcon,
  ImagePlus,
  Layers,
  Maximize2,
  Moon,
  PackageOpen,
  Palette,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';
import {AnimatePresence, motion} from 'motion/react';
import JSZip from 'jszip';

type TargetFormat = 'image/jpeg' | 'image/png' | 'image/webp';
type QueueStatus = 'idle' | 'converting' | 'success' | 'error';
type ResizeMode = 'fit' | 'exact' | 'pad' | 'stretch';
type ThemeMode = 'aurora' | 'midnight';
type FilterMode = 'none' | 'vivid' | 'mono' | 'warm' | 'cool' | 'soft';

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
  mode: ResizeMode;
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
  {label: 'JPG', value: 'image/jpeg', detail: 'Small, compatible photos'},
  {label: 'PNG', value: 'image/png', detail: 'Crisp output with transparency'},
  {label: 'WEBP', value: 'image/webp', detail: 'Modern, lightweight web images'},
];

const RESIZE_PRESETS: ResizePreset[] = [
  {label: 'Original', width: 1920, height: 1080, enabled: false, mode: 'fit'},
  {label: '4K', width: 3840, height: 2160, enabled: true, mode: 'fit'},
  {label: 'HD', width: 1920, height: 1080, enabled: true, mode: 'fit'},
  {label: 'Square', width: 1080, height: 1080, enabled: true, mode: 'exact'},
  {label: 'Story', width: 1080, height: 1920, enabled: true, mode: 'pad'},
  {label: 'Avatar', width: 512, height: 512, enabled: true, mode: 'exact'},
];

const FILTER_OPTIONS: {label: string; value: FilterMode; css: string; detail: string}[] = [
  {label: 'Clean', value: 'none', css: 'none', detail: 'No filter'},
  {label: 'Vivid', value: 'vivid', css: 'contrast(1.08) saturate(1.25)', detail: 'Punchier color'},
  {label: 'Mono', value: 'mono', css: 'grayscale(1) contrast(1.08)', detail: 'Black and white'},
  {label: 'Warm', value: 'warm', css: 'sepia(0.18) saturate(1.12) brightness(1.03)', detail: 'Soft warm tone'},
  {label: 'Cool', value: 'cool', css: 'saturate(1.08) hue-rotate(12deg) brightness(1.02)', detail: 'Cooler tone'},
  {label: 'Soft', value: 'soft', css: 'contrast(0.94) saturate(0.92) brightness(1.04)', detail: 'Gentle editorial finish'},
];

const QUALITY_PRESETS = [
  {label: 'Tiny', value: 0.55},
  {label: 'Balanced', value: 0.82},
  {label: 'Premium', value: 0.94},
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

function cleanNamePart(value: string) {
  return value
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

function getFilterCss(filter: FilterMode, brightness = 100, contrast = 100, saturation = 100) {
  const preset = FILTER_OPTIONS.find(option => option.value === filter)?.css ?? 'none';
  const manual = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
  return preset === 'none' ? manual : `${preset} ${manual}`;
}

export default function App() {
  const [queue, setQueue] = useState<FileQueueItem[]>([]);
  const [globalFormat, setGlobalFormat] = useState<TargetFormat>('image/webp');
  const [isDragging, setIsDragging] = useState(false);
  const [quality, setQuality] = useState(0.88);
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [resizeMode, setResizeMode] = useState<ResizeMode>('fit');
  const [maxWidth, setMaxWidth] = useState(1920);
  const [maxHeight, setMaxHeight] = useState(1080);
  const [jpegBackground, setJpegBackground] = useState('#ffffff');
  const [filenamePrefix, setFilenamePrefix] = useState('');
  const [filenameSuffix, setFilenameSuffix] = useState('converted');
  const [filterMode, setFilterMode] = useState<FilterMode>('none');
  const [rotation, setRotation] = useState(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [paddingPercent, setPaddingPercent] = useState(0);
  const [includeOriginalInZip, setIncludeOriginalInZip] = useState(false);
  const [autoConvertOnDrop, setAutoConvertOnDrop] = useState(false);
  const [replaceCompleted, setReplaceCompleted] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('aurora');

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
      if (validFiles.length === 0) return [];

      const newItems: FileQueueItem[] = validFiles.map(file => ({
        id: createId(),
        originalFile: file,
        targetFormat: globalFormat,
        status: 'idle',
        previewUrl: URL.createObjectURL(file),
      }));

      setQueue(prev => [...prev, ...newItems]);
      newItems.forEach(readDimensions);
      return newItems;
    },
    [globalFormat, readDimensions],
  );

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.some(isSupportedImage)) {
        const newItems = addFilesToQueue(files);
        if (autoConvertOnDrop && newItems.length > 0) {
          setTimeout(() => handleConvertAll(newItems), 80);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  });

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

  const resetAllOutputs = () => {
    setQueue(prev => prev.map(item => resetItemOutput(item)));
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

  const duplicateItem = (id: string) => {
    setQueue(prev => {
      const source = prev.find(item => item.id === id);
      if (!source) return prev;

      const duplicate: FileQueueItem = {
        id: createId(),
        originalFile: source.originalFile,
        targetFormat: source.targetFormat,
        status: 'idle',
        previewUrl: URL.createObjectURL(source.originalFile),
        originalDimensions: source.originalDimensions,
      };

      return [...prev, duplicate];
    });
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
        item.status === 'idle' || item.status === 'error' || replaceCompleted
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
    setResizeMode(preset.mode);
    setMaxWidth(preset.width);
    setMaxHeight(preset.height);
  };

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
        const newItems = addFilesToQueue(event.dataTransfer.files);
        if (autoConvertOnDrop && newItems.length > 0) {
          setTimeout(() => handleConvertAll(newItems), 80);
        }
      }
    },
    [addFilesToQueue, autoConvertOnDrop],
  );

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const newItems = addFilesToQueue(event.target.files);
      if (autoConvertOnDrop && newItems.length > 0) {
        setTimeout(() => handleConvertAll(newItems), 80);
      }
      event.target.value = '';
    }
  };

  const getOutputDimensions = (width: number, height: number) => {
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const rotated = normalizedRotation === 90 || normalizedRotation === 270;
    const baseWidth = rotated ? height : width;
    const baseHeight = rotated ? width : height;

    if (!resizeEnabled) {
      return {width: baseWidth, height: baseHeight};
    }

    const widthLimit = Math.max(10, maxWidth);
    const heightLimit = Math.max(10, maxHeight);

    if (resizeMode === 'exact' || resizeMode === 'pad' || resizeMode === 'stretch') {
      return {width: widthLimit, height: heightLimit};
    }

    const ratio = Math.min(widthLimit / baseWidth, heightLimit / baseHeight, 1);
    return {
      width: Math.max(1, Math.round(baseWidth * ratio)),
      height: Math.max(1, Math.round(baseHeight * ratio)),
    };
  };

  const buildOutputName = (file: File, targetFormat: TargetFormat) => {
    const prefix = cleanNamePart(filenamePrefix);
    const suffix = cleanNamePart(filenameSuffix);
    const baseName = getBaseName(file.name);
    const extension = getFormatExt(targetFormat);
    return `${prefix ? `${prefix}-` : ''}${baseName}${suffix ? `-${suffix}` : ''}.${extension}`;
  };

  const drawImageToCanvas = (
    context: CanvasRenderingContext2D,
    image: HTMLImageElement,
    dimensions: ImageDimensions,
    sourceWidth: number,
    sourceHeight: number,
  ) => {
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const rotated = normalizedRotation === 90 || normalizedRotation === 270;
    const drawWidth = rotated ? dimensions.height : dimensions.width;
    const drawHeight = rotated ? dimensions.width : dimensions.height;

    context.save();
    context.filter = getFilterCss(filterMode, brightness, contrast, saturation);
    context.translate(dimensions.width / 2, dimensions.height / 2);
    context.rotate((normalizedRotation * Math.PI) / 180);
    context.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);

    if (resizeMode === 'exact' && resizeEnabled) {
      const scale = Math.max(drawWidth / sourceWidth, drawHeight / sourceHeight);
      const cropWidth = drawWidth / scale;
      const cropHeight = drawHeight / scale;
      const cropX = (sourceWidth - cropWidth) / 2;
      const cropY = (sourceHeight - cropHeight) / 2;
      context.drawImage(image, cropX, cropY, cropWidth, cropHeight, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    } else if (resizeMode === 'pad' && resizeEnabled) {
      const safePadding = Math.min(Math.max(paddingPercent, 0), 45) / 100;
      const innerWidth = drawWidth * (1 - safePadding * 2);
      const innerHeight = drawHeight * (1 - safePadding * 2);
      const scale = Math.min(innerWidth / sourceWidth, innerHeight / sourceHeight);
      const paddedWidth = sourceWidth * scale;
      const paddedHeight = sourceHeight * scale;
      context.drawImage(image, -paddedWidth / 2, -paddedHeight / 2, paddedWidth, paddedHeight);
    } else if (resizeMode === 'stretch' && resizeEnabled) {
      context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    } else {
      context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    }

    context.restore();
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

        const dimensions = getOutputDimensions(sourceWidth, sourceHeight);
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

        if (item.targetFormat === 'image/jpeg' || (resizeEnabled && resizeMode === 'pad')) {
          context.fillStyle = jpegBackground;
          context.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          context.clearRect(0, 0, canvas.width, canvas.height);
        }

        drawImageToCanvas(context, img, dimensions, sourceWidth, sourceHeight);

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

  async function handleConvertAll(specificItems?: FileQueueItem[]) {
    const sourceItems = specificItems ?? queue;
    const itemsToConvert = sourceItems.filter(
      item => item.status === 'idle' || item.status === 'error' || replaceCompleted,
    );
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
        const latestItem = queueRef.current.find(queueItem => queueItem.id === item.id) ?? item;
        const result = await convertFile(latestItem);
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
  }

  const handleDownloadAllZip = async () => {
    const successItems = queue.filter(
      item => item.status === 'success' && item.outputBlob && item.outputName,
    );

    if (successItems.length === 0) return;

    const zip = new JSZip();
    successItems.forEach(item => {
      if (item.outputName && item.outputBlob) {
        zip.file(`converted/${item.outputName}`, item.outputBlob);
      }
      if (includeOriginalInZip) {
        zip.file(`originals/${item.originalFile.name}`, item.originalFile);
      }
    });

    const content = await zip.generateAsync({type: 'blob', compression: 'DEFLATE'});
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `localconvert-${Date.now()}.zip`;
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

  const canConvert = queue.some(item => item.status === 'idle' || item.status === 'error' || replaceCompleted);
  const canDownloadAll = queue.some(item => item.status === 'success');
  const isWorking = queue.some(item => item.status === 'converting');
  const acceptValue = `${SUPPORTED_TYPES.join(',')},.jpg,.jpeg,.png,.webp,.bmp,.gif,.svg,.avif`;
  const selectedFilter = FILTER_OPTIONS.find(option => option.value === filterMode);

  return (
    <div className={`app-shell theme-${theme} min-h-screen text-app`}>
      <div className="animated-backdrop" aria-hidden="true">
        <span className="mesh mesh-one"></span>
        <span className="mesh mesh-two"></span>
        <span className="mesh mesh-three"></span>
        <span className="grid-glow"></span>
      </div>

      <header className="app-header">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="brand-mark">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-black tracking-tight">LocalConvert Studio</h1>
              <p className="muted-text text-sm">Fast private image conversion, tuned like a creative app.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setTheme(value => (value === 'aurora' ? 'midnight' : 'aurora'))}
              className="status-pill interactive"
              title="Switch theme"
            >
              {theme === 'aurora' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {theme === 'aurora' ? 'Midnight' : 'Aurora'}
            </button>
            <span className="status-pill">
              <ShieldCheck className="h-4 w-4 text-teal-500" />
              No uploads
            </span>
            <span className="status-pill">
              <Sparkles className="h-4 w-4 text-fuchsia-500" />
              {queue.length} queued
            </span>
            <span className="status-pill">
              <Gauge className="h-4 w-4 text-sky-500" />
              {stats.completion}% done
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="hero-panel compact-hero">
          <div>
            <span className="eyebrow">
              <Sparkles className="h-4 w-4" />
              private studio mode
            </span>
            <h2>Convert, resize, format, and download images locally.</h2>
            <p className="muted-text mt-3 max-w-2xl text-sm">
              A clean three-step flow inspired by modern converters: add files, choose output, then tune optional formatting.
            </p>
          </div>
          <div className="hero-actions">
            <span>{selectedFilter?.label ?? 'Clean'} finish</span>
            <span>{resizeEnabled ? `${resizeMode} ${maxWidth} x ${maxHeight}` : 'Original size'}</span>
            <span>{Math.round(quality * 100)}% quality</span>
          </div>
        </section>

        <section className="converter-flow">
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
              animate={{scale: isDragging ? 1.06 : 1, y: isDragging ? -6 : 0}}
              className="upload-icon"
            >
              <UploadCloud className="h-10 w-10" strokeWidth={1.7} />
            </motion.div>

            <div className="space-y-2 text-center">
              <h3 className="font-display text-2xl font-black tracking-tight">Choose or drop files</h3>
              <p className="muted-text text-sm">Drag images here, browse, or paste from clipboard.</p>
            </div>

            <div className="flex flex-wrap justify-center gap-2 text-xs font-bold uppercase">
              <span className="format-chip">JPG</span>
              <span className="format-chip">PNG</span>
              <span className="format-chip">WEBP</span>
              <span className="format-chip">SVG</span>
              <span className="format-chip">AVIF</span>
            </div>
          </section>

          <section className="panel flow-card">
            <span className="step-badge">2</span>
            <div>
              <h3 className="font-display text-lg font-black">Choose output</h3>
              <p className="muted-text text-sm">Pick the format for new and ready files.</p>
            </div>
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
            <div className="mini-summary">
              <span>{queue.length} files</span>
              <span>{formatFileSize(stats.totalOriginal)}</span>
            </div>
          </section>

          <section className="panel flow-card">
            <span className="step-badge">3</span>
            <div>
              <h3 className="font-display text-lg font-black">Convert</h3>
              <p className="muted-text text-sm">Process everything in this browser tab.</p>
            </div>
            <button
              type="button"
              onClick={() => handleConvertAll()}
              disabled={!canConvert || isWorking}
              className="primary-button"
            >
              <ImagePlus className="h-4 w-4" />
              {isWorking ? 'Converting...' : 'Convert files'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDownloadAllZip}
                disabled={!canDownloadAll}
                className="secondary-button"
              >
                <FileArchive className="h-4 w-4" />
                ZIP
              </button>
              <button type="button" onClick={clearAll} disabled={queue.length === 0} className="danger-button">
                <Trash2 className="h-4 w-4" />
                Clear
              </button>
            </div>
          </section>
        </section>

        <section className="options-grid">
          <section className="panel option-card">
            <div className="option-heading">
              <SlidersHorizontal className="panel-icon h-5 w-5" />
              <div>
                <h3>Quality</h3>
                <p>Compression and output size.</p>
              </div>
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
            <div className="mt-3 grid grid-cols-3 gap-2">
              {QUALITY_PRESETS.map(preset => (
                <button key={preset.label} type="button" onClick={() => setQuality(preset.value)} className="preset-button">
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          <section className="panel option-card wide">
            <div className="option-heading">
              <Maximize2 className="panel-icon h-5 w-5" />
              <div>
                <h3>Resize and canvas</h3>
                <p>Fit, crop, pad, or stretch to exact dimensions.</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={resizeEnabled} onChange={event => setResizeEnabled(event.target.checked)} />
                <span></span>
              </label>
            </div>
            <div className="mode-control four">
              {(['fit', 'exact', 'pad', 'stretch'] as ResizeMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  className={resizeMode === mode ? 'is-selected' : ''}
                  onClick={() => setResizeMode(mode)}
                >
                  {mode === 'exact' ? 'Crop' : mode}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <label className="mini-label">Width</label>
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
                <label className="mini-label">Height</label>
                <input
                  type="number"
                  min="10"
                  value={maxHeight}
                  disabled={!resizeEnabled}
                  onChange={event => setMaxHeight(Math.max(10, Number(event.target.value) || 10))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="mini-label">Padding</label>
                <input
                  type="number"
                  min="0"
                  max="45"
                  value={paddingPercent}
                  disabled={!resizeEnabled || resizeMode !== 'pad'}
                  onChange={event => setPaddingPercent(Math.min(45, Math.max(0, Number(event.target.value) || 0)))}
                  className="input-field"
                />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 lg:grid-cols-6">
              {RESIZE_PRESETS.map(preset => (
                <button key={preset.label} type="button" onClick={() => applyResizePreset(preset)} className="preset-button">
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          <section className="panel option-card">
            <div className="option-heading">
              <Palette className="panel-icon h-5 w-5" />
              <div>
                <h3>Color finish</h3>
                <p>Preset looks plus manual tuning.</p>
              </div>
            </div>
            <div className="filter-grid">
              {FILTER_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilterMode(option.value)}
                  className={filterMode === option.value ? 'is-selected' : ''}
                  title={option.detail}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="slider-stack">
              <label>Brightness <span>{brightness}%</span></label>
              <input type="range" min="50" max="150" value={brightness} onChange={event => setBrightness(Number(event.target.value))} />
              <label>Contrast <span>{contrast}%</span></label>
              <input type="range" min="50" max="150" value={contrast} onChange={event => setContrast(Number(event.target.value))} />
              <label>Saturation <span>{saturation}%</span></label>
              <input type="range" min="0" max="200" value={saturation} onChange={event => setSaturation(Number(event.target.value))} />
            </div>
          </section>

          <section className="panel option-card">
            <div className="option-heading">
              <Crop className="panel-icon h-5 w-5" />
              <div>
                <h3>Transform</h3>
                <p>Rotate and mirror before export.</p>
              </div>
            </div>
            <div className="tool-grid">
              <button type="button" onClick={() => setRotation(value => (value + 90) % 360)}>
                <RotateCw className="h-4 w-4" />
                {rotation} deg
              </button>
              <button type="button" className={flipHorizontal ? 'is-selected' : ''} onClick={() => setFlipHorizontal(value => !value)}>
                <FlipHorizontal className="h-4 w-4" />
                Flip X
              </button>
              <button type="button" className={flipVertical ? 'is-selected' : ''} onClick={() => setFlipVertical(value => !value)}>
                <FlipVertical className="h-4 w-4" />
                Flip Y
              </button>
            </div>
            <div className="mt-3 grid grid-cols-[78px_minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <div>
                <label className="mini-label">Fill</label>
                <input
                  type="color"
                  value={jpegBackground}
                  onChange={event => setJpegBackground(event.target.value)}
                  className="color-input"
                  title="Background fill for JPEG and padded canvas"
                />
              </div>
              <div>
                <label className="mini-label">Prefix</label>
                <input type="text" value={filenamePrefix} onChange={event => setFilenamePrefix(event.target.value)} placeholder="client" className="input-field" />
              </div>
              <div>
                <label className="mini-label">Suffix</label>
                <input type="text" value={filenameSuffix} onChange={event => setFilenameSuffix(event.target.value)} placeholder="converted" className="input-field" />
              </div>
            </div>
          </section>

          <section className="panel option-card">
            <div className="option-heading">
              <PackageOpen className="panel-icon h-5 w-5" />
              <div>
                <h3>Batch behavior</h3>
                <p>Decide how exports are handled.</p>
              </div>
            </div>
            <div className="toggle-stack">
              <label>
                <input type="checkbox" checked={autoConvertOnDrop} onChange={event => setAutoConvertOnDrop(event.target.checked)} />
                Convert immediately after adding files
              </label>
              <label>
                <input type="checkbox" checked={replaceCompleted} onChange={event => setReplaceCompleted(event.target.checked)} />
                Re-convert completed files when settings change
              </label>
              <label>
                <input type="checkbox" checked={includeOriginalInZip} onChange={event => setIncludeOriginalInZip(event.target.checked)} />
                Include originals inside ZIP
              </label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={resetAllOutputs} disabled={!canDownloadAll} className="secondary-button">
                <RefreshCw className="h-4 w-4" />
                Reset
              </button>
              <button type="button" onClick={clearCompleted} disabled={!canDownloadAll} className="secondary-button">
                <CheckCircle2 className="h-4 w-4" />
                Clear done
              </button>
            </div>
          </section>
        </section>

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
              <strong className={stats.savedBytes >= 0 ? 'text-good' : 'text-warn'}>
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
            <div className="mb-4 flex flex-col gap-3 border-divider pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-display text-xl font-black">Conversion queue</h2>
                <p className="muted-text text-sm">
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
                <h3 className="font-display text-2xl font-black">Your batch is ready when you are</h3>
                <p className="muted-text max-w-md text-center text-sm">
                  Add images, choose a finish, crop for platforms, and export a polished ZIP in one pass.
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
                          <img src={item.previewUrl} alt="" style={{filter: getFilterCss(filterMode, brightness, contrast, saturation)}} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <p className="truncate font-bold" title={item.originalFile.name}>
                              {item.originalFile.name}
                            </p>
                            <span className={`queue-status status-${item.status}`}>
                              {item.status === 'idle' && 'Ready'}
                              {item.status === 'converting' && 'Converting'}
                              {item.status === 'success' && 'Done'}
                              {item.status === 'error' && 'Error'}
                            </span>
                          </div>

                          <div className="muted-text flex flex-wrap gap-x-3 gap-y-1 text-sm">
                            <span>{formatFileSize(item.originalFile.size)}</span>
                            <span>{getSourceLabel(item.originalFile)}</span>
                            <span>{formatDimensions(item.originalDimensions)}</span>
                          </div>

                          {item.status === 'success' && item.outputSize && (
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                              <span className="soft-text">Output {formatFileSize(item.outputSize)}</span>
                              <span className="soft-text">{formatDimensions(item.outputDimensions)}</span>
                              {outputDelta !== null && (
                                <span className={outputDelta >= 0 ? 'text-good' : 'text-warn'}>
                                  {outputDelta >= 0 ? `${outputDelta}% smaller` : `${Math.abs(outputDelta)}% larger`}
                                </span>
                              )}
                            </div>
                          )}

                          {item.status === 'error' && item.errorMessage && (
                            <p className="mt-2 text-sm text-red-500">{item.errorMessage}</p>
                          )}
                        </div>

                        <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[252px] sm:flex-row sm:items-center sm:justify-end">
                          <div className="flex items-center gap-2">
                            <ArrowRight className="muted-icon hidden h-4 w-4 sm:block" />
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

                            <button
                              type="button"
                              onClick={() => duplicateItem(item.id)}
                              className="icon-button"
                              title="Duplicate file"
                            >
                              <Zap className="h-4 w-4" />
                            </button>

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
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-sm sm:px-6 lg:px-8">
        <div className="footer-line">
          <ImageIcon className="h-4 w-4" />
          <span>All conversion work stays inside the browser tab.</span>
          <BadgeCheck className="h-4 w-4" />
        </div>
      </footer>
    </div>
  );
}
