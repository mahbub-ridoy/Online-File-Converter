import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertCircle,
  BadgeCheck,
  Download,
  FileArchive,
  ImageIcon,
  Layers,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import JSZip from 'jszip';

type TargetFormat = 'image/jpeg' | 'image/png' | 'image/webp';
type QueueStatus = 'ready' | 'converting' | 'done' | 'error';

interface QueueItem {
  id: string;
  file: File;
  previewUrl: string;
  targetFormat: TargetFormat;
  status: QueueStatus;
  outputUrl?: string;
  outputName?: string;
  outputBlob?: Blob;
  outputSize?: number;
  error?: string;
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

const FORMAT_OPTIONS: {label: string; value: TargetFormat}[] = [
  {label: 'JPG', value: 'image/jpeg'},
  {label: 'PNG', value: 'image/png'},
  {label: 'WEBP', value: 'image/webp'},
];

function createId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isSupportedImage(file: File) {
  return SUPPORTED_TYPES.includes(file.type) || file.type.startsWith('image/') || SUPPORTED_EXTENSIONS.test(file.name);
}

function formatFileSize(bytes = 0) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(1024, index)).toFixed(2))} ${sizes[index]}`;
}

function getExtension(format: TargetFormat) {
  if (format === 'image/jpeg') return 'jpg';
  if (format === 'image/png') return 'png';
  return 'webp';
}

function getBaseName(fileName: string) {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function revokeUrls(item: QueueItem) {
  URL.revokeObjectURL(item.previewUrl);
  if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
}

export default function App() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [format, setFormat] = useState<TargetFormat>('image/webp');
  const [quality, setQuality] = useState(0.86);
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [maxWidth, setMaxWidth] = useState(1920);
  const [maxHeight, setMaxHeight] = useState(1080);
  const [isDragging, setIsDragging] = useState(false);
  const [theme, setTheme] = useState<'aurora' | 'midnight'>('aurora');

  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<QueueItem[]>([]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    return () => queueRef.current.forEach(revokeUrls);
  }, []);

  const stats = useMemo(() => {
    const original = queue.reduce((sum, item) => sum + item.file.size, 0);
    const output = queue.reduce((sum, item) => sum + (item.outputSize ?? 0), 0);
    const done = queue.filter(item => item.status === 'done').length;
    const errors = queue.filter(item => item.status === 'error').length;
    const completion = queue.length ? Math.round(((done + errors) / queue.length) * 100) : 0;
    return {original, output, done, errors, completion};
  }, [queue]);

  const addFiles = (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(isSupportedImage);
    if (!validFiles.length) return;

    setQueue(items => [
      ...items,
      ...validFiles.map(file => ({
        id: createId(),
        file,
        previewUrl: URL.createObjectURL(file),
        targetFormat: format,
        status: 'ready' as QueueStatus,
      })),
    ]);
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.some(isSupportedImage)) addFiles(files);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  });

  const clearAll = () => {
    queue.forEach(revokeUrls);
    setQueue([]);
  };

  const removeItem = (id: string) => {
    setQueue(items => {
      const item = items.find(current => current.id === id);
      if (item) revokeUrls(item);
      return items.filter(current => current.id !== id);
    });
  };

  const updateFormat = (id: string, targetFormat: TargetFormat) => {
    setQueue(items =>
      items.map(item => {
        if (item.id !== id) return item;
        if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
        return {
          ...item,
          targetFormat,
          status: 'ready',
          outputUrl: undefined,
          outputName: undefined,
          outputBlob: undefined,
          outputSize: undefined,
          error: undefined,
        };
      }),
    );
  };

  const convertItem = (item: QueueItem) => {
    return new Promise<Pick<QueueItem, 'outputBlob' | 'outputName' | 'outputSize' | 'outputUrl'>>((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        if (!sourceWidth || !sourceHeight) {
          reject(new Error('Could not read this image size.'));
          return;
        }

        const ratio = resizeEnabled ? Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1) : 1;
        const width = Math.max(1, Math.round(sourceWidth * ratio));
        const height = Math.max(1, Math.round(sourceHeight * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Could not create canvas.'));
          return;
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        if (item.targetFormat === 'image/jpeg') {
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, width, height);
        }
        context.drawImage(image, 0, 0, width, height);

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error('This browser could not export that format.'));
              return;
            }
            resolve({
              outputBlob: blob,
              outputName: `${getBaseName(item.file.name)}-converted.${getExtension(item.targetFormat)}`,
              outputSize: blob.size,
              outputUrl: URL.createObjectURL(blob),
            });
          },
          item.targetFormat,
          item.targetFormat === 'image/png' ? undefined : quality,
        );
      };

      image.onerror = () => reject(new Error('Could not decode this image.'));
      image.src = item.previewUrl;
    });
  };

  const convertAll = async () => {
    const readyItems = queueRef.current.filter(item => item.status === 'ready' || item.status === 'error');
    for (const item of readyItems) {
      setQueue(items => items.map(current => (current.id === item.id ? {...current, status: 'converting', error: undefined} : current)));

      try {
        const latest = queueRef.current.find(current => current.id === item.id) ?? item;
        const output = await convertItem(latest);
        setQueue(items =>
          items.map(current => {
            if (current.id !== item.id) return current;
            if (current.outputUrl) URL.revokeObjectURL(current.outputUrl);
            return {...current, ...output, status: 'done'};
          }),
        );
      } catch (error) {
        setQueue(items =>
          items.map(current =>
            current.id === item.id
              ? {...current, status: 'error', error: error instanceof Error ? error.message : String(error)}
              : current,
          ),
        );
      }
    }
  };

  const downloadZip = async () => {
    const doneItems = queue.filter(item => item.status === 'done' && item.outputBlob && item.outputName);
    if (!doneItems.length) return;

    const zip = new JSZip();
    doneItems.forEach(item => {
      if (item.outputBlob && item.outputName) zip.file(item.outputName, item.outputBlob);
    });

    const blob = await zip.generateAsync({type: 'blob', compression: 'DEFLATE'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `localconvert-${Date.now()}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const canConvert = queue.some(item => item.status === 'ready' || item.status === 'error');
  const isConverting = queue.some(item => item.status === 'converting');
  const canDownloadZip = queue.some(item => item.status === 'done');

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
              <h1 className="font-display text-2xl font-black tracking-tight">LocalConvert</h1>
              <p className="muted-text text-sm">Private image conversion in your browser.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setTheme(current => (current === 'aurora' ? 'midnight' : 'aurora'))}
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
              <ImageIcon className="h-4 w-4 text-fuchsia-500" />
              {queue.length} files
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="simple-layout">
          <section
            onDragOver={event => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={event => {
              event.preventDefault();
              setIsDragging(false);
              addFiles(event.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`upload-zone ${isDragging ? 'upload-zone-active' : ''}`}
          >
            <input
              type="file"
              multiple
              accept={`${SUPPORTED_TYPES.join(',')},.jpg,.jpeg,.png,.webp,.bmp,.gif,.svg,.avif`}
              className="hidden"
              ref={inputRef}
              onChange={event => {
                if (event.target.files) addFiles(event.target.files);
                event.target.value = '';
              }}
            />

            <div className="upload-icon">
              <UploadCloud className="h-10 w-10" strokeWidth={1.7} />
            </div>

            <div className="space-y-2 text-center">
              <h2 className="font-display text-2xl font-black tracking-tight">Choose images</h2>
              <p className="muted-text text-sm">Drag files here or click to browse.</p>
            </div>

            <div className="flex flex-wrap justify-center gap-2 text-xs font-bold uppercase">
              <span className="format-chip">JPG</span>
              <span className="format-chip">PNG</span>
              <span className="format-chip">WEBP</span>
              <span className="format-chip">SVG</span>
              <span className="format-chip">AVIF</span>
            </div>
          </section>

          <aside className="panel simple-settings">
            <div>
              <h2 className="font-display text-xl font-black">Convert options</h2>
              <p className="muted-text text-sm">The basics only. Choose a format, optional resize, then convert.</p>
            </div>

            <div className="settings-block">
              <label className="control-label">Output format</label>
              <div className="segmented-control">
                {FORMAT_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setFormat(option.value);
                      setQueue(items =>
                        items.map(item => (item.status === 'done' ? item : {...item, targetFormat: option.value})),
                      );
                    }}
                    className={format === option.value ? 'is-selected' : ''}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-block">
              <div className="settings-row">
                <label className="control-label">Quality</label>
                <span className="value-badge">{Math.round(quality * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.04"
                value={quality}
                onChange={event => setQuality(Number(event.target.value))}
              />
            </div>

            <div className="settings-block">
              <label className="toggle-line">
                <input type="checkbox" checked={resizeEnabled} onChange={event => setResizeEnabled(event.target.checked)} />
                Resize images
              </label>
              {resizeEnabled && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mini-label">Max width</label>
                    <input
                      type="number"
                      min="10"
                      value={maxWidth}
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
                      onChange={event => setMaxHeight(Math.max(10, Number(event.target.value) || 10))}
                      className="input-field"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="action-stack">
              <button type="button" onClick={convertAll} disabled={!canConvert || isConverting} className="primary-button">
                {isConverting ? 'Converting...' : 'Convert files'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={downloadZip} disabled={!canDownloadZip} className="secondary-button">
                  <FileArchive className="h-4 w-4" />
                  ZIP
                </button>
                <button type="button" onClick={clearAll} disabled={!queue.length} className="danger-button">
                  <Trash2 className="h-4 w-4" />
                  Clear
                </button>
              </div>
            </div>
          </aside>
        </section>

        {queue.length > 0 && (
          <div className="compact-metrics">
            <span>{queue.length} files</span>
            <span>{formatFileSize(stats.original)} original</span>
            <span>{formatFileSize(stats.output)} converted</span>
            <span>{stats.completion}% done</span>
          </div>
        )}

        <section className="panel min-h-[420px] p-4">
          <div className="mb-4 flex flex-col gap-3 border-divider pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-display text-xl font-black">Files</h2>
              <p className="muted-text text-sm">
                {stats.done} converted, {stats.errors} errors
              </p>
            </div>
          </div>

          {queue.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <UploadCloud className="h-8 w-8" />
              </div>
              <h3 className="font-display text-2xl font-black">No files yet</h3>
              <p className="muted-text max-w-md text-center text-sm">Add images above, then convert them locally.</p>
            </div>
          ) : (
            <ul className="queue-list">
              {queue.map(item => (
                <li key={item.id} className="queue-item">
                  <div className="thumb-frame">
                    <img src={item.previewUrl} alt="" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <span className={`queue-status status-${item.status}`}>{item.status}</span>
                    </div>
                    <div className="muted-text flex flex-wrap gap-x-3 gap-y-1 text-sm">
                      <span>{formatFileSize(item.file.size)}</span>
                      {item.outputSize && <span>Output {formatFileSize(item.outputSize)}</span>}
                    </div>
                    {item.error && <p className="mt-2 text-sm text-red-500">{item.error}</p>}
                  </div>

                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[230px] sm:flex-row sm:items-center sm:justify-end">
                    <select
                      value={item.targetFormat}
                      onChange={event => updateFormat(item.id, event.target.value as TargetFormat)}
                      disabled={item.status === 'converting'}
                      className="select-field"
                    >
                      <option value="image/jpeg">JPG</option>
                      <option value="image/png">PNG</option>
                      <option value="image/webp">WEBP</option>
                    </select>

                    <div className="flex items-center justify-end gap-2">
                      {item.status === 'error' && <AlertCircle className="h-5 w-5 text-red-500" aria-hidden="true" />}
                      {item.outputUrl && (
                        <a href={item.outputUrl} download={item.outputName} className="icon-button success" title="Download">
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                      <button type="button" onClick={() => removeItem(item.id)} className="icon-button danger" title="Remove">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
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
