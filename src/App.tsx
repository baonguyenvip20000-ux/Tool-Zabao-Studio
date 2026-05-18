import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Settings, 
  Download, 
  Trash2, 
  Grid2X2, 
  Image as ImageIcon, 
  Maximize, 
  Palette, 
  Layout, 
  RefreshCw,
  Plus,
  Share2,
  Check,
  Facebook,
  Menu,
  X,
  Scissors,
  CloudUpload,
  List
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import gifshot from 'gifshot';

interface ImageItem {
  id: string;
  url: string;
  originalUrl?: string; // For before/after comparison
  aspectRatio: number; // width / height
}

type AspectRatioType = 'original' | '1:1' | '4:5' | '9:16' | '3:4' | '4:3' | '3:2' | '16:9' | '21:9' | 'custom';

export default function App() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [currentMode, setCurrentMode] = useState<'collage' | 'remover'>('collage');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [columns, setColumns] = useState(3);
  const [paddingX, setPaddingX] = useState(8);
  const [paddingY, setPaddingY] = useState(8);
  const [gapX, setGapX] = useState(8);
  const [gapY, setGapY] = useState(8);
  const [borderRadius, setBorderRadius] = useState(0);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>('contain');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>('16:9'); // Default to 16:9 like in screenshot
  const [customRatio, setCustomRatio] = useState({ width: 16, height: 9 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(null);
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.5);
  const [watermarkSize, setWatermarkSize] = useState(150);
  const [watermarkTile, setWatermarkTile] = useState(false);
  const [isTransparent, setIsTransparent] = useState(false);
  const [downloadMode, setDownloadMode] = useState<'static' | 'animated'>('static');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [selectedCompareId, setSelectedCompareId] = useState<string | null>(null);
  const [ComparisonSliderValue, setComparisonSliderValue] = useState(50);
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);

  const ASPECT_RATIOS: Record<AspectRatioType, number | null> = {
    'original': null,
    '1:1': 1,
    '4:5': 4/5,
    '9:16': 9/16,
    '3:4': 3/4,
    '4:3': 4/3,
    '3:2': 3/2,
    '16:9': 16/9,
    '21:9': 21/9,
    'custom': null
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const newImages: ImageItem[] = await Promise.all(
      files.map((file) => {
        return new Promise<ImageItem>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const url = event.target?.result as string;
            const img = new Image();
            img.onload = () => {
              resolve({
                id: Math.random().toString(36).substring(7),
                url,
                originalUrl: url,
                aspectRatio: img.width / img.height
              });
            };
            img.src = url;
          };
          reader.readAsDataURL(file);
        });
      })
    );

    setImages(prev => [...prev, ...newImages]);
  };

  const handleBgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setBgImageUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const clearImages = () => {
    setImages([]);
    setPreviewUrl(null);
  };

  const removeBackground = async (index: number) => {
    const image = images[index];
    if (!image) return;

    setRemovingIds(prev => {
      const next = new Set(prev);
      next.add(image.id);
      return next;
    });

    try {
      const response = await fetch('/api/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: image.url })
      });

      if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to remove background");
      }

      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const newUrl = reader.result as string;
        setImages(prev => {
            const next = [...prev];
            const targetIdx = next.findIndex(img => img.id === image.id);
            if (targetIdx !== -1) {
                next[targetIdx] = { ...next[targetIdx], url: newUrl };
            }
            return next;
        });
        // Force reload the image in the ref cache
        loadedImagesRef.current.delete(image.url);
      };
      reader.readAsDataURL(blob);
    } catch (error: any) {
      console.error(error);
      alert("Lỗi tách nền: " + error.message);
    } finally {
      setRemovingIds(prev => {
        const next = new Set(prev);
        next.delete(image.id);
        return next;
      });
    }
  };

  const loadedImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    if (loadedImagesRef.current.has(url)) {
      return Promise.resolve(loadedImagesRef.current.get(url)!);
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        loadedImagesRef.current.set(url, img);
        resolve(img);
      };
      img.src = url;
    });
  };

  const drawCollageToCanvas = async (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const rows = Math.ceil(images.length / columns);
    const baseWidth = 1600;
    
    const totalGapsWidth = gapX * (columns - 1);
    const cellWidth = (baseWidth - totalGapsWidth) / columns;
    
    const totalWidth = baseWidth + (paddingX * 2);
    let cellHeight: number;
    let totalHeight: number;

    if (aspectRatio === 'original') {
      const firstImg = images[0] ? await loadImage(images[0].url) : null;
      const ratioValue = firstImg ? firstImg.width / firstImg.height : 1;
      cellHeight = cellWidth / ratioValue;
      totalHeight = (cellHeight * rows) + (paddingY * 2) + (gapY * Math.max(0, rows - 1));
    } else {
      const frameRatio = (aspectRatio === 'custom')
        ? customRatio.width / (customRatio.height || 1)
        : (ASPECT_RATIOS[aspectRatio] || 1);
      
      totalHeight = totalWidth / frameRatio;
      const usableHeight = totalHeight - (paddingY * 2) - (gapY * Math.max(0, rows - 1));
      cellHeight = usableHeight / Math.max(1, rows);
    }

    canvas.width = totalWidth;
    canvas.height = totalHeight;

    // Clear and Draw Background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!isTransparent) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (bgImageUrl) {
      const bgImg = await loadImage(bgImageUrl);
      const canvasRatio = canvas.width / canvas.height;
      const bgRatio = bgImg.width / bgImg.height;
      let drawWidth, drawHeight, offsetX, offsetY;
      if (bgRatio > canvasRatio) {
        drawHeight = canvas.height;
        drawWidth = canvas.height * bgRatio;
        offsetX = (canvas.width - drawWidth) / 2;
        offsetY = 0;
      } else {
        drawWidth = canvas.width;
        drawHeight = canvas.width / bgRatio;
        offsetX = 0;
        offsetY = (canvas.height - drawHeight) / 2;
      }
      ctx.drawImage(bgImg, offsetX, offsetY, drawWidth, drawHeight);
    }

    for (let index = 0; index < images.length; index++) {
      const imageItem = images[index];
      // Try to get the live image element from the DOM to capture the current GIF frame
      const previewEl = document.getElementById(`preview-img-${imageItem.id}`) as HTMLImageElement | null;
      const img = previewEl || await loadImage(imageItem.url);
      
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = paddingX + col * (cellWidth + gapX);
      const y = paddingY + row * (cellHeight + gapY);

      ctx.save();
      ctx.beginPath();
      if (borderRadius > 0 && typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(x, y, cellWidth, cellHeight, borderRadius);
      } else if (borderRadius > 0) {
        const r = Math.min(borderRadius, cellWidth / 2, cellHeight / 2);
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + cellWidth - r, y);
        ctx.quadraticCurveTo(x + cellWidth, y, x + cellWidth, y + r);
        ctx.lineTo(x + cellWidth, y + cellHeight - r);
        ctx.quadraticCurveTo(x + cellWidth, y + cellHeight, x + cellWidth - r, y + cellHeight);
        ctx.lineTo(x + r, y + cellHeight);
        ctx.quadraticCurveTo(x, y + cellHeight, x, y + cellHeight - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
      } else {
        ctx.rect(x, y, cellWidth, cellHeight);
      }
      ctx.clip();

      let drawWidth, drawHeight, offsetX, offsetY;
      const imgRatio = img.naturalWidth / img.naturalHeight || img.width / img.height;
      const targetRatio = cellWidth / cellHeight;

      if (fitMode === 'cover') {
        if (imgRatio > targetRatio) {
          drawHeight = cellHeight;
          drawWidth = cellHeight * imgRatio;
          offsetX = (cellWidth - drawWidth) / 2;
          offsetY = 0;
        } else {
          drawWidth = cellWidth;
          drawHeight = cellWidth / imgRatio;
          offsetX = 0;
          offsetY = (cellHeight - drawHeight) / 2;
        }
      } else {
        if (imgRatio > targetRatio) {
          drawWidth = cellWidth;
          drawHeight = cellWidth / imgRatio;
          offsetX = 0;
          offsetY = (cellHeight - drawHeight) / 2;
        } else {
          drawHeight = cellHeight;
          drawWidth = cellHeight * imgRatio;
          offsetX = (cellWidth - drawWidth) / 2;
          offsetY = 0;
        }
      }
      ctx.drawImage(img, x + offsetX, y + offsetY, drawWidth, drawHeight);
      ctx.restore();
    }

    // Draw Watermark
    if (watermarkUrl) {
      const previewWm = document.getElementById('preview-watermark') as HTMLImageElement | null;
      const wmImg = previewWm || await loadImage(watermarkUrl);
      
      ctx.save();
      ctx.globalAlpha = watermarkOpacity;
      const wmRatio = (wmImg.naturalWidth / wmImg.naturalHeight) || (wmImg.width / wmImg.height);
      const drawWidth = watermarkSize;
      const drawHeight = watermarkSize / wmRatio;

      if (watermarkTile) {
        const spacingX = drawWidth * 1.8;
        const spacingY = drawHeight * 2.2;
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(-Math.PI / 6); // -30 degrees
        ctx.translate(-canvas.width * 1.5, -canvas.height * 1.5);
        
        for (let y = 0; y < canvas.height * 3; y += spacingY) {
          for (let x = 0; x < canvas.width * 3; x += spacingX) {
            ctx.drawImage(wmImg, x, y, drawWidth, drawHeight);
          }
        }
        ctx.restore();
      } else {
        const x = (canvas.width - drawWidth) / 2;
        const y = (canvas.height - drawHeight) / 2;
        ctx.drawImage(wmImg, x, y, drawWidth, drawHeight);
      }
      ctx.restore();
    }
  };

  const generateCollage = useCallback(async () => {
    if (images.length === 0) return;
    setIsGenerating(true);

    await new Promise(resolve => setTimeout(resolve, 50));
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    await drawCollageToCanvas(canvas);

    setPreviewUrl(canvas.toDataURL('image/png'));
    setIsGenerating(false);
  }, [images, columns, paddingX, paddingY, gapX, gapY, borderRadius, bgColor, bgImageUrl, aspectRatio, customRatio, fitMode, watermarkUrl, watermarkOpacity, watermarkSize, watermarkTile]);

  const generateAnimatedCollage = async () => {
    if (images.length === 0) return;
    setIsExporting(true);
    setExportProgress(0);
    
    // Smooth capture: 60 frames at 50ms intervals (~3 seconds of content at 20fps)
    const frames: string[] = [];
    const frameCount = 60;
    const interval = 50; 
    
    const offscreenCanvas = document.createElement('canvas');

    for (let i = 0; i < frameCount; i++) {
        // Wait for next animation frame and a small delay to ensure browser has rendered the GIF frame
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (i % 2 === 0) await new Promise(resolve => setTimeout(resolve, 10));
        
        await drawCollageToCanvas(offscreenCanvas);
        frames.push(offscreenCanvas.toDataURL('image/png'));
        
        setExportProgress(Math.round(((i + 1) / frameCount) * 20));
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    gifshot.createGIF({
        images: frames,
        gifWidth: 800,
        gifHeight: 800 / (offscreenCanvas.width || 1) * (offscreenCanvas.height || 1),
        interval: interval / 1000,
        numFrames: frameCount,
        sampleInterval: 5,
        transparent: isTransparent ? '#00FF00' : null,
        progressCallback: (progress: number) => {
            setExportProgress(20 + Math.round(progress * 80));
        }
    }, (obj: any) => {
        if (!obj.error) {
            const link = document.createElement('a');
            link.download = `collage-anim-${Date.now()}.gif`;
            link.href = obj.image;
            link.click();
        }
        setIsExporting(false);
        setExportProgress(0);
    });
  };

  const downloadImage = () => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.download = `collage-${Date.now()}.png`;
    link.href = previewUrl;
    link.click();
  };

  const copyAppLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Main Preview Area logic
  const renderPreview = () => {
    if (images.length === 0) return null;

    const EXPORT_BASE_WIDTH = 1600;
    const PREVIEW_BASE_WIDTH = 800;
    const SCALE = EXPORT_BASE_WIDTH / PREVIEW_BASE_WIDTH;

    // Preview values scaled down
    const pPaddingX = paddingX / SCALE;
    const pPaddingY = paddingY / SCALE;
    const pGapX = gapX / SCALE;
    const pGapY = gapY / SCALE;
    const pBorderRadius = borderRadius / SCALE;
    const pWatermarkSize = watermarkSize / SCALE;

    const rows = Math.ceil(images.length / columns);
    
    // Width available for cells (same logic as generateCollage)
    const totalGapsWidth = pGapX * (columns - 1);
    const cellWidth = (PREVIEW_BASE_WIDTH - totalGapsWidth) / columns;
    
    const totalPreviewWidth = PREVIEW_BASE_WIDTH + (pPaddingX * 2);
    let cellHeight: number;
    let totalHeight: number;

    if (aspectRatio === 'original') {
      const ratioValue = images[0]?.aspectRatio || 1;
      cellHeight = cellWidth / ratioValue;
      totalHeight = (cellHeight * rows) + (pPaddingY * 2) + (pGapY * Math.max(0, rows - 1));
    } else {
      const frameRatio = (aspectRatio === 'custom')
        ? customRatio.width / (customRatio.height || 1)
        : (ASPECT_RATIOS[aspectRatio] || 1);
      
      totalHeight = totalPreviewWidth / frameRatio;
      const usableHeight = totalHeight - (pPaddingY * 2) - (pGapY * Math.max(0, rows - 1));
      cellHeight = usableHeight / rows;
    }

    return (
      <div 
        id="live-preview-container"
        className="relative shadow-2xl transition-all duration-500"
        style={{
          width: '100%',
          maxWidth: `${totalPreviewWidth}px`,
          height: `${totalHeight}px`,
          backgroundColor: isTransparent ? 'transparent' : bgColor,
          backgroundImage: isTransparent ? 'linear-gradient(45deg, #eee 25%, transparent 25%, transparent 75%, #eee 75%, #eee 100%), linear-gradient(45deg, #eee 25%, white 25%, white 75%, #eee 75%, #eee 100%)' : 'none',
          backgroundSize: isTransparent ? '20px 20px' : 'auto',
          backgroundPosition: isTransparent ? '0 0, 10px 10px' : 'initial',
          padding: `${pPaddingY}px ${pPaddingX}px`,
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          columnGap: `${pGapX}px`,
          rowGap: `${pGapY}px`,
          borderRadius: '4px',
          overflow: 'hidden'
        }}
      >
        {/* BG Image Layer for preview */}
        {bgImageUrl && (
          <img 
            src={bgImageUrl} 
            alt="bg" 
            className="absolute inset-0 w-full h-full object-cover pointer-events-none" 
            style={{ zIndex: 0 }}
          />
        )}
        
        {images.map((img, idx) => (
          <div 
            key={img.id}
            style={{
              height: `${cellHeight}px`,
              borderRadius: `${pBorderRadius}px`,
              overflow: 'hidden',
              position: 'relative',
              zIndex: 1,
              backgroundColor: 'rgba(0,0,0,0.05)'
            }}
          >
            <img 
              id={`preview-img-${img.id}`}
              src={img.url} 
              alt={`img-${idx}`}
              className={`w-full h-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
            />
          </div>
        ))}

        {/* Watermark layer */}
        {watermarkUrl && (
          <div 
            className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden"
            style={{ zIndex: 10, opacity: watermarkOpacity }}
          >
            {watermarkTile ? (
              <div 
                className="w-[250%] h-[250%] flex-none flex flex-wrap items-center justify-center"
                style={{ 
                    gap: `${pWatermarkSize * 0.5}px`,
                    transform: 'rotate(-30deg)'
                }}
              >
                {Array.from({ length: 60 }).map((_, i) => (
                  <img 
                    key={i}
                    src={watermarkUrl}
                    alt="wm"
                    style={{ width: `${pWatermarkSize}px` }}
                  />
                ))}
              </div>
            ) : (
              <img 
                id="preview-watermark"
                src={watermarkUrl}
                alt="wm"
                style={{ width: `${pWatermarkSize}px` }}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-[#F0F2F5] text-[#1A1A1B] overflow-hidden">
      {/* Header */}
      <header className="min-h-16 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-4 md:px-6 py-2 z-30 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2 md:gap-3 text-[#2563EB] font-extrabold text-lg md:text-xl tracking-tight">
            <img 
              src="https://sf-static.upanhlaylink.com/img/image_20260517cbd30b511e68f92bbc97e88f547972de.jpg" 
              alt="Logo" 
              className="w-10 h-10 md:w-12 md:h-12 rounded-lg object-contain border border-[#E2E8F0] p-1 bg-white"
            />
            <span className="hidden sm:inline uppercase">ZABAO {currentMode === 'collage' ? 'COLLAGE' : 'REMOVER'}</span>
          </div>
        </div>
        <div className="flex items-center flex-wrap justify-center gap-2 md:gap-3 w-full md:w-auto">
          <a 
            href="https://www.facebook.com/BaoNguyenADVN" 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-3 md:px-4 py-2 border border-[#E2E8F0] bg-white rounded-md text-[13px] md:text-sm font-semibold text-[#475569] hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <Facebook className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#1877F2]" />
            <span className="hidden sm:inline">Liên hệ Admin</span>
            <span className="sm:hidden">Admin</span>
          </a>
          <button 
            onClick={copyAppLink}
            className={`px-3 md:px-4 py-2 border rounded-md text-[13px] md:text-sm font-semibold transition-all flex items-center gap-2 ${
              isCopied 
              ? 'bg-green-50 border-green-200 text-green-600' 
              : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-slate-50'
            }`}
          >
            {isCopied ? <Check className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Share2 className="w-3.5 h-3.5 md:w-4 md:h-4" />}
            <span className="hidden sm:inline">{isCopied ? 'Đã sao chép link' : 'Chia sẻ app'}</span>
            <span className="sm:hidden">{isCopied ? 'Đã lưu' : 'Chia sẻ'}</span>
          </button>
          <input 
            ref={fileInputRef}
            type="file" 
            multiple 
            accept="image/*,image/gif" 
            className="hidden" 
            onChange={handleFileChange}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-3 md:px-5 py-2 border border-[#E2E8F0] bg-white rounded-md text-[13px] md:text-sm font-semibold text-[#475569] hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> Tải ảnh/GIF
          </button>
          <button 
            disabled={images.length === 0 || isGenerating || isExporting}
            onClick={async () => {
              await generateCollage();
              downloadImage();
            }}
            className="px-4 md:px-5 py-2 bg-white border border-[#2563EB] text-[#2563EB] rounded-md text-[13px] md:text-sm font-bold shadow-sm hover:bg-blue-50 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isGenerating ? <RefreshCw className="animate-spin w-3.5 h-3.5 md:w-4 md:h-4" /> : <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />}
            Lưu PNG
          </button>

          <button 
            disabled={images.length === 0 || isGenerating || isExporting}
            onClick={generateAnimatedCollage}
            className="px-4 md:px-5 py-2 bg-[#2563EB] text-white rounded-md text-[13px] md:text-sm font-bold shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isExporting ? <RefreshCw className="animate-spin w-3.5 h-3.5 md:w-4 md:h-4" /> : <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />}
            Lưu GIF
          </button>
        </div>
      </header>

      {/* Navigation Overlay */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Side Menu Drawer */}
      <div className={`fixed top-0 left-0 h-full w-[280px] bg-white z-50 shadow-2xl transition-transform duration-300 ease-in-out flex flex-col ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <span className="font-extrabold text-blue-600">MENU CÔNG CỤ</span>
          <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-slate-50 rounded-full">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 p-4 flex flex-col gap-2">
          <button 
            onClick={() => { setCurrentMode('collage'); setIsMenuOpen(false); }}
            className={`flex items-center gap-3 p-4 rounded-xl font-bold transition-all ${currentMode === 'collage' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Layout size={20} />
            Ghép ảnh chuyên nghiệp
          </button>
          <button 
            onClick={() => { setCurrentMode('remover'); setIsMenuOpen(false); }}
            className={`flex items-center gap-3 p-4 rounded-xl font-bold transition-all ${currentMode === 'remover' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Scissors size={20} />
            Tách nền bằng AI
          </button>
        </nav>
        <div className="p-6 border-t border-slate-100 text-[11px] text-slate-400">
          Zabao Studio © 2026
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {currentMode === 'collage' ? (
          <>
            {/* Sidebar */}
            <aside className="w-full md:w-[320px] h-1/2 md:h-full bg-white border-t md:border-t-0 md:border-r border-[#E2E8F0] p-4 md:p-6 flex flex-col gap-6 md:gap-8 overflow-y-auto custom-scrollbar shrink-0 order-2 md:order-1">
          {/* Section: Ratio & Fit */}
          <div className="flex flex-col gap-5">
            <div className="space-y-3">
              <h3 className="text-[12px] font-bold text-[#64748B] uppercase tracking-wider">Cấu hình hiển thị</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFitMode('contain')}
                  className={`py-2 px-3 border rounded-md text-[13px] transition-all text-center flex items-center justify-center gap-1.5 ${
                    fitMode === 'contain' 
                    ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB] font-bold' 
                    : 'border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]'
                  }`}
                >
                  Vừa vặn
                </button>
                <button
                  onClick={() => setFitMode('cover')}
                  className={`py-2 px-3 border rounded-md text-[13px] transition-all text-center flex items-center justify-center gap-1.5 ${
                    fitMode === 'cover' 
                    ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB] font-bold' 
                    : 'border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]'
                  }`}
                >
                  Phủ kín
                </button>
              </div>
              <p className="text-[10px] text-slate-400 italic">"Vừa vặn" giúp giữ nguyên toàn bộ ảnh, "Phủ kín" sẽ lấp đầy ô lưới.</p>
            </div>

            <div className="space-y-3">
              <h3 className="text-[12px] font-bold text-[#64748B] uppercase tracking-wider">Tỉ lệ khung hình</h3>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(ASPECT_RATIOS) as AspectRatioType[]).map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`py-2 px-3 border rounded-md text-[13px] transition-all text-center ${
                      aspectRatio === ratio 
                      ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB] font-bold' 
                      : 'border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]'
                    }`}
                  >
                    {ratio === 'original' ? 'Mặc định' : ratio}
                  </button>
                ))}
                <button
                  onClick={() => setAspectRatio('custom')}
                  className={`py-2 px-3 border rounded-md text-[13px] transition-all text-center ${
                    aspectRatio === 'custom' 
                    ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB] font-bold' 
                    : 'border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]'
                  }`}
                >
                  Tùy chỉnh
                </button>
              </div>

              {aspectRatio === 'custom' && (
                <div className="flex items-center gap-3 mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase">Rộng</label>
                    <input 
                      type="number" 
                      min="0.1" 
                      step="0.1"
                      value={customRatio.width}
                      onChange={(e) => setCustomRatio({ ...customRatio, width: parseFloat(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md text-sm font-bold focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] outline-none"
                    />
                  </div>
                  <span className="mt-5 text-slate-300">:</span>
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase">Cao</label>
                    <input 
                      type="number" 
                      min="0.1" 
                      step="0.1"
                      value={customRatio.height}
                      onChange={(e) => setCustomRatio({ ...customRatio, height: parseFloat(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md text-sm font-bold focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section: Image List & BG Removal */}
          <div className="flex flex-col gap-4 p-4 bg-blue-50/50 rounded-xl border border-blue-100 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-bold text-[#2563EB] uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon size={14} /> Quản lý nội dung ({images.length})
              </h3>
              {images.length > 0 && (
                <button 
                  onClick={clearImages}
                  className="text-[11px] text-rose-500 font-bold hover:underline"
                >
                  Xóa hết
                </button>
              )}
            </div>
            
            {images.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic text-center py-4">Chưa có ảnh nào được thêm.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {images.map((img, idx) => (
                  <div key={img.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-100 group shadow-sm transition-all hover:border-blue-200">
                    <div className="w-12 h-12 rounded bg-white border border-slate-200 overflow-hidden flex-shrink-0 relative">
                      <img src={img.url} alt={`img-${idx}`} className="w-full h-full object-cover" />
                      {removingIds.has(img.id) && (
                        <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                          <RefreshCw size={14} className="animate-spin text-[#2563EB]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-[11px] font-bold text-slate-700 truncate">Ảnh {idx + 1}</p>
                      <button 
                        disabled={removingIds.has(img.id)}
                        onClick={() => removeBackground(idx)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 mt-1 transition-all ${
                          removingIds.has(img.id) 
                          ? 'bg-slate-100 text-slate-400' 
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                        }`}
                      >
                        {removingIds.has(img.id) ? (
                          <>Đang xử lý...</>
                        ) : (
                          <><Layout size={10} /> Tách nền AI</>
                        )}
                      </button>
                    </div>
                    <button 
                      onClick={() => removeImage(img.id)}
                      className="text-slate-400 hover:text-rose-500 p-1 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Layout Settings */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[12px] font-bold text-[#64748B] uppercase tracking-wider">Cấu trúc lưới</h3>
            
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[13px]">
                <span>Số cột hiển thị</span>
                <span className="font-bold">{columns}</span>
              </div>
              <div className="relative h-6 flex items-center">
                <input 
                  type="range" min="1" max="12" step="1" 
                  value={columns} onChange={(e) => setColumns(Number(e.target.value))}
                  className="w-full h-1 bg-[#E2E8F0] appearance-none rounded-full accent-[#2563EB] cursor-pointer"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[13px]">
                <span>Khoảng cách Ngang</span>
                <span className="font-bold">{gapX}px</span>
              </div>
              <div className="relative h-6 flex items-center">
                <input 
                  type="range" min="0" max="150" step="1" 
                  value={gapX} onChange={(e) => setGapX(Number(e.target.value))}
                  className="w-full h-1 bg-[#E2E8F0] appearance-none rounded-full accent-[#2563EB] cursor-pointer"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[13px]">
                <span>Khoảng cách Dọc</span>
                <span className="font-bold">{gapY}px</span>
              </div>
              <div className="relative h-6 flex items-center">
                <input 
                  type="range" min="0" max="150" step="1" 
                  value={gapY} onChange={(e) => setGapY(Number(e.target.value))}
                  className="w-full h-1 bg-[#E2E8F0] appearance-none rounded-full accent-[#2563EB] cursor-pointer"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[13px]">
                <span>Lề Ngang</span>
                <span className="font-bold">{paddingX}px</span>
              </div>
              <div className="relative h-6 flex items-center">
                <input 
                  type="range" min="0" max="150" step="1" 
                  value={paddingX} onChange={(e) => setPaddingX(Number(e.target.value))}
                  className="w-full h-1 bg-[#E2E8F0] appearance-none rounded-full accent-[#2563EB] cursor-pointer"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[13px]">
                <span>Lề Dọc</span>
                <span className="font-bold">{paddingY}px</span>
              </div>
              <div className="relative h-6 flex items-center">
                <input 
                  type="range" min="0" max="150" step="1" 
                  value={paddingY} onChange={(e) => setPaddingY(Number(e.target.value))}
                  className="w-full h-1 bg-[#E2E8F0] appearance-none rounded-full accent-[#2563EB] cursor-pointer"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[13px]">
                <span>Bo góc ảnh</span>
                <span className="font-bold">{borderRadius}px</span>
              </div>
              <div className="relative h-6 flex items-center">
                <input 
                  type="range" min="0" max="120" step="1" 
                  value={borderRadius} onChange={(e) => setBorderRadius(Number(e.target.value))}
                  className="w-full h-1 bg-[#E2E8F0] appearance-none rounded-full accent-[#2563EB] cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Section: Aesthetic Background */}
          <div className="flex flex-col gap-4">
             <h3 className="text-[12px] font-bold text-[#64748B] uppercase tracking-wider">Hình nền & Màu sắc</h3>
             
             <div className="flex flex-col gap-3">
               <div className="flex items-center justify-between">
                 <span className="text-[13px]">Màu nền</span>
                 <div className="flex items-center gap-2">
                   <span className="text-[11px] font-mono text-[#64748B]">{bgColor.toUpperCase()}</span>
                   <input 
                    type="color" 
                    value={bgColor} 
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-7 h-7 rounded shrink-0 border-none cursor-pointer overflow-hidden p-0 bg-transparent"
                  />
                 </div>
               </div>

               <div className="space-y-2">
                  <span className="text-[13px]">Ảnh nền riêng</span>
                  <input 
                    ref={bgFileInputRef}
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleBgFileChange}
                  />
                  {!bgImageUrl ? (
                    <button 
                      onClick={() => bgFileInputRef.current?.click()}
                      className="w-full py-2.5 border-2 border-dashed border-[#E2E8F0] rounded-md text-[13px] text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB] transition-all flex items-center justify-center gap-2"
                    >
                      <Upload size={14} /> Tải ảnh nền
                    </button>
                  ) : (
                    <div className="relative group rounded-md overflow-hidden border border-[#E2E8F0]">
                      <img src={bgImageUrl} alt="Background" className="h-20 w-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                         <button 
                          onClick={() => setBgImageUrl(null)}
                          className="bg-white p-1.5 rounded-full text-rose-500 shadow-lg"
                         >
                           <Trash2 size={16} />
                         </button>
                      </div>
                    </div>
                  )}
               </div>
             </div>
          </div>

          {/* Section: Watermark */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[12px] font-bold text-[#64748B] uppercase tracking-wider">Đóng dấu Watermark</h3>

            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-[13px] font-bold text-[#2563EB]">Nền trong suốt</span>
              <button 
                onClick={() => setIsTransparent(!isTransparent)}
                className={`w-10 h-5 rounded-full transition-colors relative ${isTransparent ? 'bg-[#2563EB]' : 'bg-[#E2E8F0]'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform left-1 ${isTransparent ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            
            <div className="flex flex-col gap-3">
              <input 
                ref={watermarkInputRef}
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setWatermarkUrl(url);
                  }
                }}
              />
              <button 
                onClick={() => watermarkInputRef.current?.click()}
                className="w-full py-2.5 border-2 border-dashed border-[#E2E8F0] rounded-md text-[13px] text-[#2563EB] bg-[#EFF6FF] font-bold hover:border-[#2563EB] transition-all flex items-center justify-center gap-2"
              >
                <Plus size={14} /> {watermarkUrl ? 'Thay đổi dấu' : 'Tải Watermark'}
              </button>

              {watermarkUrl && (
                <div className="space-y-4 pt-4 border-t border-slate-100 mt-1">
                  <div className="relative group rounded-md overflow-hidden border border-[#E2E8F0]">
                    <img src={watermarkUrl} alt="Watermark" className="h-16 w-full object-contain bg-slate-50" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                       <button 
                        onClick={() => setWatermarkUrl(null)}
                        className="bg-white p-1.5 rounded-full text-rose-500 shadow-lg"
                       >
                         <Trash2 size={16} />
                       </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-[13px]">
                      <span>Độ mờ (Opacity)</span>
                      <span className="font-bold">{Math.round(watermarkOpacity * 100)}%</span>
                    </div>
                    <div className="relative h-6 flex items-center">
                      <input 
                        type="range" min="0" max="1" step="0.01" 
                        value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                        className="w-full h-1 bg-[#E2E8F0] appearance-none rounded-full accent-[#2563EB] cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-[13px]">
                      <span>Kích thước</span>
                      <span className="font-bold">{watermarkSize}px</span>
                    </div>
                    <div className="relative h-6 flex items-center">
                      <input 
                        type="range" min="50" max="800" step="1" 
                        value={watermarkSize} onChange={(e) => setWatermarkSize(Number(e.target.value))}
                        className="w-full h-1 bg-[#E2E8F0] appearance-none rounded-full accent-[#2563EB] cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[13px]">Lặp lại (Mosaic)</span>
                    <button 
                      onClick={() => setWatermarkTile(!watermarkTile)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${watermarkTile ? 'bg-[#2563EB]' : 'bg-slate-300'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${watermarkTile ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Info Card */}
          <div className="p-4 bg-[#F1F5F9] rounded-lg text-[12px] text-[#475569] gap-2 flex flex-col leading-relaxed">
            <div className="flex items-center gap-2 font-bold text-[#2563EB]">
              <ImageIcon size={14} /> Thông tin hệ thống
            </div>
            <p>• Hỗ trợ: JPG, PNG, WebP, GIF (động).</p>
            <p>• Xuất file: PNG HD (Tĩnh) hoặc GIF (Động).</p>
            <p>• Lưu ý: Chế độ "Động" sẽ lưu file GIF collage giữ nguyên chuyển động.</p>
          </div>
        </aside>

        {/* Canvas Area */}
        <main className="flex-1 pattern-grid flex flex-col items-center justify-center p-4 md:p-10 relative overflow-auto md:overflow-hidden order-1 md:order-2">
          <AnimatePresence mode="wait">
            {images.length === 0 ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-12 rounded-xl shadow-xl flex flex-col items-center gap-6 text-center max-w-sm"
              >
                <div className="w-20 h-20 bg-[#EFF6FF] rounded-full flex items-center justify-center text-[#2563EB]">
                  <Plus size={40} strokeWidth={3} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800 tracking-tight">Chưa có hình ảnh nào</h2>
                  <p className="text-sm text-slate-500 mt-2">Nhấn "Tải ảnh lên" ở thanh tiêu đề để bắt đầu ghép những tấm ảnh đầu tiên.</p>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="preview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative max-w-full max-h-full flex items-center justify-center"
              >
                {renderPreview()}
                
                {isGenerating || isExporting ? (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-sm">
                    <div className="flex flex-col items-center gap-3">
                       <RefreshCw className="animate-spin text-[#2563EB]" size={24} />
                       <div className="flex flex-col items-center">
                         <span className="text-[11px] font-bold text-[#2563EB] uppercase tracking-widest">
                           {isGenerating ? 'Đang chuẩn bị file...' : `Đang tạo GIF (${exportProgress}%)`}
                         </span>
                         {isExporting && (
                           <div className="mt-2 w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
                             <div 
                               className="h-full bg-[#2563EB] transition-all duration-300" 
                               style={{ width: `${exportProgress}%` }}
                             />
                           </div>
                         )}
                       </div>
                    </div>
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>

          {images.length > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[rgba(0,0,0,0.7)] text-white px-4 py-1.5 rounded-full text-[11px] font-medium backdrop-blur-sm flex items-center gap-3">
               <span>{images.length} ảnh</span>
               <div className="w-px h-3 bg-white/20" />
               <span>Lưới {columns} cột</span>
               <div className="w-px h-3 bg-white/20" />
               <span className="uppercase">{aspectRatio === 'custom' ? `${customRatio.width}:${customRatio.height}` : aspectRatio}</span>
            </div>
          )}
        </main>
      </>
    ) : (
      <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">AI Background Remover</h2>
            <p className="text-slate-500 font-medium">Tách nền tự động bằng trí tuệ nhân tạo chỉ trong vài giây.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div 
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50/10'); }}
              onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50/10'); }}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50/10'); if (e.dataTransfer.files) handleFileChange({ target: { files: e.dataTransfer.files } } as any); }}
              onClick={() => fileInputRef.current?.click()}
              className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center justify-center gap-6 cursor-pointer hover:border-blue-400 hover:bg-slate-50/50 transition-all group shadow-sm h-full"
            >
              <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 transition-transform group-hover:scale-110">
                <CloudUpload size={32} />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-slate-700">Tải ảnh lên</p>
                <p className="text-sm text-slate-400">hoặc kéo thả ảnh vào đây</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <List size={16} /> Danh sách xử lý ({images.length})
              </h3>
              <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden min-h-[400px] shadow-sm">
                {images.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 italic flex flex-col items-center justify-center h-full gap-2 opacity-60">
                    <ImageIcon size={40} className="mb-2" />
                    Chưa có ảnh nào được tải lên.
                  </div>
                ) : (
                  images.map((img, idx) => (
                    <div key={img.id} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-100 relative">
                        <img src={img.url} className="w-full h-full object-cover" />
                        {removingIds.has(img.id) && (
                          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                            <RefreshCw size={14} className="animate-spin text-blue-600" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-slate-700 text-sm truncate">Image_{img.id.slice(0,6)}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {removingIds.has(img.id) ? (
                            <span className="text-[10px] bg-blue-100 text-blue-700 font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                              Đang tách...
                            </span>
                          ) : (
                            <>
                              <button 
                                onClick={() => removeBackground(idx)}
                                className="text-[10px] bg-blue-600 text-white font-black px-3 py-1 rounded-full uppercase hover:bg-blue-700 transition-all shadow-sm"
                              >
                                {img.url !== img.originalUrl ? 'Tách lại' : 'Tách nền ngay'}
                              </button>
                              {img.url !== img.originalUrl && (
                                <button 
                                  onClick={() => setSelectedCompareId(img.id)}
                                  className="text-[10px] bg-slate-100 text-slate-600 font-black px-3 py-1 rounded-full uppercase hover:bg-slate-200 transition-all"
                                >
                                  So sánh
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <a 
                          href={img.url} 
                          download={`zabao-removed-${img.id}.png`}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Download size={18} />
                        </a>
                        <button 
                          onClick={() => removeImage(img.id)}
                          className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
</div>

<footer className="hidden md:flex h-8 bg-[#F8FAFC] border-t border-[#E2E8F0] shrink-0 items-center px-4 text-[11px] text-[#64748B] gap-6">
  <div className="flex items-center gap-1.5"><ImageIcon size={12} /> Tổng cộng: {images.length} tập tin</div>
  <div className="w-px h-3 bg-[#E2E8F0]" />
  <div>Độ phân giải: 1600px (Chất lượng 2K)</div>
  <div className="w-px h-3 bg-[#E2E8F0]" />
  <div className="flex items-center gap-1">Trạng thái: <span className="font-bold text-[#2563EB]">Sẵn sàng</span></div>
  <div className="ml-auto text-[10px] italic">Design by Zabao Studio</div>
</footer>

      <canvas ref={canvasRef} className="hidden" />
      
      {/* Comparison Modal */}
      <AnimatePresence>
        {showWelcomeModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center gap-6"
            >
              <div className="w-24 h-24 rounded-2xl p-2 bg-white border border-slate-100 shadow-lg overflow-hidden">
                <img 
                  src="https://sf-static.upanhlaylink.com/img/image_20260517cbd30b511e68f92bbc97e88f547972de.jpg" 
                  alt="App Logo" 
                  className="w-full h-full object-contain"
                />
              </div>
              
              <div className="space-y-3">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Chào mừng bạn đến với Zabao Studio!</h2>
                <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 text-rose-600 text-sm font-medium leading-relaxed">
                  ⚠️ <span className="font-bold underline">Thông báo:</span> Hiện tại tính năng <b>Lưu ảnh GIF</b> đang gặp một số lỗi kỹ thuật dẫn đến việc không thể lưu động như mong muốn. Chúng tôi đang nỗ lực khắc phục, rất mong sự thông cảm từ bạn!
                </div>
                <p className="text-slate-500 text-sm">Bạn vẫn có thể sử dụng tính năng ghép ảnh và tách nền AI một cách bình thường.</p>
              </div>

              <button 
                onClick={() => setShowWelcomeModal(false)}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl shadow-xl shadow-blue-200 transition-all active:scale-95"
              >
                TÔI ĐÃ HIỂU
              </button>
            </motion.div>
          </motion.div>
        )}

        {selectedCompareId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 bg-black/80 backdrop-blur-md"
            onClick={() => setSelectedCompareId(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl overflow-hidden max-w-5xl w-full max-h-full flex flex-col shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">So sánh trước & sau</h3>
                  <p className="text-sm text-slate-500">Sử dụng thanh trượt để so sánh kết quả tách nền</p>
                </div>
                <button 
                  onClick={() => setSelectedCompareId(null)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-1 relative overflow-hidden bg-slate-200 min-h-[400px] flex items-center justify-center p-4">
                {(() => {
                  const img = images.find(i => i.id === selectedCompareId);
                  if (!img) return null;
                  return (
                    <div className="relative group select-none max-w-full max-h-[70vh] aspect-square md:aspect-auto" style={{ aspectRatio: img.aspectRatio }}>
                      {/* Original */}
                      <img 
                        src={img.originalUrl} 
                        className="max-w-full max-h-[70vh] object-contain"
                        alt="Original"
                      />
                      
                      {/* Removed BG (Revealed by clip) */}
                      <div 
                        className="absolute inset-0 overflow-hidden pointer-events-none"
                        id="compare-reveal"
                        style={{ clipPath: `inset(0 0 0 ${ComparisonSliderValue}%)` }}
                      >
                         <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/checkerboard.png')] opacity-10" />
                         <img 
                          src={img.url} 
                          className="max-w-full max-h-[70vh] object-contain h-full w-full"
                          alt="Removed"
                        />
                      </div>

                      {/* Slider Handle */}
                      <div 
                        className="absolute inset-y-0 w-1 bg-white shadow-xl cursor-ew-resize flex items-center justify-center z-10"
                        style={{ left: `${ComparisonSliderValue}%` }}
                        onMouseDown={(e) => {
                           const startX = e.clientX;
                           const startValue = ComparisonSliderValue;
                           const moveHandler = (moveEvent: MouseEvent) => {
                             const delta = ((moveEvent.clientX - startX) / (e.currentTarget.parentElement?.clientWidth || 1)) * 100;
                             setComparisonSliderValue(Math.min(Math.max(startValue + delta, 0), 100));
                           };
                           const upHandler = () => {
                             window.removeEventListener('mousemove', moveHandler);
                             window.removeEventListener('mouseup', upHandler);
                           };
                           window.addEventListener('mousemove', moveHandler);
                           window.addEventListener('mouseup', upHandler);
                        }}
                        onTouchStart={(e) => {
                          const startX = e.touches[0].clientX;
                          const startValue = ComparisonSliderValue;
                          const moveHandler = (moveEvent: TouchEvent) => {
                            const delta = ((moveEvent.touches[0].clientX - startX) / (e.currentTarget.parentElement?.clientWidth || 1)) * 100;
                            setComparisonSliderValue(Math.min(Math.max(startValue + delta, 0), 100));
                          };
                          const upHandler = () => {
                            window.removeEventListener('touchmove', moveHandler);
                            window.removeEventListener('touchend', upHandler);
                          };
                          window.addEventListener('touchmove', moveHandler);
                          window.addEventListener('touchend', upHandler);
                        }}
                      >
                        <div className="w-8 h-8 bg-white rounded-full shadow-lg border-2 border-blue-600 flex items-center justify-center -mx-4">
                          <Maximize size={16} className="text-blue-600 rotate-90" />
                        </div>
                      </div>

                      <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">Trước</div>
                      <div className="absolute top-4 right-4 bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm shadow-lg">Sau</div>
                    </div>
                  );
                })()}
              </div>

              <div className="p-6 bg-slate-50 flex items-center justify-between">
                <button 
                  onClick={() => setSelectedCompareId(null)}
                  className="px-6 py-2.5 font-bold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Đóng
                </button>
                {(() => {
                  const img = images.find(i => i.id === selectedCompareId);
                  return (
                    <a 
                      href={img?.url} 
                      download={`zabao-removed-${img?.id}.png`}
                      className="px-8 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2"
                    >
                      <Download size={18} /> Tải ảnh đã tách
                    </a>
                  )
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 14px;
          width: 14px;
          border-radius: 50%;
          background: #2563EB;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          transition: transform 0.15s ease-in-out;
        }
        input[type='range']::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
      `}</style>
    </div>
  );
}

