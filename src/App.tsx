import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  UploadCloud, X, FileImage, Download, CheckCircle2, AlertCircle, ArrowRight, 
  ImageIcon, Layers, Settings2, SlidersHorizontal, PackageOpen 
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import JSZip from 'jszip';

type TargetFormat = 'image/jpeg' | 'image/png' | 'image/webp';

interface FileQueueItem {
  id: string;
  originalFile: File;
  targetFormat: TargetFormat;
  status: 'idle' | 'converting' | 'success' | 'error';
  errorMessage?: string;
  outputUrl?: string;
  outputName?: string;
  outputBlob?: Blob;
}

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif'];
const FORMAT_OPTIONS: { label: string; value: TargetFormat }[] = [
  { label: 'JPG', value: 'image/jpeg' },
  { label: 'PNG', value: 'image/png' },
  { label: 'WEBP', value: 'image/webp' }
];

function getFormatExt(mime: string) {
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/bmp': return 'bmp';
    case 'image/gif': return 'gif';
    default: return 'img';
  }
}

export default function App() {
  const [queue, setQueue] = useState<FileQueueItem[]>([]);
  const [globalFormat, setGlobalFormat] = useState<TargetFormat>('image/webp');
  const [isDragging, setIsDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Settings state
  const [quality, setQuality] = useState(0.9);
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [maxWidth, setMaxWidth] = useState(1920);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      queue.forEach(item => {
        if (item.outputUrl) {
          URL.revokeObjectURL(item.outputUrl);
        }
      });
    };
  }, [queue]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const addFilesToQueue = (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    
    if (validFiles.length === 0) return;

    const newItems: FileQueueItem[] = validFiles.map(file => ({
      id: Math.random().toString(36).substring(7) + Date.now(),
      originalFile: file,
      targetFormat: globalFormat,
      status: 'idle'
    }));

    setQueue(prev => [...prev, ...newItems]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files);
    }
  }, [globalFormat]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(e.target.files);
    }
  };

  const updateItemFormat = (id: string, format: TargetFormat) => {
    setQueue(prev => prev.map(item => 
      item.id === id ? { ...item, targetFormat: format, status: 'idle', outputUrl: undefined, outputBlob: undefined } : item
    ));
  };

  const removeItem = (id: string) => {
    setQueue(prev => {
      const item = prev.find(i => i.id === id);
      if (item?.outputUrl) {
        URL.revokeObjectURL(item.outputUrl);
      }
      return prev.filter(i => i.id !== id);
    });
  };

  const clearAll = () => {
    queue.forEach(item => {
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    });
    setQueue([]);
  };

  const convertFile = async (item: FileQueueItem): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          
          let targetW = img.width;
          let targetH = img.height;

          // Resize logic
          if (resizeEnabled && maxWidth > 0 && img.width > maxWidth) {
            const ratio = maxWidth / img.width;
            targetW = maxWidth;
            targetH = img.height * ratio;
          }

          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error("Failed to get 2D context"));
            return;
          }

          // Fill with white to prevent transparent pixels becoming black in JPEG
          if (item.targetFormat === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          ctx.drawImage(img, 0, 0, targetW, targetH);

          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const originalName = item.originalFile.name;
              const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
              const outputName = `${baseName}.${getFormatExt(item.targetFormat)}`;
              
              setQueue(prev => prev.map(q => 
                q.id === item.id 
                  ? { ...q, status: 'success', outputUrl: url, outputName, outputBlob: blob } 
                  : q
              ));
              resolve();
            } else {
              reject(new Error("Blob creation failed"));
            }
          }, item.targetFormat, item.targetFormat === 'image/png' ? undefined : quality);
        };
        img.onerror = () => reject(new Error("Failed to load image for conversion"));
        if (typeof e.target?.result === 'string') {
          img.src = e.target.result;
        } else {
          reject(new Error("Failed to read file data"));
        }
      };
      reader.onerror = () => reject(new Error("FileReader error"));
      reader.readAsDataURL(item.originalFile);
    });
  };

  const handleConvertAll = async () => {
    const idleItems = queue.filter(q => q.status === 'idle' || q.status === 'error');
    if (idleItems.length === 0) return;

    // Start converting everything locally
    for (const item of idleItems) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'converting' } : q));
      try {
        await convertFile(item);
      } catch (err) {
        setQueue(prev => prev.map(q => 
          q.id === item.id ? { ...q, status: 'error', errorMessage: String(err) } : q
        ));
      }
    }
  };

  const handleDownloadAllZip = async () => {
    const successItems = queue.filter(q => q.status === 'success' && q.outputBlob && q.outputName);
    if (successItems.length === 0) return;

    const zip = new JSZip();
    successItems.forEach(item => {
      if (item.outputName && item.outputBlob) {
        zip.file(item.outputName, item.outputBlob);
      }
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `converted_images_${Date.now()}.zip`;
    a.click();
    
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleGlobalFormatChange = (newFormat: TargetFormat) => {
    setGlobalFormat(newFormat);
    setQueue(prev => prev.map(item => 
      item.status === 'idle' || item.status === 'error' 
        ? { ...item, targetFormat: newFormat } 
        : item
    ));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const canConvert = queue.some(q => q.status === 'idle' || q.status === 'error');
  const canDownloadAll = queue.some(q => q.status === 'success');

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>
      
      <div className="relative z-10 min-h-screen pb-20 pt-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto flex flex-col gap-10">
        
        {/* Header */}
        <header className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center justify-center p-3 glass-panel rounded-full mb-2 shadow-[0_0_40px_rgba(167,139,250,0.3)]">
            <Layers className="w-8 h-8 text-fuchsia-400" />
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
             <span className="text-white">Local</span>
             <span className="text-gradient">Convert</span>
          </h1>
          <p className="text-gray-400 max-w-lg mt-2 text-lg">
            Instantly convert your images. 100% free, private, and secure. Everything happens on your device.
          </p>
        </header>

        {/* Main Content */}
        <main className="flex flex-col gap-6">
          
          <div className="glass-panel p-2 sm:p-4 rounded-3xl flex flex-col gap-4">
            
            {/* Dropzone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300
                flex flex-col items-center justify-center gap-6 min-h-[280px] relative overflow-hidden
                ${isDragging 
                  ? 'border-indigo-500 bg-indigo-500/10' 
                  : 'border-white/20 bg-black/20 hover:bg-white/5 hover:border-white/30'}
              `}
            >
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileInput}
              />
              <motion.div 
                animate={{ y: isDragging ? -10 : 0, scale: isDragging ? 1.05 : 1 }} 
                className="p-5 rounded-full bg-white/10 text-indigo-300 backdrop-blur-sm"
              >
                <UploadCloud size={48} strokeWidth={1.5} />
              </motion.div>
              <div className="flex flex-col gap-2 relative z-10">
                <h3 className="text-2xl font-medium text-white" style={{ fontFamily: 'var(--font-display)' }}>
                  Drag & drop your images
                </h3>
                <p className="text-gray-400">or click to browse local files</p>
              </div>
            </div>

            {/* Config & Toggles */}
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Quick Format Selector */}
              <div className="flex-1 flex flex-col sm:flex-row items-center justify-between gap-4 bg-black/30 rounded-xl p-4 border border-white/5">
                <span className="text-sm text-gray-400 font-medium whitespace-nowrap">Target Format:</span>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  {FORMAT_OPTIONS.map(opt => (
                    <button 
                      key={opt.value}
                      onClick={() => handleGlobalFormatChange(opt.value)}
                      className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 border ${
                        globalFormat === opt.value
                        ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.5)]'
                        : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced Settings Toggle */}
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className={`flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-sm font-medium transition-all duration-200 border lg:w-48
                  ${showSettings ? 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-300' : 'border-white/5 bg-black/30 text-gray-400 hover:bg-white/10 hover:text-white'}
                `}
              >
                <Settings2 size={18} />
                <span>Advanced</span>
              </button>
            </div>

            {/* Advanced Settings Panel */}
            <AnimatePresence>
              {showSettings && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-5 border border-white/10 rounded-2xl bg-white/5 grid grid-cols-1 md:grid-cols-2 gap-8 mt-2">
                    
                    {/* Quality */}
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-300">
                          <SlidersHorizontal size={16} />
                          <span className="font-medium text-sm">Image Quality</span>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 bg-white/10 rounded-md text-gray-300">
                          {Math.round(quality * 100)}%
                        </span>
                      </div>
                      <input 
                        type="range" 
                        min="0.1" 
                        max="1" 
                        step="0.05" 
                        value={quality}
                        onChange={(e) => setQuality(parseFloat(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-xs text-gray-500">Applies to JPG and WEBP compression.</p>
                    </div>

                    {/* Resize */}
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-300">
                          <PackageOpen size={16} />
                          <span className="font-medium text-sm">Resize Image</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={resizeEnabled} onChange={(e) => setResizeEnabled(e.target.checked)} />
                          <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fuchsia-500"></div>
                        </label>
                      </div>
                      <div className={`transition-opacity duration-200 ${resizeEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-400">Max Width:</span>
                          <div className="relative flex-1">
                            <input 
                              type="number" 
                              value={maxWidth}
                              onChange={(e) => setMaxWidth(Math.max(10, parseInt(e.target.value) || 0))}
                              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-mono">px</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">Proportionally scales down images wider than max width.</p>
                    </div>

                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
          </div>

          {/* Queue List */}
          {queue.length > 0 && (
            <div className="glass-panel rounded-3xl overflow-hidden flex flex-col mt-4">
              
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between p-5 border-b border-white/10 bg-black/40 gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-400">
                    {queue.length} file{queue.length !== 1 ? 's' : ''} in queue
                  </span>
                </div>

                <div className="flex items-center gap-4 ml-auto">
                  {canDownloadAll && !canConvert && (
                    <button
                      onClick={handleDownloadAllZip}
                      className="px-4 py-2 text-sm font-bold text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 rounded-xl transition-all border border-emerald-400/20 shadow-sm flex items-center gap-2"
                    >
                      <Download size={16} />
                      <span className="hidden sm:inline">Download ZIP</span>
                    </button>
                  )}
                  <button
                    onClick={clearAll}
                    className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={handleConvertAll}
                    disabled={!canConvert}
                    className={`
                      px-6 py-2.5 text-sm font-bold text-white rounded-xl transition-all shadow-lg
                      ${canConvert 
                        ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:from-indigo-400 hover:to-fuchsia-400 hover:scale-[1.02]' 
                        : 'bg-white/10 text-white/40 cursor-not-allowed shadow-none'}
                    `}
                  >
                    Convert Files
                  </button>
                </div>
              </div>


              {/* List */}
              <ul className="divide-y divide-white/5 max-h-[500px] overflow-y-auto p-2">
                <AnimatePresence>
                  {queue.map((item) => (
                    <motion.li
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="glass-item rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 mb-2 last:mb-0"
                    >
                      
                      {/* File Info */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                          <ImageIcon className="w-6 h-6 text-indigo-300" />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate" title={item.originalFile.name}>
                            {item.originalFile.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {formatFileSize(item.originalFile.size)} • {getFormatExt(item.originalFile.type).toUpperCase()}
                          </p>
                        </div>
                      </div>

                      {/* Format Target */}
                      <div className="flex items-center gap-3 shrink-0 sm:w-40 justify-center">
                        <ArrowRight className="w-4 h-4 text-gray-500 hidden sm:block" />
                        {item.status === 'success' ? (
                          <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {getFormatExt(item.targetFormat).toUpperCase()}
                          </span>
                        ) : (
                          <select
                            value={item.targetFormat}
                            onChange={(e) => updateItemFormat(item.id, e.target.value as TargetFormat)}
                            disabled={item.status === 'converting'}
                            className="block w-full rounded-lg border-white/10 py-1.5 pl-3 pr-8 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-black/50 text-white disabled:opacity-50 appearance-none cursor-pointer"
                            style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%239CA3AF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.4-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem top 50%', backgroundSize: '0.65rem auto' }}
                          >
                            <option value="image/jpeg">JPG</option>
                            <option value="image/png">PNG</option>
                            <option value="image/webp">WEBP</option>
                          </select>
                        )}
                      </div>

                      {/* Status & Actions */}
                      <div className="flex items-center gap-3 shrink-0 justify-end sm:w-48">
                        {item.status === 'converting' && (
                          <div className="text-sm text-indigo-400 flex items-center gap-2">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="font-medium text-xs">Converting...</span>
                          </div>
                        )}
                        
                        {item.status === 'success' && item.outputUrl && (
                          <a
                            href={item.outputUrl}
                            download={item.outputName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-green-300 bg-green-500/10 hover:bg-green-500/20 rounded-xl transition-colors border border-green-500/20 shadow-sm"
                          >
                            <Download className="w-4 h-4" />
                            <span>Save</span>
                          </a>
                        )}

                        {item.status === 'error' && (
                          <div className="flex items-center gap-1.5 text-red-400 text-sm" title={item.errorMessage}>
                            <AlertCircle className="w-4 h-4" />
                            <span className="hidden sm:inline text-xs font-semibold">Error</span>
                          </div>
                        )}

                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                          title="Remove file"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          )}
        </main>

        <footer className="mt-auto text-center text-sm text-gray-500 font-medium pb-8 border-t border-white/5 pt-8">
          <p>Operates strictly in your browser. Absolutely no files are uploaded.</p>
        </footer>
      </div>
    </>
  );
}
